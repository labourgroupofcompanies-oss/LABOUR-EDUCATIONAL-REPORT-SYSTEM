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
import { ensureAuth } from '../lib/authUtils';

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
    // Use getUser() – it will automatically refresh the JWT via the refresh token (valid for ~1 year).
    let authUser = null;
    try {
      authUser = await ensureAuth();
    } catch (e) {
      const hasCustomSession = !!localStorage.getItem('labour_edu_session');
      if (hasCustomSession) {
        console.warn('[SyncEngine] ⚠️ Auth session fully expired – user must re‑login to restore sync.');
        window.dispatchEvent(new CustomEvent('sync-auth-expired'));
      } else {
        console.log('[SyncEngine] Not logged in – skipping drain.');
      }
      _isSyncing = false;
      return;
    }
    console.log('[SyncEngine] Auth OK – school_id from token:',
      authUser.user_metadata?.school_id ?? '(not in token – will use DB fallback)'
    );

    // Diagnostic: log full outbox state before processing
    const allItems = await db.outbox.toArray();
    const statusSummary = allItems.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
    console.log('[SyncEngine] Outbox state:', statusSummary, '| Total:', allItems.length);

    const pending = await db.outbox
      .where('status').equals('pending')
      .toArray();

    if (pending.length === 0) {
      console.log('[SyncEngine] No pending items — drain complete.');
      _isSyncing = false;
      return;
    }

    console.log(`[SyncEngine] Found ${pending.length} pending item(s):`, pending.map(i => `${i.operation}→${i.table}`));


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

          case 'upsert': {
            const rows = Array.isArray(payload) ? payload : [payload];
            const { error } = await supabase.from(item.table).upsert(rows);
            opError = error;
            break;
          }

          default:
            console.warn(`[SyncEngine] Unknown operation: ${item.operation}`);
            await db.outbox.delete(item.id);
            continue;
        }

        if (opError && (opError.code === '23505' || String(opError.message).toLowerCase().includes('unique constraint') || String(opError.message).toLowerCase().includes('duplicate key'))) {
          console.log(`[SyncEngine] 🔄 Unique key conflict (23505) detected on ${item.table} for insert operation. Attempting automatic self-healing reconciliation...`);
          
          try {
            if (item.table === 'report_summaries') {
              const { data: existingSummary } = await supabase
                .from('report_summaries')
                .select('id')
                .eq('school_id', payload.school_id)
                .eq('learner_id', payload.learner_id)
                .eq('academic_year', payload.academic_year)
                .eq('term', payload.term)
                .maybeSingle();

              if (existingSummary?.id) {
                console.log(`[SyncEngine] 🔄 Found existing remote summary ID ${existingSummary.id}. Upgrading insert to update.`);
                
                // Update remote row with current payload
                const { error: updErr } = await supabase
                  .from('report_summaries')
                  .update(payload)
                  .eq('id', existingSummary.id);
                  
                if (!updErr) {
                  opError = null; // Mark operation as successful!
                  
                  // Update local Dexie record to bind supabaseId & synced = true
                  const local = await db.reportSummaries
                    .where('schoolId').equals(payload.school_id)
                    .filter(s => s.learnerId === payload.learner_id && s.academicYear === payload.academic_year && s.term === payload.term)
                    .first();
                    
                  if (local) {
                    await db.reportSummaries.update(local.id, { supabaseId: existingSummary.id, synced: true });
                    console.log(`[SyncEngine] ✅ Successfully self-healed local summary ID ${local.id} with supabaseId ${existingSummary.id}`);
                  }
                } else {
                  opError = updErr;
                }
              }
            } else if (item.table === 'report_learners') {
              const targetSchoolId = payload.school_id || (payload.data && payload.data.school_id);
              const targetRegNumber = payload.reg_number || (payload.data && payload.data.reg_number);
              const targetId = payload.id || (payload.filter && payload.filter.id);

              if (targetSchoolId && targetRegNumber) {
                // 1. Query Supabase for the learner currently holding this registration number
                const { data: duplicateLearner } = await supabase
                  .from('report_learners')
                  .select('id, full_name')
                  .eq('school_id', targetSchoolId)
                  .eq('reg_number', targetRegNumber)
                  .maybeSingle();

                if (duplicateLearner) {
                  if (duplicateLearner.id === targetId || item.operation === 'insert') {
                    // Match: Re-save of same student (ID matches or inserting duplicate). Upgrade insert to update.
                    console.log(`[SyncEngine] 🔄 Found existing remote learner ID ${duplicateLearner.id}. Upgrading insert to update.`);
                    
                    const { error: updErr } = await supabase
                      .from('report_learners')
                      .update(item.operation === 'insert' ? payload : payload.data)
                      .eq('id', duplicateLearner.id);
                      
                    if (!updErr) {
                      opError = null; // Mark operation as successful!
                      
                      const local = await db.learners
                        .where('schoolId').equals(targetSchoolId)
                        .filter(l => l.regNumber === targetRegNumber)
                        .first();
                        
                      if (local) {
                        await db.learners.update(local.id, { supabaseId: duplicateLearner.id, synced: true });
                        console.log(`[SyncEngine] ✅ Successfully self-healed local learner ID ${local.id} with supabaseId ${duplicateLearner.id}`);
                      }
                    } else {
                      opError = updErr;
                    }
                  } else {
                    // Conflict: Different student has this registration number. Check if they are a ghost student!
                    console.log(`[SyncEngine] 🔄 Conflicting remote learner "${duplicateLearner.full_name}" (ID: ${duplicateLearner.id}) holding registration number "${targetRegNumber}". Checking local status...`);
                    
                    const existsLocally = await db.learners.where('supabaseId').equals(duplicateLearner.id).first();
                    
                    if (!existsLocally) {
                      // Conflicting student does NOT exist locally in Dexie (Ghost Student). Automatically purge!
                      console.log(`[SyncEngine] 🧹 Conflicting student is not found locally. Automatically purging ghost student from Supabase...`);
                      
                      const { error: purgeErr } = await supabase
                        .from('report_learners')
                        .delete()
                        .eq('id', duplicateLearner.id);
                        
                      if (!purgeErr) {
                        console.log(`[SyncEngine] ✅ Purged ghost student from Supabase. Retrying original update...`);
                        
                        // Retry the original operation
                        if (item.operation === 'insert') {
                          const rows = Array.isArray(payload) ? payload : [payload];
                          const { error: retryErr } = await supabase.from(item.table).insert(rows);
                          opError = retryErr;
                        } else if (item.operation === 'update') {
                          let q = supabase.from(item.table).update(payload.data);
                          if (payload.filter) {
                            Object.entries(payload.filter).forEach(([k, v]) => {
                              q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
                            });
                          }
                          const { error: retryErr } = await q;
                          opError = retryErr;
                        }
                      } else {
                        console.warn(`[SyncEngine] Failed to purge conflicting ghost student:`, purgeErr.message);
                        opError = purgeErr;
                      }
                    } else {
                      console.log(`[SyncEngine] Conflicting student exists locally. This is a legitimate duplicate registration conflict — user must resolve.`);
                    }
                  }
                }
              }
            }
          } catch (reconcileErr) {
            console.error('[SyncEngine] Reconcile error:', reconcileErr);
          }
        }

        if (opError && (opError.code === '23503' || String(opError.message || opError).toLowerCase().includes('foreign key constraint') || String(opError.message || opError).toLowerCase().includes('23503'))) {
          console.log(`[SyncEngine] ⚠️ Foreign key constraint violation (23503) detected on ${item.table}. Attempting automated self-healing...`);
          
          try {
            if (item.table === 'report_scores' && item.operation === 'delete_insert') {
              // For bulk score saves, filter out any rows that violate the learner foreign key
              if (Array.isArray(payload.insertData)) {
                console.log('[SyncEngine] Filtering out score rows referencing non-existent learners...');
                const validRows = [];
                for (const row of payload.insertData) {
                  const lId = row.learner_id;
                  if (lId) {
                    // Check if this student exists on Supabase report_learners
                    const { data } = await supabase
                      .from('report_learners')
                      .select('id')
                      .eq('id', lId)
                      .maybeSingle();
                      
                    if (data?.id) {
                      validRows.push(row);
                    } else {
                      console.log(`[SyncEngine] Dropped score row for deleted/non-existent learner: ${lId}`);
                    }
                  }
                }
                
                if (validRows.length === 0) {
                  // If all rows are invalid, mark the operation as successful (since all reference deleted students)
                  console.log('[SyncEngine] All score rows are invalid. Skipping this outbox item.');
                  opError = null;
                } else {
                  // Re-run the delete_insert with only the valid score rows
                  console.log(`[SyncEngine] Retrying scores sync with ${validRows.length} valid rows...`);
                  let delQ = supabase.from(item.table).delete();
                  Object.entries(payload.deleteFilter).forEach(([k, v]) => {
                    delQ = Array.isArray(v) ? delQ.in(k, v) : delQ.eq(k, v);
                  });
                  await delQ;
                  
                  const { error: retryErr } = await supabase.from(item.table).insert(validRows);
                  opError = retryErr;
                }
              }
            } else if (item.table === 'report_scores' || item.table === 'report_summaries') {
              // For individual scores or summaries, check if the learner exists
              const lId = payload.learner_id || (payload.data && payload.data.learner_id);
              if (lId) {
                const { data } = await supabase
                  .from('report_learners')
                  .select('id')
                  .eq('id', lId)
                  .maybeSingle();
                  
                if (!data?.id) {
                  console.log(`[SyncEngine] Purging outbox item for deleted/non-existent learner: ${lId}`);
                  opError = null; // Mark as successful to discard it from outbox
                }
              }
            }
          } catch (reconcileErr) {
            console.error('[SyncEngine] FK Reconcile error:', reconcileErr);
          }
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

// ─── Force drain: reset ALL non-pending items then drain ─────────────────────
// Use this when you want to force a full sync regardless of current item state.
export const forceDrain = async () => {
  console.log('[SyncEngine] 🔄 Force drain requested — resetting all stuck/failed items...');
  await db.outbox
    .where('status').anyOf(['failed', 'processing'])
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
    drainOutbox();
  });

  // Listen for ALL relevant auth events to automatically trigger outbox drain.
  // IMPORTANT: 'INITIAL_SESSION' fires when the app reloads with an existing session
  // (the user is already logged in). Without this, reloading the app never drains
  // the outbox because no SIGNED_IN event fires for pre-existing sessions.
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (!session) return; // INITIAL_SESSION fires with null when logged out — skip
      console.log(`[SyncEngine] Auth event (${event}) — resetting failed items and draining outbox...`);
      try {
        await db.outbox
          .where('status').equals('failed')
          .modify({ status: 'pending', retryCount: 0, errorMessage: null });
        await db.outbox
          .where('status').equals('processing')
          .modify({ status: 'pending' });
      } catch (err) {
        console.warn('[SyncEngine] Failed to reset outbox items:', err);
      }
      drainOutbox();
    }
  });

  // Periodically retry failed items every 2 minutes while the app is open and online
  setInterval(async () => {
    if (navigator.onLine) {
      const failedCount = await db.outbox.where('status').equals('failed').count();
      const pendingCount = await db.outbox.where('status').equals('pending').count();
      if (failedCount > 0 || pendingCount > 0) {
        console.log(`[SyncEngine] Periodic retry: ${failedCount} failed, ${pendingCount} pending item(s)...`);
        await db.outbox
          .where('status').equals('failed')
          .modify({ status: 'pending', retryCount: 0, errorMessage: null });
        drainOutbox();
      }
    }
  }, 2 * 60 * 1000); // every 2 minutes
}
