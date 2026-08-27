/**
 * SyncEngine — Offline Outbox Pattern (v2 — Zero Stuck Items)
 *
 * Key guarantees:
 *  1. Network errors (Failed to fetch / offline) NEVER increment retryCount or
 *     mark items as failed — they simply wait until online.
 *  2. Coming back online immediately resets ALL items (including previously
 *     "failed" ones) to pending and drains the outbox.
 *  3. A 30-second heartbeat replaces the 2-minute interval, giving near-instant
 *     sync recovery.
 *  4. Items are deduplicated at enqueue time: for 'update' and 'delete_insert'
 *     operations on the same table+filter, only the latest payload is kept.
 *  5. Schema / bad-payload errors auto-discard the item — they will never succeed.
 *
 * Supported operations:
 *   - 'insert'        : supabase.from(table).insert(payload)
 *   - 'update'        : supabase.from(table).update(data).eq/in filters
 *   - 'delete'        : supabase.from(table).delete().eq/in filters
 *   - 'delete_insert' : delete matching rows then bulk insert (used for scores)
 *   - 'upsert'        : supabase.from(table).upsert(payload)
 */

import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { ensureAuth } from '../lib/authUtils';

const MAX_RETRIES = 8;     // Only for true server-side errors, not network errors
let _isSyncing = false;
let _drainQueued = false;  // Prevents thundering-herd on reconnect

// ─── Public Getters ───────────────────────────────────────────────────────────

export const getIsSyncing = () => _isSyncing;

// ─── Network error detection ──────────────────────────────────────────────────
/**
 * Returns true if the error is purely a network/connectivity error
 * (not a Supabase/Postgres server error). These should NEVER count as retries.
 */
const isNetworkError = (err) => {
  if (!err) return false;
  const msg = String(err?.message || err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('typeerror: failed') ||
    !navigator.onLine
  );
};

// ─── Deduplication helper ─────────────────────────────────────────────────────
/**
 * For update / delete_insert operations, if an identical pending item already
 * exists for the same table+operation, replace its payload with the newer one
 * instead of adding another item. Prevents queue bloat from repeated saves.
 */
const deduplicateOrEnqueue = async (operation, tableName, payload, schoolId) => {
  if (operation === 'update' || operation === 'delete_insert' || operation === 'delete' || operation === 'upsert') {
    // Build a stable key from operation + table + filter fields
    let filterKey = '';
    try {
      if (operation === 'update' && payload?.filter) {
        filterKey = JSON.stringify(payload.filter);
      } else if (operation === 'delete_insert' && payload?.deleteFilter) {
        filterKey = JSON.stringify(payload.deleteFilter);
      } else if (operation === 'delete' && payload?.filter) {
        filterKey = JSON.stringify(payload.filter);
      } else if (operation === 'upsert' && (tableName === 'report_schools' || tableName === 'report_settings')) {
        filterKey = tableName;
      }
    } catch (_) {}

    if (filterKey) {
      const existing = await db.outbox
        .where('status').anyOf(['pending', 'processing'])
        .filter(item =>
          item.operation === operation &&
          item.table === tableName &&
          (filterKey === tableName || item.payload.includes(filterKey.slice(1, -1).substring(0, 40)))
        )
        .first();

      if (existing) {
        // Replace payload of existing item — no new row needed
        await db.outbox.update(existing.id, {
          payload: JSON.stringify(payload),
          status: 'pending',
          retryCount: 0,
          errorMessage: null,
          nextAttemptAt: null,
        });
        return; // Skip adding new row
      }
    }
  }

  // Default: add new outbox item
  await db.outbox.add({
    operation,
    table: tableName,
    payload: JSON.stringify(payload),
    schoolId,
    status: 'pending',
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    nextAttemptAt: null,
  });
};

// ─── Enqueue a cloud mutation ─────────────────────────────────────────────────
export const enqueueSync = async (operation, tableName, payload, schoolId = null) => {
  try {
    await deduplicateOrEnqueue(operation, tableName, payload, schoolId);

    // Immediately attempt to drain if we are online
    if (navigator.onLine) {
      scheduleDrain();
    }
  } catch (err) {
    console.error('[SyncEngine] Failed to enqueue mutation:', err);
  }
};

