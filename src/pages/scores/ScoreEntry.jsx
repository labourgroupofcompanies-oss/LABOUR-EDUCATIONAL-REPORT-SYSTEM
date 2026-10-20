import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { calculateCaTotal, calculateExamTotal, calculateTotal, calculateGrade, DEFAULT_GRADING_SCALE } from '../../lib/grading';
import { useAuth } from '../../store/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { enqueueSync } from '../../services/syncEngine';
import { filterLearnersForSubject, getLanguageLabel } from '../../utils/languageUtils';
import { getTeacherIdentifierSet, isAssignmentForTeacher } from '../../utils/teacherUtils';
import LogoPreloader from '../../components/common/LogoPreloader';

const DEFAULT_CA_BREAKDOWN = [
  { id: 'tests', label: 'Class Tests', count: 2, maxScore: 15, enabled: true },
  { id: 'assignments', label: 'Group work', count: 2, maxScore: 10, enabled: true },
  { id: 'projects', label: 'Project Work', count: 1, maxScore: 10, enabled: true }
];

const DEFAULT_SETTINGS = {
  id: 'global',
  caWeight: 30,
  examWeight: 70,
  caModel: 'simple_mean',
  caBestNCount: '',
  caBreakdown: DEFAULT_CA_BREAKDOWN,
  gradingScale: DEFAULT_GRADING_SCALE || [
    { min: 80, max: 100, grade: '1', remark: 'HIGHEST' },
    { min: 70, max: 79,  grade: '2', remark: 'HIGHER' },
    { min: 60, max: 69,  grade: '3', remark: 'HIGH' },
    { min: 55, max: 59,  grade: '4', remark: 'HIGH AVERAGE' },
    { min: 50, max: 54,  grade: '5', remark: 'AVERAGE' },
    { min: 40, max: 49,  grade: '6', remark: 'LOW AVERAGE' },
    { min: 35, max: 39,  grade: '7', remark: 'LOW' },
    { min: 30, max: 34,  grade: '8', remark: 'LOWER' },
    { min: 0,  max: 29,  grade: '9', remark: 'LOWEST' }
  ]
};

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
  const [isBatchSubmitted, setIsBatchSubmitted] = useState(false);
  const { user } = useAuth();

  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');

  const schoolId = user?.schoolId;
  const allClasses = useLiveQuery(
    () => schoolId ? db.classes.filter(c => String(c.schoolId) === String(schoolId) || String(c.school_id || '') === String(schoolId)).toArray() : [], 
    [schoolId]
  );
  const allSubjects = useLiveQuery(
    () => schoolId ? db.subjects.filter(s => !s.schoolId || String(s.schoolId) === String(schoolId) || String(s.school_id || '') === String(schoolId)).toArray() : [], 
    [schoolId]
  );
  const settings = useLiveQuery(() => db.settings.get('global'), []);

  // Effective settings: never null/undefined, provides immediate offline fallback
  const effectiveSettings = useMemo(() => {
    if (settings && Array.isArray(settings.caBreakdown) && settings.caBreakdown.length > 0) {
      return settings;
    }
    return DEFAULT_SETTINGS;
  }, [settings]);

  // Seed default settings into Dexie if not yet present
  useEffect(() => {
    db.settings.get('global').then(existing => {
      if (!existing || !Array.isArray(existing.caBreakdown) || existing.caBreakdown.length === 0) {
        db.settings.put(DEFAULT_SETTINGS).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const classSubjects = useLiveQuery(
    () => schoolId ? db.classSubjects.filter(cs => String(cs.schoolId) === String(schoolId) || String(cs.school_id || '') === String(schoolId)).toArray() : [], 
    [schoolId]
  );
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.filter(s => String(s.id) === String(user.schoolId)).first() : null, [user?.schoolId]
  );
  
  const teacherIdTokens = useLiveQuery(
    async () => {
      return await getTeacherIdentifierSet(user, db);
    },
    [user]
  );

  const assignments = useLiveQuery(
    async () => {
      if (!user || user.role !== 'teacher') return [];
      const idTokens = teacherIdTokens || await getTeacherIdentifierSet(user, db);
      const allSchoolAssigns = await db.teacherAssignments
        .filter(a => isAssignmentForTeacher(a, idTokens, user))
        .toArray();
      return allSchoolAssigns;
    },
    [user, teacherIdTokens]
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
          const localClasses = await db.classes.where('schoolId').equals(user.schoolId).toArray();
          for (const rc of remoteClasses) {
            const localByName = localClasses.find(
              c => c.name && c.name.toLowerCase().trim() === rc.name.toLowerCase().trim()
            );

            if (localByName && Number(localByName.id) !== Number(rc.id)) {
              const oldId = localByName.id;
              const newId = rc.id;
              console.log(`[ScoreEntry Sync] Reconciling class "${rc.name}" (${oldId} → ${newId})`);
              await db.scores.where('classId').equals(oldId).filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)).modify({ classId: newId });
              await db.learners.where('currentClassId').equals(oldId).filter(l => String(l.schoolId) === String(user.schoolId) || String(l.school_id || '') === String(user.schoolId)).modify({ currentClassId: newId });
              await db.teacherAssignments.where('classId').equals(oldId).filter(a => String(a.schoolId) === String(user.schoolId) || String(a.school_id || '') === String(user.schoolId)).modify({ classId: newId });
              await db.classSubjects.where('classId').equals(oldId).filter(cs => String(cs.schoolId) === String(user.schoolId) || String(cs.school_id || '') === String(user.schoolId)).modify({ classId: newId });
              await db.classes.delete(oldId);
              await db.classes.put({
                id: newId,
                schoolId: rc.school_id,
                name: rc.name,
                teachingMode: rc.teaching_mode,
                createdAt: rc.created_at
              });
            } else {
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
          const localSubjects = await db.subjects.where('schoolId').equals(user.schoolId).toArray();
          for (const rs of remoteSubjects) {
            const localByName = localSubjects.find(
              s => s.name && s.name.toLowerCase().trim() === rs.name.toLowerCase().trim()
            );

            if (localByName && Number(localByName.id) !== Number(rs.id)) {
              const oldId = localByName.id;
              const newId = rs.id;
              console.log(`[ScoreEntry Sync] Reconciling subject "${rs.name}" (${oldId} → ${newId})`);
              await db.scores.where('subjectId').equals(oldId).modify({ subjectId: newId });
              await db.teacherAssignments.where('subjectId').equals(oldId).modify({ subjectId: newId });
              await db.classSubjects.where('subjectId').equals(oldId).modify({ subjectId: newId });
              await db.subjects.delete(oldId);
              await db.subjects.put({
                id: newId,
                schoolId: user.schoolId,
                name: rs.name,
                createdAt: rs.created_at
              });
            } else {
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
        }
      } catch (err) {
        console.error('[ScoreEntry Sync] Subjects sync failed:', err);
      }

      // 3. Pull Teacher Assignments
      try {
        const { data: assignData, error: assignErr } = await supabase
          .from('report_teacher_assignments')
          .select('*')
          .eq('school_id', user.schoolId);
        
        if (!assignErr && assignData) {
          for (const a of assignData) {
            const existing = await db.teacherAssignments
              .filter(la => (la.supabaseId && la.supabaseId === a.id) || 
                            (String(la.teacherId) === String(a.teacher_id) && 
                             Number(la.classId) === Number(a.class_id) && 
                             (a.subject_id ? Number(la.subjectId) === Number(a.subject_id) : (la.subjectId === null || la.subjectId === undefined))))
              .first();

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
              await db.teacherAssignments.put(mapped);
            }
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
    const assignedClassIds = new Set(
      (assignments || []).map(a => String(a.classId))
    );
    return allClasses.filter(c => 
      assignedClassIds.has(String(c.id)) || 
      (c.supabaseId && assignedClassIds.has(String(c.supabaseId))) ||
      (!isNaN(Number(c.id)) && (assignments || []).some(a => Number(a.classId) === Number(c.id)))
    );
  }, [allClasses, assignments, user]);

  // Filtered subjects offered by the selected class (Headteachers/Admins see all subjects)
  const subjects = useMemo(() => {
    if (!allSubjects) return [];
    if (!selectedClass) return [];

    const selectedClassStr = String(selectedClass);
    const selectedClassNum = Number(selectedClass);

    // Get the subjects actually offered by this class according to classSubjects mapping
    const classSubIds = new Set(
      (classSubjects || [])
        .filter(cs => String(cs.classId) === selectedClassStr || (!isNaN(selectedClassNum) && Number(cs.classId) === selectedClassNum))
        .map(cs => String(cs.subjectId))
    );
    let classOfferedSubjects = allSubjects.filter(s => 
      classSubIds.has(String(s.id)) || 
      (s.supabaseId && classSubIds.has(String(s.supabaseId))) || 
      (!isNaN(Number(s.id)) && classSubIds.has(String(Number(s.id))))
    );

    // If no class-subject mapping was configured yet for this class, fallback to allSubjects
    if (classOfferedSubjects.length === 0 && (!classSubjects || classSubjects.length === 0 || classSubIds.size === 0)) {
      classOfferedSubjects = allSubjects;
    }

    // Headteachers / Admins / Super Admins can enter scores for ALL subjects offered in any class
    const isHeadteacherOrAdmin = !user || ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user.role);
    if (isHeadteacherOrAdmin) return classOfferedSubjects.length > 0 ? classOfferedSubjects : allSubjects;

    // Get selected class details to check teaching mode
    const classObj = allClasses?.find(c => String(c.id) === selectedClassStr || (!isNaN(selectedClassNum) && Number(c.id) === selectedClassNum));
    const mode = classObj?.teachingMode || 'class_teacher';

    // Check if user is assigned as Class Teacher / Form Master (subjectId is null or undefined)
    const isClassTeacher = (assignments || []).some(
      a => (String(a.classId) === selectedClassStr || (!isNaN(selectedClassNum) && Number(a.classId) === selectedClassNum)) && 
           (a.subjectId === null || a.subjectId === undefined)
    );

    // Any subjects explicitly assigned to this teacher for this class
    const explicitlyAssignedSubjectIds = new Set(
      (assignments || [])
        .filter(a => (String(a.classId) === selectedClassStr || (!isNaN(selectedClassNum) && Number(a.classId) === selectedClassNum)) && 
                     a.subjectId !== null && a.subjectId !== undefined)
        .map(a => String(a.subjectId))
    );

    // If teacher is Class Teacher:
    // In class_teacher mode, they can teach ALL subjects offered by this class (or all subjects if none mapped)
    if (isClassTeacher && mode === 'class_teacher') {
      return classOfferedSubjects.length > 0 ? classOfferedSubjects : allSubjects;
    }

    // If teacher is Class Advisor / Form Master in subject_teacher mode, and has no specific subjects assigned,
    // they get access to all class offered subjects
    if (isClassTeacher && explicitlyAssignedSubjectIds.size === 0) {
      return classOfferedSubjects.length > 0 ? classOfferedSubjects : allSubjects;
    }

    // Otherwise, collect all subjects that are explicitly assigned to this teacher for this class,
    // PLUS if they are also the class teacher, all class-offered subjects
    const allowedList = allSubjects.filter(s => {
      const sIdStr = String(s.id);
      const sSupabaseIdStr = s.supabaseId ? String(s.supabaseId) : null;
      const isExplicit = explicitlyAssignedSubjectIds.has(sIdStr) || 
                         (sSupabaseIdStr && explicitlyAssignedSubjectIds.has(sSupabaseIdStr)) ||
                         (assignments || []).some(a => 
                           (String(a.classId) === selectedClassStr || (!isNaN(selectedClassNum) && Number(a.classId) === selectedClassNum)) &&
                           (String(a.subjectId) === sIdStr || (sSupabaseIdStr && String(a.subjectId) === sSupabaseIdStr) || (!isNaN(Number(s.id)) && Number(a.subjectId) === Number(s.id)))
                         );
      if (isExplicit) return true;
      if (isClassTeacher && (classSubIds.has(sIdStr) || (sSupabaseIdStr && classSubIds.has(sSupabaseIdStr)))) return true;
      return false;
    });

    return allowedList.length > 0 ? allowedList : (isClassTeacher ? classOfferedSubjects : []);
  }, [allSubjects, selectedClass, allClasses, assignments, user, classSubjects]);

  // Get learners for the selected class (including historical ones for past terms/years)
  const learners = useLiveQuery(
    async () => {
      if (!selectedClass || !schoolId) return [];
      const targetClassIdStr = String(selectedClass);
      const targetClassIdNum = Number(selectedClass);
      
      // 1. Fetch currently active learners in this class (strictly for THIS school)
      const activeLearners = await db.learners
        .filter(l => 
          (String(l.schoolId) === String(schoolId) || String(l.school_id || '') === String(schoolId)) &&
          (String(l.currentClassId) === targetClassIdStr || (!isNaN(targetClassIdNum) && Number(l.currentClassId) === targetClassIdNum))
        )
        .toArray();
      
      // 2. Fetch report summaries to identify historical students (strictly for THIS school)
      let historicalLearnerIds = new Set();
      if (selectedAcademicYear && selectedTerm) {
        const summaries = await db.reportSummaries
          .filter(s => 
            (String(s.schoolId) === String(schoolId) || String(s.school_id || '') === String(schoolId)) &&
            (String(s.classId) === targetClassIdStr || (!isNaN(targetClassIdNum) && Number(s.classId) === targetClassIdNum)) &&
            s.academicYear === selectedAcademicYear &&
            s.term === selectedTerm
          )
          .toArray();
        summaries.forEach(s => historicalLearnerIds.add(String(s.learnerId)));
      }
      
      // 3. Fetch scores to identify historical students (strictly for THIS school)
      if (selectedAcademicYear && selectedTerm) {
        const classScores = await db.scores
          .filter(s => 
            (String(s.schoolId) === String(schoolId) || String(s.school_id || '') === String(schoolId)) &&
            (String(s.classId) === targetClassIdStr || (!isNaN(targetClassIdNum) && Number(s.classId) === targetClassIdNum)) &&
            s.academicYear === selectedAcademicYear &&
            s.term === selectedTerm
          )
          .toArray();
        classScores.forEach(s => historicalLearnerIds.add(String(s.learnerId)));
      }
      
      // If there are no historical records yet, return active students
      if (historicalLearnerIds.size === 0) {
        return activeLearners.filter(l => l.status !== 'Alumni' && l.status !== 'Graduated');
      }
      
      // 4. Fetch learners of THIS school to resolve historical learner records
      const allLearners = await db.learners
        .filter(l => String(l.schoolId) === String(schoolId) || String(l.school_id || '') === String(schoolId))
        .toArray();
      
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
      
      return combined.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    },
    [selectedClass, selectedAcademicYear, selectedTerm, schoolId]
  );

  const activeSubjectObj = useMemo(() => {
    return allSubjects?.find(s => Number(s.id) === Number(selectedSubject));
  }, [allSubjects, selectedSubject]);

  const displayLearners = useMemo(() => {
    if (!learners) return [];
    return filterLearnersForSubject(learners, activeSubjectObj);
  }, [learners, activeSubjectObj]);

  // Load existing scores from local Dexie immediately (0ms offline load),
  // with a non-blocking background cloud check when online.
  useEffect(() => {
    if (isDirty) return; // Protect unsaved inputs from being overwritten by reloads

    const loadScores = async () => {
      if (selectedClass && selectedSubject && selectedAcademicYear && selectedTerm) {
        const currentSid = user?.schoolId;
        const targetClassStr = String(selectedClass);
        const targetClassNum = Number(selectedClass);
        const targetSubjectStr = String(selectedSubject);
        const targetSubjectNum = Number(selectedSubject);

        // 1. FIRST: Instantly load and render from local Dexie IndexedDB (0ms offline load)
        let localExisting = [];
        try {
          localExisting = await db.scores
            .filter(s =>
              (String(s.schoolId) === String(currentSid) || String(s.school_id || '') === String(currentSid)) &&
              (String(s.classId) === targetClassStr || (!isNaN(targetClassNum) && Number(s.classId) === targetClassNum)) &&
              (String(s.subjectId) === targetSubjectStr || (!isNaN(targetSubjectNum) && Number(s.subjectId) === targetSubjectNum)) &&
              s.term === selectedTerm &&
              s.academicYear === selectedAcademicYear
            )
            .toArray();
        } catch (dbErr) {
          console.error('[ScoreEntry] Failed to read local scores from Dexie:', dbErr);
          setScores({});
          return;
        }

        if (localExisting.length > 0) {
          const submittedScores = localExisting.filter(s => s.isSubmitted);
          setIsBatchSubmitted(submittedScores.length > 0 && submittedScores.length === localExisting.length);
        } else {
          setIsBatchSubmitted(false);
        }

        // Fetch learners of THIS school to resolve local ID → supabaseId (UUID) mappings
        const localLearners = await db.learners
          .filter(l => String(l.schoolId) === String(currentSid) || String(l.school_id || '') === String(currentSid))
          .toArray();

        const scoreMap = {};
        for (const s of localExisting) {
          let resolvedLearnerId = s.learnerId;

          // Self-healing: if learnerId is not a UUID, try to resolve it via supabaseId
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.learnerId);
          if (!isUuid) {
            const matchedLearner = localLearners.find(l => String(l.id) === String(s.learnerId));
            if (matchedLearner && matchedLearner.supabaseId) {
              resolvedLearnerId = matchedLearner.supabaseId;
            }
          }

          scoreMap[resolvedLearnerId] = {
            caScores: s.caScores || [],
            examScore: s.examScore ?? '',
            isSubmitted: s.isSubmitted || false,
          };
        }
        setScores(scoreMap);

        // 2. SECOND: Quiet background check from cloud (non-blocking, only if online)
        if (navigator.onLine && user?.schoolId) {
          try {
            const { data: cloudScores, error } = await supabase
              .from('report_scores')
              .select('*')
              .eq('school_id', user.schoolId)
              .eq('class_id', !isNaN(targetClassNum) ? targetClassNum : selectedClass)
              .eq('subject_id', !isNaN(targetSubjectNum) ? targetSubjectNum : selectedSubject)
              .eq('academic_year', selectedAcademicYear)
              .eq('term', selectedTerm);

            if (cloudScores && !error) {
              let updatedAny = false;
              for (const cs of cloudScores) {
                const existing = await db.scores
                  .where('learnerId').equals(cs.learner_id)
                  .filter(s => 
                    (String(s.classId) === String(cs.class_id) || Number(s.classId) === Number(cs.class_id)) && 
                    (String(s.subjectId) === String(cs.subject_id) || Number(s.subjectId) === Number(cs.subject_id)) && 
                    s.term === cs.term && 
                    s.academicYear === cs.academic_year
                  )
                  .first();

                const entry = {
                  learnerId:    cs.learner_id,
                  schoolId:     user.schoolId,
                  classId:      cs.class_id,
                  subjectId:    cs.subject_id,
                  caScores:     cs.ca_scores || [],
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
                  synced:       true,
                };

                if (existing) {
                  if (existing.synced !== false) {
                    await db.scores.update(existing.id, entry);
                    updatedAny = true;
                  }
                } else {
                  await db.scores.add(entry);
                  updatedAny = true;
                }
              }

              if (updatedAny) {
                const refreshed = await db.scores
                  .filter(s => 
                    (String(s.schoolId) === String(currentSid) || String(s.school_id || '') === String(currentSid)) && 
                    (String(s.classId) === targetClassStr || (!isNaN(targetClassNum) && Number(s.classId) === targetClassNum)) && 
                    (String(s.subjectId) === targetSubjectStr || (!isNaN(targetSubjectNum) && Number(s.subjectId) === targetSubjectNum)) && 
                    s.term === selectedTerm && 
                    s.academicYear === selectedAcademicYear
                  )
                  .toArray();

                const refreshedMap = {};
                for (const s of refreshed) {
                  refreshedMap[s.learnerId] = {
                    caScores: s.caScores || [],
                    examScore: s.examScore ?? '',
                    isSubmitted: s.isSubmitted || false,
                  };
                }
                setScores(prev => ({ ...refreshedMap, ...prev }));
              }
            }
          } catch (err) {
            console.warn('[ScoreEntry] Background cloud check completed (local Dexie active):', err);
          }
        }
      }
    };
    loadScores();
  }, [selectedClass, selectedSubject, selectedAcademicYear, selectedTerm, user?.schoolId, isDirty]);

  const syncUnsyncedScores = useCallback(async () => {
    if (!navigator.onLine || !user?.schoolId) return;
    try {
      // 1. Find groups that have unsynced scores — these need to be uploaded
      const unsynced = await db.scores.filter(s => !s.synced && (String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId))).toArray();
      if (unsynced.length === 0) return;

      console.log(`[Score Sync] Found ${unsynced.length} unsynced score(s). Resolving mappings...`);

      // Collect the unique group keys that need syncing
      const groupKeysToSync = new Set();
      let hasDeferredScores = false;
      for (const s of unsynced) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.learnerId);
        if (!isUuid) {
          const matchedLearner = await db.learners.get(Number(s.learnerId));
          if (!matchedLearner || (String(matchedLearner.schoolId) !== String(user.schoolId) && String(matchedLearner.school_id || '') !== String(user.schoolId))) {
            console.warn(`[Score Sync] Skipping score for learner ${s.learnerId} — does not belong to school ${user.schoolId}.`);
            continue;
          }
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
        let classId   = Number(classIdStr);
        let subjectId = Number(subjectIdStr);

        // Pre-reconcile subjectId against Supabase/Dexie
        try {
          const { data: subRemote } = await supabase.from('report_subjects').select('id').eq('id', subjectId).maybeSingle();
          if (!subRemote?.id) {
            const localSub = await db.subjects.get(subjectId);
            if (localSub?.name) {
              const { data: subByName } = await supabase.from('report_subjects')
                .select('id')
                .eq('school_id', user.schoolId)
                .ilike('name', localSub.name.trim())
                .maybeSingle();
              if (subByName?.id) {
                const newSubId = subByName.id;
                await db.scores.where('subjectId').equals(subjectId).filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)).modify({ subjectId: newSubId });
                await db.subjects.delete(subjectId);
                await db.subjects.put({ ...localSub, id: newSubId });
                subjectId = newSubId;
              } else {
                const { data: newSub } = await supabase.from('report_subjects')
                  .insert([{ school_id: user.schoolId, name: localSub.name.trim() }])
                  .select('id')
                  .single();
                if (newSub?.id) {
                  const newSubId = newSub.id;
                  await db.scores.where('subjectId').equals(subjectId).filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)).modify({ subjectId: newSubId });
                  await db.subjects.delete(subjectId);
                  await db.subjects.put({ ...localSub, id: newSubId });
                  subjectId = newSubId;
                }
              }
            }
          }
        } catch (_) {}

        // Pre-reconcile classId against Supabase/Dexie
        try {
          const { data: clsRemote } = await supabase.from('report_classes').select('id').eq('id', classId).maybeSingle();
          if (!clsRemote?.id) {
            const localCls = await db.classes.get(classId);
            if (localCls?.name) {
              const { data: clsByName } = await supabase.from('report_classes')
                .select('id')
                .eq('school_id', user.schoolId)
                .ilike('name', localCls.name.trim())
                .maybeSingle();
              if (clsByName?.id) {
                const newClsId = clsByName.id;
                await db.scores.where('classId').equals(classId).filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)).modify({ classId: newClsId });
                await db.classes.delete(classId);
                await db.classes.put({ ...localCls, id: newClsId });
                classId = newClsId;
              } else {
                const { data: newCls } = await supabase.from('report_classes')
                  .insert([{ school_id: user.schoolId, name: localCls.name.trim(), teaching_mode: localCls.teachingMode || 'class' }])
                  .select('id')
                  .single();
                if (newCls?.id) {
                  const newClsId = newCls.id;
                  await db.scores.where('classId').equals(classId).filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)).modify({ classId: newClsId });
                  await db.classes.delete(classId);
                  await db.classes.put({ ...localCls, id: newClsId });
                  classId = newClsId;
                }
              }
            }
          }
        } catch (_) {}

        // Get ALL scores for this group (both synced and unsynced) strictly for THIS school
        const allGroupScores = await db.scores
          .filter(s => (String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)) && Number(s.classId) === classId && Number(s.subjectId) === subjectId && s.term === term && s.academicYear === academicYear)
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
            if (!matchedLearner || (String(matchedLearner.schoolId) !== String(user.schoolId) && String(matchedLearner.school_id || '') !== String(user.schoolId))) {
              console.warn(`[Score Sync] Skipping foreign score row — learner Dexie id=${s.learnerId} does not belong to school ${user.schoolId}.`);
              continue;
            }
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

  const [savingAction, setSavingAction] = useState(null); // 'top-draft' | 'top-submit' | 'bottom-draft' | 'bottom-submit' | null
  const isSavingAny = Boolean(savingAction);

  const handleSave = async (submitFinal = true, actionKey = 'top-submit') => {
    if (!selectedClass || !selectedSubject || !user?.schoolId || !selectedAcademicYear || !selectedTerm) {
      alert('Please select Class, Subject, Term, and Academic Year.');
      return;
    }
    setSavingAction(actionKey);

    const scoreEntries = [];

    // Map object to entries
    for (const [learnerIdStr, data] of Object.entries(scores)) {
      const learnerId = learnerIdStr;
      const caScoresArray = data.caScores || [];
      const examRaw = data.examScore || 0;
      
      const caTotal = calculateCaTotal(caScoresArray, effectiveSettings);
      const examTotal = calculateExamTotal(examRaw, effectiveSettings);
      const total = calculateTotal(caTotal, examTotal);
      const { grade, remark } = calculateGrade(total, effectiveSettings.gradingScale);
      const now = new Date().toISOString();

      scoreEntries.push({
        learnerId,
        schoolId: user.schoolId,
        classId: Number(selectedClass),
        subjectId: Number(selectedSubject),
        caScores: caScoresArray,
        examScore: examRaw,
        classScore: caTotal,
        totalScore: total,
        grade,
        remark,
        isSubmitted: submitFinal,
        termId: null,
        term: selectedTerm,
        academicYear: selectedAcademicYear,
        updatedAt: now,
        synced: false
      });
    }

    try {
      // Bulk put into Dexie
      for (const entry of scoreEntries) {
        const existing = await db.scores
          .where('learnerId').equals(entry.learnerId)
          .filter(s => (String(s.schoolId) === String(user.schoolId) || !s.schoolId) && s.classId === entry.classId && s.subjectId === entry.subjectId && s.term === entry.term && s.academicYear === entry.academicYear)
          .first();

        if (existing) {
          await db.scores.update(existing.id, entry);
        } else {
          await db.scores.add(entry);
        }
      }

      setIsDirty(false);
      setIsBatchSubmitted(submitFinal);

      if (submitFinal) {
        try {
          const clsObj = (classes || []).find(c => String(c.id) === String(selectedClass) || String(c.supabaseId) === String(selectedClass));
          const subObj = (subjects || []).find(s => String(s.id) === String(selectedSubject) || String(s.supabaseId) === String(selectedSubject));
          const className = clsObj?.name || `Class ${selectedClass}`;
          const subjectName = subObj?.name || `Subject ${selectedSubject}`;

          window.dispatchEvent(new CustomEvent('school-scores-submitted', {
            detail: {
              schoolId: user.schoolId,
              teacherId: user.id,
              teacherName: user.name || user.fullName || 'Teacher',
              classId: selectedClass,
              className,
              subjectId: selectedSubject,
              subjectName,
              term: selectedTerm,
              academicYear: selectedAcademicYear
            }
          }));
        } catch (evtErr) {
          console.warn('[ScoreEntry] Failed to dispatch score submission event:', evtErr);
        }
      }

      alert(submitFinal
        ? '✓ Scores saved and submitted successfully! Status is now Submitted.'
        : '✎ Scores saved as Draft successfully!'
      );

      // Trigger background sync immediately if online
      if (navigator.onLine) {
        syncUnsyncedScores().catch(err => console.warn('Failed to sync after save:', err));
      }
    } catch (err) {
      console.error('[ScoreEntry] handleSave failed:', err);
      alert('Failed to save scores. Please try again.');
    } finally {
      setSavingAction(null);
    }
  };

  // Generate flat array of columns based on effectiveSettings (instant offline support)
  // Memoized so it only recomputes when settings change, not on every keystroke
  const caCols = useMemo(() => {
    const cols = [];
    // Use strictly the breakdown defined in effectiveSettings (falls back to DEFAULT_CA_BREAKDOWN)
    const activeBreakdown = Array.isArray(effectiveSettings.caBreakdown) ? effectiveSettings.caBreakdown : DEFAULT_CA_BREAKDOWN;

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
        cols.push({
          id: `${component.id}-${i}`,
          label: `${prefix}${i + 1}`,
          maxScore: component.maxScore || 100
        });
      }
    });
    return cols;
  }, [effectiveSettings]);

  const getCardTheme = (isFilled) => {
    if (isFilled) {
      return {
        cardBg: '#FFFFFF',
        cardBorder: '#09090B',
        topBar: '#09090B',
        avatarBg: '#09090B',
        bannerBg: '#F4F4F5',
        bannerBorder: '#E4E4E7',
        bannerColor: '#09090B',
        tagBg: '#09090B',
        tagColor: '#FFFFFF'
      };
    }
    return {
      cardBg: '#FFFFFF',
      cardBorder: '#E4E4E7',
      topBar: '#E4E4E7',
      avatarBg: '#71717A',
      bannerBg: '#FAFAFA',
      bannerBorder: '#E4E4E7',
      bannerColor: '#71717A',
      tagBg: '#E4E4E7',
      tagColor: '#52525B'
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

        {/* ── UNIFIED ACADEMIC COCKPIT (Clean Desk Layout) ── */}
        <div 
          style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '1.25rem 1.4rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}
        >
          {/* Top Row: Context Title, Academic Session, and Rule Briefing */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #F4F4F5', paddingBottom: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', background: '#09090B', color: '#FFFFFF', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                Assessment Sheet
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#09090B' }}>
                {selectedAcademicYear || schoolInfo?.currentAcademicYear || '2025/2026'} &bull; {selectedTerm || schoolInfo?.currentTerm || 'Term 1'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: '#71717A', fontWeight: 600 }}>
              <i className="far fa-circle-question" style={{ color: '#09090B' }}></i>
              <span>CA: {settings?.caWeight}% ({settings?.caModel === 'simple_mean' ? 'Simple Mean' : `Best ${settings?.caBestNCount}`}) &bull; Exam: {settings?.examWeight}%</span>
            </div>
          </div>

          {/* Bottom Row: Class & Subject Selectors + Save Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: '1 1 360px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 170px' }}>
                <select 
                  className="form-input" 
                  value={selectedClass} 
                  style={{ height: '38px', borderRadius: '9px', fontSize: '0.84rem', border: '1px solid #E4E4E7', fontWeight: 600, background: '#FFFFFF', padding: '0 0.75rem', width: '100%' }}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isDirty && !window.confirm('You have unsaved changes. Changing class will discard them. Do you want to proceed?')) {
                      return;
                    }
                    setSelectedClass(val);
                    setIsDirty(false);
                  }}
                >
                  <option value="">-- Select Class --</option>
                  {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ flex: '1 1 170px' }}>
                <select 
                  className="form-input" 
                  value={selectedSubject} 
                  style={{ height: '38px', borderRadius: '9px', fontSize: '0.84rem', border: '1px solid #E4E4E7', fontWeight: 600, background: '#FFFFFF', padding: '0 0.75rem', width: '100%' }}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isDirty && !window.confirm('You have unsaved changes. Changing subject will discard them. Do you want to proceed?')) {
                      return;
                    }
                    setSelectedSubject(val);
                    setIsDirty(false);
                  }}
                >
                  <option value="">-- Select Subject --</option>
                  {subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedClass && selectedSubject && Object.keys(scores).length > 0 && (
                <span style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '8px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: isBatchSubmitted ? '#F4F4F5' : '#FAFAFA',
                  color: isBatchSubmitted ? '#09090b' : '#71717a',
                  border: '1px solid #E4E4E7'
                }}>
                  <i className={`fas ${isBatchSubmitted ? 'fa-check' : 'fa-pen'}`}></i>
                  {isBatchSubmitted ? 'Submitted' : 'Draft'}
                </span>
              )}
              <button 
                type="button"
                className="btn" 
                onClick={() => handleSave(false, 'top-draft')} 
                disabled={!selectedClass || !selectedSubject || !selectedAcademicYear || !selectedTerm || isSavingAny} 
                style={{ 
                  background: '#FFFFFF', 
                  border: '1px solid #E4E4E7', 
                  color: '#09090B', 
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  borderRadius: '9px',
                  height: '36px',
                  padding: '0 0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  opacity: isSavingAny && savingAction !== 'top-draft' ? 0.6 : 1
                }}
                title="Save work offline as Draft without officially submitting"
              >
                {savingAction === 'top-draft' ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="far fa-save"></i>
                )}
                <span>{savingAction === 'top-draft' ? 'Saving...' : 'Save Draft'}</span>
              </button>
              <button 
                type="button"
                className="btn" 
                onClick={() => handleSave(true, 'top-submit')} 
                disabled={!selectedClass || !selectedSubject || !selectedAcademicYear || !selectedTerm || isSavingAny} 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  borderRadius: '9px',
                  height: '36px',
                  padding: '0 1rem',
                  background: '#09090B',
                  color: '#FFFFFF',
                  border: '1px solid #09090B',
                  boxShadow: '0 2px 8px rgba(9, 9, 11, 0.18)',
                  opacity: isSavingAny && savingAction !== 'top-submit' ? 0.6 : 1
                }}
                title="Submit scores"
              >
                {savingAction === 'top-submit' ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-check-circle"></i>
                )}
                <span>{savingAction === 'top-submit' ? 'Submitting...' : 'Submit'}</span>
              </button>
            </div>
          </div>
        </div>

        {selectedClass && selectedSubject ? (
          <div>

            <style>{`
              .student-card {
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s ease !important;
              }
              .student-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03) !important;
              }
              /* Hide spin buttons / up & down arrows for Chrome, Safari, Edge, Opera */
              .score-input::-webkit-outer-spin-button,
              .score-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
              }
              /* Hide spin buttons for Firefox */
              .score-input {
                -moz-appearance: textfield;
                appearance: textfield;
                text-align: center !important;
                transition: all 0.15s ease !important;
              }
              .score-input:focus {
                border-color: #09090b !important;
                box-shadow: 0 0 0 2px rgba(9, 9, 11, 0.15) !important;
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
                    borderRadius: '14px', 
                    border: `1px solid ${perf.cardBorder}`, 
                    padding: '1.1rem 1.25rem', 
                    background: perf.cardBg, 
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.85rem',
                    position: 'relative'
                  }}>
                    {/* Header: Student Name & Meta Info */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', borderBottom: '1px solid #F4F4F5', paddingBottom: '0.65rem' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#09090b', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {learner.fullName}
                        </h4>
                        <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '2px', fontFamily: 'monospace' }}>
                          {learner.regNumber || 'No Reg'}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.65rem', background: '#F4F4F5', color: '#52525B', border: '1px solid #E4E4E7', borderRadius: '4px', padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>
                        {getLanguageLabel(learner.ghanaianLanguage || learner.ghanaian_language)}
                      </span>
                    </div>

                    {/* CA & Exam Inputs Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${caCols.length}, 1fr) 1.2fr`, gap: '0.45rem', alignItems: 'flex-end' }}>
                      {caCols.map((col, i) => (
                        <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#71717a', textAlign: 'center', textTransform: 'uppercase' }}>
                            {col.label}
                          </label>
                          <input 
                            type="number" 
                            className="score-input"
                            style={{ 
                              width: '100%', 
                              height: '34px', 
                              borderRadius: '7px', 
                              border: '1px solid #E4E4E7', 
                              textAlign: 'center', 
                              fontSize: '0.85rem',
                              fontWeight: '600',
                              color: '#09090b',
                              background: '#FAFAFA',
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
                        <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#09090b', textAlign: 'center', textTransform: 'uppercase' }}>
                          Exam (100)
                        </label>
                        <input 
                          type="number" 
                          className="score-input"
                          style={{ 
                            width: '100%', 
                            height: '34px', 
                            borderRadius: '7px', 
                            border: '1.5px solid #09090b', 
                            textAlign: 'center', 
                            fontSize: '0.85rem',
                            color: '#09090b',
                            background: '#FFFFFF',
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

                    {/* Integrated Bottom Summary Ledger */}
                    <div style={{ 
                      background: '#FAFAFA', 
                      border: '1px solid #E4E4E7', 
                      borderRadius: '8px', 
                      padding: '0.55rem 0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.74rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#52525B' }}>
                        <span>CA: <strong style={{ color: '#09090b' }}>{caScaled > 0 ? caScaled : '0'}</strong></span>
                        <span>&bull;</span>
                        <span>Exam: <strong style={{ color: '#09090b' }}>{examScaled > 0 ? examScaled : '0'}</strong></span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 800, color: '#09090b', fontSize: '0.82rem' }}>
                          {total > 0 ? total : '0'}
                        </span>
                        <span style={{ 
                          background: total > 0 ? '#09090B' : '#E4E4E7', 
                          color: total > 0 ? '#FFFFFF' : '#71717A',
                          fontWeight: 800,
                          fontSize: '0.68rem',
                          padding: '1px 5px',
                          borderRadius: '4px'
                        }}>
                          {total > 0 ? grade : '-'}
                        </span>
                        {total > 0 && remark && (
                          <span style={{
                            fontSize: '0.63rem',
                            fontWeight: 700,
                            color: '#52525B',
                            background: '#F4F4F5',
                            border: '1px solid #E4E4E7',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            textTransform: 'capitalize',
                            whiteSpace: 'nowrap'
                          }}>
                            {remark.toLowerCase()}
                          </span>
                        )}
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
              alignItems: 'center',
              gap: '1rem',
              marginTop: '2rem', 
              paddingTop: '2rem', 
              borderTop: '1px solid #e2e8f0',
              flexWrap: 'wrap'
            }}>
              <button 
                type="button"
                className="btn" 
                onClick={() => handleSave(false, 'bottom-draft')} 
                disabled={!selectedClass || !selectedSubject || !selectedAcademicYear || !selectedTerm || isSavingAny}
                style={{ 
                  padding: '0.65rem 1.4rem', 
                  fontSize: '0.88rem', 
                  borderRadius: '10px', 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: '#FFFFFF',
                  border: '1px solid #E4E4E7',
                  color: '#09090B',
                  fontWeight: 700,
                  opacity: isSavingAny && savingAction !== 'bottom-draft' ? 0.6 : 1
                }}
              >
                {savingAction === 'bottom-draft' ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="far fa-save"></i>
                )}
                <span>{savingAction === 'bottom-draft' ? 'Saving...' : 'Save as Draft'}</span>
              </button>

              <button 
                type="button"
                className="btn" 
                onClick={() => handleSave(true, 'bottom-submit')} 
                disabled={!selectedClass || !selectedSubject || !selectedAcademicYear || !selectedTerm || isSavingAny}
                style={{ 
                  padding: '0.65rem 1.75rem', 
                  fontSize: '0.9rem', 
                  borderRadius: '10px', 
                  background: '#09090B',
                  color: '#FFFFFF',
                  border: '1px solid #09090B',
                  boxShadow: '0 2px 8px rgba(9, 9, 11, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 800,
                  opacity: isSavingAny && savingAction !== 'bottom-submit' ? 0.6 : 1
                }}
              >
                {savingAction === 'bottom-submit' ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <i className="fas fa-check-circle"></i>
                )}
                <span>{savingAction === 'bottom-submit' ? 'Submitting...' : 'Submit'}</span>
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
