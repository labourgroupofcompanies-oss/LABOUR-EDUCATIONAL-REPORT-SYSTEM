import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import subscriptionService from '../../services/subscriptionService';
import {
  getSchoolsDirectory,
  getSchoolTimelineEvents,
  overrideReportRelease,
  toggleReadOnlyMode,
  updateSchoolSubscription,
  recordSupportIntervention,
  recordSchoolTimelineEvent,
  getSupportTickets,
  createSupportTicket,
  addTicketMessage,
} from '../../services/operationsService';
import LogoPreloader from '../../components/common/LogoPreloader';

const SchoolDetailView = () => {
  const { schoolId } = useParams();
  const navigate = useNavigate();

  const [school, setSchool] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('health'); // 'health' | 'timeline' | 'support'

  // Subscription modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [subTier, setSubTier] = useState('Standard');
  const [subStatus, setSubStatus] = useState('Active');
  const [subRenewal, setSubRenewal] = useState('2026-12-31');

  // Support notice modal
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgCategory, setMsgCategory] = useState('General Support');
  const [msgPriority, setMsgPriority] = useState('Medium');
  const [messageText, setMessageText] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, allTickets] = await Promise.all([
        getSchoolsDirectory(true),
        getSupportTickets(),
      ]);

      const found = list.find(x => x.id === schoolId);
      if (found) {
        setSchool(found);
        setSubTier(found.subscription_tier || 'Standard');
        setSubStatus(found.subscription_status || 'Active');

        const events = await getSchoolTimelineEvents(found.id);
        setTimeline(events);
      } else {
        console.warn('[SchoolDetailView] School not found:', schoolId);
      }

      setTickets(allTickets.filter(t => t.school_id === schoolId));
    } catch (err) {
      console.error('[SchoolDetailView] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleReportRelease = async () => {
    if (!school) return;
    const newStatus = !school.reports_released;
    if (!window.confirm(
      `Are you sure you want to ${newStatus ? 'RELEASE' : 'LOCK'} all terminal report cards for "${school.name}"?\n\n` +
      (newStatus ? 'Parents will be able to view their children\'s reports immediately.' : 'Reports will be hidden from the Parent Portal.')
    )) return;

    setSaving(true);
    try {
      await overrideReportRelease(school.id, school.name, newStatus);
      setSchool(prev => ({ ...prev, reports_released: newStatus }));
      await loadData();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReadOnly = async () => {
    if (!school) return;
    const newStatus = !school.is_read_only;
    if (!window.confirm(
      `Are you sure you want to ${newStatus ? 'ENABLE Read-Only Mode' : 'DISABLE Read-Only Mode'} for "${school.name}"?\n\n` +
      (newStatus ? 'All teachers and the headteacher will lose edit access.' : 'Full edit access will be restored.')
    )) return;

    setSaving(true);
    try {
      await toggleReadOnlyMode(school.id, school.name, newStatus);
      setSchool(prev => ({ ...prev, is_read_only: newStatus }));
      await loadData();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubscription = async (e) => {
    e.preventDefault();
    if (!school) return;
    setSaving(true);
    try {
      await updateSchoolSubscription(school.id, school.name, subTier, subStatus, subRenewal);
      setShowSubModal(false);
      await loadData();
    } catch (err) {
      alert(`Error updating subscription: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFreeTrial = async () => {
    if (!school) return;
    const isTerminated = school.first_term_free_terminated;
    const actionMsg = isTerminated
      ? `Re-enable Free First Term for "${school.name}"?`
      : `Terminate Free First Term for "${school.name}"? This will require immediate subscription payment starting now.`;

    if (!window.confirm(actionMsg)) return;

    setSaving(true);
    try {
      if (isTerminated) {
        await subscriptionService.restoreSchoolFreeTrial(school.id, 'Platform Developer');
      } else {
        await subscriptionService.terminateSchoolFreeTrial(school.id, true, 'Platform Developer');
      }
      setSchool(prev => ({ ...prev, first_term_free_terminated: !isTerminated }));
      await loadData();
    } catch (err) {
      alert(`Error updating free trial status: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendSupportNotice = async (e) => {
    e.preventDefault();
    if (!school || !msgTitle || !messageText) return;
    setSaving(true);
    try {
      await createSupportTicket(school.id, school.name, msgTitle, msgCategory, msgPriority, messageText);
      setShowMsgModal(false);
      setMsgTitle('');
      setMessageText('');
      await loadData();
      alert('Support notice dispatched successfully!');
    } catch (err) {
      alert(`Error sending notice: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LogoPreloader fullScreen={false} size="md" />;
  }

  if (!school) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#71717a' }}>
        <i className="fas fa-circle-exclamation" style={{ fontSize: '2.5rem', color: '#EF4444', marginBottom: '1rem', display: 'block' }}></i>
        <h2 style={{ color: '#09090b', margin: '0 0 0.5rem' }}>School Not Found</h2>
        <button onClick={() => navigate('/platform/operations/schools')} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#09090b', color: '#FFFFFF', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
          Back to Directory
        </button>
      </div>
    );
  }

  const health = school.health || { totalScore: 0, healthStatus: 'Critical', breakdown: {} };
  const scorePct = school.total_scores_count > 0
    ? Math.round((school.submitted_scores_count / school.total_scores_count) * 100)
    : 0;

  const isTrialTerminated = school.first_term_free_terminated;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: '#18181b' }}>

      {/* Back + Title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button
            onClick={() => navigate('/platform/operations/schools')}
            style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', marginBottom: '0.4rem', padding: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ← Back to Schools Directory
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
              {school.name}
            </h1>
            {!isTrialTerminated && (
              <span style={{ background: '#FFFBEB', border: '1px solid #FEF3C7', color: '#F59E0B', fontSize: '0.72rem', fontWeight: 900, padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                🎁 FIRST TERM FREE
              </span>
            )}
          </div>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            {school.region} • {school.district} • {school.circuit} • HT: <strong style={{ color: '#09090b' }}>{school.headteacher}</strong>
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleToggleFreeTrial}
            disabled={saving}
            title="Developer Control to terminate or restore free trial"
            style={{ padding: '0.6rem 1.1rem', borderRadius: '10px', background: isTrialTerminated ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${isTrialTerminated ? '#D1FAE5' : '#FEE2E2'}`, color: isTrialTerminated ? '#10B981' : '#EF4444', fontWeight: 800, fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={`fas ${isTrialTerminated ? 'fa-undo' : 'fa-ban'}`}></i>
            {isTrialTerminated ? 'Restore Free Trial' : 'Terminate Free Trial'}
          </button>

          <button
            onClick={handleToggleReportRelease}
            disabled={saving}
            style={{ padding: '0.6rem 1.1rem', borderRadius: '10px', background: school.reports_released ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${school.reports_released ? '#FEE2E2' : '#D1FAE5'}`, color: school.reports_released ? '#EF4444' : '#10B981', fontWeight: 800, fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={`fas ${school.reports_released ? 'fa-lock' : 'fa-unlock'}`}></i>
            {school.reports_released ? 'Lock Reports' : 'Release Reports'}
          </button>

          <button
            onClick={handleToggleReadOnly}
            disabled={saving}
            style={{ padding: '0.6rem 1.1rem', borderRadius: '10px', background: school.is_read_only ? '#EFF6FF' : '#FFFBEB', border: `1px solid ${school.is_read_only ? '#DBEAFE' : '#FEF3C7'}`, color: school.is_read_only ? '#2563eb' : '#F59E0B', fontWeight: 800, fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={`fas ${school.is_read_only ? 'fa-lock-open' : 'fa-shield-halved'}`}></i>
            {school.is_read_only ? 'Unlock Edit Access' : 'Enable Read-Only'}
          </button>

          <button
            onClick={() => setShowSubModal(true)}
            style={{ padding: '0.6rem 1.1rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#09090b', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className="fas fa-credit-card" style={{ color: '#2563eb' }}></i>
            Manage Subscription
          </button>

          <button
            onClick={() => setShowMsgModal(true)}
            style={{ padding: '0.6rem 1.1rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(9,9,11,0.2)' }}
          >
            <i className="fas fa-paper-plane"></i>
            Send Support Notice
          </button>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.85rem' }}>
        {[
          { label: 'Active Learners', value: school.learners_count, color: '#09090b' },
          { label: 'Classes', value: school.classes_count || 0, color: '#2563eb' },
          { label: 'Teaching Staff', value: school.staff_count, color: '#0284c7' },
          { label: 'Wallet Balance', value: `GH₵ ${Number(school.wallet_balance || 0).toFixed(2)}`, color: Number(school.wallet_balance || 0) > 0 ? '#10B981' : '#EF4444' },
          { label: 'Score Entry', value: `${scorePct}%`, color: scorePct >= 80 ? '#10B981' : scorePct >= 50 ? '#F59E0B' : '#EF4444' },
          { label: 'Reports Released', value: school.reports_released ? 'Yes' : 'No', color: school.reports_released ? '#10B981' : '#71717a' },
          { label: 'Access Mode', value: school.is_read_only ? 'Read Only' : 'Full Edit', color: school.is_read_only ? '#EF4444' : '#10B981' },
        ].map((stat, i) => (
          <div key={i} style={{ padding: '0.85rem 1rem', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E4E4E7', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>{stat.label}</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: stat.color, marginTop: '2px' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Comprehensive School Profile & Database Metadata Card */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Database School ID</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 800, color: '#09090b', marginTop: '2px' }}>{school.id}</div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>Registered: {new Date(school.created_at).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Category &amp; Session</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
            <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: '#EFF6FF', color: '#2563eb', border: '1px solid #DBEAFE' }}>
              {school.school_category || school.school_type || 'Private'}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#09090b' }}>
              {school.current_term || 'Term 1'} ({school.current_academic_year || '2025/2026'})
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
            Onboarding Term: <strong style={{ color: '#09090b' }}>{school.initial_term || 'Term 1'} ({school.initial_academic_year || '2025/2026'})</strong>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Contact Information</div>
          <div style={{ fontSize: '0.85rem', color: '#09090b', fontWeight: 600, marginTop: '2px' }}>
            📞 {school.phone || 'N/A'} • ✉️ {school.email || 'N/A'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '2px' }}>
            📍 {school.location || `${school.district || ''}, ${school.region || ''}`}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Term Entitlement Status</div>
          {(() => {
            const isInitial = (school.initial_academic_year === school.current_academic_year && school.initial_term === school.current_term) || (!school.initial_academic_year && !school.initial_term);
            const isFree = school.is_first_term_free && !school.first_term_free_terminated && isInitial;
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span style={{
                    padding: '0.2rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background: isFree ? '#EFF6FF' : school.subscription_status === 'Active' ? '#ECFDF5' : '#FEF2F2',
                    color: isFree ? '#2563eb' : school.subscription_status === 'Active' ? '#10B981' : '#EF4444',
                    border: `1px solid ${isFree ? '#DBEAFE' : school.subscription_status === 'Active' ? '#D1FAE5' : '#FEE2E2'}`
                  }}>
                    {isFree ? '🎁 Free First Term' : isInitial ? '⚠️ Trial Terminated (Paid)' : '💳 Subsequent Term (Paid)'}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
                  Rate: {school.per_learner_rate_override ? `GH₵ ${school.per_learner_rate_override}/learner (Override)` : 'Category Default'}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: '#FAFAFA', padding: '4px', borderRadius: '12px', border: '1px solid #E4E4E7', width: 'fit-content' }}>
        {['health', 'timeline', 'support'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', background: activeTab === tab ? '#09090b' : 'transparent', color: activeTab === tab ? '#FFFFFF' : '#71717a', textTransform: 'capitalize', transition: 'all 0.15s' }}
          >
            {tab === 'health' ? '📊 Health Score' : tab === 'timeline' ? '📅 Activity Timeline' : '🎫 Support Tickets'}
          </button>
        ))}
      </div>

      {/* Health Score Tab */}
      {activeTab === 'health' && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E4E4E7', padding: '2rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          {/* Gauge */}
          <div style={{ background: '#FAFAFA', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E4E4E7', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <div style={{ fontSize: '3.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: health.healthStatus === 'Healthy' ? '#10B981' : health.healthStatus === 'Warning' ? '#F59E0B' : '#EF4444' }}>
              {health.totalScore}%
            </div>
            <div style={{ padding: '0.3rem 0.85rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', background: health.healthStatus === 'Healthy' ? '#ECFDF5' : health.healthStatus === 'Warning' ? '#FFFBEB' : '#FEF2F2', color: health.healthStatus === 'Healthy' ? '#10B981' : health.healthStatus === 'Warning' ? '#F59E0B' : '#EF4444', border: `1px solid ${health.healthStatus === 'Healthy' ? '#D1FAE5' : health.healthStatus === 'Warning' ? '#FEF3C7' : '#FEE2E2'}` }}>
              ● {health.healthStatus} Health
            </div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', textAlign: 'center', fontWeight: 600 }}>
              Computed from 6 live platform factors
            </div>
          </div>

          {/* Factor Breakdown */}
          <div>
            <h3 style={{ margin: '0 0 1rem', fontFamily: 'Outfit, sans-serif', color: '#09090b', fontSize: '1rem', fontWeight: 800 }}>
              Diagnostic Factor Breakdown
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {[
                { label: 'SYNC HEALTH (20%)', value: health.breakdown?.syncHealth || 0, color: '#2563eb' },
                { label: 'SCORE ENTRY (25%)', value: health.breakdown?.scoreCompletion || 0, color: '#10B981' },
                { label: 'REPORTS GENERATED (20%)', value: health.breakdown?.reportStatus || 0, color: '#7c3aed' },
                { label: 'SUPPORT ISSUES (15%)', value: health.breakdown?.supportStatus || 0, color: '#F59E0B' },
                { label: 'SUBSCRIPTION (10%)', value: health.breakdown?.subStatus || 0, color: '#0284c7' },
                { label: 'ACTIVE USERS (10%)', value: health.breakdown?.activeUsers || 0, color: '#10B981' },
              ].map((f, i) => (
                <div key={i} style={{ background: '#FAFAFA', padding: '1rem', borderRadius: '12px', border: '1px solid #E4E4E7' }}>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 700 }}>{f.label}</div>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.4rem', fontWeight: 800, color: f.color, marginTop: '4px' }}>{f.value}%</div>
                  <div style={{ height: '4px', background: '#E4E4E7', borderRadius: '4px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${f.value}%`, background: f.color, borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Activity Timeline Tab */}
      {activeTab === 'timeline' && (
        <div style={{ background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E4E4E7', padding: '1.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: '#09090b', fontSize: '1.1rem', fontWeight: 800 }}>
              School Activity Timeline
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600 }}>
              {timeline.length} events recorded
            </span>
          </div>

          {timeline.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a' }}>
              <i className="fas fa-history" style={{ fontSize: '2rem', marginBottom: '0.75rem', color: '#A1A1AA' }}></i>
              <div style={{ color: '#09090b', fontWeight: 800 }}>No Timeline Events Yet</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>Events are automatically recorded when interventions, score entries, and reports occur.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '2px solid #E4E4E7', paddingLeft: '1.5rem', marginLeft: '0.5rem' }}>
              {timeline.map((evt, idx) => (
                <div key={evt.id || idx} style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '-1.95rem', top: '0.35rem', width: '12px', height: '12px', borderRadius: '50%', background: '#2563eb', boxShadow: '0 0 8px rgba(37,99,235,0.4)' }} />
                  <div style={{ background: '#FAFAFA', padding: '1rem 1.1rem', borderRadius: '12px', border: '1px solid #E4E4E7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ color: '#09090b', fontWeight: 800, fontSize: '0.9rem' }}>{evt.title}</span>
                      <span style={{ fontSize: '0.72rem', color: '#71717a', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                        {new Date(evt.created_at).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    {evt.description && (
                      <p style={{ color: '#71717a', fontSize: '0.83rem', margin: '0.3rem 0 0', lineHeight: 1.5 }}>{evt.description}</p>
                    )}
                    <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '0.4rem', fontWeight: 700 }}>
                      Actor: <strong>{evt.actor_name}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Support Tickets Tab */}
      {activeTab === 'support' && (
        <div style={{ background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E4E4E7', padding: '1.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: '#09090b', fontSize: '1.1rem', fontWeight: 800 }}>
              Support Tickets for this School
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600 }}>
              {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            </span>
          </div>
          {tickets.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a' }}>
              <i className="fas fa-ticket-simple" style={{ fontSize: '2rem', marginBottom: '0.75rem', color: '#A1A1AA' }}></i>
              <div style={{ color: '#09090b', fontWeight: 800 }}>No Support Tickets</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
                Use the "Send Support Notice" button above to create a ticket for this school.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {tickets.map(t => (
                <div key={t.id} style={{ background: '#FAFAFA', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #E4E4E7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#2563eb', fontWeight: 800 }}>{t.ticket_code}</span>
                      <span style={{ marginLeft: '10px', fontWeight: 800, color: '#09090b' }}>{t.title}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: t.priority === 'High' || t.priority === 'Urgent' ? '#EF4444' : '#F59E0B' }}>{t.priority}</span>
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: t.status === 'Resolved' ? '#ECFDF5' : '#EFF6FF', color: t.status === 'Resolved' ? '#10B981' : '#2563eb' }}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                  {t.messages?.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#71717a' }}>
                      {t.messages[0].sender}: "{t.messages[0].text?.substring(0, 120)}{t.messages[0].text?.length > 120 ? '…' : ''}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SUBSCRIPTION MODAL ── */}
      {showSubModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '480px', color: '#18181b', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 1.25rem', fontWeight: 800, color: '#09090b' }}>Manage Subscription — {school.name}</h2>
            <form onSubmit={handleSaveSubscription} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Subscription Tier</label>
                <select value={subTier} onChange={e => setSubTier(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}>
                  <option value="Basic">Basic (GH₵ 1,200 / yr)</option>
                  <option value="Standard">Standard (GH₵ 2,500 / yr)</option>
                  <option value="Enterprise">Enterprise (GH₵ 4,800 / yr)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Account Status</label>
                <select value={subStatus} onChange={e => setSubStatus(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}>
                  <option value="Active">Active</option>
                  <option value="Trial">Trial (30-day evaluation)</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Renewal Date</label>
                <input type="date" value={subRenewal} onChange={e => setSubRenewal(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowSubModal(false)} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#71717a', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SUPPORT NOTICE MODAL ── */}
      {showMsgModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '540px', color: '#18181b', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 0.5rem', fontWeight: 800, color: '#09090b' }}>Send Support Notice</h2>
            <p style={{ color: '#71717a', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
              Create a support ticket and dispatch an alert to headteacher <strong style={{ color: '#09090b' }}>{school.headteacher}</strong>.
            </p>
            <form onSubmit={handleSendSupportNotice} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Ticket Title</label>
                <input type="text" required placeholder="e.g. Score Entry Sync Issue — Urgent" value={msgTitle} onChange={e => setMsgTitle(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.9rem', outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Category</label>
                  <select value={msgCategory} onChange={e => setMsgCategory(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}>
                    <option>General Support</option>
                    <option>Sync &amp; Data Entry</option>
                    <option>Billing &amp; License</option>
                    <option>Report Release</option>
                    <option>Access &amp; Security</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Priority</label>
                  <select value={msgPriority} onChange={e => setMsgPriority(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}>
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Message</label>
                <textarea rows={4} required placeholder="Describe the issue or support action in detail…" value={messageText} onChange={e => setMessageText(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.9rem', resize: 'vertical', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowMsgModal(false)} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#71717a', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Sending…' : 'Send Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolDetailView;
