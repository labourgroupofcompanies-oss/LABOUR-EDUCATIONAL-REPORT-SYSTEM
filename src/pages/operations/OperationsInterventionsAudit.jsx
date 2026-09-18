import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import subscriptionService from '../../services/subscriptionService';
import {
  getSchoolsDirectory,
  getInterventionsAuditLog,
  overrideReportRelease,
  toggleReadOnlyMode,
  createSupportTicket,
} from '../../services/operationsService';
import LogoPreloader from '../../components/common/LogoPreloader';

const ACTION_LABELS = {
  remote_impersonation_start: 'Remote Portal Access (Start)',
  remote_impersonation_end:   'Remote Portal Access (Exit)',
  override_report_release:    'Report Release Override',
  toggle_read_only_mode:      'Read-Only Mode Toggle',
  update_subscription:        'Subscription Update',
  support_message:            'Support Notice Sent',
  free_trial_toggle:          'Free Trial Toggle',
};

const ACTION_COLORS = {
  remote_impersonation_start: { bg: '#EEF2FF', color: '#4F46E5' },
  remote_impersonation_end:   { bg: '#F5F3FF', color: '#7C3AED' },
  override_report_release:    { bg: '#EFF6FF', color: '#2563EB' },
  toggle_read_only_mode:      { bg: '#FFFBEB', color: '#F59E0B' },
  update_subscription:        { bg: '#ECFDF5', color: '#10B981' },
  support_message:            { bg: '#F4F4F5', color: '#18181B' },
  free_trial_toggle:          { bg: '#FFF7ED', color: '#EA580C' },
};

