import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../lib/db';
import { calculateCaTotal, calculateExamTotal, calculateTotal, calculateGrade } from '../../lib/grading';
import authService from '../../services/authService';
import LearnerPhoto from '../../components/common/LearnerPhoto';

const DEFAULT_GRADING_SCALE = [
  { min: 90, max: 100, grade: 'A1', remark: 'Excellent' },
  { min: 80, max: 89,  grade: 'B2', remark: 'Very Good' },
  { min: 70, max: 79,  grade: 'B3', remark: 'Good' },
  { min: 60, max: 69,  grade: 'C4', remark: 'Credit' },
  { min: 55, max: 59,  grade: 'C5', remark: 'Credit' },
  { min: 50, max: 54,  grade: 'C6', remark: 'Credit' },
  { min: 45, max: 49,  grade: 'D7', remark: 'Pass' },
  { min: 40, max: 44,  grade: 'E8', remark: 'Pass' },
  { min: 0,  max: 39,  grade: 'F9', remark: 'Fail' },
];

function getGrade(total, scale) {
  if (total === null || total === undefined || isNaN(total)) return { grade: '—', remark: '—' };
  return calculateGrade(Number(total), scale);
}

function gradeColor(grade) {
  if (!grade || grade === '—') return { bg: 'rgba(100,116,139,0.08)', text: '#64748b' };
  if (grade === 'F9') return { bg: 'rgba(239,68,68,0.10)', text: '#dc2626' };
  if (grade.startsWith('A') || grade.startsWith('B')) return { bg: 'rgba(16,185,129,0.10)', text: '#047857' };
  return { bg: 'rgba(245,158,11,0.10)', text: '#b45309' };
}

