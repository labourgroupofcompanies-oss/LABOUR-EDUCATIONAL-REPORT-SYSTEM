import React, { useMemo } from 'react';

// ── Grade color palette (Unified with System Theme) ───────────────────────────
const GRADE_COLORS = {
  'A': '#10B981', 'A+': '#10B981', 'A-': '#10B981',
  'B': '#2563eb', 'B+': '#2563eb', 'B-': '#2563eb',
  'C': '#F59E0B', 'C+': '#F59E0B', 'C-': '#F59E0B',
  'D': '#71717a', 'D+': '#71717a', 'D-': '#71717a',
  'F': '#EF4444', 'E': '#EF4444',
};
const getGradeColor = (g) => GRADE_COLORS[g] || '#A1A1AA';

// ── Donut Chart Component ──────────────────────────────────────────────────────
const DonutChart = ({ slices, total, size = 140, strokeWidth = 22 }) => {
  const R = (size - strokeWidth) / 2 - 2;
  const CX = size / 2;
  const CY = size / 2;
  const circumference = 2 * Math.PI * R;
  let cumulative = 0;

  const paths = slices.map(item => {
    const dashLen = total > 0 ? (item.count / total) * circumference : 0;
    const offset = circumference - cumulative;
    cumulative += dashLen;
    return { ...item, dashLen, offset };
  });

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#E4E4E7" strokeWidth={strokeWidth} />
      {paths.map((slice, i) => (
        <circle
          key={i}
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={getGradeColor(slice.grade)}
          strokeWidth={strokeWidth}
          strokeDasharray={`${slice.dashLen} ${circumference}`}
          strokeDashoffset={slice.offset}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: `${CX}px ${CY}px`,
            transition: 'stroke-dasharray 0.7s cubic-bezier(0.4,0,0.2,1)'
          }}
        />
      ))}
      <text x={CX} y={CY - 7} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '16px', fontWeight: 800, fill: '#18181b', fontFamily: 'Outfit, sans-serif' }}>
        {total}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '9px', fill: '#71717a', fontWeight: 600, fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em' }}>
        RECORDS
      </text>
    </svg>
  );
};

