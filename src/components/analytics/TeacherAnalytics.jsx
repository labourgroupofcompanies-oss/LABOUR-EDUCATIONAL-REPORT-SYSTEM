import React, { useMemo } from 'react';

const GRADE_COLORS = {
  'A': '#0d9488', 'A+': '#0d9488', 'A-': '#0d9488',
  'B': '#10b981', 'B+': '#10b981', 'B-': '#10b981',
  'C': '#f59e0b', 'C+': '#f59e0b', 'C-': '#f59e0b',
  'D': '#3b82f6', 'D+': '#3b82f6', 'D-': '#3b82f6',
  'F': '#ef4444', 'E': '#ef4444',
};
const getGradeColor = (g) => GRADE_COLORS[g] || '#94a3b8';

const MiniDonut = ({ gradeDist, total }) => {
  const R = 36;
  const CX = 44;
  const CY = 44;
  const SW = 14;
  const circumference = 2 * Math.PI * R;
  let cumulative = 0;

  const slices = gradeDist.map(item => {
    const dashLen = total > 0 ? (item.count / total) * circumference : 0;
    const offset = circumference - cumulative;
    cumulative += dashLen;
    return { ...item, dashLen, offset };
  });

  return (
    <svg width="88" height="88">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f5f9" strokeWidth={SW} />
      {total === 0 ? (
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={SW} />
      ) : slices.map((slice, i) => (
        <circle
          key={i}
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={getGradeColor(slice.grade)}
          strokeWidth={SW}
          strokeDasharray={`${slice.dashLen} ${circumference}`}
          strokeDashoffset={slice.offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }}
        />
      ))}
      <text x={CX} y={CY - 4} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '11px', fontWeight: 800, fill: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>
        {total}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '7.5px', fill: '#94a3b8', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
        RECORDS
      </text>
    </svg>
  );
};

const TeacherAnalytics = ({ progressList = [], allScores = [], allLearners = [], settings = null, currentTerm = '', currentAcademicYear = '' }) => {
  const analyticsData = useMemo(() => {
    return progressList.map(item => {
      // Filter scores for this class-subject-term-year
      const itemScores = allScores.filter(s =>
        Number(s.classId) === Number(item.classId) &&
        Number(s.subjectId) === Number(item.subjectId) &&
        s.term === currentTerm &&
        s.academicYear === currentAcademicYear &&
        s.totalScore !== undefined && s.totalScore !== null && s.totalScore !== ''
      );

      // Grade distribution
      const gradeMap = {};
      let totalScore = 0;
      itemScores.forEach(s => {
        if (s.grade) gradeMap[s.grade] = (gradeMap[s.grade] || 0) + 1;
        totalScore += Number(s.totalScore) || 0;
      });

      const gradeDist = Object.entries(gradeMap)
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => b.count - a.count);

      const classAvg = itemScores.length > 0 ? Math.round(totalScore / itemScores.length) : null;
      const avgColor = classAvg === null ? '#94a3b8' : classAvg >= 70 ? '#0d9488' : classAvg >= 50 ? '#f59e0b' : '#ef4444';

      return { ...item, gradeDist, gradedCount: itemScores.length, classAvg, avgColor };
    });
  }, [progressList, allScores, currentTerm, currentAcademicYear]);

  if (progressList.length === 0) return null;

  const hasAnyScores = analyticsData.some(d => d.gradedCount > 0);

  return (
    <div>
      {/* Section Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: 'linear-gradient(135deg, #0d9488, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fas fa-chart-pie" style={{ color: 'white', fontSize: '0.9rem' }} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, background: 'linear-gradient(135deg, #0f766e, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Class Performance Breakdown
          </h2>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Grade distribution for {currentTerm} &bull; {currentAcademicYear}
          </p>
        </div>
      </div>

      {!hasAnyScores ? (
        <div style={{ padding: '1.5rem', background: 'rgba(13,148,136,0.04)', borderRadius: '12px', border: '1px dashed rgba(13,148,136,0.2)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fas fa-pencil-alt" style={{ fontSize: '1.5rem', color: '#0d9488', opacity: 0.4, marginBottom: '0.5rem', display: 'block' }} />
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600 }}>Enter scores to see grade analytics appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {analyticsData.map(item => (
            <div
              key={`${item.classId}-${item.subjectId}`}
              className="card"
              style={{ padding: '1rem', position: 'relative', overflow: 'hidden' }}
            >
              {/* Accent bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #0d9488, #10b981)' }} />

              {/* Header */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)' }}>{item.className}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{item.subjectName}</div>
              </div>

              {item.gradedCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  <i className="fas fa-clock" style={{ display: 'block', marginBottom: '4px', color: '#0d9488', opacity: 0.5 }} />
                  No scores entered yet
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <MiniDonut gradeDist={item.gradeDist} total={item.gradedCount} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Class average pill */}
                    {item.classAvg !== null && (
                      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg:</span>
                        <span style={{ fontSize: '1rem', fontWeight: 900, color: item.avgColor, fontFamily: 'Outfit, sans-serif' }}>{item.classAvg}%</span>
                      </div>
                    )}
                    {/* Grade Legend */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {item.gradeDist.slice(0, 5).map(gd => (
                        <div key={gd.grade} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: getGradeColor(gd.grade), flexShrink: 0 }} />
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text)', minWidth: '18px' }}>{gd.grade}</span>
                          <div style={{ flex: 1, height: '4px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: `${item.gradedCount > 0 ? (gd.count / item.gradedCount) * 100 : 0}%`, height: '100%', background: getGradeColor(gd.grade), borderRadius: '999px' }} />
                          </div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, minWidth: '16px', textAlign: 'right' }}>{gd.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherAnalytics;
