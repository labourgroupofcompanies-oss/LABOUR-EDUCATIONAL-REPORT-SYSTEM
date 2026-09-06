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
import { systemErrorTracker } from './systemErrorTracker';

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

    if (!authUser && navigator.onLine) {
      console.log('[SyncEngine] ⏳ Waiting for authenticated Supabase session before draining outbox...');
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

/// ─── Self-healing: Resolve foreign keys for scores before sync ─────────────
const resolveScoresForeignKeys = async (rows, deleteFilter, schoolId) => {
  if (!rows || rows.length === 0) return { rows: rows || [], deleteFilter };

  const targetSchoolId = schoolId || deleteFilter?.school_id || rows[0]?.school_id;
  if (!targetSchoolId) return { rows, deleteFilter };

  const subMap = new Map();
  const clsMap = new Map();
  const learnerMap = new Map();

  const subIds = [...new Set(rows.map(r => r.subject_id).concat(deleteFilter?.subject_id).filter(Boolean))];
  const clsIds = [...new Set(rows.map(r => r.class_id).concat(deleteFilter?.class_id).filter(Boolean))];
  const learnerIds = [...new Set(rows.map(r => r.learner_id).filter(Boolean))];

  // 1. Resolve Subjects
  for (const sId of subIds) {
    if (subMap.has(sId)) continue;
    try {
      const { data: subRemote } = await supabase.from('report_subjects').select('id').eq('id', sId).maybeSingle();
      if (subRemote?.id) {
        subMap.set(sId, subRemote.id);
        continue;
      }

      const localSub = await db.subjects.get(sId).catch(() => null)
        || await db.subjects.get(Number(sId)).catch(() => null);

      if (localSub?.name) {
        const cleanName = localSub.name.trim();
        const { data: remoteByName } = await supabase.from('report_subjects')
          .select('id')
          .eq('school_id', targetSchoolId)
          .ilike('name', cleanName)
          .maybeSingle();

        if (remoteByName?.id) {
          subMap.set(sId, remoteByName.id);
          try {
            await db.scores.where('subjectId').equals(sId).modify({ subjectId: remoteByName.id });
            await db.subjects.delete(sId);
            await db.subjects.put({ ...localSub, id: remoteByName.id });
          } catch (_) {}
        } else {
          const { data: newSub } = await supabase.from('report_subjects')
            .insert([{ school_id: targetSchoolId, name: cleanName }])
            .select('id')
            .single();

          if (newSub?.id) {
            subMap.set(sId, newSub.id);
            try {
              await db.scores.where('subjectId').equals(sId).modify({ subjectId: newSub.id });
              await db.subjects.delete(sId);
              await db.subjects.put({ ...localSub, id: newSub.id });
            } catch (_) {}
          }
        }
      } else {
        // Fallback: localSub was deleted from db.subjects when remote subjects were pulled.
        // Check if Dexie scores have a reconciled subjectId for this class / year / term:
        const sampleScore = await db.scores
          .where('classId').equals(Number(clsIds[0] || rows[0]?.class_id))
          .filter(s => s.academicYear === (rows[0]?.academic_year) && s.term === (rows[0]?.term))
          .first().catch(() => null);

        if (sampleScore?.subjectId) {
          const { data: remoteCheck } = await supabase.from('report_subjects')
            .select('id')
            .eq('id', sampleScore.subjectId)
            .maybeSingle();
          if (remoteCheck?.id) {
            subMap.set(sId, remoteCheck.id);
          }
        }

        // If still unresolved, check remote subjects for targetSchoolId
        if (!subMap.has(sId)) {
          const { data: schoolSubs } = await supabase.from('report_subjects')
            .select('id, name')
            .eq('school_id', targetSchoolId);
          if (schoolSubs && schoolSubs.length === 1) {
            subMap.set(sId, schoolSubs[0].id);
          }
        }
      }
    } catch (sErr) {
      console.warn(`[SyncEngine] Subject reconciliation error for ${sId}:`, sErr);
    }
  }

  // 2. Resolve Classes
  for (const cId of clsIds) {
    if (clsMap.has(cId)) continue;
    try {
      const { data: clsRemote } = await supabase.from('report_classes').select('id').eq('id', cId).maybeSingle();
      if (clsRemote?.id) {
        clsMap.set(cId, clsRemote.id);
        continue;
      }

      const localCls = await db.classes.get(cId).catch(() => null)
        || await db.classes.get(Number(cId)).catch(() => null);

      if (localCls?.name) {
        const cleanName = localCls.name.trim();
        const { data: remoteByName } = await supabase.from('report_classes')
          .select('id')
          .eq('school_id', targetSchoolId)
          .ilike('name', cleanName)
          .maybeSingle();

        if (remoteByName?.id) {
          clsMap.set(cId, remoteByName.id);
          try {
            await db.scores.where('classId').equals(cId).modify({ classId: remoteByName.id });
            await db.classes.delete(cId);
            await db.classes.put({ ...localCls, id: remoteByName.id });
          } catch (_) {}
        } else {
          const { data: newCls } = await supabase.from('report_classes')
            .insert([{ school_id: targetSchoolId, name: cleanName, teaching_mode: localCls.teachingMode || 'class' }])
            .select('id')
            .single();

          if (newCls?.id) {
            clsMap.set(cId, newCls.id);
            try {
              await db.scores.where('classId').equals(cId).modify({ classId: newCls.id });
              await db.classes.delete(cId);
              await db.classes.put({ ...localCls, id: newCls.id });
            } catch (_) {}
          }
        }
      }
    } catch (cErr) {
      console.warn(`[SyncEngine] Class reconciliation error for ${cId}:`, cErr);
    }
  }

  // 3. Resolve Learners (check cloud, local Dexie, or auto-create if missing)
  for (const lId of learnerIds) {
    if (learnerMap.has(lId)) continue;
    try {
      let cloudLearnerId = null;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lId);
      if (isUuid) {
        const { data: remL } = await supabase.from('report_learners').select('id').eq('id', lId).maybeSingle();
        if (remL?.id) cloudLearnerId = remL.id;
      }

      if (!cloudLearnerId) {
        const localLearner = await db.learners.get(lId).catch(() => null)
          || await db.learners.get(Number(lId)).catch(() => null)
          || await db.learners.where('supabaseId').equals(lId).first().catch(() => null);

        if (localLearner) {
          if (localLearner.supabaseId) {
            const { data: remCheck } = await supabase.from('report_learners').select('id').eq('id', localLearner.supabaseId).maybeSingle();
            if (remCheck?.id) cloudLearnerId = remCheck.id;
          }

          if (!cloudLearnerId && localLearner.regNumber) {
            const { data: remByReg } = await supabase.from('report_learners')
              .select('id')
              .eq('school_id', targetSchoolId)
              .eq('reg_number', localLearner.regNumber)
              .maybeSingle();
            if (remByReg?.id) {
              cloudLearnerId = remByReg.id;
              await db.learners.update(localLearner.id, { supabaseId: remByReg.id, synced: true }).catch(() => null);
            }
          }

          if (!cloudLearnerId && (localLearner.fullName || localLearner.name)) {
            const cleanName = (localLearner.fullName || localLearner.name).trim();
            const { data: remByName } = await supabase.from('report_learners')
              .select('id')
              .eq('school_id', targetSchoolId)
              .ilike('full_name', cleanName)
              .maybeSingle();
            if (remByName?.id) {
              cloudLearnerId = remByName.id;
              await db.learners.update(localLearner.id, { supabaseId: remByName.id, synced: true }).catch(() => null);
            }
          }

          // If still not in cloud, auto-create learner now so scores can sync cleanly!
          if (!cloudLearnerId) {
            try {
              const { data: newL } = await supabase.from('report_learners').insert([{
                school_id: targetSchoolId,
                full_name: localLearner.fullName || localLearner.name || 'Learner',
                reg_number: localLearner.regNumber || `REG-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                gender: localLearner.gender || 'Male',
                ghanaian_language: localLearner.ghanaianLanguage || 'twi',
                class_id: clsMap.get(localLearner.currentClassId) || localLearner.currentClassId || null,
                status: localLearner.status || 'Active',
                photo_url: typeof localLearner.photoUrl === 'string' && localLearner.photoUrl.startsWith('http') ? localLearner.photoUrl : null,
                guardian_name: localLearner.guardianName || null,
                guardian_relation: localLearner.guardianRelation || null,
                guardian_contact_1: localLearner.guardianContact1 || null,
                guardian_contact_2: localLearner.guardianContact2 || null,
                guardian_profession: localLearner.guardianProfession || null,
                guardian_location: localLearner.guardianLocation || null,
                created_at: localLearner.createdAt || new Date().toISOString()
              }]).select('id').maybeSingle();

              if (newL?.id) {
                cloudLearnerId = newL.id;
                await db.learners.update(localLearner.id, { supabaseId: newL.id, synced: true }).catch(() => null);
              }
            } catch (createErr) {
              console.warn('[SyncEngine] Auto-create learner error in pre-resolve:', createErr);
            }
          }
        }
      }

      if (cloudLearnerId) {
        learnerMap.set(lId, cloudLearnerId);
      }
    } catch (lErr) {
      console.warn(`[SyncEngine] Learner reconciliation error for ${lId}:`, lErr);
    }
  }

  // Remap rows and only keep valid verified foreign keys
  const resolvedRows = [];
  for (const r of rows) {
    const targetSubId = subMap.get(r.subject_id) || r.subject_id;
    const targetLearnerId = learnerMap.get(r.learner_id) || r.learner_id;
    const targetClassId = clsMap.get(r.class_id) || r.class_id;

    const isLearnerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetLearnerId);

    // If learner is valid UUID in cloud and subject is resolved in cloud, retain row
    if (isLearnerUuid && (learnerMap.has(r.learner_id) || learnerMap.has(targetLearnerId)) && (subMap.has(r.subject_id) || subMap.has(targetSubId))) {
      resolvedRows.push({
        ...r,
        learner_id: targetLearnerId,
        subject_id: targetSubId,
        class_id: targetClassId,
      });
    }
  }

  // Remap deleteFilter
  const resolvedFilter = deleteFilter ? {
    ...deleteFilter,
    subject_id: subMap.get(deleteFilter.subject_id) || deleteFilter.subject_id,
    class_id: clsMap.get(deleteFilter.class_id) || deleteFilter.class_id,
  } : deleteFilter;

  return { rows: resolvedRows, deleteFilter: resolvedFilter };
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
        if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('exclude_from_pdf') || error.message?.includes('does not exist'))) {
          const colMatch = (error.message || '').match(/column "([^"]+)" of relation/i) ||
                           (error.message || '').match(/Could not find the '([^']+)' column/i);
          const badCol = colMatch ? colMatch[1] : (error.message?.includes('exclude_from_pdf') ? 'exclude_from_pdf' : null);
          if (badCol) {
            console.warn(`[SyncEngine] 🔄 Stripping unknown column '${badCol}' from ${item.table} insert...`);
            const stripped = rows.map(r => { const c = { ...r }; delete c[badCol]; return c; });
            const retry = await supabase.from(item.table).insert(stripped).select();
            data = retry.data;
            error = retry.error;
          } else {
            const stripped = rows.map(r => { const c = { ...r }; delete c.exclude_from_pdf; return c; });
            const retry = await supabase.from(item.table).insert(stripped).select();
            data = retry.data;
            error = retry.error;
          }
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
        if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('exclude_from_pdf') || error.message?.includes('does not exist'))) {
          const colMatch = (error.message || '').match(/column "([^"]+)" of relation/i) ||
                           (error.message || '').match(/Could not find the '([^']+)' column/i);
          const badCol = colMatch ? colMatch[1] : (error.message?.includes('exclude_from_pdf') ? 'exclude_from_pdf' : null);
          const strippedData = { ...payload.data };
          if (badCol) delete strippedData[badCol];
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
        const rows = payload.insertData || [];
        // Deduplicate in-memory by primary business key
        const seen = new Set();
        let cleanRows = [];
        for (const row of rows) {
          const key = item.table === 'report_scores'
            ? `${row.school_id}_${row.learner_id}_${row.subject_id}_${row.academic_year}_${row.term}`
            : JSON.stringify(row);
          if (!seen.has(key)) {
            seen.add(key);
            cleanRows.push(row);
          }
        }

        // If report_scores, pre-resolve foreign keys (subject_id, class_id, learner_id)
        if (item.table === 'report_scores') {
          const resolved = await resolveScoresForeignKeys(cleanRows, payload.deleteFilter, item.schoolId);
          cleanRows = resolved.rows;
          payload.deleteFilter = resolved.deleteFilter;
        }

        // 1. Delete matching existing rows
        let delQ = supabase.from(item.table).delete();
        Object.entries(payload.deleteFilter || {}).forEach(([k, v]) => {
          delQ = Array.isArray(v) ? delQ.in(k, v) : delQ.eq(k, v);
        });
        const { error: delErr } = await delQ;

        if (item.table === 'report_scores' && cleanRows.length === 0) {
          console.log(`[SyncEngine] 🗑️ Outbox item ${item.id} has no valid score rows with confirmed cloud references. Safely completing.`);
          await db.outbox.delete(item.id);
          return true;
        }

        if (cleanRows.length > 0) {
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

          // 3. Clean upsert (handles conflicts automatically without 409 errors)
          let { error: insErr } = await supabase.from(item.table).upsert(cleanRows);

          // 4. If unique constraint or duplicate occurs, heal row-by-row (exclude foreign key errors 23503)
          const isFkErr = insErr && (
            insErr.code === '23503' ||
            String(insErr.message || '').toLowerCase().includes('foreign key') ||
            String(insErr.message || '').includes('23503')
          );

          const isUniqueConflict = !isFkErr && insErr && (
            insErr.code === '23505' ||
            String(insErr.message || '').toLowerCase().includes('duplicate') ||
            String(insErr.message || '').toLowerCase().includes('unique') ||
            String(insErr.message || '').toLowerCase().includes('already exists')
          );

          if (isUniqueConflict) {
            console.log(`[SyncEngine] 🔄 Healing unique conflict on ${item.table} via targeted update & upsert...`);
            let hasFailures = false;
            for (const r of cleanRows) {
              if (item.table === 'report_scores') {
                try {
                  const { data: existingScore } = await supabase.from('report_scores')
                    .select('id')
                    .eq('school_id', r.school_id)
                    .eq('learner_id', r.learner_id)
                    .eq('subject_id', r.subject_id)
                    .eq('academic_year', r.academic_year)
                    .eq('term', r.term)
                    .maybeSingle();

                  if (existingScore?.id) {
                    const { error: updErr } = await supabase.from('report_scores').update(r).eq('id', existingScore.id);
                    if (updErr) hasFailures = true;
                    continue;
                  }
                } catch (_) {}
              }
              const { error: singleErr } = await supabase.from(item.table).upsert(r);
              if (singleErr) {
                hasFailures = true;
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
        let { error } = await supabase.from(item.table).upsert(rows);

        // Self-heal: If schema error / unknown column (PGRST204), extract column name, strip and retry
        if (error && (error.code === 'PGRST204' || String(error.message || '').includes('schema cache') || String(error.message || '').includes('Could not find the'))) {
          const match = (error.message || '').match(/Could not find the '([^']+)' column/);
          if (match && match[1]) {
            const badCol = match[1];
            console.warn(`[SyncEngine] 🔄 Stripping unknown column '${badCol}' from ${item.table} and retrying upsert...`);
            const cleanedRows = rows.map(r => {
              const copy = { ...r };
              delete copy[badCol];
              return copy;
            });
            const retryRes = await supabase.from(item.table).upsert(cleanedRows);
            error = retryRes.error;
          }
        }

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

    if (item.table === 'report_scores') {
      try {
        const rows = payload.insertData || (Array.isArray(payload) ? payload : [payload]);
        for (const r of rows) {
          if (r.school_id && r.learner_id && r.subject_id) {
            await db.scores
              .where('classId').equals(Number(r.class_id))
              .filter(s => (s.learnerId === r.learner_id || String(s.learnerId) === String(r.learner_id)) &&
                           Number(s.subjectId) === Number(r.subject_id) &&
                           s.term === r.term &&
                           s.academicYear === r.academic_year)
              .modify({ synced: true });
          }
        }
      } catch (markErr) {
        console.warn('[SyncEngine] Failed to mark scores as synced in Dexie (non-fatal):', markErr);
      }
    }

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
      try {
        systemErrorTracker.recordSyncError({
          table: item.table,
          operation: item.operation,
          schoolId: item.schoolId,
          error: err
        });
      } catch (_) {}
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
      const dexieLearnerId = local.id;
      await db.learners.update(local.id, { 
        supabaseId: row.id, 
        synced: true,
        status: row.status || local.status || 'Active'
      });

      // ── Cascade supabaseId to pending scores that used the Dexie integer id ──
      // When a teacher saved scores for an offline-registered learner, the scores
      // were stored with learnerId = dexie integer. Now that we have the UUID, heal them
      // so syncUnsyncedScores can include them in the next drain cycle.
      try {
        const pendingScores = await db.scores
          .filter(s => String(s.learnerId) === String(dexieLearnerId))
          .toArray();
        if (pendingScores.length > 0) {
          console.log(`[SyncEngine] Cascading supabaseId ${row.id} to ${pendingScores.length} pending score(s) for learner (Dexie id=${dexieLearnerId}).`);
          for (const ps of pendingScores) {
            await db.scores.update(ps.id, { learnerId: row.id, synced: false });
          }
        }
      } catch (cascadeErr) {
        console.warn('[SyncEngine] Score cascade after learner reconcile failed (non-fatal):', cascadeErr);
      }

      // ── Cascade supabaseId to pending report_summaries ──────────────────────
      // If a teacher saved attendance/remarks for an offline-registered learner,
      // the summary was stored with learnerId = Dexie integer. Now that we have the
      // UUID, update and enqueue an insert so the cloud receives them.
      try {
        const pendingSummaries = await db.reportSummaries
          .filter(s => String(s.learnerId) === String(dexieLearnerId))
          .toArray();
        if (pendingSummaries.length > 0) {
          console.log(`[SyncEngine] Cascading supabaseId ${row.id} to ${pendingSummaries.length} report_summary(ies) for learner (Dexie id=${dexieLearnerId}).`);
          for (const ps of pendingSummaries) {
            // Update local learnerId to the UUID
            await db.reportSummaries.update(ps.id, { learnerId: row.id, synced: false });
            // Enqueue insert/update to cloud
            const cloud = {
              school_id:         ps.schoolId || row.school_id,
              learner_id:        row.id,
              class_id:          ps.classId,
              academic_year:     ps.academicYear,
              term:              ps.term,
              attendance_present: ps.attendancePresent ?? 0,
              attendance_total:   ps.attendanceTotal ?? 0,
              conduct:            ps.conduct || '',
              attitude:           ps.attitude || '',
              teacher_remark:     ps.teacherRemark || '',
              headteacher_remark: ps.headteacherRemark || '',
              promoted_to:        ps.promotedTo || '',
              next_term_begins:   ps.nextTermBegins || '',
              fees_owed:          ps.feesOwed || '',
              next_term_bill:     ps.nextTermBill || '',
              class_average:      ps.classAverage ?? null,
              class_rank:         ps.classRank ?? null,
              total_graded:       ps.totalGraded ?? 0,
              updated_at:         new Date().toISOString(),
            };
            if (ps.supabaseId) {
              await enqueueSync('update', 'report_summaries', { filter: { id: ps.supabaseId }, data: cloud }, row.school_id);
            } else {
              await enqueueSync('insert', 'report_summaries', cloud, row.school_id);
            }
          }
        }
      } catch (summCascadeErr) {
        console.warn('[SyncEngine] Summary cascade after learner reconcile failed (non-fatal):', summCascadeErr);
      }

      // If local learner has an offline photo Blob that needs to be uploaded to storage
      if (local.photo instanceof Blob && !row.photo_url && typeof navigator !== 'undefined' && navigator.onLine) {
        (async () => {
          try {
            const cleanReg = String(row.reg_number || local.regNumber || local.id).replace(/[^a-zA-Z0-9]/g, '_');
            const fullPath = `learners/${row.school_id}_${cleanReg}.webp`;
            const thumbPath = `learners/${row.school_id}_${cleanReg}_thumb.webp`;

            const { error: upErr } = await supabase.storage.from('learner-photos').upload(fullPath, local.photo, { upsert: true, contentType: 'image/webp' });
            if (!upErr) {
              const { data: pubData } = supabase.storage.from('learner-photos').getPublicUrl(fullPath);
              if (pubData?.publicUrl) {
                const freshUrl = `${pubData.publicUrl}?t=${Date.now()}`;
                await db.learners.update(local.id, { photoUrl: freshUrl });
                await supabase.from('report_learners').update({ photo_url: freshUrl }).eq('id', row.id);
              }
            }

            if (local.photoThumb instanceof Blob) {
              await supabase.storage.from('learner-photos').upload(thumbPath, local.photoThumb, { upsert: true, contentType: 'image/webp' }).catch(() => null);
            }
          } catch (photoErr) {
            console.warn('[SyncEngine] Background photo upload on learner reconcile failed:', photoErr);
          }
        })();
      }
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
              const { data: existingScore } = await supabase.from('report_scores')
                .select('id')
                .eq('school_id', r.school_id)
                .eq('learner_id', r.learner_id)
                .eq('subject_id', r.subject_id)
                .eq('academic_year', r.academic_year)
                .eq('term', r.term)
                .maybeSingle();

              if (existingScore?.id) {
                await supabase.from('report_scores').update(r).eq('id', existingScore.id);
              } else {
                await supabase.from('report_scores').upsert(r).catch(() => null);
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
    if (item.table === 'report_schools') {
      const schoolId = payload.id || payload?.filter?.id || (Array.isArray(payload) ? payload[0]?.id : null);
      if (schoolId) {
        // 1. Try direct UPDATE since the school already exists in Supabase
        const updateData = { ...(Array.isArray(payload) ? payload[0] : payload) };
        delete updateData.id;
        const { error: updErr } = await supabase.from('report_schools').update(updateData).eq('id', schoolId);
        if (!updErr) return null; // Successfully healed!

        // 2. Otherwise patch all local school fields for full upsert
        const school = await db.schools.get(schoolId);
        const schoolName = school?.name || 'My School';
        const schoolLoc = school?.location || 'Ghana';
        const patched = Array.isArray(payload)
          ? payload.map(p => ({ ...p, name: p.name || schoolName, location: p.location || schoolLoc }))
          : { ...payload, name: payload.name || schoolName, location: payload.location || schoolLoc };
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
    if (item.table === 'report_scores') {
      let rows = Array.isArray(payload.insertData)
        ? payload.insertData
        : (Array.isArray(payload) ? payload : (payload.data ? [payload.data] : [payload]));

      if (rows && rows.length > 0) {
        console.log(`[SyncEngine] 🔄 Self-healing: Foreign key violation on report_scores (item ${item.id}). Resolving references...`);

        // 1. Resolve Subjects, Classes, and known Learners
        const resolved = await resolveScoresForeignKeys(rows, payload.deleteFilter, item.schoolId);
        rows = resolved.rows;
        if (payload.deleteFilter) payload.deleteFilter = resolved.deleteFilter;

        // 2. Filter and verify valid rows
        const validRows = [];
        let hasPendingLocalLearners = false;
        let queryEncounteredErrors = false;
        const targetSchoolId = item.schoolId || payload.deleteFilter?.school_id || rows[0]?.school_id;

        for (const row of rows) {
          if (!row.learner_id || !row.subject_id || !row.school_id) continue;

          let resolvedLearnerId = row.learner_id;
          const [{ data: lData, error: lErr }, { data: sData, error: sErr }, { data: cData, error: cErr }] = await Promise.all([
            supabase.from('report_learners').select('id').eq('id', resolvedLearnerId).maybeSingle(),
            supabase.from('report_subjects').select('id').eq('id', row.subject_id).maybeSingle(),
            row.class_id ? supabase.from('report_classes').select('id').eq('id', row.class_id).maybeSingle() : Promise.resolve({ data: { id: null }, error: null })
          ]);

          if (lErr || sErr || cErr) {
            queryEncounteredErrors = true;
          }

          let finalLearnerId = lData?.id;

          // If learner wasn't found in Supabase by current ID, check local Dexie db.learners!
          if (!finalLearnerId) {
            const localLearner = await db.learners.get(resolvedLearnerId).catch(() => null)
              || await db.learners.get(Number(resolvedLearnerId)).catch(() => null)
              || await db.learners.where('supabaseId').equals(resolvedLearnerId).first().catch(() => null);

            if (localLearner) {
              if (localLearner.supabaseId && localLearner.supabaseId !== resolvedLearnerId) {
                const { data: remoteCheck } = await supabase.from('report_learners').select('id').eq('id', localLearner.supabaseId).maybeSingle();
                if (remoteCheck?.id) {
                  finalLearnerId = remoteCheck.id;
                  row.learner_id = remoteCheck.id;
                }
              }
              if (!finalLearnerId && localLearner.regNumber) {
                const { data: remoteByReg } = await supabase.from('report_learners')
                  .select('id')
                  .eq('school_id', targetSchoolId)
                  .eq('reg_number', localLearner.regNumber)
                  .maybeSingle();
                if (remoteByReg?.id) {
                  finalLearnerId = remoteByReg.id;
                  row.learner_id = remoteByReg.id;
                  await db.learners.update(localLearner.id, { supabaseId: remoteByReg.id, synced: true });
                }
              }
              if (!finalLearnerId && (localLearner.fullName || localLearner.name)) {
                const { data: remoteByName } = await supabase.from('report_learners')
                  .select('id')
                  .eq('school_id', targetSchoolId)
                  .ilike('full_name', (localLearner.fullName || localLearner.name).trim())
                  .maybeSingle();
                if (remoteByName?.id) {
                  finalLearnerId = remoteByName.id;
                  row.learner_id = remoteByName.id;
                  await db.learners.update(localLearner.id, { supabaseId: remoteByName.id, synced: true });
                }
              }
              // If still not in Supabase, auto-create learner now!
              if (!finalLearnerId) {
                try {
                  const { data: newLearner } = await supabase.from('report_learners').insert([{
                    school_id: targetSchoolId,
                    full_name: localLearner.fullName || localLearner.name || 'Learner',
                    reg_number: localLearner.regNumber || `REG-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                    gender: localLearner.gender || 'Male',
                    ghanaian_language: localLearner.ghanaianLanguage || 'twi',
                    class_id: row.class_id || localLearner.currentClassId || null,
                    status: localLearner.status || 'Active',
                    photo_url: typeof localLearner.photoUrl === 'string' && localLearner.photoUrl.startsWith('http') ? localLearner.photoUrl : null,
                    guardian_name: localLearner.guardianName || null,
                    guardian_relation: localLearner.guardianRelation || null,
                    guardian_contact_1: localLearner.guardianContact1 || null,
                    guardian_contact_2: localLearner.guardianContact2 || null,
                    guardian_profession: localLearner.guardianProfession || null,
                    guardian_location: localLearner.guardianLocation || null,
                    created_at: localLearner.createdAt || new Date().toISOString()
                  }]).select('id').maybeSingle();

                  if (newLearner?.id) {
                    finalLearnerId = newLearner.id;
                    row.learner_id = newLearner.id;
                    await db.learners.update(localLearner.id, { supabaseId: newLearner.id, synced: true }).catch(() => null);
                  } else {
                    hasPendingLocalLearners = true;
                  }
                } catch (cErr) {
                  console.warn('[SyncEngine] Auto-create learner error in healForeignKey:', cErr);
                  hasPendingLocalLearners = true;
                }
              }
            }
          }

          if (finalLearnerId && sData?.id && (!row.class_id || cData?.id)) {
            validRows.push({ ...row, learner_id: finalLearnerId });
          } else {
            console.warn(`[SyncEngine] ⚠️ Skipping unverified score row (Learner:${finalLearnerId || 'not found in cloud'}, Subject:${sData?.id})`);
          }
        }

        // 3. Update the outbox item payload with healed data so future attempts use resolved IDs
        try {
          await db.outbox.update(item.id, {
            payload: JSON.stringify({
              ...payload,
              deleteFilter: payload.deleteFilter,
              insertData: rows
            })
          });
        } catch (_) {}

        if (validRows.length === 0) {
          if ((item.retryCount || 0) >= 2 || (!hasPendingLocalLearners && !queryEncounteredErrors)) {
            console.log(`[SyncEngine] 🗑️ All score rows reference missing entities or max retries reached for item ${item.id} — safely discarding item to unblock sync.`);
            await db.outbox.delete(item.id).catch(() => null);
            return null;
          }
          console.log('[SyncEngine] ⏳ Score rows reference local learners awaiting cloud sync or auth — deferring item to retry.');
          return opError;
        }

        if (item.operation === 'delete_insert') {
          let delQ = supabase.from(item.table).delete();
          Object.entries(payload.deleteFilter || {}).forEach(([k, v]) => {
            delQ = Array.isArray(v) ? delQ.in(k, v) : delQ.eq(k, v);
          });
          await delQ;
          const { error: retryErr } = await supabase.from(item.table).upsert(validRows);
          if (!retryErr) {
            await db.outbox.delete(item.id).catch(() => null);
            return null;
          }
          return retryErr;
        } else {
          const { error: retryErr } = await supabase.from(item.table).upsert(validRows);
          if (!retryErr) {
            await db.outbox.delete(item.id).catch(() => null);
            return null;
          }
          return retryErr;
        }
      }
    }

    if (item.table === 'report_summaries') {
      const lId = payload.learner_id || payload.data?.learner_id;
      if (lId) {
        const { data } = await supabase.from('report_learners').select('id').eq('id', lId).maybeSingle();
        if (!data?.id) {
          console.log(`[SyncEngine] Discarding item for deleted learner: ${lId}`);
          return null;
        }
      }
    }

    if (item.table === 'report_learners') {
      const classId = payload.class_id || payload.data?.class_id;
      const targetSchoolId = payload.school_id || item.schoolId;

      if (classId && targetSchoolId) {
        console.log(`[SyncEngine] 🔄 Self-healing: FK violation on report_learners for class_id ${classId}...`);
        // 1. Check if class exists locally in Dexie
        const localClass = await db.classes.get(Number(classId)).catch(() => null) ||
                           await db.classes.get(classId).catch(() => null);

        let resolvedClassId = null;
        if (localClass) {
          // See if it exists on remote by name
          const { data: remoteCls } = await supabase.from('report_classes')
            .select('id')
            .eq('school_id', targetSchoolId)
            .ilike('name', localClass.name.trim())
            .maybeSingle();

          if (remoteCls?.id) {
            resolvedClassId = remoteCls.id;
          } else {
            // Upsert class to Supabase
            const { data: newCls } = await supabase.from('report_classes')
              .insert([{ school_id: targetSchoolId, name: localClass.name }])
              .select()
              .maybeSingle();
            if (newCls?.id) resolvedClassId = newCls.id;
          }
        }

        // 2. Retry operation with resolvedClassId or null
        if (item.operation === 'insert') {
          const rows = (Array.isArray(payload) ? payload : [payload]).map(r => ({
            ...r,
            class_id: resolvedClassId || null
          }));
          const { data: retryData, error: retryErr } = await supabase.from(item.table).insert(rows).select();
          if (!retryErr && retryData) {
            for (const r of retryData) {
              await reconcileInsertedRow(item.table, r, payload).catch(() => null);
            }
            return null;
          }
          return retryErr;
        } else if (item.operation === 'update') {
          const updateData = { ...payload.data, class_id: resolvedClassId || null };
          let q = supabase.from(item.table).update(updateData);
          if (payload.filter) {
            Object.entries(payload.filter).forEach(([k, v]) => {
              q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
            });
          }
          const { error: retryErr } = await q;
          return retryErr || null;
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
