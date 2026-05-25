import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../lib/db';
import { calculateCaTotal, calculateExamTotal, calculateTotal } from '../../lib/grading';
import authService from '../../services/authService';

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
  const n = Number(total);
  return scale.find(g => n >= g.min && n <= g.max) || { grade: 'F9', remark: 'Fail' };
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
      db.classes.toArray(),
      db.classSubjects.toArray(),
      db.subjects.toArray(),
      db.scores.toArray(),
      db.reportSummaries.toArray(),
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

  // Auto-init select criteria based on current school term
  React.useEffect(() => {
    if (schoolInfo) {
      if (!selectedTerm) setSelectedTerm(schoolInfo.currentTerm || 'Term 1');
      if (!selectedYear) setSelectedYear(schoolInfo.currentAcademicYear || '');
    }
  }, [schoolInfo, selectedTerm, selectedYear]);

  const gradingScale = useMemo(() => {
    if (schoolSettings?.gradingScale?.length > 0) return schoolSettings.gradingScale;
    return DEFAULT_GRADING_SCALE;
  }, [schoolSettings]);

  const currentClass = useMemo(() => {
    if (!activeLearner || !classes) return null;
    return classes.find(c => c.id === activeLearner.currentClassId);
  }, [activeLearner, classes]);

  const classSubjectList = useMemo(() => {
    if (!activeLearner || !classSubjects || !subjects) return [];
    const classId = activeLearner.currentClassId;
    const ids = new Set(classSubjects.filter(cs => cs.classId === classId).map(cs => cs.subjectId));
    return subjects.filter(s => ids.has(s.id));
  }, [activeLearner, classSubjects, subjects]);

  // Filter learner scores for term/year
  const learnerGrades = useMemo(() => {
    if (!activeLearner || !classSubjectList.length || !allScores || !selectedTerm || !selectedYear) return [];
    
    const termScores = allScores.filter(s => 
      (s.learnerId === activeLearner.id || s.learnerId === String(activeLearner.id) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) && 
      s.classId === activeLearner.currentClassId && 
      s.term === selectedTerm && 
      s.academicYear === selectedYear
    );

    return classSubjectList.map(subj => {
      const rec = termScores.find(s => s.subjectId === subj.id);
      const hasCa = rec?.caScores && Array.isArray(rec.caScores) && rec.caScores.some(score => score !== undefined && score !== null && score !== '');
      const hasExam = rec?.examScore !== undefined && rec.examScore !== null && rec.examScore !== '';
      const ca = hasCa ? calculateCaTotal(rec.caScores, schoolSettings) : null;
      const exam = hasExam ? calculateExamTotal(rec.examScore, schoolSettings) : null;
      const total = (hasCa || hasExam) ? calculateTotal(ca || 0, exam || 0) : null;
      const { grade, remark } = getGrade(total, gradingScale);
      
      return {
        subjectName: subj.name,
        ca,
        exam,
        total,
        grade,
        remark
      };
    });
  }, [activeLearner, classSubjectList, allScores, selectedTerm, selectedYear, gradingScale, schoolSettings]);

  const activeSummary = useMemo(() => {
    if (!activeLearner || !reportSummaries || !selectedYear || !selectedTerm) return null;
    return reportSummaries.find(s =>
      (s.learnerId === activeLearner.id || s.learnerId === String(activeLearner.id) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) && 
      s.academicYear === selectedYear && 
      s.term === selectedTerm
    );
  }, [activeLearner, reportSummaries, selectedYear, selectedTerm]);

  const stats = useMemo(() => {
    if (!classLearners || !classLearners.length || !allScores || !selectedTerm || !selectedYear || !activeLearner) {
      return { avg: null, rank: null, totalGraded: 0 };
    }

    // Calculate average for all students in this class
    const averagesMap = {};
    classLearners.forEach(l => {
      const ls = allScores.filter(s => 
        (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId)) && 
        s.classId === activeLearner.currentClassId && 
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
    
    // Compute positions
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
  }, [classLearners, allScores, selectedTerm, selectedYear, activeLearner]);

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

  const isReportReleased = activeSummary && (activeSummary.isReleased || activeSummary.is_released);

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
          background: #fff;
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .rc-canvas-header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          border-bottom: 2.5px double #e2e8f0;
          padding-bottom: 1.25rem;
          margin-bottom: 1.5rem;
        }

        .rc-school-logo-ph {
          width: 60px;
          height: 60px;
          background: rgba(13, 148, 136, 0.1);
          color: #0d9488;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
        }

        .rc-student-photo-ph {
          width: 72px;
          height: 72px;
          border-radius: 14px;
          border: 1px solid #cbd5e1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 0.6rem;
          background: #f8fafc;
          color: #94a3b8;
          font-weight: 700;
        }

        .rc-student-photo {
          width: 72px;
          height: 72px;
          border-radius: 14px;
          object-fit: cover;
          border: 1px solid #cbd5e1;
        }

        .rc-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
        }

        .rc-doc-badge {
          background: rgba(13, 148, 136, 0.1);
          color: #0d9488;
          font-weight: 800;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.35rem 0.85rem;
          border-radius: 8px;
        }

        .rc-kpis {
          display: flex;
          gap: 8px;
        }

        .rc-kpi {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 54px;
          height: 54px;
          border-radius: 12px;
        }

        .rc-kpi-lbl {
          font-size: 0.58rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          margin-bottom: 1px;
        }

        .rc-kpi-val {
          font-size: 0.85rem;
          font-weight: 800;
        }

        .rc-bio-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem 1.25rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 1rem 1.25rem;
          margin-bottom: 1.5rem;
          font-size: 0.85rem;
        }

        .rc-bio-item {
          color: #475569;
          font-weight: 600;
        }

        .rc-bio-item strong {
          color: #0f172a;
          margin-right: 6px;
          font-weight: 700;
        }

        .rc-table-wrap {
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }

        .rc-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          text-align: left;
        }

        .rc-table th {
          background: #f8fafc;
          color: #475569;
          font-weight: 800;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #cbd5e1;
        }

        .rc-table td {
          padding: 0.7rem 1rem;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }

        .rc-table tr:last-child td {
          border-bottom: none;
        }

        .rc-table th.c, .rc-table td.c {
          text-align: center;
        }

        .rc-gbadge {
          display: inline-block;
          font-weight: 800;
          font-size: 0.75rem;
          padding: 0.15rem 0.5rem;
          border-radius: 6px;
        }

        /* Bottom Section Grid */
        .rc-bottom-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.25rem;
          margin-bottom: 2rem;
        }

        .rc-sbox {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 1.1rem;
          font-size: 0.82rem;
        }

        .rc-sbox h4 {
          font-size: 0.75rem;
          font-weight: 800;
          color: #0d9488;
          text-transform: uppercase;
          margin: 0 0 0.6rem;
          letter-spacing: 0.05em;
        }

        .rc-sbox p {
          margin: 0 0 0.4rem;
          color: #475569;
        }

        .rc-sbox p strong {
          color: #0f172a;
          margin-right: 6px;
        }

        .rc-remarks-box {
          grid-column: span 3;
        }

        .rc-legend-sbox {
          grid-column: span 1;
        }

        .rc-legend-content {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4px;
          font-size: 0.68rem;
        }

        .rc-legend-item {
          color: #64748b;
        }

        /* Circle Attendance Indicator */
        .att-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 6px;
        }

        .att-circle {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 800;
          color: #0d9488;
          border: 2px solid #0d9488;
        }

        /* Signature block */
        .rc-sig-strip {
          display: flex;
          justify-content: space-between;
          margin-top: auto;
          padding-top: 1.5rem;
          border-top: 1px dashed #cbd5e1;
        }

        .rc-sig-block {
          text-align: center;
          font-size: 0.72rem;
          font-weight: 700;
          color: #64748b;
          width: 200px;
        }

        .rc-sig-line {
          height: 1px;
          background: #cbd5e1;
          margin-bottom: 6px;
          width: 100%;
        }

        /* ── Flawless A4 Print Stylesheet ── */
        @media print {
          body {
            background: white !important;
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
          .report-page-wrap {
            max-width: 100% !important;
          }
          .rc-canvas {
            border: 2px double #0d9488 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 8mm !important;
            width: 210mm !important;
            height: 297mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
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
                  <option value={schoolInfo.currentAcademicYear}>{schoolInfo.currentAcademicYear}</option>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2024/2025">2024/2025</option>
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
            {schoolInfo?.logoUrl ? (
              <img src={schoolInfo.logoUrl} alt="logo" style={{ width: '60px', height: '60px', borderRadius: '12px', objectFit: 'cover' }} />
            ) : (
              <div className="rc-school-logo-ph">
                <i className="fas fa-school"></i>
              </div>
            )}
            
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.4px' }}>
                {schoolInfo?.name || 'Labour Basic School'}
              </h1>
              {schoolInfo?.motto && (
                <p style={{ margin: '2px 0 0', fontStyle: 'italic', fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                  &ldquo;{schoolInfo.motto}&rdquo;
                </p>
              )}
              <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                {[schoolInfo?.location || 'Accra, Ghana', schoolInfo?.district, schoolInfo?.region].filter(Boolean).join(' • ')}
              </p>
            </div>

            {activeLearner.photoUrl || activeLearner.photo ? (
              <img src={activeLearner.photoUrl || activeLearner.photo} alt={activeLearner.fullName} className="rc-student-photo" />
            ) : (
              <div className="rc-student-photo-ph">
                <i className="fas fa-user-graduate" style={{ fontSize: '1.5rem', opacity: 0.35, marginBottom: '2px' }}></i>
                <span>Student</span>
              </div>
            )}
          </div>

          {/* KPI and Badges */}
          <div className="rc-title-row">
            <span className="rc-doc-badge">Terminal Report Card</span>
            <div className="rc-kpis">
              <div className="rc-kpi" style={{ background: '#f0fdfa', border: '2px solid #0d9488' }}>
                <span className="rc-kpi-lbl" style={{ color: '#0d9488' }}>Avg</span>
                <span className="rc-kpi-val" style={{ color: '#0f766e' }}>
                  {stats.avg !== null && stats.avg !== undefined ? `${stats.avg}%` : '—'}
                </span>
              </div>
              <div className="rc-kpi" style={{ background: '#fdf2f8', border: '2px solid #db2777' }}>
                <span className="rc-kpi-lbl" style={{ color: '#db2777' }}>Rank</span>
                <span className="rc-kpi-val" style={{ color: '#be185d' }}>
                  {ordinal(stats.rank)}
                </span>
              </div>
              <div className="rc-kpi" style={{ background: '#fefce8', border: '2px solid #ca8a04' }}>
                <span className="rc-kpi-lbl" style={{ color: '#ca8a04' }}>Of</span>
                <span className="rc-kpi-val" style={{ color: '#a16207' }}>
                  {stats.totalGraded}
                </span>
              </div>
            </div>
          </div>

          {/* Student Bio info */}
          <div className="rc-bio-grid">
            <div className="rc-bio-item"><strong>Student:</strong> {activeLearner.fullName}</div>
            <div className="rc-bio-item"><strong>Reg No:</strong> {activeLearner.regNumber}</div>
            <div className="rc-bio-item"><strong>Gender:</strong> {activeLearner.gender}</div>
            <div className="rc-bio-item"><strong>Class:</strong> {currentClass?.name || 'Grade'}</div>
            <div className="rc-bio-item"><strong>Academic Year:</strong> {selectedYear}</div>
            <div className="rc-bio-item"><strong>Term Period:</strong> {selectedTerm}</div>
          </div>

          {/* Grades table */}
          {learnerGrades.length > 0 ? (
            <div className="rc-table-wrap">
              <table className="rc-table">
                <thead>
                  <tr>
                    <th>Subject Title</th>
                    <th className="c">CA (30%)</th>
                    <th className="c">Exam (70%)</th>
                    <th className="c">Total (100%)</th>
                    <th className="c">Grade</th>
                    <th>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {learnerGrades.map((g, index) => {
                    const colors = gradeColor(g.grade);
                    return (
                      <tr key={index}>
                        <td style={{ fontWeight: 700, color: '#1e293b' }}>{g.subjectName}</td>
                        <td className="c">{g.ca !== null ? Number(g.ca).toFixed(1) : '—'}</td>
                        <td className="c">{g.exam !== null ? Number(g.exam).toFixed(1) : '—'}</td>
                        <td className="c" style={{ fontWeight: 800, color: '#0f172a' }}>{g.total !== null ? Number(g.total).toFixed(1) : '—'}</td>
                        <td className="c">
                          <span className="rc-gbadge" style={{ background: colors.bg, color: colors.text }}>
                            {g.grade}
                          </span>
                        </td>
                        <td style={{ color: colors.text, fontWeight: 700 }}>{g.remark}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem', border: '2.5px dashed #cbd5e1', borderRadius: '16px', color: '#94a3b8', marginBottom: '1.5rem' }}>
              <i className="fas fa-folder-open" style={{ fontSize: '2rem', marginBottom: '0.75rem', display: 'block' }}></i>
              No subject score entries compiled for this term yet.
            </div>
          )}

          {/* Advisory & Attendance Box */}
          <div className="rc-bottom-grid">
            <div className="rc-sbox rc-legend-sbox">
              <h4>Grade Legend</h4>
              <div className="rc-legend-content">
                {gradingScale.map((item, idx) => (
                  <span key={idx} className="rc-legend-item">
                    <strong>{item.grade}</strong> ({item.min}–{item.max}%)
                  </span>
                ))}
              </div>
            </div>

            <div className="rc-sbox">
              <h4>Attendance & Conduct</h4>
              <p><strong>Attendance:</strong> {activeSummary?.attendancePresent ?? '—'} of {activeSummary?.attendanceTotal ?? '—'} days</p>
              {activeSummary?.attendanceTotal > 0 && (
                <div className="att-indicator">
                  <div className="att-circle">{attendancePercent}%</div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Term Attendance Rate</span>
                </div>
              )}
              <p style={{ marginTop: '0.5rem' }}><strong>Conduct:</strong> {activeSummary?.conduct || '—'}</p>
              <p><strong>Attitude:</strong> {activeSummary?.attitude || '—'}</p>
            </div>

            <div className="rc-sbox">
              <h4>Next Term Schedule</h4>
              <p><strong>Vacation Date:</strong> {schoolInfo?.vacationDate || '—'}</p>
              <p><strong>Reopens:</strong> {activeSummary?.nextTermBegins || schoolInfo?.nextTermBegins || '—'}</p>
              {activeSummary?.promotedTo && (
                <div style={{ marginTop: '0.5rem', padding: '0.35rem 0.6rem', background: 'rgba(16,185,129,0.08)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.15)', fontSize: '0.75rem', color: '#047857', fontWeight: 700 }}>
                  <i className="fas fa-trophy" style={{ marginRight: '4px' }}></i> Promoted To: {getClassName(activeSummary.promotedTo)}
                </div>
              )}
            </div>

            <div className="rc-sbox rc-remarks-box">
              <h4>Advisory Remarks</h4>
              <p style={{ marginBottom: '0.65rem' }}><strong>Class Advisor's Comment:</strong> {activeSummary?.teacherRemark || '—'}</p>
              <p style={{ margin: 0 }}><strong>Principal's Endorsement:</strong> {activeSummary?.headteacherRemark || '—'}</p>
            </div>
          </div>

          {/* Signatures Footer */}
          <div className="rc-sig-strip">
            <div className="rc-sig-block">
              <div className="rc-sig-line"></div>
              Class Teacher
            </div>
            <div className="rc-sig-block">
              <div className="rc-sig-line"></div>
              School stamp &amp; Date
            </div>
            <div className="rc-sig-block">
              <div className="rc-sig-line"></div>
              Headteacher Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentReportView;
