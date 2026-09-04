import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { calculateCaTotal, calculateExamTotal, calculateTotal, calculateGrade } from '../../lib/grading';
import { useAuth } from '../../store/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { enqueueSync } from '../../services/syncEngine';
import { filterLearnersForSubject, getLanguageLabel } from '../../utils/languageUtils';
import LogoPreloader from '../../components/common/LogoPreloader';

const ScoreEntry = () => {
  const [searchParams] = useSearchParams();
  const queryClass = searchParams.get('classId');
  const querySubject = searchParams.get('subjectId');

  const [selectedClass, setSelectedClass] = useState(queryClass || '');
  const [selectedSubject, setSelectedSubject] = useState(querySubject || '');

  // ── Online / Offline tracking ────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Live count of pending/failed outbox items so teacher can see sync status
  const outboxItems = useLiveQuery(() => db.outbox.toArray(), []);
  useEffect(() => {
    if (!outboxItems) return;
    const count = outboxItems.filter(i => i.status === 'pending' || i.status === 'failed' || i.status === 'processing').length;
    setPendingSyncCount(count);
  }, [outboxItems]);

  useEffect(() => {
    if (queryClass) {
      setSelectedClass(queryClass);
    }
  }, [queryClass]);

  useEffect(() => {
    if (querySubject) {
      setSelectedSubject(querySubject);
    }
  }, [querySubject]);
  const [scores, setScores] = useState({}); // { learnerId: { caScores: [], examScore } }
  const [isDirty, setIsDirty] = useState(false);
  const { user } = useAuth();

  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');

  const schoolId = user?.schoolId;
  const allClasses = useLiveQuery(
    () => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );
  const allSubjects = useLiveQuery(
    () => schoolId ? db.subjects.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );
  const settings = useLiveQuery(() => db.settings.get('global'), []);
  const classSubjects = useLiveQuery(
    () => schoolId ? db.classSubjects.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]
  );
  
  const assignments = useLiveQuery(
    () => user && user.role === 'teacher' ? db.teacherAssignments.where('teacherId').equals(user.id).toArray() : [],
    [user]
  );

  // Sync current school settings for term/year defaults
  useEffect(() => {
    if (isDirty) return; // Protect unsaved score inputs from default updates
    if (schoolInfo) {
      if (schoolInfo.currentAcademicYear) setSelectedAcademicYear(schoolInfo.currentAcademicYear);
      if (schoolInfo.currentTerm)         setSelectedTerm(schoolInfo.currentTerm);
    }
  }, [schoolInfo, isDirty]);

  // ── Seeding/Self-Healing on Load ────────────────────────────────────────────
  // NOTE: We always load from Dexie. Remote fetch is skipped silently when offline.
  useEffect(() => {
    const pullAssignmentsAndSetup = async () => {
      if (!user?.schoolId) return;
      console.log('Loading setup data for Score Entry (online:', navigator.onLine, ')...');
      
      // When offline, Dexie already has the data from a previous sync — nothing extra needed.
      if (!navigator.onLine) {
        console.log('[ScoreEntry] Offline — serving from local IndexedDB cache.');
        return;
      }
      
      // 1. Pull Classes
      try {
        const { data: remoteClasses, error: classErr } = await supabase
          .from('report_classes')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!classErr && remoteClasses) {
          for (const rc of remoteClasses) {
            const local = await db.classes.get(rc.id);
            if (!local) {
              await db.classes.put({
                id: rc.id,
                schoolId: rc.school_id,
                name: rc.name,
                teachingMode: rc.teaching_mode,
                createdAt: rc.created_at
              });
            } else if (local.name !== rc.name || local.teachingMode !== rc.teaching_mode) {
              await db.classes.update(rc.id, { name: rc.name, teachingMode: rc.teaching_mode });
            }
          }
        }
      } catch (err) {
        console.error('[ScoreEntry Sync] Classes sync failed:', err);
      }

      // 2. Pull Subjects
      try {
        const { data: remoteSubjects, error: subErr } = await supabase
          .from('report_subjects')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!subErr && remoteSubjects) {
          for (const rs of remoteSubjects) {
            const local = await db.subjects.get(rs.id);
            if (!local) {
              await db.subjects.put({
                id: rs.id,
                schoolId: user.schoolId,
                name: rs.name,
                createdAt: rs.created_at
              });
            } else if (local.name !== rs.name) {
              await db.subjects.update(rs.id, { name: rs.name });
            }
          }
        }
      } catch (err) {
        console.error('[ScoreEntry Sync] Subjects sync failed:', err);
      }

      // 3. Pull Teacher Assignments
      try {
        let query = supabase.from('report_teacher_assignments').select('*').eq('school_id', user.schoolId);
        if (user.role === 'teacher') {
          query = query.eq('teacher_id', user.id);
        }
        const { data: assignData, error: assignErr } = await query;
        
        if (!assignErr && assignData) {
          if (user.role === 'teacher') {
            const myLocalAssigns = await db.teacherAssignments.where('teacherId').equals(user.id).toArray();
            for (const la of myLocalAssigns) {
              await db.teacherAssignments.delete(la.id);
            }
          } else {
            await db.teacherAssignments.clear();
          }

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
        console.error('[ScoreEntry Sync] Teacher assignments sync failed:', err);
      }

      // 4. Pull Class-Subject Assignments
      try {
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
      } catch (err) {
        console.error('[ScoreEntry Sync] Class-Subject assignments sync failed:', err);
      }

      // 5. Pull Global Settings
      try {
        const { data: settingsList, error: settingsErr } = await supabase
          .from('report_settings')
          .select('*')
          .eq('id', user.schoolId);
        const settingsData = settingsList?.[0];
          
        if (settingsData && !settingsErr) {
          await db.settings.put({
            id: 'global',
            caWeight: settingsData.ca_weight,
            examWeight: settingsData.exam_weight,
            caModel: settingsData.ca_model,
            caBestNCount: settingsData.ca_best_n || '',
            caBreakdown: settingsData.ca_breakdown || [],
            gradingScale: settingsData.grading_scale || []
          });
        }
      } catch (err) {
        console.error('[ScoreEntry Sync] Global settings sync failed:', err);
      }
    };

    pullAssignmentsAndSetup();
  }, [user]);

  // Filtered classes (Headteachers/Admins see all classes; teachers see assigned classes)
  const classes = useMemo(() => {
    if (!allClasses) return [];
    const isHeadteacherOrAdmin = !user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role);
    if (isHeadteacherOrAdmin) return allClasses;
    
    // Teacher: Only classes where they have at least one assignment
    const assignedClassIds = new Set(assignments?.map(a => Number(a.classId)));
    return allClasses.filter(c => assignedClassIds.has(Number(c.id)));
  }, [allClasses, assignments, user]);

  // Filtered subjects offered by the selected class (Headteachers/Admins see all subjects)
  const subjects = useMemo(() => {
    if (!allSubjects) return [];
    if (!selectedClass) return [];

    // Get the subjects actually offered by this class
    const classSubIds = new Set(
      classSubjects
        ?.filter(cs => Number(cs.classId) === Number(selectedClass))
        ?.map(cs => Number(cs.subjectId))
    );
    const classOfferedSubjects = allSubjects.filter(s => classSubIds.has(Number(s.id)));

    // Headteachers / Admins / Super Admins can enter scores for ALL subjects offered in any class
    const isHeadteacherOrAdmin = !user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role);
    if (isHeadteacherOrAdmin) return classOfferedSubjects;

    // Get selected class details to check teaching mode
    const classObj = allClasses?.find(c => Number(c.id) === Number(selectedClass));
    const mode = classObj?.teachingMode || 'class_teacher';

    if (mode === 'class_teacher') {
      // If class is in Class Teacher Mode and they are assigned as its Class Teacher (subjectId is null)
      const isClassTeacher = assignments?.some(
        a => Number(a.classId) === Number(selectedClass) && a.subjectId === null
      );
      if (isClassTeacher) {
        return classOfferedSubjects; // Can teach all subjects offered by this class
      }
    }

    // Subject Teacher Mode: only show assigned subjects in this class (restricted to class-offered ones)
    const allowedSubjectIds = new Set(
      assignments
        ?.filter(a => Number(a.classId) === Number(selectedClass) && a.subjectId !== null)
        ?.map(a => Number(a.subjectId))
    );
    return classOfferedSubjects.filter(s => allowedSubjectIds.has(Number(s.id)));
  }, [allSubjects, selectedClass, allClasses, assignments, user, classSubjects]);

  // Get learners for the selected class (including historical ones for past terms/years)
  const learners = useLiveQuery(
    async () => {
      if (!selectedClass) return [];
      const targetClassId = Number(selectedClass);
      
      // 1. Fetch currently active learners in this class (excluding alumni/graduated)
      const activeLearners = await db.learners
        .where('currentClassId').equals(targetClassId)
        .toArray();
      
      // 2. Fetch report summaries to identify historical students
      let historicalLearnerIds = new Set();
      if (selectedAcademicYear && selectedTerm) {
        const summaries = await db.reportSummaries
          .where('classId').equals(targetClassId)
          .filter(s => s.academicYear === selectedAcademicYear && s.term === selectedTerm)
          .toArray();
        summaries.forEach(s => historicalLearnerIds.add(String(s.learnerId)));
      }
      
      // 3. Fetch scores to identify historical students
      if (selectedAcademicYear && selectedTerm) {
        const classScores = await db.scores
          .where('classId').equals(targetClassId)
          .filter(s => s.academicYear === selectedAcademicYear && s.term === selectedTerm)
          .toArray();
        classScores.forEach(s => historicalLearnerIds.add(String(s.learnerId)));
      }
      
      // If there are no historical records yet, return active students
      if (historicalLearnerIds.size === 0) {
        return activeLearners.filter(l => l.status !== 'Alumni' && l.status !== 'Graduated');
      }
      
      // 4. Fetch all learners to resolve historical learner records
      const allLearners = await db.learners.toArray();
      
      // Combine active and historical students, avoiding duplicates
      const seen = new Set();
      const combined = [];
      
      // First, include active ones
      activeLearners.forEach(l => {
        if (l.status !== 'Alumni' && l.status !== 'Graduated') {
          seen.add(String(l.id));
          if (l.supabaseId) seen.add(String(l.supabaseId));
          combined.push(l);
        }
      });
      
      // Next, include historical ones who are not already added
      allLearners.forEach(l => {
        const lId = String(l.id);
        const lSupId = l.supabaseId ? String(l.supabaseId) : null;
        if (!seen.has(lId) && (!lSupId || !seen.has(lSupId))) {
          if (historicalLearnerIds.has(lId) || (lSupId && historicalLearnerIds.has(lSupId))) {
            seen.add(lId);
            if (lSupId) seen.add(lSupId);
            combined.push(l);
          }
        }
      });
      
      return combined.sort((a, b) => a.fullName.localeCompare(b.fullName));
    },
    [selectedClass, selectedAcademicYear, selectedTerm]
  );

  const activeSubjectObj = useMemo(() => {
    return allSubjects?.find(s => Number(s.id) === Number(selectedSubject));
  }, [allSubjects, selectedSubject]);

  const displayLearners = useMemo(() => {
    if (!learners) return [];
    return filterLearnersForSubject(learners, activeSubjectObj);
  }, [learners, activeSubjectObj]);

  // Load existing scores from local Dexie, with a cloud refresh guard.
  // We fetch from cloud first to ensure teachers on fresh devices see the latest data.
  // IMPORTANT GUARD: We never overwrite a local score that has synced:false — those are
  // unsaved edits that haven't reached Supabase yet. Overwriting them with stale cloud data
  // was the root cause of blank exam scores (race condition after save).
  useEffect(() => {
    if (isDirty) return; // Protect unsaved inputs from being overwritten by reloads

    const loadScores = async () => {
      if (selectedClass && selectedSubject && selectedAcademicYear && selectedTerm) {
        // 1. Pull latest from cloud (ensures fresh device / first load sees real data)
        if (navigator.onLine && user?.schoolId) {
          try {
            const { data: cloudScores, error } = await supabase
              .from('report_scores')
              .select('*')
              .eq('school_id', user.schoolId)
              .eq('class_id', Number(selectedClass))
              .eq('subject_id', Number(selectedSubject))
              .eq('academic_year', selectedAcademicYear)
              .eq('term', selectedTerm);

            if (cloudScores && !error) {
              for (const cs of cloudScores) {
                const existing = await db.scores
                  .where('learnerId').equals(cs.learner_id)
                  .filter(s => s.classId === cs.class_id && s.subjectId === cs.subject_id && s.term === cs.term && s.academicYear === cs.academic_year)
                  .first();

                const entry = {
                  learnerId:    cs.learner_id,
                  classId:      cs.class_id,
                  subjectId:    cs.subject_id,
                  caScores:     cs.ca_scores || [],
                  // Use nullish coalescing: preserves 0 scores, only replaces null/undefined with ''
                  examScore:    cs.exam_score ?? '',
                  classScore:   cs.class_score ?? 0,
                  totalScore:   cs.total_score ?? 0,
                  grade:        cs.grade || '',
                  remark:       cs.remark || '',
                  isSubmitted:  cs.is_submitted || false,
                  termId:       null,
                  term:         cs.term || '',
                  academicYear: cs.academic_year || '',
                  updatedAt:    cs.updated_at,
                  synced:       true, // This record came from the cloud — it is synced
                };

                if (existing) {
                  // CRITICAL: Only update from cloud if the local record has no pending edits.
                  // If synced:false, the teacher has saved changes not yet in Supabase —
                  // overwriting would silently discard their exam/CA scores.
                  if (existing.synced !== false) {
                    await db.scores.update(existing.id, entry);
                  }
                } else {
                  // No local record exists — safe to add cloud version directly
                  await db.scores.add(entry);
                }
              }
            }
          } catch (err) {
            console.error('[ScoreEntry] Cloud fetch failed (will use local Dexie):', err);
          }
        }

        // 2. Load from Dexie to display (always the source of truth for the UI)
        const existing = await db.scores
          .where('classId').equals(Number(selectedClass))
          .filter(s => s.subjectId === Number(selectedSubject) && s.term === selectedTerm && s.academicYear === selectedAcademicYear)
          .toArray();

        // Fetch all learners to resolve local ID → supabaseId (UUID) mappings
        const localLearners = await db.learners.toArray();

        const scoreMap = {};
        for (const s of existing) {
          let resolvedLearnerId = s.learnerId;

          // Self-healing: if learnerId is not a UUID, try to resolve it via supabaseId
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.learnerId);
          if (!isUuid) {
            const matchedLearner = localLearners.find(l => String(l.id) === String(s.learnerId));
            if (matchedLearner && matchedLearner.supabaseId) {
              resolvedLearnerId = matchedLearner.supabaseId;
              try {
                await db.scores.update(s.id, { learnerId: resolvedLearnerId });
                console.log(`[Score Sync] Self-healed score for learner ${matchedLearner.fullName}: migrated ID from ${s.learnerId} to ${resolvedLearnerId}`);
              } catch (updErr) {
                console.warn('Failed to update local score learnerId:', updErr);
              }
            }
          }

          scoreMap[resolvedLearnerId] = {
            caScores: s.caScores || [],
            // Use ?? '' so exam score 0 is shown as 0, not converted to '' (which uploads as null)
            examScore: s.examScore ?? '',
          };
        }
        setScores(scoreMap);
      }
    };
    loadScores();
  }, [selectedClass, selectedSubject, selectedAcademicYear, selectedTerm, user?.schoolId, isDirty]);

  const syncUnsyncedScores = useCallback(async () => {
    if (!navigator.onLine || !user?.schoolId) return;
    try {
      // 1. Find groups that have unsynced scores — these need to be uploaded
      const unsynced = await db.scores.filter(s => !s.synced).toArray();
      if (unsynced.length === 0) return;

      console.log(`[Score Sync] Found ${unsynced.length} unsynced score(s). Resolving mappings...`);

      // Collect the unique group keys that need syncing
      const groupKeysToSync = new Set();
      let hasDeferredScores = false;
      for (const s of unsynced) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.learnerId);
        if (!isUuid) {
          const matchedLearner = await db.learners.get(Number(s.learnerId));
          if (matchedLearner && matchedLearner.supabaseId) {
            // Learner now has a UUID — heal the score's learnerId so subsequent syncs work
            await db.scores.update(s.id, { learnerId: matchedLearner.supabaseId });
            console.log(`[Score Sync] Healed score learnerId for "${matchedLearner.fullName}": ${s.learnerId} → ${matchedLearner.supabaseId}`);
          } else {
            // Learner hasn't synced to the cloud yet — defer this score group.
            // It will be re-queued automatically once the learner reconciles in syncEngine.
            console.log(`[Score Sync] Learner (Dexie id=${s.learnerId}) is not yet synced — deferring score group ${s.classId}_${s.subjectId}_${s.term}_${s.academicYear} until learner sync completes.`);
            hasDeferredScores = true;
            continue;
          }
        }
        groupKeysToSync.add(`${s.classId}_${s.subjectId}_${s.term}_${s.academicYear}`);
      }
      if (hasDeferredScores) {
        console.log('[Score Sync] Some scores were deferred because their learner is still pending cloud sync. They will auto-sync once the learner is reconciled.');
      }

      // 2. For each group, upload ALL local scores (synced + unsynced).
      // This is critical: the delete_insert operation wipes ALL rows for the group from Supabase
      // before re-inserting. If we only uploaded unsynced rows, we'd permanently delete the
      // synced scores from Supabase (scores entered by teachers on other devices).
      for (const groupKey of groupKeysToSync) {
        const [classIdStr, subjectIdStr, term, academicYear] = groupKey.split('_');
        const classId   = Number(classIdStr);
        const subjectId = Number(subjectIdStr);

        // Get ALL scores for this group (both synced and unsynced)
        const allGroupScores = await db.scores
          .where('classId').equals(classId)
          .filter(s => s.subjectId === subjectId && s.term === term && s.academicYear === academicYear)
          .toArray();

        if (allGroupScores.length === 0) continue;

        const seenLearnerIds = new Set();
        const insertData = [];
        for (const s of allGroupScores) {
          // Resolve UUID
          let resolvedLearnerId = s.learnerId;
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.learnerId);
          if (!isUuid) {
            const matchedLearner = await db.learners.get(Number(s.learnerId));
            if (!matchedLearner?.supabaseId) {
              // Learner hasn't been synced to cloud yet — skip this row from the insert payload.
              // syncEngine's reconcileInsertedRow will trigger syncUnsyncedScores once learner is reconciled.
              console.log(`[Score Sync] Skipping score row in group — learner Dexie id=${s.learnerId} has no supabaseId yet.`);
              continue;
            }
            resolvedLearnerId = matchedLearner.supabaseId;
          }

          if (!resolvedLearnerId || seenLearnerIds.has(resolvedLearnerId)) continue;
          seenLearnerIds.add(resolvedLearnerId);

          // exam_score: only send null if the value is truly absent (empty string, null, undefined)
          // Use strict check — do NOT treat 0 as absent (a student can legitimately score 0)
          const examVal = s.examScore;
          const examScore = (examVal !== '' && examVal !== null && examVal !== undefined)
            ? Number(examVal)
            : null;

          // total_score: preserve 0 (student scored zero) — do NOT use || null which converts 0 to null
          const totalScore = (s.totalScore !== null && s.totalScore !== undefined && s.totalScore !== '')
            ? Number(s.totalScore)
            : null;

          insertData.push({
            school_id:    user.schoolId,
            learner_id:   resolvedLearnerId,
            class_id:     classId,
            subject_id:   subjectId,
            ca_scores:    s.caScores || [],
            exam_score:   examScore,
            class_score:  Number(s.classScore) || 0,
            total_score:  totalScore,
            grade:        s.grade || null,
            remark:       s.remark || null,
            is_submitted: s.isSubmitted || false,
            academic_year: academicYear,
            term,
            updated_at:   s.updatedAt || new Date().toISOString()
          });
        }

        if (insertData.length === 0) continue;

        console.log(`[Score Sync] Enqueuing ${insertData.length} scores (all local) for Class ${classId}, Subject ${subjectId}...`);

        await enqueueSync(
          'delete_insert',
          'report_scores',
          {
            deleteFilter: {
              school_id:    user.schoolId,
              class_id:     classId,
              subject_id:   subjectId,
              term,
              academic_year: academicYear,
            },
            insertData
          },
          user.schoolId
        );

        console.log(`[Score Sync] Enqueued ${insertData.length} scores for Class ${classId}, Subject ${subjectId}. Waiting for outbox to confirm sync.`);
      }

      console.log('[Score Sync] Finished enqueuing unsynced scores!');
    } catch (err) {
      console.error('[Score Sync] Error during score sync:', err);
    }
  }, [user]);

  useEffect(() => {
    syncUnsyncedScores();
    const handleOnline = () => {
      syncUnsyncedScores();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [user, syncUnsyncedScores]);

  const handleCaChange = (supabaseId, localId, index, value) => {
    if (value !== '') {
      const numVal = Number(value);
      const maxAllowed = caCols[index]?.maxScore || 100;
      if (numVal > maxAllowed) {
        value = maxAllowed.toString();
      } else if (numVal < 0) {
        value = '0';
      }
    }

    setIsDirty(true);
    setScores(prev => {
      const existing = (supabaseId && prev[supabaseId]) || (localId && prev[localId]) || {};
      const currentCa = existing.caScores ? [...existing.caScores] : [];
      currentCa[index] = value;
      const key = supabaseId || localId;
      return {
        ...prev,
        [key]: {
          ...existing,
          caScores: currentCa
        }
      };
    });
  };

  const handleExamChange = (supabaseId, localId, value) => {
    if (value !== '') {
      const numVal = Number(value);
      if (numVal > 100) {
        value = '100';
      } else if (numVal < 0) {
        value = '0';
      }
    }

    setIsDirty(true);
    setScores(prev => {
      const existing = (supabaseId && prev[supabaseId]) || (localId && prev[localId]) || {};
      const key = supabaseId || localId;
      return {
        ...prev,
        [key]: {
          ...existing,
          examScore: value
        }
      };
    });
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedClass || !selectedSubject || !settings || !user?.schoolId || !selectedAcademicYear || !selectedTerm) {
      alert('Please select Class, Subject, Term, and Academic Year.');
      return;
    }
    setIsSaving(true);

    const scoreEntries = [];

    // Map object to entries
    for (const [learnerIdStr, data] of Object.entries(scores)) {
      const learnerId = learnerIdStr;
      const caScoresArray = data.caScores || [];
      const examRaw = data.examScore || 0;
      
      const caTotal = calculateCaTotal(caScoresArray, settings);
      const examTotal = calculateExamTotal(examRaw, settings);
      const total = calculateTotal(caTotal, examTotal);
      const { grade, remark } = calculateGrade(total, settings.gradingScale);
      const now = new Date().toISOString();

      scoreEntries.push({
        learnerId,
        classId: Number(selectedClass),
        subjectId: Number(selectedSubject),
        caScores: caScoresArray,
        examScore: examRaw,
        classScore: caTotal,
        totalScore: total,
        grade,
        remark,
        isSubmitted: false,
        termId: null,
        term: selectedTerm,
        academicYear: selectedAcademicYear,
        updatedAt: now,
        synced: false
      });
    }

    // Bulk put into Dexie
    for (const entry of scoreEntries) {
      const existing = await db.scores
        .where('learnerId').equals(entry.learnerId)
        .filter(s => s.classId === entry.classId && s.subjectId === entry.subjectId && s.term === entry.term && s.academicYear === entry.academicYear)
        .first();
      
      if (existing) {
        await db.scores.update(existing.id, entry);
      } else {
        await db.scores.add(entry);
      }
    }

    setIsDirty(false);
    alert('Scores saved offline in local database successfully!');

    // Trigger background sync immediately if online
    if (navigator.onLine) {
      syncUnsyncedScores().catch(err => console.warn('Failed to sync after save:', err));
    }

    setIsSaving(false);
  };

  if (!settings || !settings.caBreakdown) {
    // If we are offline, the settings were simply never seeded — show a meaningful message.
    if (!isOnline) {
      return (
        <Layout title="Score Entry System">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 8px 20px rgba(245,158,11,0.2)' }}>
              <i className="fas fa-wifi-slash" style={{ fontSize: '2rem', color: '#d97706' }}></i>
            </div>
            <h2 style={{ color: '#92400e', marginBottom: '0.75rem', fontWeight: 800 }}>You're Offline</h2>
            <p style={{ color: '#b45309', maxWidth: '420px', lineHeight: 1.6 }}>
              Score entry configuration hasn't been downloaded yet. Please connect to the internet once to sync your school's grading rules, then scores will work offline.
            </p>
            <div style={{ marginTop: '1.5rem', padding: '0.75rem 1.25rem', background: 'rgba(245,158,11,0.1)', border: '1px solid #fde68a', borderRadius: '12px', fontSize: '0.85rem', color: '#92400e' }}>
              <i className="fas fa-info-circle" style={{ marginRight: '6px' }}></i>
              Once connected, data syncs automatically in the background.
            </div>
          </div>
        </Layout>
      );
    }
    // Online — still loading from Supabase
    return (
      <Layout title="Score Entry System">
        <LogoPreloader fullScreen={false} size="md" />
      </Layout>
    );
  }

  // Generate flat array of columns based on EXACTLY what is enabled in settings
  const caCols = [];
  
  // Use strictly the breakdown defined in settings (from the cloud)
  const activeBreakdown = Array.isArray(settings.caBreakdown) ? settings.caBreakdown : [];

  // Filter components strictly based on whether they have a count > 0.
  // We ignore the "enabled: false" flag to prevent accidental hiding if a headteacher enters a count but forgets to click "Enable".
  const enabledComponents = activeBreakdown.filter(c => c && Number(c.count) > 0);
  
  enabledComponents.forEach(component => {
    let prefix = 'CA';
    const labelLower = (component.label || '').toLowerCase();
    
    if (labelLower.includes('exercise')) {
      prefix = 'EX';
    } else if (labelLower.includes('test')) {
      prefix = 'TS';
    } else if (labelLower.includes('assignment')) {
      prefix = 'AS';
    } else if (labelLower.includes('project')) {
      prefix = 'PW';
    } else {
      prefix = (component.label || 'CA').substring(0, 2).toUpperCase();
    }

    // Use the exact count specified by the headteacher. If it's missing or 0, we don't render it.
    const count = Number(component.count) || 0;
    
    for (let i = 0; i < count; i++) {
      caCols.push({
        id: `${component.id}-${i}`,
        label: `${prefix}${i + 1}`,
        maxScore: component.maxScore || 100
      });
    }
  });

  const getCardTheme = (isFilled) => {
    if (isFilled) {
      return {
        cardBg: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
        cardBorder: '#86efac',
        topBar: '#10b981',
        avatarBg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        bannerBg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
        bannerBorder: '#86efac',
        bannerColor: '#065f46',
        tagBg: '#059669',
        tagColor: '#ffffff'
      };
    }
    return {
      cardBg: '#ffffff',
      cardBorder: '#e2e8f0',
      topBar: '#e2e8f0',
      avatarBg: 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)',
      bannerBg: '#f8fafc',
      bannerBorder: '#e2e8f0',
      bannerColor: '#64748b',
      tagBg: '#94a3b8',
      tagColor: '#ffffff'
    };
  };

  return (
    <Layout title="Score Entry System">
      <div className="fade-in" data-tour="scores-broadsheet">

        {/* Navigation Breadcrumb Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#64748b' }}>
            <button
              onClick={() => {
                if (isDirty && !window.confirm('You have unsaved score edits. Leaving will discard them. Do you want to go back?')) {
                  return;
                }
                window.history.back();
              }}
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <i className="fas fa-arrow-left"></i> Back
            </button>
            <span>/</span>
            <span>Classroom &amp; Marks</span>
            <span>/</span>
            <span style={{ color: '#09090b', fontWeight: 700 }}>Score Entry</span>
          </div>
        </div>

        {/* Active Session Verification Pill */}
        <div style={{
          background: '#F0FDF4',
          border: '1.5px solid #BBF7D0',
          borderRadius: '12px',
          padding: '0.65rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
            <i className="fas fa-calendar-check" style={{ color: '#16A34A', fontSize: '1rem' }}></i>
            <span style={{ color: '#15803D', fontWeight: 800 }}>Recording Scores For:</span>
            <span style={{ color: '#09090b', fontWeight: 800 }}>
              {selectedAcademicYear || schoolInfo?.currentAcademicYear || '2025/2026'} &bull; {selectedTerm || schoolInfo?.currentTerm || 'Term 1'}
            </span>
          </div>
          {user?.role === 'super_admin' && (
            <button 
              type="button"
              onClick={() => window.location.href = '/settings'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: '#16A34A', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
            >
              <i className="fas fa-sliders"></i> Change School Term in Settings &rarr;
            </button>
          )}
        </div>

        <div className="card" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
            <label className="form-label">Select Class</label>
            <select 
              className="form-input" 
              value={selectedClass} 
              onChange={(e) => {
                const val = e.target.value;
                if (isDirty && !window.confirm('You have unsaved changes. Changing class will discard them. Do you want to proceed?')) {
                  return;
                }
                setSelectedClass(val);
                setIsDirty(false);
              }}
            >
              <option value="">-- Choose Class --</option>
              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
            <label className="form-label">Select Subject</label>
            <select 
              className="form-input" 
              value={selectedSubject} 
              onChange={(e) => {
                const val = e.target.value;
                if (isDirty && !window.confirm('You have unsaved changes. Changing subject will discard them. Do you want to proceed?')) {
                  return;
                }
                setSelectedSubject(val);
                setIsDirty(false);
              }}
            >
              <option value="">-- Choose Subject --</option>
              {subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
            <label className="form-label">Term</label>
            <select 
              className="form-input" 
              value={selectedTerm} 
              onChange={(e) => {
                const val = e.target.value;
                if (isDirty && !window.confirm('You have unsaved changes. Changing term will discard them. Do you want to proceed?')) {
                  return;
                }
                setSelectedTerm(val);
                setIsDirty(false);
              }}
            >
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
            <label className="form-label">Academic Year</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. 2025/2026"
              value={selectedAcademicYear} 
              onChange={(e) => {
                const val = e.target.value;
                if (isDirty && !window.confirm('You have unsaved changes. Changing academic year will discard them. Do you want to proceed?')) {
                  return;
                }
                setSelectedAcademicYear(val);
                setIsDirty(false);
              }} 
            />
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={!selectedClass || !selectedSubject || !selectedAcademicYear || !selectedTerm || isSaving} style={{ flex: '0 0 auto' }}>
            {isSaving ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-save"></i>
            )}
            <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
          </button>
        </div>

        {selectedClass && selectedSubject ? (
          <div>
            {/* Legend for CA Calculation */}
            <div className="card" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', background: 'var(--accent-light)', border: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px' }}>
               <i className="fas fa-info-circle" style={{ color: 'var(--accent)', fontSize: '1.1rem' }}></i>
               <div>
                 <strong>Assessment Rule:</strong> All scores are raw. CA is calculated using <strong>{settings.caModel === 'simple_mean' ? 'Simple Mean' : `Best ${settings.caBestNCount}`}</strong> and scaled to {settings.caWeight}%. Exam is scaled to {settings.examWeight}%.
               </div>
            </div>

            <style>{`
              .student-card {
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s ease !important;
              }
              .student-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03) !important;
              }
              .score-input {
                transition: all 0.2s ease !important;
              }
              .score-input:focus {
                border-color: var(--accent) !important;
                box-shadow: 0 0 0 3px var(--accent-light) !important;
                transform: scale(1.03);
                background: #ffffff !important;
              }
            `}</style>

            {/* Students Card Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
              {displayLearners?.map((learner) => {
                const current = (learner.supabaseId && scores[learner.supabaseId]) || (learner.id && scores[learner.id]) || {};
                const caScoresArr = current.caScores || [];
                const examRaw = current.examScore || '';
                
                const caScaled = calculateCaTotal(caScoresArr, settings);
                const examScaled = calculateExamTotal(examRaw, settings);
                const total = calculateTotal(caScaled, examScaled);
                const { grade, remark } = calculateGrade(total, settings.gradingScale);

                const initials = learner.fullName.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
                
                const hasCa = caScoresArr.some(score => score !== undefined && score !== null && score !== '');
                const hasExam = examRaw !== undefined && examRaw !== null && examRaw !== '';
                const isFilled = hasCa || hasExam;
                const perf = getCardTheme(isFilled);

                return (
                  <div key={learner.id} className="card student-card" style={{ 
                    borderRadius: '16px', 
                    border: `1px solid ${perf.cardBorder}`, 
                    padding: '1.25rem', 
                    background: perf.cardBg, 
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Top Decorative bar */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '4px',
                      background: perf.topBar
                    }}></div>

                    {/* Header: Avatar, Name and ID */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: perf.avatarBg,
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        boxShadow: '0 3px 6px -1px rgba(0,0,0,0.1)',
                        transition: 'all 0.3s ease'
                      }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {learner.fullName}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'monospace' }}>
                            Reg: {learner.regNumber || 'N/A'}
                          </span>
                          <span style={{ fontSize: '0.65rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #dbeafe', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>
                            {getLanguageLabel(learner.ghanaianLanguage || learner.ghanaian_language)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CA Inputs Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                      {caCols.map((col, i) => (
                        <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textAlign: 'center', textTransform: 'uppercase' }}>
                            {col.label} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({col.maxScore})</span>
                          </label>
                          <input 
                            type="number" 
                            className="score-input"
                            style={{ 
                              width: '100%', 
                              height: '35px', 
                              borderRadius: '8px', 
                              border: '1.5px solid #e2e8f0', 
                              textAlign: 'center', 
                              fontSize: '0.85rem',
                              fontWeight: '600',
                              color: '#1e293b',
                              background: '#f8fafc',
                              outline: 'none'
                            }}
                            max={col.maxScore}
                            value={caScoresArr[i] || ''}
                            onChange={(e) => handleCaChange(learner.supabaseId, learner.id, i, e.target.value)}
                            placeholder="-"
                          />
                        </div>
                      ))}

                      {/* Exam Input */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '0.62rem', fontWeight: 800, color: '#1d4ed8', textAlign: 'center', textTransform: 'uppercase' }}>
                          Exam <span style={{ color: '#60a5fa', fontWeight: 500 }}>(100)</span>
                        </label>
                        <input 
                          type="number" 
                          className="score-input"
                          style={{ 
                            width: '100%', 
                            height: '35px', 
                            borderRadius: '8px', 
                            border: '1.5px solid #bfdbfe', 
                            textAlign: 'center', 
                            fontSize: '0.85rem',
                            color: '#1d4ed8',
                            background: '#eff6ff',
                            fontWeight: 700,
                            outline: 'none'
                          }}
                          max="100"
                          value={examRaw}
                          onChange={(e) => handleExamChange(learner.supabaseId, learner.id, e.target.value)}
                          placeholder="-"
                        />
                      </div>
                    </div>

                    {/* Sub-Totals Display */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>CA ({settings.caWeight}%)</span>
                        <strong style={{ fontSize: '0.9rem', color: '#15803d', fontWeight: 800, marginTop: '1px' }}>{caScaled > 0 ? caScaled : '0'}</strong>
                      </div>
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Exam ({settings.examWeight}%)</span>
                        <strong style={{ fontSize: '0.9rem', color: '#1d4ed8', fontWeight: 800, marginTop: '1px' }}>{examScaled > 0 ? examScaled : '0'}</strong>
                      </div>
                    </div>

                    {/* Unified Grade & Remarks Banner */}
                    <div style={{
                      background: perf.bannerBg,
                      border: `1px solid ${perf.bannerBorder}`,
                      borderRadius: '10px',
                      padding: '0.65rem 0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      color: perf.bannerColor,
                      transition: 'all 0.3s ease'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Total Score:</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900, fontFamily: 'Outfit, sans-serif' }}>
                          {total > 0 ? total : '0'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${perf.bannerBorder}`, paddingTop: '0.35rem', marginTop: '0.15rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Grade:</span>
                          <span style={{
                            background: perf.tagBg,
                            color: perf.tagColor,
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '1.5px 6px',
                            borderRadius: '5px',
                            minWidth: '20px',
                            textAlign: 'center'
                          }}>
                            {total > 0 ? grade : '-'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                          {total > 0 ? remark : 'No Entry'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Save Action Bar */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginTop: '2rem', 
              paddingTop: '2rem', 
              borderTop: '1px solid #e2e8f0' 
            }}>
              <button 
                className="btn btn-primary" 
                onClick={handleSave} 
                disabled={!selectedClass || !selectedSubject || !selectedAcademicYear || !selectedTerm || isSaving}
                style={{ 
                  padding: '0.8rem 2.5rem', 
                  fontSize: '1rem', 
                  borderRadius: '12px', 
                  boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3), 0 4px 6px -4px rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {isSaving ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-save"></i>
                )}
                <span>{isSaving ? 'Saving Scores...' : 'Save Draft & Sync'}</span>
              </button>
            </div>
          </div>
        ) : (!classes || classes.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', color: '#71717a', maxWidth: '460px', margin: '2rem auto' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: (!user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role)) ? '#EFF6FF' : '#FFFBEB', color: (!user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role)) ? '#2563eb' : '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', margin: '0 auto 1rem' }}>
              <i className={`fas ${(!user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role)) ? 'fa-school' : 'fa-user-clock'}`}></i>
            </div>
            <h3 style={{ margin: '0 0 6px', color: '#09090b', fontSize: '1.05rem', fontWeight: 800 }}>
              {(!user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role)) ? 'No Classes Configured' : 'No Classes Assigned'}
            </h3>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', lineHeight: 1.45 }}>
              {(!user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role)) 
                ? 'Create classes and assign subjects in Setup to start entering scores.' 
                : 'You have no assigned classes yet. Please contact your Headteacher.'}
            </p>
            {(!user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role)) && (
              <a href="/setup" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0.55rem 1.15rem', textDecoration: 'none', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700 }}>
                <i className="fas fa-sliders"></i> Go to School Setup
              </a>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-hand-pointer" style={{ fontSize: '2rem', color: '#A1A1AA', marginBottom: '1rem', display: 'block' }}></i>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#18181B' }}>Select Class &amp; Subject Above</h3>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Choose a class and subject from the dropdowns above to enter scores.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ScoreEntry;