// ── Main AdminAnalytics Component ─────────────────────────────────────────────
const AdminAnalytics = ({
  scores = [],
  learners = [],
  classes = [],
  subjects = [],
  settings = null,
  currentTerm = '',
  currentAcademicYear = ''
}) => {

  // Filter to current academic period
  const periodScores = useMemo(() => {
    if (!currentTerm || !currentAcademicYear) return scores;
    return scores.filter(s =>
      s.term === currentTerm && s.academicYear === currentAcademicYear && s.totalScore !== undefined
    );
  }, [scores, currentTerm, currentAcademicYear]);

  // ── Panel 1: Class Performance ───────────────────────────────────────────────
  const classPerformance = useMemo(() => {
    const map = {};
    periodScores.forEach(s => {
      if (!s.classId) return;
      if (!map[s.classId]) map[s.classId] = { total: 0, count: 0 };
      map[s.classId].total += Number(s.totalScore) || 0;
      map[s.classId].count += 1;
    });
    return classes
      .map(c => ({
        classId: c.id,
        name: c.name,
        avg: map[c.id] ? Math.round(map[c.id].total / map[c.id].count) : null
      }))
      .filter(c => c.avg !== null)
      .sort((a, b) => b.avg - a.avg);
  }, [periodScores, classes]);

  // ── Panel 2: Grade Distribution ──────────────────────────────────────────────
  const { gradeDist, totalGraded } = useMemo(() => {
    const map = {};
    periodScores.forEach(s => {
      const g = (s.grade || '').trim().toUpperCase();
      if (g) {
        map[g] = (map[g] || 0) + 1;
      }
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    const order = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E', 'F'];
    const slices = Object.entries(map)
      .map(([grade, count]) => ({
        grade,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0
      }))
      .sort((a, b) => {
        const ia = order.indexOf(a.grade);
        const ib = order.indexOf(b.grade);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    return { gradeDist: slices, totalGraded: total };
  }, [periodScores]);

  // ── Panel 3: At-Risk Students ────────────────────────────────────────────────
  const passingMin = useMemo(() => {
    const scale = settings?.gradingScale || [];
    const nonF = scale.filter(g => (g.grade || '').toUpperCase() !== 'F');
    if (nonF.length === 0) return 40;
    return Math.min(...nonF.map(g => Number(g.minScore) || 40));
  }, [settings]);

  const atRiskLearners = useMemo(() => {
    if (periodScores.length === 0) return [];
    const map = {};
    periodScores.forEach(s => {
      if (!s.learnerId) return;
      if (!map[s.learnerId]) map[s.learnerId] = { total: 0, count: 0 };
      map[s.learnerId].total += Number(s.totalScore) || 0;
      map[s.learnerId].count += 1;
    });

    const atRiskIds = Object.entries(map)
      .filter(([, data]) => {
        const avg = data.count > 0 ? data.total / data.count : 100;
        return avg < passingMin;
      })
      .map(([id]) => Number(id));

    return learners
      .filter(l => atRiskIds.includes(Number(l.id)))
      .map(l => ({
        ...l,
        avg: map[l.id] ? Math.round(map[l.id].total / map[l.id].count) : 0
      }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 8);
  }, [periodScores, learners, passingMin]);

  // ── Panel 4: Subject Performance ─────────────────────────────────────────────
  const subjectPerformance = useMemo(() => {
    const map = {};
    periodScores.forEach(s => {
      if (!s.subjectId) return;
      if (!map[s.subjectId]) map[s.subjectId] = { total: 0, count: 0 };
      map[s.subjectId].total += Number(s.totalScore) || 0;
      map[s.subjectId].count += 1;
    });
    return subjects
      .map(subj => ({
        subjectId: subj.id,
        name: subj.name,
        avg: map[subj.id] ? Math.round(map[subj.id].total / map[subj.id].count) : null
      }))
      .filter(s => s.avg !== null)
      .sort((a, b) => b.avg - a.avg);
  }, [periodScores, subjects]);

  if (periodScores.length === 0) {
    return (
      <div className="card" style={{
        padding: '2rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        marginTop: '1.5rem',
        border: '1px dashed #E4E4E7'
      }}>
        <i className="fas fa-chart-bar" style={{ fontSize: '2rem', color: '#2563eb', opacity: 0.4, marginBottom: '0.75rem', display: 'block' }} />
        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
          No score data for <strong>{currentTerm} {currentAcademicYear}</strong>. Analytics will appear once teachers start entering scores.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {/* Section Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px',
          background: '#09090b',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <i className="fas fa-chart-bar" style={{ color: 'white', fontSize: '1rem' }} />
        </div>
        <div>
          <h2 style={{
            margin: 0, fontSize: '1.15rem', fontWeight: 800,
            color: '#09090b'
          }}>
            School Performance Analytics
          </h2>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#71717a', fontWeight: 500 }}>
            {currentTerm} &bull; {currentAcademicYear} &bull; {totalGraded} scored record{totalGraded !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Top row: 3 panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.25rem' }}>

        {/* Panel 1: Class Performance Bars */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#09090b' }}>
            <i className="fas fa-school" style={{ color: '#2563eb' }} />
            Class Averages
          </h3>
          {classPerformance.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>No class data.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {classPerformance.map(item => {
                const barColor = item.avg >= 70 ? '#10B981' : item.avg >= 50 ? '#F59E0B' : '#EF4444';
                return (
                  <div key={item.classId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>{item.name}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: barColor }}>{item.avg}%</span>
                    </div>
                    <div style={{ height: '9px', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${item.avg}%`, height: '100%', borderRadius: '999px',
                        background: barColor, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel 2: Grade Distribution Donut */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#09090b' }}>
            <i className="fas fa-chart-pie" style={{ color: '#2563eb' }} />
            Grade Distribution
          </h3>
          {totalGraded === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>No graded records.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <DonutChart slices={gradeDist} total={totalGraded} size={130} strokeWidth={20} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: '120px' }}>
                {gradeDist.map(item => (
                  <div key={item.grade} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{ width: '9px', height: '9px', borderRadius: '3px', background: getGradeColor(item.grade), flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', minWidth: '22px' }}>{item.grade}</span>
                    <div style={{ flex: 1, height: '4px', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ width: `${item.pct}%`, height: '100%', background: getGradeColor(item.grade), borderRadius: '999px' }} />
                    </div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, minWidth: '34px', textAlign: 'right' }}>
                      {item.count} ({item.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Panel 3: At-Risk Students */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#09090b' }}>
            <i className="fas fa-exclamation-triangle" style={{ color: atRiskLearners.length > 0 ? '#EF4444' : '#10B981' }} />
            At-Risk Students
            {atRiskLearners.length > 0 && (
              <span style={{
                marginLeft: 'auto', background: '#FEF2F2', color: '#EF4444',
                fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '999px',
                border: '1px solid #FECACA'
              }}>
                {atRiskLearners.length}
              </span>
            )}
          </h3>
          {atRiskLearners.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '1.25rem',
              background: '#ECFDF5',
              borderRadius: '12px', border: '1px solid #A7F3D0'
            }}>
              <i className="fas fa-award" style={{ fontSize: '1.6rem', color: '#10B981', marginBottom: '0.5rem', display: 'block' }} />
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#065F46', lineHeight: 1.4 }}>
                All learners performing at or above the passing threshold!
              </p>
            </div>
          ) : (
            <>
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {atRiskLearners.map(l => {
                  const cls = classes.find(c => Number(c.id) === Number(l.currentClassId));
                  const initials = l.fullName.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <div key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: '9px',
                      padding: '0.5rem 0.65rem', borderRadius: '8px',
                      background: '#FEF2F2', border: '1px solid #FECACA'
                    }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
                        background: '#EF4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <span style={{ color: 'white', fontSize: '0.65rem', fontWeight: 800 }}>{initials}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.fullName}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#71717a', fontWeight: 500 }}>
                          {cls?.name || 'Unknown Class'}
                        </div>
                      </div>
                      <span style={{ background: '#EF4444', color: 'white', fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: '6px', flexShrink: 0 }}>
                        {l.avg}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Pass threshold: {passingMin}% &bull; Based on current term averages
              </p>
            </>
          )}
        </div>

      </div>

      {/* Subject Performance — full-width bar chart */}
      {subjectPerformance.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#09090b' }}>
            <i className="fas fa-book-open" style={{ color: '#2563eb' }} />
            Subject Performance Comparison
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {subjectPerformance.map(item => {
              const barColor = item.avg >= 70 ? '#10B981' : item.avg >= 50 ? '#F59E0B' : '#EF4444';
              return (
                <div key={item.subjectId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{item.name}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: barColor }}>{item.avg}%</span>
                  </div>
                  <div style={{ height: '8px', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${item.avg}%`, height: '100%', borderRadius: '999px', background: barColor, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAnalytics;
