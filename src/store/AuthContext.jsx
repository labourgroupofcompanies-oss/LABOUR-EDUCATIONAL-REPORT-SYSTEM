import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import authService from '../services/authService';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const currentUser = await authService.getCurrentUser();

        if (currentUser && navigator.onLine) {
          // Verify the Supabase session is still alive when online.
          // If it is missing (e.g. user logged in while offline, token expired, or
          // storage was cleared), the sync engine cannot make authenticated API calls.
          // In this case we force a logout so the user can re-authenticate and get a
          // fresh Supabase JWT — without this, all syncs silently fail.
          const { data: { session: supabaseSession } } = await supabase.auth.getSession();
          if (!supabaseSession) {
            console.warn('[AuthContext] Supabase session missing for logged-in user. Forcing re-login to restore sync.');
            authService.clearSession();
            setUser(null);
            setLoading(false);
            return;
          }
        }

        setUser(currentUser);

        // If the user is logged in but has no schoolId (e.g. after cleared storage
        // where we fell back to auth metadata), try to heal the profile from Supabase.
        if (currentUser && !currentUser.schoolId && navigator.onLine) {
          healProfileFromSupabase(currentUser, setUser);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
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

  if (!user) return <Navigate to="/login" />;

  if (role && user.role !== role) return <Navigate to="/" />;

  return children;
};

