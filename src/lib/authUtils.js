// src/lib/authUtils.js
import { supabase } from './supabase';

/**
 * Attempts to obtain a valid Supabase user, automatically refreshing the JWT via
 * the refresh token. Exits instantly if no active Supabase session exists.
 * Retries a configurable number of times with a delay between attempts if network fluctuates.
 *
 * @param {number} maxAttempts - Maximum number of attempts (default 2)
 * @param {number} delayMs - Milliseconds to wait between attempts (default 2000)
 * @returns {Promise<Object|null>} Resolves with the Supabase user object or null.
 */
export const ensureAuth = async (maxAttempts = 2, delayMs = 2000) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null; // Skip network auth request when offline to prevent console fetch errors
  }

  try {
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
    if (!session) {
      // No active Supabase token (offline/local account) - return null immediately
      return null;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (user && !error) return user;
      } catch (userErr) {
        if (attempt === maxAttempts) break;
      }

      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  } catch (err) {
    console.debug('[authUtils] Supabase session check error:', err?.message || err);
  }
  return null;
};
