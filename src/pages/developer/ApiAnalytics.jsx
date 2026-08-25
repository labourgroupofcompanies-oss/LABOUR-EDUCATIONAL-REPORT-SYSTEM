import React, { useState, useEffect, useCallback } from 'react';
import { getApiAnalyticsMetrics, getTopEndpointStats, getTopApiKeyConsumers } from '../../services/developerService';
import LogoPreloader from '../../components/common/LogoPreloader';

const ApiAnalytics = () => {
  const [envFilter, setEnvFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [consumers, setConsumers] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, eps, cons] = await Promise.all([
        getApiAnalyticsMetrics(),
        getTopEndpointStats(),
        getTopApiKeyConsumers(),
      ]);
      setMetrics(m);
      setEndpoints(eps);
      setConsumers(cons);
    } catch (err) {
      console.error('[ApiAnalytics] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredConsumers = envFilter === 'all'
    ? consumers
    : consumers.filter(c => c.environment === envFilter);

  // HTTP status breakdown from metrics
  const totalToday = (metrics?.requestsToday || 0);
  const errorCount = metrics ? Math.round((metrics.errorRatePercent / 100) * (metrics.requestsToday || 0)) : 0;
  const successCount = totalToday - errorCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: 0 }}>
            API Analytics &amp; Performance Telemetry
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Live traffic analysis derived from <code style={{ color: '#38bdf8', fontSize: '0.8rem' }}>platform_api_analytics</code> — populated as API calls are made.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select value={envFilter} onChange={e => setEnvFilter(e.target.value)} style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.82rem' }}>
            <option value="all">All Environments</option>
            <option value="production">Production</option>
            <option value="sandbox">Sandbox</option>
          </select>
          <button onClick={loadData} style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem 0' }}>
          <LogoPreloader fullScreen={false} size="sm" />
        </div>
      ) : (
        <>
          {/* HTTP Status Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {[
              { label: '200 OK SUCCESS', value: totalToday > 0 ? `${(100 - metrics.errorRatePercent).toFixed(2)}%` : '—', sub: `${successCount.toLocaleString()} requests`, color: '#34d399' },
              { label: '401 UNAUTHORIZED', value: metrics?.failedWebhooks > 0 ? metrics.failedWebhooks : '0', sub: 'Invalid / expired tokens', color: '#fbbf24' },
              { label: '429 RATE LIMITED', value: '0', sub: 'Quota caps hit', color: '#f59e0b' },
              { label: '500 SERVER ERROR', value: errorCount > 0 ? errorCount : '0', sub: `${metrics?.errorRatePercent ?? 0}% error rate`, color: '#f87171' },
            ].map((c, i) => (
              <div key={i} style={{ padding: '1.25rem', borderRadius: '14px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.72rem', color: c.color, fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 800, color: 'white', marginTop: '4px' }}>{c.value}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Extra Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {[
              { label: 'Requests Today', value: totalToday.toLocaleString(), color: '#38bdf8' },
              { label: 'Avg Response Time', value: metrics?.avgResponseTimeMs > 0 ? `${metrics.avgResponseTimeMs}ms` : '—', color: '#fbbf24' },
              { label: 'Active API Keys', value: metrics?.activeKeys || 0, color: '#2dd4bf' },
            ].map((c, i) => (
              <div key={i} style={{ padding: '1rem', borderRadius: '12px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 800, color: c.color, marginTop: '4px' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Endpoints & Consumers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Top Endpoints */}
            <div style={{ background: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', color: 'white' }}>
                Top Requested Endpoints
              </h3>
              {endpoints.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.83rem' }}>
                  <i className="fas fa-code" style={{ fontSize: '1.75rem', marginBottom: '0.75rem', color: '#334155' }}></i>
                  <div style={{ color: '#cbd5e1', fontWeight: 700 }}>No API Calls Logged Yet</div>
                  <div style={{ marginTop: '0.5rem' }}>
                    Endpoint stats populate when API keys are used to make requests.<br />
                    Records are written to <code style={{ color: '#38bdf8' }}>platform_api_analytics</code>.
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Endpoint</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Method</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Requests</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Latency</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpoints.map((ep, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.8rem' }}>{ep.endpoint}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, background: ep.method === 'GET' ? 'rgba(56,189,248,0.15)' : 'rgba(16,185,129,0.15)', color: ep.method === 'GET' ? '#38bdf8' : '#34d399' }}>
                              {ep.method}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: 700 }}>{ep.requests.toLocaleString()}</td>
                          <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{ep.latency}</td>
                          <td style={{ padding: '0.75rem', color: ep.errors === '0.0%' ? '#34d399' : '#fbbf24' }}>{ep.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top Consumers */}
            <div style={{ background: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', color: 'white' }}>
                Top API Key Consumers
              </h3>
              {filteredConsumers.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.83rem' }}>
                  <i className="fas fa-key" style={{ fontSize: '1.75rem', marginBottom: '0.75rem', color: '#334155' }}></i>
                  <div style={{ color: '#cbd5e1', fontWeight: 700 }}>No API Keys Provisioned Yet</div>
                  <div style={{ marginTop: '0.5rem' }}>
                    Create API keys in the API Key Manager section. Once requests are made, usage data appears here.
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.6rem 0.75rem' }}>API Key Consumer</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Env</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Requests</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConsumers.map((c, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ fontWeight: 700, color: 'white', fontSize: '0.83rem' }}>{c.name}</div>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#64748b' }}>{c.key_prefix}</div>
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, background: c.environment === 'production' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: c.environment === 'production' ? '#34d399' : '#fbbf24' }}>
                              {c.environment}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontWeight: 700, color: c.requests > 0 ? 'white' : '#64748b' }}>
                            {c.requests > 0 ? c.requests.toLocaleString() : '0'}
                          </td>
                          <td style={{ padding: '0.75rem', color: '#2dd4bf', fontWeight: 800 }}>{c.share}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ApiAnalytics;
