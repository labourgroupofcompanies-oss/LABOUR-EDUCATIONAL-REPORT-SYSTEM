import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getApiAnalyticsMetrics, getApiAnalyticsTimeline, getDeveloperActivityLogs } from '../../services/developerService';
import LogoPreloader from '../../components/common/LogoPreloader';

const DeveloperDashboard = () => {
  const navigate = useNavigate();
  const { activeEnv } = useOutletContext() || { activeEnv: 'production' };

  const [metrics, setMetrics] = useState(null);
  const [hourlyTraffic, setHourlyTraffic] = useState(Array(24).fill(0));
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [m, timeline, logs] = await Promise.all([
        getApiAnalyticsMetrics(),
        getApiAnalyticsTimeline(),
        getDeveloperActivityLogs(),
      ]);
      setMetrics(m);
      setHourlyTraffic(timeline);
      setActivities(logs);
    } catch (err) {
      console.warn('[DevDashboard] Error loading:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => { setRefreshing(true); loadData(); };

  // 10 Visual Telemetry Cards
  const summaryCards = metrics ? [
    { title: 'API Requests Today', value: metrics.requestsToday > 0 ? metrics.requestsToday.toLocaleString() : '0', icon: 'fa-chart-simple', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
    { title: 'Active API Keys', value: metrics.activeKeys, icon: 'fa-key', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)' },
    { title: 'Active Webhooks', value: metrics.activeWebhooks, icon: 'fa-bolt', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    { title: 'Failed Deliveries', value: metrics.failedWebhooks, icon: 'fa-triangle-exclamation', color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
    { title: 'Response Speed', value: metrics.avgResponseTimeMs > 0 ? `${metrics.avgResponseTimeMs} ms` : '—', icon: 'fa-stopwatch', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    { title: 'Error Rate', value: `${metrics.errorRatePercent}%`, icon: 'fa-bug', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
    { title: 'Sandbox Hits', value: metrics.sandboxRequests, icon: 'fa-flask', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    { title: 'Production Hits', value: metrics.productionRequests, icon: 'fa-server', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    { title: 'API Version', value: metrics.apiVersion, icon: 'fa-code-branch', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    { title: 'Last Activity', value: metrics.lastDeployment ? new Date(metrics.lastDeployment).toLocaleTimeString('en-GH', { timeStyle: 'short' }) : '—', icon: 'fa-rocket', color: '#e879f9', bg: 'rgba(232,121,249,0.12)' },
  ] : [];

  const maxHourly = Math.max(...hourlyTraffic, 1);
  const hasTraffic = hourlyTraffic.some(h => h > 0);

  // Quick Action Tiles
  const quickActions = [
    {
      title: 'Referrals & Rewards',
      desc: 'Affiliate codes, fraud verification engine, global commission settings',
      icon: 'fa-gift',
      color: '#10b981',
      bg: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(6,182,212,0.1) 100%)',
      border: 'rgba(16,185,129,0.3)',
      action: () => navigate('/platform/operations/referrals'),
      btnText: 'Referrals & Rewards →'
    },
    {
      title: 'School Wallet & Top Up',
      desc: 'Top up balances, adjust rates per student, unlock report cards',
      icon: 'fa-wallet',
      color: '#34d399',
      bg: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(6,182,212,0.1) 100%)',
      border: 'rgba(16,185,129,0.3)',
      action: () => navigate('/financials'),
      btnText: 'Top Up Wallet →'
    },
    {
      title: 'Schools Directory & Tenants',
      desc: 'Provision new schools, inspect accounts, verify subscriptions',
      icon: 'fa-school',
      color: '#06b6d4',
      bg: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(59,130,246,0.1) 100%)',
      border: 'rgba(6,182,212,0.3)',
      action: () => navigate('/platform/operations/schools'),
      btnText: 'Schools Directory →'
    },
    {
      title: 'API Keys & Integration',
      desc: 'Generate secret keys, register webhooks, set rate limits',
      icon: 'fa-key',
      color: '#a78bfa',
      bg: 'linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(236,72,153,0.1) 100%)',
      border: 'rgba(167,139,250,0.3)',
      action: () => navigate('/platform/developer/api-keys'),
      btnText: 'Manage API Keys →'
    },
    {
      title: 'System Health & Audit',
      desc: 'Run score diagnostics, clear sync queues, audit performance',
      icon: 'fa-heart-pulse',
      color: '#f59e0b',
      bg: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(239,68,68,0.1) 100%)',
      border: 'rgba(245,158,11,0.3)',
      action: () => navigate('/score-diagnostic'),
      btnText: 'Run Health Check →'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', color: '#f8fafc' }}>
      
      {/* Dark Theme Header Banner */}
      <div style={{
        padding: '1.5rem 2rem',
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #0b132b 0%, #1c2541 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justify: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            color: 'white',
            fontSize: '1.35rem',
            boxShadow: '0 4px 15px rgba(16,185,129,0.3)'
          }}>
            <i className="fas fa-terminal"></i>
          </div>
          <div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.65rem', fontWeight: 900, margin: 0, color: 'white' }}>
              Developer &amp; Admin Console
            </h1>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px', fontWeight: 600 }}>
              Super Admin System Management Portal • Active Env: <span style={{ color: '#10b981', fontWeight: 800, textTransform: 'uppercase' }}>{activeEnv}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#e2e8f0',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
            {refreshing ? 'Refreshing…' : 'Refresh Telemetry'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* QUICK ACTIONS HUB (Instant "What Can Be Done" Grid) */}
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fas fa-bolt" style={{ color: '#10b981' }}></i> Direct Action Hub
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.1rem' }}>
              {quickActions.map((qa, i) => (
                <div
                  key={i}
                  style={{
                    background: qa.bg,
                    border: `1px solid ${qa.border}`,
                    borderRadius: '16px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    gap: '1rem',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                    transition: 'transform 0.2s ease, border-color 0.2s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${qa.color}20`, border: `1px solid ${qa.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: qa.color, fontSize: '1rem' }}>
                        <i className={`fas ${qa.icon}`}></i>
                      </div>
                      <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'white' }}>
                        {qa.title}
                      </h3>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                      {qa.desc}
                    </div>
                  </div>

                  <button
                    onClick={qa.action}
                    style={{
                      background: qa.color,
                      color: '#0f172a',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.55rem 1rem',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      gap: '6px',
                      boxShadow: `0 4px 12px ${qa.color}40`
                    }}
                  >
                    {qa.btnText}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '2rem 0' }}>
              <LogoPreloader fullScreen={false} size="sm" />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* 10 Visual Telemetry Cards Grid */}
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-gauge" style={{ color: '#06b6d4' }}></i> Live Platform Telemetry
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
                  {summaryCards.map((card, idx) => (
                    <div key={idx} style={{ padding: '1.1rem', borderRadius: '14px', background: '#0b132b', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', flexShrink: 0 }}>
                        <i className={`fas ${card.icon}`}></i>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title}</div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 900, color: 'white', marginTop: '2px' }}>{card.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analytics Chart & Activity Stream */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                {/* Hourly Traffic Bar Chart */}
                <div style={{ padding: '1.5rem', borderRadius: '18px', background: '#0b132b', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', color: 'white' }}>API Traffic (24h)</h3>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {hasTraffic ? 'Live hourly request telemetry' : 'No traffic logged yet'}
                      </div>
                    </div>
                    <button onClick={() => navigate('/platform/developer/analytics')} style={{ background: 'transparent', border: 'none', color: '#06b6d4', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}>
                      Full Analytics →
                    </button>
                  </div>

                  <div style={{ height: '180px', display: 'flex', alignItems: 'flex-end', gap: '6px', padding: '0.5rem 0' }}>
                    {hourlyTraffic.map((h, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                        <div
                          title={`${String(i).padStart(2, '0')}:00 — ${h} request${h !== 1 ? 's' : ''}`}
                          style={{
                            width: '100%',
                            height: `${Math.max((h / maxHourly) * 100, h > 0 ? 4 : 1)}%`,
                            borderRadius: '3px 3px 0 0',
                            background: h > 0
                              ? 'linear-gradient(to top, #10b981, #06b6d4)'
                              : 'rgba(255,255,255,0.06)',
                            transition: 'height 0.4s ease',
                            minHeight: '2px'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.7rem', color: '#64748b' }}>
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span>
                  </div>
                </div>

                {/* Live Activity Stream */}
                <div style={{ padding: '1.5rem', borderRadius: '18px', background: '#0b132b', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', color: 'white' }}>Activity Stream</h3>
                    <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>Live</span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px' }}>
                    {activities.length === 0 ? (
                      <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>
                        No recent activity. Actions taken in the portal appear here automatically.
                      </div>
                    ) : (
                      activities.slice(0, 8).map((act, i) => (
                        <div key={act.id || i} style={{ padding: '0.65rem 0.85rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.78rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f1f5f9', fontWeight: 700 }}>
                            <span style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>{act.action.replace(/_/g, ' ')}</span>
                            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{new Date(act.created_at).toLocaleTimeString('en-GH', { timeStyle: 'short' })}</span>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
                            → <strong style={{ color: '#06b6d4' }}>{act.target_entity}</strong>
                            {act.result === 'failed' && <span style={{ color: '#f87171', marginLeft: '6px' }}>✕ failed</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default DeveloperDashboard;