// ─── Debounced drain scheduler ────────────────────────────────────────────────
// Prevents multiple simultaneous drains from being triggered in quick succession
let _drainTimer = null;
const scheduleDrain = (immediate = false) => {
  if (_drainQueued) return;
  if (immediate) {
    _drainQueued = true;
    setTimeout(() => {
      _drainQueued = false;
      drainOutbox();
    }, 20);
  } else {
    clearTimeout(_drainTimer);
    _drainTimer = setTimeout(() => {
      drainOutbox();
    }, 100);
  }
};

// ─── Drain the outbox ─────────────────────────────────────────────────────────
export const drainOutbox = async (ignoreOnlineCheck = false) => {
  if (_isSyncing) return;
  if (!ignoreOnlineCheck && !navigator.onLine) return;

  _isSyncing = true;

  try {
    // Get auth
    let authUser = null;
    try {
      authUser = await ensureAuth();
    } catch (e) {
      const hasCustomSession = !!localStorage.getItem('labour_edu_session');
      if (hasCustomSession) {
        console.warn('[SyncEngine] ⚠️ Auth session fully expired — user must re‑login.');
        window.dispatchEvent(new CustomEvent('sync-auth-expired'));
      }
      _isSyncing = false;
      return;
    }

    // Load pending items (skip ones with a future nextAttemptAt)
    const now = new Date().toISOString();
    const pending = (await db.outbox
      .where('status').equals('pending')
      .toArray())
      .filter(item => !item.nextAttemptAt || item.nextAttemptAt <= now);

    if (pending.length === 0) {
      _isSyncing = false;
      return;
    }

    console.log(`[SyncEngine] Syncing ${pending.length} item(s) in high-speed parallel chunks:`, pending.map(i => `${i.operation}→${i.table}`));

    const BATCH_SIZE = 4;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const chunk = pending.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(chunk.map(item => processSingleItem(item)));
    }

  } catch (err) {
    console.error('[SyncEngine] drainOutbox crashed:', err);
  } finally {
    _isSyncing = false;
  }
};

