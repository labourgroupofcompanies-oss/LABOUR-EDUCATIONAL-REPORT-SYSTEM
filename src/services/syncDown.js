/**
 * syncDown.js — Smart Background Pull Sync
 *
 * Pulls data from Supabase into local Dexie storage with intelligent diffing.
 * Only writes to IndexedDB when cloud data has actually changed, which prevents
 * useLiveQuery from firing unnecessarily and eliminates the "just reloaded"
 * UI flashing problem caused by blind overwrites.
 *
 * Supports both online and offline modes:
 *   - Runs immediately when called (if online)
 *   - Re-triggers automatically the moment the network comes back online
 *   - Polls silently in the background every 5 minutes (only if online)
 *   - Does nothing when offline — no errors, no flashing
 *
 * Two entry points:
 *   startAdminSync(user)   → Dashboard.jsx  (admin / teacher portal)
 *   startParentSync(ctx)   → ParentDashboard.jsx (parent portal)
 *
 * Both return a cleanup() function to be called in useEffect's return.
 */

import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { downloadImageAsBlob } from '../utils/imageUtils';

// ─── Polling interval ─────────────────────────────────────────────────────────
// 5 minutes — long enough to avoid hammering the DB, short enough to feel live.
// The 'online' event listener handles instant sync on reconnection.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// ─── Smart Differ ─────────────────────────────────────────────────────────────
/**
 * Returns true if any of the specified fields differ between localObj and remoteObj.
 * Arrays are compared via JSON.stringify to detect deep changes (e.g. caScores).
 *
 * @param {object} localObj  - The record currently stored in Dexie
 * @param {object} remoteObj - The freshly fetched record from Supabase
 * @param {string[]} fields  - List of field names to compare
 * @returns {boolean}
 */
