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
      const mapped = {
        id: schoolId, name: remoteSchool.name || '', location: remoteSchool.location || '',
        district: remoteSchool.district || '', region: remoteSchool.region || '',
        circuit: remoteSchool.circuit || '', motto: remoteSchool.motto || '',
        logoUrl: remoteSchool.logo_url || '',
        currentAcademicYear: remoteSchool.current_academic_year || '',
        currentTerm: remoteSchool.current_term || 'Term 1',
        vacationDate: remoteSchool.vacation_date || '',
        nextTermBegins: remoteSchool.next_term_begins || '',
        phone: remoteSchool.phone || '', email: remoteSchool.email || ''
      };
      if (!existing || hasChanged(existing, mapped, ['name', 'currentAcademicYear', 'currentTerm', 'vacationDate', 'nextTermBegins', 'motto', 'logoUrl', 'district', 'region', 'circuit', 'phone', 'email'])) {
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
      const existingIds = new Set(existing.map(e => e.supabaseId));
      const remoteIds = new Set(classSubsData.map(cs => cs.id));

      // Remove mappings no longer in remote
      for (const e of existing) {
        if (e.supabaseId && !remoteIds.has(e.supabaseId)) await db.classSubjects.delete(e.id);
      }
      // Add new mappings
      for (const cs of classSubsData) {
        if (!existingIds.has(cs.id)) {
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
    const { data: remoteLearners, error } = await supabase
      .from('report_learners').select('*').eq('school_id', schoolId);

    if (!error && remoteLearners) {
      const allLocal = await db.learners.where('schoolId').equals(schoolId).toArray();
      const remoteSupabaseIds = new Set(remoteLearners.map(r => r.id));
      const seenSupabaseIds = new Set();
      const seenRegNumbers = new Set();

      // Sort so synced (supabaseId) records come first, preserving them during dedup
      const sortedLocal = [...allLocal].sort((a, b) =>
        (a.supabaseId && !b.supabaseId ? -1 : !a.supabaseId && b.supabaseId ? 1 : 0)
      );

      // Cleanup pass — remove stale and duplicate local records
      for (const l of sortedLocal) {
        if (typeof l.id === 'string' || !l.id) { await db.learners.delete(l.id); continue; }

        // Purge records whose supabase ID is no longer in remote (hard-deleted elsewhere)
        if (l.supabaseId && !remoteSupabaseIds.has(l.supabaseId) && l.synced) {
          console.log(`[SyncDown] Purging stale learner: ${l.fullName} (${l.regNumber})`);
          await db.learners.delete(l.id);
          continue;
        }

        let isDuplicate = false;
        if (l.supabaseId) { if (seenSupabaseIds.has(l.supabaseId)) isDuplicate = true; else seenSupabaseIds.add(l.supabaseId); }
        if (l.regNumber) { if (seenRegNumbers.has(l.regNumber)) isDuplicate = true; else seenRegNumbers.add(l.regNumber); }
        if (isDuplicate) { await db.learners.delete(l.id); continue; }
      }

      // Upsert pass — add new or update changed learners only
      for (const rl of remoteLearners) {
        // Resurrection guard
        const isPendingDelete = await db.outbox
          .filter(o => o.table === 'report_learners' && o.operation === 'delete' &&
            (o.payload.includes(rl.id) || (rl.reg_number && o.payload.includes(rl.reg_number))))
          .first();
        const inlineDeletedQueue = JSON.parse(localStorage.getItem('pending_deleted_learners') || '[]');
        if (isPendingDelete || inlineDeletedQueue.includes(rl.id)) continue;

        // Find local record
        let local = await db.learners.where('supabaseId').equals(rl.id).first();
        if (!local && rl.reg_number) {
          const byReg = await db.learners.where('regNumber').equals(rl.reg_number).toArray();
          if (byReg.length > 0) {
            const nameMatch = byReg.find(
              l => l.fullName?.trim().toLowerCase() === rl.full_name?.trim().toLowerCase()
            );
            local = nameMatch || byReg.find(l => !l.supabaseId) || null;
          }
        }

        if (!local) {
          // New learner — download photo blob for offline caching
          let photoBlobCache = null;
          if (navigator.onLine && rl.photo_url) {
            photoBlobCache = await downloadImageAsBlob(rl.photo_url).catch(() => null);
          }
          await db.learners.add({
            schoolId: rl.school_id, regNumber: rl.reg_number, fullName: rl.full_name,
            gender: rl.gender, currentClassId: rl.class_id,
            photo: photoBlobCache, photoUrl: rl.photo_url, synced: true, supabaseId: rl.id,
            excludeFromPdf: rl.exclude_from_pdf || false
          });

        } else {
          // Existing learner — smart diff; re-download photo only if URL changed
          const remoteFields = {
            regNumber: rl.reg_number, fullName: rl.full_name, gender: rl.gender,
            currentClassId: rl.class_id, photoUrl: rl.photo_url, synced: true, supabaseId: rl.id,
            excludeFromPdf: rl.exclude_from_pdf || false
          };
          const fieldsChanged = hasChanged(local, remoteFields, ['regNumber', 'fullName', 'gender', 'currentClassId', 'photoUrl', 'supabaseId', 'synced', 'excludeFromPdf']);
          const photoUrlChanged = navigator.onLine && rl.photo_url && rl.photo_url !== local.photoUrl;
          if (fieldsChanged || photoUrlChanged) {
            let photoBlobCache = local.photo instanceof Blob ? local.photo : null;
            if (photoUrlChanged) {
              const downloaded = await downloadImageAsBlob(rl.photo_url).catch(() => null);
              photoBlobCache = downloaded || (local.photo instanceof Blob ? local.photo : null);
            } else if (!rl.photo_url) {
              photoBlobCache = null;
            } else {
              photoBlobCache = local.photo instanceof Blob ? local.photo : null;
            }
            await db.learners.update(local.id, { ...remoteFields, photo: photoBlobCache });
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
      const mapped = {
        id: schoolId, name: remoteSchool.name || '', location: remoteSchool.location || '',
        district: remoteSchool.district || '', region: remoteSchool.region || '',
        circuit: remoteSchool.circuit || '', motto: remoteSchool.motto || '',
        logoUrl: remoteSchool.logo_url || '',
        currentAcademicYear: remoteSchool.current_academic_year || '',
        currentTerm: remoteSchool.current_term || 'Term 1',
        vacationDate: remoteSchool.vacation_date || '',
        nextTermBegins: remoteSchool.next_term_begins || '',
        phone: remoteSchool.phone || '', email: remoteSchool.email || ''
      };
      if (!existing || hasChanged(existing, mapped, ['name', 'currentAcademicYear', 'currentTerm', 'vacationDate', 'nextTermBegins', 'motto', 'logoUrl'])) {
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

  // ── 6. Report Summaries (via secure RPC) ────────────────────────────────────
  try {
    const { data: remoteSummaries, error } = await supabase
      .rpc('get_summaries_by_guardian_contact', { p_contact: parent.phone_number });

    if (remoteSummaries && !error) {
      for (const rs of remoteSummaries) {
        const existing = await db.reportSummaries
          .where('learnerId').equals(rs.learner_id)
          .filter(s => s.academicYear === rs.academic_year && s.term === rs.term)
          .first();

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
          learnerId: cs.learner_id, classId: cs.class_id, subjectId: cs.subject_id,
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

      // Add new payments
      for (const rp of remotePayments) {
        if (!existingIds.has(rp.id)) {
          await db.payments.add({
            schoolId: rp.school_id, learnerId: rp.learner_id, academicYear: rp.academic_year,
            term: rp.term, amount: rp.amount, paymentDate: rp.payment_date,
            paymentMethod: rp.payment_method, reference: rp.reference,
            supabaseId: rp.id, synced: true
          });
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

  // Silent background poll
  const intervalId = setInterval(() => {
    if (navigator.onLine) runAdminSync(user);
  }, POLL_INTERVAL_MS);

  // Cleanup — removes event listener and stops polling when component unmounts
  return () => {
    window.removeEventListener('online', onOnline);
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