// ─── Execute a single outbox operation ────────────────────────────────────────
async function processSingleItem(item) {
  // Mark as processing
  await db.outbox.update(item.id, { status: 'processing' });

  try {
    const payload = JSON.parse(item.payload);
    let opError = null;

    // ── Execute operation ─────────────────────────────────────────────────
    switch (item.operation) {

      case 'insert': {
        const rows = (Array.isArray(payload) ? payload : [payload]).map(r => {
          if (item.table === 'report_referrals' && (!r.id || r.id === null)) {
            return {
              ...r,
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined
            };
          }
          return r;
        });
        let q = supabase.from(item.table).insert(rows).select();
        let { data, error } = await q;

        // Self-heal: missing UUID id on table with not-null constraint
        if (error && error.message?.includes('null value in column "id"') && item.table === 'report_referrals') {
          const rowsWithIds = rows.map(r => ({
            ...r,
            id: r.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined)
          }));
          const retry = await supabase.from(item.table).insert(rowsWithIds).select();
          data = retry.data;
          error = retry.error;
        }

        // Self-heal: strip unknown columns and retry
        if (error && (error.code === '42703' || error.message?.includes('exclude_from_pdf'))) {
          const stripped = rows.map(r => { const c = { ...r }; delete c.exclude_from_pdf; return c; });
          const retry = await supabase.from(item.table).insert(stripped).select();
          data = retry.data;
          error = retry.error;
        }

        // Self-heal: missing report_referrals table in Supabase
        if (error && item.table === 'report_referrals' && (error.code === '42P01' || error.message?.includes('404') || error.message?.includes('not found') || error.code === 'PGRST204')) {
          console.warn('[SyncEngine] Table report_referrals does not exist in remote Supabase — keeping in local IndexedDB.');
          error = null;
        }

        opError = error;

        if (!error && data) {
          for (const row of data) {
            try {
              await reconcileInsertedRow(item.table, row, payload);
            } catch (bindErr) {
              console.warn(`[SyncEngine] Bind error for ${item.table}:`, bindErr);
            }
          }
        }
        break;
      }

      case 'update': {
        let q = supabase.from(item.table).update(payload.data);
        if (payload.filter) {
          Object.entries(payload.filter).forEach(([k, v]) => {
            q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
          });
        }
        let { error } = await q;

        // Self-heal: strip unknown columns and retry
        if (error && (error.code === '42703' || error.message?.includes('exclude_from_pdf'))) {
          const strippedData = { ...payload.data };
          delete strippedData.exclude_from_pdf;
          let retryQ = supabase.from(item.table).update(strippedData);
          if (payload.filter) {
            Object.entries(payload.filter).forEach(([k, v]) => {
              retryQ = Array.isArray(v) ? retryQ.in(k, v) : retryQ.eq(k, v);
            });
          }
          const retry = await retryQ;
          error = retry.error;
        }

        // Self-heal: missing report_referrals table in Supabase
        if (error && item.table === 'report_referrals' && (error.code === '42P01' || error.message?.includes('404') || error.message?.includes('not found') || error.code === 'PGRST204')) {
          console.warn('[SyncEngine] Table report_referrals does not exist in remote Supabase — keeping in local IndexedDB.');
          error = null;
        }

        opError = error;
        break;
      }

      case 'delete': {
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
        // 1. Delete existing rows matching filter
        let delQ = supabase.from(item.table).delete();
        Object.entries(payload.deleteFilter).forEach(([k, v]) => {
          delQ = Array.isArray(v) ? delQ.in(k, v) : delQ.eq(k, v);
        });
        const { error: delErr } = await delQ;

        if (Array.isArray(payload.insertData) && payload.insertData.length > 0) {
          // Deduplicate in-memory by primary business key
          const seen = new Set();
          const cleanRows = [];
          for (const row of payload.insertData) {
            const key = item.table === 'report_scores'
              ? `${row.school_id}_${row.learner_id}_${row.subject_id}_${row.academic_year}_${row.term}`
              : JSON.stringify(row);
            if (!seen.has(key)) {
              seen.add(key);
              cleanRows.push(row);
            }
          }

          // 2. Pre-delete existing score rows for these learners/subject/term to ensure 100% clean insert
          if (item.table === 'report_scores') {
            const learnerIds = cleanRows.map(r => r.learner_id).filter(Boolean);
            const targetSubjectId = payload.deleteFilter?.subject_id || cleanRows[0]?.subject_id;
            const targetTerm = payload.deleteFilter?.term || cleanRows[0]?.term;
            const targetYear = payload.deleteFilter?.academic_year || cleanRows[0]?.academic_year;
            const targetSchoolId = item.schoolId || payload.deleteFilter?.school_id || cleanRows[0]?.school_id;

            if (learnerIds.length > 0 && targetSubjectId && targetSchoolId) {
              try {
                let lDelQ = supabase.from('report_scores').delete()
                  .eq('school_id', targetSchoolId)
                  .eq('subject_id', targetSubjectId)
                  .in('learner_id', learnerIds);
                if (targetTerm) lDelQ = lDelQ.eq('term', targetTerm);
                if (targetYear) lDelQ = lDelQ.eq('academic_year', targetYear);
                await lDelQ;
              } catch (_) {}
            }
          }

          // 3. Clean insert
          let { error: insErr } = await supabase.from(item.table).insert(cleanRows);

          // 4. If unique constraint or conflict occurs, heal row-by-row
          const isConflict = insErr && (
            insErr.code === '23505' ||
            insErr.status === 409 ||
            String(insErr.code || '') === '409' ||
            String(insErr.message || '').toLowerCase().includes('duplicate') ||
            String(insErr.message || '').toLowerCase().includes('conflict') ||
            String(insErr.message || '').toLowerCase().includes('already exists')
          );

          if (isConflict) {
            console.log(`[SyncEngine] 🔄 Healing conflict on ${item.table} via targeted delete-insert & upsert...`);
            let hasFailures = false;
            for (const r of cleanRows) {
              if (item.table === 'report_scores') {
                try {
                  await supabase.from(item.table).delete()
                    .eq('school_id', r.school_id)
                    .eq('learner_id', r.learner_id)
                    .eq('subject_id', r.subject_id)
                    .eq('academic_year', r.academic_year)
                    .eq('term', r.term);
                } catch (_) {}
              }
              const { error: singleErr } = await supabase.from(item.table).upsert(r);
              if (singleErr) {
                // If upsert failed, try one more plain insert
                const { error: insRetryErr } = await supabase.from(item.table).insert(r);
                if (insRetryErr) hasFailures = true;
              }
            }
            if (!hasFailures) insErr = null;
          }

          opError = insErr;
        } else {
          opError = delErr;
        }
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
        return true;
    }

    // ── Self-heal: Unique key conflicts ──────────────────────────────────
    opError = await healUniqueConflict(opError, item, payload);

    // ── Self-heal: Not-null constraint ───────────────────────────────────
    opError = await healNotNull(opError, item, payload);

    // ── Self-heal: Foreign key constraint ────────────────────────────────
    opError = await healForeignKey(opError, item, payload);

    // ── Auto-discard: Invalid UUID / bad schema column ───────────────────
    if (opError && (
      opError.code === '22P02' ||
      String(opError.message || opError).toLowerCase().includes('invalid input syntax for type uuid')
    )) {
      console.warn(`[SyncEngine] ⚠️ Invalid UUID in ${item.table} — discarding.`);
      opError = null;
    }

    if (opError && (
      opError.code === 'PGRST204' ||
      String(opError.message || opError).toLowerCase().includes('schema cache') ||
      String(opError.message || opError).toLowerCase().includes('could not find the')
    )) {
      console.warn(`[SyncEngine] ⚠️ Schema cache / unknown column in ${item.table} — discarding.`);
      opError = null;
    }

    if (opError) {
      throw opError; // Hand off to catch block
    }

    // ✅ Success — remove from outbox
    await db.outbox.delete(item.id);
    console.log(`[SyncEngine] ✅ ${item.operation} → ${item.table}`);
    return true;

  } catch (err) {
    // ── Network errors: DO NOT count as a retry failure ──────────────────
    if (isNetworkError(err)) {
      console.log(`[SyncEngine] 📶 Offline — item ${item.id} queued for when network returns.`);
      await db.outbox.update(item.id, {
        status: 'pending',
      });
      return false;
    }

    // ── Server/logic error: apply exponential backoff ────────────────────
    const retries = (item.retryCount || 0) + 1;
    const newStatus = retries >= MAX_RETRIES ? 'failed' : 'pending';
    const delayMs = Math.min(Math.pow(2, retries) * 2000, 60 * 1000); // cap at 60s
    const nextAttemptAt = newStatus === 'pending'
      ? new Date(Date.now() + delayMs).toISOString()
      : null;

    await db.outbox.update(item.id, {
      status: newStatus,
      retryCount: retries,
      errorMessage: err?.message || String(err),
      nextAttemptAt,
    });

    if (newStatus === 'failed') {
      console.warn(`[SyncEngine] ❌ Item ${item.id} (${item.operation}→${item.table}) permanently failed after ${retries} attempts:`, err?.message);
    } else {
      console.warn(`[SyncEngine] ⚠️ Item ${item.id} failed (attempt ${retries}/${MAX_RETRIES}), retry in ${delayMs / 1000}s:`, err?.message);
    }
    return false;
  }
};

