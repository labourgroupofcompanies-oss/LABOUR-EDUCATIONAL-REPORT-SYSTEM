import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import authService from '../services/authService';
import { supabase } from '../lib/supabase';
import { ensureAuth } from '../lib/authUtils';
import { db } from '../lib/db';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const currentUser = await authService.getCurrentUser();

        if (currentUser) {
          // Instantly authorize using local cache for zero-latency loading
          setUser(currentUser);
          setLoading(false);

          // Verify Supabase session asynchronously in the background (non-blocking)
          if (navigator.onLine) {
            (async () => {
              try {
                const authUser = await ensureAuth();
                if (authUser && !currentUser.schoolId && currentUser.role !== 'super_admin' && currentUser.role !== 'developer' && currentUser.id !== 'super-admin-platform-developer') {
                  healProfileFromSupabase(currentUser, setUser);
                }
              } catch (authErr) {
                console.warn('[AuthContext] Supabase auth check failed in background:', authErr.message);
                // Force logout ONLY if the token is explicitly invalid or expired
                const errMsg = authErr.message?.toLowerCase() || '';
                if (errMsg.includes('jwt expired') || errMsg.includes('token_expired')) {
                  authService.clearSession();
                  setUser(null);
                }
              }
            })();
          }
        } else {
          // No active local session - proceed to login instantly
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email, password) => {
    const { profile } = await authService.login(email, password);
    authService.saveSession(profile);
    setUser(profile);

    // Post-login self-heal: if schoolId is missing from the profile, re-fetch
    // from Supabase now that the session token is fresh and JWT is populated.
    if (!profile.schoolId && profile.role !== 'super_admin' && profile.role !== 'developer' && profile.id !== 'super-admin-platform-developer' && navigator.onLine) {
      healProfileFromSupabase(profile, setUser);
    }
  };

  const logout = async () => {
    authService.clearSession();
    await authService.logout();
    setUser(null);
  };

  const updateProfile = (updatedFields) => {
    setUser(prev => prev ? { ...prev, ...updatedFields } : null);
  };

  const startImpersonation = (targetSchoolId, targetSchoolName, targetRole = 'headteacher', extraMeta = {}) => {
    if (!user) return;
    const backupSession = localStorage.getItem('labour_edu_admin_backup_session');
    if (!backupSession) {
      localStorage.setItem('labour_edu_admin_backup_session', JSON.stringify(user));
    }
    const impersonatedUser = {
      ...user,
      schoolId: String(targetSchoolId),
      schoolName: targetSchoolName || 'School',
      role: targetRole,
      isImpersonating: true,
      originalAdminName: user.fullName || 'Super Admin',
      ...extraMeta
    };
    authService.saveSession(impersonatedUser);
    setUser(impersonatedUser);
  };

  const stopImpersonation = () => {
    const backup = localStorage.getItem('labour_edu_admin_backup_session');
    if (backup) {
      try {
        const originalUser = JSON.parse(backup);
        authService.saveSession(originalUser);
        setUser(originalUser);
      } catch (err) {
        console.error('Error restoring session:', err);
      } finally {
        localStorage.removeItem('labour_edu_admin_backup_session');
      }
    } else if (user) {
      const restored = { ...user, isImpersonating: false };
      delete restored.schoolId;
      authService.saveSession(restored);
      setUser(restored);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateProfile, startImpersonation, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── Post-Login Profile Heal ──────────────────────────────────────────────────
// If we logged in via auth-metadata fallback (e.g. cleared storage), the profile
// may have schoolId = null. This function re-fetches the full profile from Supabase
// after the JWT session is established and updates the user state.
async function healProfileFromSupabase(currentProfile, setUser) {
  if (!currentProfile || currentProfile.role === 'super_admin' || currentProfile.role === 'developer' || currentProfile.id === 'super-admin-platform-developer') {
    return;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  try {
    console.log('[AuthContext] Healing profile from Supabase (schoolId missing)...');
    let q = supabase.from('report_profiles').select('*');

    if (currentProfile.id && uuidRegex.test(String(currentProfile.id).trim())) {
      q = q.eq('id', String(currentProfile.id).trim());
    } else if (currentProfile.email) {
      q = q.eq('email', String(currentProfile.email).trim().toLowerCase());
    } else {
      return;
    }

    const { data: profile, error } = await q.maybeSingle();

    if (profile && !error) {
      const healed = {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        schoolId: profile.school_id,
        staffId: profile.staff_id,
        lastLogin: new Date().toISOString()
      };
      await db.profiles.put(healed);
      setUser(healed);
      console.log('[AuthContext] Profile healed successfully. schoolId:', healed.schoolId);
    }
  } catch (err) {
    console.warn('[AuthContext] Profile heal notice:', err.message);
  }
}

import LogoPreloader from '../components/common/LogoPreloader';

export const useAuth = () => useContext(AuthContext);

export const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  if (loading) return <LogoPreloader />;


  if (!user) {
    // Bypass redirecting to login if we are processing a Supabase recovery or oauth hash callback
    const hash = window.location.hash || '';
    if (hash.includes('access_token=') || hash.includes('error_description=') || hash.includes('type=recovery')) {
      return <LogoPreloader fullScreen={true} size="lg" />;
    }
    return <Navigate to="/login" />;
  }

  if (role) {
    const isHeadteacherRole = ['super_admin', 'headteacher', 'head_teacher', 'admin', 'school_admin'].includes(user.role);
    if (role === 'super_admin' && !isHeadteacherRole) {
      return <Navigate to="/" />;
    } else if (role !== 'super_admin' && user.role !== role) {
      return <Navigate to="/" />;
    }
  }

  return children;
};

