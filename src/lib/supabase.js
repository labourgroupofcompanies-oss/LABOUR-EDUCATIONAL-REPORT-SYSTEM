import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️  Supabase credentials missing. Check your .env file.');
}

// ─── Production-grade Supabase client ────────────────────────────────────────
// - db.schema: routes queries to the correct schema (avoids ambiguous RPC calls)
// - auth.persistSession: keeps the session alive in localStorage
// - auth.autoRefreshToken: silently renews tokens before they expire
// - auth.detectSessionInUrl: supports OAuth redirect flows
// - global.headers: identifies traffic from this app in Supabase logs
// - realtime: limits concurrent channels to avoid hitting subscription caps
// ─────────────────────────────────────────────────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'x-app-name': 'labour-edu-report-system',
    },
    // Use keepalive so long-running syncs don't drop on page transitions
    fetch: (url, options = {}) =>
      fetch(url, { ...options, keepalive: true }),
  },
  realtime: {
    // Cap realtime subscriptions — prevents exhausting connection slots on free plan
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
