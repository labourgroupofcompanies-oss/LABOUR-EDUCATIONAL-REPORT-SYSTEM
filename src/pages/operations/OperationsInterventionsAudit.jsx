import React, { useState, useEffect, useCallback } from 'react';
import { getInterventionsAuditLog } from '../../services/operationsService';
import LogoPreloader from '../../components/common/LogoPreloader';

const ACTION_LABELS = {
  override_report_release: 'Report Release Override',
  toggle_read_only_mode:   'Read-Only Mode Toggle',
  update_subscription:     'Subscription Update',
  support_message:         'Support Notice Sent',
};

const ACTION_COLORS = {
  override_report_release: { bg: '#EFF6FF', color: '#2563eb' },
  toggle_read_only_mode:   { bg: '#FFFBEB',  color: '#F59E0B' },
  update_subscription:     { bg: '#ECFDF5',  color: '#10B981' },
  support_message:         { bg: '#F4F4F5',  color: '#18181b' },
};

const OperationsInterventionsAudit = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async (force = false) => {
    try {
      const data = await getInterventionsAuditLog();
      setLogs(data);
    } catch (err) {
      console.error('[InterventionsAudit] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleRefresh = () => { setRefreshing(true); loadLogs(true); };

  const filtered = logs.filter(l => {
    const matchType = typeFilter === 'all' || l.action_type === typeFilter;
    const matchSearch = !search ||
      l.school_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.admin_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.description?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const uniqueTypes = ['all', ...new Set(logs.map(l => l.action_type).filter(Boolean))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: '#18181b' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
            Super Admin Interventions Audit Log
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            {loading ? 'Loading audit log…' : `${filtered.length} of ${logs.length} intervention${logs.length !== 1 ? 's' : ''} recorded`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search school, admin, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.83rem', width: '240px', outline: 'none' }}
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ padding: '0.55rem 1rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
            Refresh
          </button>
        </div>
      </div>

      {/* Type Filters */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {uniqueTypes.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid', borderColor: typeFilter === t ? '#2563eb' : '#E4E4E7', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', background: typeFilter === t ? '#2563eb' : '#FFFFFF', color: typeFilter === t ? '#FFFFFF' : '#71717a', transition: 'all 0.15s' }}
          >
            {t === 'all' ? 'All Actions' : (ACTION_LABELS[t] || t.replace(/_/g, ' '))}
          </button>
        ))}
      </div>

      {/* Audit Table */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '2rem 0' }}>
            <LogoPreloader fullScreen={false} size="sm" />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '5rem', textAlign: 'center', color: '#71717a' }}>
            <i className="fas fa-shield-halved" style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#A1A1AA' }}></i>
            <h3 style={{ color: '#09090b', margin: '0 0 0.5rem', fontWeight: 800 }}>No Interventions Recorded Yet</h3>
            <p style={{ margin: 0, fontSize: '0.82rem' }}>
              Remote support actions (report overrides, read-only toggles, subscription updates) will appear here once performed.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E4E7', color: '#71717a', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Timestamp</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Admin / Operator</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Target School</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Action Type</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Description</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 800 }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const actionStyle = ACTION_COLORS[l.action_type] || { bg: '#FAFAFA', color: '#71717a' };
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid #F4F4F5', color: '#18181b' }}>
                      <td style={{ padding: '0.85rem 1rem', color: '#71717a', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {new Date(l.created_at).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#2563eb', fontWeight: 800 }}>
                        {l.admin_name}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: '#09090b' }}>{l.school_name}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: actionStyle.bg, color: actionStyle.color }}>
                          {ACTION_LABELS[l.action_type] || l.action_type?.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#71717a', maxWidth: '320px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.description}>
                          {l.description}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, background: l.result === 'success' ? '#ECFDF5' : '#FEF2F2', color: l.result === 'success' ? '#10B981' : '#EF4444', border: `1px solid ${l.result === 'success' ? '#D1FAE5' : '#FEE2E2'}` }}>
                          {l.result === 'success' ? '✓ OK' : '✕ Failed'}
                        </span>
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

export default OperationsInterventionsAudit;