function ordinal(n) {
  if (!n) return '—';
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

const ParentReportView = () => {
  const { learnerId } = useParams();
  const navigate = useNavigate();
  const parent = authService.getCurrentParent();

  // Atomic multi-table Dexie query to prevent reactive cascading waterfalls
  const viewData = useLiveQuery(async () => {
    if (!learnerId) return null;
    
    try {
      // 1. Resolve active learner robustly
      let learner = null;
      const numId = Number(learnerId);
      if (!isNaN(numId)) {
        learner = await db.learners.get(numId);
      }
      if (!learner) {
        learner = await db.learners.where('supabaseId').equals(learnerId).first();
      }
      if (!learner) {
        learner = await db.learners.where('learnerId').equals(learnerId).first();
      }
      if (!learner) return { notFound: true };

      const schoolId = learner.schoolId;
      const currentClassId = learner.currentClassId;

      const resolvedLearnerId = learner.supabaseId || String(learner.id);

      // Include both numeric and string versions of the local ID, and the Supabase UUID string to ensure proper matching
      const siblingKeys = Array.from(new Set([
        resolvedLearnerId,
        learner.id, // Number type key
        String(learner.id), // String type key
        learner.supabaseId ? String(learner.supabaseId) : null,
        learner.learnerId ? String(learner.learnerId) : null,
        learner.learnerId ? Number(learner.learnerId) : null
      ].filter(Boolean)));

      // 2. Fetch all dependencies in parallel
      const [
        school,
        settings,
        allClasses,
        allClassSubjects,
        allSubjs,
        scoresList,
        summariesList,
        learnersInClass
      ] = await Promise.all([
        schoolId ? db.schools.get(schoolId) : null,
        schoolId ? db.settings.get(schoolId) : db.settings.get('global'),
        schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [],
        schoolId ? db.classSubjects.where('schoolId').equals(schoolId).toArray() : [],
        schoolId ? db.subjects.where('schoolId').equals(schoolId).toArray() : [],
        db.scores.where('learnerId').anyOf(siblingKeys).toArray(),
        db.reportSummaries.where('learnerId').anyOf(siblingKeys).toArray(),
        currentClassId ? db.learners.where('currentClassId').equals(currentClassId).toArray() : []
      ]);

      return {
        activeLearner: learner,
        schoolInfo: school,
        schoolSettings: settings || { gradingScale: [] },
        classes: allClasses,
        classSubjects: allClassSubjects,
        subjects: allSubjs,
        allScores: scoresList,
        reportSummaries: summariesList,
        classLearners: learnersInClass
      };
    } catch (err) {
      console.error('[ParentReportView useLiveQuery Error]', err);
      return { error: true, message: err.message || String(err) };
    }
  }, [learnerId]);

  const activeLearner = viewData?.activeLearner;
  const schoolInfo = viewData?.schoolInfo;
  const schoolSettings = viewData?.schoolSettings;
  const classes = viewData?.classes;
  const classSubjects = viewData?.classSubjects;
  const subjects = viewData?.subjects;
  const allScores = viewData?.allScores;
  const reportSummaries = viewData?.reportSummaries;
  const classLearners = viewData?.classLearners;

  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  const learnerSummaries = useMemo(() => {
    if (!activeLearner || !reportSummaries) return [];
    return reportSummaries.filter(s =>
      (s.learnerId === activeLearner.id || s.learnerId === String(activeLearner.id) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId))
    );
  }, [activeLearner, reportSummaries]);

  const availableYears = useMemo(() => {
    const years = new Set();
    if (schoolInfo?.currentAcademicYear) {
      years.add(schoolInfo.currentAcademicYear);
    }
    learnerSummaries.forEach(s => {
      if (s.academicYear) years.add(s.academicYear);
    });
    return Array.from(years).sort().reverse();
  }, [learnerSummaries, schoolInfo]);

  // Auto-init select criteria based on school term / available years
  React.useEffect(() => {
    if (schoolInfo) {
      if (!selectedTerm) setSelectedTerm(schoolInfo.currentTerm || 'Term 1');
    } else {
      if (!selectedTerm) setSelectedTerm('Term 1');
    }
  }, [schoolInfo, selectedTerm]);

  React.useEffect(() => {
    if (availableYears.length > 0 && !selectedYear) {
      setSelectedYear(availableYears[0]);
    } else if (schoolInfo && !selectedYear) {
      setSelectedYear(schoolInfo.currentAcademicYear || '');
    }
  }, [availableYears, schoolInfo, selectedYear]);

  const gradingScale = useMemo(() => {
    if (schoolSettings?.gradingScale?.length > 0) return schoolSettings.gradingScale;
    return DEFAULT_GRADING_SCALE;
  }, [schoolSettings]);

  const activeSummary = useMemo(() => {
    if (!activeLearner || !reportSummaries || !selectedYear || !selectedTerm) return null;
    return reportSummaries.find(s =>
      (s.learnerId === activeLearner.id || s.learnerId === String(activeLearner.id) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) && 
      s.academicYear === selectedYear && 
      s.term === selectedTerm
    );
  }, [activeLearner, reportSummaries, selectedYear, selectedTerm]);

  const isReportReleased = activeSummary && (activeSummary.isReleased || activeSummary.is_released);

  const currentClass = useMemo(() => {
    if (!activeLearner || !classes) return null;
    const classId = activeSummary ? Number(activeSummary.classId) : activeLearner.currentClassId;
    return classes.find(c => c.id === classId);
  }, [activeLearner, classes, activeSummary]);

  const classSubjectList = useMemo(() => {
    if (!activeLearner || !classSubjects || !subjects) return [];
    const classId = activeSummary ? Number(activeSummary.classId) : activeLearner.currentClassId;
    const ids = new Set(classSubjects.filter(cs => cs.classId === classId).map(cs => cs.subjectId));
    return subjects.filter(s => ids.has(s.id));
  }, [activeLearner, classSubjects, subjects, activeSummary]);

  // Filter learner scores for term/year
  const learnerGrades = useMemo(() => {
    if (!activeLearner || !classSubjectList.length || !allScores || !selectedTerm || !selectedYear) return [];
    
    const targetClassId = activeSummary ? Number(activeSummary.classId) : activeLearner.currentClassId;
    const termScores = allScores.filter(s => {
      const isStudent = s.learnerId === activeLearner.id || 
                        String(s.learnerId) === String(activeLearner.id) || 
                        (activeLearner.supabaseId && String(s.learnerId) === String(activeLearner.supabaseId));
      const isClass = String(s.classId) === String(targetClassId);
      const isTerm = String(s.term).trim().toLowerCase() === String(selectedTerm).trim().toLowerCase();
      const isYear = String(s.academicYear).trim().toLowerCase() === String(selectedYear).trim().toLowerCase();
      return isStudent && isClass && isTerm && isYear;
    });

    return classSubjectList.map(subj => {
      const rec = termScores.find(s => String(s.subjectId) === String(subj.id));
      const hasCa = rec?.caScores && Array.isArray(rec.caScores) && rec.caScores.some(score => score !== undefined && score !== null && score !== '');
      const hasExam = rec?.examScore !== undefined && rec.examScore !== null && rec.examScore !== '';
      
      // Use precalculated/compiled scores from database record when available to ensure 100% exact match
      const ca = (rec?.classScore !== undefined && rec?.classScore !== null && rec?.classScore !== '')
        ? Number(rec.classScore)
        : (hasCa ? calculateCaTotal(rec.caScores, schoolSettings) : null);
        
      const exam = hasExam ? calculateExamTotal(rec.examScore, schoolSettings) : null;
      
      const total = (rec?.totalScore !== undefined && rec?.totalScore !== null && rec?.totalScore !== '')
        ? Number(rec.totalScore)
        : ((hasCa || hasExam) ? calculateTotal(ca || 0, exam || 0) : null);
        
      let grade = '—';
      let remark = '—';
      
      if (rec?.grade && rec.grade !== '—' && rec.grade !== '-' && rec.grade.trim() !== '') {
        grade = rec.grade;
        remark = rec.remark || '';
      } else if (total !== null) {
        const computed = getGrade(total, gradingScale);
        grade = computed.grade;
        remark = computed.remark;
      }
      
      return {
        subjectName: subj.name,
        ca,
        exam,
        total,
        grade,
        remark
      };
    });
  }, [activeLearner, classSubjectList, allScores, selectedTerm, selectedYear, gradingScale, schoolSettings, activeSummary]);

  const stats = useMemo(() => {
    // If we have precomputed statistics saved, use them directly (ensure exact match and no leaks)
    if (activeSummary && 
        (activeSummary.classAverage !== undefined && activeSummary.classAverage !== null) && 
        (activeSummary.classRank !== undefined && activeSummary.classRank !== null)) {
      return {
        avg: activeSummary.classAverage,
        rank: activeSummary.classRank,
        totalGraded: activeSummary.totalGraded || 0
      };
    }

    if (!classLearners || !classLearners.length || !allScores || !selectedTerm || !selectedYear || !activeLearner) {
      return { avg: null, rank: null, totalGraded: 0 };
    }

    // Dynamic fallback for older unsynced records
    const targetClassId = activeSummary ? Number(activeSummary.classId) : activeLearner.currentClassId;
    const averagesMap = {};
    classLearners.forEach(l => {
      const ls = allScores.filter(s => 
        (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId)) && 
        s.classId === targetClassId && 
        s.term === selectedTerm && 
        s.academicYear === selectedYear
      );
      if (!ls.length) {
        averagesMap[l.id] = null;
        return;
      }
      averagesMap[l.id] = parseFloat((ls.reduce((sum, s) => sum + (Number(s.totalScore) || 0), 0) / ls.length).toFixed(2));
    });

    const activeAvg = averagesMap[activeLearner.id];
    
    const validScores = Object.entries(averagesMap)
      .filter(([, val]) => val !== null)
      .sort(([, a], [, b]) => b - a);

    const rankings = {};
    validScores.forEach(([id], index) => {
      rankings[id] = index + 1;
    });

    return {
      avg: activeAvg,
      rank: rankings[activeLearner.id] || null,
      totalGraded: validScores.length
    };
  }, [classLearners, allScores, selectedTerm, selectedYear, activeLearner, activeSummary]);

  // Attendance rate math
  const attendancePercent = useMemo(() => {
    if (!activeSummary) return 0;
    const present = Number(activeSummary.attendancePresent);
    const total = Number(activeSummary.attendanceTotal);
    if (isNaN(present) || isNaN(total) || total <= 0) return 0;
    return Math.round((present / total) * 100);
  }, [activeSummary]);

  const handlePrint = () => {
    window.print();
  };

  const getClassName = (classId) => {
    return classes?.find(c => c.id === classId || String(c.id) === String(classId))?.name || 'Grade';
  };

  const conduct   = activeSummary?.conduct           || '—';
  const attitude  = activeSummary?.attitude          || '—';
  const tRemark   = activeSummary?.teacherRemark     || '—';
  const hRemark   = activeSummary?.headteacherRemark || '—';
  const attP      = activeSummary?.attendancePresent ?? '—';
  const attT      = activeSummary?.attendanceTotal   ?? '—';
  const vDate     = schoolInfo?.vacationDate || '—';
  const nDate     = activeSummary?.nextTermBegins || schoolInfo?.nextTermBegins || '—';
  const promoted  = activeSummary?.promotedTo || '';
  const fees      = activeSummary?.feesOwed || '';
  const bill      = activeSummary?.nextTermBill || '';

  const getPromotedClassName = (promVal) => {
    if (!promVal) return '';
    if (promVal === 'Alumni') return 'Alumni (Graduated)';
    const cls = classes?.find(c => c.id === Number(promVal));
    return cls ? cls.name : `Class ${promVal}`;
  };

  // Diagnostics to assist in browser debugging (F12)
  React.useEffect(() => {
    if (activeLearner) {
      console.log('[ParentReportView Diagnostic]', {
        activeLearner: {
          id: activeLearner.id,
          supabaseId: activeLearner.supabaseId,
          fullName: activeLearner.fullName,
          currentClassId: activeLearner.currentClassId
        },
        schoolInfo,
        selectedTerm,
        selectedYear,
        activeSummary,
        allScoresCount: allScores?.length,
        allScores: allScores,
        classSubjectList: classSubjectList,
        learnerGrades: learnerGrades
      });
    }
  }, [activeLearner, schoolInfo, selectedTerm, selectedYear, activeSummary, allScores, classSubjectList, learnerGrades]);

  // Track and log when parent views the report card
  React.useEffect(() => {
    if (activeSummary && isReportReleased && !activeSummary.parentViewedAt) {
      db.reportSummaries.update(activeSummary.id, {
        parentViewedAt: new Date().toISOString(),
        synced: false
      }).catch(err => console.warn('Failed to log parent view status:', err));
    }
  }, [activeSummary, isReportReleased]);

  if (!viewData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: '#64748b' }}>
        <div>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '1rem', color: '#0d9488' }}></i>
          <p>Loading report card details...</p>
        </div>
      </div>
    );
  }

  if (viewData?.error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: '#64748b', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <i className="fas fa-exclamation-triangle" style={{ fontSize: '3rem', color: '#ef4444' }}></i>
        <h2 style={{ color: '#0f172a' }}>Database Query Error</h2>
        <p>An unexpected error occurred while loading this sibling's academic records.</p>
        <code style={{ background: '#f1f5f9', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#ef4444' }}>
          {viewData.message}
        </code>
        <button onClick={() => navigate('/parent/dashboard')} style={{ padding: '0.6rem 1.5rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', marginTop: '1rem' }}>
          Return to Sibling Dashboard
        </button>
      </div>
    );
  }

  if (viewData.notFound || !activeLearner) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: '#64748b', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <i className="fas fa-exclamation-triangle" style={{ fontSize: '3rem', color: '#f59e0b' }}></i>
        <h2 style={{ color: '#0f172a' }}>Student Not Found</h2>
        <p>We could not locate this sibling's profile record in your local database.</p>
        <button onClick={() => navigate('/parent/dashboard')} style={{ padding: '0.6rem 1.5rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (activeSummary && !isReportReleased) {
    return (
      <div className="report-view-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: '1.5rem' }}>
        <style>{`
          .report-view-container {
            font-family: 'Outfit', 'Inter', system-ui, sans-serif;
          }
        `}</style>
        <div style={{ width: '100%', maxWidth: '500px', background: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', padding: '2.5rem', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)', textAlign: 'center' }}>
          <div style={{ width: '72px', height: '72px', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '2rem', boxShadow: '0 10px 25px rgba(245, 158, 11, 0.15)' }}>
            <i className="fas fa-lock"></i>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>Report Card Pending Release</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 2rem' }}>
            The terminal report card for <strong>{activeLearner?.fullName}</strong> in <strong>{selectedTerm} ({selectedYear})</strong> is currently undergoing final review and has not yet been officially released by the Headteacher.
          </p>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '1.25rem', textAlign: 'left', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', fontSize: '0.82rem' }}>
              <i className="fas fa-info-circle" style={{ color: '#3b82f6', marginTop: '2px' }}></i>
              <div>
                <strong style={{ color: '#fff' }}>Official Publication:</strong>
                <p style={{ color: '#94a3b8', margin: '2px 0 0' }}>Once the Headteacher completes review and signs off, the grades and advisory endorsements will be published instantly.</p>
              </div>
            </div>
          </div>
          <button 
            onClick={() => navigate('/parent/dashboard')} 
            style={{ width: '100%', padding: '0.9rem', background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(13, 148, 136, 0.25)', transition: 'all 0.2s' }}
          >
            <i className="fas fa-arrow-left"></i> Return to Sibling Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="report-view-container">
      <style>{`
        .report-view-container {
          min-height: 100vh;
          background: #f1f5f9;
          font-family: 'Outfit', 'Inter', system-ui, sans-serif;
          padding: 2rem 1rem 4rem;
        }

        .report-page-wrap {
          max-width: 900px;
          margin: 0 auto;
        }

        .controls-card {
          background: #fff;
          border-radius: 16px;
          padding: 1.25rem 1.5rem;
          box-shadow: 0 4px 15px rgba(15, 23, 42, 0.03);
          border: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .btn-back-dash {
          background: transparent;
          border: none;
          color: #475569;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: color 0.2s;
        }

        .btn-back-dash:hover {
          color: #0f172a;
        }

        .filters-group {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .filter-select {
          padding: 0.45rem 1rem;
          border: 1.5px solid #cbd5e1;
          border-radius: 10px;
          font-size: 0.85rem;
          font-family: inherit;
          background: #fff;
          outline: none;
          color: #1e293b;
          font-weight: 600;
        }

        .btn-print {
          background: #0d9488;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 0.5rem 1.1rem;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
        }

        .btn-print:hover {
          background: #0f766e;
          box-shadow: 0 6px 16px rgba(13, 148, 136, 0.35);
        }

        /* ── Report Card Canvas Layout ── */
        .rc-canvas {
          background: white;
          border: 3px double #b45309;
          border-radius: 18px;
          padding: 2rem;
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
          font-family: 'Outfit', 'Inter', sans-serif;
          color: #0f172a;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .rc-canvas-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          border-bottom: 2px double #b45309;
          padding-bottom: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .rc-school-logo {
          width: 68px; height: 68px;
          border-radius: 50%;
          border: 2px solid #b45309;
          object-fit: cover;
          flex-shrink: 0;
        }
        .rc-school-logo-ph {
          width: 68px; height: 68px;
          border-radius: 50%;
          border: 2px solid #b45309;
          background: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #b45309;
          font-size: 1.75rem;
          flex-shrink: 0;
        }
        .rc-student-photo {
          width: 72px; height: 84px;
          border-radius: 8px;
          border: 2px solid #e2e8f0;
          object-fit: cover;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .rc-student-photo-ph {
          width: 72px; height: 84px;
          border-radius: 8px;
          border: 2px dashed #e2e8f0;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          font-size: 0.5rem;
          font-weight: 700;
          text-transform: uppercase;
          gap: 4px;
          flex-shrink: 0;
        }

        .rc-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .rc-doc-badge {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: #f8fafc;
          padding: 0.4rem 1.1rem;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          color: #0f172a;
        }
        .rc-kpis { display: flex; gap: 0.6rem; }
        .rc-kpi {
          width: 58px; height: 58px;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
        }
        .rc-kpi-lbl { font-size: 0.44rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
        .rc-kpi-val { font-size: 0.88rem; font-weight: 900; line-height: 1; color: #0f172a; }

        .rc-bio-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
          background: #f8fafc;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          margin-bottom: 1.5rem;
          font-size: 0.78rem;
        }
        .rc-bio-item {
          color: #0f172a;
          font-weight: 700;
        }
        .rc-bio-item strong { color: #64748b; font-weight: 600; margin-right: 4px; }

        /* Grades table */
        .rc-table-wrap { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 1.25rem; }
        .rc-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        .rc-table thead tr { background: #0f172a; color: white; }
        .rc-table th { padding: 0.6rem 0.8rem; font-weight: 700; text-align: left; }
        .rc-table th.c, .rc-table td.c { text-align: center; }
        .rc-table tbody tr { border-bottom: 1px solid #e2e8f0; }
        .rc-table tbody tr:last-child { border-bottom: none; }
        .rc-table tbody tr:nth-child(even) { background: #f8fafc; }
        .rc-table td { padding: 0.55rem 0.8rem; }
        .rc-gbadge { display: inline-block; padding: 2px 10px; border-radius: 6px; font-weight: 800; font-size: 0.72rem; }

        /* ── Bottom Grid for Grading, Conduct, Next Term, Remarks ── */
        .rc-bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .rc-sbox {
          background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 10px; padding: 0.85rem 1rem; font-size: 0.78rem;
        }
        .rc-sbox h4 {
          margin: 0 0 6px; font-size: 0.8rem; font-weight: 800;
          color: #0f172a; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px;
        }
        .rc-sbox p { margin: 3px 0; line-height: 1.45; }
        .rc-sbox p strong { color: #64748b; font-weight: 600; margin-right: 4px; }
        
        .rc-remarks-box {
          grid-column: span 2;
        }
        .rc-legend-sbox {
          grid-column: span 1;
        }
        .rc-legend-content {
          display: flex; gap: 5px; flex-wrap: wrap;
          font-size: 0.67rem; color: #64748b; align-items: center;
        }
        .rc-legend-item {
          color: #64748b;
        }

        .rc-sig-strip { display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 1rem; gap: 1rem; margin-top: auto; }
        .rc-sig-block { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 120px; font-size: 0.7rem; font-weight: 700; text-align: center; color: #0f172a; }
        .rc-sig-line { width: 100%; height: 1px; background: #cbd5e1; margin-bottom: 5px; margin-top: 28px; }

        /* ── Flawless A4 Print Stylesheet ── */
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          .report-page-wrap, .report-page-wrap * {
            visibility: visible !important;
          }
          .report-page-wrap {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .report-view-container {
            padding: 0 !important;
            background: white !important;
          }
          .rc-canvas {
            border: 3px double #b45309 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            width: 210mm !important;
            height: 296mm !important;
            padding: 10mm !important;
            box-sizing: border-box !important;
            background: white !important;
            page-break-inside: avoid !important;
            position: relative !important;
            margin: 0 auto !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }
          
          /* Compact layouts to guarantee everything fits on one sheet */
          .rc-canvas-header {
            padding-bottom: 0.5rem !important;
            margin-bottom: 0.5rem !important;
          }
          .rc-title-row {
            margin-bottom: 0.5rem !important;
          }
          .rc-bio-grid {
            padding: 0.4rem 0.5rem !important;
            margin-bottom: 0.5rem !important;
            gap: 4px !important;
            font-size: 0.7rem !important;
          }
          .rc-table th, .rc-table td {
            padding: 0.25rem 0.4rem !important;
            font-size: 0.7rem !important;
          }
          .rc-table-wrap {
            margin-bottom: 0.5rem !important;
          }
          .rc-bottom-grid {
            margin-bottom: 0.5rem !important;
            gap: 0.5rem !important;
          }
          .rc-sbox {
            padding: 0.4rem 0.5rem !important;
            font-size: 0.7rem !important;
          }
          .rc-legend-content {
            font-size: 0.6rem !important;
          }
          .rc-sig-strip {
            padding-top: 0.5rem !important;
            margin-top: auto !important;
          }
          .rc-sig-line {
            margin-top: 15px !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }

        @media (max-width: 768px) {
          .rc-bio-grid {
            grid-template-columns: 1fr 1fr;
          }
          .rc-bottom-grid {
            grid-template-columns: 1fr;
          }
          .rc-remarks-box {
            grid-column: span 1;
          }
          .rc-sig-strip {
            flex-wrap: wrap;
            gap: 1.5rem;
          }
          .rc-canvas {
            padding: 1.5rem 1rem;
          }
        }
      `}</style>

      <div className="report-page-wrap">
        {/* Controls Card */}
        <div className="controls-card no-print">
          <button className="btn-back-dash" onClick={() => navigate('/parent/dashboard')}>
            <i className="fas fa-arrow-left"></i> Sibling Dashboard
          </button>
          
          <div className="filters-group">
            {schoolInfo && (
              <>
                <select 
                  className="filter-select"
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>

                <select 
                  className="filter-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </>
            )}

            <button className="btn-print" onClick={handlePrint}>
              <i className="fas fa-print"></i> Print Report Card
            </button>
          </div>
        </div>

        {/* Report Card Canvas */}
        <div className="rc-canvas">
          {/* Header */}
          <div className="rc-canvas-header">
            {schoolInfo?.logoUrl
              ? <img src={schoolInfo.logoUrl} alt="logo" className="rc-school-logo" />
              : <div className="rc-school-logo-ph"><i className="fas fa-school" /></div>}
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.4px' }}>
                {schoolInfo?.name || 'Labour Edu Academy'}
              </h1>
              {schoolInfo?.motto && (
                <p style={{ margin: '2px 0 0', fontStyle: 'italic', fontSize: '0.7rem', color: '#b45309', fontWeight: 600 }}>
                  &ldquo;{schoolInfo.motto}&rdquo;
                </p>
              )}
              <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#64748b' }}>
                {[schoolInfo?.location, schoolInfo?.district, schoolInfo?.region].filter(Boolean).join(' • ')}
              </p>
            </div>
            <LearnerPhoto
              photo={activeLearner.photo || activeLearner.photoUrl || null}
              alt={activeLearner.fullName}
              className="rc-student-photo"
            />
          </div>

          {/* Title row + KPIs */}
          <div className="rc-title-row">
            <span className="rc-doc-badge">Terminal Report Card</span>
            <div className="rc-kpis">
              <div className="rc-kpi" style={{ background: '#f0fdfa', border: '2px solid #0d9488' }}>
                <span className="rc-kpi-lbl" style={{ color: '#0d9488' }}>Avg</span>
                <span className="rc-kpi-val">{stats.avg !== null && stats.avg !== undefined ? `${stats.avg}%` : '—'}</span>
              </div>
              <div className="rc-kpi" style={{ background: '#fdf2f8', border: '2px solid #db2777' }}>
                <span className="rc-kpi-lbl" style={{ color: '#db2777' }}>Rank</span>
                <span className="rc-kpi-val">{ordinal(stats.rank)}</span>
              </div>
              <div className="rc-kpi" style={{ background: '#fefce8', border: '2px solid #ca8a04' }}>
                <span className="rc-kpi-lbl" style={{ color: '#ca8a04' }}>Of</span>
                <span className="rc-kpi-val">{stats.totalGraded}</span>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="rc-bio-grid">
            <div className="rc-bio-item"><strong>Name:</strong>{activeLearner.fullName}</div>
            <div className="rc-bio-item"><strong>Reg No:</strong>{activeLearner.regNumber || '—'}</div>
            <div className="rc-bio-item"><strong>Gender:</strong>{activeLearner.gender || '—'}</div>
            <div className="rc-bio-item"><strong>Class:</strong>{currentClass?.name || '—'}</div>
            <div className="rc-bio-item"><strong>Academic Year:</strong>{selectedYear || '—'}</div>
            <div className="rc-bio-item"><strong>Term:</strong>{selectedTerm}</div>
          </div>

          {/* Grades table */}
          {learnerGrades.length > 0 ? (
            <div className="rc-table-wrap">
              <table className="rc-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th className="c">CA</th>
                    <th className="c">Exam</th>
                    <th className="c">Total</th>
                    <th className="c">Grade</th>
                    <th>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {learnerGrades.map((g, i) => {
                    const gc = gradeColor(g.grade);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{g.subjectName}</td>
                        <td className="c">{g.ca !== null ? Number(g.ca).toFixed(1) : '—'}</td>
                        <td className="c">{g.exam !== null ? Number(g.exam).toFixed(1) : '—'}</td>
                        <td className="c" style={{ fontWeight: 700, color: '#0f172a' }}>{g.total !== null ? Number(g.total).toFixed(1) : '—'}</td>
                        <td className="c"><span className="rc-gbadge" style={{ background: gc.bg, color: gc.text }}>{g.grade}</span></td>
                        <td style={{ color: gc.text, fontWeight: 600 }}>{g.remark}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed #e2e8f0', borderRadius: '10px', color: '#94a3b8', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
              No subject score entries compiled for this term yet.
            </div>
          )}

          {/* ── Compact Bottom Grid ── */}
          <div className="rc-bottom-grid">
            {/* Legend */}
            <div className="rc-sbox rc-legend-sbox">
              <h4>Grading Scale</h4>
              <div className="rc-legend-content">
                {gradingScale.map((s, i) => (
                  <span key={i} className="rc-legend-item">
                    <strong>{s.grade}</strong> ({s.min}–{s.max}%)
                  </span>
                ))}
              </div>
            </div>

            {/* Conduct + Next term */}
            <div className="rc-sbox">
              <h4>Conduct &amp; Attendance</h4>
              <p><strong>Attendance:</strong> {attP} of {attT} days</p>
              <p><strong>Conduct:</strong> {conduct}</p>
              <p><strong>Attitude:</strong> {attitude}</p>
            </div>

            <div className="rc-sbox">
              <h4>Next Term &amp; Financials</h4>
              <p><strong>Vacation Date:</strong> {vDate}</p>
              <p><strong>Resumes:</strong> {nDate}</p>
              {promoted && (
                <p style={{ color: '#0d9488', fontWeight: 'bold', marginTop: '4px' }}>
                  <i className="fas fa-trophy" style={{ marginRight: '4px' }}></i>
                  Decision: Promoted to {getPromotedClassName(promoted)}
                </p>
              )}
              {(fees || bill) && (
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
                  {bill && <p><strong>Next Term Bill:</strong> {bill}</p>}
                  {fees && <p><strong>Previous Arrears:</strong> {fees}</p>}
                </div>
              )}
            </div>

            {/* Remarks */}
            <div className="rc-sbox rc-remarks-box">
              <h4>Advisory Remarks</h4>
              <p><strong>Class Advisor:</strong> {tRemark}</p>
              {hRemark && hRemark !== '—' && hRemark.trim() !== '' && (
                <p><strong>Headteacher:</strong> {hRemark}</p>
              )}
            </div>
          </div>

          {/* Signatures */}
          <div className="rc-sig-strip">
            <div className="rc-sig-block"><div className="rc-sig-line" />Class Advisor's Signature</div>
            <div className="rc-sig-block"><div className="rc-sig-line" />School Stamp &amp; Date</div>
            <div className="rc-sig-block"><div className="rc-sig-line" />Headteacher's Signature</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentReportView;