// ─── Self-healing: reconcile successfully inserted rows with local Dexie ──────
const reconcileInsertedRow = async (table, row, payload) => {
  if (table === 'report_learners') {
    const cleanReg = row.reg_number ? String(row.reg_number).trim().toUpperCase() : '';
    const cleanName = (row.full_name || '').trim().toLowerCase();

    let local = null;
    if (cleanReg) {
      local = await db.learners.filter(l =>
        (String(l.schoolId) === String(row.school_id) || String(l.school_id || '') === String(row.school_id)) &&
        l.regNumber && String(l.regNumber).trim().toUpperCase() === cleanReg
      ).first();
    }
    if (!local && cleanName) {
      local = await db.learners.filter(l =>
        (String(l.schoolId) === String(row.school_id) || String(l.school_id || '') === String(row.school_id)) &&
        l.fullName && l.fullName.trim().toLowerCase() === cleanName
      ).first();
    }
    if (local) {
      await db.learners.update(local.id, { 
        supabaseId: row.id, 
        synced: true,
        status: row.status || local.status || 'Active'
      });
    }

  } else if (table === 'report_payments') {
    const local = await db.payments
      .where('schoolId').equals(row.school_id)
      .filter(p => p.learnerId === row.learner_id && Number(p.amount) === Number(row.amount) && p.reference === row.reference)
      .first();
    if (local) await db.payments.update(local.id, { supabaseId: row.id, synced: true });

  } else if (table === 'report_announcements') {
    const local = await db.announcements
      .where('schoolId').equals(row.school_id)
      .filter(a => a.title === row.title)
      .first();
    if (local) await db.announcements.update(local.id, { supabaseId: row.id, synced: true });

  } else if (table === 'report_teacher_assignments') {
    const locals = await db.teacherAssignments
      .where('schoolId').equals(row.school_id)
      .filter(a => Number(a.teacherId) === Number(row.teacher_id) && Number(a.classId) === Number(row.class_id) && (a.subjectId === row.subject_id || Number(a.subjectId) === Number(row.subject_id)))
      .toArray();
    if (locals.length > 0) {
      await db.teacherAssignments.update(locals[0].id, { supabaseId: row.id, synced: true });
      for (let i = 1; i < locals.length; i++) {
        await db.teacherAssignments.delete(locals[i].id);
      }
    }

  } else if (table === 'report_class_subjects') {
    const locals = await db.classSubjects
      .where('schoolId').equals(row.school_id)
      .filter(cs => Number(cs.classId) === Number(row.class_id) && Number(cs.subjectId) === Number(row.subject_id))
      .toArray();
    if (locals.length > 0) {
      await db.classSubjects.update(locals[0].id, { supabaseId: row.id, synced: true });
      for (let i = 1; i < locals.length; i++) {
        await db.classSubjects.delete(locals[i].id);
      }
    }

  } else if (table === 'report_summaries') {
    const local = await db.reportSummaries
      .where('schoolId').equals(row.school_id)
      .filter(s => s.learnerId === row.learner_id && s.academicYear === row.academic_year && s.term === row.term)
      .first();
    if (local) await db.reportSummaries.update(local.id, { supabaseId: row.id, synced: true });

  } else if (table === 'report_profiles') {
    const local = await db.profiles
      .where('schoolId').equals(row.school_id)
      .filter(p => p.email === row.email)
      .first();
    if (local) await db.profiles.update(local.id, { synced: true });
  }
};

