import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { enqueueSync } from './syncEngine';

/**
 * Service to manage soft-deleted entities, recovery snapshots, and auto-purge in Recycle Bin.
 */
class RecycleBinService {
  /**
   * Move an entity snapshot to the Recycle Bin.
   * @param {Object} params
   * @param {string} params.schoolId
   * @param {'learner'|'teacher'|'class'|'subject'} params.entityType
   * @param {string} params.entityId
   * @param {string} params.entityName
   * @param {Object} params.dataPayload - Full JSON snapshot including relations (scores, etc.)
   * @param {Object} params.user - Current active user object
   */
  async moveToRecycleBin({ schoolId, entityType, entityId, entityName, dataPayload, user }) {
    try {
      const deletedBy = user?.fullName || user?.email || 'Administrator';
      const deletedByRole = user?.role || 'super_admin';
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days retention

      const record = {
        schoolId,
        entityType,
        entityId: String(entityId),
        entityName: entityName || `Unnamed ${entityType}`,
        dataPayload,
        deletedBy,
        deletedByRole,
        deletedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        synced: false
      };

      // 1. Save to local Dexie store
      const localId = await db.recycleBin.add(record);

      // 2. Direct Cloud Insert or Queue Sync
      if (navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from('recycle_bin')
            .insert([{
              school_id: schoolId,
              entity_type: entityType,
              entity_id: String(entityId),
              entity_name: record.entityName,
              data_payload: dataPayload,
              deleted_by: deletedBy,
              deleted_by_role: deletedByRole,
              deleted_at: record.deletedAt,
              expires_at: record.expiresAt
            }])
            .select('id')
            .maybeSingle();

          if (!error && data?.id) {
            await db.recycleBin.update(localId, {
              supabaseId: data.id,
              synced: true
            });
          } else {
            // Queue to outbox
            await enqueueSync('insert', 'recycle_bin', {
              school_id: schoolId,
              entity_type: entityType,
              entity_id: String(entityId),
              entity_name: record.entityName,
              data_payload: dataPayload,
              deleted_by: deletedBy,
              deleted_by_role: deletedByRole,
              deleted_at: record.deletedAt,
              expires_at: record.expiresAt
            }, schoolId);
          }
        } catch (cloudErr) {
          console.warn('[RecycleBin] Cloud save error, enqueuing sync:', cloudErr);
          await enqueueSync('insert', 'recycle_bin', {
            school_id: schoolId,
            entity_type: entityType,
            entity_id: String(entityId),
            entity_name: record.entityName,
            data_payload: dataPayload,
            deleted_by: deletedBy,
            deleted_by_role: deletedByRole,
            deleted_at: record.deletedAt,
            expires_at: record.expiresAt
          }, schoolId);
        }
      } else {
        await enqueueSync('insert', 'recycle_bin', {
          school_id: schoolId,
          entity_type: entityType,
          entity_id: String(entityId),
          entity_name: record.entityName,
          data_payload: dataPayload,
          deleted_by: deletedBy,
          deleted_by_role: deletedByRole,
          deleted_at: record.deletedAt,
          expires_at: record.expiresAt
        }, schoolId);
      }

      return { success: true, localId };
    } catch (err) {
      console.error('[RecycleBin] Failed to move item to recycle bin:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch all recycle bin items for a given school (both local Dexie and Cloud sync).
   * @param {string} schoolId
   */
  async getRecycleBinItems(schoolId) {
    if (!schoolId) return [];

    try {
      // Sync latest from Supabase if online
      if (navigator.onLine) {
        const { data: cloudItems, error } = await supabase
          .from('recycle_bin')
          .select('*')
          .eq('school_id', schoolId)
          .order('deleted_at', { ascending: false });

        if (!error && Array.isArray(cloudItems)) {
          // Merge / update local Dexie cache
          for (const item of cloudItems) {
            const existing = await db.recycleBin
              .filter(r => r.supabaseId === item.id || (r.schoolId === schoolId && r.entityId === item.entity_id && r.entityType === item.entity_type))
              .first();

            if (existing) {
              await db.recycleBin.update(existing.id, {
                supabaseId: item.id,
                entityName: item.entity_name,
                dataPayload: item.data_payload,
                deletedBy: item.deleted_by,
                deletedByRole: item.deleted_by_role,
                deletedAt: item.deleted_at,
                expiresAt: item.expires_at,
                synced: true
              });
            } else {
              await db.recycleBin.add({
                schoolId: item.school_id,
                entityType: item.entity_type,
                entityId: item.entity_id,
                entityName: item.entity_name,
                dataPayload: item.data_payload,
                deletedBy: item.deleted_by,
                deletedByRole: item.deleted_by_role,
                deletedAt: item.deleted_at,
                expiresAt: item.expires_at,
                supabaseId: item.id,
                synced: true
              });
            }
          }
        }
      }

      // Return items from Dexie, sorted newest-first
      // NOTE: .reverse() before .sortBy() is a no-op in Dexie (sortBy does a JS-side sort
      // that ignores cursor direction). Use toArray() + manual sort instead.
      const localRecords = await db.recycleBin
        .where('schoolId')
        .equals(schoolId)
        .toArray();
      localRecords.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

      return localRecords;
    } catch (err) {
      console.error('[RecycleBin] Error fetching items:', err);
      return await db.recycleBin.where('schoolId').equals(schoolId).toArray();
    }
  }

  /**
   * Restore an entity from the Recycle Bin back to active database tables.
   * @param {Object} item - The recycle bin item record
   * @param {Object} user - The user requesting restoration
   */
  async restoreFromRecycleBin(item, user) {
    if (!item || !item.dataPayload) {
      return { success: false, error: 'Invalid recycle bin item payload.' };
    }

    const { entityType, dataPayload, schoolId } = item;

    try {
      if (entityType === 'learner') {
        const { learner, scores = [], summaries = [] } = dataPayload;
        if (!learner) throw new Error('Learner data payload is missing profile.');

        // 1. Re-insert Learner into Dexie
        const cleanLearner = { ...learner };
        delete cleanLearner.id; // Allow auto-increment ID
        cleanLearner.synced = false;
        cleanLearner.schoolId = schoolId;
        const newLocalLearnerId = await db.learners.add(cleanLearner);

        // Re-insert into Supabase
        if (navigator.onLine) {
          const cloudLearnerPayload = {
            school_id: schoolId,
            full_name: learner.fullName,
            reg_number: learner.regNumber,
            class_id: learner.currentClassId,  // correct Supabase column name
            gender: learner.gender || null,
            ghanaian_language: learner.ghanaianLanguage || 'twi',
            guardian_name: learner.guardianName || null,
            guardian_contact_1: learner.guardianContact1 || learner.guardianPhone || null,
            guardian_contact_2: learner.guardianContact2 || null,
            guardian_profession: learner.guardianProfession || null,
            guardian_location: learner.guardianLocation || null,
            exclude_from_pdf: !!learner.excludeFromPdf,
            status: learner.status || 'Active',
            photo_url: learner.photoUrl || null
          };

          const { data: insertedLearner, error: lErr } = await supabase
            .from('report_learners')
            .insert([cloudLearnerPayload])
            .select('id')
            .single();

          if (!lErr && insertedLearner) {
            await db.learners.update(newLocalLearnerId, {
              supabaseId: insertedLearner.id,
              synced: true
            });

            // Restore scores
            if (scores.length > 0) {
              const cloudScores = scores.map(s => ({
                school_id: schoolId,
                learner_id: insertedLearner.id,
                class_id: s.classId || s.class_id,
                subject_id: s.subjectId || s.subject_id,
                term_id: s.termId || s.term_id,
                academic_year: s.academicYear || s.academic_year,
                term: s.term,
                class_score: s.classScore || s.class_score || 0,
                exam_score: s.examScore || s.exam_score || 0,
                total_score: s.totalScore || s.total_score || 0,
                grade: s.grade || '',
                remarks: s.remarks || '',
                is_submitted: s.isSubmitted ?? true
              }));
              await supabase.from('report_scores').insert(cloudScores).catch(console.warn);
            }

            // Restore summaries
            if (summaries.length > 0) {
              const cloudSummaries = summaries.map(sm => ({
                school_id: schoolId,
                learner_id: insertedLearner.id,
                class_id: sm.classId || sm.class_id,
                academic_year: sm.academicYear || sm.academic_year,
                term: sm.term,
                conduct: sm.conduct || '',
                attitude: sm.attitude || '',
                interest: sm.interest || '',
                teacher_remarks: sm.teacherRemarks || sm.teacher_remarks || '',
                headteacher_remarks: sm.headteacherRemarks || sm.headteacher_remarks || '',
                attendance: sm.attendance || null,
                total_attendance: sm.totalAttendance || sm.total_attendance || null,
                promotion_status: sm.promotionStatus || sm.promotion_status || null,
                is_released: sm.isReleased ?? false
              }));
              await supabase.from('report_summaries').insert(cloudSummaries).catch(console.warn);
            }
          }
        } else {
          // Enqueue restoration for offline sync
          await enqueueSync('insert', 'report_learners', {
            school_id: schoolId,
            full_name: learner.fullName,
            reg_number: learner.regNumber,
            current_class_id: learner.currentClassId,
            status: learner.status || 'Active'
          }, schoolId);
        }

        // Restore Dexie scores and summaries
        if (scores.length > 0) {
          for (const s of scores) {
            const sc = { ...s, learnerId: newLocalLearnerId, schoolId };
            delete sc.id;
            await db.scores.add(sc);
          }
        }
        if (summaries.length > 0) {
          for (const sm of summaries) {
            const smy = { ...sm, learnerId: newLocalLearnerId, schoolId };
            delete smy.id;
            await db.reportSummaries.add(smy);
          }
        }
      } else if (entityType === 'teacher') {
        const { profile, assignments = [] } = dataPayload;
        if (!profile) throw new Error('Teacher profile data is missing.');

        // Recreate in Dexie
        await db.profiles.put(profile);

        // Recreate assignments
        if (assignments.length > 0) {
          for (const a of assignments) {
            await db.teacherAssignments.put(a);
            await enqueueSync('insert', 'report_teacher_assignments', {
              id: a.id,
              teacher_id: a.teacherId,
              class_id: a.classId,
              subject_id: a.subjectId,
              term_id: a.termId,
              school_id: schoolId
            }, schoolId);
          }
        }
      } else if (entityType === 'class') {
        const { classObj } = dataPayload;
        if (classObj) {
          const cleanClass = { ...classObj };
          delete cleanClass.id;
          await db.classes.add(cleanClass);
        }
      } else if (entityType === 'subject') {
        const { subjectObj } = dataPayload;
        if (subjectObj) {
          const cleanSub = { ...subjectObj };
          delete cleanSub.id;
          await db.subjects.add(cleanSub);
        }
      }

      // Remove from Recycle Bin
      await this.permanentlyDelete(item);

      return { success: true };
    } catch (err) {
      console.error('[RecycleBin] Error restoring item:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Permanently delete a record from the recycle bin.
   * @param {Object} item - The recycle bin item record
   */
  async permanentlyDelete(item) {
    try {
      if (item.id) {
        await db.recycleBin.delete(item.id);
      }

      const cloudId = item.supabaseId || item.id;
      if (navigator.onLine && cloudId && typeof cloudId === 'string' && cloudId.length > 20) {
        await supabase.from('recycle_bin').delete().eq('id', cloudId).catch(console.warn);
      }

      if (cloudId) {
        await enqueueSync('delete', 'recycle_bin', {
          filter: { id: cloudId }
        }, item.schoolId);
      }

      return { success: true };
    } catch (err) {
      console.error('[RecycleBin] Error permanently deleting item:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Empty all items from the recycle bin for a school.
   * @param {string} schoolId
   */
  async emptyRecycleBin(schoolId) {
    try {
      await db.recycleBin.where('schoolId').equals(schoolId).delete();

      if (navigator.onLine && schoolId) {
        await supabase.from('recycle_bin').delete().eq('school_id', schoolId).catch(console.warn);
      }

      return { success: true };
    } catch (err) {
      console.error('[RecycleBin] Error emptying recycle bin:', err);
      return { success: false, error: err.message };
    }
  }
}

export const recycleBinService = new RecycleBinService();
export default recycleBinService;
