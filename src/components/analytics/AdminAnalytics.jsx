import React, { useMemo } from 'react';

// ── Grade color palette ────────────────────────────────────────────────────────
const GRADE_COLORS = {
  'A': '#0d9488', 'A+': '#0d9488', 'A-': '#0d9488',
  'B': '#10b981', 'B+': '#10b981', 'B-': '#10b981',
  'C': '#f59e0b', 'C+': '#f59e0b', 'C-': '#f59e0b',
  'D': '#3b82f6', 'D+': '#3b82f6', 'D-': '#3b82f6',
  'F': '#ef4444', 'E': '#ef4444',
};
const getGradeColor = (g) => GRADE_COLORS[g] || '#94a3b8';

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
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
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
        style={{ fontSize: '16px', fontWeight: 800, fill: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>
        {total}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '9px', fill: '#94a3b8', fontWeight: 600, fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em' }}>
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
      if (!s.grade) return;
      map[s.grade] = (map[s.grade] || 0) + 1;
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    const dist = Object.entries(map)
      .map(([grade, count]) => ({
        grade,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);
    return { gradeDist: dist, totalGraded: total };
  }, [periodScores]);

  // ── Panel 3: At-Risk Students ────────────────────────────────────────────────
  const passingMin = useMemo(() => {
    if (!settings?.gradingScale || settings.gradingScale.length === 0) return 50;
    const sorted = [...settings.gradingScale].sort((a, b) => Number(a.min) - Number(b.min));
    return Number(sorted[0]?.min) || 50;
  }, [settings]);

  const atRiskLearners = useMemo(() => {
    const learnerScores = {};
    periodScores.forEach(s => {
      const id = s.learnerId;
      if (!id) return;
      if (!learnerScores[id]) learnerScores[id] = { total: 0, count: 0 };
      learnerScores[id].total += Number(s.totalScore) || 0;
      learnerScores[id].count += 1;
    });
    return learners
      .map(l => {
        const id = l.supabaseId || String(l.id);
        const data = learnerScores[id];
        if (!data || data.count === 0) return null;
        const avg = Math.round(data.total / data.count);
        return avg < passingMin ? { ...l, avg } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.avg - b.avg);
  }, [periodScores, learners, passingMin]);

  // Subject performance
  const subjectPerformance = useMemo(() => {
    const map = {};
    periodScores.forEach(s => {
      if (!s.subjectId) return;
      if (!map[s.subjectId]) map[s.subjectId] = { total: 0, count: 0 };
      map[s.subjectId].total += Number(s.totalScore) || 0;
      map[s.subjectId].count += 1;
    });
    return subjects
      .map(sub => ({
        subjectId: sub.id,
        name: sub.name,
        avg: map[sub.id] ? Math.round(map[sub.id].total / map[sub.id].count) : null
      }))
      .filter(s => s.avg !== null)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8); // cap at 8 for readability
  }, [periodScores, subjects]);

  if (periodScores.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        background: 'rgba(13,148,136,0.04)',
        borderRadius: '16px',
        border: '1px dashed rgba(13,148,136,0.2)',
        textAlign: 'center',
        color: 'var(--text-muted)',
        marginTop: '1.5rem'
      }}>
        <i className="fas fa-chart-bar" style={{ fontSize: '2rem', color: '#0d9488', opacity: 0.35, marginBottom: '0.75rem', display: 'block' }} />
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
          background: 'linear-gradient(135deg, #0d9488, #10b981)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <i className="fas fa-chart-bar" style={{ color: 'white', fontSize: '1rem' }} />
        </div>
        <div>
          <h2 style={{
            margin: 0, fontSize: '1.15rem', fontWeight: 800,
            background: 'linear-gradient(135deg, #0f766e, #10b981)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
          }}>
            School Performance Analytics
          </h2>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {currentTerm} &bull; {currentAcademicYear} &bull; {totalGraded} scored record{totalGraded !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Top row: 3 panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.25rem' }}>

        {/* Panel 1: Class Performance Bars */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <i className="fas fa-school" style={{ color: '#0d9488' }} />
            Class Averages
          </h3>
          {classPerformance.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>No class data.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {classPerformance.map(item => {
                const barColor = item.avg >= 70 ? '#0d9488' : item.avg >= 50 ? '#f59e0b' : '#ef4444';
                const barGradient = item.avg >= 70
                  ? 'linear-gradient(90deg, #0d9488, #10b981)'
                  : item.avg >= 50
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    : 'linear-gradient(90deg, #ef4444, #f87171)';
                return (
                  <div key={item.classId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>{item.name}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: barColor }}>{item.avg}%</span>
                    </div>
                    <div style={{ height: '9px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${item.avg}%`, height: '100%', borderRadius: '999px',
                        background: barGradient, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)'
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
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <i className="fas fa-chart-pie" style={{ color: '#0d9488' }} />
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
                    <div style={{ flex: 1, height: '4px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
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
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <i className="fas fa-exclamation-triangle" style={{ color: atRiskLearners.length > 0 ? '#ef4444' : '#10b981' }} />
            At-Risk Students
            {atRiskLearners.length > 0 && (
              <span style={{
                marginLeft: 'auto', background: '#fef2f2', color: '#ef4444',
                fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '999px',
                border: '1px solid #fecaca'
              }}>
                {atRiskLearners.length}
              </span>
            )}
          </h3>
          {atRiskLearners.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '1.25rem',
              background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
              borderRadius: '12px', border: '1px solid #bbf7d0'
            }}>
              <i className="fas fa-award" style={{ fontSize: '1.6rem', color: '#10b981', marginBottom: '0.5rem', display: 'block' }} />
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#065f46', lineHeight: 1.4 }}>
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
                      background: '#fef2f2', border: '1px solid #fecaca'
                    }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
                        background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <span style={{ color: 'white', fontSize: '0.65rem', fontWeight: 800 }}>{initials}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.fullName}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#b91c1c', fontWeight: 500 }}>
                          {cls?.name || 'Unknown Class'}
                        </div>
                      </div>
                      <span style={{ background: '#ef4444', color: 'white', fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: '6px', flexShrink: 0 }}>
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
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <i className="fas fa-book-open" style={{ color: '#0d9488' }} />
            Subject Performance Comparison
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {subjectPerformance.map(item => {
              const barColor = item.avg >= 70 ? '#0d9488' : item.avg >= 50 ? '#f59e0b' : '#ef4444';
              const barGradient = item.avg >= 70
                ? 'linear-gradient(90deg, #0d9488, #10b981)'
                : item.avg >= 50
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #ef4444, #f87171)';
              return (
                <div key={item.subjectId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{item.name}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: barColor }}>{item.avg}%</span>
                  </div>
                  <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${item.avg}%`, height: '100%', borderRadius: '999px', background: barGradient, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
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
