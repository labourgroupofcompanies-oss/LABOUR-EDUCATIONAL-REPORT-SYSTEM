import React, { useState, useEffect } from 'react';
import referralAnalyticsService from '../../services/referralAnalyticsService';
import referralService from '../../services/referralService';
import rewardService from '../../services/rewardService';
import configurationService from '../../services/configurationService';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
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
  const [cloudSchools, setCloudSchools] = useState([]);

  // Deduction Modal State
  const [deductModal, setDeductModal] = useState({
    isOpen: false,
    referral: null,
    schoolId: '',
    schoolName: '',
    amount: 20.00,
    reason: 'Referral reward clawback / administrative deduction',
    loading: false,
    error: ''
  });

  const rawReferrals = useLiveQuery(() => db.referrals.toArray(), []);
  const allSchools = useLiveQuery(() => db.schools.toArray(), []);

  const loadData = async () => {
    try {
      const analytics = await referralAnalyticsService.getSuperAdminAnalytics();
      setTelemetry(analytics);

      const currentConfig = await configurationService.getReferralConfig();
      setConfig(currentConfig);

      if (navigator.onLine) {
        const { data: sList } = await supabase
          .from('report_schools')
          .select('id, name, wallet_balance, total_referral_earnings')
          .order('name');
        if (sList && sList.length > 0) setCloudSchools(sList);
      }
    } catch (err) {
      console.warn('[ReferralDashboard] Data load notice:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [rawReferrals]);

  // Combined school list for dropdown selector
  const availableSchools = (allSchools && allSchools.length > 0) ? allSchools : cloudSchools;

  // Deduction Handlers
  const handleOpenRowDeduct = (referral) => {
    const refSchool = availableSchools?.find(s => String(s.id).trim() === String(referral.referrerSchoolId).trim());
    setDeductModal({
      isOpen: true,
      referral,
      schoolId: referral.referrerSchoolId,
      schoolName: refSchool?.name || referral.referrerSchoolName || `School #${referral.referrerSchoolId}`,
      amount: Number(referral.rewardAmount || config.rewardAmount || 20.00),
      reason: 'Referral reward clawback / administrative deduction',
      loading: false,
      error: ''
    });
  };

  const handleOpenDirectDeduct = () => {
    const firstSchool = availableSchools?.[0];
    setDeductModal({
      isOpen: true,
      referral: null,
      schoolId: firstSchool ? String(firstSchool.id) : '',
      schoolName: firstSchool?.name || '',
      amount: Number(config.rewardAmount || 20.00),
      reason: 'Referral reward clawback / administrative deduction',
      loading: false,
      error: ''
    });
  };

  const handleExecuteDeduction = async (e) => {
    e.preventDefault();
    if (!deductModal.schoolId) {
      setDeductModal(prev => ({ ...prev, error: 'Please select a school to deduct from.' }));
      return;
    }
    const amt = Number(deductModal.amount);
    if (!amt || amt <= 0) {
      setDeductModal(prev => ({ ...prev, error: 'Please enter a valid deduction amount greater than 0.' }));
      return;
    }

    setDeductModal(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const res = await rewardService.deductReferralReward({
        referralId: deductModal.referral?.id || null,
        schoolId: deductModal.schoolId,
        amount: amt,
        reason: deductModal.reason,
        deductedBy: 'Super Admin'
      });

      const schoolLabel = deductModal.schoolName || `School #${deductModal.schoolId}`;
      setActionNotice({
        type: 'success',
        text: `✅ Successfully deducted GH₵ ${amt.toFixed(2)} from ${schoolLabel}. New wallet balance: GH₵ ${Number(res?.newWalletBalance || 0).toFixed(2)}.`
      });
      setTimeout(() => setActionNotice(null), 5000);

      if (deductModal.referral?.id) {
        setRowActions(prev => ({
          ...prev,
          [deductModal.referral.id]: {
            loading: null,
            status: 'REVOKED',
            message: `Deducted (-GH₵ ${amt.toFixed(2)})`
          }
        }));
      }

      setDeductModal({
        isOpen: false,
        referral: null,
        schoolId: '',
        schoolName: '',
        amount: 20.00,
        reason: '',
        loading: false,
        error: ''
      });

      await loadData();
    } catch (err) {
      setDeductModal(prev => ({ ...prev, loading: false, error: err.message || 'Deduction failed.' }));
    }
  };

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
      if (statusFilter === 'REVOKED' && (r.status !== 'REVOKED' && r.status !== 'DEDUCTED')) return false;
      if (statusFilter !== 'UNDER_VERIFICATION' && statusFilter !== 'REVOKED' && r.status !== statusFilter) return false;
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
      case 'REVOKED':
      case 'DEDUCTED':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)', icon: 'fa-rotate-left', label: 'Deducted' };
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

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenDirectDeduct}
            style={{
              padding: '0.55rem 1.15rem',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.83rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
              transition: 'all 0.2s ease'
            }}
          >
            <i className="fas fa-minus-circle" />
            <span>Deduct School Reward</span>
          </button>

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
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', marginBottom: '1.25rem', background: actionNotice.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: actionNotice.type === 'success' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)', color: actionNotice.type === 'success' ? '#4ade80' : '#fca5a5', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actionNotice.text}
        </div>
      )}

      {/* ── Telemetry KPI Cards Grid ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        
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

        {/* Revoked / Deducted */}
        <div style={{ background: '#292524', padding: '1.25rem', borderRadius: '16px', border: '1px solid #44403c', borderLeft: '4px solid #f43f5e', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize: '0.72rem', color: '#fda4af', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rewards Deducted</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, color: '#f43f5e', marginTop: '0.2rem' }}>
            {telemetry?.revokedCount || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#a8a29e', marginTop: '0.2rem' }}>Clawed back from wallets</div>
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
              {['ALL', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REWARDED', 'REVOKED', 'REJECTED'].map((st) => (
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
                  {st === 'ALL' ? 'All' : st === 'UNDER_REVIEW' ? 'Review' : st === 'REVOKED' ? 'Deducted' : st.charAt(0) + st.slice(1).toLowerCase()}
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
                          const isRevoked = r.status === 'REVOKED' || r.status === 'DEDUCTED' || rowState.status === 'REVOKED';
                          const rewardAmt = Number(r.rewardAmount || config.rewardAmount || 20.00).toFixed(2);

                          if (isRevoked) {
                            return (
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <span style={{
                                  padding: '0.35rem 0.85rem',
                                  borderRadius: '8px',
                                  background: 'rgba(239, 68, 68, 0.18)',
                                  border: '1px solid rgba(239, 68, 68, 0.45)',
                                  color: '#f87171',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }} title={r.rejectionReason || 'Reward was deducted'}>
                                  <i className="fas fa-rotate-left" style={{ color: '#f87171' }} />
                                  <span>Deducted (-GH₵ {rewardAmt})</span>
                                </span>
                              </div>
                            );
                          }

                          if (isRewarded) {
                            return (
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
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

                                <button
                                  onClick={() => handleOpenRowDeduct(r)}
                                  title="Deduct / Clawback referral reward from school wallet"
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '8px',
                                    background: 'rgba(239, 68, 68, 0.14)',
                                    border: '1px solid rgba(239, 68, 68, 0.35)',
                                    color: '#fca5a5',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.28)'}
                                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.14)'}
                                >
                                  <i className="fas fa-minus-circle" /> Deduct
                                </button>
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

      {/* ── Referral Reward Deduction Modal ───────────────────────────────── */}
      {deductModal.isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1c1917',
            border: '1px solid #44403c',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #292524',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#262320'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444'
                }}>
                  <i className="fas fa-rotate-left" style={{ fontSize: '1rem' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f5f5f4', fontFamily: 'Outfit, sans-serif' }}>
                    Deduct Referral Reward
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#a8a29e' }}>
                    Claw back referral reward directly from school wallet
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeductModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', color: '#a8a29e', fontSize: '1.4rem', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleExecuteDeduction} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              
              {/* Error Message */}
              {deductModal.error && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: '0.82rem', fontWeight: 600 }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }} />
                  {deductModal.error}
                </div>
              )}

              {/* Target School Info */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#d6d3d1', fontWeight: 700, marginBottom: '0.4rem' }}>
                  Target School
                </label>
                {deductModal.referral ? (
                  <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', background: '#292524', border: '1px solid #3d3834' }}>
                    <div style={{ fontWeight: 800, color: '#f5f5f4', fontSize: '0.92rem' }}>
                      {deductModal.schoolName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#a8a29e', marginTop: '3px' }}>
                      Referral Code: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{deductModal.referral.referralCodeUsed || 'N/A'}</span> • School ID: <span style={{ color: '#cbd5e1' }}>{deductModal.schoolId}</span>
                    </div>
                  </div>
                ) : (
                  <select
                    value={deductModal.schoolId}
                    onChange={(e) => {
                      const selId = e.target.value;
                      const selSchool = availableSchools.find(s => String(s.id).trim() === String(selId).trim());
                      setDeductModal(prev => ({
                        ...prev,
                        schoolId: selId,
                        schoolName: selSchool?.name || ''
                      }));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      background: '#292524',
                      border: '1px solid #3d3834',
                      color: '#f5f5f4',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                  >
                    <option value="">-- Select School to Deduct Reward From --</option>
                    {availableSchools.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Wallet: GH₵ {Number(s.wallet_balance || s.walletBalance || 0).toFixed(2)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Deduction Amount */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#d6d3d1', fontWeight: 700, marginBottom: '0.4rem' }}>
                  Deduction Amount (GH₵)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#ef4444', fontWeight: 800, fontSize: '0.88rem' }}>
                    -GH₵
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={deductModal.amount}
                    onChange={(e) => setDeductModal(prev => ({ ...prev, amount: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem 0.65rem 3.8rem',
                      borderRadius: '10px',
                      background: '#292524',
                      border: '1px solid #3d3834',
                      color: '#ef4444',
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Reason Input & Quick Presets */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#d6d3d1', fontWeight: 700, marginBottom: '0.4rem' }}>
                  Reason for Deduction
                </label>
                <input
                  type="text"
                  placeholder="e.g. Duplicate account, self-referral, disqualified school"
                  value={deductModal.reason}
                  onChange={(e) => setDeductModal(prev => ({ ...prev, reason: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    background: '#292524',
                    border: '1px solid #3d3834',
                    color: '#f5f5f4',
                    fontSize: '0.82rem',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {[
                    'Self-referral / abuse detected',
                    'Referred school disqualified',
                    'Duplicate school registration',
                    'Administrative correction'
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDeductModal(prev => ({ ...prev, reason: preset }))}
                      style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        background: '#262320',
                        border: '1px solid #3d3834',
                        color: '#a8a29e',
                        fontSize: '0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning Notice */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px dashed rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                fontSize: '0.76rem',
                color: '#fca5a5',
                lineHeight: 1.45
              }}>
                <i className="fas fa-shield-halved" style={{ marginRight: '6px', color: '#ef4444' }} />
                This action will permanently record a <strong>DEBIT</strong> transaction in the school's immutable wallet ledger, decrement total referral earnings, update referral status to <strong>REVOKED</strong>, and send a notification to the school.
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setDeductModal(prev => ({ ...prev, isOpen: false }))}
                  style={{
                    padding: '0.65rem 1.15rem',
                    borderRadius: '10px',
                    background: '#292524',
                    border: '1px solid #3d3834',
                    color: '#a8a29e',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deductModal.loading}
                  style={{
                    padding: '0.65rem 1.35rem',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: deductModal.loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 15px rgba(220, 38, 38, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {deductModal.loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin" />
                      <span>Deducting...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check" />
                      <span>Confirm &amp; Deduct Reward</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralManagementDashboard;