function hasChanged(localObj, remoteObj, fields) {
  for (const field of fields) {
    const lv = localObj[field];
    const rv = remoteObj[field];
    if (Array.isArray(lv) || Array.isArray(rv)) {
      if (JSON.stringify(lv) !== JSON.stringify(rv)) return true;
    } else if (lv !== rv) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN / TEACHER PORTAL SYNC
// ─────────────────────────────────────────────────────────────────────────────

async function runAdminSync(user) {
  if (!navigator.onLine || !user?.schoolId) return;
  const { schoolId } = user;
  console.log('[SyncDown] Admin sync start — school:', schoolId);

  // 0. Self-heal: ensure auth metadata contains school_id for RLS
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser && (!authUser.user_metadata?.school_id || authUser.user_metadata.school_id !== schoolId)) {
      await supabase.auth.updateUser({ data: { school_id: schoolId } });
      await supabase.auth.refreshSession();
      console.log('[SyncDown] Forced session refresh to apply school_id claim to JWT.');
    }
  } catch (_) { /* non-critical — skip silently */ }

  // 0b. Sync School Info in background
  try {
    const { data: remoteSchool, error: schoolErr } = await supabase
      .from('report_schools')
      .select('*')
      .eq('id', schoolId)
      .maybeSingle();

    if (remoteSchool && !schoolErr) {
      const existing = await db.schools.get(schoolId);
      const remoteLogo = remoteSchool.logo_url;
      const localLogo = existing?.logoUrl;
      const isLocalDataUrl = localLogo && typeof localLogo === 'string' && localLogo.startsWith('data:');
      const isRemoteDataUrl = remoteLogo && typeof remoteLogo === 'string' && remoteLogo.startsWith('data:');
      const isRemoteStorageBroken = remoteLogo && typeof remoteLogo === 'string' && remoteLogo.includes('storage/v1/object/public/learner-photos/logos');

      let finalLogoUrl = existing?.logoUrl || '';
      if (isRemoteDataUrl) {
        finalLogoUrl = remoteLogo;
      } else if (remoteLogo && typeof remoteLogo === 'string' && !isRemoteStorageBroken) {
        finalLogoUrl = remoteLogo;
      } else if (isLocalDataUrl) {
        finalLogoUrl = localLogo;
      } else if (remoteLogo && typeof remoteLogo === 'string') {
        finalLogoUrl = remoteLogo;
      }

      const mapped = {
        ...existing,
        id: schoolId,
        name: remoteSchool.name || existing?.name || '',
        location: remoteSchool.location || existing?.location || '',
        district: remoteSchool.district || existing?.district || '',
        region: remoteSchool.region || existing?.region || '',
        circuit: remoteSchool.circuit || existing?.circuit || '',
        motto: remoteSchool.motto || existing?.motto || '',
        schoolType: remoteSchool.school_type || remoteSchool.schoolType || existing?.schoolType || 'private',
        logoUrl: finalLogoUrl,
        logoBlob: existing?.logoBlob || null,
        currentAcademicYear: remoteSchool.current_academic_year || existing?.currentAcademicYear || '',
        currentTerm: remoteSchool.current_term || existing?.currentTerm || 'Term 1',
        vacationDate: remoteSchool.vacation_date || existing?.vacationDate || '',
        nextTermBegins: remoteSchool.next_term_begins || existing?.nextTermBegins || '',
        phone: remoteSchool.phone || existing?.phone || '',
        email: remoteSchool.email || existing?.email || '',
        wallet_balance: remoteSchool.wallet_balance !== undefined ? Number(remoteSchool.wallet_balance) : (existing?.wallet_balance || 0),
        walletBalance: remoteSchool.wallet_balance !== undefined ? Number(remoteSchool.wallet_balance) : (existing?.walletBalance || 0),
        is_first_term_free: remoteSchool.is_first_term_free !== undefined ? remoteSchool.is_first_term_free : existing?.is_first_term_free
      };
      if (!existing || hasChanged(existing, mapped, ['name', 'schoolType', 'currentAcademicYear', 'currentTerm', 'vacationDate', 'nextTermBegins', 'motto', 'logoUrl', 'district', 'region', 'circuit', 'phone', 'email', 'wallet_balance', 'walletBalance', 'is_first_term_free'])) {
        await db.schools.put(mapped);
      }
    }
  } catch (err) { console.error('[SyncDown] School info sync failed:', err); }

  // ── 1. Classes ──────────────────────────────────────────────────────────────
  try {
    const { data: remoteClasses, error } = await supabase
      .from('report_classes').select('*').eq('school_id', schoolId);

    if (!error && remoteClasses) {
      const localClasses = await db.classes.where('schoolId').equals(schoolId).toArray();

      for (const rc of remoteClasses) {
        const localByName = localClasses.find(
          c => c.name.toLowerCase().trim() === rc.name.toLowerCase().trim()
        );

        if (localByName && localByName.id !== rc.id) {
          // ID mismatch — reconcile duplicate by migrating references
          const oldId = localByName.id;
          const newId = rc.id;
          console.log(`[SyncDown] Reconciling class "${rc.name}" (${oldId} → ${newId})`);

          const relLearners = await db.learners.where('currentClassId').equals(oldId).toArray();
          for (const l of relLearners) await db.learners.update(l.id, { currentClassId: newId, synced: false });

          const relScores = await db.scores.where('classId').equals(oldId).toArray();
          for (const s of relScores) await db.scores.update(s.id, { classId: newId });

          const relAssigns = await db.teacherAssignments.where('classId').equals(oldId).toArray();
          for (const a of relAssigns) await db.teacherAssignments.update(a.id, { classId: newId });

          await db.classes.delete(oldId);
          await db.classes.put({
            id: newId, schoolId: rc.school_id,
            name: rc.name, teachingMode: rc.teaching_mode, createdAt: rc.created_at
          });

        } else if (localByName) {
          // Same ID — only write if something changed
          if (hasChanged(localByName, { name: rc.name, teachingMode: rc.teaching_mode }, ['name', 'teachingMode'])) {
            await db.classes.update(rc.id, { name: rc.name, teachingMode: rc.teaching_mode });
          }

        } else {
          const localById = await db.classes.get(rc.id);
          if (!localById) {
            await db.classes.put({
              id: rc.id, schoolId: rc.school_id,
              name: rc.name, teachingMode: rc.teaching_mode, createdAt: rc.created_at
            });
          }
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Classes sync failed:', err); }

  // ── 2. Subjects ─────────────────────────────────────────────────────────────
  try {
    const { data: remoteSubjects, error } = await supabase
      .from('report_subjects').select('*').eq('school_id', schoolId);

    if (!error && remoteSubjects) {
      const localSubjects = await db.subjects.where('schoolId').equals(schoolId).toArray();

      for (const rs of remoteSubjects) {
        const localByName = localSubjects.find(
          s => s.name.toLowerCase().trim() === rs.name.toLowerCase().trim()
        );

        if (localByName && localByName.id !== rs.id) {
          const oldId = localByName.id; const newId = rs.id;
          console.log(`[SyncDown] Reconciling subject "${rs.name}" (${oldId} → ${newId})`);

          const relScores = await db.scores.where('subjectId').equals(oldId).toArray();
          for (const s of relScores) await db.scores.update(s.id, { subjectId: newId });

          const relAssigns = await db.teacherAssignments.where('subjectId').equals(oldId).toArray();
          for (const a of relAssigns) await db.teacherAssignments.update(a.id, { subjectId: newId });

          await db.subjects.delete(oldId);
          await db.subjects.put({ id: newId, schoolId: rs.school_id, name: rs.name, createdAt: rs.created_at });

        } else if (localByName) {
          if (localByName.name !== rs.name) await db.subjects.update(rs.id, { name: rs.name });

        } else {
          const localById = await db.subjects.get(rs.id);
          if (!localById) {
            await db.subjects.put({ id: rs.id, schoolId: rs.school_id, name: rs.name, createdAt: rs.created_at });
          }
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Subjects sync failed:', err); }

  // ── 3. Class-Subject Mappings ────────────────────────────────────────────────
  try {
    const { data: classSubsData, error } = await supabase
      .from('report_class_subjects').select('*').eq('school_id', schoolId);

    if (!error && classSubsData) {
      const existing = await db.classSubjects.where('schoolId').equals(schoolId).toArray();
      const remoteIds = new Set(classSubsData.map(cs => cs.id));

      // 1. Remove mappings no longer in remote
      for (const e of existing) {
        if (e.supabaseId && !remoteIds.has(e.supabaseId)) {
          await db.classSubjects.delete(e.id);
        }
      }

      // 2. Clean up local duplicate rows for the same class & subject
      const currentList = await db.classSubjects.where('schoolId').equals(schoolId).toArray();
      const seenCombinations = new Map();
      for (const item of currentList) {
        const key = `${item.classId}_${item.subjectId}`;
        if (seenCombinations.has(key)) {
          const prev = seenCombinations.get(key);
          if (item.supabaseId && !prev.supabaseId) {
            await db.classSubjects.delete(prev.id);
            seenCombinations.set(key, item);
          } else {
            await db.classSubjects.delete(item.id);
          }
        } else {
          seenCombinations.set(key, item);
        }
      }

      // 3. Reconcile with remote items
      for (const cs of classSubsData) {
        const key = `${cs.class_id}_${cs.subject_id}`;
        const local = seenCombinations.get(key);

        if (local) {
          if (!local.supabaseId || local.supabaseId !== cs.id || !local.synced) {
            await db.classSubjects.update(local.id, { supabaseId: cs.id, synced: true });
          }
        } else {
          await db.classSubjects.put({
            supabaseId: cs.id, schoolId: cs.school_id,
            classId: Number(cs.class_id), subjectId: Number(cs.subject_id), synced: true
          });
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Class-subject mappings sync failed:', err); }

  // ── 4a. Staff & Teacher Profiles (Full Pre-Cache for Offline Login) ────────
  try {
    const { data: staffData, error } = await supabase
      .from('report_profiles').select('*').eq('school_id', schoolId);

    if (!error && staffData) {
      const remoteIds = new Set(staffData.map(p => p.id));
      const localStaff = await db.profiles
        .where('schoolId').equals(schoolId)
        .toArray();

      // Remove local profiles no longer in remote (guard pending outbox inserts)
      for (const ls of localStaff) {
        if (!remoteIds.has(ls.id)) {
          const hasPendingInsert = await db.outbox
            .filter(o => o.table === 'report_profiles' && o.operation === 'insert' && o.payload.includes(ls.id))
            .first();
          if (!hasPendingInsert) await db.profiles.delete(ls.id);
        }
      }

      // Upsert with smart diff, preserving offline authentication password hashes and caching signatures
      for (const p of staffData) {
        const local = await db.profiles.get(p.id);
        const signatureUrlChanged = navigator.onLine && p.signature_url && p.signature_url !== local?.signatureUrl;
        let signatureBlob = local?.signature instanceof Blob ? local.signature : null;
        if (signatureUrlChanged) {
          const downloaded = await downloadImageAsBlob(p.signature_url).catch(() => null);
          signatureBlob = downloaded || signatureBlob;
        } else if (!p.signature_url) {
          signatureBlob = null;
        }

        const mapped = {
          id: p.id,
          schoolId: p.school_id,
          fullName: p.full_name,
          role: p.role,
          staffId: p.staff_id,
          email: p.email,
          signatureUrl: p.signature_url || null,
          signature: signatureBlob,
          passwordHash: local?.passwordHash || null,
          passwordSalt: local?.passwordSalt || null,
          lastLogin: local?.lastLogin || null
        };
        if (!local || hasChanged(local, mapped, ['fullName', 'role', 'staffId', 'email', 'signatureUrl']) || signatureUrlChanged) {
          await db.profiles.put(mapped);
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Staff profiles sync failed:', err); }

  // ── 4b. Teacher Assignments ──────────────────────────────────────────────────
  try {
    let query = supabase.from('report_teacher_assignments').select('*').eq('school_id', schoolId);
    if (user.role === 'teacher') query = query.eq('teacher_id', user.id);
    const { data: assignData, error } = await query;

    if (!error && assignData) {
      const remoteIds = new Set(assignData.map(a => a.id));
      const localAssigns = user.role === 'teacher'
        ? await db.teacherAssignments.where('teacherId').equals(user.id).toArray()
        : await db.teacherAssignments.toArray();

      // Remove stale local assignments
      for (const la of localAssigns) {
        if (la.supabaseId && !remoteIds.has(la.supabaseId)) await db.teacherAssignments.delete(la.id);
      }

      // Add/update with smart diff
      for (const a of assignData) {
        const local = localAssigns.find(la => la.supabaseId === a.id);
        const mapped = {
          supabaseId: a.id, schoolId: a.school_id, teacherId: a.teacher_id,
          classId: Number(a.class_id),
          subjectId: a.subject_id ? Number(a.subject_id) : null,
          termId: a.term_id ? Number(a.term_id) : null,
          synced: true
        };
        if (!local) {
          await db.teacherAssignments.put(mapped);
        } else if (hasChanged(local, mapped, ['teacherId', 'classId', 'subjectId', 'termId'])) {
          await db.teacherAssignments.update(local.id, mapped);
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Teacher assignments sync failed:', err); }

  // ── 5. Learners ──────────────────────────────────────────────────────────────
  try {
    const { data: rawRemoteLearners, error } = await supabase
      .from('report_learners').select('*').eq('school_id', schoolId);

    if (!error && rawRemoteLearners) {
      // 1. Deduplicate remote learners from Supabase (preventing cloud duplicate rows from oscillating local records)
      const remoteLearners = [];
      const remoteRegMap = new Map();
      const remoteNameClassMap = new Map();
      const duplicateRemoteIdsToDelete = [];

      for (const rl of rawRemoteLearners) {
        if (!rl || !rl.id) continue;
        const regKey = rl.reg_number ? String(rl.reg_number).trim().toUpperCase() : null;
        const nameClassKey = `${(rl.full_name || '').trim().toLowerCase()}_${rl.class_id || ''}`;

        if (regKey && remoteRegMap.has(regKey)) {
          // Already have a primary record for this reg_number
          duplicateRemoteIdsToDelete.push(rl.id);
          continue;
        }
        if (!regKey && nameClassKey && remoteNameClassMap.has(nameClassKey)) {
          duplicateRemoteIdsToDelete.push(rl.id);
          continue;
        }

        if (regKey) remoteRegMap.set(regKey, rl);
        if (nameClassKey) remoteNameClassMap.set(nameClassKey, rl);
        remoteLearners.push(rl);
      }

      // Asynchronously clean up ghost duplicate rows from Supabase if any exist
      if (duplicateRemoteIdsToDelete.length > 0) {
        console.warn(`[SyncDown] Found ${duplicateRemoteIdsToDelete.length} duplicate learner rows on Supabase. Purging duplicates...`);
        supabase.from('report_learners').delete().in('id', duplicateRemoteIdsToDelete).catch(() => null);
      }

      // Fetch all local learners for this school (type-safe check on string/number schoolId)
      const allLocal = await db.learners.filter(l => 
        String(l.schoolId) === String(schoolId) || String(l.school_id || '') === String(schoolId)
      ).toArray();

      const remoteSupabaseIds = new Set(remoteLearners.map(r => r.id));
      const remoteRegNumbers = new Set(remoteLearners.map(r => String(r.reg_number || '').trim().toUpperCase()).filter(Boolean));

      // Check if this client has any pending outbox inserts/updates for learners
      const pendingOutboxLearners = await db.outbox
        .filter(o => o.table === 'report_learners')
        .toArray();
      const pendingPayloads = pendingOutboxLearners.map(o => o.payload || '').join(' ');

      // 2. Local Self-Healing Deduplication pass:
      // Uses SEPARATE index maps for supabaseId and regNumber so that cross-key
      // collisions are caught. Without this fix, a record pulled from cloud (with
      // supabaseId → key "SUB_uuid") and the original locally-registered copy (no
      // supabaseId → key "REG_STU001") get different keys, both survive, and the
      // learner appears duplicated on screen.
      const localBySupaId = new Map();  // supabaseId  → record
      const localByReg    = new Map();  // regNumber   → record
      const localByKey    = new Map();  // legacy key  → record (kept for compat)
      const duplicateLocalsToDelete = [];

      for (const l of allLocal) {
        if (typeof l.id === 'string' || !l.id) {
          duplicateLocalsToDelete.push({ id: l.id, reason: 'invalid_id' });
          continue;
        }

        const lReg        = l.regNumber  ? String(l.regNumber).trim().toUpperCase() : null;
        const lSupabaseId = l.supabaseId ? String(l.supabaseId)                     : null;
        const lNameClass  = `${(l.fullName || '').trim().toLowerCase()}_${l.currentClassId || ''}`;
        const dedupKey    = lSupabaseId  ? `SUB_${lSupabaseId}` : (lReg ? `REG_${lReg}` : `NC_${lNameClass}`);

        // Cross-key collision: find any existing record that shares supabaseId OR regNumber,
        // even if it was previously indexed under a different key family.
        let collidingPrimary = null;
        if (lSupabaseId && localBySupaId.has(lSupabaseId)) {
          collidingPrimary = localBySupaId.get(lSupabaseId);
        }
        if (!collidingPrimary && lReg && localByReg.has(lReg)) {
          collidingPrimary = localByReg.get(lReg);
        }
        if (!collidingPrimary && localByKey.has(dedupKey)) {
          collidingPrimary = localByKey.get(dedupKey);
        }

        if (collidingPrimary) {
          // Determine which record is more authoritative
          const primaryScore = (collidingPrimary.supabaseId ? 10 : 0) + (collidingPrimary.photo ? 5 : 0) + (collidingPrimary.regNumber ? 2 : 0);
          const currentScore = (l.supabaseId               ? 10 : 0) + (l.photo               ? 5 : 0) + (l.regNumber               ? 2 : 0);

          if (currentScore > primaryScore) {
            duplicateLocalsToDelete.push({ primaryId: l.id, duplicateId: collidingPrimary.id, primaryRecord: l, duplicateRecord: collidingPrimary });
            // Promote current record to primary in all maps
            if (lSupabaseId) localBySupaId.set(lSupabaseId, l);
            if (lReg)        localByReg.set(lReg, l);
            localByKey.set(dedupKey, l);
          } else {
            duplicateLocalsToDelete.push({ primaryId: collidingPrimary.id, duplicateId: l.id, primaryRecord: collidingPrimary, duplicateRecord: l });
          }
        } else {
          // Register all of this record's unique identifiers
          if (lSupabaseId) localBySupaId.set(lSupabaseId, l);
          if (lReg)        localByReg.set(lReg, l);
          localByKey.set(dedupKey, l);
        }
      }

      // Merge and re-link scores/summaries for duplicate locals
      for (const item of duplicateLocalsToDelete) {
        if (item.duplicateId && item.primaryId) {
          console.log(`[SyncDown] Merging duplicate local learner ${item.duplicateRecord?.fullName} (${item.duplicateId} → ${item.primaryId})`);
          // Re-link scores
          const scoresToRelink = await db.scores.filter(s => String(s.learnerId) === String(item.duplicateId)).toArray();
          for (const sc of scoresToRelink) {
            await db.scores.update(sc.id, { learnerId: item.primaryId });
          }
          // Re-link report summaries
          const summariesToRelink = await db.reportSummaries.filter(sm => String(sm.learnerId) === String(item.duplicateId)).toArray();
          for (const sm of summariesToRelink) {
            await db.reportSummaries.update(sm.id, { learnerId: item.primaryId });
          }
          // Delete duplicate
          await db.learners.delete(item.duplicateId);
        } else if (item.id) {
          await db.learners.delete(item.id);
        }
      }

      // Refresh remaining local records after local deduplication
      const remainingLocal = await db.learners.filter(l => 
        String(l.schoolId) === String(schoolId) || String(l.school_id || '') === String(schoolId)
      ).toArray();

      // 3. Safe Cleanup pass — remove records that were explicitly deleted on cloud
      // NEVER delete records that are unsynced, pending outbox, or without supabaseId
      for (const l of remainingLocal) {
        const cleanReg = l.regNumber ? String(l.regNumber).trim().toUpperCase() : '';
        const isLocallyPending = pendingPayloads.includes(String(l.regNumber)) || 
                                 pendingPayloads.includes(String(l.fullName)) ||
                                 (l.supabaseId && pendingPayloads.includes(String(l.supabaseId)));

        const existsOnRemote = (l.supabaseId && remoteSupabaseIds.has(l.supabaseId)) || 
                               (cleanReg && remoteRegNumbers.has(cleanReg));

        // Only purge if record was previously synced to cloud (has supabaseId) AND is confirmed gone from remote AND is not pending
        if (!existsOnRemote && !isLocallyPending && l.supabaseId && l.synced) {
          console.log(`[SyncDown] Purging deleted learner from portal: ${l.fullName} (${l.regNumber || l.id})`);
          
          await db.scores
            .filter(s => String(s.learnerId) === String(l.id) || String(s.learnerId) === String(l.supabaseId))
            .delete();
          await db.reportSummaries
            .filter(s => String(s.learnerId) === String(l.id) || String(s.learnerId) === String(l.supabaseId))
            .delete();

          await db.learners.delete(l.id);
        }
      }

      // 4. Upsert pass — add new or update changed learners with full fields
      for (const rl of remoteLearners) {
        // Resurrection guard
        const isPendingDelete = await db.outbox
          .filter(o => o.table === 'report_learners' && o.operation === 'delete' &&
            (o.payload.includes(rl.id) || (rl.reg_number && o.payload.includes(rl.reg_number))))
          .first();
        const inlineDeletedQueue = JSON.parse(localStorage.getItem('pending_deleted_learners') || '[]');
        if (isPendingDelete || inlineDeletedQueue.includes(rl.id)) continue;

        const cleanRemoteReg = rl.reg_number ? String(rl.reg_number).trim().toUpperCase() : '';

        // Find local record: first by supabaseId, then by exact reg_number, then by normalized full_name + class_id
        let local = await db.learners.where('supabaseId').equals(rl.id).first();
        if (!local && cleanRemoteReg) {
          const byReg = await db.learners.filter(l => 
            l.regNumber && String(l.regNumber).trim().toUpperCase() === cleanRemoteReg &&
            (String(l.schoolId) === String(schoolId) || String(l.school_id || '') === String(schoolId))
          ).toArray();
          if (byReg.length > 0) {
            const nameMatch = byReg.find(
              l => l.fullName?.trim().toLowerCase() === rl.full_name?.trim().toLowerCase()
            );
            local = nameMatch || byReg[0];
          }
        }
        if (!local && rl.full_name) {
          const byName = await db.learners.filter(l =>
            l.fullName?.trim().toLowerCase() === rl.full_name?.trim().toLowerCase() &&
            (String(l.schoolId) === String(schoolId) || !l.schoolId)
          ).toArray();
          if (byName.length > 0) {
            local = byName.find(l => !l.supabaseId) || byName[0];
          }
        }

        const remoteFields = {
          schoolId: schoolId,
          regNumber: rl.reg_number || '',
          fullName: rl.full_name || '',
          gender: rl.gender || 'Male',
          ghanaianLanguage: rl.ghanaian_language || 'twi',
          currentClassId: rl.class_id ? Number(rl.class_id) : (local?.currentClassId || null),
          status: rl.status || 'Active',
          guardianName: rl.guardian_name || '',
          guardianRelation: rl.guardian_relation || '',
          guardianContact1: rl.guardian_contact_1 || rl.guardian_phone || '',
          guardianContact2: rl.guardian_contact_2 || '',
          guardianProfession: rl.guardian_profession || '',
          guardianLocation: rl.guardian_location || '',
          excludeFromPdf: !!rl.exclude_from_pdf,
          photoUrl: rl.photo_url || null,
          synced: true,
          supabaseId: rl.id,
          updatedAt: rl.updated_at || new Date().toISOString(),
          createdAt: rl.created_at || new Date().toISOString()
        };

        if (!local) {
          // New learner — download photo blob for offline caching
          let photoBlobCache = null;
          if (navigator.onLine && rl.photo_url) {
            photoBlobCache = await downloadImageAsBlob(rl.photo_url).catch(() => null);
          }
          await db.learners.add({
            ...remoteFields,
            photo: photoBlobCache
          });

        } else {
          // Existing learner — smart diff; re-download photo only if URL changed
          const fieldsChanged = hasChanged(local, remoteFields, [
            'regNumber', 'fullName', 'gender', 'ghanaianLanguage', 'currentClassId', 
            'status', 'guardianName', 'guardianRelation', 'guardianContact1', 'guardianContact2',
            'guardianProfession', 'guardianLocation', 'photoUrl', 'supabaseId', 'synced', 'excludeFromPdf'
          ]);
          const photoUrlChanged = navigator.onLine && rl.photo_url && rl.photo_url !== local.photoUrl;

          if (fieldsChanged || photoUrlChanged) {
            let photoBlobCache = local.photo instanceof Blob ? local.photo : null;
            if (photoUrlChanged) {
              const downloaded = await downloadImageAsBlob(rl.photo_url).catch(() => null);
              photoBlobCache = downloaded || (local.photo instanceof Blob ? local.photo : null);
            } else if (!rl.photo_url) {
              photoBlobCache = null;
            }
            await db.learners.update(local.id, { 
              ...remoteFields, 
              photo: photoBlobCache 
            });
          }
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Learners sync failed:', err); }

  // ── 6. Scores (Automated Data Pruning & Archiving) ───────────────────────────
  try {
    const school = await db.schools.get(schoolId);
    const currentYear = school?.currentAcademicYear;
    let allowedYears = [];
    let query = supabase.from('report_scores').select('*').eq('school_id', schoolId);
    
    if (currentYear) {
      allowedYears.push(currentYear);
      const parts = currentYear.split('/');
      if (parts.length === 2) {
        allowedYears.push(`${parseInt(parts[0]) - 1}/${parseInt(parts[1]) - 1}`);
      }
      query = query.in('academic_year', allowedYears);
    }

    const { data: cloudScores, error } = await query;

    if (cloudScores && !error) {
      for (const cs of cloudScores) {
        const existing = await db.scores
          .where('learnerId').equals(cs.learner_id)
          .filter(s =>
            s.classId === cs.class_id && s.subjectId === cs.subject_id &&
            s.term === cs.term && s.academicYear === cs.academic_year
          )
          .first();

        const entry = {
          learnerId: cs.learner_id, classId: cs.class_id, subjectId: cs.subject_id,
          caScores: cs.ca_scores || [], examScore: cs.exam_score !== null ? cs.exam_score : '',
          classScore: cs.class_score || 0, totalScore: cs.total_score || 0,
          grade: cs.grade || '', remark: cs.remark || '',
          isSubmitted: cs.is_submitted || false, termId: null,
          term: cs.term || '', academicYear: cs.academic_year || '',
          schoolId: cs.school_id, updatedAt: cs.updated_at,
          synced: true // Mark as synced since this came from the cloud
        };

        if (!existing) {
          await db.scores.add(entry);
        } else if (hasChanged(existing, entry, ['examScore', 'classScore', 'totalScore', 'grade', 'remark', 'isSubmitted', 'updatedAt', 'caScores'])) {
          // Only update if cloud is newer and no pending local edits in the outbox
          const hasPendingOutbox = await db.outbox
            .filter(o => o.table === 'report_scores' && (o.status === 'pending' || o.status === 'processing') &&
              o.payload.includes(cs.learner_id) && o.payload.includes(String(cs.class_id)) &&
              o.payload.includes(String(cs.subject_id)))
            .first();
          if (!hasPendingOutbox) {
            await db.scores.update(existing.id, entry);
          }
        }
      }

      // Prune local scores older than allowed years
      // SAFETY: Only prune if we have a valid currentYear AND allowedYears is populated,
      // and never delete scores that haven't been synced to the cloud yet.
      if (currentYear && currentYear.trim() !== '' && allowedYears.length > 0) {
        await db.scores
          .where('schoolId').equals(schoolId)
          .filter(s => !allowedYears.includes(s.academicYear) && s.synced !== false)
          .delete();
        console.log(`[SyncDown] Pruned local scores older than:`, allowedYears);
      }
    }
  } catch (err) { console.error('[SyncDown] Scores sync failed:', err); }

  // ── 6b. Report Summaries (Automated Data Pruning & Archiving) ────────────────
  try {
    const school = await db.schools.get(schoolId);
    const currentYear = school?.currentAcademicYear;
    let allowedYears = [];
    let query = supabase.from('report_summaries').select('*').eq('school_id', schoolId);
    
    if (currentYear) {
      allowedYears.push(currentYear);
      const parts = currentYear.split('/');
      if (parts.length === 2) {
        allowedYears.push(`${parseInt(parts[0]) - 1}/${parseInt(parts[1]) - 1}`);
      }
      query = query.in('academic_year', allowedYears);
    }

    const { data: cloudSummaries, error } = await query;

    if (cloudSummaries && !error) {
      for (const rs of cloudSummaries) {
        const existing = await db.reportSummaries
          .where('learnerId').equals(rs.learner_id)
          .filter(s => s.academicYear === rs.academic_year && s.term === rs.term)
          .first();

        const entry = {
          schoolId: rs.school_id,
          learnerId: rs.learner_id,
          classId: rs.class_id,
          academicYear: rs.academic_year,
          term: rs.term,
          attendancePresent: rs.attendance_present,
          attendanceTotal: rs.attendance_total,
          conduct: rs.conduct,
          attitude: rs.attitude,
          teacherRemark: rs.teacher_remark,
          headteacherRemark: rs.headteacher_remark,
          promotedTo: rs.promoted_to,
          nextTermBegins: rs.next_term_begins,
          feesOwed: rs.fees_owed,
          nextTermBill: rs.next_term_bill,
          isReleased: rs.is_released || false,
          classAverage: rs.class_average ?? null,
          classRank: rs.class_rank ?? null,
          totalGraded: rs.total_graded ?? 0,
          promotionStatus: rs.promotion_status || 'pending',
          synced: true,
          supabaseId: rs.id
        };

        if (!existing) {
          await db.reportSummaries.add(entry);
        } else if (hasChanged(existing, entry, [
          'attendancePresent', 'attendanceTotal', 'conduct', 'attitude',
          'teacherRemark', 'headteacherRemark', 'promotedTo', 'feesOwed',
          'nextTermBill', 'isReleased', 'classAverage', 'classRank',
          'promotionStatus', 'supabaseId', 'synced'
        ])) {
          await db.reportSummaries.update(existing.id, entry);
        }
      }

      // Prune local summaries older than allowed years
      // SAFETY: Only prune if we have a valid currentYear AND allowedYears is populated,
      // and never delete summaries that haven't been synced to the cloud yet.
      if (currentYear && currentYear.trim() !== '' && allowedYears.length > 0) {
        await db.reportSummaries
          .where('schoolId').equals(schoolId)
          .filter(s => !allowedYears.includes(s.academicYear) && s.synced !== false)
          .delete();
        console.log(`[SyncDown] Pruned local report summaries older than:`, allowedYears);
      }
    }
  } catch (err) { console.error('[SyncDown] Report summaries sync failed:', err); }

  // ── 7. Global Settings ───────────────────────────────────────────────────────
  try {
    const { data: settingsList, error } = await supabase
      .from('report_settings').select('*').eq('id', schoolId);
    const settingsData = settingsList?.[0];

    if (settingsData && !error) {
      const existing = await db.settings.get('global');
      const mapped = {
        id: 'global',
        caWeight: settingsData.ca_weight, examWeight: settingsData.exam_weight,
        caModel: settingsData.ca_model, caBestNCount: settingsData.ca_best_n || '',
        caBreakdown: settingsData.ca_breakdown || [], gradingScale: settingsData.grading_scale || []
      };
      if (!existing || hasChanged(existing, mapped, ['caWeight', 'examWeight', 'caModel', 'caBestNCount', 'caBreakdown', 'gradingScale'])) {
        await db.settings.put(mapped);
      }
    }
  } catch (err) { console.error('[SyncDown] Settings sync failed:', err); }

  // ── 8. Announcements ─────────────────────────────────────────────────────────
  try {
    const { data: annData, error } = await supabase
      .from('report_announcements').select('*').eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (!error && annData) {
      const existing = await db.announcements.where('schoolId').equals(schoolId).toArray();
      const existingIds = new Set(existing.map(a => a.supabaseId));
      const remoteIds = new Set(annData.map(a => a.id));

      // Remove deleted announcements
      for (const e of existing) {
        if (e.supabaseId && !remoteIds.has(e.supabaseId)) await db.announcements.delete(e.id);
      }
      // Add new announcements only
      for (const a of annData) {
        if (!existingIds.has(a.id)) {
          await db.announcements.add({
            title: a.title, content: a.content,
            schoolId: a.school_id, supabaseId: a.id,
            created_at: a.created_at, synced: true
          });
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Announcements sync failed:', err); }

  // ── 9. Payments ──────────────────────────────────────────────────────────────
  try {
    const { data: payData, error } = await supabase
      .from('report_payments').select('*').eq('school_id', schoolId);

    if (!error && payData) {
      const existing = await db.payments.where('schoolId').equals(schoolId).toArray();
      const remoteIds = new Set(payData.map(p => p.id));

      // Remove stale payments
      for (const e of existing) {
        if (e.supabaseId && !remoteIds.has(e.supabaseId)) await db.payments.delete(e.id);
      }
      // Add or update payments (matching unsynced local payments to avoid duplicates)
      for (const p of payData) {
        let local = existing.find(e => e.supabaseId === p.id);
        if (!local) {
          // Match unsynced local payment by details
          local = existing.find(e => 
            !e.supabaseId &&
            e.learnerId === p.learner_id &&
            Number(e.amount) === Number(p.amount) &&
            e.paymentDate === p.payment_date &&
            e.reference === p.reference
          );
        }

        if (!local) {
          await db.payments.add({
            schoolId: p.school_id, learnerId: p.learner_id, academicYear: p.academic_year,
            term: p.term, amount: p.amount, paymentDate: p.payment_date,
            paymentMethod: p.payment_method, reference: p.reference,
            supabaseId: p.id, synced: true
          });
        } else if (!local.supabaseId || !local.synced) {
          await db.payments.update(local.id, { supabaseId: p.id, synced: true });
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Payments sync failed:', err); }

  console.log('[SyncDown] Admin sync complete.');
}


// ─────────────────────────────────────────────────────────────────────────────
// PARENT PORTAL SYNC
// ─────────────────────────────────────────────────────────────────────────────

async function runParentSync({ parent, schoolId, activeSibling, siblings }) {
  if (!navigator.onLine || !parent?.phone_number || !schoolId || !activeSibling) return;
  console.log('[SyncDown] Parent sync start — school:', schoolId);

  // ── 1. School info ───────────────────────────────────────────────────────────
  try {
    const { data: remoteSchoolList, error } = await supabase
      .from('report_schools').select('*').eq('id', schoolId);
    const remoteSchool = remoteSchoolList?.[0];

    if (remoteSchool && !error) {
      const existing = await db.schools.get(schoolId);
      const remoteLogo = remoteSchool.logo_url;
      const isRemoteValid = remoteLogo && typeof remoteLogo === 'string' && !remoteLogo.startsWith('blob:');
      const isLocalValid = existing?.logoUrl && typeof existing.logoUrl === 'string' && !existing.logoUrl.startsWith('blob:');
      const finalLogoUrl = isRemoteValid ? remoteLogo : (isLocalValid ? existing.logoUrl : '');

      const mapped = {
        ...existing,
        id: schoolId,
        name: remoteSchool.name || existing?.name || '',
        location: remoteSchool.location || existing?.location || '',
        district: remoteSchool.district || existing?.district || '',
        region: remoteSchool.region || existing?.region || '',
        circuit: remoteSchool.circuit || existing?.circuit || '',
        motto: remoteSchool.motto || existing?.motto || '',
        schoolType: remoteSchool.school_type || remoteSchool.schoolType || existing?.schoolType || 'private',
        logoUrl: finalLogoUrl,
        currentAcademicYear: remoteSchool.current_academic_year || existing?.currentAcademicYear || '',
        currentTerm: remoteSchool.current_term || existing?.currentTerm || 'Term 1',
        vacationDate: remoteSchool.vacation_date || existing?.vacationDate || '',
        nextTermBegins: remoteSchool.next_term_begins || existing?.nextTermBegins || '',
        phone: remoteSchool.phone || existing?.phone || '',
        email: remoteSchool.email || existing?.email || ''
      };
      if (!existing || hasChanged(existing, mapped, ['name', 'schoolType', 'currentAcademicYear', 'currentTerm', 'vacationDate', 'nextTermBegins', 'motto', 'logoUrl'])) {
        await db.schools.put(mapped);
      }
    }
  } catch (err) { console.error('[SyncDown] Parent school sync failed:', err); }

  // ── 2. Settings ──────────────────────────────────────────────────────────────
  try {
    const { data: settingsList, error } = await supabase
      .from('report_settings').select('*').eq('id', schoolId);
    const settingsData = settingsList?.[0];

    if (settingsData && !error) {
      const existing = await db.settings.get(schoolId);
      const mapped = {
        id: schoolId, caWeight: settingsData.ca_weight, examWeight: settingsData.exam_weight,
        caModel: settingsData.ca_model, caBestNCount: settingsData.ca_best_n || '',
        caBreakdown: settingsData.ca_breakdown || [], gradingScale: settingsData.grading_scale || []
      };
      if (!existing || hasChanged(existing, mapped, ['caWeight', 'examWeight', 'caModel', 'caBestNCount', 'caBreakdown', 'gradingScale'])) {
        await db.settings.put(mapped);
      }
    }
  } catch (err) { console.error('[SyncDown] Parent settings sync failed:', err); }

  // ── 3. Classes ───────────────────────────────────────────────────────────────
  try {
    const { data: remoteClasses, error } = await supabase
      .from('report_classes').select('*').eq('school_id', schoolId);

    if (remoteClasses && !error) {
      const existing = await db.classes.where('schoolId').equals(schoolId).toArray();
      const existingById = new Map(existing.map(e => [e.id, e]));
      const remoteIds = new Set(remoteClasses.map(rc => rc.id));

      // Remove stale classes
      for (const e of existing) {
        if (!remoteIds.has(e.id)) await db.classes.delete(e.id);
      }
      // Add/update with smart diff
      for (const rc of remoteClasses) {
        const local = existingById.get(rc.id);
        const mapped = { id: rc.id, schoolId: rc.school_id, name: rc.name, teachingMode: rc.teaching_mode, createdAt: rc.created_at };
        if (!local) await db.classes.put(mapped);
        else if (hasChanged(local, mapped, ['name', 'teachingMode'])) {
          await db.classes.update(rc.id, { name: rc.name, teachingMode: rc.teaching_mode });
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Parent classes sync failed:', err); }

  // ── 4. Subjects ──────────────────────────────────────────────────────────────
  try {
    const { data: remoteSubjects, error } = await supabase
      .from('report_subjects').select('*').eq('school_id', schoolId);

    if (remoteSubjects && !error) {
      for (const rs of remoteSubjects) {
        const local = await db.subjects.get(rs.id);
        if (!local) await db.subjects.put({ id: rs.id, schoolId: rs.school_id, name: rs.name, createdAt: rs.created_at });
        else if (local.name !== rs.name) await db.subjects.update(rs.id, { name: rs.name });
      }
    }
  } catch (err) { console.error('[SyncDown] Parent subjects sync failed:', err); }

  // ── 5. Class-Subject Mappings ────────────────────────────────────────────────
  try {
    const { data: classSubsData, error } = await supabase
      .from('report_class_subjects').select('*').eq('school_id', schoolId);

    if (classSubsData && !error) {
      const existing = await db.classSubjects.where('schoolId').equals(schoolId).toArray();
      const existingIds = new Set(existing.map(e => e.supabaseId));
      const remoteIds = new Set(classSubsData.map(cs => cs.id));

      for (const e of existing) {
        if (e.supabaseId && !remoteIds.has(e.supabaseId)) await db.classSubjects.delete(e.id);
      }
      for (const cs of classSubsData) {
        if (!existingIds.has(cs.id)) {
          await db.classSubjects.put({
            supabaseId: cs.id, schoolId: cs.school_id,
            classId: Number(cs.class_id), subjectId: Number(cs.subject_id), synced: true
          });
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Parent class-subjects sync failed:', err); }

  // ── 5b. Learners (via secure RPC) ─────────────────────────────────────────────
  try {
    const { data: remoteLearners, error } = await supabase
      .rpc('get_learners_by_guardian_contact', { p_contact: parent.phone_number });

    if (remoteLearners && !error) {
      for (const rl of remoteLearners) {
        let local = await db.learners.where('supabaseId').equals(rl.id).first();
        if (!local && rl.reg_number) {
          local = await db.learners.where('regNumber').equals(rl.reg_number).first();
        }

        const entry = {
          schoolId: rl.school_id,
          regNumber: rl.reg_number,
          fullName: rl.full_name,
          gender: rl.gender,
          currentClassId: rl.class_id,
          photoUrl: rl.photo_url,
          guardianName: rl.guardian_name,
          guardianRelation: rl.guardian_relation,
          guardianContact1: rl.guardian_contact_1,
          guardianContact2: rl.guardian_contact_2,
          guardianProfession: rl.guardian_profession,
          guardianLocation: rl.guardian_location,
          supabaseId: rl.id,
          synced: true,
          status: 'Active'
        };

        if (!local) {
          await db.learners.add(entry);
        } else if (hasChanged(local, entry, ['fullName', 'currentClassId', 'photoUrl', 'guardianName', 'guardianContact1', 'guardianContact2'])) {
          await db.learners.update(local.id, entry);
        }
      }
    } else if (error) {
      console.error('[SyncDown] Parent learners RPC failed:', error);
    }
  } catch (err) { console.error('[SyncDown] Parent learners sync failed:', err); }

  // ── 6. Report Summaries (via secure RPC) ────────────────────────────────────
  try {
    const { data: remoteSummaries, error } = await supabase
      .rpc('get_summaries_by_guardian_contact', { p_contact: parent.phone_number });

    if (remoteSummaries && !error) {
      for (const rs of remoteSummaries) {
        const allLocalSummaries = await db.reportSummaries.toArray();
        const existing = allLocalSummaries.find(s =>
          (s.supabaseId === rs.id || s.learnerId === rs.learner_id || String(s.learnerId) === String(rs.learner_id)) &&
          String(s.academicYear || '').trim().toLowerCase() === String(rs.academic_year || '').trim().toLowerCase() &&
          String(s.term || '').trim().toLowerCase() === String(rs.term || '').trim().toLowerCase()
        );

        const entry = {
          schoolId: rs.school_id, learnerId: rs.learner_id, classId: rs.class_id,
          academicYear: rs.academic_year, term: rs.term,
          attendancePresent: rs.attendance_present, attendanceTotal: rs.attendance_total,
          conduct: rs.conduct, attitude: rs.attitude,
          teacherRemark: rs.teacher_remark, headteacherRemark: rs.headteacher_remark,
          promotedTo: rs.promoted_to, nextTermBegins: rs.next_term_begins,
          feesOwed: rs.fees_owed, nextTermBill: rs.next_term_bill,
          isReleased: rs.is_released || false,
          classAverage: rs.class_average ?? null, classRank: rs.class_rank ?? null,
          totalGraded: rs.total_graded ?? 0, synced: true, supabaseId: rs.id
        };

        if (!existing) {
          await db.reportSummaries.add(entry);
        } else if (hasChanged(existing, entry, [
          'attendancePresent', 'attendanceTotal', 'conduct', 'attitude',
          'teacherRemark', 'headteacherRemark', 'promotedTo', 'feesOwed',
          'nextTermBill', 'isReleased', 'classAverage', 'classRank',
          'supabaseId', 'synced'
        ])) {
          await db.reportSummaries.update(existing.id, entry);
        }
      }
    } else if (error) {
      console.error('[SyncDown] Parent summaries RPC failed:', error);
    }
  } catch (err) { console.error('[SyncDown] Parent summaries sync failed:', err); }

  // ── 7. Scores (via secure RPC) ───────────────────────────────────────────────
  try {
    const { data: remoteScores, error } = await supabase
      .rpc('get_scores_by_guardian_contact', { p_contact: parent.phone_number });

    if (remoteScores && !error) {
      for (const cs of remoteScores) {
        const existing = await db.scores
          .where('learnerId').equals(cs.learner_id)
          .filter(s =>
            s.classId === cs.class_id && s.subjectId === cs.subject_id &&
            s.term === cs.term && s.academicYear === cs.academic_year
          )
          .first();

        const entry = {
          learnerId: cs.learner_id, schoolId: cs.school_id, classId: cs.class_id, subjectId: cs.subject_id,
          caScores: cs.ca_scores || [], examScore: cs.exam_score || '',
          classScore: cs.class_score || 0, totalScore: cs.total_score || 0,
          grade: cs.grade || '', remark: cs.remark || '',
          isSubmitted: cs.is_submitted || false, termId: null,
          term: cs.term || '', academicYear: cs.academic_year || '',
          updatedAt: cs.updated_at
        };

        if (!existing) {
          await db.scores.add(entry);
        } else if (hasChanged(existing, entry, ['examScore', 'classScore', 'totalScore', 'grade', 'remark', 'isSubmitted', 'updatedAt', 'caScores'])) {
          await db.scores.update(existing.id, entry);
        }
      }
    } else if (error) {
      console.error('[SyncDown] Parent scores RPC failed:', error);
    }
  } catch (err) { console.error('[SyncDown] Parent scores sync failed:', err); }

  // ── 8. Announcements ─────────────────────────────────────────────────────────
  try {
    const { data: annData, error } = await supabase
      .from('report_announcements').select('*').eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (!error && annData) {
      const existing = await db.announcements.where('schoolId').equals(schoolId).toArray();
      const existingIds = new Set(existing.map(a => a.supabaseId));
      const remoteIds = new Set(annData.map(a => a.id));

      for (const e of existing) {
        if (e.supabaseId && !remoteIds.has(e.supabaseId)) await db.announcements.delete(e.id);
      }
      for (const a of annData) {
        if (!existingIds.has(a.id)) {
          await db.announcements.add({
            title: a.title, content: a.content, schoolId: a.school_id,
            supabaseId: a.id, created_at: a.created_at, synced: true
          });
        }
      }
    }
  } catch (err) { console.error('[SyncDown] Parent announcements sync failed:', err); }

  // ── 9. Payments (via secure RPC) ─────────────────────────────────────────────
  try {
    const { data: remotePayments, error } = await supabase
      .rpc('get_payments_by_guardian_contact', { p_contact: parent.phone_number });

    if (remotePayments && !error) {
      // Build index of all existing local payments
      const allExisting = await db.payments.toArray();
      const existingIds = new Set(allExisting.map(p => p.supabaseId));
      const remoteIds = new Set(remotePayments.map(rp => rp.id));

      // Remove local payments no longer in remote (scoped to siblings only)
      const siblingSupabaseIds = new Set(
        (siblings || []).map(s => s.supabaseId || s.id || String(s.id))
      );
      for (const e of allExisting) {
        if (e.supabaseId && !remoteIds.has(e.supabaseId) && siblingSupabaseIds.has(e.learnerId)) {
          await db.payments.delete(e.id);
        }
      }

      // Add or update payments
      for (const rp of remotePayments) {
        const entry = {
          schoolId: rp.school_id, learnerId: rp.learner_id, academicYear: rp.academic_year,
          term: rp.term, amount: rp.amount, paymentDate: rp.payment_date,
          paymentMethod: rp.payment_method, reference: rp.reference,
          supabaseId: rp.id, synced: true
        };

        if (existingIds.has(rp.id)) {
          const local = allExisting.find(e => e.supabaseId === rp.id);
          if (local && hasChanged(local, entry, ['amount', 'paymentDate', 'paymentMethod', 'reference'])) {
            await db.payments.update(local.id, entry);
          }
        } else {
          await db.payments.add(entry);
        }
      }
    } else if (error) {
      console.error('[SyncDown] Parent payments RPC failed:', error);
    }
  } catch (err) { console.error('[SyncDown] Parent payments sync failed:', err); }

  console.log('[SyncDown] Parent sync complete.');
}


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts smart background pull sync for the Admin / Teacher portal.
 *
 * Behaviour:
 *  - Runs immediately (if online)
 *  - Re-runs the moment the browser reports it is back online
 *  - Polls every 5 minutes silently in the background
 *  - Does nothing when offline (silent, no errors)
 *  - Only writes to Dexie when the cloud data has actually changed
 *
 * @param {object} user - The authenticated user object from AuthContext
 * @returns {function} cleanup - Call this in your useEffect return to stop sync
 *
 * @example
 * useEffect(() => {
 *   return startAdminSync(user);
 * }, [user]);
 */
export function startAdminSync(user) {
  if (!user?.schoolId) return () => {};

  // Immediate sync on mount
  runAdminSync(user);

  // Immediate sync whenever network is restored
  const onOnline = () => {
    console.log('[SyncDown] Network restored — triggering admin sync...');
    runAdminSync(user);
  };
  window.addEventListener('online', onOnline);

  // Instant sync when returning to tab
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('[SyncDown] Tab focused — triggering instant sync refresh...');
      runAdminSync(user);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Silent background poll
  const intervalId = setInterval(() => {
    if (navigator.onLine) runAdminSync(user);
  }, POLL_INTERVAL_MS);

  // Cleanup — removes event listeners and stops polling when component unmounts
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(intervalId);
  };
}

/**
 * Starts smart background pull sync for the Parent Portal.
 *
 * The context object must be passed fresh on every useEffect run because it
 * contains reactive values (schoolId, activeSibling, siblings).
 *
 * @param {{ parent, schoolId, activeSibling, siblings }} ctx
 * @returns {function} cleanup - Call this in your useEffect return to stop sync
 *
 * @example
 * useEffect(() => {
 *   return startParentSync({ parent, schoolId, activeSibling, siblings });
 * }, [schoolId, activeSibling?.id]);
 */
export function startParentSync(ctx) {
  if (!ctx?.schoolId || !ctx?.activeSibling) return () => {};

  // Immediate sync on mount / context change
  runParentSync(ctx);

  // Immediate sync on network restoration — capture the latest ctx in closure
  const onOnline = () => {
    console.log('[SyncDown] Network restored — triggering parent sync...');
    runParentSync(ctx);
  };
  window.addEventListener('online', onOnline);

  // Silent background poll
  const intervalId = setInterval(() => {
    if (navigator.onLine) runParentSync(ctx);
  }, POLL_INTERVAL_MS);

  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(intervalId);
  };
}
