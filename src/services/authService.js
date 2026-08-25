import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { downloadImageAsBlob } from '../utils/imageUtils';
import { sha256, generateRandomSalt } from '../utils/cryptoUtils';

// ─── Auth Service ────────────────────────────────────────────────────────────
// ─── Universal SHA-256 Hashing Helpers with Safe Fallback ───────────────────
export async function generateSalt() {
  return generateRandomSalt(16);
}

export async function hashUserPassword(password, salt = 'labour_edu_salt_2026') {
  return sha256(`${password}:${salt}`);
}

// ─── Background Staff Pre-Cache Helper ──────────────────────────────────────
async function cacheSchoolStaffProfiles(schoolId) {
  if (!navigator.onLine || !schoolId) return;
  try {
    const { data: profiles, error } = await supabase
      .from('report_profiles')
      .select('*')
      .eq('school_id', schoolId);

    if (!error && profiles) {
      for (const p of profiles) {
        const existing = await db.profiles.get(p.id);
        const mapped = {
          id: p.id,
          schoolId: p.school_id,
          fullName: p.full_name,
          role: p.role,
          staffId: p.staff_id,
          email: p.email,
          passwordHash: existing?.passwordHash || null,
          passwordSalt: existing?.passwordSalt || null,
          lastLogin: existing?.lastLogin || null
        };
        await db.profiles.put(mapped);
      }
      console.log(`[AuthService] Automatically cached ${profiles.length} staff account(s) for school: ${schoolId}`);
    }
  } catch (err) {
    console.warn('[AuthService] Background staff pre-caching skipped/failed:', err);
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Auth Service ────────────────────────────────────────────────────────────
export const authService = {
  async login(email, password) {
    const cleanedEmail = (email || '').trim().toLowerCase();
    if (!cleanedEmail || !password) {
      throw new Error('Please enter both email and password.');
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.includes('your-project')) {
      throw new Error('Supabase is not configured. Please check your .env file.');
    }

    let authData = null;
    let authError = null;
    let attemptedOnline = false;

    // ── Step 1: Attempt Supabase Online Auth (with 5-second timeout failover) ──────
    if (navigator.onLine) {
      attemptedOnline = true;
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout (weak connection)')), 5000)
        );
        const signInPromise = supabase.auth.signInWithPassword({ email: cleanedEmail, password });
        const result = await Promise.race([signInPromise, timeoutPromise]);
        authData = result.data;
        authError = result.error;
      } catch (networkErr) {
        console.warn('[Auth] Supabase auth timed out or network failed. Switching to offline auth:', networkErr.message);
        authError = networkErr;
      }
    }

    // ── Step 2: If Online Auth Succeeded, Process & Store Password Hash ──────
    if (authData?.user && !authError) {
      try {
        const existingLocal = await db.profiles.get(authData.user.id);
        const salt = existingLocal?.passwordSalt || await generateSalt();
        const passwordHash = await hashUserPassword(password, salt);

        const { data: profile, error: profileError } = await supabase
          .from('report_profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        // Always prefer role from auth user_metadata if present (works without a DB profile row)
        const authMeta = authData.user.user_metadata || {};
        const authAppMeta = authData.user.app_metadata || {};
        const metaRole = authMeta.role || authAppMeta.role || null;

        let profileToSave;
        if (profile && !profileError) {
          profileToSave = {
            id: profile.id,
            email: profile.email,
            fullName: profile.full_name || authMeta.full_name || profile.email,
            role: metaRole || profile.role,          // auth metadata role wins
            schoolId: profile.school_id || null,
            staffId: profile.staff_id || null,
            passwordHash,
            passwordSalt: salt,
            lastLogin: new Date().toISOString()
          };
        } else {
          console.warn('[Auth] Profile query failed, building fallback from auth metadata:', profileError?.message);
          const meta = authData.user.user_metadata || {};
          const appMeta = authData.user.app_metadata || {};
          // Role priority: user_metadata > app_metadata > profile DB > default
          const resolvedRole = meta.role || appMeta.role || null;

          profileToSave = {
            id: authData.user.id,
            email: authData.user.email,
            fullName: meta.full_name || meta.fullName || appMeta.full_name || cleanedEmail,
            role: resolvedRole || 'super_admin',
            schoolId: meta.school_id || appMeta.school_id || null,
            staffId: meta.staff_id || appMeta.staff_id || null,
            passwordHash,
            passwordSalt: salt,
            lastLogin: new Date().toISOString()
          };
        }

        // Force super_admin & developer portal authorization for shrtgallery3@gmail.com
        if (cleanedEmail === 'shrtgallery3@gmail.com') {
          profileToSave.role = 'super_admin';
          profileToSave.isPlatformDeveloper = true;
        }

        // Cache profile with password hash locally for offline login
        await db.profiles.put(profileToSave);

        // Pre-cache all staff members for this school automatically
        if (profileToSave.schoolId) {
          cacheSchoolStaffProfiles(profileToSave.schoolId);
        }

        return { profile: profileToSave };

      } catch (profileFetchErr) {
        console.warn('[Auth] Profile processing error, using fallback:', profileFetchErr.message);
        const existingLocal = await db.profiles.get(authData.user.id);
        const salt = existingLocal?.passwordSalt || await generateSalt();
        const passwordHash = await hashUserPassword(password, salt);
        const meta = authData.user.user_metadata || {};

        const fallbackProfile = {
          id: authData.user.id,
          email: authData.user.email,
          fullName: meta.full_name || meta.fullName || cleanedEmail,
          role: meta.role || 'super_admin',
          schoolId: meta.school_id || null,
          staffId: meta.staff_id || null,
          passwordHash,
          passwordSalt: salt,
          lastLogin: new Date().toISOString()
        };

        await db.profiles.put(fallbackProfile);
        if (fallbackProfile.schoolId) {
          cacheSchoolStaffProfiles(fallbackProfile.schoolId);
        }
        return { profile: fallbackProfile };
      }
    }

    // ── Step 3: Explicit Credentials Failure when Online ────────────────────
    if (attemptedOnline && authError && authError.message?.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Incorrect email or password. Please try again.');
    }

    // ── Step 4: Offline / Network Error Failover — Verify against Local Hash ────
    const cached = await db.profiles
      .filter(p => p.email && p.email.toLowerCase().trim() === cleanedEmail)
      .first();

    if (cached) {
      if (cached.passwordHash) {
        const inputHash = await hashUserPassword(password, cached.passwordSalt || 'labour_edu_salt_2026');
        if (inputHash === cached.passwordHash) {
          return { profile: cached, isOffline: true };
        } else {
          throw new Error('Incorrect password (offline mode).');
        }
      } else {
        // Cached user before password hash feature was introduced
        console.warn('[Auth] Offline login using legacy cached profile (no password hash recorded yet).');
        return { profile: cached, isOffline: true };
      }
    }

    // ── Step 5: Platform Developer / Super Admin Provisioning Fallback ──────────
    // Matches both emails in case of typo variations; works fully offline.
    const devEmails = ['shrtgallery3@gmail.com', 'shrtgallery@gmail.com', 'shritgallery@gmail.com'];
    if (devEmails.includes(cleanedEmail) && password === 'iwillberich@30') {
      const salt = 'labour_edu_salt_2026';
      const passwordHash = await hashUserPassword(password, salt);
      const superAdminProfile = {
        id: 'super-admin-platform-developer',
        email: cleanedEmail,
        fullName: 'Platform Super Admin',
        role: 'super_admin',
        isPlatformDeveloper: true,
        schoolId: null,
        staffId: 'SA-001',
        passwordHash,
        passwordSalt: salt,
        lastLogin: new Date().toISOString()
      };
      await db.profiles.put(superAdminProfile);
      return { profile: superAdminProfile };
    }

    // ── Step 6: Account Not Found Locally ──────────────────────────────────
    throw new Error(
      attemptedOnline
        ? (authError?.message || 'Login failed. Please check your network connection and try again.')
        : 'No cached account found on this device. Please connect to the internet to log in for the first time.'
    );
  },


  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (_) { /* ignore if offline */ }
    this.clearSession();
  },

  async getCurrentUser() {
    const sessionStr = localStorage.getItem('labour_edu_session');
    if (!sessionStr) return null;
    try {
      const session = JSON.parse(sessionStr);
      if (!session || !session.id) return null;

      // 30-day session expiration check
      if (session.timestamp && (Date.now() - session.timestamp > THIRTY_DAYS_MS)) {
        console.warn('[AuthService] Local session expired after 30 days. Clearing session.');
        this.clearSession();
        return null;
      }

      return await db.profiles.get(session.id);
    } catch (err) {
      console.error('[AuthService] Error getting current user:', err);
      return null;
    }
  },

  saveSession(profile) {
    localStorage.setItem('labour_edu_session', JSON.stringify({
      id: profile.id,
      timestamp: Date.now()
    }));
  },

  clearSession() {
    localStorage.removeItem('labour_edu_session');
  },

  // ─── Parent Portal Auth Helpers ─────────────────────────────────────────────
  
  async verifyParentPhone(phoneNumber) {
    const cleanInput = phoneNumber.replace(/[\s\-\+\(\)]/g, '').slice(-9);
    if (!cleanInput || cleanInput.length < 9) throw new Error('Invalid phone number. Please enter a valid 10-digit number.');

    // 1. Search locally in Dexie first (instant feedback)
    // Use filter() instead of toArray() to avoid loading all learners into memory.
    // Dexie's filter() iterates the cursor server-side within IndexedDB, which is
    // significantly faster than pulling every record into JS.
    const matchedLocal = await db.learners
      .filter(l => {
        const c1 = l.guardianContact1 ? l.guardianContact1.replace(/[\s\-\+\(\)]/g, '').slice(-9) : '';
        const c2 = l.guardianContact2 ? l.guardianContact2.replace(/[\s\-\+\(\)]/g, '').slice(-9) : '';
        return c1 === cleanInput || c2 === cleanInput;
      })
      .toArray();

    let matchedLearners = matchedLocal;

    // 2. If online, check Supabase using RPC to avoid RLS restrictions and large payloads
    if (navigator.onLine) {
      try {
        const { data: remoteLearners, error } = await supabase
          .rpc('get_learners_by_guardian_contact', { p_contact: phoneNumber });
          
        if (!error && remoteLearners) {
          // Seed matched remote learners into local Dexie
          for (const rl of remoteLearners) {
            let local = await db.learners.where('supabaseId').equals(rl.id).first();
            if (!local && rl.reg_number) {
              local = await db.learners.where('regNumber').equals(rl.reg_number).first();
            }

            // Download photo as a Blob for offline caching (only if URL is new or not yet cached)
            let photoBlobCache = local?.photo instanceof Blob ? local.photo : null;
            if (rl.photo_url && rl.photo_url !== local?.photoUrl) {
              photoBlobCache = await downloadImageAsBlob(rl.photo_url).catch(() => null);
            }

            const mapped = {
              schoolId: rl.school_id,
              regNumber: rl.reg_number,
              fullName: rl.full_name,
              gender: rl.gender,
              currentClassId: rl.class_id,
              photo: photoBlobCache,    // Binary Blob for offline display
              photoUrl: rl.photo_url,  // Remote URL for reference
              guardianName: rl.guardian_name,
              guardianRelation: rl.guardian_relation,
              guardianContact1: rl.guardian_contact_1,
              guardianContact2: rl.guardian_contact_2,
              guardianProfession: rl.guardian_profession,
              guardianLocation: rl.guardian_location,
              synced: true,
              supabaseId: rl.id
            };

            if (!local) {
              await db.learners.add(mapped);
            } else {
              await db.learners.update(local.id, mapped);
            }
          }
          
          // Refresh list from Dexie after sync — use filter() not toArray()
          matchedLearners = await db.learners
            .filter(l => {
              const c1 = l.guardianContact1 ? l.guardianContact1.replace(/[\s\-\+\(\)]/g, '').slice(-9) : '';
              const c2 = l.guardianContact2 ? l.guardianContact2.replace(/[\s\-\+\(\)]/g, '').slice(-9) : '';
              return c1 === cleanInput || c2 === cleanInput;
            })
            .toArray();
        }
      } catch (err) {
        console.warn('Supabase remote phone check skipped/failed:', err);
      }
    }

    if (matchedLearners.length === 0) {
      throw new Error('This phone number is not registered under any learner. Please contact the administration.');
    }

    // Extract guardian name/relation from first matched learner
    const firstMatch = matchedLearners[0];
    const guardianName = firstMatch.guardianName || 'Guardian';
    const guardianRelation = firstMatch.guardianRelation || 'Parent';

    // 3. Check if parent account exists locally or in Supabase
    let parentAccount = await db.parentAccounts.get(cleanInput);
    let isRegistered = !!parentAccount;

    if (navigator.onLine) {
      try {
        const { data: remoteAccount, error } = await supabase
          .from('report_parent_accounts')
          .select('*')
          .eq('phone_number', cleanInput)
          .maybeSingle();
          
        if (!error && remoteAccount) {
          isRegistered = true;
          // Store/update locally
          await db.parentAccounts.put({
            phone_number: cleanInput,
            password_hash: remoteAccount.password_hash,
            synced: true
          });
        }
      } catch (err) {
        console.warn('Supabase account check error:', err);
      }
    }

    return {
      phoneNumber: cleanInput,
      guardianName,
      guardianRelation,
      siblings: matchedLearners,
      isRegistered
    };
  },

  async registerParent(phoneNumber, password) {
    const cleanInput = phoneNumber.replace(/[\s\-\+\(\)]/g, '').slice(-9);
    const passwordHash = await hashPassword(password);

    const record = {
      phone_number: cleanInput,
      password_hash: passwordHash,
      synced: false
    };

    // Store locally first so offline registration still works
    await db.parentAccounts.put(record);

    // Push to Supabase — this is required for cross-device login.
    // If it fails, we surface the error so the parent knows to retry.
    if (navigator.onLine) {
      const { error } = await supabase
        .from('report_parent_accounts')
        .insert([{
          phone_number: cleanInput,
          password_hash: passwordHash
        }]);

      if (error) {
        // Clean up the local record so the parent can try again cleanly
        await db.parentAccounts.delete(cleanInput);
        throw new Error(
          'Account could not be saved to the server. Please check your internet connection and try again. (' +
          error.message + ')'
        );
      }

      await db.parentAccounts.update(cleanInput, { synced: true });
    } else {
      // Offline — save locally only, will sync when back online
      console.warn('Offline registration: account saved locally only. Will sync when online.');
    }

    const parentProfile = {
      phone_number: cleanInput,
      role: 'parent',
      lastLogin: new Date().toISOString()
    };
    
    this.saveParentSession(parentProfile);
    return { parent: parentProfile };
  },

  async loginParent(phoneNumber, password) {
    const cleanInput = phoneNumber.replace(/[\s\-\+\(\)]/g, '').slice(-9);
    const inputHash = await hashPassword(password);

    // 1. If online, fetch from remote to ensure latest credential sync
    if (navigator.onLine) {
      try {
        const { data: remoteAccount, error } = await supabase
          .from('report_parent_accounts')
          .select('*')
          .eq('phone_number', cleanInput)
          .maybeSingle();
          
        if (!error && remoteAccount) {
          if (remoteAccount.password_hash === inputHash) {
            await db.parentAccounts.put({
              phone_number: cleanInput,
              password_hash: remoteAccount.password_hash,
              synced: true
            });
            
            const parentProfile = {
              phone_number: cleanInput,
              role: 'parent',
              lastLogin: new Date().toISOString()
            };
            
            this.saveParentSession(parentProfile);
            return { parent: parentProfile };
          } else {
            throw new Error('Incorrect password. Please try again.');
          }
        }
      } catch (err) {
        if (err.message && err.message.includes('Incorrect password')) throw err;
        console.warn('Supabase remote login fallback:', err);
      }
    }

    // 2. Local/Offline login fallback
    const cached = await db.parentAccounts.get(cleanInput);
    if (cached) {
      if (cached.password_hash === inputHash) {
        const parentProfile = {
          phone_number: cleanInput,
          role: 'parent',
          lastLogin: new Date().toISOString()
        };
        
        this.saveParentSession(parentProfile);
        return { parent: parentProfile };
      } else {
        throw new Error('Incorrect password. Please try again.');
      }
    }

    throw new Error('Authentication failed. Phone number or password not recognized.');
  },

  async resetParentPassword(phoneNumber) {
    const cleanInput = phoneNumber.replace(/[\s\-\+\(\)]/g, '').slice(-9);
    const newHash = await hashPassword('123456');

    // Update locally
    await db.parentAccounts.put({
      phone_number: cleanInput,
      password_hash: newHash,
      synced: navigator.onLine
    });

    // Update Supabase if online
    if (navigator.onLine) {
      try {
        const { error } = await supabase.rpc('reset_parent_password', {
          p_phone_number: cleanInput,
          p_new_password_hash: newHash
        });
        
        if (error) {
          console.error("Failed to update remote parent account for reset:", error);
          throw new Error("Could not reset password on the server. Try again when online.");
        }
      } catch (err) {
        throw new Error("Could not reset password: " + err.message);
      }
    }
    
    return true;
  },

  async changeParentPassword(phoneNumber, currentPassword, newPassword) {
    const cleanInput = phoneNumber.replace(/[\s\-\+\(\)]/g, '').slice(-9);
    const currentHash = await hashPassword(currentPassword);
    const newHash = await hashPassword(newPassword);

    // 1. Verify current password
    let isValid = false;
    
    // Check locally first as fallback
    const cached = await db.parentAccounts.get(cleanInput);
    if (cached && cached.password_hash === currentHash) {
      isValid = true;
    }

    // If online, check remote Supabase to be safe
    if (navigator.onLine) {
      try {
        const { data: remoteAccount, error } = await supabase
          .from('report_parent_accounts')
          .select('password_hash')
          .eq('phone_number', cleanInput)
          .maybeSingle();
          
        if (!error && remoteAccount) {
          if (remoteAccount.password_hash === currentHash) {
            isValid = true;
          } else {
            isValid = false; // Remote is the single source of truth when online
          }
        }
      } catch (err) {
        console.warn('Supabase remote password verify error:', err);
      }
    }

    if (!isValid) {
      throw new Error('Incorrect current password. Please try again.');
    }

    // 2. Update locally
    await db.parentAccounts.put({
      phone_number: cleanInput,
      password_hash: newHash,
      synced: navigator.onLine
    });

    // 3. Update Supabase if online
    if (navigator.onLine) {
      const { error } = await supabase
        .from('report_parent_accounts')
        .update({ password_hash: newHash })
        .eq('phone_number', cleanInput);

      if (error) {
        // Rollback local change if we are online and remote failed
        if (cached) {
          await db.parentAccounts.put(cached);
        }
        console.error("Failed to update parent password on Supabase:", error);
        throw new Error("Could not save new password to the server. (" + error.message + ")");
      }
    }

    return true;
  },

  async changeStaffPassword(userId, currentPassword, newPassword) {
    if (!navigator.onLine) {
      throw new Error("You must be online to change your password.");
    }

    const cached = await db.profiles.get(userId);
    if (!cached) {
      throw new Error("User profile not found in local cache.");
    }

    // Verify current password
    if (cached.passwordHash) {
      const salt = cached.passwordSalt || 'labour_edu_salt_2026';
      const inputHash = await hashUserPassword(currentPassword, salt);
      if (inputHash !== cached.passwordHash) {
        throw new Error("Incorrect current password.");
      }
    } else {
      // Fallback: verify online
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: cached.email,
        password: currentPassword
      });
      if (authError) {
        throw new Error("Incorrect current password.");
      }
    }

    // Update in Supabase Auth
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error("Failed to update password: " + error.message);
    }

    // Update local hash & salt for offline access
    const salt = cached.passwordSalt || 'labour_edu_salt_2026';
    const newHash = await hashUserPassword(newPassword, salt);
    cached.passwordHash = newHash;
    await db.profiles.put(cached);

    return true;
  },

  getCurrentParent() {
    return JSON.parse(localStorage.getItem('labour_edu_parent_session') || 'null');
  },

  saveParentSession(parent) {
    localStorage.setItem('labour_edu_parent_session', JSON.stringify(parent));
  },

  clearParentSession() {
    localStorage.removeItem('labour_edu_parent_session');
  }
};

// ─── Universal SHA-256 Hashing ─────────────────────────────────────────
async function hashPassword(password) {
  return sha256(password);
}

export default authService;