// ─── Self-healing: unique key conflicts (23505 / 409) ─────────────────────────
const healUniqueConflict = async (opError, item, payload) => {
  if (!opError) return opError;
  const isUniqueErr = opError.code === '23505' ||
    opError.status === 409 ||
    String(opError.code || '') === '409' ||
    String(opError.message || '').toLowerCase().includes('unique constraint') ||
    String(opError.message || '').toLowerCase().includes('duplicate key') ||
    String(opError.message || '').toLowerCase().includes('conflict') ||
    String(opError.message || '').toLowerCase().includes('already exists');
  if (!isUniqueErr) return opError;

  console.log(`[SyncEngine] 🔄 Unique conflict on ${item.table} — attempting self-heal...`);

  try {
    if (item.table === 'report_summaries') {
      const { data: existing } = await supabase
        .from('report_summaries').select('id')
        .eq('school_id', payload.school_id).eq('learner_id', payload.learner_id)
        .eq('academic_year', payload.academic_year).eq('term', payload.term)
        .maybeSingle();
      if (existing?.id) {
        const { error: updErr } = await supabase.from('report_summaries').update(payload).eq('id', existing.id);
        if (!updErr) {
          const local = await db.reportSummaries.where('schoolId').equals(payload.school_id)
            .filter(s => s.learnerId === payload.learner_id && s.academicYear === payload.academic_year && s.term === payload.term).first();
          if (local) await db.reportSummaries.update(local.id, { supabaseId: existing.id, synced: true });
          return null;
        }
        return updErr;
      }
    }

    if (item.table === 'report_profiles') {
      if (payload.email) {
        const { data: existing } = await supabase.from('report_profiles').select('id').eq('email', payload.email).maybeSingle();
        if (existing?.id) {
          const { error: updErr } = await supabase.from('report_profiles').update({
            school_id: payload.school_id, full_name: payload.full_name, role: payload.role, staff_id: payload.staff_id
          }).eq('id', existing.id);
          if (!updErr) {
            // Reroute assignments
            const assignments = await db.teacherAssignments.where('teacherId').equals(payload.id).toArray();
            for (const a of assignments) await db.teacherAssignments.update(a.id, { teacherId: existing.id });
            // Rewrite outbox references
            const outboxAll = await db.outbox.toArray();
            for (const o of outboxAll) {
              if (o.payload?.includes(payload.id)) {
                await db.outbox.update(o.id, { payload: o.payload.replaceAll(payload.id, existing.id) });
              }
            }
            await db.profiles.delete(payload.id);
            await db.profiles.put({
              id: existing.id, schoolId: payload.school_id, fullName: payload.full_name,
              role: payload.role, email: payload.email, staffId: payload.staff_id,
              isClaimed: payload.is_claimed || false, createdAt: payload.created_at || new Date().toISOString()
            });
            return null;
          }
          return updErr;
        }
      }
    }

    if (item.table === 'report_learners') {
      const targetSchoolId = payload.school_id;
      const targetRegNumber = payload.reg_number;
      if (targetSchoolId && targetRegNumber) {
        const { data: dup } = await supabase.from('report_learners').select('id, full_name')
          .eq('school_id', targetSchoolId).eq('reg_number', targetRegNumber).maybeSingle();
        if (dup) {
          const { error: updErr } = await supabase.from('report_learners')
            .update(item.operation === 'insert' ? payload : payload.data).eq('id', dup.id);
          if (!updErr) {
            const local = await db.learners.where('schoolId').equals(targetSchoolId)
              .filter(l => l.regNumber === targetRegNumber).first();
            if (local) await db.learners.update(local.id, { supabaseId: dup.id, synced: true });
            return null;
          }
          return updErr;
        }
      }
    }

    if (item.table === 'report_class_subjects') {
      const { school_id, class_id, subject_id } = payload;
      if (school_id && class_id && subject_id) {
        const { data: existing } = await supabase
          .from('report_class_subjects').select('id')
          .eq('school_id', school_id)
          .eq('class_id', class_id)
          .eq('subject_id', subject_id)
          .maybeSingle();
        if (existing?.id) {
          const local = await db.classSubjects.where('schoolId').equals(school_id)
            .filter(cs => cs.classId === class_id && cs.subjectId === subject_id).first();
          if (local) await db.classSubjects.update(local.id, { supabaseId: existing.id, synced: true });
          return null;
        }
      }
    }

    if (item.table === 'report_scores') {
      const rows = Array.isArray(payload.insertData)
        ? payload.insertData
        : (Array.isArray(payload) ? payload : [payload]);
      if (rows && rows.length > 0) {
        for (const r of rows) {
          if (r.school_id && r.learner_id && r.subject_id) {
            try {
              await supabase.from('report_scores').delete()
                .eq('school_id', r.school_id)
                .eq('learner_id', r.learner_id)
                .eq('subject_id', r.subject_id)
                .eq('academic_year', r.academic_year)
                .eq('term', r.term);
              const { error: upErr } = await supabase.from('report_scores').upsert(r);
              if (upErr) {
                await supabase.from('report_scores').insert(r).catch(() => null);
              }
            } catch (_) {}
          }
        }
        return null;
      }
    }
  } catch (e) {
    console.error('[SyncEngine] Unique conflict heal error:', e);
  }
  return opError;
};

