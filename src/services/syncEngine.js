/**
 * SyncEngine — Offline Outbox Pattern
 * 
 * Provides a structured queue (Dexie outbox table) that stores cloud mutations
 * made while offline. When connectivity is restored, the engine drains the
 * queue sequentially, retrying failed items up to 5 times.
 *
 * Supported operations:
 *   - 'insert'        : supabase.from(table).insert(payload)
 *   - 'update'        : supabase.from(table).update(data).eq/in filters
 *   - 'delete'        : supabase.from(table).delete().eq/in filters
 *   - 'delete_insert' : delete matching rows then bulk insert (used for scores)
 */

import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

const MAX_RETRIES = 5;
let _isSyncing = false;

// ─── Public Getters ───────────────────────────────────────────────────────────

export const getIsSyncing = () => _isSyncing;

// ─── Enqueue a cloud mutation ─────────────────────────────────────────────────
/**
 * Adds a mutation to the local outbox queue.
 * If the device is currently online, draining starts immediately.
 *
 * @param {string} operation  - 'insert' | 'update' | 'delete' | 'delete_insert'
 * @param {string} tableName  - Supabase table name (e.g. 'report_scores')
 * @param {object|Array} payload - Data for the operation. For 'update' and 'delete',
 *                                  use { filter: {}, data: {} }. For 'delete_insert',
 *                                  use { deleteFilter: {}, insertData: [] }.
 * @param {string} [schoolId] - The school ID for scoping (optional but recommended)
 */
export const enqueueSync = async (operation, tableName, payload, schoolId = null) => {
  try {
    await db.outbox.add({
      operation,
      table: tableName,
      payload: JSON.stringify(payload),
      schoolId,
      status: 'pending',
      retryCount: 0,
      errorMessage: null,
      createdAt: new Date().toISOString()
    });

    // Immediately attempt to drain if we are online
    if (navigator.onLine) {
      drainOutbox();
    }
  } catch (err) {
    console.error('[SyncEngine] Failed to enqueue mutation:', err);
  }
};

// ─── Drain the outbox ─────────────────────────────────────────────────────────
/**
 * Processes all pending outbox items sequentially.
 * Safe to call multiple times — locks via _isSyncing flag.
 */
export const drainOutbox = async () => {
  if (_isSyncing || !navigator.onLine) return;

  _isSyncing = true;
  console.log('[SyncEngine] Draining outbox...');

  try {
    // Always refresh the session before processing outbox items.
    // This ensures the JWT token contains the latest user_metadata
    // (including school_id) so RLS policies pass correctly.
    // Without this, stale tokens from before school_id was set will
    // cause 401 / RLS violation errors on every insert.
    const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
    if (sessionError) {
      console.warn('[SyncEngine] Session refresh failed — aborting drain:', sessionError.message);
      _isSyncing = false;
      return;
    }
    if (!sessionData?.session) {
      console.warn('[SyncEngine] No active session — aborting drain (user not logged in).');
      _isSyncing = false;
      return;
    }
    console.log('[SyncEngine] Session refreshed. school_id in token:',
      sessionData.session.user?.user_metadata?.school_id ?? '(not set yet)'
    );

    const pending = await db.outbox
      .where('status').equals('pending')
      .toArray();

    if (pending.length === 0) {
      _isSyncing = false;
      return;
    }

    console.log(`[SyncEngine] Found ${pending.length} pending item(s)`);


    for (const item of pending) {
      // Mark as processing to prevent double-processing
      await db.outbox.update(item.id, { status: 'processing' });

      try {
        const payload = JSON.parse(item.payload);
        let opError = null;

        switch (item.operation) {

          case 'insert': {
            const rows = Array.isArray(payload) ? payload : [payload];
            const { error } = await supabase.from(item.table).insert(rows);
            opError = error;
            break;
          }

          case 'update': {
            // payload = { filter: { col: val }, data: { col: val } }
            let q = supabase.from(item.table).update(payload.data);
            if (payload.filter) {
              Object.entries(payload.filter).forEach(([k, v]) => {
                q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
              });
            }
            const { error } = await q;
            opError = error;
            break;
          }

          case 'delete': {
            // payload = { filter: { col: val | val[] } }
            let q = supabase.from(item.table).delete();
            if (payload.filter) {
              Object.entries(payload.filter).forEach(([k, v]) => {
                q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
              });
            }
            const { error } = await q;
            opError = error;
            break;
          }

          case 'delete_insert': {
            // payload = { deleteFilter: {}, insertData: [] }
            // Used for score saves: delete existing rows then re-insert
            let delQ = supabase.from(item.table).delete();
            Object.entries(payload.deleteFilter).forEach(([k, v]) => {
              delQ = Array.isArray(v) ? delQ.in(k, v) : delQ.eq(k, v);
            });
            await delQ; // intentionally ignore delete errors — rows may not exist

            const { error } = await supabase.from(item.table).insert(payload.insertData);
            opError = error;
            break;
          }

          default:
            console.warn(`[SyncEngine] Unknown operation: ${item.operation}`);
            await db.outbox.delete(item.id);
            continue;
        }

        if (opError) {
          throw new Error(opError.message || 'Supabase operation failed');
        }

        // ✅ Success — remove from outbox
        await db.outbox.delete(item.id);
        console.log(`[SyncEngine] ✅ Synced: ${item.operation} → ${item.table}`);

      } catch (err) {
        const retries = (item.retryCount || 0) + 1;
        const newStatus = retries >= MAX_RETRIES ? 'failed' : 'pending';
        await db.outbox.update(item.id, {
          status: newStatus,
          retryCount: retries,
          errorMessage: err.message
        });
        console.warn(`[SyncEngine] ⚠️ Item ${item.id} failed (attempt ${retries}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[SyncEngine] drainOutbox crashed:', err);
  } finally {
    _isSyncing = false;
    console.log('[SyncEngine] Drain complete.');
  }
};

// ─── Retry all failed items ───────────────────────────────────────────────────
export const retryFailed = async () => {
  await db.outbox
    .where('status').equals('failed')
    .modify({ status: 'pending', retryCount: 0, errorMessage: null });
  await drainOutbox();
};

// ─── Promote any 'processing' items stuck from a previous crashed session ────
// If the app was killed mid-sync, items can be stuck as 'processing' forever.
export const resetStuckItems = async () => {
  await db.outbox
    .where('status').equals('processing')
    .modify({ status: 'pending' });
};

// ─── Register the online listener (module-level, fires once) ─────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    console.log('[SyncEngine] Network online — resetting stuck items and draining outbox...');
    await resetStuckItems();
    // Also reset failed items so they get another chance when coming back online
    await db.outbox
      .where('status').equals('failed')
      .modify({ status: 'pending', retryCount: 0, errorMessage: null });
    await drainOutbox();
  });

  // Periodically retry failed items every 2 minutes while the app is open and online
  setInterval(async () => {
    if (navigator.onLine) {
      const failedCount = await db.outbox.where('status').equals('failed').count();
      if (failedCount > 0) {
        console.log(`[SyncEngine] Periodic retry: resetting ${failedCount} failed item(s)...`);
        await db.outbox
          .where('status').equals('failed')
          .modify({ status: 'pending', retryCount: 0, errorMessage: null });
        await drainOutbox();
      }
    }
  }, 2 * 60 * 1000); // every 2 minutes
}
