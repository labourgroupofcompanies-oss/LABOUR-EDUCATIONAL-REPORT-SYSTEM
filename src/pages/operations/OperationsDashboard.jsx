import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOperationsAnalyticsMetrics, getSchoolsDirectory } from '../../services/operationsService';
import LogoPreloader from '../../components/common/LogoPreloader';

const OperationsDashboard = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (force = false) => {
    try {
      const [m, list] = await Promise.all([
        getOperationsAnalyticsMetrics(),
        getSchoolsDirectory(force)
      ]);
      setMetrics(m);
      setSchools(list);
    } catch (err) {
      console.warn('[OperationsDashboard] Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const getHealthBadge = (healthStatus, score) => {
    switch (healthStatus) {
      case 'Healthy':  return { bg: '#ECFDF5', color: '#10B981', border: '#D1FAE5', label: `Healthy (${score}%)` };
      case 'Warning':  return { bg: '#FFFBEB', color: '#F59E0B', border: '#FEF3C7', label: `Warning (${score}%)` };
      case 'Critical': default:
        return { bg: '#FEF2F2', color: '#EF4444', border: '#FEE2E2', label: `Critical (${score}%)` };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', color: '#18181b' }}>

      {/* Hero Banner */}
      <div style={{
        padding: '2rem 2.25rem',
        borderRadius: '20px',
        background: '#09090b',
        border: '1px solid #27272a',
        boxShadow: '0 8px 30px rgba(9, 9, 11, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1.25rem', color: '#FFFFFF'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.4)', padding: '0.25rem 0.75rem', borderRadius: '999px', color: '#60a5fa', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
            <i className="fas fa-tower-observation"></i> Live Command Hub
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            Platform Operations Center
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#A1A1AA', fontSize: '0.9rem', maxWidth: '650px', lineHeight: 1.5 }}>
            Real-time school health scoring, automated sync telemetry, remote interventions, and support administration across all registered schools.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ padding: '0.65rem 1.2rem', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#FFFFFF', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease' }}
          >
            <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`} style={{ color: '#2563eb' }}></i>
            {refreshing ? 'Refreshing…' : 'Refresh Telemetry'}
          </button>
          <button
            onClick={() => navigate('/platform/operations/schools')}
            style={{ padding: '0.65rem 1.3rem', borderRadius: '10px', background: '#2563eb', color: '#FFFFFF', border: 'none', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)', transition: 'all 0.2s ease' }}
          >
            <i className="fas fa-school"></i>
            View All Schools
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem 1rem', background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E4E4E7' }}>
          <LogoPreloader fullScreen={false} size="md" />
        </div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.1rem' }}>
            {[
              { label: 'REGISTERED SCHOOLS', value: metrics?.totalSchools ?? 0, sub: `${(metrics?.totalLearners ?? 0).toLocaleString()} learners`, color: '#09090b', accent: '#2563eb' },
              { label: 'TOTAL LEARNERS', value: (metrics?.totalLearners ?? 0).toLocaleString(), sub: `${metrics?.totalStaff ?? 0} teaching staff`, color: '#09090b', accent: '#0284c7' },
              { label: 'HEALTHY SCHOOLS (≥80%)', value: metrics?.healthyCount ?? 0, sub: 'Optimal sync & entry', color: '#10B981', accent: '#10B981' },
              { label: 'WARNING STATUS (60–79%)', value: metrics?.warningCount ?? 0, sub: 'Needs attention', color: '#F59E0B', accent: '#F59E0B' },
              { label: 'CRITICAL SCHOOLS (<60%)', value: metrics?.criticalCount ?? 0, sub: 'Intervention required', color: '#EF4444', accent: '#EF4444' },
              { label: 'ACTIVE SUBSCRIPTIONS', value: metrics?.activeSubscriptions ?? 0, sub: `${metrics?.trialSubscriptions ?? 0} on trial`, color: '#7c3aed', accent: '#7c3aed' },
              { label: 'AVG PLATFORM HEALTH', value: `${metrics?.avgHealthScore ?? 0}%`, sub: 'Across all schools', color: '#2563eb', accent: '#2563eb' },
              { label: 'OPEN SUPPORT TICKETS', value: metrics?.openTickets ?? 0, sub: 'Requiring response', color: metrics?.openTickets > 0 ? '#F59E0B' : '#10B981', accent: metrics?.openTickets > 0 ? '#F59E0B' : '#10B981' },
            ].map((card, i) => (
              <div key={i} style={{ padding: '1.25rem', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderLeft: `4px solid ${card.accent}`, boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
                <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: card.color, marginTop: '5px' }}>{card.value}</div>
                <div style={{ fontSize: '0.73rem', color: '#71717a', marginTop: '3px', fontWeight: 600 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Score Completion Progress Bar */}
          {metrics && (
            <div style={{ background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E4E4E7', padding: '1.6rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ color: '#09090b', fontWeight: 800, fontSize: '0.98rem', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-chart-line" style={{ color: '#2563eb' }}></i> Platform-Wide Score Entry Completion
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 900, color: '#10B981' }}>
                  {metrics.overallScoreCompletionPct}%
                </div>
              </div>
              <div style={{ background: '#F4F4F5', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${metrics.overallScoreCompletionPct}%`,
                  background: metrics.overallScoreCompletionPct >= 80 ? '#10B981' : metrics.overallScoreCompletionPct >= 60 ? '#F59E0B' : '#EF4444',
                  borderRadius: '999px',
                  transition: 'width 0.8s ease'
                }} />
              </div>
              <div style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '0.6rem', fontWeight: 600 }}>
                {metrics.totalReportsGenerated} report summaries generated across {metrics.totalSchools} schools
              </div>
            </div>
          )}

          {/* Live School Health Table */}
          <div style={{ background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E4E4E7', padding: '1.6rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', color: '#09090b', fontWeight: 800 }}>
                Live School Health &amp; Status Monitor
              </h3>
              <button
                onClick={() => navigate('/platform/operations/schools')}
                style={{ background: 'transparent', border: 'none', color: '#2563eb', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Full Directory →
              </button>
            </div>

            {schools.length === 0 ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: '#71717a' }}>
                <i className="fas fa-school" style={{ fontSize: '2.5rem', marginBottom: '0.75rem', color: '#A1A1AA', display: 'block' }}></i>
                <div style={{ color: '#09090b', fontWeight: 800, marginBottom: '0.5rem' }}>No Schools Registered Yet</div>
                <div style={{ fontSize: '0.82rem' }}>
                  Schools register themselves via the Onboarding page. Once registered, they appear here.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E4E7', color: '#71717a', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>School Name</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Region</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Health Score</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Learners</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Scores Submitted</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Subscription</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Reports</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 800 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schools.map(s => {
                      const badge = getHealthBadge(s.health?.healthStatus, s.health?.totalScore);
                      const scorePct = s.total_scores_count > 0
                        ? Math.round((s.submitted_scores_count / s.total_scores_count) * 100)
                        : 0;
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid #F4F4F5', color: '#18181b' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.9rem' }}>{s.name}</div>
                            <div style={{ fontSize: '0.72rem', color: '#71717a' }}>HT: {s.headteacher}</div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: '#18181b' }}>
                            <div>{s.region}</div>
                            <div style={{ fontSize: '0.72rem', color: '#71717a' }}>{s.circuit}</div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{ padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                              ● {badge.label}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#2563eb' }}>
                            {s.learners_count}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ color: scorePct >= 80 ? '#10B981' : scorePct >= 50 ? '#F59E0B' : '#EF4444', fontWeight: 700 }}>
                              {s.submitted_scores_count} / {s.total_scores_count} ({scorePct}%)
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{ color: s.subscription_status === 'Active' ? '#10B981' : s.subscription_status === 'Trial' ? '#F59E0B' : '#EF4444', fontWeight: 700 }}>
                              {s.subscription_status} ({s.subscription_tier})
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ color: s.reports_released ? '#10B981' : '#71717a', fontWeight: 600 }}>
                              {s.reports_released ? '✓ Released' : '⊘ Locked'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#71717a' }}>
                              {s.reports_count} summaries
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => navigate(`/platform/operations/schools/${s.id}`)}
                              style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', background: '#09090b', border: 'none', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                              Inspect &amp; Support →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default OperationsDashboard;
