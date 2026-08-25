import React, { useState, useEffect } from 'react';
import referralAnalyticsService from '../../services/referralAnalyticsService';
import referralService from '../../services/referralService';
import rewardService from '../../services/rewardService';
import configurationService from '../../services/configurationService';
import { db } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

const ReferralManagementDashboard = () => {
  const [telemetry, setTelemetry] = useState(null);
  const [config, setConfig] = useState({
    rewardAmount: 20.00,
    welcomeBonusAmount: 10.00,
    referralExpiryDays: 7,
    fraudThreshold: 0.4,
    isProgramEnabled: true,
    enableWelcomeBonus: true
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNotice, setActionNotice] = useState(null);
  const [rowActions, setRowActions] = useState({});

  const rawReferrals = useLiveQuery(() => db.referrals.toArray(), []);
  const allSchools = useLiveQuery(() => db.schools.toArray(), []);

  const loadData = async () => {
    try {
      const analytics = await referralAnalyticsService.getSuperAdminAnalytics();
      setTelemetry(analytics);

      const currentConfig = await configurationService.getReferralConfig();
      setConfig(currentConfig);
    } catch (err) {
      console.warn('[ReferralDashboard] Data load notice:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [rawReferrals]);

  const handleConfigSave = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await configurationService.updateReferralConfig(config);
      setActionNotice({ type: 'success', text: '✅ Referral program settings updated successfully!' });
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err) {
      setActionNotice({ type: 'error', text: '❌ Failed to update settings: ' + err.message });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleVerify = async (referralId, referredSchoolId) => {
    const rowKey = referralId || referredSchoolId;
    setRowActions(prev => ({ ...prev, [rowKey]: { loading: 'verify' } }));
    try {
      await referralService.verifyReferral(referralId, 'Super Admin');
      if (referredSchoolId) {
        await rewardService.processReferralReward(referredSchoolId, { referralId, manualOverride: true }).catch(() => null);
      }
      setRowActions(prev => ({
        ...prev,
        [rowKey]: { loading: null, status: 'VERIFIED', message: 'Verified & Queued' }
      }));
      setActionNotice({ type: 'success', text: '✅ Referral verified and wallet reward credited successfully!' });
      setTimeout(() => setActionNotice(null), 4000);
      await loadData();
    } catch (err) {
      setRowActions(prev => ({
        ...prev,
        [rowKey]: { loading: null, status: 'FAILED', message: err.message }
      }));
      setActionNotice({ type: 'error', text: '❌ ' + err.message });
    }
  };

  const handleManualReward = async (referralId, referredSchoolId) => {
    const rowKey = referralId || referredSchoolId;
    setRowActions(prev => ({ ...prev, [rowKey]: { loading: 'credit' } }));
    try {
      const res = await rewardService.processReferralReward(referredSchoolId, { referralId, manualOverride: true });
      const amountCredited = Number(res?.rewardAmount || config.rewardAmount || 20.00).toFixed(2);
      setRowActions(prev => ({
        ...prev,
        [rowKey]: { loading: null, status: 'CREDITED', message: `+GH₵ ${amountCredited} Credited!` }
      }));
      setActionNotice({ type: 'success', text: `🎉 Referral reward (+GH₵ ${amountCredited}) issued & wallet credited successfully!` });
      setTimeout(() => setActionNotice(null), 4000);
      await loadData();
    } catch (err) {
      setRowActions(prev => ({
        ...prev,
        [rowKey]: { loading: null, status: 'FAILED', message: err.message || 'Crediting failed' }
      }));
      setActionNotice({ type: 'error', text: '❌ Failed to credit reward: ' + (err.message || 'Unknown error') });
    }
  };

  const handleReject = async (referralId) => {
    const reason = prompt('Enter rejection reason for audit log:', 'Administrative Rejection');
    if (!reason) return;
    const rowKey = referralId;
    setRowActions(prev => ({ ...prev, [rowKey]: { loading: 'reject' } }));
    try {
      await referralService.rejectReferral(referralId, reason, 'Super Admin');
      setRowActions(prev => ({
        ...prev,
        [rowKey]: { loading: null, status: 'REJECTED', message: 'Rejected' }
      }));
      setActionNotice({ type: 'success', text: '🚫 Referral record rejected.' });
      setTimeout(() => setActionNotice(null), 3500);
      await loadData();
    } catch (err) {
      setRowActions(prev => ({
        ...prev,
        [rowKey]: { loading: null, status: 'FAILED', message: err.message }
      }));
      setActionNotice({ type: 'error', text: '❌ ' + err.message });
    }
  };

  const referralsList = telemetry?.allReferrals?.length > 0 ? telemetry.allReferrals : (rawReferrals || []);

  const filteredReferrals = referralsList.filter((r) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'UNDER_VERIFICATION' && (r.status !== 'UNDER_VERIFICATION' && r.status !== 'PENDING')) return false;
      if (statusFilter !== 'UNDER_VERIFICATION' && r.status !== statusFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const code = String(r.referralCodeUsed || '').toLowerCase();
      const refSchool = (r.referrerSchoolName || allSchools?.find(s => String(s.id).trim() === String(r.referrerSchoolId).trim())?.name || '').toLowerCase();
      const newSchool = (r.referredSchoolName || allSchools?.find(s => String(s.id).trim() === String(r.referredSchoolId).trim())?.name || '').toLowerCase();
      return code.includes(q) || refSchool.includes(q) || newSchool.includes(q);
    }
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'REWARDED':
        return { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.3)', icon: 'fa-gift', label: 'Rewarded' };
      case 'VERIFIED':
        return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)', icon: 'fa-shield-check', label: 'Verified' };
      case 'UNDER_REVIEW':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: 'rgba(239, 68, 68, 0.3)', icon: 'fa-triangle-exclamation', label: 'Fraud Review' };
      case 'REJECTED':
        return { bg: 'rgba(168, 162, 158, 0.15)', color: '#d6d3d1', border: 'rgba(168, 162, 158, 0.3)', icon: 'fa-times-circle', label: 'Rejected' };
      default:
        return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)', icon: 'fa-clock', label: 'Under Verification' };
    }
  };

  return (
    <div className="fade-in" style={{ padding: '0.5rem 0', color: '#f5f5f4', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(217, 119, 6, 0.15)', border: '1px solid rgba(217, 119, 6, 0.3)', padding: '0.25rem 0.75rem', borderRadius: '20px', color: '#fde047', fontSize: '0.73rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            <i className="fas fa-gift"></i> Operations Center
          </div>
          <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 900, fontFamily: 'Outfit, sans-serif', color: '#f5f5f4' }}>
            Referrals &amp; Rewards Operations
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.88rem', color: '#a8a29e' }}>
            Monitor promoter performance, review anti-fraud alerts, and configure global rewards.
          </p>
        </div>

        <button
          onClick={loadData}
          style={{
            padding: '0.55rem 1.1rem',
            borderRadius: '10px',
            background: '#292524',
            border: '1px solid #44403c',
            color: '#e7e5e4',
            fontWeight: 700,
            fontSize: '0.83rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="fas fa-sync-alt" style={{ color: '#f59e0b' }} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', marginBottom: '1.25rem', background: actionNotice.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: actionNotice.type === 'success' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)', color: actionNotice.type === 'success' ? '#4ade80' : '#fca5a5', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actionNotice.text}
        </div>
      )}

      {/* ── Telemetry KPI Cards Grid ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        
        {/* Total Referrals */}
        <div style={{ background: '#292524', padding: '1.25rem', borderRadius: '16px', border: '1px solid #44403c', borderLeft: '4px solid #d97706', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize: '0.72rem', color: '#a8a29e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Referrals</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, marginTop: '0.2rem', color: '#f5f5f4' }}>
            {telemetry?.totalReferrals || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#78716c', marginTop: '0.2rem' }}>All time submissions</div>
        </div>

        {/* Pending Verification */}
        <div style={{ background: '#292524', padding: '1.25rem', borderRadius: '16px', border: '1px solid #44403c', borderLeft: '4px solid #f59e0b', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Verification</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, color: '#fbbf24', marginTop: '0.2rem' }}>
            {telemetry?.pendingCount || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#a8a29e', marginTop: '0.2rem' }}>Awaiting review</div>
        </div>

        {/* Fraud Flagged */}
        <div style={{ background: '#292524', padding: '1.25rem', borderRadius: '16px', border: '1px solid #44403c', borderLeft: '4px solid #ef4444', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize: '0.72rem', color: '#fca5a5', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fraud Review</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, color: '#fca5a5', marginTop: '0.2rem' }}>
            {telemetry?.underReviewCount || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#a8a29e', marginTop: '0.2rem' }}>Risk score &gt; threshold</div>
        </div>

        {/* Rewarded */}
        <div style={{ background: '#292524', padding: '1.25rem', borderRadius: '16px', border: '1px solid #44403c', borderLeft: '4px solid #22c55e', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize: '0.72rem', color: '#4ade80', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rewarded Referrals</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, color: '#4ade80', marginTop: '0.2rem' }}>
            {telemetry?.rewardedCount || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#a8a29e', marginTop: '0.2rem' }}>Successfully credited</div>
        </div>

        {/* Total Credits Issued */}
        <div style={{ background: '#292524', padding: '1.25rem', borderRadius: '16px', border: '1px solid #44403c', borderLeft: '4px solid #0284c7', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Credits Paid</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, color: '#38bdf8', marginTop: '0.2rem' }}>
            GH₵ {(telemetry?.totalCreditsIssued || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#a8a29e', marginTop: '0.2rem' }}>Distributed to wallets</div>
        </div>

      </div>

      {/* ── Settings & Leaderboard Section Split ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* Global Configuration Controls Form */}
        <div style={{ background: '#292524', borderRadius: '18px', border: '1px solid #44403c', padding: '1.4rem', color: '#f5f5f4', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <h3 style={{ margin: '0 0 1.1rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#f59e0b', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-sliders-h" style={{ color: '#fef08a' }}></i> Global Program Configuration
          </h3>

          <form onSubmit={handleConfigSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#d6d3d1', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Referrer Reward (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.rewardAmount}
                  onChange={(e) => setConfig({ ...config, rewardAmount: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', background: '#1c1917', border: '1px solid #3d3834', color: '#f5f5f4', fontWeight: 700, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#d6d3d1', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Welcome Bonus (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.welcomeBonusAmount}
                  onChange={(e) => setConfig({ ...config, welcomeBonusAmount: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', background: '#1c1917', border: '1px solid #3d3834', color: '#f5f5f4', fontWeight: 700, outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#d6d3d1', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Expiry Window (Days)</label>
                <input
                  type="number"
                  value={config.referralExpiryDays}
                  onChange={(e) => setConfig({ ...config, referralExpiryDays: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', background: '#1c1917', border: '1px solid #3d3834', color: '#f5f5f4', fontWeight: 700, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#d6d3d1', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Fraud Score Threshold</label>
                <input
                  type="number"
                  step="0.05"
                  value={config.fraudThreshold}
                  onChange={(e) => setConfig({ ...config, fraudThreshold: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', background: '#1c1917', border: '1px solid #3d3834', color: '#f5f5f4', fontWeight: 700, outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={config.isProgramEnabled}
                  onChange={(e) => setConfig({ ...config, isProgramEnabled: e.target.checked })}
                  style={{ accentColor: '#d97706', width: '16px', height: '16px' }}
                />
                <span>Program Active</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={config.enableWelcomeBonus}
                  onChange={(e) => setConfig({ ...config, enableWelcomeBonus: e.target.checked })}
                  style={{ accentColor: '#d97706', width: '16px', height: '16px' }}
                />
                <span>Enable Welcome Bonus</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              style={{ marginTop: '0.6rem', padding: '0.75rem', borderRadius: '12px', background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', color: 'white', border: 'none', fontWeight: 800, fontSize: '0.88rem', cursor: savingConfig ? 'not-allowed' : 'pointer', boxShadow: '0 4px 15px rgba(217, 119, 6, 0.3)', transition: 'all 0.2s ease' }}
            >
              {savingConfig ? 'Saving Settings...' : 'Save Configuration'}
            </button>
          </form>
        </div>

        {/* Top Promoter Schools Leaderboard */}
        <div style={{ background: '#292524', borderRadius: '18px', border: '1px solid #44403c', padding: '1.4rem', color: '#f5f5f4', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <h3 style={{ margin: '0 0 1.1rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#f59e0b', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-trophy" style={{ color: '#fef08a' }}></i> Top Promoter Leaderboard
          </h3>

          {telemetry?.leaderboard?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '280px', overflowY: 'auto' }}>
              {telemetry.leaderboard.map((item, idx) => (
                <div key={item.schoolId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#1c1917', borderRadius: '12px', border: '1px solid #3d3834' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: idx === 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : idx === 1 ? 'linear-gradient(135deg, #9ca3af, #6b7280)' : idx === 2 ? 'linear-gradient(135deg, #b45309, #78350f)' : '#44403c',
                      color: 'white',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem'
                    }}>
                      {idx + 1}
                    </span>
                    <div>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f5f5f4', display: 'block' }}>{item.schoolName}</span>
                      <span style={{ fontSize: '0.72rem', color: '#a8a29e' }}>Code: {item.referralCode || 'N/A'}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#4ade80', display: 'block' }}>{item.successfulCount} Schools</span>
                    <span style={{ fontSize: '0.72rem', color: '#a8a29e' }}>GH₵ {item.totalEarnings.toFixed(2)} Earned</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#a8a29e', fontSize: '0.85rem', padding: '2.5rem 1rem', textAlign: 'center', background: '#1c1917', borderRadius: '12px', border: '1px dashed #3d3834' }}>
              <i className="fas fa-award" style={{ fontSize: '1.8rem', color: '#44403c', marginBottom: '0.5rem', display: 'block' }} />
              No promoter referrals completed yet. Share referral codes to start ranking!
            </div>
          )}
        </div>

      </div>

      {/* ── Referrals Management Directory Table ─────────────────────────── */}
      <div style={{ background: '#292524', borderRadius: '18px', border: '1px solid #44403c', overflow: 'hidden', color: '#f5f5f4', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
        
        {/* Table Toolbar */}
        <div style={{ padding: '1.2rem 1.4rem', borderBottom: '1px solid #44403c', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', background: '#332e2b' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#f5f5f4' }}>
              Referral Pipeline &amp; Verification Directory
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#a8a29e' }}>
              Filter by status, inspect risk scores, and manually verify or reward referrals.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a8a29e', fontSize: '0.75rem' }} />
              <input
                type="text"
                placeholder="Search code or school name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: '0.5rem 0.95rem 0.5rem 2.1rem', borderRadius: '10px', background: '#1c1917', border: '1px solid #3d3834', color: '#f5f5f4', fontSize: '0.82rem', outline: 'none', width: '220px' }}
              />
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', background: '#1c1917', borderRadius: '10px', padding: '3px', border: '1px solid #3d3834' }}>
              {['ALL', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REWARDED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: statusFilter === st ? '#d97706' : 'transparent',
                    color: statusFilter === st ? '#ffffff' : '#a8a29e',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {st === 'ALL' ? 'All' : st === 'UNDER_REVIEW' ? 'Review' : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#262320', color: '#a8a29e', borderBottom: '1px solid #44403c' }}>
                <th style={{ padding: '0.85rem 1.1rem', fontWeight: 800 }}>Referral Code</th>
                <th style={{ padding: '0.85rem 1.1rem', fontWeight: 800 }}>Referrer School</th>
                <th style={{ padding: '0.85rem 1.1rem', fontWeight: 800 }}>New Referred School</th>
                <th style={{ padding: '0.85rem 1.1rem', fontWeight: 800 }}>Fraud Risk Meter</th>
                <th style={{ padding: '0.85rem 1.1rem', fontWeight: 800 }}>Status</th>
                <th style={{ padding: '0.85rem 1.1rem', fontWeight: 800, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReferrals.length > 0 ? (
                filteredReferrals.map((r) => {
                  const refSchool = allSchools?.find(s => String(s.id).trim() === String(r.referrerSchoolId).trim());
                  const newSchool = allSchools?.find(s => String(s.id).trim() === String(r.referredSchoolId).trim());
                  const badge = getStatusBadge(r.status);
                  const isHighRisk = r.fraudScore >= 0.4 || r.fraudFlag;

                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #3e3835', transition: 'background 0.15s' }}>
                      
                      {/* Code */}
                      <td style={{ padding: '0.85rem 1.1rem' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#f59e0b', background: '#1c1917', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #3d3834' }}>
                          {r.referralCodeUsed || 'N/A'}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.71rem', color: '#78716c', marginTop: '3px' }}>
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Referrer School */}
                      <td style={{ padding: '0.85rem 1.1rem', fontWeight: 700, color: '#f5f5f4' }}>
                        <div>{refSchool?.name || r.referrerSchoolId}</div>
                        <span style={{ fontSize: '0.71rem', color: '#a8a29e', fontWeight: 400 }}>Referrer</span>
                      </td>

                      {/* Referred School */}
                      <td style={{ padding: '0.85rem 1.1rem', fontWeight: 700, color: '#f5f5f4' }}>
                        <div>{newSchool?.name || r.referredSchoolId}</div>
                        <span style={{ fontSize: '0.71rem', color: '#a8a29e', fontWeight: 400 }}>New Sign-up</span>
                      </td>

                      {/* Risk Score */}
                      <td style={{ padding: '0.85rem 1.1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: '#1c1917', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, (r.fraudScore || 0) * 100)}%`, height: '100%', background: isHighRisk ? '#ef4444' : '#22c55e' }} />
                          </div>
                          <span style={{ color: isHighRisk ? '#fca5a5' : '#4ade80', fontWeight: 800, fontSize: '0.78rem' }}>
                            {(r.fraudScore || 0).toFixed(2)} {r.fraudFlag ? '⚠️' : ''}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.85rem 1.1rem' }}>
                        <span style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <i className={`fas ${badge.icon}`} style={{ fontSize: '0.7rem' }} />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Action Controls */}
                      <td style={{ padding: '0.85rem 1.1rem', textAlign: 'right' }}>
                        {(() => {
                          const rowState = rowActions[r.id] || rowActions[r.referredSchoolId] || {};
                          const isRewarded = r.status === 'REWARDED' || rowState.status === 'CREDITED';
                          const rewardAmt = Number(r.rewardAmount || config.rewardAmount || 20.00).toFixed(2);

                          if (isRewarded) {
                            return (
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <span style={{
                                  padding: '0.35rem 0.85rem',
                                  borderRadius: '8px',
                                  background: 'rgba(34, 197, 94, 0.18)',
                                  border: '1px solid rgba(34, 197, 94, 0.45)',
                                  color: '#4ade80',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}>
                                  <i className="fas fa-check-circle" style={{ color: '#4ade80' }} />
                                  <span>Credited (+GH₵ {rewardAmt})</span>
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              {/* Verify & Credit Button */}
                              {r.status !== 'VERIFIED' && r.status !== 'REJECTED' && (
                                rowState.loading === 'verify' ? (
                                  <button disabled style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: '#0c4a6e', color: '#7dd3fc', border: '1px solid #0284c7', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'not-allowed' }}>
                                    <i className="fas fa-spinner fa-spin" /> Verifying...
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleVerify(r.id, r.referredSchoolId)}
                                    title="Verify Referral & Approve"
                                    disabled={Boolean(rowState.loading)}
                                    style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: 'linear-gradient(135deg, #0284c7, #0369a1)', color: 'white', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <i className="fas fa-check" /> Verify &amp; Credit
                                  </button>
                                )
                              )}

                              {/* Credit +GH₵20 Button */}
                              {r.status !== 'REJECTED' && (
                                rowState.loading === 'credit' ? (
                                  <button disabled style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: '#14532d', color: '#86efac', border: '1px solid #22c55e', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'not-allowed' }}>
                                    <i className="fas fa-spinner fa-spin" /> Crediting...
                                  </button>
                                ) : rowState.status === 'FAILED' ? (
                                  <button
                                    onClick={() => handleManualReward(r.id, r.referredSchoolId)}
                                    title={`Error: ${rowState.message || 'Click to retry'}`}
                                    style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: 'white', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <i className="fas fa-exclamation-triangle" /> Retry (+GH₵ {rewardAmt})
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleManualReward(r.id, r.referredSchoolId)}
                                    title={`Credit +GH₵ ${rewardAmt} Wallet Reward`}
                                    disabled={Boolean(rowState.loading)}
                                    style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: 'linear-gradient(135deg, #166534, #15803d)', color: 'white', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 6px rgba(22, 101, 52, 0.4)' }}
                                  >
                                    <i className="fas fa-gift" /> Credit +GH₵ {rewardAmt}
                                  </button>
                                )
                              )}

                              {/* Reject Button */}
                              {r.status !== 'REJECTED' && (
                                rowState.loading === 'reject' ? (
                                  <button disabled style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: '#451a1a', color: '#fca5a5', border: '1px solid #ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'not-allowed' }}>
                                    <i className="fas fa-spinner fa-spin" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReject(r.id)}
                                    title="Reject Referral"
                                    disabled={Boolean(rowState.loading)}
                                    style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    Reject
                                  </button>
                                )
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: '#a8a29e' }}>
                    <i className="fas fa-inbox" style={{ fontSize: '2rem', color: '#44403c', marginBottom: '0.5rem', display: 'block' }} />
                    No referral records match the selected filter or search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReferralManagementDashboard;
