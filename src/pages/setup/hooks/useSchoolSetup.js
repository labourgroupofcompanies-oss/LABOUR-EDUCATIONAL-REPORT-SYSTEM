import { useState, useEffect } from 'react';
import { db } from '../../../lib/db';
import { supabase } from '../../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../store/AuthContext';
import { enqueueSync } from '../../../services/syncEngine';
import { deletionManager } from '../../../services/deletionManager';
import { resurrectionGuard } from '../../../services/resurrectionGuard';

export const useSchoolSetup = () => {
  const [className, setClassName] = useState('');
  const [teachingMode, setTeachingMode] = useState('class_teacher');
  const [classCategory, setClassCategory] = useState('basic 1-3');
  const [subjectName, setSubjectName] = useState('');
  const [selectedSetupClass, setSelectedSetupClass] = useState('');
  const { user } = useAuth();

  const classes = useLiveQuery(() => user?.schoolId ? db.classes.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const subjects = useLiveQuery(() => user?.schoolId ? db.subjects.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const classSubjects = useLiveQuery(() => user?.schoolId ? db.classSubjects.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const teachers = useLiveQuery(() => user?.schoolId ? db.profiles.where('schoolId').equals(user.schoolId).and(p => p.role?.toLowerCase().trim() === 'teacher').toArray() : [], [user]);
  const allAssignments = useLiveQuery(() => user?.schoolId ? db.teacherAssignments.where('schoolId').equals(user.schoolId).toArray() : [], [user]);

  // ── Automatic Database Pulling (Self-Healing) ──────────────────────
  useEffect(() => {
    const pullSetupData = async () => {
      if (!navigator.onLine || !user?.schoolId) return;
      console.log('Syncing setup data via custom hooks with resilient sync...');
      
      // 1. Pull & Reconcile Classes
      try {
        const { data: remoteClasses, error: classErr } = await supabase
          .from('report_classes')
          .select('*')
          .eq('school_id', user.schoolId);

        if (!classErr && remoteClasses) {
          const localClasses = await db.classes.where('schoolId').equals(user.schoolId).toArray();
          const remoteIds = new Set(remoteClasses.map(rc => rc.id));
          const remoteNames = new Set(remoteClasses.map(rc => rc.name?.toLowerCase().trim()));

          // Purge local classes that no longer exist remotely or are marked deleted
          for (const lc of localClasses) {
            if (resurrectionGuard.isDeleted('class', lc.id, lc.name)) {
              await db.classes.delete(lc.id);
              continue;
            }
            if (!remoteIds.has(lc.id) && !remoteNames.has(lc.name?.toLowerCase().trim())) {
              const hasPendingInsert = await db.outbox
                .filter(o => o.table === 'report_classes' && o.operation === 'insert' && (o.payload.includes(String(lc.name)) || o.payload.includes(String(lc.id))))
                .first();
              if (!hasPendingInsert) {
                await db.classes.delete(lc.id);
              }
            }
          }
          
          for (const rc of remoteClasses) {
            if (resurrectionGuard.isDeleted('class', rc.id, rc.name)) {
              continue;
            }

            // Find if there is a local class with the same name (case-insensitive, trimmed)
            const localByName = localClasses.find(c => c.name.toLowerCase().trim() === rc.name.toLowerCase().trim());
            
            if (localByName) {
              if (localByName.id !== rc.id) {
                const oldId = localByName.id;
                const newId = rc.id;
                console.log(`[Setup Sync] Reconciling duplicate Class name: "${rc.name}" (Old ID: ${oldId} -> New ID: ${newId})`);
                
                // Update related local records referencing the old class ID strictly for THIS school
                const relatedLearners = await db.learners
                  .where('currentClassId').equals(oldId)
                  .filter(l => String(l.schoolId) === String(user.schoolId) || String(l.school_id || '') === String(user.schoolId))
                  .toArray();
                for (const l of relatedLearners) {
                  await db.learners.update(l.id, { currentClassId: newId, synced: false });
                }

                const relatedScores = await db.scores
                  .where('classId').equals(oldId)
                  .filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId))
                  .toArray();
                for (const s of relatedScores) {
                  await db.scores.update(s.id, { classId: newId });
                }

                const relatedAssigns = await db.teacherAssignments
                  .where('classId').equals(oldId)
                  .filter(a => String(a.schoolId) === String(user.schoolId) || String(a.school_id || '') === String(user.schoolId))
                  .toArray();
                for (const a of relatedAssigns) {
                  await db.teacherAssignments.update(a.id, { classId: newId });
                }

                // Delete old local record and put the correct one
                await db.classes.delete(oldId);
                await db.classes.put({
                  id: newId,
                  schoolId: rc.school_id,
                  name: rc.name,
                  teachingMode: rc.teaching_mode,
                  category: rc.category,
                  createdAt: rc.created_at
                });
              } else {
                if (localByName.name !== rc.name || localByName.teachingMode !== rc.teaching_mode || localByName.category !== rc.category) {
                  await db.classes.update(rc.id, { name: rc.name, teachingMode: rc.teaching_mode, category: rc.category });
                }
              }
            } else {
              const localById = await db.classes.get(rc.id);
              if (!localById) {
                await db.classes.put({
                  id: rc.id,
                  schoolId: rc.school_id,
                  name: rc.name,
                  teachingMode: rc.teaching_mode,
                  category: rc.category,
                  createdAt: rc.created_at
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Setup Sync] Classes sync failed:', err);
      }

      // 2. Pull & Reconcile Subjects
      try {
        const { data: remoteSubjects, error: subErr } = await supabase
          .from('report_subjects')
          .select('*')
          .eq('school_id', user.schoolId);

        if (!subErr && remoteSubjects) {
          const localSubjects = await db.subjects.where('schoolId').equals(user.schoolId).toArray();
          const remoteIds = new Set(remoteSubjects.map(rs => rs.id));
          const remoteNames = new Set(remoteSubjects.map(rs => rs.name?.toLowerCase().trim()));

          // Purge local subjects that no longer exist remotely or are marked deleted
          for (const ls of localSubjects) {
            if (resurrectionGuard.isDeleted('subject', ls.id, ls.name)) {
              await db.subjects.delete(ls.id);
              continue;
            }
            if (!remoteIds.has(ls.id) && !remoteNames.has(ls.name?.toLowerCase().trim())) {
              const hasPendingInsert = await db.outbox
                .filter(o => o.table === 'report_subjects' && o.operation === 'insert' && (o.payload.includes(String(ls.name)) || o.payload.includes(String(ls.id))))
                .first();
              if (!hasPendingInsert) {
                await db.subjects.delete(ls.id);
              }
            }
          }
          
          for (const rs of remoteSubjects) {
            if (resurrectionGuard.isDeleted('subject', rs.id, rs.name)) {
              continue;
            }

            // Find if there is a local subject with the same name (case-insensitive, trimmed)
            const localByName = localSubjects.find(s => s.name.toLowerCase().trim() === rs.name.toLowerCase().trim());
            
            if (localByName) {
              if (localByName.id !== rs.id) {
                const oldId = localByName.id;
                const newId = rs.id;
                console.log(`[Setup Sync] Reconciling duplicate Subject name: "${rs.name}" (Old ID: ${oldId} -> New ID: ${newId})`);
                
                // Update related local records referencing the old subject ID
                const relatedScores = await db.scores.where('subjectId').equals(oldId).toArray();
                for (const s of relatedScores) {
                  await db.scores.update(s.id, { subjectId: newId });
                }

                const relatedAssigns = await db.teacherAssignments.where('subjectId').equals(oldId).toArray();
                for (const a of relatedAssigns) {
                  await db.teacherAssignments.update(a.id, { subjectId: newId });
                }

                // Rewrite any pending outbox payloads that still reference the old subject ID
                try {
                  const allOutbox = await db.outbox.toArray();
                  let rewriteCount = 0;
                  const oldIdStr = String(oldId);
                  const newIdStr = String(newId);
                  for (const outboxItem of allOutbox) {
                    if (outboxItem.payload && outboxItem.payload.includes(oldIdStr)) {
                      const updatedPayload = outboxItem.payload.replaceAll(`"subject_id":${oldIdStr}`, `"subject_id":${newIdStr}`);
                      if (updatedPayload !== outboxItem.payload) {
                        await db.outbox.update(outboxItem.id, {
                          payload: updatedPayload,
                          status: 'pending',
                          retryCount: 0,
                          errorMessage: null,
                          nextAttemptAt: null,
                        });
                        rewriteCount++;
                      }
                    }
                  }
                  if (rewriteCount > 0) {
                    console.log(`[Setup Sync] ✅ Rewrote ${rewriteCount} outbox item(s) referencing old subject ID ${oldId} → ${newId}`);
                  }
                } catch (outboxErr) {
                  console.warn('[Setup Sync] Failed to rewrite outbox payloads for subject ID remap:', outboxErr);
                }

                // Delete old duplicate name subject and insert new correct one
                await db.subjects.delete(oldId);
                await db.subjects.put({
                  id: newId,
                  schoolId: rs.school_id,
                  name: rs.name,
                  createdAt: rs.created_at
                });
              } else {
                if (localByName.name !== rs.name) {
                  await db.subjects.update(rs.id, { name: rs.name });
                }
              }
            } else {
              const localById = await db.subjects.get(rs.id);
              if (!localById) {
                await db.subjects.put({
                  id: rs.id,
                  schoolId: rs.school_id,
                  name: rs.name,
                  createdAt: rs.created_at
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Setup Sync] Subjects sync failed:', err);
      }

      // 3. Pull Class-Subject Assignments
      try {
        const { data: classSubsData, error: classSubsErr } = await supabase
          .from('report_class_subjects')
          .select('*')
          .eq('school_id', user.schoolId);

        if (!classSubsErr && classSubsData) {
          const remoteMap = new Set(classSubsData.map(cs => `${Number(cs.class_id)}-${Number(cs.subject_id)}`));
          const localClassSubs = await db.classSubjects.where('schoolId').equals(user.schoolId).toArray();

          // Delete local records for this school that no longer exist remotely or are marked deleted
          for (const lcs of localClassSubs) {
            const key = `${Number(lcs.classId)}-${Number(lcs.subjectId)}`;
            if (resurrectionGuard.isDeleted('class_subject', lcs.id, lcs.supabaseId) ||
                resurrectionGuard.isDeleted('class', lcs.classId) ||
                resurrectionGuard.isDeleted('subject', lcs.subjectId)) {
              await db.classSubjects.delete(lcs.id);
              continue;
            }
            if (!remoteMap.has(key)) {
              const pendingInsert = await db.outbox
                .filter(o => o.table === 'report_class_subjects' && o.operation === 'insert' && o.payload.includes(String(lcs.classId)) && o.payload.includes(String(lcs.subjectId)))
                .first();
              if (!pendingInsert) {
                await db.classSubjects.delete(lcs.id);
              }
            }
          }

          // Insert or update remote class-subject assignments
          for (const cs of classSubsData) {
            if (resurrectionGuard.isDeleted('class_subject', cs.id) ||
                resurrectionGuard.isDeleted('class', cs.class_id) ||
                resurrectionGuard.isDeleted('subject', cs.subject_id)) {
              continue;
            }

            const cId = Number(cs.class_id);
            const sId = Number(cs.subject_id);
            const existing = await db.classSubjects
              .where('schoolId').equals(cs.school_id)
              .filter(lcs => Number(lcs.classId) === cId && Number(lcs.subjectId) === sId)
              .first();

            if (existing) {
              await db.classSubjects.update(existing.id, {
                supabaseId: cs.id,
                synced: true
              });
            } else {
              await db.classSubjects.add({
                supabaseId: cs.id,
                schoolId: cs.school_id,
                classId: cId,
                subjectId: sId,
                synced: true
              });
            }
          }
        }
      } catch (err) {
        console.error('[Setup Sync] Class-Subject assignments sync failed:', err);
      }

      // 4. Pull Teachers
      try {
        const { data: teachersData, error: teachErr } = await supabase
          .from('report_profiles')
          .select('*')
          .eq('school_id', user.schoolId)
          .ilike('role', 'teacher');
        if (teachErr) throw teachErr;
        if (teachersData) {
          const remoteIds = new Set(teachersData.map(p => p.id));
          
          // Get all local teachers for this school
          const localTeachers = await db.profiles
            .where('schoolId').equals(user.schoolId)
            .and(p => p.role?.toLowerCase().trim() === 'teacher')
            .toArray();
            
          // Delete any local teacher that is not in the remote list or is marked deleted
          for (const lt of localTeachers) {
            if (resurrectionGuard.isDeleted('teacher', lt.id) || resurrectionGuard.isDeleted('profile', lt.id)) {
              await db.profiles.delete(lt.id);
              continue;
            }
            if (!remoteIds.has(lt.id)) {
              const hasPendingInsert = await db.outbox
                .filter(o => o.table === 'report_profiles' && o.operation === 'insert' && o.payload.includes(lt.id))
                .first();
              if (!hasPendingInsert) {
                await db.profiles.delete(lt.id);
              } else {
                console.log(`[Setup Sync] Protecting unsynced local teacher ${lt.fullName} from deletion (pending insert in outbox).`);
              }
            }
          }

          // Save/Update remote active profiles
          for (const p of teachersData) {
            if (resurrectionGuard.isDeleted('teacher', p.id) || resurrectionGuard.isDeleted('profile', p.id)) {
              continue;
            }

            await db.profiles.put({
              id: p.id,
              schoolId: p.school_id,
              fullName: p.full_name,
              role: p.role,
              staffId: p.staff_id,
              email: p.email
            });
          }
        }
      } catch (err) {
        console.error('[Setup Sync] Teachers sync failed:', err);
      }

      // 5. Pull Teacher Assignments
      try {
        const { data: assignData, error: assignErr } = await supabase
          .from('report_teacher_assignments')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!assignErr && assignData) {
          const remoteIds = new Set(assignData.map(a => a.id));
          const localAssigns = await db.teacherAssignments
            .where('schoolId').equals(user.schoolId)
            .toArray();

          for (const la of localAssigns) {
            if (resurrectionGuard.isDeleted('assignment', la.id, la.supabaseId) ||
                resurrectionGuard.isDeleted('teacher', la.teacherId) ||
                resurrectionGuard.isDeleted('class', la.classId) ||
                resurrectionGuard.isDeleted('subject', la.subjectId)) {
              await db.teacherAssignments.delete(la.id);
              continue;
            }
            if (la.supabaseId && !remoteIds.has(la.supabaseId)) {
              await db.teacherAssignments.delete(la.id);
            }
          }

          for (const a of assignData) {
            if (resurrectionGuard.isDeleted('assignment', a.id) ||
                resurrectionGuard.isDeleted('teacher', a.teacher_id) ||
                resurrectionGuard.isDeleted('class', a.class_id) ||
                resurrectionGuard.isDeleted('subject', a.subject_id)) {
              continue;
            }

            const existing = localAssigns.find(la => la.supabaseId === a.id);
            const mapped = {
              supabaseId: a.id,
              schoolId: a.school_id,
              teacherId: a.teacher_id,
              classId: Number(a.class_id),
              subjectId: a.subject_id ? Number(a.subject_id) : null,
              termId: a.term_id ? Number(a.term_id) : null,
              synced: true
            };
            if (existing) {
              await db.teacherAssignments.update(existing.id, mapped);
            } else {
              await db.teacherAssignments.add(mapped);
            }
          }
        }
      } catch (err) {
        console.error('[Setup Sync] Teacher assignments sync failed:', err);
      }
    };

    const syncOfflineDeletions = async () => {
      if (navigator.onLine) {
        const csQueue = JSON.parse(localStorage.getItem('pending_deleted_class_subjects') || '[]');
        if (csQueue.length > 0) {
          try {
            const { error } = await supabase.from('report_class_subjects').delete().in('id', csQueue);
            if (!error) {
              localStorage.removeItem('pending_deleted_class_subjects');
            }
          } catch (err) {
            console.error('Failed to sync offline class-subject deletions:', err);
          }
        }

        const taQueue = JSON.parse(localStorage.getItem('pending_deleted_assignments') || '[]');
        if (taQueue.length > 0) {
          try {
            const { error } = await supabase.from('report_teacher_assignments').delete().in('id', taQueue);
            if (!error) {
              localStorage.removeItem('pending_deleted_assignments');
            }
          } catch (err) {
            console.error('Failed to sync offline teacher assignments deletions:', err);
          }
        }
      }
    };

    pullSetupData();
    syncOfflineDeletions();
  }, [user]);

  const addClass = async (e) => {
    e.preventDefault();
    if (!className || !user?.schoolId) return;
    
    // Add locally to Dexie (for instant UI feedback offline/online)
    await db.classes.add({ 
      schoolId: user.schoolId, 
      name: className, 
      teachingMode: teachingMode,
      category: classCategory,
      createdAt: new Date().toISOString() 
    });

    // Enqueue mutation to outbox for cloud sync
    await enqueueSync('insert', 'report_classes', {
      school_id: user.schoolId,
      name: className,
      teaching_mode: teachingMode,
      category: classCategory
    }, user.schoolId);

    setClassName('');
    setTeachingMode('class_teacher');
  };

  const deleteClass = async (id) => {
    if (!window.confirm('Are you sure you want to delete this class? All learners in this class will be unlinked, and associated subject and teacher allocations will be removed.')) return;
    try {
      await deletionManager.deleteClass(user?.schoolId, id, user);
    } catch (err) {
      console.error('Failed to delete class:', err);
      alert('An error occurred: ' + err.message);
    }
  };

  const updateClassMode = async (id, newMode) => {
    try {
      await db.classes.update(id, { teachingMode: newMode });
      await enqueueSync('update', 'report_classes', {
        filter: { id: id },
        data: { teaching_mode: newMode }
      }, user?.schoolId);
    } catch (err) {
      console.error('Failed to update class teaching mode:', err);
    }
  };

  const updateClassCategory = async (id, newCategory) => {
    try {
      await db.classes.update(id, { category: newCategory });
      await enqueueSync('update', 'report_classes', {
        filter: { id: id },
        data: { category: newCategory }
      }, user?.schoolId);
    } catch (err) {
      console.error('Failed to update class category:', err);
    }
  };

  const addSubject = async (e) => {
    e.preventDefault();
    if (!subjectName || !user?.schoolId) return;

    // Add locally to Dexie (for instant UI feedback offline/online)
    await db.subjects.add({ 
      schoolId: user.schoolId,
      name: subjectName, 
      createdAt: new Date().toISOString() 
    });

    // Enqueue mutation to outbox for cloud sync
    await enqueueSync('insert', 'report_subjects', {
      school_id: user.schoolId,
      name: subjectName
    }, user.schoolId);

    setSubjectName('');
  };

  const deleteSubject = async (id) => {
    if (!window.confirm('Are you sure you want to delete this subject? All associated teacher assignments and class-subject allocations will be removed.')) return;
    try {
      await deletionManager.deleteSubject(user?.schoolId, id, user);
    } catch (err) {
      console.error('Failed to delete subject:', err);
      alert('An error occurred: ' + err.message);
    }
  };

  const handleToggleSubject = async (arg1, arg2, arg3) => {
    if (!user?.schoolId) return;

    let targetClassId;
    let targetSubjectId;
    let isChecked;

    if (arg3 !== undefined) {
      // Called as: handleToggleSubject(classId, subjectId, isChecked)
      targetClassId = Number(arg1);
      targetSubjectId = Number(arg2);
      isChecked = Boolean(arg3);
    } else if (typeof arg2 === 'boolean') {
      // Called as: handleToggleSubject(subjectId, isChecked) with selectedSetupClass
      targetClassId = Number(selectedSetupClass);
      targetSubjectId = Number(arg1);
      isChecked = arg2;
    } else {
      // Called as: handleToggleSubject(classId, subjectId)
      targetClassId = Number(arg1);
      targetSubjectId = Number(arg2);
      // Auto-detect current presence in local DB
      const currentlyExists = (classSubjects || []).some(
        cs => (Number(cs.classId) === targetClassId || String(cs.classId) === String(targetClassId)) &&
              (Number(cs.subjectId) === targetSubjectId || String(cs.subjectId) === String(targetSubjectId))
      );
      isChecked = !currentlyExists;
    }

    if (!targetClassId || !targetSubjectId) {
      console.warn('[handleToggleSubject] Missing classId or subjectId:', { targetClassId, targetSubjectId });
      return;
    }

    try {
      if (isChecked) {
        // 1. ADD SUBJECT TO CLASS
        const alreadyExists = await db.classSubjects
          .where('schoolId').equals(user.schoolId)
          .filter(cs => 
            (Number(cs.classId) === targetClassId || String(cs.classId) === String(targetClassId)) &&
            (Number(cs.subjectId) === targetSubjectId || String(cs.subjectId) === String(targetSubjectId))
          )
          .first();

        if (alreadyExists) return;

        // Instantly write to local database so checkbox ticks immediately
        await db.classSubjects.add({
          schoolId: user.schoolId,
          classId: targetClassId,
          subjectId: targetSubjectId,
          synced: false,
          supabaseId: null
        });

        // Queue cloud insert via outbox
        await enqueueSync('insert', 'report_class_subjects', {
          school_id: user.schoolId,
          class_id: targetClassId,
          subject_id: targetSubjectId
        }, user.schoolId);

        // Immediate background cloud insert if online
        if (navigator.onLine) {
          try {
            const { data: inserted, error: insErr } = await supabase
              .from('report_class_subjects')
              .insert([{
                school_id: user.schoolId,
                class_id: targetClassId,
                subject_id: targetSubjectId
              }])
              .select('id')
              .maybeSingle();

            if (!insErr && inserted?.id) {
              const local = await db.classSubjects
                .where('schoolId').equals(user.schoolId)
                .filter(cs => Number(cs.classId) === targetClassId && Number(cs.subjectId) === targetSubjectId)
                .first();
              if (local) {
                await db.classSubjects.update(local.id, { supabaseId: inserted.id, synced: true });
              }
            }
          } catch (syncErr) {
            console.warn('[handleToggleSubject] Immediate cloud insert fallback to outbox:', syncErr);
          }
        }
      } else {
        // 2. REMOVE SUBJECT FROM CLASS
        const existingList = await db.classSubjects
          .where('schoolId').equals(user.schoolId)
          .filter(cs => 
            (Number(cs.classId) === targetClassId || String(cs.classId) === String(targetClassId)) &&
            (Number(cs.subjectId) === targetSubjectId || String(cs.subjectId) === String(targetSubjectId))
          )
          .toArray();

        if (existingList.length > 0) {
          for (const item of existingList) {
            await db.classSubjects.delete(item.id);
          }
        }

        // Clean up any teacher assignments linked to this class & subject
        const relatedAssigns = await db.teacherAssignments
          .where('schoolId').equals(user.schoolId)
          .filter(a => 
            (Number(a.classId) === targetClassId || String(a.classId) === String(targetClassId)) &&
            (Number(a.subjectId) === targetSubjectId || String(a.subjectId) === String(targetSubjectId))
          )
          .toArray();

        for (const a of relatedAssigns) {
          await db.teacherAssignments.delete(a.id);
          if (a.supabaseId) {
            await enqueueSync('delete', 'report_teacher_assignments', {
              filter: { id: a.supabaseId }
            }, user.schoolId);
          }
        }

        // Queue cloud delete via outbox
        await enqueueSync('delete', 'report_class_subjects', {
          filter: {
            school_id: user.schoolId,
            class_id: targetClassId,
            subject_id: targetSubjectId
          }
        }, user.schoolId);

        // Immediate background cloud delete if online
        if (navigator.onLine) {
          try {
            await supabase
              .from('report_class_subjects')
              .delete()
              .eq('school_id', user.schoolId)
              .eq('class_id', targetClassId)
              .eq('subject_id', targetSubjectId);

            if (relatedAssigns.length > 0) {
              await supabase
                .from('report_teacher_assignments')
                .delete()
                .eq('school_id', user.schoolId)
                .eq('class_id', targetClassId)
                .eq('subject_id', targetSubjectId);
            }
          } catch (delErr) {
            console.warn('[handleToggleSubject] Immediate cloud delete fallback to outbox:', delErr);
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle subject:', err);
    }
  };

  const handleSelectAllSubjects = async (arg1, arg2) => {
    if (!user?.schoolId || !subjects) return;

    let targetClassId;
    let shouldSelectAll;

    if (arg2 !== undefined) {
      // Called as: handleSelectAllSubjects(classId, true/false)
      targetClassId = Number(arg1);
      shouldSelectAll = Boolean(arg2);
    } else {
      // Called as: handleSelectAllSubjects(true/false) using selectedSetupClass
      targetClassId = Number(selectedSetupClass);
      shouldSelectAll = Boolean(arg1);
    }

    if (!targetClassId) {
      console.warn('[handleSelectAllSubjects] Missing targetClassId');
      return;
    }

    try {
      if (shouldSelectAll) {
        const currentAssigned = new Set(
          classSubjects
            ?.filter(cs => Number(cs.classId) === targetClassId)
            ?.map(cs => Number(cs.subjectId))
        );
        const unassigned = subjects.filter(s => !currentAssigned.has(Number(s.id)));
        for (const s of unassigned) {
          await handleToggleSubject(targetClassId, Number(s.id), true);
        }
      } else {
        const assigned = classSubjects?.filter(cs => Number(cs.classId) === targetClassId) || [];
        for (const cs of assigned) {
          await handleToggleSubject(targetClassId, Number(cs.subjectId), false);
        }
      }
    } catch (err) {
      console.error('Failed to batch toggle subjects:', err);
    }
  };

  const handleAssignTeacher = async (classId, subjectId, teacherId) => {
    const classIdNum = Number(classId);
    const subjectIdNum = subjectId ? Number(subjectId) : null;
    if (!user?.schoolId) return;

    try {
      const existing = allAssignments?.find(
        a => a.classId === classIdNum && a.subjectId === subjectIdNum
      );

      if (!teacherId) {
        if (existing) {
          // Instantly delete from local db
          await db.teacherAssignments.delete(existing.id);
          
          if (existing.supabaseId) {
            if (navigator.onLine) {
              // Delete teacher assignment from Supabase in the background
              (async () => {
                try {
                  const { error } = await supabase
                    .from('report_teacher_assignments')
                    .delete()
                    .eq('id', existing.supabaseId);
                  if (error) {
                    console.warn('Failed to delete teacher assignment online in background:', error);
                  }
                } catch (err) {
                  console.warn('Background delete teacher assignment exception:', err);
                }
              })();
            } else {
              const queue = JSON.parse(localStorage.getItem('pending_deleted_assignments') || '[]');
              queue.push(existing.supabaseId);
              localStorage.setItem('pending_deleted_assignments', JSON.stringify(queue));
            }
          }
        }
        return;
      }

      if (existing) {
        // Instantly update local database so UI reflects selection immediately
        await db.teacherAssignments.update(existing.id, { teacherId, synced: false });
        
        let cloudId = existing.supabaseId;
        if (navigator.onLine && cloudId) {
          (async () => {
            try {
              const { error } = await supabase
                .from('report_teacher_assignments')
                .update({ teacher_id: teacherId })
                .eq('id', cloudId);
              if (!error) {
                await db.teacherAssignments.update(existing.id, { synced: true });
              } else {
                console.warn('Failed to update teacher assignment online in background:', error);
              }
            } catch (err) {
              console.warn('Background update teacher assignment exception:', err);
            }
          })();
        }
      } else {
        // Instantly add to local database as unsynced
        const localId = await db.teacherAssignments.add({
          schoolId: user.schoolId,
          teacherId,
          classId: classIdNum,
          subjectId: subjectIdNum,
          termId: null,
          synced: false,
          supabaseId: null
        });

        // Trigger Supabase insertion in the background
        if (navigator.onLine) {
          (async () => {
            try {
              const { data, error } = await supabase
                .from('report_teacher_assignments')
                .insert([{
                  school_id: user.schoolId,
                  teacher_id: teacherId,
                  class_id: classIdNum,
                  subject_id: subjectIdNum
                }])
                .select()
                .single();

              if (!error && data) {
                await db.teacherAssignments.update(localId, {
                  synced: true,
                  supabaseId: data.id
                });
              } else if (error) {
                console.warn('Failed to assign teacher online in background:', error);
              }
            } catch (err) {
              console.warn('Background teacher assignment exception:', err);
            }
          })();
        }
      }
    } catch (err) {
      console.error('Failed to assign teacher:', err);
    }
  };

  const handleApplySubjectPreset = async (presetList) => {
    if (!user?.schoolId || !Array.isArray(presetList)) return;
    const existingNames = new Set((subjects || []).map(s => s.name.toLowerCase().trim()));
    let count = 0;
    for (const name of presetList) {
      if (!existingNames.has(name.toLowerCase().trim())) {
        await db.subjects.add({
          schoolId: user.schoolId,
          name: name,
          createdAt: new Date().toISOString()
        });
        await enqueueSync('insert', 'report_subjects', {
          school_id: user.schoolId,
          name: name
        }, user.schoolId);
        count++;
      }
    }
    return count;
  };

  const handleApplyClassPreset = async (classList) => {
    if (!user?.schoolId || !Array.isArray(classList)) return;
    const existingNames = new Set((classes || []).map(c => c.name.toLowerCase().trim()));
    let count = 0;
    for (const item of classList) {
      if (!existingNames.has(item.name.toLowerCase().trim())) {
        await db.classes.add({
          schoolId: user.schoolId,
          name: item.name,
          teachingMode: item.teachingMode || 'class_teacher',
          category: item.category || 'basic 1-3',
          createdAt: new Date().toISOString()
        });
        await enqueueSync('insert', 'report_classes', {
          school_id: user.schoolId,
          name: item.name,
          teaching_mode: item.teachingMode || 'class_teacher',
          category: item.category || 'basic 1-3'
        }, user.schoolId);
        count++;
      }
    }
    return count;
  };

  const handleCopyClassConfig = async (sourceClassId, targetClassId) => {
    if (!sourceClassId || !targetClassId || !user?.schoolId) return;
    const srcIdNum = Number(sourceClassId);
    const tgtIdNum = Number(targetClassId);
    if (srcIdNum === tgtIdNum) return;

    try {
      // 1. Copy Class Subjects
      const sourceClassSubs = await db.classSubjects
        .where('schoolId').equals(user.schoolId)
        .filter(cs => Number(cs.classId) === srcIdNum)
        .toArray();

      const targetClassSubs = await db.classSubjects
        .where('schoolId').equals(user.schoolId)
        .filter(cs => Number(cs.classId) === tgtIdNum)
        .toArray();

      const targetSubIds = new Set(targetClassSubs.map(cs => Number(cs.subjectId)));

      for (const cs of sourceClassSubs) {
        const subIdNum = Number(cs.subjectId);
        if (!targetSubIds.has(subIdNum)) {
          await db.classSubjects.add({
            schoolId: user.schoolId,
            classId: tgtIdNum,
            subjectId: subIdNum,
            synced: false,
            supabaseId: null
          });
          await enqueueSync('insert', 'report_class_subjects', {
            school_id: user.schoolId,
            class_id: tgtIdNum,
            subject_id: subIdNum
          }, user.schoolId);

          if (navigator.onLine) {
            try {
              await supabase.from('report_class_subjects').insert([{
                school_id: user.schoolId,
                class_id: tgtIdNum,
                subject_id: subIdNum
              }]);
            } catch (_) {}
          }
        }
      }

      // 2. Copy Teacher Assignments
      const sourceAssigns = await db.teacherAssignments
        .where('schoolId').equals(user.schoolId)
        .filter(a => Number(a.classId) === srcIdNum)
        .toArray();

      for (const a of sourceAssigns) {
        await handleAssignTeacher(tgtIdNum, a.subjectId, a.teacherId);
      }
    } catch (err) {
      console.error('Failed to copy class config:', err);
      throw err;
    }
  };

  return {
    className,
    setClassName,
    teachingMode,
    setTeachingMode,
    classCategory,
    setClassCategory,
    subjectName,
    setSubjectName,
    selectedSetupClass,
    setSelectedSetupClass,
    user,
    classes,
    subjects,
    classSubjects,
    teachers,
    allAssignments,
    addClass,
    deleteClass,
    updateClassMode,
    updateClassCategory,
    addSubject,
    deleteSubject,
    handleToggleSubject,
    handleSelectAllSubjects,
    handleAssignTeacher,
    handleApplySubjectPreset,
    handleApplyClassPreset,
    handleCopyClassConfig
  };
};
