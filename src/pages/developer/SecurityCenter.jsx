import React, { useState, useEffect, useCallback } from 'react';
import { getSecurityLogs, getSecuritySummary } from '../../services/developerService';
import LogoPreloader from '../../components/common/LogoPreloader';

const SecurityCenter = () => {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ failedAuth: 0, revokedKeys: 0, rotatedKeys: 0, criticalIncidents: 0, totalEvents: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [data, summ] = await Promise.all([
        getSecurityLogs(),
        getSecuritySummary(),
      ]);
      setLogs(data);
      setSummary(summ);
    } catch (err) {
      console.error('[SecurityCenter] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const getSeverityStyle = (sev) => {
    switch (sev) {
      case 'critical': return { bg: 'rgba(239,68,68,0.2)',   color: '#ef4444', border: 'rgba(239,68,68,0.4)' };
      case 'high':     return { bg: 'rgba(245,158,11,0.2)',  color: '#f59e0b', border: 'rgba(245,158,11,0.4)' };
      case 'medium':   return { bg: 'rgba(56,189,248,0.2)',  color: '#38bdf8', border: 'rgba(56,189,248,0.4)' };
      case 'low': default: return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: 'rgba(148,163,184,0.3)' };
    }
  };

  const filteredLogs = logs.filter(l => {
    const matchesSev = severityFilter === 'all' || l.severity === severityFilter;
    const matchesSearch = !search ||
      l.description?.toLowerCase().includes(search.toLowerCase()) ||
      l.event_type?.toLowerCase().includes(search.toLowerCase()) ||
      l.ip_address?.includes(search);
    return matchesSev && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: 0 }}>
            Security Center &amp; Audit Log
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Monitor failed authentications, revoked keys, token anomalies, and suspicious activity events.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Search events, IP, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.85rem', width: '220px' }}
          />
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.85rem' }}>
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button onClick={loadLogs} style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>

      {/* Live Security Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'TOTAL SECURITY EVENTS', value: summary.totalEvents, color: 'white', accent: '#71717a' },
          { label: 'FAILED AUTH EVENTS',    value: summary.failedAuth,  color: '#fbbf24', accent: '#F59E0B' },
          { label: 'REVOKED KEYS',          value: summary.revokedKeys, color: '#f87171', accent: '#EF4444' },
          { label: 'ROTATED KEYS',          value: summary.rotatedKeys, color: '#60a5fa', accent: '#2563eb' },
          { label: 'CRITICAL INCIDENTS',    value: summary.criticalIncidents, color: summary.criticalIncidents > 0 ? '#EF4444' : '#10B981', accent: summary.criticalIncidents > 0 ? '#EF4444' : '#10B981' },
        ].map((c, i) => (
          <div key={i} style={{ padding: '1.25rem', borderRadius: '14px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderLeft: `3px solid ${c.accent}` }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 800, color: c.color, marginTop: '4px' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Logs Table */}
      <div style={{ background: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem 0' }}>
            <LogoPreloader fullScreen={false} size="sm" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '5rem', textAlign: 'center', color: '#64748b' }}>
            <i className="fas fa-shield-check" style={{ fontSize: '3rem', marginBottom: '1rem', color: '#334155' }}></i>
            <h3 style={{ color: '#cbd5e1', margin: '0 0 0.5rem' }}>
              {logs.length === 0 ? 'No Security Events Recorded' : 'No Events Match Filters'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>
              {logs.length === 0
                ? 'Security events are automatically logged when API keys are rotated or revoked. Your platform is clean.'
                : 'Try adjusting your filters or search term.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '1rem' }}>Severity</th>
                  <th style={{ padding: '1rem' }}>Event Type</th>
                  <th style={{ padding: '1rem' }}>Description</th>
                  <th style={{ padding: '1rem' }}>IP Address</th>
                  <th style={{ padding: '1rem' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(l => {
                  const style = getSeverityStyle(l.severity);
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                          {l.severity}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#cbd5e1', fontWeight: 700, fontSize: '0.82rem' }}>{l.event_type}</td>
                      <td style={{ padding: '1rem', color: '#f1f5f9', maxWidth: '320px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.description}>
                          {l.description}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.8rem' }}>
                        {l.ip_address || '—'}
                      </td>
                      <td style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(l.created_at).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityCenter;
