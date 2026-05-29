// src/lib/authUtils.js
import { supabase } from './supabase';

/**
 * Attempts to obtain a valid Supabase user, automatically refreshing the JWT via
 * the refresh token. Retries a configurable number of times with a delay between
 * attempts. Throws an error if the session cannot be recovered.
 *
 * @param {number} maxAttempts - Maximum number of attempts (default 3)
 * @param {number} delayMs - Milliseconds to wait between attempts (default 5000)
 * @returns {Promise<Object>} Resolves with the Supabase user object.
 */
export const ensureAuth = async (maxAttempts = 3, delayMs = 5000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user && !error) return user;
    if (attempt < maxAttempts) {
      console.warn(`[authUtils] Auth attempt ${attempt} failed – retrying in ${delayMs / 1000}s`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Auth session fully expired');
};