// ─── Self-healing: not-null constraint (23502) ────────────────────────────────
const healNotNull = async (opError, item, payload) => {
  if (!opError) return opError;
  const isNotNull = opError.code === '23502' ||
    String(opError.message || opError).toLowerCase().includes('not-null') ||
    String(opError.message || opError).toLowerCase().includes('23502');
  if (!isNotNull) return opError;

  try {
    if (item.table === 'report_schools' && item.operation === 'upsert') {
      const schoolId = payload.id || payload?.filter?.id;
      if (schoolId) {
        const school = await db.schools.get(schoolId);
        const schoolName = school?.name || 'My School';
        const patched = Array.isArray(payload)
          ? payload.map(p => ({ ...p, name: p.name || schoolName }))
          : { ...payload, name: payload.name || schoolName };
        const rows = Array.isArray(patched) ? patched : [patched];
        const { error: retryErr } = await supabase.from(item.table).upsert(rows);
        if (!retryErr) return null;
        return retryErr;
      }
    }
  } catch (e) {
    console.error('[SyncEngine] Not-null heal error:', e);
  }
  return opError;
};

// ─── Self-healing: foreign key constraint (23503) ────────────────────────────
const healForeignKey = async (opError, item, payload) => {
  if (!opError) return opError;
  const isFkErr = opError.code === '23503' ||
    String(opError.message || opError).toLowerCase().includes('foreign key') ||
    String(opError.message || opError).toLowerCase().includes('23503');
  if (!isFkErr) return opError;

  try {
    if (item.table === 'report_scores' && item.operation === 'delete_insert') {
      if (Array.isArray(payload.insertData)) {
        const validRows = [];
        for (const row of payload.insertData) {
          if (row.learner_id) {
            const { data } = await supabase.from('report_learners').select('id').eq('id', row.learner_id).maybeSingle();
            if (data?.id) validRows.push(row);
          }
        }
        if (validRows.length === 0) {
          console.log('[SyncEngine] All score rows invalid — discarding.');
          return null;
        }
        let delQ = supabase.from(item.table).delete();
        Object.entries(payload.deleteFilter).forEach(([k, v]) => {
          delQ = Array.isArray(v) ? delQ.in(k, v) : delQ.eq(k, v);
        });
        await delQ;
        const { error: retryErr } = await supabase.from(item.table).insert(validRows);
        return retryErr || null;
      }
    }

    if ((item.table === 'report_scores' || item.table === 'report_summaries')) {
      const lId = payload.learner_id || payload.data?.learner_id;
      if (lId) {
        const { data } = await supabase.from('report_learners').select('id').eq('id', lId).maybeSingle();
        if (!data?.id) {
          console.log(`[SyncEngine] Discarding item for deleted learner: ${lId}`);
          return null;
        }
      }
    }

    if (item.table === 'report_class_subjects') {
      const subId = payload.subject_id;
      const clsId = payload.class_id;
      if (subId) {
        const { data: subData } = await supabase.from('report_subjects').select('id').eq('id', subId).maybeSingle();
        if (!subData?.id) {
          console.log(`[SyncEngine] ⚠️ Discarding report_class_subjects assignment for non-existent subject ID: ${subId}`);
          return null;
        }
      }
      if (clsId) {
        const { data: clsData } = await supabase.from('report_classes').select('id').eq('id', clsId).maybeSingle();
        if (!clsData?.id) {
          console.log(`[SyncEngine] ⚠️ Discarding report_class_subjects assignment for non-existent class ID: ${clsId}`);
          return null;
        }
      }
    }
  } catch (e) {
    console.error('[SyncEngine] FK heal error:', e);
  }
  return opError;
};

