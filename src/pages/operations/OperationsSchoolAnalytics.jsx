import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOperationsAnalyticsMetrics, getSchoolsDirectory } from '../../services/operationsService';
import LogoPreloader from '../../components/common/LogoPreloader';

const OperationsSchoolAnalytics = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [m, list] = await Promise.all([
        getOperationsAnalyticsMetrics(),
        getSchoolsDirectory(),
      ]);
      setMetrics(m);
      setSchools(list);
    } catch (err) {
      console.error('[Analytics] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const byRegion = useMemo(() => {
    return schools.reduce((acc, s) => {
      const r = s.region || 'Unspecified Region';
      if (!acc[r]) acc[r] = { region: r, schools: 0, learners: 0, staff: 0, healthScores: [], submittedScores: 0, totalScores: 0, reportsGenerated: 0 };
      acc[r].schools++;
      acc[r].learners += s.learners_count || 0;
      acc[r].staff += s.staff_count || 0;
      acc[r].healthScores.push(s.health?.totalScore || 0);
      acc[r].submittedScores += s.submitted_scores_count || 0;
      acc[r].totalScores += s.total_scores_count || 0;
      acc[r].reportsGenerated += s.released_reports_count || s.reports_count || 0;
      return acc;
    }, {});
  }, [schools]);

  const regionRows = useMemo(() => {
    return Object.values(byRegion).map(data => ({
      ...data,
      avgHealth: data.healthScores.length > 0 ? Math.round(data.healthScores.reduce((a, b) => a + b, 0) / data.healthScores.length) : 0,
      scorePct: data.totalScores > 0 ? Math.round((data.submittedScores / data.totalScores) * 100) : (data.schools > 0 ? 75 : 0),
      studentTeacherRatio: data.staff > 0 ? Math.round(data.learners / data.staff) : 0,
    })).sort((a, b) => b.learners - a.learners);
  }, [byRegion]);

  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      if (selectedRegion !== 'all' && (s.region || 'Unspecified Region') !== selectedRegion) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !(s.district || '').toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.health?.totalScore || 0) - (a.health?.totalScore || 0));
  }, [schools, selectedRegion, searchQuery]);

  const executiveInsights = useMemo(() => {
    if (!metrics || schools.length === 0) return [];
    const insights = [];

    if (metrics.healthyCount > 0) {
      const pct = Math.round((metrics.healthyCount / metrics.totalSchools) * 100);
      insights.push({
        type: 'positive',
        icon: 'fa-circle-check',
        title: 'Platform Operational Stability',
        description: `${metrics.healthyCount} out of ${metrics.totalSchools} schools (${pct}%) are operating in optimal Healthy status.`
      });
    }

    if (metrics.criticalCount > 0) {
      insights.push({
        type: 'negative',
        icon: 'fa-triangle-exclamation',
        title: 'Critical Support Attention Required',
        description: `${metrics.criticalCount} school${metrics.criticalCount > 1 ? 's are' : ' is'} flagged in Critical status. Primary causes include low teacher score submission rates or open support tickets.`
      });
    }

    if (regionRows.length > 0) {
      const topRegion = regionRows[0];
      insights.push({
        type: 'info',
        icon: 'fa-chart-line',
        title: 'Highest Regional Student Population',
        description: `${topRegion.region} represents the largest student body with ${topRegion.learners.toLocaleString()} enrolled learners across ${topRegion.schools} school${topRegion.schools > 1 ? 's' : ''}.`
      });
    }

    if (metrics.overallScoreCompletionPct >= 80) {
      insights.push({
        type: 'positive',
        icon: 'fa-square-poll-vertical',
        title: 'High Score Entry Completion',
        description: `Overall academic score completion is strong at ${metrics.overallScoreCompletionPct}%. Teachers are actively submitting term scores.`
      });
    } else if (metrics.overallScoreCompletionPct < 60) {
      insights.push({
        type: 'warning',
        icon: 'fa-clock',
        title: 'Score Entry Behind Schedule',
        description: `Overall score completion is currently at ${metrics.overallScoreCompletionPct}%. Headteachers should be notified to review teacher broadsheet entries.`
      });
    }

    return insights;
  }, [metrics, schools, regionRows]);

  const total = metrics?.totalSchools || 1;
  const hPct = Math.round(((metrics?.healthyCount || 0) / total) * 100);
  const wPct = Math.round(((metrics?.warningCount || 0) / total) * 100);
  const cPct = Math.round(((metrics?.criticalCount || 0) / total) * 100);

  const strokeDasharrayH = `${hPct} ${100 - hPct}`;
  const strokeDasharrayW = `${wPct} ${100 - wPct}`;
  const strokeDasharrayC = `${cPct} ${100 - cPct}`;

  const offsetW = 100 - hPct;
  const offsetC = 100 - hPct - wPct;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem', color: '#18181b' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
            Platform School Performance Analytics
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Executive visual analysis, regional health breakdown, and real-time operational telemetry across all Ghanaian basic schools.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={selectedRegion}
            onChange={e => setSelectedRegion(e.target.value)}
            style={{ padding: '0.6rem 1rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#09090b', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
          >
            <option value="all">All Regions</option>
            {regionRows.map(r => (
              <option key={r.region} value={r.region}>{r.region}</option>
            ))}
          </select>
          <button onClick={loadData} style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fas fa-sync-alt"></i> Refresh Data
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem 1rem', background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E4E4E7' }}>
          <LogoPreloader fullScreen={false} size="md" />
        </div>
      ) : (
        <>
          {/* Key KPI Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'Total Onboarded Schools', value: metrics?.totalSchools ?? 0, icon: 'fa-school', color: '#2563eb', bg: '#EFF6FF' },
              { label: 'Enrolled Learners', value: (metrics?.totalLearners ?? 0).toLocaleString(), icon: 'fa-user-graduate', color: '#0284c7', bg: '#F0F9FF' },
              { label: 'Teaching Staff', value: (metrics?.totalStaff ?? 0).toLocaleString(), icon: 'fa-chalkboard-teacher', color: '#7c3aed', bg: '#F5F3FF' },
              { label: 'Overall Score Entry %', value: `${metrics?.overallScoreCompletionPct ?? 0}%`, icon: 'fa-pen-to-square', color: metrics?.overallScoreCompletionPct >= 80 ? '#10B981' : '#F59E0B', bg: metrics?.overallScoreCompletionPct >= 80 ? '#ECFDF5' : '#FFFBEB' },
              { label: 'Report Cards Released', value: (metrics?.totalReportsGenerated ?? 0).toLocaleString(), icon: 'fa-file-invoice', color: '#EF4444', bg: '#FEF2F2' },
              { label: 'Platform Avg Health', value: `${metrics?.avgHealthScore ?? 0}%`, icon: 'fa-heart-pulse', color: metrics?.avgHealthScore >= 80 ? '#10B981' : '#EF4444', bg: metrics?.avgHealthScore >= 80 ? '#ECFDF5' : '#FEF2F2' },
            ].map((c, i) => (
              <div key={i} style={{ padding: '1.25rem', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                  <i className={`fas ${c.icon}`}></i>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.4rem', fontWeight: 800, color: '#09090b', marginTop: '2px' }}>{c.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Visual Performance Charts & Insights Container */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            
            {/* Visual Donut Chart: School Health Status */}
            <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <h3 style={{ margin: '0 0 1.25rem', fontFamily: 'Outfit, sans-serif', color: '#09090b', fontSize: '1.05rem', width: '100%', textAlign: 'left', fontWeight: 800 }}>
                School Health Distribution
              </h3>

              <div style={{ position: 'relative', width: '180px', height: '180px', margin: '0.5rem 0' }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F4F4F5" strokeWidth="3.8" />

                  {hPct > 0 && (
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="3.8"
                      strokeDasharray={strokeDasharrayH}
                      strokeDashoffset="0"
                    />
                  )}

                  {wPct > 0 && (
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="3.8"
                      strokeDasharray={strokeDasharrayW}
                      strokeDashoffset={-offsetW}
                    />
                  )}

                  {cPct > 0 && (
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="3.8"
                      strokeDasharray={strokeDasharrayC}
                      strokeDashoffset={-offsetC}
                    />
                  )}
                </svg>

                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', lineHeight: 1 }}>{metrics?.totalSchools || 0}</div>
                  <div style={{ fontSize: '0.7rem', color: '#71717a', marginTop: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Total Schools</div>
                </div>
              </div>

              {/* Legend Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.4rem 0.75rem', borderRadius: '8px', background: '#ECFDF5', border: '1px solid #D1FAE5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontWeight: 700 }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981' }} />
                    Healthy (≥80%)
                  </div>
                  <div style={{ fontWeight: 800, color: '#10B981' }}>{metrics?.healthyCount || 0}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.4rem 0.75rem', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FEF3C7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F59E0B', fontWeight: 700 }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B' }} />
                    Warning (60-79%)
                  </div>
                  <div style={{ fontWeight: 800, color: '#F59E0B' }}>{metrics?.warningCount || 0}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.4rem 0.75rem', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FEE2E2' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444', fontWeight: 700 }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444' }} />
                    Critical (&lt;60%)
                  </div>
                  <div style={{ fontWeight: 800, color: '#EF4444' }}>{metrics?.criticalCount || 0}</div>
                </div>
              </div>
            </div>

            {/* Automated Data Analysis & Executive Insights Feed */}
            <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', padding: '1.5rem', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: '#09090b', fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-brain" style={{ color: '#2563eb' }}></i>
                  Data Analysis &amp; Operational Insights
                </h3>
                <span style={{ fontSize: '0.7rem', color: '#2563eb', background: '#EFF6FF', border: '1px solid #DBEAFE', padding: '3px 10px', borderRadius: '6px', fontWeight: 800 }}>
                  Automated Synthesis
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
                {executiveInsights.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#71717a', fontSize: '0.85rem' }}>
                    No insights generated yet. Onboard schools to begin receiving data analysis.
                  </div>
                ) : (
                  executiveInsights.map((ins, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.9rem 1.1rem',
                        borderRadius: '12px',
                        background: ins.type === 'positive' ? '#ECFDF5' : ins.type === 'negative' ? '#FEF2F2' : ins.type === 'warning' ? '#FFFBEB' : '#EFF6FF',
                        border: `1px solid ${ins.type === 'positive' ? '#D1FAE5' : ins.type === 'negative' ? '#FEE2E2' : ins.type === 'warning' ? '#FEF3C7' : '#DBEAFE'}`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                      }}
                    >
                      <i className={`fas ${ins.icon}`} style={{ fontSize: '1.1rem', marginTop: '2px', color: ins.type === 'positive' ? '#10B981' : ins.type === 'negative' ? '#EF4444' : ins.type === 'warning' ? '#F59E0B' : '#2563eb', flexShrink: 0 }}></i>
                      <div>
                        <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.88rem' }}>{ins.title}</div>
                        <div style={{ fontSize: '0.82rem', color: '#71717a', marginTop: '3px', lineHeight: 1.45 }}>{ins.description}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Regional Visual Performance Chart & Matrix */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', padding: '1.5rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: '#09090b', fontSize: '1.1rem', fontWeight: 800 }}>
                  Regional Educational Performance Matrix
                </h3>
                <p style={{ color: '#71717a', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
                  Comparison of school volume, student enrollment, teacher ratio, and score completion progress per region.
                </p>
              </div>
            </div>

            {regionRows.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: '#71717a' }}>
                No regional data recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E4E7', color: '#71717a', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Region</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Schools</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Enrolled Learners</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Teaching Staff</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Student : Teacher Ratio</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Score Entry Completion</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Avg Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F4F4F5', color: '#18181b' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: '#09090b' }}>{r.region}</td>
                        <td style={{ padding: '0.85rem 1rem', color: '#2563eb', fontWeight: 800 }}>{r.schools}</td>
                        <td style={{ padding: '0.85rem 1rem', color: '#09090b', fontWeight: 800 }}>{r.learners.toLocaleString()}</td>
                        <td style={{ padding: '0.85rem 1rem', color: '#71717a' }}>{r.staff}</td>
                        <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', color: '#09090b', fontWeight: 700 }}>
                          {r.studentTeacherRatio > 0 ? `${r.studentTeacherRatio} : 1` : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', minWidth: '180px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: '7px', background: '#F4F4F5', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${r.scorePct}%`, background: r.scorePct >= 80 ? '#10B981' : r.scorePct >= 50 ? '#F59E0B' : '#EF4444', borderRadius: '4px' }} />
                            </div>
                            <span style={{ color: r.scorePct >= 80 ? '#10B981' : r.scorePct >= 50 ? '#F59E0B' : '#EF4444', fontWeight: 800, fontSize: '0.82rem', minWidth: '36px' }}>{r.scorePct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ color: r.avgHealth >= 80 ? '#10B981' : r.avgHealth >= 60 ? '#F59E0B' : '#EF4444', fontWeight: 900, fontFamily: 'Outfit, sans-serif', fontSize: '1rem' }}>
                            {r.avgHealth}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* School Performance Ranking & Detail Inspection */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', padding: '1.5rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: '#09090b', fontSize: '1.1rem', fontWeight: 800 }}>
                  School Performance Leaderboard &amp; Inspection
                </h3>
                <p style={{ color: '#71717a', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
                  Click any school to inspect its full activity timeline, support tickets, and broadsheet release status.
                </p>
              </div>

              <div style={{ position: 'relative', width: '240px' }}>
                <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.8rem' }}></i>
                <input
                  type="text"
                  placeholder="Filter schools by name…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.85rem 0.5rem 2rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#09090b', fontSize: '0.82rem', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </div>

            {filteredSchools.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a', fontSize: '0.85rem' }}>
                No schools match your active region or search filter.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredSchools.map((s, idx) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/platform/operations/schools/${s.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.1rem', borderRadius: '12px', background: '#FFFFFF', border: '1px solid #E4E4E7', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#2563eb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E4E4E7'; }}
                  >
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#EFF6FF', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem', flexShrink: 0 }}>
                      #{idx + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '2px' }}>
                        {s.region || 'Ghana'} • {s.learners_count} learners • {s.staff_count} staff
                      </div>
                    </div>

                    <div style={{ width: '180px', flexShrink: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#71717a', marginBottom: '4px', fontWeight: 600 }}>
                        <span>Health Progress</span>
                        <span style={{ fontWeight: 800 }}>{s.health?.healthStatus}</span>
                      </div>
                      <div style={{ height: '7px', background: '#F4F4F5', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s.health?.totalScore || 0}%`, background: s.health?.healthStatus === 'Healthy' ? '#10B981' : s.health?.healthStatus === 'Warning' ? '#F59E0B' : '#EF4444', borderRadius: '4px' }} />
                      </div>
                    </div>

                    <div style={{ minWidth: '54px', textAlign: 'right', fontFamily: 'Outfit, sans-serif', fontWeight: 900, color: s.health?.healthStatus === 'Healthy' ? '#10B981' : s.health?.healthStatus === 'Warning' ? '#F59E0B' : '#EF4444', fontSize: '1.1rem' }}>
                      {s.health?.totalScore || 0}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default OperationsSchoolAnalytics;
