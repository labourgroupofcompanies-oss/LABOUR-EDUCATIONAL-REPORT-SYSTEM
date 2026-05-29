import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

// ─── Auth Service ────────────────────────────────────────────────────────────
export const authService = {
  async login(email, password) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.includes('your-project')) {
      throw new Error('Supabase is not configured. Please check your .env file.');
    }

    // ── Step 1: Authenticate with Supabase (always remote) ──────────────────
    // This is separated from profile fetch so we never show "invalid credentials"
    // when the actual problem is a profile lookup failure (e.g. cleared storage).
    let authData = null;
    let authError = null;

    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      authData = result.data;
      authError = result.error;
    } catch (networkErr) {
      // Network completely unreachable — fall through to offline cache
      authError = networkErr;
    }

    // ── Step 2: If auth succeeded, fetch the profile from Supabase ──────────
    if (authData?.user && !authError) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('report_profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profile && !profileError) {
          // Happy path: map Supabase snake_case → camelCase and cache locally
          const profileToSave = {
            id: profile.id,
            email: profile.email,
            fullName: profile.full_name,
            role: profile.role,
            schoolId: profile.school_id,
            staffId: profile.staff_id,
            lastLogin: new Date().toISOString()
          };
          await db.profiles.put(profileToSave);
          return { profile: profileToSave };
        }

        // Profile query failed (likely RLS / cleared JWT metadata).
        // Auth credentials are VALID — build a fallback profile from auth metadata.
        console.warn('[Auth] Profile query failed, falling back to auth metadata:', profileError?.message);
        const meta = authData.user.user_metadata || {};
        const appMeta = authData.user.app_metadata || {};

        const fallbackProfile = {
          id: authData.user.id,
          email: authData.user.email,
          fullName: meta.full_name || meta.fullName || appMeta.full_name || email,
          role: meta.role || appMeta.role || 'super_admin',
          schoolId: meta.school_id || appMeta.school_id || null,
          staffId: meta.staff_id || appMeta.staff_id || null,
          lastLogin: new Date().toISOString()
        };

        // Cache the fallback so subsequent loads work offline
        await db.profiles.put(fallbackProfile);
        return { profile: fallbackProfile };

      } catch (profileFetchErr) {
        // Profile fetch threw (e.g. network dropped after auth).
        // Auth succeeded — still return a minimal profile from metadata.
        console.warn('[Auth] Profile fetch threw, using metadata fallback:', profileFetchErr.message);
        const meta = authData.user.user_metadata || {};
        const appMeta = authData.user.app_metadata || {};

        const fallbackProfile = {
          id: authData.user.id,
          email: authData.user.email,
          fullName: meta.full_name || meta.fullName || appMeta.full_name || email,
          role: meta.role || appMeta.role || 'super_admin',
          schoolId: meta.school_id || appMeta.school_id || null,
          staffId: meta.staff_id || appMeta.staff_id || null,
          lastLogin: new Date().toISOString()
        };

        await db.profiles.put(fallbackProfile);
        return { profile: fallbackProfile };
      }
    }

    // ── Step 3: Offline / auth-failed fallback — try local Dexie cache ──────
    // Only reached if auth itself failed (wrong password, network down, etc.)
    const cached = await db.profiles.where('email').equals(email).first();
    if (cached) return { profile: cached, isOffline: true };

    // Nothing worked — only NOW do we say "invalid credentials"
    throw new Error(
      authError?.message?.includes('Invalid login credentials')
        ? 'Incorrect email or password. Please try again.'
        : (authError?.message || 'Login failed. Please check your internet connection and try again.')
    );
  },


  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (_) { /* ignore if supabase not configured */ }
    localStorage.removeItem('labour_edu_session');
  },

  async getCurrentUser() {
    const session = JSON.parse(localStorage.getItem('labour_edu_session') || 'null');
    if (!session) return null;
    return await db.profiles.get(session.id);
  },

  saveSession(profile) {
    localStorage.setItem('labour_edu_session', JSON.stringify({ id: profile.id }));
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
            
            const mapped = {
              schoolId: rl.school_id,
              regNumber: rl.reg_number,
              fullName: rl.full_name,
              gender: rl.gender,
              currentClassId: rl.class_id,
              photoUrl: rl.photo_url,
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

// ─── Native Web Crypto SHA-256 Hashing ─────────────────────────────────────────
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default authService;

