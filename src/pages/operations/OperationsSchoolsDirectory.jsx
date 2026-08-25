import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSchoolsDirectory } from '../../services/operationsService';
import { useAuth } from '../../store/AuthContext';
import LogoPreloader from '../../components/common/LogoPreloader';

const OperationsSchoolsDirectory = () => {
  const navigate = useNavigate();
  const { startImpersonation } = useAuth();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');

  const loadSchools = useCallback(async (force = false) => {
    try {
      const data = await getSchoolsDirectory(force);
      setSchools(data);
    } catch (err) {
      console.error('[SchoolsDirectory] Failed to load:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadSchools(); }, [loadSchools]);

  const handleRefresh = () => { setRefreshing(true); loadSchools(true); };

  const getHealthBadge = (healthStatus, score) => {
    switch (healthStatus) {
      case 'Healthy':  return { bg: '#ECFDF5', color: '#10B981', border: '#D1FAE5', label: `Healthy (${score}%)` };
      case 'Warning':  return { bg: '#FFFBEB', color: '#F59E0B', border: '#FEF3C7', label: `Warning (${score}%)` };
      case 'Critical': default:
        return { bg: '#FEF2F2', color: '#EF4444', border: '#FEE2E2', label: `Critical (${score}%)` };
    }
  };

  const regions = ['all', ...new Set(schools.map(s => s.region).filter(Boolean))];

  const filteredSchools = schools.filter(s => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      s.name?.toLowerCase().includes(q) ||
      s.headteacher?.toLowerCase().includes(q) ||
      s.circuit?.toLowerCase().includes(q) ||
      s.district?.toLowerCase().includes(q);
    const matchesRegion = regionFilter === 'all' || s.region === regionFilter;
    const matchesHealth = healthFilter === 'all' || s.health?.healthStatus === healthFilter;
    return matchesSearch && matchesRegion && matchesHealth;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: '#18181b' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
            Master Schools Operations Directory
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            {loading ? 'Loading schools from database…' : `${filteredSchools.length} of ${schools.length} schools shown`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search school, headteacher, circuit…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', width: '240px', outline: 'none' }}
          />
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
          >
            {regions.map(r => (
              <option key={r} value={r}>{r === 'all' ? 'All Regions' : r}</option>
            ))}
          </select>
          <select
            value={healthFilter}
            onChange={e => setHealthFilter(e.target.value)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
          >
            <option value="all">All Health States</option>
            <option value="Healthy">Healthy (≥80%)</option>
            <option value="Warning">Warning (60–79%)</option>
            <option value="Critical">Critical (&lt;60%)</option>
          </select>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ padding: '0.55rem 1rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Directory Table */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
        {loading ? (
          <div style={{ padding: '2rem 0' }}>
            <LogoPreloader fullScreen={false} size="sm" />
          </div>
        ) : filteredSchools.length === 0 ? (
          <div style={{ padding: '5rem', textAlign: 'center', color: '#71717a' }}>
            <i className="fas fa-school" style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#A1A1AA' }}></i>
            <h3 style={{ color: '#09090b', margin: '0 0 0.5rem', fontWeight: 800 }}>
              {schools.length === 0 ? 'No Schools Registered Yet' : 'No Schools Match Filters'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>
              {schools.length === 0
                ? 'Schools register via the Onboarding page. Once onboarded, they appear here with live health data.'
                : 'Try clearing your search term or changing filters.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E4E7', color: '#71717a', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>School Profile</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Circuit / Region</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Health Score</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Learners / Staff</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Score Entry</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Subscription</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Mode</th>
                  <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 800 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.map(s => {
                  const badge = getHealthBadge(s.health?.healthStatus, s.health?.totalScore);
                  const scorePct = s.total_scores_count > 0
                    ? Math.round((s.submitted_scores_count / s.total_scores_count) * 100)
                    : null;
                  return (
                    <tr
                      key={s.id}
                      style={{ borderBottom: '1px solid #F4F4F5', color: '#18181b', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.95rem' }}>{s.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700, marginTop: '2px' }}>
                          HT: {s.headteacher}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ color: '#18181b', fontWeight: 700 }}>{s.region}</div>
                        <div style={{ fontSize: '0.75rem', color: '#71717a' }}>{s.circuit}</div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ padding: '0.3rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 800, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                          ● {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 800, color: '#09090b' }}>{s.learners_count} Learners</div>
                        <div style={{ fontSize: '0.75rem', color: '#71717a' }}>{s.staff_count} Teachers</div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {scorePct !== null ? (
                          <div>
                            <div style={{ fontWeight: 800, color: scorePct >= 80 ? '#10B981' : scorePct >= 50 ? '#F59E0B' : '#EF4444' }}>
                              {scorePct}%
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#71717a' }}>
                              {s.submitted_scores_count}/{s.total_scores_count} submitted
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#71717a', fontSize: '0.8rem' }}>No scores yet</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ color: s.subscription_status === 'Active' ? '#10B981' : s.subscription_status === 'Trial' ? '#2563eb' : '#EF4444', fontWeight: 800 }}>
                          ● {s.subscription_status || 'Active'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#09090b', fontWeight: 800, marginTop: '2px' }}>
                          Bal: GH₵ {Number(s.wallet_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: s.is_read_only ? '#FEF2F2' : '#ECFDF5', color: s.is_read_only ? '#EF4444' : '#10B981', border: `1px solid ${s.is_read_only ? '#FEE2E2' : '#D1FAE5'}` }}>
                          {s.is_read_only ? 'Read Only' : 'Full Edit'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              startImpersonation(s.id, s.name);
                              navigate('/');
                            }}
                            title="Access school portal in remote support mode"
                            style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', background: '#09090b', border: 'none', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <i className="fas fa-right-to-bracket" /> Remote Access
                          </button>
                          <button
                            onClick={() => navigate(`/platform/operations/schools/${s.id}`)}
                            style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#09090b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            View Audit
                          </button>
                        </div>
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

export default OperationsSchoolsDirectory;
