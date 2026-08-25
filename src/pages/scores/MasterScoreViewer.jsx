import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../store/AuthContext';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import LogoPreloader from '../../components/common/LogoPreloader';

const MasterScoreViewer = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const schoolId = user?.schoolId;

  // Data states
  const [scores, setScores] = useState([]);
  const [learners, setLearners] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('2025/2026');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Broadsheet Modal & Layout Mode State ('cards' default or 'matrix')
  const [isBroadsheetOpen, setIsBroadsheetOpen] = useState(false);
  const [broadsheetViewMode, setBroadsheetViewMode] = useState('cards');
  const [cardsPerPage, setCardsPerPage] = useState(6); // 4, 6, or 8 learners per printed sheet

  // School profile query
  const schoolInfo = useLiveQuery(
    () => schoolId ? db.schools.get(schoolId) : null,
    [schoolId]
  );

  // ── Load All System Data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [localClasses, localSubjects, localLearners, localScores] = await Promise.all([
        schoolId ? db.classes.filter(c => String(c.schoolId) === String(schoolId) || String(c.school_id || '') === String(schoolId)).toArray() : db.classes.toArray(),
        schoolId ? db.subjects.filter(s => String(s.schoolId) === String(schoolId) || String(s.school_id || '') === String(schoolId)).toArray() : db.subjects.toArray(),
        schoolId ? db.learners.filter(l => String(l.schoolId) === String(schoolId) || String(l.school_id || '') === String(schoolId)).toArray() : db.learners.toArray(),
        schoolId ? db.scores.filter(sc => String(sc.schoolId) === String(schoolId) || String(sc.school_id || '') === String(schoolId)).toArray() : db.scores.toArray(),
      ]);

      // Deduplicate subjects by normalized lowercase name
      const uniqueSubjMap = new Map();
      (localSubjects || []).forEach(s => {
        const normName = (s.name || '').trim().toLowerCase();
        if (normName && !uniqueSubjMap.has(normName)) {
          uniqueSubjMap.set(normName, s);
        }
      });

      setClasses(localClasses || []);
      setSubjects(Array.from(uniqueSubjMap.values()));
      setLearners(localLearners || []);

      let allScores = localScores || [];
      if (navigator.onLine && schoolId) {
        try {
          const { data: cloudScores, error } = await supabase
            .from('report_scores')
            .select('*')
            .eq('school_id', schoolId);

          if (!error && cloudScores && cloudScores.length > 0) {
            const mappedCloud = cloudScores.map(cs => ({
              id: cs.id,
              learnerId: cs.learner_id,
              classId: cs.class_id,
              subjectId: cs.subject_id,
              caScores: cs.ca_scores || [],
              classScore: cs.class_score ?? 0,
              examScore: cs.exam_score ?? 0,
              totalScore: cs.total_score ?? 0,
              grade: cs.grade || 'F',
              remark: cs.remark || '',
              isSubmitted: cs.is_submitted || false,
              term: cs.term || 'Term 1',
              academicYear: cs.academic_year || '2025/2026',
              synced: true,
            }));

            // Merge cloud scores with local scores to prevent duplicates
            const combinedMap = new Map();
            allScores.forEach(s => combinedMap.set(`${s.learnerId}_${s.subjectId}_${s.term}_${s.academicYear}`, s));
            mappedCloud.forEach(s => combinedMap.set(`${s.learnerId}_${s.subjectId}_${s.term}_${s.academicYear}`, s));
            allScores = Array.from(combinedMap.values());
          }
        } catch (cloudErr) {
          console.warn('[MasterScoreViewer] Could not fetch cloud scores, reading Dexie:', cloudErr);
        }
      }

      setScores(allScores);
    } catch (err) {
      console.error('[MasterScoreViewer] Data load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fast ID maps
  const classMap = useMemo(() => {
    const map = {};
    classes.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [classes]);

  const subjectMap = useMemo(() => {
    const map = {};
    subjects.forEach(s => { map[s.id] = s.name; });
    return map;
  }, [subjects]);

  const learnerMap = useMemo(() => {
    const map = {};
    learners.forEach(l => { map[l.id] = l; });
    return map;
  }, [learners]);

  // Academic Years dropdown options
  const academicYears = useMemo(() => {
    const set = new Set(['2025/2026', '2024/2025']);
    scores.forEach(s => { if (s.academicYear) set.add(s.academicYear); });
    return Array.from(set);
  }, [scores]);

  // Filtered master score records
  const filteredScores = useMemo(() => {
    return scores.filter(sc => {
      if (selectedAcademicYear && sc.academicYear !== selectedAcademicYear) return false;
      if (selectedTerm && sc.term !== selectedTerm) return false;
      if (selectedClass !== 'all' && String(sc.classId) !== String(selectedClass)) return false;
      if (selectedSubject !== 'all' && String(sc.subjectId) !== String(selectedSubject)) return false;
      if (statusFilter === 'submitted' && !sc.isSubmitted) return false;
      if (statusFilter === 'draft' && sc.isSubmitted) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const learner = learnerMap[sc.learnerId];
        const learnerName = learner?.fullName || `${learner?.firstName || ''} ${learner?.lastName || ''}`;
        const reg = learner?.regNumber || '';
        const subj = subjectMap[sc.subjectId] || '';
        const cls = classMap[sc.classId] || '';

        const match = learnerName.toLowerCase().includes(q) ||
          reg.toLowerCase().includes(q) ||
          subj.toLowerCase().includes(q) ||
          cls.toLowerCase().includes(q);

        if (!match) return false;
      }
      return true;
    });
  }, [scores, selectedAcademicYear, selectedTerm, selectedClass, selectedSubject, statusFilter, searchQuery, learnerMap, subjectMap, classMap]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = filteredScores.length;
    const submitted = filteredScores.filter(s => s.isSubmitted).length;
    const draft = total - submitted;
    const avgScore = total > 0
      ? (filteredScores.reduce((sum, s) => sum + Number(s.totalScore || 0), 0) / total).toFixed(1)
      : 0;

    return { total, submitted, draft, avgScore };
  }, [filteredScores]);

  // Broadsheet Computation Engine
  const broadsheetData = useMemo(() => {
    let targetLearners = learners || [];
    if (selectedClass !== 'all') {
      targetLearners = targetLearners.filter(l => String(l.currentClassId || l.classId) === String(selectedClass));
    }

    let targetSubjects = subjects || [];
    if (selectedSubject !== 'all') {
      targetSubjects = targetSubjects.filter(s => String(s.id) === String(selectedSubject));
    }

    // Filter out duplicate subjects by name
    const seenNames = new Set();
    targetSubjects = targetSubjects.filter(s => {
      const nameKey = (s.name || '').trim().toLowerCase();
      if (!nameKey || seenNames.has(nameKey)) return false;
      seenNames.add(nameKey);
      return true;
    });

    // Helper to normalize term string: "Term 1" -> "1", "1" -> "1"
    const normTerm = (t) => String(t || '').toLowerCase().replace(/term\s*/i, '').trim();

    // Helper to normalize academic year: "2025/2026" -> "20252026"
    const normYear = (y) => String(y || '').replace(/[\/\-\_\s]/g, '').trim();

    const selectedNormTerm = normTerm(selectedTerm);
    const selectedNormYear = normYear(selectedAcademicYear);

    // Build multi-key score map
    const scoreMap = new Map();
    (scores || []).forEach(sc => {
      const scTerm = normTerm(sc.term || sc.termId);
      const scYear = normYear(sc.academicYear || sc.academic_year);

      const termMatch = !scTerm || !selectedNormTerm || scTerm === selectedNormTerm;
      const yearMatch = !scYear || !selectedNormYear || scYear === selectedNormYear;

      if (termMatch && yearMatch) {
        const lIdKeys = [sc.learnerId, sc.learner_id, String(sc.learnerId), String(sc.learner_id)].filter(Boolean);
        const sIdKeys = [sc.subjectId, sc.subject_id, String(sc.subjectId), String(sc.subject_id)].filter(Boolean);

        for (const lk of lIdKeys) {
          for (const sk of sIdKeys) {
            scoreMap.set(`${lk}_${sk}`, sc);
          }
        }
      }
    });

    const rows = targetLearners.map(l => {
      const lKeys = [l.id, String(l.id), l.supabaseId, l.regNumber, l.enrollmentCode].filter(Boolean);
      let grandTotal = 0;
      let count = 0;
      const subScores = {};

      targetSubjects.forEach(s => {
        const sKeys = [s.id, String(s.id), s.supabaseId, (s.name || '').trim().toLowerCase()].filter(Boolean);
        let sc = null;

        for (const lk of lKeys) {
          for (const sk of sKeys) {
            sc = scoreMap.get(`${lk}_${sk}`);
            if (sc) break;
          }
          if (sc) break;
        }

        // Direct fallback search if scoreMap key mismatch
        if (!sc && scores) {
          sc = scores.find(item => {
            const itemLId = String(item.learnerId || item.learner_id || '');
            const itemSId = String(item.subjectId || item.subject_id || '');
            const matchL = lKeys.some(k => String(k) === itemLId);
            const matchS = sKeys.some(k => String(k) === itemSId);
            return matchL && matchS;
          });
        }

        if (sc) {
          const caRaw = sc.classScore ?? sc.caScore ?? sc.class_score;
          const examRaw = sc.examScore ?? sc.exam_score;
          const totRaw = sc.totalScore ?? sc.total_score;

          const hasCa = caRaw !== undefined && caRaw !== null && caRaw !== '' && !isNaN(Number(caRaw));
          const hasExam = examRaw !== undefined && examRaw !== null && examRaw !== '' && !isNaN(Number(examRaw));

          const caVal = hasCa ? Number(caRaw) : null;
          const examVal = hasExam ? Number(examRaw) : null;

          let totVal = null;
          if (totRaw !== undefined && totRaw !== null && totRaw !== '' && !isNaN(Number(totRaw))) {
            totVal = Number(totRaw);
          } else if (hasCa || hasExam) {
            totVal = (caVal || 0) + (examVal || 0);
          }

          if (totVal !== null) {
            grandTotal += totVal;
            count += 1;
          }

          subScores[s.id] = {
            name: s.name,
            ca: hasCa ? caVal : '—',
            exam: hasExam ? examVal : '—',
            total: totVal !== null ? totVal : '—',
            grade: totVal !== null ? (sc.grade || (totVal >= 80 ? 'A' : totVal >= 70 ? 'B' : totVal >= 60 ? 'C' : totVal >= 50 ? 'D' : 'F')) : '—'
          };
        } else {
          subScores[s.id] = { name: s.name, ca: '—', exam: '—', total: '—', grade: '—' };
        }
      });

      const average = count > 0 ? (grandTotal / count).toFixed(1) : 0;
      const className = classMap[l.currentClassId || l.classId] || 'Class —';

      return {
        learner: l,
        fullName: l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Unnamed Learner',
        regNumber: l.regNumber || l.enrollmentCode || '—',
        className,
        grandTotal,
        average: Number(average),
        subScores
      };
    });

    // Rank descending by grandTotal
    rows.sort((a, b) => b.grandTotal - a.grandTotal);

    // Assign positions handling ties
    rows.forEach((r, idx) => {
      if (idx > 0 && r.grandTotal === rows[idx - 1].grandTotal) {
        r.rank = rows[idx - 1].rank;
      } else {
        r.rank = idx + 1;
      }
    });

    return { rows, subjects: targetSubjects };
  }, [learners, subjects, scores, selectedClass, selectedSubject, selectedAcademicYear, selectedTerm, classMap]);

  // Split broadsheet rows into explicit paper pages (e.g. 6 learners per sheet)
  const cardPages = useMemo(() => {
    if (!broadsheetData.rows || broadsheetData.rows.length === 0) return [];
    const chunks = [];
    const pageSize = Number(cardsPerPage) || 6;
    for (let i = 0; i < broadsheetData.rows.length; i += pageSize) {
      chunks.push(broadsheetData.rows.slice(i, i + pageSize));
    }
    return chunks;
  }, [broadsheetData.rows, cardsPerPage]);

  const getGradeBadge = (grade) => {
    switch (grade) {
      case 'A': case 'A+': case 'A1': return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
      case 'B': case 'B2': case 'B3': return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' };
      case 'C': case 'C4': case 'C5': case 'C6': return { bg: '#fef9c3', color: '#a16207', border: '#fef08a' };
      case 'D': case 'D7': case 'E8': return { bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' };
      case 'F': case 'F9': default: return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
    }
  };

  const exportToCSV = () => {
    if (filteredScores.length === 0) return;

    const headers = ['Learner Code', 'Learner Name', 'Class', 'Subject', 'Academic Year', 'Term', 'Class Score (50%)', 'Exam Score (50%)', 'Total Score (100%)', 'Grade', 'Remark', 'Status'];

    const rows = filteredScores.map(sc => {
      const learner = learnerMap[sc.learnerId];
      const name = learner ? `"${learner.fullName || `${learner.firstName || ''} ${learner.lastName || ''}`}"` : '"Unknown"';
      const code = learner?.regNumber || learner?.enrollmentCode || sc.learnerId || '';
      const className = `"${classMap[sc.classId] || 'Unassigned'}"`;
      const subjectName = `"${subjectMap[sc.subjectId] || 'Unassigned'}"`;

      return [
        code,
        name,
        className,
        subjectName,
        sc.academicYear,
        sc.term,
        sc.classScore,
        sc.examScore,
        sc.totalScore,
        sc.grade,
        `"${sc.remark || ''}"`,
        sc.isSubmitted ? 'Submitted' : 'Draft'
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Master_Scores_Report_${selectedAcademicYear}_${selectedTerm}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedClassName = selectedClass === 'all' ? 'All Classes' : (classMap[selectedClass] || 'Class');

  return (
    <Layout title="All Scores Audit">
      {/* Print-only CSS rules designed never to cut off cards and print all learner sheets */}
      <style>{`
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background: #FFFFFF !important;
          }

          body * {
            visibility: hidden !important;
          }

          .no-print, .no-print-bg, header, nav, aside, footer, .sidebar, .header-container {
            display: none !important;
          }

          .broadsheet-modal-wrapper {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: auto !important;
          }

          .broadsheet-modal-dialog {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          #printable-broadsheet, #printable-broadsheet * {
            visibility: visible !important;
          }

          #printable-broadsheet {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #FFFFFF !important;
            color: #000000 !important;
          }

          .printable-cards-container {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          .print-page-sheet {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            width: 100% !important;
            min-height: 94vh !important;
            padding: 4mm 6mm !important;
            margin: 0 0 10mm 0 !important;
            border: none !important;
            background: #FFFFFF !important;
            display: block !important;
          }

          .print-page-sheet:last-of-type, .print-page-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
            margin-bottom: 0 !important;
          }

          .printable-card-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            align-items: stretch !important;
          }

          .printable-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 1.5px solid #1E293B !important;
            border-radius: 6px !important;
            box-shadow: none !important;
            padding: 6px 8px !important;
            background: #FFFFFF !important;
            color: #0F172A !important;
          }

          /* Matrix Table Multi-Page Print Rules */
          table {
            page-break-inside: auto !important;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          thead {
            display: table-header-group !important;
          }

          @page {
            size: A4 landscape;
            margin: 6mm 8mm;
          }
        }

        /* Responsive Mobile Styles for Master Scores Audit */
        @media screen and (max-width: 768px) {
          .audit-top-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .audit-header-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .audit-header-actions button {
            width: 100% !important;
            justify-content: center !important;
            padding: 0.55rem 0.5rem !important;
            font-size: 0.78rem !important;
          }
          .audit-header-actions button:first-child {
            grid-column: span 2 !important;
          }
          .audit-metric-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .audit-metric-card {
            padding: 0.85rem !important;
            gap: 0.65rem !important;
          }
          .audit-metric-icon {
            width: 38px !important;
            height: 38px !important;
            font-size: 1rem !important;
            border-radius: 10px !important;
          }
          .audit-metric-val {
            font-size: 1.15rem !important;
          }
          .audit-filter-controls {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .audit-filter-controls .search-input-wrap {
            grid-column: span 2 !important;
            width: 100% !important;
          }
          .audit-filter-controls select {
            width: 100% !important;
          }
          .desktop-table-container {
            display: none !important;
          }
          .mobile-score-cards-container {
            display: flex !important;
            flex-direction: column !important;
            gap: 0.85rem !important;
          }
        }
        @media screen and (min-width: 769px) {
          .mobile-score-cards-container {
            display: none !important;
          }
        }
      `}</style>

      <div className="fade-in" data-tour="broadsheet-table" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Navigation Breadcrumb & Action Bar */}
        <div className="audit-top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            <button
              onClick={() => navigate('/')}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, padding: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <i className="fas fa-arrow-left"></i> Back to Dashboard
            </button>
            <span>/</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Master Scores Audit</span>
          </div>

          <div className="audit-header-actions" style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setIsBroadsheetOpen(true)}
              className="btn-accent"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '0.55rem 1.1rem', background: '#2563eb', color: '#FFFFFF', fontWeight: 800 }}
            >
              <i className="fas fa-print"></i> Print Class Broadsheet
            </button>

            <button
              onClick={exportToCSV}
              disabled={filteredScores.length === 0}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '0.55rem 1.1rem' }}
            >
              <i className="fas fa-file-excel"></i> Export CSV
            </button>

            <button
              onClick={loadData}
              disabled={refreshing}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '0.55rem 1rem' }}
            >
              <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
              Refresh
            </button>
          </div>
        </div>

        {/* Executive Metric Cards */}
        <div className="audit-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div className="card audit-metric-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div className="audit-metric-icon" style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(30,64,175,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
              <i className="fas fa-list-check"></i>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Records</div>
              <div className="audit-metric-val" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>{metrics.total}</div>
            </div>
          </div>

          <div className="card audit-metric-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div className="audit-metric-icon" style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
              <i className="fas fa-check-double"></i>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Submitted</div>
              <div className="audit-metric-val" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>{metrics.submitted}</div>
            </div>
          </div>

          <div className="card audit-metric-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div className="audit-metric-icon" style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEF9C3', color: '#A16207', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
              <i className="fas fa-pen-ruler"></i>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>In Draft</div>
              <div className="audit-metric-val" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#A16207', marginTop: '2px' }}>{metrics.draft}</div>
            </div>
          </div>

          <div className="card audit-metric-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div className="audit-metric-icon" style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#E0F2FE', color: '#0369A1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
              <i className="fas fa-chart-line"></i>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Class Avg %</div>
              <div className="audit-metric-val" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0369A1', marginTop: '2px' }}>{metrics.avgScore}%</div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="card audit-filter-card" style={{ padding: '1.15rem' }}>
          <div className="audit-filter-controls" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
            gap: '10px',
            alignItems: 'center',
            width: '100%'
          }}>
            <div className="search-input-wrap" style={{ position: 'relative', minWidth: '180px' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.85rem' }}></i>
              <input
                type="text"
                placeholder="Search learner, reg no…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ width: '100%', padding: '0.55rem 0.85rem 0.55rem 2.2rem', fontSize: '0.85rem' }}
              />
            </div>

            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="form-input"
              style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem' }}
            >
              {academicYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="form-input"
              style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>

            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="form-input"
              style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="all">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="form-input"
              style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="all">All Subjects</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input"
              style={{ width: '100%', padding: '0.55rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted Only</option>
              <option value="draft">Draft Only</option>
            </select>
          </div>
        </div>

        {/* Master Scores Data Table (Desktop & Mobile Card View) */}
        <div className="card" style={{ padding: '1.25rem', overflow: 'hidden' }}>
          {loading ? (
            <LogoPreloader fullScreen={false} size="sm" />
          ) : filteredScores.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fas fa-inbox fa-3x" style={{ opacity: 0.3, marginBottom: '0.75rem' }}></i>
              <div style={{ fontSize: '1rem', fontWeight: 700 }}>No score records match your search filter criteria.</div>
              <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Try clearing filters or changing class selection.</div>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="desktop-table-container" style={{ overflowX: 'auto' }}>
                <table className="rc-table" style={{ width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Learner</th>
                      <th>Class</th>
                      <th>Subject</th>
                      <th>Period</th>
                      <th style={{ textAlign: 'center' }}>Class (50%)</th>
                      <th style={{ textAlign: 'center' }}>Exam (50%)</th>
                      <th style={{ textAlign: 'center' }}>Total (100%)</th>
                      <th style={{ textAlign: 'center' }}>Grade</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScores.map(sc => {
                      const learner = learnerMap[sc.learnerId];
                      const fullName = learner ? (learner.fullName || `${learner.firstName || ''} ${learner.lastName || ''}`) : 'Unknown Learner';
                      const regNo = learner?.regNumber || learner?.enrollmentCode || '—';
                      const className = classMap[sc.classId] || 'Unassigned';
                      const subjectName = subjectMap[sc.subjectId] || 'Unassigned';
                      const gBadge = getGradeBadge(sc.grade);

                      return (
                        <tr key={sc.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '0.65rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{fullName}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Reg: {regNo}</div>
                          </td>
                          <td style={{ fontWeight: 600, color: '#334155' }}>{className}</td>
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{subjectName}</td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sc.academicYear} ({sc.term})</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{sc.classScore ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{sc.examScore ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: '#0F172A', fontSize: '0.9rem' }}>
                            {sc.totalScore ?? '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800,
                              background: gBadge.bg, color: gBadge.color, border: `1px solid ${gBadge.border}`
                            }}>
                              {sc.grade}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 800,
                              background: sc.isSubmitted ? '#DCFCE7' : '#FEF9C3',
                              color: sc.isSubmitted ? '#15803D' : '#A16207',
                              border: `1px solid ${sc.isSubmitted ? '#BBF7D0' : '#FEF08A'}`
                            }}>
                              {sc.isSubmitted ? 'Submitted' : 'Draft'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Native Score Cards Container */}
              <div className="mobile-score-cards-container">
                {filteredScores.map(sc => {
                  const learner = learnerMap[sc.learnerId];
                  const fullName = learner ? (learner.fullName || `${learner.firstName || ''} ${learner.lastName || ''}`) : 'Unknown Learner';
                  const regNo = learner?.regNumber || learner?.enrollmentCode || '—';
                  const className = classMap[sc.classId] || 'Unassigned';
                  const subjectName = subjectMap[sc.subjectId] || 'Unassigned';
                  const gBadge = getGradeBadge(sc.grade);

                  return (
                    <div
                      key={sc.id}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '14px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                      }}
                    >
                      {/* Top Row: Name & Grade */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>
                            {fullName}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                            Reg: {regNo}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 900,
                            background: gBadge.bg, color: gBadge.color, border: `1px solid ${gBadge.border}`
                          }}>
                            {sc.grade}
                          </span>
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800,
                            background: sc.isSubmitted ? '#DCFCE7' : '#FEF9C3',
                            color: sc.isSubmitted ? '#15803D' : '#A16207',
                            border: `1px solid ${sc.isSubmitted ? '#BBF7D0' : '#FEF08A'}`
                          }}>
                            {sc.isSubmitted ? 'Submitted' : 'Draft'}
                          </span>
                        </div>
                      </div>

                      {/* Middle Badges: Class & Subject */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                        <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                          <i className="fas fa-chalkboard" style={{ fontSize: '0.68rem', marginRight: '4px', color: '#64748B' }}></i>
                          {className}
                        </span>
                        <span style={{ background: 'rgba(30,64,175,0.08)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                          <i className="fas fa-book" style={{ fontSize: '0.68rem', marginRight: '4px' }}></i>
                          {subjectName}
                        </span>
                        <span style={{ color: '#64748B', fontSize: '0.7rem', marginLeft: 'auto' }}>
                          {sc.academicYear} ({sc.term})
                        </span>
                      </div>

                      {/* Score Breakdown Bar */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        background: '#F8FAFC',
                        borderRadius: '10px',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #E2E8F0',
                        textAlign: 'center'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Class (50%)</div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#334155', marginTop: '1px' }}>{sc.classScore ?? '—'}</div>
                        </div>
                        <div style={{ borderLeft: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }}>
                          <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Exam (50%)</div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#334155', marginTop: '1px' }}>{sc.examScore ?? '—'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: '#2563eb', textTransform: 'uppercase', fontWeight: 800 }}>Total (100%)</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#09090b', marginTop: '1px' }}>{sc.totalScore ?? '—'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── PRINTABLE CLASS BROADSHEET MODAL ────────────────────────────────────── */}
      {isBroadsheetOpen && (
        <div className="no-print-bg broadsheet-modal-wrapper" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
        }}>
          <div className="broadsheet-modal-dialog" style={{
            background: '#FFFFFF', borderRadius: '16px', maxWidth: '1200px', width: '100%',
            height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            {/* Modal Control Toolbar (Hidden in Print) */}
            <div className="no-print broadsheet-modal-toolbar" style={{
              padding: '1rem 1.5rem', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#09090b' }}>
                  <i className="fas fa-print" style={{ color: '#2563eb', marginRight: '8px' }}></i>
                  Notice Board Class Performance Broadsheet
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
                  Printing preview for {selectedClassName} ({selectedTerm} {selectedAcademicYear})
                </div>
              </div>

              {/* View Switcher & Cards Per Page Control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#E2E8F0', padding: '3px', borderRadius: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setBroadsheetViewMode('cards')}
                    style={{
                      padding: '0.35rem 0.85rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: broadsheetViewMode === 'cards' ? '#FFFFFF' : 'transparent',
                      color: broadsheetViewMode === 'cards' ? '#1E40AF' : '#64748B',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      boxShadow: broadsheetViewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <i className="fas fa-id-card" style={{ marginRight: '5px' }}></i> Learner Cards (No-Cutoff)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadsheetViewMode('matrix')}
                    style={{
                      padding: '0.35rem 0.85rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: broadsheetViewMode === 'matrix' ? '#FFFFFF' : 'transparent',
                      color: broadsheetViewMode === 'matrix' ? '#1E40AF' : '#64748B',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      boxShadow: broadsheetViewMode === 'matrix' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    <i className="fas fa-table" style={{ marginRight: '5px' }}></i> Wide Matrix Table
                  </button>
                </div>

                {broadsheetViewMode === 'cards' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#18181b', background: '#FFF', padding: '0.2rem 0.6rem', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
                    <i className="fas fa-layer-group" style={{ color: '#2563eb' }}></i>
                    <span style={{ fontWeight: 700 }}>Sheet Size:</span>
                    <select
                      value={cardsPerPage}
                      onChange={(e) => setCardsPerPage(Number(e.target.value))}
                      className="form-input"
                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.78rem', width: 'auto', background: '#FFF', border: 'none', fontWeight: 800, color: '#0F172A' }}
                    >
                      <option value={4}>4 Learners / Sheet (2x2)</option>
                      <option value={6}>6 Learners / Sheet (2x3) — Standard</option>
                      <option value={8}>8 Learners / Sheet (2x4) — Compact</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                >
                  <i className="fas fa-print"></i> Print Notice Board Cards
                </button>
                <button
                  type="button"
                  onClick={() => setIsBroadsheetOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Broadsheet Content Container */}
            <div id="printable-broadsheet" style={{ flex: 1, overflow: 'auto', padding: '1.5rem', background: '#FFFFFF' }}>
              
              {broadsheetData.rows.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                  No learner performance records found for this class and academic period.
                </div>
              ) : broadsheetViewMode === 'cards' ? (
                
                /* ── CARDS SYSTEM (EXPLICIT SHEET CHUNKING — 100% NO CUTOFF) ─────────────── */
                <div className="printable-cards-container">
                  {cardPages.map((pageRows, pageIdx) => (
                    <div 
                      key={pageIdx} 
                      className="print-page-sheet"
                      style={{
                        pageBreakAfter: pageIdx === cardPages.length - 1 ? 'auto' : 'always',
                        breakAfter: pageIdx === cardPages.length - 1 ? 'auto' : 'page',
                        pageBreakInside: 'avoid',
                        breakInside: 'avoid',
                        marginBottom: '2.5rem',
                        paddingBottom: '1.5rem',
                        borderBottom: pageIdx === cardPages.length - 1 ? 'none' : '2px dashed #CBD5E1'
                      }}
                    >
                      {/* Document Official Header on top of each printed sheet */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0F172A', paddingBottom: '0.5rem', marginBottom: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {schoolInfo?.logoUrl && (
                            <img src={schoolInfo.logoUrl} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                          )}
                          <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0F172A', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                              {schoolInfo?.name || 'SCHOOL NAME'}
                            </h2>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E40AF', marginTop: '1px' }}>
                              CLASS PERFORMANCE SUMMARY — SHEET {pageIdx + 1} OF {cardPages.length}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#334155' }}>
                          <div><strong>Class:</strong> {selectedClassName}</div>
                          <div><strong>Term &amp; Year:</strong> {selectedTerm} ({selectedAcademicYear})</div>
                          <div><strong>Sheet Learners:</strong> {pageRows.length} (Total: {broadsheetData.rows.length})</div>
                        </div>
                      </div>

                      {/* 2-Column Grid for this Sheet */}
                      <div className="printable-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                        {pageRows.map((row, idx) => (
                          <div 
                            key={idx} 
                            className="printable-card"
                            style={{
                              background: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              borderRadius: '8px',
                              padding: '0.55rem 0.75rem',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                              position: 'relative',
                              pageBreakInside: 'avoid',
                              breakInside: 'avoid'
                            }}
                          >
                            {/* Learner Card Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.3rem' }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', fontFamily: 'Outfit, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.fullName}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748B', fontFamily: 'monospace' }}>
                                  Reg: {row.regNumber} • {row.className}
                                </div>
                              </div>

                            </div>

                            {/* Subject Performance Grid inside Card */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', marginTop: '0.1rem' }}>
                              <thead>
                                <tr style={{ background: '#F1F5F9', color: '#475569', fontSize: '0.6rem', textTransform: 'uppercase', textAlign: 'center' }}>
                                  <th style={{ padding: '2px 4px', textAlign: 'left' }}>Subject</th>
                                  <th style={{ padding: '2px 2px', width: '28px' }}>CA</th>
                                  <th style={{ padding: '2px 2px', width: '28px' }}>EX</th>
                                  <th style={{ padding: '2px 2px', width: '32px', fontWeight: 800, color: '#0F172A' }}>TOT</th>
                                  <th style={{ padding: '2px 2px', width: '26px' }}>Grd</th>
                                </tr>
                              </thead>
                              <tbody>
                                {broadsheetData.subjects.map((sub, sIdx) => {
                                  const sc = row.subScores[sub.id] || { ca: '—', exam: '—', total: '—', grade: '—' };
                                  const gBadge = getGradeBadge(sc.grade);
                                  return (
                                    <tr key={sIdx} style={{ borderBottom: '1px solid #F8FAFC', textAlign: 'center' }}>
                                      <td style={{ padding: '2px 4px', textAlign: 'left', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                                        {sub.name}
                                      </td>
                                      <td style={{ padding: '2px 2px', color: '#64748B' }}>{sc.ca}</td>
                                      <td style={{ padding: '2px 2px', color: '#64748B' }}>{sc.exam}</td>
                                      <td style={{ padding: '2px 2px', fontWeight: 800, color: '#0F172A' }}>{sc.total}</td>
                                      <td style={{ padding: '2px 2px' }}>
                                        <span style={{ padding: '0px 4px', borderRadius: '3px', fontSize: '0.58rem', fontWeight: 800, background: gBadge.bg, color: gBadge.color }}>
                                          {sc.grade}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

              ) : (

                /* ── WIDE MATRIX TABLE VIEW ────────────────────────────────── */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0F172A', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {schoolInfo?.logoUrl && (
                        <img src={schoolInfo.logoUrl} alt="Logo" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
                      )}
                      <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0F172A', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                          {schoolInfo?.name || 'SCHOOL NAME'}
                        </h2>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF', marginTop: '1px' }}>
                          CLASS MASTER PERFORMANCE MATRIX BROADSHEET
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#334155' }}>
                      <div><strong>Class:</strong> {selectedClassName}</div>
                      <div><strong>Term &amp; Year:</strong> {selectedTerm} ({selectedAcademicYear})</div>
                      <div><strong>Total Learners:</strong> {broadsheetData.rows.length}</div>
                    </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ background: '#F1F5F9', color: '#0F172A', textAlign: 'center' }}>
                        <th rowSpan="2" style={{ border: '1px solid #CBD5E1', padding: '6px 8px', width: '90px' }}>REG NO</th>
                        <th rowSpan="2" style={{ border: '1px solid #CBD5E1', padding: '6px 12px', textAlign: 'left', minWidth: '160px' }}>LEARNER NAME</th>
                        {broadsheetData.subjects.map(s => (
                          <th key={s.id} colSpan="3" style={{ border: '1px solid #CBD5E1', padding: '6px 4px', fontSize: '0.72rem' }}>
                            {s.name}
                          </th>
                        ))}
                      </tr>
                      <tr style={{ background: '#F8FAFC', color: '#64748B', fontSize: '0.68rem', textAlign: 'center' }}>
                        {broadsheetData.subjects.map(s => (
                          <React.Fragment key={s.id}>
                            <th style={{ border: '1px solid #CBD5E1', padding: '3px 2px' }}>CA</th>
                            <th style={{ border: '1px solid #CBD5E1', padding: '3px 2px' }}>EX</th>
                            <th style={{ border: '1px solid #CBD5E1', padding: '3px 2px', fontWeight: 800, color: '#0F172A' }}>TOT</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {broadsheetData.rows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: '1px solid #E2E8F0', background: rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                          <td style={{ border: '1px solid #CBD5E1', padding: '4px 6px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#64748B' }}>
                            {row.regNumber}
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '4px 8px', fontWeight: 800, color: '#0F172A' }}>
                            {row.fullName}
                          </td>
                          {broadsheetData.subjects.map(s => {
                            const sc = row.subScores[s.id] || { ca: '—', exam: '—', total: '—' };
                            return (
                              <React.Fragment key={s.id}>
                                <td style={{ border: '1px solid #E2E8F0', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>{sc.ca}</td>
                                <td style={{ border: '1px solid #E2E8F0', textAlign: 'center', color: '#64748B', fontSize: '0.72rem' }}>{sc.exam}</td>
                                <td style={{ border: '1px solid #E2E8F0', textAlign: 'center', fontWeight: 800, color: '#0F172A', fontSize: '0.75rem', background: '#F1F5F9' }}>{sc.total}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              )}

            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default MasterScoreViewer;
