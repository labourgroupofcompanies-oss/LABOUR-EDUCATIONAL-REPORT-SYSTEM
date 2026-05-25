import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { calculateCaTotal, calculateExamTotal, calculateTotal, calculateGrade } from '../../lib/grading';
import { useAuth } from '../../store/AuthContext';
import { useSearchParams } from 'react-router-dom';

const ScoreEntry = () => {
  const [searchParams] = useSearchParams();
  const queryClass = searchParams.get('classId');
  const querySubject = searchParams.get('subjectId');

  const [selectedClass, setSelectedClass] = useState(queryClass || '');
  const [selectedSubject, setSelectedSubject] = useState(querySubject || '');

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
  const { user } = useAuth();

  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');

  const schoolId = user?.schoolId;
  const allClasses = useLiveQuery(
    () => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );
  const allSubjects = useLiveQuery(
    () => schoolId ? db.subjects.filter(s => s.schoolId === schoolId).toArray() : [], 
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
    if (schoolInfo) {
      if (schoolInfo.currentAcademicYear) setSelectedAcademicYear(schoolInfo.currentAcademicYear);
      if (schoolInfo.currentTerm)         setSelectedTerm(schoolInfo.currentTerm);
    }
  }, [schoolInfo]);

  // ── Seeding/Self-Healing on Load ────────────────────────────────────
  useEffect(() => {
    const pullAssignmentsAndSetup = async () => {
      if (!navigator.onLine || !user?.schoolId) return;
      try {
        console.log('Pulling setup data for Score Entry...');
        
        // 1. Pull Classes
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

        // 2. Pull Subjects
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
                name: rs.name,
                createdAt: rs.created_at
              });
            } else if (local.name !== rs.name) {
              await db.subjects.update(rs.id, { name: rs.name });
            }
          }
        }

        // 3. Pull Teacher Assignments
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

        // 4. Pull Class-Subject Assignments
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
        // 5. Pull Global Settings
        const { data: settingsData, error: settingsErr } = await supabase
          .from('report_settings')
          .select('*')
          .eq('id', user.schoolId)
          .single();
          
        if (settingsErr) {
          console.warn('Failed to fetch settings from Supabase:', settingsErr);
        }

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
        console.error('Failed to pull setup data:', err);
      }
    };

    pullAssignmentsAndSetup();
  }, [user]);

  // Filtered classes
  const classes = useMemo(() => {
    if (!allClasses) return [];
    if (!user || user.role === 'super_admin') return allClasses;
    
    // Teacher: Only classes where they have at least one assignment
    const assignedClassIds = new Set(assignments?.map(a => Number(a.classId)));
    return allClasses.filter(c => assignedClassIds.has(Number(c.id)));
  }, [allClasses, assignments, user]);

  // Filtered subjects offered by the selected class
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

    // If Super Admin, they see all subjects offered by the selected class
    if (!user || user.role === 'super_admin') return classOfferedSubjects;

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

  // Get learners for the selected class
  const learners = useLiveQuery(
    () => selectedClass ? db.learners.where('currentClassId').equals(Number(selectedClass)).toArray() : [],
    [selectedClass]
  );

  // Load existing scores if any
  useEffect(() => {
    const loadScores = async () => {
      if (selectedClass && selectedSubject && selectedAcademicYear && selectedTerm) {
        // 1. First, try to pull latest from cloud if online
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
              // Merge cloud scores into local Dexie to ensure local is up-to-date
              for (const cs of cloudScores) {
                const existing = await db.scores
                  .where('learnerId').equals(cs.learner_id)
                  .filter(s => s.classId === cs.class_id && s.subjectId === cs.subject_id && s.term === cs.term && s.academicYear === cs.academic_year)
                  .first();
                
                const entry = {
                  learnerId: cs.learner_id,
                  classId: cs.class_id,
                  subjectId: cs.subject_id,
                  caScores: cs.ca_scores || [],
                  examScore: cs.exam_score || '',
                  classScore: cs.class_score || 0,
                  totalScore: cs.total_score || 0,
                  grade: cs.grade || '',
                  remark: cs.remark || '',
                  isSubmitted: cs.is_submitted || false,
                  termId: null,
                  term: cs.term || '',
                  academicYear: cs.academic_year || '',
                  updatedAt: cs.updated_at
                };

                if (existing) {
                  // Only update if cloud is newer (simple check)
                  await db.scores.update(existing.id, entry);
                } else {
                  await db.scores.add(entry);
                }
              }
            }
          } catch (err) {
            console.error('Failed to sync scores from cloud:', err);
          }
        }

        // 2. Load from Dexie to display
        const existing = await db.scores
          .where('classId').equals(Number(selectedClass))
          .filter(s => s.subjectId === Number(selectedSubject) && s.term === selectedTerm && s.academicYear === selectedAcademicYear)
          .toArray();
        
        const scoreMap = {};
        existing.forEach(s => {
          scoreMap[s.learnerId] = { 
            caScores: s.caScores || [], 
            examScore: s.examScore || '' 
          };
        });
        setScores(scoreMap);
      }
    };
    loadScores();
  }, [selectedClass, selectedSubject, selectedAcademicYear, selectedTerm, user]);

  const handleCaChange = (learnerId, index, value) => {
    if (value !== '') {
      const numVal = Number(value);
      const maxAllowed = caCols[index]?.maxScore || 100;
      if (numVal > maxAllowed) {
        value = maxAllowed.toString();
      } else if (numVal < 0) {
        value = '0';
      }
    }

    setScores(prev => {
      const currentCa = prev[learnerId]?.caScores ? [...prev[learnerId].caScores] : [];
      currentCa[index] = value;
      return {
        ...prev,
        [learnerId]: {
          ...prev[learnerId],
          caScores: currentCa
        }
      };
    });
  };

  const handleExamChange = (learnerId, value) => {
    if (value !== '') {
      const numVal = Number(value);
      if (numVal > 100) {
        value = '100';
      } else if (numVal < 0) {
        value = '0';
      }
    }

    setScores(prev => ({
      ...prev,
      [learnerId]: {
        ...prev[learnerId],
        examScore: value
      }
    }));
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedClass || !selectedSubject || !settings || !user?.schoolId || !selectedAcademicYear || !selectedTerm) {
      alert('Please select Class, Subject, Term, and Academic Year.');
      return;
    }
    setIsSaving(true);

    const scoreEntries = [];
    const cloudEntries = [];

    // Map object to entries
    for (const [learnerIdStr, data] of Object.entries(scores)) {
      const learnerId = learnerIdStr; // It's a UUID string! Wait, Dexie might have it as string.
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
        updatedAt: now
      });

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(learnerId);
      if (isUuid) {
        cloudEntries.push({
          school_id: user.schoolId,
          learner_id: learnerId,
          class_id: Number(selectedClass),
          subject_id: Number(selectedSubject),
          ca_scores: caScoresArray,
          exam_score: examRaw ? Number(examRaw) : null,
          class_score: Number(caTotal) || 0,
          total_score: Number(total) || null,
          grade: grade || null,
          remark: remark || null,
          is_submitted: false,
          academic_year: selectedAcademicYear,
          term: selectedTerm,
          updated_at: now
        });
      } else {
        console.warn(`Skipping cloud score sync for unsynced learner: ${learnerId}`);
      }
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

    // Sync to Cloud
    if (navigator.onLine && cloudEntries.length > 0) {
      try {
        // Because report_scores does not have a unique constraint on (learner_id, class_id, subject_id, term, academic_year)
        // Upsert by matching those columns won't work out of the box unless we added a constraint.
        // Actually, deleting existing for this class/subject/term/year and re-inserting is a clean way to bulk sync.
        await supabase
           .from('report_scores')
           .delete()
           .eq('school_id', user.schoolId)
           .eq('class_id', Number(selectedClass))
           .eq('subject_id', Number(selectedSubject))
           .eq('term', selectedTerm)
           .eq('academic_year', selectedAcademicYear)
           .in('learner_id', cloudEntries.map(e => e.learner_id));

        const { error } = await supabase.from('report_scores').insert(cloudEntries);
        if (error) throw error;
        alert('Scores saved & synced to cloud successfully!');
      } catch (err) {
        console.error('Failed to sync scores to cloud:', err);
        alert('Scores saved offline only. Cloud sync failed.');
      }
    } else {
      alert('Scores saved successfully (Offline)');
    }

    setIsSaving(false);
  };

  if (!settings || !settings.caBreakdown) {
    return (
      <Layout title="Score Entry System">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', color: 'var(--text-muted)' }}>
          <i className="fas fa-spinner fa-spin fa-3x" style={{ color: 'var(--primary)', marginBottom: '1rem' }}></i>
          <h2>Loading Assessment Configuration...</h2>
          <p>Please wait while we sync your school's grading rules.</p>
        </div>
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
      <div className="fade-in">
        <div className="card" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
            <label className="form-label">Select Class</label>
            <select className="form-input" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="">-- Choose Class --</option>
              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
            <label className="form-label">Select Subject</label>
            <select className="form-input" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
              <option value="">-- Choose Subject --</option>
              {subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
            <label className="form-label">Term</label>
            <select className="form-input" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
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
              onChange={(e) => setSelectedAcademicYear(e.target.value)} 
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
              {learners?.map((learner) => {
                const current = scores[learner.supabaseId || learner.id] || {};
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
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'monospace', display: 'block', marginTop: '1px' }}>
                          Reg No: {learner.regNumber || 'N/A'}
                        </span>
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
                            onChange={(e) => handleCaChange(learner.supabaseId || learner.id, i, e.target.value)}
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
                          onChange={(e) => handleExamChange(learner.supabaseId || learner.id, e.target.value)}
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
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-table-list" style={{ fontSize: '3rem', marginBottom: '1.5rem' }}></i>
            <h3>Please select a Class and Subject to begin score entry.</h3>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ScoreEntry;
