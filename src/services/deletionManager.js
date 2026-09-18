/**
 * deletionManager.js — High-Efficiency Centralized Deletion Pipeline
 *
 * Provides atomic, cascade-safe deletion across all entities (classes, teachers,
 * subjects, learners, assignments, class-subjects).
 *
 * Features:
 *  1. Immediate snapshot to Recycle Bin for 1-click recovery.
 *  2. Atomic local Dexie transaction (<5ms) to prevent UI tearing.
 *  3. Outbox sanitization to cancel stale pending insert/update operations.
 *  4. Fast O(1) ResurrectionGuard registration to prevent sync races.
 *  5. Direct parallelized Supabase cascade delete (online) + safe bottom-up outbox queue (offline/online).
 */

import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { enqueueSync } from './syncEngine';
import { resurrectionGuard } from './resurrectionGuard';
import recycleBinService from './recycleBinService';

class DeletionManager {
  /**
   * Helper to prune obsolete outbox items matching specific criteria.
   * @param {string[]} tables
   * @param {string[]} identifierSubstrings
   */
  async _pruneOutbox(tables, identifierSubstrings) {
    try {
      const cleanSubstrings = identifierSubstrings.filter(Boolean).map(String);
      if (cleanSubstrings.length === 0) return;

      const outboxItems = await db.outbox.toArray();
      const idsToDelete = [];

      for (const item of outboxItems) {
        if (!tables.includes(item.table)) continue;
        const payloadStr = item.payload || '';

        // If this outbox mutation creates or updates the entity being deleted, prune it!
        const matches = cleanSubstrings.some(sub => payloadStr.includes(sub));
        if (matches) {
          idsToDelete.push(item.id);
        }
      }

      if (idsToDelete.length > 0) {
        await db.outbox.bulkDelete(idsToDelete);
        console.log(`[DeletionManager] 🧹 Pruned ${idsToDelete.length} obsolete outbox items for deleted entity.`);
      }
    } catch (err) {
      console.warn('[DeletionManager] Outbox pruning warning:', err);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. CLASS DELETION
  // ───────────────────────────────────────────────────────────────────────────
  async deleteClass(schoolId, classId, user) {
    if (!schoolId || !classId) throw new Error('Missing schoolId or classId');
    const classIdNum = Number(classId);
    const classIdStr = String(classId);

    console.log(`[DeletionManager] 🗑️ Initiating high-efficiency deletion for Class ID: ${classId}`);

    // 1. Register in ResurrectionGuard immediately
    resurrectionGuard.markDeleted('class', classId, isNaN(classIdNum) ? null : classIdNum);

    // 2. Fetch snapshot of class and all child relations
    const classObj = await db.classes.get(classId) || (!isNaN(classIdNum) ? await db.classes.get(classIdNum) : null);
    const relatedClassSubjects = await db.classSubjects
      .where('schoolId').equals(schoolId)
      .filter(cs => String(cs.classId) === classIdStr || (!isNaN(classIdNum) && Number(cs.classId) === classIdNum))
      .toArray();

    const relatedAssignments = await db.teacherAssignments
      .where('schoolId').equals(schoolId)
      .filter(a => String(a.classId) === classIdStr || (!isNaN(classIdNum) && Number(a.classId) === classIdNum))
      .toArray();

    // 3. Move snapshot to Recycle Bin (for 30-day restore)
    try {
      await recycleBinService.moveToRecycleBin({
        schoolId,
        entityType: 'class',
        entityId: classIdStr,
        entityName: classObj?.name || `Class ${classId}`,
        dataPayload: {
          classObj,
          classSubjects: relatedClassSubjects,
          assignments: relatedAssignments
        },
        user
      });
    } catch (recErr) {
      console.warn('[DeletionManager] RecycleBin snapshot warning:', recErr);
    }

    // 4. Prune pending outbox mutations that reference this class
    await this._pruneOutbox(
      ['report_classes', 'report_class_subjects', 'report_teacher_assignments'],
      [classIdStr, `"${classIdNum}"`, `:${classIdNum}`, `:${classIdStr}`]
    );

    // 5. Atomic Local Dexie Transaction
    await db.transaction('rw', [db.classes, db.classSubjects, db.teacherAssignments, db.learners], async () => {
      // Delete class
      await db.classes.delete(classId);
      if (!isNaN(classIdNum)) await db.classes.delete(classIdNum);

      // Delete child class-subjects
      for (const cs of relatedClassSubjects) {
        await db.classSubjects.delete(cs.id);
        resurrectionGuard.markDeleted('class_subject', cs.id, cs.supabaseId);
      }

      // Delete child teacher assignments
      for (const a of relatedAssignments) {
        await db.teacherAssignments.delete(a.id);
        resurrectionGuard.markDeleted('assignment', a.id, a.supabaseId);
      }

      // Unlink learners in this class locally
      const learnersInClass = await db.learners
        .where('schoolId').equals(schoolId)
        .filter(l => String(l.currentClassId) === classIdStr || (!isNaN(classIdNum) && Number(l.currentClassId) === classIdNum))
        .toArray();
      for (const l of learnersInClass) {
        await db.learners.update(l.id, { currentClassId: null, synced: false });
      }
    });

    // 6. Direct Cloud Cascade Deletion (if Online)
    if (navigator.onLine) {
      try {
        const cloudClassId = isNaN(classIdNum) ? classIdStr : classIdNum;
        await Promise.allSettled([
          // Unlink learners in Supabase
          supabase.from('report_learners').update({ class_id: null }).eq('class_id', cloudClassId).eq('school_id', schoolId),
          // Delete class-subject mappings
          supabase.from('report_class_subjects').delete().eq('class_id', cloudClassId).eq('school_id', schoolId),
          // Delete teacher assignments
          supabase.from('report_teacher_assignments').delete().eq('class_id', cloudClassId).eq('school_id', schoolId)
        ]);
        // Delete parent class row
        await supabase.from('report_classes').delete().eq('id', cloudClassId).eq('school_id', schoolId);
      } catch (cloudErr) {
        console.warn('[DeletionManager] Direct cloud delete notice (will fallback to outbox):', cloudErr);
      }
    }

    // 7. Enqueue Safe Bottom-Up Cascade Outbox Mutations
    const cloudClassId = isNaN(classIdNum) ? classIdStr : classIdNum;
    await enqueueSync('delete', 'report_class_subjects', {
      filter: { class_id: cloudClassId, school_id: schoolId }
    }, schoolId);

    await enqueueSync('delete', 'report_teacher_assignments', {
      filter: { class_id: cloudClassId, school_id: schoolId }
    }, schoolId);

    await enqueueSync('delete', 'report_classes', {
      filter: { id: cloudClassId, school_id: schoolId }
    }, schoolId);

    console.log(`[DeletionManager] ✅ Class ${classId} deleted cleanly and cascade-synced.`);
    return { success: true };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TEACHER DELETION
  // ───────────────────────────────────────────────────────────────────────────
  async deleteTeacher(schoolId, teacherId, user) {
    if (!schoolId || !teacherId) throw new Error('Missing schoolId or teacherId');
    const teacherIdStr = String(teacherId);

    console.log(`[DeletionManager] 🗑️ Initiating high-efficiency deletion for Teacher ID: ${teacherId}`);

    // 1. Register in ResurrectionGuard immediately
    resurrectionGuard.markDeleted('teacher', teacherIdStr);
    resurrectionGuard.markDeleted('profile', teacherIdStr);

    // 2. Fetch snapshot
    const teacherObj = await db.profiles.get(teacherId) || await db.profiles.get(teacherIdStr);
    const relatedAssignments = await db.teacherAssignments
      .where('schoolId').equals(schoolId)
      .filter(a => String(a.teacherId) === teacherIdStr)
      .toArray();

    // 3. Move snapshot to Recycle Bin
    try {
      await recycleBinService.moveToRecycleBin({
        schoolId,
        entityType: 'teacher',
        entityId: teacherIdStr,
        entityName: teacherObj?.fullName || 'Teacher',
        dataPayload: {
          profile: teacherObj,
          assignments: relatedAssignments
        },
        user
      });
    } catch (recErr) {
      console.warn('[DeletionManager] RecycleBin snapshot warning:', recErr);
    }

    // 4. Prune outbox
    await this._pruneOutbox(
      ['report_profiles', 'report_teacher_assignments'],
      [teacherIdStr, teacherObj?.email].filter(Boolean)
    );

    // 5. Atomic Local Dexie Transaction
    await db.transaction('rw', [db.profiles, db.teacherAssignments], async () => {
      await db.profiles.delete(teacherId);
      await db.profiles.delete(teacherIdStr);

      for (const a of relatedAssignments) {
        await db.teacherAssignments.delete(a.id);
        resurrectionGuard.markDeleted('assignment', a.id, a.supabaseId);
      }
    });

    // 6. Direct Cloud Cascade Deletion (if Online)
    if (navigator.onLine) {
      try {
        await supabase.from('report_teacher_assignments').delete().eq('teacher_id', teacherIdStr).eq('school_id', schoolId);
        await supabase.from('report_profiles').delete().eq('id', teacherIdStr).eq('school_id', schoolId);
      } catch (cloudErr) {
        console.warn('[DeletionManager] Direct cloud delete notice (will fallback to outbox):', cloudErr);
      }
    }

    // 7. Enqueue Safe Bottom-Up Cascade Outbox Mutations
    await enqueueSync('delete', 'report_teacher_assignments', {
      filter: { teacher_id: teacherIdStr, school_id: schoolId }
    }, schoolId);

    await enqueueSync('delete', 'report_profiles', {
      filter: { id: teacherIdStr, school_id: schoolId }
    }, schoolId);

    console.log(`[DeletionManager] ✅ Teacher ${teacherId} deleted cleanly and cascade-synced.`);
    return { success: true };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. SUBJECT DELETION
  // ───────────────────────────────────────────────────────────────────────────
  async deleteSubject(schoolId, subjectId, user) {
    if (!schoolId || !subjectId) throw new Error('Missing schoolId or subjectId');
    const subjectIdNum = Number(subjectId);
    const subjectIdStr = String(subjectId);

    console.log(`[DeletionManager] 🗑️ Initiating high-efficiency deletion for Subject ID: ${subjectId}`);

    // 1. Register in ResurrectionGuard immediately
    resurrectionGuard.markDeleted('subject', subjectId, isNaN(subjectIdNum) ? null : subjectIdNum);

    // 2. Fetch snapshot
    const subjectObj = await db.subjects.get(subjectId) || (!isNaN(subjectIdNum) ? await db.subjects.get(subjectIdNum) : null);
    const relatedClassSubjects = await db.classSubjects
      .where('schoolId').equals(schoolId)
      .filter(cs => String(cs.subjectId) === subjectIdStr || (!isNaN(subjectIdNum) && Number(cs.subjectId) === subjectIdNum))
      .toArray();

    const relatedAssignments = await db.teacherAssignments
      .where('schoolId').equals(schoolId)
      .filter(a => String(a.subjectId) === subjectIdStr || (!isNaN(subjectIdNum) && Number(a.subjectId) === subjectIdNum))
      .toArray();

    // 3. Move snapshot to Recycle Bin
    try {
      await recycleBinService.moveToRecycleBin({
        schoolId,
        entityType: 'subject',
        entityId: subjectIdStr,
        entityName: subjectObj?.name || `Subject ${subjectId}`,
        dataPayload: {
          subjectObj,
          classSubjects: relatedClassSubjects,
          assignments: relatedAssignments
        },
        user
      });
    } catch (recErr) {
      console.warn('[DeletionManager] RecycleBin snapshot warning:', recErr);
    }

    // 4. Prune outbox
    await this._pruneOutbox(
      ['report_subjects', 'report_class_subjects', 'report_teacher_assignments'],
      [subjectIdStr, `"${subjectIdNum}"`, `:${subjectIdNum}`, `:${subjectIdStr}`]
    );

    // 5. Atomic Local Dexie Transaction
    await db.transaction('rw', [db.subjects, db.classSubjects, db.teacherAssignments], async () => {
      await db.subjects.delete(subjectId);
      if (!isNaN(subjectIdNum)) await db.subjects.delete(subjectIdNum);

      for (const cs of relatedClassSubjects) {
        await db.classSubjects.delete(cs.id);
        resurrectionGuard.markDeleted('class_subject', cs.id, cs.supabaseId);
      }

      for (const a of relatedAssignments) {
        await db.teacherAssignments.delete(a.id);
        resurrectionGuard.markDeleted('assignment', a.id, a.supabaseId);
      }
    });

    // 6. Direct Cloud Cascade Deletion (if Online)
    if (navigator.onLine) {
      try {
        const cloudSubId = isNaN(subjectIdNum) ? subjectIdStr : subjectIdNum;
        await Promise.allSettled([
          supabase.from('report_class_subjects').delete().eq('subject_id', cloudSubId).eq('school_id', schoolId),
          supabase.from('report_teacher_assignments').delete().eq('subject_id', cloudSubId).eq('school_id', schoolId)
        ]);
        await supabase.from('report_subjects').delete().eq('id', cloudSubId).eq('school_id', schoolId);
      } catch (cloudErr) {
        console.warn('[DeletionManager] Direct cloud delete notice (will fallback to outbox):', cloudErr);
      }
    }

    // 7. Enqueue Safe Bottom-Up Cascade Outbox Mutations
    const cloudSubId = isNaN(subjectIdNum) ? subjectIdStr : subjectIdNum;
    await enqueueSync('delete', 'report_class_subjects', {
      filter: { subject_id: cloudSubId, school_id: schoolId }
    }, schoolId);

    await enqueueSync('delete', 'report_teacher_assignments', {
      filter: { subject_id: cloudSubId, school_id: schoolId }
    }, schoolId);

    await enqueueSync('delete', 'report_subjects', {
      filter: { id: cloudSubId, school_id: schoolId }
    }, schoolId);

    console.log(`[DeletionManager] ✅ Subject ${subjectId} deleted cleanly and cascade-synced.`);
    return { success: true };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. TEACHER ASSIGNMENT DELETION
  // ───────────────────────────────────────────────────────────────────────────
  async deleteTeacherAssignment(schoolId, assignment) {
    if (!assignment) return;
    const aId = assignment.id;
    const supId = assignment.supabaseId;

    resurrectionGuard.markDeleted('assignment', aId, supId);

    await this._pruneOutbox(['report_teacher_assignments'], [String(aId), String(supId)].filter(Boolean));

    await db.teacherAssignments.delete(aId);

    if (navigator.onLine && supId) {
      supabase.from('report_teacher_assignments').delete().eq('id', supId).catch(() => null);
    }

    if (supId) {
      await enqueueSync('delete', 'report_teacher_assignments', {
        filter: { id: supId, school_id: schoolId }
      }, schoolId);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. CLASS-SUBJECT MAPPING DELETION
  // ───────────────────────────────────────────────────────────────────────────
  async deleteClassSubject(schoolId, classSubject) {
    if (!classSubject) return;
    const csId = classSubject.id;
    const supId = classSubject.supabaseId;

    resurrectionGuard.markDeleted('class_subject', csId, supId);

    await this._pruneOutbox(['report_class_subjects'], [String(csId), String(supId)].filter(Boolean));

    await db.classSubjects.delete(csId);

    if (navigator.onLine && supId) {
      supabase.from('report_class_subjects').delete().eq('id', supId).catch(() => null);
    }

    if (supId) {
      await enqueueSync('delete', 'report_class_subjects', {
        filter: { id: supId, school_id: schoolId }
      }, schoolId);
    }
  }
}

export const deletionManager = new DeletionManager();
export default deletionManager;