// ─── Retry all failed items ───────────────────────────────────────────────────
export const retryFailed = async () => {
  await db.outbox
    .where('status').equals('failed')
    .modify({ status: 'pending', retryCount: 0, errorMessage: null, nextAttemptAt: null });
  await drainOutbox(true);
};

// ─── Force drain: reset ALL non-pending items then drain ─────────────────────
export const forceDrain = async () => {
  console.log('[SyncEngine] 🔄 Force drain requested...');
  await db.outbox
    .where('status').anyOf(['failed', 'processing'])
    .modify({ status: 'pending', retryCount: 0, errorMessage: null, nextAttemptAt: null });

  try {
    const unsyncedWithCloudId = await db.learners
      .filter(l => l.synced === false && !!l.supabaseId)
      .toArray();
    if (unsyncedWithCloudId.length > 0) {
      for (const l of unsyncedWithCloudId) {
        await db.learners.update(l.id, { synced: true });
      }
    }
  } catch (_) {}

  await drainOutbox(true);
};

// ─── Promote stuck 'processing' items ────────────────────────────────────────
export const resetStuckItems = async () => {
  await db.outbox
    .where('status').equals('processing')
    .modify({ status: 'pending', nextAttemptAt: null });
};

// ─── Clear outbox queue ──────────────────────────────────────────────────────
export const clearOutbox = async () => {
  const count = await db.outbox.count();
  await db.outbox.clear();
  console.log(`[SyncEngine] 🗑️ Cleared ${count} item(s) from outbox sync queue.`);
  return count;
};

