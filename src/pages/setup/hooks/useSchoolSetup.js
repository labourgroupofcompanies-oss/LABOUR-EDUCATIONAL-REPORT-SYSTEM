import { useState, useEffect } from 'react';
import { db } from '../../../lib/db';
import { supabase } from '../../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../store/AuthContext';

export const useSchoolSetup = () => {
  const [className, setClassName] = useState('');
  const [teachingMode, setTeachingMode] = useState('class_teacher');
  const [subjectName, setSubjectName] = useState('');
  const [selectedSetupClass, setSelectedSetupClass] = useState('');
  const { user } = useAuth();

  const classes = useLiveQuery(() => db.classes.toArray(), []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const classSubjects = useLiveQuery(() => db.classSubjects.toArray(), []);
  const teachers = useLiveQuery(() => db.profiles.where('role').equals('teacher').toArray(), []);
  const allAssignments = useLiveQuery(() => db.teacherAssignments.toArray(), []);

  // ── Automatic Database Pulling (Self-Healing) ──────────────────────
  useEffect(() => {
    const pullSetupData = async () => {
      if (!navigator.onLine || !user?.schoolId) return;
      try {
        console.log('Syncing setup data via custom hooks...');
        
        // 1. Pull & Reconcile Classes
        const { data: remoteClasses, error: classErr } = await supabase
          .from('report_classes')
          .select('*')
          .eq('school_id', user.schoolId);

        if (!classErr && remoteClasses) {
          const localClasses = await db.classes.toArray();
          
          for (const rc of remoteClasses) {
            // Find if there is a local class with the same name (case-insensitive, trimmed)
            const localByName = localClasses.find(c => c.name.toLowerCase().trim() === rc.name.toLowerCase().trim());
            
            if (localByName) {
              if (localByName.id !== rc.id) {
                const oldId = localByName.id;
                const newId = rc.id;
                console.log(`[Setup Sync] Reconciling duplicate Class name: "${rc.name}" (Old ID: ${oldId} -> New ID: ${newId})`);
                
                // Update related local records referencing the old class ID
                const relatedLearners = await db.learners.where('currentClassId').equals(oldId).toArray();
                for (const l of relatedLearners) {
                  await db.learners.update(l.id, { currentClassId: newId, synced: false });
                }

                const relatedScores = await db.scores.where('classId').equals(oldId).toArray();
                for (const s of relatedScores) {
                  await db.scores.update(s.id, { classId: newId });
                }

                const relatedAssigns = await db.teacherAssignments.where('classId').equals(oldId).toArray();
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
                  createdAt: rc.created_at
                });
              } else {
                if (localByName.name !== rc.name || localByName.teachingMode !== rc.teaching_mode) {
                  await db.classes.update(rc.id, { name: rc.name, teachingMode: rc.teaching_mode });
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
                  createdAt: rc.created_at
                });
              }
            }
          }
        }

        // 2. Pull & Reconcile Subjects
        const { data: remoteSubjects, error: subErr } = await supabase
          .from('report_subjects')
          .select('*')
          .eq('school_id', user.schoolId);

        if (!subErr && remoteSubjects) {
          const localSubjects = await db.subjects.toArray();
          
          for (const rs of remoteSubjects) {
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

                // Delete old duplicate name subject and insert new correct one
                await db.subjects.delete(oldId);
                await db.subjects.put({
                  id: newId,
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
                  name: rs.name,
                  createdAt: rs.created_at
                });
              }
            }
          }
        }

        // 3. Pull Class-Subject Assignments
        const { data: classSubsData, error: classSubsErr } = await supabase
          .from('report_class_subjects')
          .select('*')
          .eq('school_id', user.schoolId);

        if (!classSubsErr && classSubsData) {
          await db.classSubjects.clear();
          for (const cs of classSubsData) {
            await db.classSubjects.put({
              supabaseId: cs.id,
              schoolId: cs.school_id,
              classId: Number(cs.class_id),
              subjectId: Number(cs.subject_id),
              synced: true
            });
          }
        }

        // 4. Pull Teachers
        const { data: teachersData, error: teachErr } = await supabase
          .from('report_profiles')
          .select('*')
          .eq('school_id', user.schoolId)
          .eq('role', 'teacher');
        if (!teachErr && teachersData) {
          const remoteIds = new Set(teachersData.map(p => p.id));
          
          // Get all local teachers for this school
          const localTeachers = await db.profiles
            .where('schoolId').equals(user.schoolId)
            .and(p => p.role === 'teacher')
            .toArray();
            
          // Delete any local teacher that is not in the remote list
          for (const lt of localTeachers) {
            if (!remoteIds.has(lt.id)) {
              await db.profiles.delete(lt.id);
            }
          }

          // Save/Update remote active profiles
          for (const p of teachersData) {
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

        // 5. Pull Teacher Assignments
        const { data: assignData, error: assignErr } = await supabase
          .from('report_teacher_assignments')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!assignErr && assignData) {
          await db.teacherAssignments.clear();
          for (const a of assignData) {
            await db.teacherAssignments.put({
              supabaseId: a.id,
              schoolId: a.school_id,
              teacherId: a.teacher_id,
              classId: Number(a.class_id),
              subjectId: a.subject_id ? Number(a.subject_id) : null,
              termId: a.term_id ? Number(a.term_id) : null,
              synced: true
            });
          }
        }
      } catch (err) {
        console.error('Failed to sync setup hook data:', err);
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
    
    let cloudId = null;
    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('report_classes')
          .insert([{ school_id: user.schoolId, name: className, teaching_mode: teachingMode }])
          .select()
          .single();
        if (!error && data) {
          cloudId = data.id;
        }
      } catch (err) {
        console.warn('Failed to save class to Supabase:', err);
      }
    }
    
    const record = { 
      schoolId: user.schoolId, 
      name: className, 
      teachingMode: teachingMode,
      createdAt: new Date().toISOString() 
    };
    if (cloudId) {
      record.id = cloudId;
    }
    
    await db.classes.add(record);
    setClassName('');
    setTeachingMode('class_teacher');
  };

  const deleteClass = async (id) => {
    if (!window.confirm('Are you sure you want to delete this class? All learners, scores, assignments, and assigned subjects will be permanently deleted.')) return;
    try {
      await db.classes.delete(id);
      
      const relatedAssigns = await db.teacherAssignments.where('classId').equals(id).toArray();
      for (const a of relatedAssigns) {
        await db.teacherAssignments.delete(a.id);
      }

      const relatedClassSubjects = await db.classSubjects.where('classId').equals(id).toArray();
      for (const cs of relatedClassSubjects) {
        await db.classSubjects.delete(cs.id);
      }

      if (navigator.onLine) {
        await supabase.from('report_classes').delete().eq('id', id);
      }
    } catch (err) {
      console.error('Failed to delete class:', err);
    }
  };

  const updateClassMode = async (id, newMode) => {
    try {
      await db.classes.update(id, { teachingMode: newMode });
      
      if (navigator.onLine) {
        const { error } = await supabase
          .from('report_classes')
          .update({ teaching_mode: newMode })
          .eq('id', id);
        if (error) {
          console.warn('Failed to update class teaching mode on Supabase:', error);
        }
      }
    } catch (err) {
      console.error('Failed to update class teaching mode:', err);
    }
  };

  const addSubject = async (e) => {
    e.preventDefault();
    if (!subjectName || !user?.schoolId) return;

    let cloudId = null;
    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('report_subjects')
          .insert([{ school_id: user.schoolId, name: subjectName }])
          .select()
          .single();
        if (!error && data) {
          cloudId = data.id;
        }
      } catch (err) {
        console.warn('Failed to save subject to Supabase:', err);
      }
    }

    const record = { 
      schoolId: user.schoolId,
      name: subjectName, 
      createdAt: new Date().toISOString() 
    };
    if (cloudId) {
      record.id = cloudId;
    }

    await db.subjects.add(record);
    setSubjectName('');
  };

  const deleteSubject = async (id) => {
    if (!window.confirm('Are you sure you want to delete this subject? All scores, teacher assignments, and class-subject mappings associated with it will be permanently deleted.')) return;
    try {
      await db.subjects.delete(id);

      const relatedAssigns = await db.teacherAssignments.where('subjectId').equals(id).toArray();
      for (const a of relatedAssigns) {
        await db.teacherAssignments.delete(a.id);
      }

      const relatedClassSubjects = await db.classSubjects.where('subjectId').equals(id).toArray();
      for (const cs of relatedClassSubjects) {
        await db.classSubjects.delete(cs.id);
      }

      if (navigator.onLine) {
        await supabase.from('report_subjects').delete().eq('id', id);
      }
    } catch (err) {
      console.error('Failed to delete subject:', err);
    }
  };

  const handleToggleSubject = async (subjectId, isChecked) => {
    if (!selectedSetupClass || !user?.schoolId) return;
    const classIdNum = Number(selectedSetupClass);
    const subjectIdNum = Number(subjectId);

    try {
      if (isChecked) {
        const alreadyExists = await db.classSubjects
          .where('classId').equals(classIdNum)
          .filter(cs => cs.subjectId === subjectIdNum)
          .first();
        if (alreadyExists) return;

        // Instantly write to local database so the checkbox ticks immediately
        const localId = await db.classSubjects.add({
          schoolId: user.schoolId,
          classId: classIdNum,
          subjectId: subjectIdNum,
          synced: false,
          supabaseId: null
        });

        // Trigger Supabase sync in the background
        if (navigator.onLine) {
          supabase
            .from('report_class_subjects')
            .insert([{
              school_id: user.schoolId,
              class_id: classIdNum,
              subject_id: subjectIdNum
            }])
            .select()
            .single()
            .then(({ data, error }) => {
              if (!error && data) {
                db.classSubjects.update(localId, {
                  synced: true,
                  supabaseId: data.id
                });
              } else if (error) {
                console.warn('Failed to assign subject online in background:', error);
              }
            })
            .catch(err => {
              console.warn('Background subject assignment exception:', err);
            });
        }
      } else {
        const existing = await db.classSubjects
          .where('classId').equals(classIdNum)
          .filter(cs => cs.subjectId === subjectIdNum)
          .first();
        
        if (existing) {
          // Instantly delete from local db to untick the checkbox immediately
          await db.classSubjects.delete(existing.id);
          
          if (existing.supabaseId) {
            if (navigator.onLine) {
              // Delete from Supabase in the background
              supabase
                .from('report_class_subjects')
                .delete()
                .eq('id', existing.supabaseId)
                .catch(err => console.warn('Background subject deletion exception:', err));
            } else {
              const queue = JSON.parse(localStorage.getItem('pending_deleted_class_subjects') || '[]');
              queue.push(existing.supabaseId);
              localStorage.setItem('pending_deleted_class_subjects', JSON.stringify(queue));
            }
          }
        }

        const existingAssign = allAssignments?.find(
          a => a.classId === classIdNum && a.subjectId === subjectIdNum
        );
        if (existingAssign) {
          // Instantly delete assignment from local db
          await db.teacherAssignments.delete(existingAssign.id);
          
          if (existingAssign.supabaseId) {
            if (navigator.onLine) {
              // Delete teacher assignment from Supabase in the background
              supabase
                .from('report_teacher_assignments')
                .delete()
                .eq('id', existingAssign.supabaseId)
                .catch(err => console.warn('Background teacher assignment deletion exception:', err));
            } else {
              const queue = JSON.parse(localStorage.getItem('pending_deleted_assignments') || '[]');
              queue.push(existingAssign.supabaseId);
              localStorage.setItem('pending_deleted_assignments', JSON.stringify(queue));
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle class subject:', err);
    }
  };

  const handleSelectAllSubjects = async (shouldSelectAll) => {
    if (!selectedSetupClass || !user?.schoolId || !subjects) return;
    const classIdNum = Number(selectedSetupClass);

    try {
      if (shouldSelectAll) {
        const currentAssigned = new Set(
          classSubjects
            ?.filter(cs => cs.classId === classIdNum)
            ?.map(cs => cs.subjectId)
        );
        const unassigned = subjects.filter(s => !currentAssigned.has(Number(s.id)));
        for (const s of unassigned) {
          await handleToggleSubject(s.id, true);
        }
      } else {
        const assigned = classSubjects?.filter(cs => cs.classId === classIdNum) || [];
        for (const cs of assigned) {
          await handleToggleSubject(cs.subjectId, false);
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
              supabase
                .from('report_teacher_assignments')
                .delete()
                .eq('id', existing.supabaseId)
                .catch(err => console.warn('Background delete teacher assignment exception:', err));
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
          supabase
            .from('report_teacher_assignments')
            .update({ teacher_id: teacherId })
            .eq('id', cloudId)
            .then(({ error }) => {
              if (!error) {
                db.teacherAssignments.update(existing.id, { synced: true });
              } else {
                console.warn('Failed to update teacher assignment online in background:', error);
              }
            })
            .catch(err => console.warn('Background update teacher assignment exception:', err));
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
          supabase
            .from('report_teacher_assignments')
            .insert([{
              school_id: user.schoolId,
              teacher_id: teacherId,
              class_id: classIdNum,
              subject_id: subjectIdNum
            }])
            .select()
            .single()
            .then(({ data, error }) => {
              if (!error && data) {
                db.teacherAssignments.update(localId, {
                  synced: true,
                  supabaseId: data.id
                });
              } else if (error) {
                console.warn('Failed to assign teacher online in background:', error);
              }
            })
            .catch(err => console.warn('Background teacher assignment exception:', err));
        }
      }
    } catch (err) {
      console.error('Failed to assign teacher:', err);
    }
  };

  return {
    className,
    setClassName,
    teachingMode,
    setTeachingMode,
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
    addSubject,
    deleteSubject,
    handleToggleSubject,
    handleSelectAllSubjects,
    handleAssignTeacher
  };
};
