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
                if (!authUser) {
                  console.warn('[AuthContext] Async session check failed – logging out.');
                  authService.clearSession();
                  setUser(null);
                } else if (!currentUser.schoolId) {
                  healProfileFromSupabase(currentUser, setUser);
                }
              } catch (authErr) {
                console.warn('[AuthContext] Supabase auth check failed in background:', authErr.message);
                // Force logout ONLY if the token is explicitly invalid or expired
                const errMsg = authErr.message?.toLowerCase() || '';
                if (errMsg.includes('expired') || errMsg.includes('invalid') || errMsg.includes('jwt')) {
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
    if (!profile.schoolId && navigator.onLine) {
      healProfileFromSupabase(profile, setUser);
    }
  };

  const logout = async () => {
    authService.clearSession();
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── Post-Login Profile Heal ──────────────────────────────────────────────────
// If we logged in via auth-metadata fallback (e.g. cleared storage), the profile
// may have schoolId = null. This function re-fetches the full profile from Supabase
// after the JWT session is established and updates the user state.
async function healProfileFromSupabase(currentProfile, setUser) {
  try {
    console.log('[AuthContext] Healing profile from Supabase (schoolId missing)...');
    const { data: profile, error } = await supabase
      .from('report_profiles')
      .select('*')
      .eq('id', currentProfile.id)
      .maybeSingle();

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
    console.warn('[AuthContext] Profile heal failed (will retry on next login):', err.message);
  }
}

export const useAuth = () => useContext(AuthContext);

export const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>; // Could be a splash screen

  if (!user) {
    // Bypass redirecting to login if we are processing a Supabase recovery or oauth hash callback
    const hash = window.location.hash || '';
    if (hash.includes('access_token=') || hash.includes('error_description=') || hash.includes('type=recovery')) {
      return (
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '1rem', color: '#0d9488' }}></i>
            <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Processing secure link...</div>
          </div>
        </div>
      );
    }
    return <Navigate to="/login" />;
  }

  if (role && user.role !== role) return <Navigate to="/" />;

  return children;
};