// ─── Clear local database ───────────────────────────────────────────────────
export const clearLocalBase = async () => {
  console.log('[Database] 🗑️ Wiping local IndexedDB database...');
  await db.delete();
  console.log('[Database] ✅ Local IndexedDB deleted.');
};

// ─── Global event listeners (module-level) ───────────────────────────────────
if (typeof window !== 'undefined') {
  // Console helper methods
  window.clearOutbox = async () => {
    const count = await db.outbox.count();
    await db.outbox.clear();
    console.log(`[SyncEngine] 🗑️ Outbox sync queue cleared (${count} items removed).`);
    return `Cleared ${count} sync queue item(s).`;
  };

  window.clearLocalBase = async () => {
    console.log('[Database] 🗑️ Wiping local IndexedDB database...');
    await db.delete();
    console.log('[Database] ✅ Local IndexedDB deleted! Reloading page...');
    window.location.reload();
    return 'Local IndexedDB database deleted. Page reloading...';
  };

  // ── Reconnect: reset EVERYTHING and drain immediately ─────────────────────
  window.addEventListener('online', async () => {
    console.log('[SyncEngine] 📶 Network online — resetting all items and syncing...');
    try {
      // Reset stuck, failed, and pending-with-future-delay items all at once
      await db.outbox
        .where('status').anyOf(['failed', 'processing', 'pending'])
        .modify({ status: 'pending', retryCount: 0, errorMessage: null, nextAttemptAt: null });
    } catch (e) {
      console.warn('[SyncEngine] Failed to reset items on reconnect:', e);
    }
    scheduleDrain(true);
  });

  // ── Disconnect: log only, no state changes needed ────────────────────────
  window.addEventListener('offline', () => {
    console.log('[SyncEngine] 📵 Network offline — syncing paused.');
  });

  // ── Auth state: drain on sign-in / token refresh ──────────────────────────
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (!session) return;
      console.log(`[SyncEngine] Auth event (${event}) — resetting & draining...`);
      try {
        await db.outbox
          .where('status').anyOf(['failed', 'processing'])
          .modify({ status: 'pending', retryCount: 0, errorMessage: null, nextAttemptAt: null });
      } catch (e) {
        console.warn('[SyncEngine] Failed to reset outbox on auth event:', e);
      }
      scheduleDrain(true);
    }
  });

  // ── Heartbeat: every 30 seconds, retry any lingering items ───────────────
  setInterval(async () => {
    if (!navigator.onLine) return;
    try {
      const total = await db.outbox.where('status').anyOf(['pending', 'failed']).count();
      if (total > 0) {
        console.log(`[SyncEngine] ♻️ Heartbeat: ${total} item(s) waiting — draining...`);
        // Reset failed items on every heartbeat so they always get another chance
        await db.outbox
          .where('status').equals('failed')
          .modify({ status: 'pending', retryCount: 0, errorMessage: null, nextAttemptAt: null });
        scheduleDrain(true);
      }
    } catch (e) {
      console.warn('[SyncEngine] Heartbeat error:', e);
    }
  }, 30 * 1000); // every 30 seconds
}