const OperationsInterventionsAudit = () => {
  const navigate = useNavigate();
  const { startImpersonation } = useAuth();

  const [activeTab, setActiveTab] = useState('console'); // 'console' | 'audit'
  const [schools, setSchools] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);

  // Filters & Search
  const [schoolSearch, setSchoolSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('all');

  // Support Notice Modal
  const [selectedSchoolForNotice, setSelectedSchoolForNotice] = useState(null);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgPriority, setMsgPriority] = useState('High');
  const [messageText, setMessageText] = useState('');
  const [sendingNotice, setSendingNotice] = useState(false);

  const loadData = useCallback(async (force = false) => {
    try {
      const [schoolsList, auditLogs] = await Promise.all([
        getSchoolsDirectory(force),
        getInterventionsAuditLog(),
      ]);
      setSchools(schoolsList || []);
      setLogs(auditLogs || []);
    } catch (err) {
      console.error('[InterventionsHub] Load error:', err);
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

  // ── 1. Launch Remote Headteacher Portal ──────────────────────────────────────
  const handleLaunchHeadteacherPortal = async (school) => {
    if (!school) return;
    const confirmMsg =
      `🚀 LAUNCH REMOTE HEADTEACHER PORTAL ACCESS?\n\n` +
      `• School: ${school.name}\n` +
      `• School ID: ${school.id}\n` +
      `• Current Headteacher: ${school.headteacher || 'Headteacher'}\n\n` +
      `You will be redirected into the active school portal with full Headteacher administrative privileges (Dashboard, Learners, Scores, Reports, Settings, Top Up & Billing). Proceed?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await startImpersonation(school.id, school.name);
      navigate('/');
    } catch (err) {
      alert(`Failed to launch remote portal session: ${err.message}`);
    }
  };

  // ── 2. Toggle Report Cards Release ──────────────────────────────────────────
  const handleToggleReportRelease = async (school) => {
    const newStatus = !school.reports_released;
    const msg = `Are you sure you want to ${newStatus ? 'RELEASE' : 'LOCK'} report cards for "${school.name}"?\n\n` +
      (newStatus ? 'Parents will immediately be able to view and download terminal reports.' : 'Reports will be hidden from the Parent Portal.');

    if (!window.confirm(msg)) return;

    setActionInProgress(school.id);
    try {
      await overrideReportRelease(school.id, school.name, newStatus);
      setSchools(prev => prev.map(s => s.id === school.id ? { ...s, reports_released: newStatus } : s));
      await loadData(true);
    } catch (err) {
      alert(`Error toggling report release: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // ── 3. Toggle Read-Only Mode ─────────────────────────────────────────────────
  const handleToggleReadOnly = async (school) => {
    const newStatus = !school.is_read_only;
    const msg = `Are you sure you want to ${newStatus ? 'ENABLE Read-Only Mode' : 'RESTORE Full Edit Access'} for "${school.name}"?\n\n` +
      (newStatus ? 'All teachers and headteachers will lose edit access.' : 'Full edit access will be restored.');

    if (!window.confirm(msg)) return;

    setActionInProgress(school.id);
    try {
      await toggleReadOnlyMode(school.id, school.name, newStatus);
      setSchools(prev => prev.map(s => s.id === school.id ? { ...s, is_read_only: newStatus } : s));
      await loadData(true);
    } catch (err) {
      alert(`Error toggling read-only mode: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // ── 4. Toggle Free Trial ────────────────────────────────────────────────────
  const handleToggleFreeTrial = async (school) => {
    const isTerminated = Boolean(school.first_term_free_terminated);
    const actionMsg = isTerminated
      ? `Re-enable Free First Term for "${school.name}"?`
      : `Terminate Free First Term for "${school.name}"? This will require immediate subscription payment starting now.`;

    if (!window.confirm(actionMsg)) return;

    setActionInProgress(school.id);
    try {
      if (isTerminated) {
        await subscriptionService.restoreSchoolFreeTrial(school.id, 'Platform Operator');
      } else {
        await subscriptionService.terminateSchoolFreeTrial(school.id, true, 'Platform Operator');
      }
      setSchools(prev => prev.map(s => s.id === school.id ? { ...s, first_term_free_terminated: !isTerminated } : s));
      await loadData(true);
    } catch (err) {
      alert(`Error updating free trial status: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // ── 5. Dispatch Emergency Support Notice ───────────────────────────────────
  const handleSendNotice = async (e) => {
    e.preventDefault();
    if (!selectedSchoolForNotice || !msgTitle || !messageText) return;

    setSendingNotice(true);
    try {
      await createSupportTicket(
        selectedSchoolForNotice.id,
        selectedSchoolForNotice.name,
        msgTitle,
        'Platform Intervention',
        msgPriority,
        messageText
      );
      setSelectedSchoolForNotice(null);
      setMsgTitle('');
      setMessageText('');
      await loadData(true);
      alert('Intervention notice dispatched successfully!');
    } catch (err) {
      alert(`Failed to send notice: ${err.message}`);
    } finally {
      setSendingNotice(false);
    }
  };

  // Filtered Schools
  const filteredSchools = schools.filter(s => {
    const q = schoolSearch.toLowerCase();
    const matchesSearch = !schoolSearch ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.id || '').toLowerCase().includes(q) ||
      (s.headteacher || '').toLowerCase().includes(q) ||
      (s.district || '').toLowerCase().includes(q) ||
      (s.region || '').toLowerCase().includes(q) ||
      (s.circuit || '').toLowerCase().includes(q);

    const sCat = (s.school_category || s.school_type || 'Private').toLowerCase();
    const matchesCategory = categoryFilter === 'all' || sCat === categoryFilter.toLowerCase();

    let matchesStatus = true;
    if (statusFilter === 'critical') {
      matchesStatus = (s.health?.totalScore ?? 100) < 60;
    } else if (statusFilter === 'reports_locked') {
      matchesStatus = !s.reports_released;
    } else if (statusFilter === 'read_only') {
      matchesStatus = Boolean(s.is_read_only);
    } else if (statusFilter === 'first_term_free') {
      matchesStatus = !s.first_term_free_terminated && Boolean(s.is_first_term_free ?? true);
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Filtered Audit Logs
  const filteredLogs = logs.filter(l => {
    const matchType = auditTypeFilter === 'all' || l.action_type === auditTypeFilter;
    const q = auditSearch.toLowerCase();
    const matchSearch = !auditSearch ||
      (l.school_name || '').toLowerCase().includes(q) ||
      (l.admin_name || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const uniqueAuditTypes = ['all', ...new Set(logs.map(l => l.action_type).filter(Boolean))];

  // Aggregated Quick Stats
  const criticalCount = schools.filter(s => (s.health?.totalScore ?? 100) < 60).length;
  const reportsLockedCount = schools.filter(s => !s.reports_released).length;
  const readOnlyCount = schools.filter(s => Boolean(s.is_read_only)).length;
  const firstTermFreeCount = schools.filter(s => !s.first_term_free_terminated && Boolean(s.is_first_term_free ?? true)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: '#18181b', paddingBottom: '3rem' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'inline-flex', padding: '0.4rem', borderRadius: '10px', background: '#EEF2FF', color: '#4F46E5', fontSize: '1.1rem' }}>
              <i className="fas fa-user-shield" />
            </span>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
              Operations Remote Interventions &amp; Headteacher Access
            </h1>
          </div>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0.35rem 0 0' }}>
            Instant 1-click headteacher portal remote access, active intervention controls, and complete operational audit trail.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ padding: '0.55rem 1.1rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
          >
            <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setActiveTab('console')}
          style={{
            padding: '0.6rem 1.25rem',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            background: activeTab === 'console' ? '#4F46E5' : '#FFFFFF',
            color: activeTab === 'console' ? '#FFFFFF' : '#71717a',
            boxShadow: activeTab === 'console' ? '0 4px 12px rgba(79, 70, 229, 0.3)' : '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s'
          }}
        >
          <i className="fas fa-gamepad" /> Live School Interventions &amp; Portal Access ({schools.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '0.6rem 1.25rem',
            borderRadius: '10px',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            background: activeTab === 'audit' ? '#4F46E5' : '#FFFFFF',
            color: activeTab === 'audit' ? '#FFFFFF' : '#71717a',
            boxShadow: activeTab === 'audit' ? '0 4px 12px rgba(79, 70, 229, 0.3)' : '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s'
          }}
        >
          <i className="fas fa-list-check" /> Interventions &amp; Access Audit Log ({logs.length})
        </button>
      </div>

      {/* TAB 1: LIVE SCHOOL INTERVENTIONS & PORTAL ACCESS */}
      {activeTab === 'console' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Quick Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Registered Schools</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#09090b', marginTop: '2px' }}>{schools.length}</div>
            </div>

            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '0.72rem', color: '#EF4444', fontWeight: 800, textTransform: 'uppercase' }}>Critical Health (&lt;60%)</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#EF4444', marginTop: '2px' }}>{criticalCount}</div>
            </div>

            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '0.72rem', color: '#F59E0B', fontWeight: 800, textTransform: 'uppercase' }}>Reports Locked</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#F59E0B', marginTop: '2px' }}>{reportsLockedCount}</div>
            </div>

            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '0.72rem', color: '#8B5CF6', fontWeight: 800, textTransform: 'uppercase' }}>Read-Only Mode</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#8B5CF6', marginTop: '2px' }}>{readOnlyCount}</div>
            </div>

            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 800, textTransform: 'uppercase' }}>First Term Free</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>{firstTermFreeCount}</div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E4E4E7', padding: '0.9rem 1.15rem', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '260px' }}>
              <input
                type="text"
                placeholder="Search by school name, ID, headteacher, district, circuit…"
                value={schoolSearch}
                onChange={e => setSchoolSearch(e.target.value)}
                style={{ width: '100%', padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.82rem', fontWeight: 600, outline: 'none' }}
              >
                <option value="all">All Categories</option>
                <option value="private">Private</option>
                <option value="ges">GES</option>
                <option value="international">International</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.82rem', fontWeight: 600, outline: 'none' }}
              >
                <option value="all">All Health &amp; Access States</option>
                <option value="critical">Critical Health (&lt;60%)</option>
                <option value="reports_locked">Reports Locked</option>
                <option value="read_only">Read-Only Mode Active</option>
                <option value="first_term_free">First Term Free Active</option>
              </select>
            </div>
          </div>

          {/* School Cards Grid */}
          {loading ? (
            <div style={{ padding: '3rem 0' }}>
              <LogoPreloader fullScreen={false} size="md" />
            </div>
          ) : filteredSchools.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', color: '#71717a' }}>
              <i className="fas fa-school-circle-xmark" style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#A1A1AA' }} />
              <h3 style={{ color: '#09090b', margin: '0 0 0.5rem', fontWeight: 800 }}>No Schools Match Your Filter</h3>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Try changing search terms or filters above.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.15rem' }}>
              {filteredSchools.map(school => {
                const healthScore = school.health?.totalScore ?? 100;
                const isCritical = healthScore < 60;
                const isModerate = healthScore >= 60 && healthScore < 80;
                const healthColor = isCritical ? '#EF4444' : isModerate ? '#F59E0B' : '#10B981';
                const healthBg = isCritical ? '#FEF2F2' : isModerate ? '#FFFBEB' : '#ECFDF5';
                const isTrialActive = !school.first_term_free_terminated && Boolean(school.is_first_term_free ?? true);
                const isBusy = actionInProgress === school.id;

                return (
                  <div
                    key={school.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '16px',
                      border: '1px solid #E4E4E7',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      transition: 'transform 0.15s, box-shadow 0.15s',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Top Stripe Accent */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: isCritical ? '#EF4444' : '#4F46E5' }} />

                    {/* School Info Header */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '6px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #DBEAFE' }}>
                              {school.school_category || school.school_type || 'Private'}
                            </span>
                            {isTrialActive && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '6px', background: '#FFFBEB', color: '#D97706', border: '1px solid #FEF3C7' }}>
                                🎁 1st Term Free
                              </span>
                            )}
                          </div>
                          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 800, color: '#09090b', margin: '0.4rem 0 0.15rem' }}>
                            {school.name}
                          </h3>
                          <div style={{ fontSize: '0.75rem', color: '#71717a' }}>
                            ID: <strong style={{ color: '#09090b', fontFamily: 'monospace' }}>{school.id}</strong> • 📍 {school.district || school.region || 'Ghana'}
                          </div>
                        </div>

                        {/* Health Badge */}
                        <div style={{ padding: '0.35rem 0.65rem', borderRadius: '10px', background: healthBg, color: healthColor, textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.95rem', fontWeight: 900 }}>{healthScore}%</div>
                          <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase' }}>
                            {isCritical ? 'Critical' : isModerate ? 'Moderate' : 'Healthy'}
                          </div>
                        </div>
                      </div>

                      {/* Headteacher & Counts */}
                      <div style={{ marginTop: '0.9rem', padding: '0.75rem', borderRadius: '12px', background: '#FAFAFA', border: '1px solid #F4F4F5', fontSize: '0.78rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <div style={{ color: '#71717a', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>Headteacher</div>
                          <div style={{ fontWeight: 800, color: '#09090b', marginTop: '1px' }}>{school.headteacher || 'Unassigned'}</div>
                          <div style={{ fontSize: '0.7rem', color: '#71717a' }}>{school.phone || 'No phone'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#71717a', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>Academic Size</div>
                          <div style={{ fontWeight: 800, color: '#09090b', marginTop: '1px' }}>
                            {school.learners_count || 0} Learners
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#71717a' }}>
                            {school.classes_count || 0} Classes • {school.staff_count || 0} Teachers
                          </div>
                        </div>
                      </div>

                      {/* Status Badges Row */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px', background: school.reports_released ? '#ECFDF5' : '#FEF2F2', color: school.reports_released ? '#10B981' : '#EF4444', border: `1px solid ${school.reports_released ? '#D1FAE5' : '#FEE2E2'}` }}>
                          <i className={`fas ${school.reports_released ? 'fa-unlock' : 'fa-lock'}`} style={{ marginRight: '4px' }} />
                          Reports: {school.reports_released ? 'Released' : 'Locked'}
                        </span>

                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '6px', background: school.is_read_only ? '#FFFBEB' : '#EFF6FF', color: school.is_read_only ? '#F59E0B' : '#2563EB', border: `1px solid ${school.is_read_only ? '#FEF3C7' : '#DBEAFE'}` }}>
                          <i className={`fas ${school.is_read_only ? 'fa-shield-halved' : 'fa-pen-to-square'}`} style={{ marginRight: '4px' }} />
                          Mode: {school.is_read_only ? 'Read Only' : 'Full Edit'}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons Section */}
                    <div style={{ marginTop: '1.15rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Primary Action: Launch Headteacher Portal */}
                      <button
                        onClick={() => handleLaunchHeadteacherPortal(school)}
                        disabled={isBusy}
                        style={{
                          width: '100%',
                          padding: '0.65rem 1rem',
                          borderRadius: '10px',
                          background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)',
                          border: 'none',
                          color: '#FFFFFF',
                          fontWeight: 800,
                          fontSize: '0.84rem',
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)',
                          transition: 'transform 0.15s, opacity 0.15s'
                        }}
                      >
                        <i className="fas fa-right-to-bracket" />
                        Launch Headteacher Portal
                      </button>

                      {/* Secondary Action Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          onClick={() => handleToggleReportRelease(school)}
                          disabled={isBusy}
                          style={{
                            padding: '0.45rem 0.65rem',
                            borderRadius: '8px',
                            background: school.reports_released ? '#FEF2F2' : '#ECFDF5',
                            border: `1px solid ${school.reports_released ? '#FEE2E2' : '#D1FAE5'}`,
                            color: school.reports_released ? '#EF4444' : '#10B981',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <i className={`fas ${school.reports_released ? 'fa-lock' : 'fa-unlock'}`} />
                          {school.reports_released ? 'Lock Reports' : 'Release Reports'}
                        </button>

                        <button
                          onClick={() => handleToggleReadOnly(school)}
                          disabled={isBusy}
                          style={{
                            padding: '0.45rem 0.65rem',
                            borderRadius: '8px',
                            background: school.is_read_only ? '#EFF6FF' : '#FFFBEB',
                            border: `1px solid ${school.is_read_only ? '#DBEAFE' : '#FEF3C7'}`,
                            color: school.is_read_only ? '#2563EB' : '#D97706',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <i className={`fas ${school.is_read_only ? 'fa-lock-open' : 'fa-shield-halved'}`} />
                          {school.is_read_only ? 'Unlock Edit' : 'Set Read-Only'}
                        </button>
                      </div>

                      {/* Bottom utility row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          onClick={() => setSelectedSchoolForNotice(school)}
                          style={{
                            padding: '0.4rem 0.65rem',
                            borderRadius: '8px',
                            background: '#FAFAFA',
                            border: '1px solid #E4E4E7',
                            color: '#09090b',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <i className="fas fa-paper-plane" style={{ color: '#4F46E5' }} />
                          Send Notice
                        </button>

                        <button
                          onClick={() => navigate(`/platform/operations/schools/${school.id}`)}
                          style={{
                            padding: '0.4rem 0.65rem',
                            borderRadius: '8px',
                            background: '#FAFAFA',
                            border: '1px solid #E4E4E7',
                            color: '#09090b',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <i className="fas fa-circle-info" style={{ color: '#3B82F6' }} />
                          School Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTERVENTIONS & AUDIT LOG */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Audit Search & Type Filter Bar */}
          <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E4E4E7', padding: '0.9rem 1.15rem', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search audit trail by school, admin operator, description…"
              value={auditSearch}
              onChange={e => setAuditSearch(e.target.value)}
              style={{ flex: 1, minWidth: '260px', padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.83rem', outline: 'none' }}
            />

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {uniqueAuditTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setAuditTypeFilter(t)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: auditTypeFilter === t ? '#4F46E5' : '#E4E4E7',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: auditTypeFilter === t ? '#4F46E5' : '#FFFFFF',
                    color: auditTypeFilter === t ? '#FFFFFF' : '#71717a',
                    transition: 'all 0.15s'
                  }}
                >
                  {t === 'all' ? 'All Actions' : (ACTION_LABELS[t] || t.replace(/_/g, ' '))}
                </button>
              ))}
            </div>
          </div>

          {/* Audit Table */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            {loading ? (
              <div style={{ padding: '2rem 0' }}>
                <LogoPreloader fullScreen={false} size="sm" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ padding: '5rem', textAlign: 'center', color: '#71717a' }}>
                <i className="fas fa-shield-halved" style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#A1A1AA' }} />
                <h3 style={{ color: '#09090b', margin: '0 0 0.5rem', fontWeight: 800 }}>No Interventions Recorded Yet</h3>
                <p style={{ margin: 0, fontSize: '0.82rem' }}>
                  Remote support sessions, report overrides, and subscription adjustments will appear here automatically.
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
                    {filteredLogs.map(l => {
                      const actionStyle = ACTION_COLORS[l.action_type] || { bg: '#FAFAFA', color: '#71717a' };
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid #F4F4F5', color: '#18181b' }}>
                          <td style={{ padding: '0.85rem 1rem', color: '#71717a', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                            {new Date(l.created_at).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: '#4F46E5', fontWeight: 800 }}>
                            {l.admin_name}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: '#09090b' }}>{l.school_name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#71717a' }}>{l.school_id}</div>
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
      )}

      {/* Support Notice Modal */}
      {selectedSchoolForNotice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '500px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
                Dispatch Support Notice
              </h3>
              <button
                onClick={() => setSelectedSchoolForNotice(null)}
                style={{ background: 'transparent', border: 'none', color: '#71717a', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#71717a', margin: '0 0 1rem' }}>
              Sending direct administrative alert to <strong style={{ color: '#09090b' }}>{selectedSchoolForNotice.name}</strong>.
            </p>

            <form onSubmit={handleSendNotice} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#09090b', marginBottom: '4px', textTransform: 'uppercase' }}>Notice Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Immediate Score Correction Required"
                  value={msgTitle}
                  onChange={e => setMsgTitle(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#09090b', marginBottom: '4px', textTransform: 'uppercase' }}>Priority</label>
                <select
                  value={msgPriority}
                  onChange={e => setMsgPriority(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none' }}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High (Urgent)</option>
                  <option value="Critical">Critical (Immediate Attention)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#09090b', marginBottom: '4px', textTransform: 'uppercase' }}>Message Body</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter detailed instruction or notice for the school headteacher..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedSchoolForNotice(null)}
                  style={{ padding: '0.55rem 1rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#09090b', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingNotice}
                  style={{ padding: '0.55rem 1.25rem', borderRadius: '10px', background: '#4F46E5', border: 'none', color: '#FFFFFF', fontWeight: 800, fontSize: '0.82rem', cursor: sendingNotice ? 'not-allowed' : 'pointer' }}
                >
                  {sendingNotice ? 'Dispatching…' : 'Send Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsInterventionsAudit;
