import React, { useState, useMemo, useEffect } from 'react';

const ClassBroadsheetModal = ({
  isOpen,
  onClose,
  schoolInfo,
  classes = [],
  selectedClassId,
  selectedTerm = 'Term 1',
  selectedAcademicYear = '2025/2026',
  learners = [],
  subjects = [],
  classSubjects = [],
  scores = []
}) => {
  const [currentClassId, setCurrentClassId] = useState(selectedClassId || '');
  const [currentTerm, setCurrentTerm] = useState(selectedTerm || 'Term 1');
  const [currentAcademicYear, setCurrentAcademicYear] = useState(selectedAcademicYear || '2025/2026');
  const [broadsheetViewMode, setBroadsheetViewMode] = useState('cards'); // 'cards' | 'matrix'
  const [cardsPerPage, setCardsPerPage] = useState(6); // 4, 6, 8 learners per printed sheet

  // Sync internal filters when props change
  useEffect(() => {
    if (selectedClassId) setCurrentClassId(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedTerm) setCurrentTerm(selectedTerm);
  }, [selectedTerm]);

  useEffect(() => {
    if (selectedAcademicYear) setCurrentAcademicYear(selectedAcademicYear);
  }, [selectedAcademicYear]);

  // Selected class object & label
  const selectedClassObj = useMemo(() => {
    return classes.find(c => String(c.id) === String(currentClassId));
  }, [classes, currentClassId]);

  const selectedClassName = selectedClassObj?.name || (currentClassId ? `Class ${currentClassId}` : 'All Classes');

  // Grade badge color helper
  const getGradeBadge = (grade) => {
    switch (String(grade || '').toUpperCase()) {
      case '1': case 'A': case 'A+': case 'A1':
        return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
      case '2': case '3': case 'B': case 'B2': case 'B3':
        return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' };
      case '4': case '5': case '6': case 'C': case 'C4': case 'C5': case 'C6':
        return { bg: '#fef9c3', color: '#a16207', border: '#fef08a' };
      case '7': case '8': case 'D': case 'D7': case 'E8':
        return { bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' };
      case '9': case 'F': case 'F9': default:
        return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
    }
  };

  // ── Broadsheet Computation Engine ──────────────────────────────────────────
  const broadsheetData = useMemo(() => {
    let targetLearners = learners || [];
    if (currentClassId && currentClassId !== 'all') {
      targetLearners = targetLearners.filter(l =>
        String(l.currentClassId || l.classId || l.class_id) === String(currentClassId)
      );
    }

    let targetSubjects = subjects || [];
    // If class-specific subjects exist, optionally filter
    if (currentClassId && classSubjects && classSubjects.length > 0) {
      const activeClassSubIds = new Set(
        classSubjects
          .filter(cs => String(cs.classId) === String(currentClassId))
          .map(cs => String(cs.subjectId))
      );
      if (activeClassSubIds.size > 0) {
        const filtered = targetSubjects.filter(s => activeClassSubIds.has(String(s.id)));
        if (filtered.length > 0) {
          targetSubjects = filtered;
        }
      }
    }

    // Deduplicate subjects by normalized name
    const seenNames = new Set();
    targetSubjects = targetSubjects.filter(s => {
      const nameKey = (s.name || '').trim().toLowerCase();
      if (!nameKey || seenNames.has(nameKey)) return false;
      seenNames.add(nameKey);
      return true;
    });

    const normTerm = (t) => String(t || '').toLowerCase().replace(/term\s*/i, '').trim();
    const normYear = (y) => String(y || '').replace(/[\/\-\_\s]/g, '').trim();

    const selectedNormTerm = normTerm(currentTerm);
    const selectedNormYear = normYear(currentAcademicYear);

    // Build multi-key score lookup map
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

          // Fallback grade calculation if missing
          let calcGrade = sc.grade;
          if (!calcGrade && totVal !== null) {
            calcGrade = totVal >= 80 ? '1' : totVal >= 70 ? '2' : totVal >= 60 ? '3' : totVal >= 55 ? '4' : totVal >= 50 ? '5' : totVal >= 40 ? '6' : totVal >= 35 ? '7' : totVal >= 30 ? '8' : '9';
          }

          subScores[s.id] = {
            name: s.name,
            ca: hasCa ? caVal : '—',
            exam: hasExam ? examVal : '—',
            total: totVal !== null ? totVal : '—',
            grade: totVal !== null ? (calcGrade || '—') : '—'
          };
        } else {
          subScores[s.id] = { name: s.name, ca: '—', exam: '—', total: '—', grade: '—' };
        }
      });

      const average = count > 0 ? (grandTotal / count).toFixed(1) : 0;
      const rowClassName = selectedClassObj?.name || 'Class —';

      return {
        learner: l,
        fullName: l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Unnamed Learner',
        regNumber: l.regNumber || l.enrollmentCode || '—',
        className: rowClassName,
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
  }, [learners, subjects, classSubjects, scores, currentClassId, currentTerm, currentAcademicYear, selectedClassObj]);

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

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @media print {
          html, body {
            width: 100% !important;
            height: auto !important;
            min-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #FFFFFF !important;
          }

          body * {
            visibility: hidden !important;
          }

          .no-print, .no-print-bg, header, nav, aside, footer, .sidebar, .header-container, .rc-preview-header, .rc-tabs {
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
      `}</style>

      <div
        className="no-print-bg broadsheet-modal-wrapper"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}
      >
        <div
          className="broadsheet-modal-dialog"
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '1200px',
            width: '100%',
            height: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}
        >
          {/* Modal Control Toolbar (Hidden in Print) */}
          <div
            className="no-print broadsheet-modal-toolbar"
            style={{
              padding: '1rem 1.5rem',
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-print" style={{ color: '#2563eb' }}></i>
                Notice Board Class Performance Broadsheet
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span>Preview for <strong>{selectedClassName}</strong> ({currentTerm} {currentAcademicYear})</span>
                {classes.length > 0 && (
                  <select
                    value={currentClassId}
                    onChange={(e) => setCurrentClassId(e.target.value)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      background: '#FFF',
                      fontWeight: 600,
                      color: '#1E293B'
                    }}
                  >
                    <option value="">— Switch Class —</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    color: '#18181b',
                    background: '#FFF',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '8px',
                    border: '1px solid #E4E4E7'
                  }}
                >
                  <i className="fas fa-layer-group" style={{ color: '#2563eb' }}></i>
                  <span style={{ fontWeight: 700 }}>Sheet Size:</span>
                  <select
                    value={cardsPerPage}
                    onChange={(e) => setCardsPerPage(Number(e.target.value))}
                    className="form-input"
                    style={{
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.78rem',
                      width: 'auto',
                      background: '#FFF',
                      border: 'none',
                      fontWeight: 800,
                      color: '#0F172A'
                    }}
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
                className="btn btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <i className="fas fa-print"></i> Print Broadsheet
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  background: '#FFF',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Broadsheet Content Container */}
          <div id="printable-broadsheet" style={{ flex: 1, overflow: 'auto', padding: '1.5rem', background: '#FFFFFF' }}>
            {broadsheetData.rows.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                <i className="fas fa-file-circle-exclamation" style={{ fontSize: '2.5rem', color: '#94A3B8', marginBottom: '1rem' }}></i>
                <h4 style={{ margin: '0 0 0.5rem', color: '#1E293B' }}>No Learner Records Found</h4>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  No score records found for {selectedClassName} in {currentTerm} ({currentAcademicYear}).
                </p>
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
                        <div><strong>Term &amp; Year:</strong> {currentTerm} ({currentAcademicYear})</div>
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
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1E40AF', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>
                                Pos: {row.rank}
                              </span>
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

                          {/* Footer with Totals */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '3px', fontSize: '0.65rem', color: '#475569', fontWeight: 700 }}>
                            <span>Total: <strong style={{ color: '#0F172A' }}>{row.grandTotal}</strong></span>
                            <span>Average: <strong style={{ color: '#0F172A' }}>{row.average}%</strong></span>
                          </div>
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
                    <div><strong>Term &amp; Year:</strong> {currentTerm} ({currentAcademicYear})</div>
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
                      <th rowSpan="2" style={{ border: '1px solid #CBD5E1', padding: '6px 8px', width: '60px' }}>TOTAL</th>
                      <th rowSpan="2" style={{ border: '1px solid #CBD5E1', padding: '6px 8px', width: '60px' }}>AVG</th>
                      <th rowSpan="2" style={{ border: '1px solid #CBD5E1', padding: '6px 60px', width: '50px' }}>POS</th>
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
                        <td style={{ border: '1px solid #CBD5E1', textAlign: 'center', fontWeight: 800, color: '#1E40AF', fontSize: '0.75rem' }}>{row.grandTotal}</td>
                        <td style={{ border: '1px solid #CBD5E1', textAlign: 'center', fontWeight: 700, color: '#334155', fontSize: '0.75rem' }}>{row.average}%</td>
                        <td style={{ border: '1px solid #CBD5E1', textAlign: 'center', fontWeight: 800, color: '#0F172A', fontSize: '0.75rem' }}>{row.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ClassBroadsheetModal;
