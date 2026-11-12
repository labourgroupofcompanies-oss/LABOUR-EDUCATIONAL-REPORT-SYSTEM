import React, { useState, useEffect } from 'react';
import TopUpWalletModal from './TopUpWalletModal';
import subscriptionService, { getEffectiveResetTimestamp } from '../../services/subscriptionService';
import referralAnalyticsService from '../../services/referralAnalyticsService';
import ReferralRewardsWidget from './ReferralRewardsWidget';
import LogoPreloader from '../common/LogoPreloader';

const SchoolWalletWidget = ({ statusInfo, schoolId, onRefresh }) => {
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalMsg, setApprovalMsg] = useState(null);
  const [topUpHistory, setTopUpHistory] = useState([]);
  const [referralStats, setReferralStats] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'referrals' | 'details'

  const fetchHistory = async () => {
    if (!schoolId) return;
    setLoadingHistory(true);
    try {
      const [history, refStats] = await Promise.all([
        subscriptionService.getSchoolTopUpHistory(schoolId),
        referralAnalyticsService.getSchoolReferralStats(schoolId).catch(() => null)
      ]);
      setTopUpHistory(history || []);
      setReferralStats(refStats || null);
    } catch (err) {
      console.error('[SchoolWalletWidget] History load error:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [schoolId, statusInfo?.wallet_balance]);

  const activeInfo = statusInfo || {
    wallet_balance: 0,
    wallet_reserved: 0,
    wallet_available: 0,
    required_amount: 0,
    amount_due: 0,
    learner_count: 0,
    active_learner_count: 0,
    rate_per_learner: 5,
    academic_year: '2025/2026',
    term: 'Term 1',
    is_exempt: false,
    subscription_exempt_until: null,
    report_cards_locked: false,
    billing_status: 'AWAITING_APPROVAL',
  };

  const {
    wallet_balance = 0,
    wallet_reserved = 0,
    amount_due = 0,
    learner_count = 0,
    active_learner_count = 0,
    rate_per_learner = 5,
    academic_year = '2025/2026',
    term = 'Term 1',
    is_exempt = false,
    billing_status = 'AWAITING_APPROVAL',
    approval_status = 'PENDING',
    bill_id = null,
  } = activeInfo;

  const effectiveLearners = active_learner_count || learner_count;
  const isFirstTermFreeActive = activeInfo.is_first_term_free || billing_status === 'FIRST_TERM_FREE';

  // Authoritative live balance from history
  const resetAt = getEffectiveResetTimestamp(schoolId);
  const historyCredits = topUpHistory.filter(t => !t.isDebit).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const historyDebits = topUpHistory.filter(t => t.isDebit).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const historyBalance = Math.max(0, historyCredits - historyDebits);

  const rawBalance = resetAt ? 0 : Number(wallet_balance ?? 0);
  const effectiveWalletBalance = topUpHistory.length > 0 ? historyBalance : rawBalance;
  const effectiveWalletAvailable = Math.max(0, effectiveWalletBalance - Number(wallet_reserved || 0));

  const referralEarningsFromHistory = topUpHistory
    .filter(t => !t.isDebit && (t.description?.toLowerCase().includes('referral') || t.reference?.startsWith('REF-')))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const effectiveReferralEarnings = topUpHistory.length > 0 
    ? referralEarningsFromHistory 
    : (resetAt ? 0 : Number(referralStats?.totalEarnings || 0));

  const isReferralFreeTermActive = activeInfo.is_referral_free_term || billing_status === 'REFERRAL_FREE_TERM';

  const isPaidOrSubscribed = 
    billing_status === 'PAID' || 
    billing_status === 'ACTIVE' || 
    billing_status === 'SETTLED' || 
    Boolean(isFirstTermFreeActive) || 
    Boolean(isReferralFreeTermActive) || 
    Boolean(is_exempt) || 
    Boolean(activeInfo.is_unlocked);

  const termFee = (isFirstTermFreeActive || isReferralFreeTermActive) ? 0 : (amount_due || (effectiveLearners * rate_per_learner));
  const shortFall = Math.max(0, termFee - effectiveWalletBalance);
  const isShortage = !isPaidOrSubscribed && effectiveWalletBalance < termFee;

  const referralCredits = activeInfo.referral_credits || {
    totalReferrals: referralStats?.totalInvited || 0,
    consumedReferrals: referralStats?.consumedForFreeTermsCount || 0,
    availableReferrals: referralStats?.availableForFreeTerms || 0,
    freeTermsAvailable: referralStats?.freeTermsEarned || 0,
    canClaimFreeTerm: Boolean(referralStats?.canClaimFreeTerm),
    remainingAfterClaim: referralStats?.remainingAfterNextTerm || 0
  };

  const [claimingReferralTerm, setClaimingReferralTerm] = useState(false);
  const [referralClaimMsg, setReferralClaimMsg] = useState(null);

  const handleClaimReferralFreeTerm = async () => {
    setClaimingReferralTerm(true);
    setReferralClaimMsg(null);
    try {
      const res = await subscriptionService.claimReferralFreeTerm(schoolId, academic_year, term, 'School Admin');
      if (res?.success) {
        setReferralClaimMsg({ 
          type: 'success', 
          text: `🎉 100% Free Term Activated! 2 referred schools deducted. ${res.remaining_referrals} referral(s) remain in your bank for future terms.` 
        });
        if (onRefresh) onRefresh();
        await fetchHistory();
      } else {
        setReferralClaimMsg({ type: 'error', text: res?.message || 'Failed to claim referral free term.' });
      }
    } catch (err) {
      setReferralClaimMsg({ type: 'error', text: err.message || 'Error claiming referral free term.' });
    } finally {
      setClaimingReferralTerm(false);
    }
  };

  const handleApprovePayment = async () => {
    setApproving(true);
    setApprovalMsg(null);

    try {
      const res = await subscriptionService.approveAndPayTermBill(bill_id, 'Headteacher', {
        schoolId,
        termFee,
        academicYear: academic_year,
        term
      });
      if (res?.success && res?.status === 'PAID') {
        setApprovalMsg({ type: 'success', text: '✓ Payment approved and deducted successfully!' });
      } else if (res?.status === 'INSUFFICIENT_FUNDS') {
        setApprovalMsg({ type: 'warning', text: `Please top up remaining GH₵ ${res.top_up_required} to complete settlement.` });
        setShowTopUpModal(true);
      } else {
        setApprovalMsg({ type: 'info', text: res?.message || 'Payment approval recorded.' });
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      setApprovalMsg({ type: 'error', text: 'Approval failed: ' + err.message });
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="school-wallet-root" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`
        .school-wallet-hero {
          background: linear-gradient(135deg, #09090b 0%, #18181b 50%, #0f172a 100%);
          border-radius: 20px;
          padding: 1.75rem;
          color: #FFFFFF;
          position: relative;
          overflow: hidden;
          box-shadow: 0 12px 32px -4px rgba(9, 9, 11, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08);
        }
        .school-wallet-header-flex {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 1rem;
          position: relative;
          z-index: 1;
        }
        .school-wallet-balance-text {
          font-family: 'Outfit', sans-serif;
          font-size: 2.4rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          margin-top: 0.35rem;
          color: #FFFFFF;
        }
        .school-wallet-right-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.75rem;
        }
        .school-wallet-btn-group {
          display: flex;
          gap: 8px;
          margin-top: 0.25rem;
        }
        .school-wallet-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.85rem;
        }
        .school-wallet-tab-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #E4E4E7;
          padding-bottom: 0.75rem;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .school-wallet-tab-buttons {
          display: flex;
          gap: 6px;
        }

        @media (max-width: 640px) {
          .school-wallet-hero {
            padding: 1.25rem 1rem !important;
            border-radius: 16px !important;
          }
          .school-wallet-header-flex {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1rem !important;
          }
          .school-wallet-balance-text {
            font-size: 1.85rem !important;
          }
          .school-wallet-right-actions {
            align-items: stretch !important;
            width: 100% !important;
          }
          .school-wallet-right-actions > span {
            justify-content: center !important;
            text-align: center !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .school-wallet-btn-group {
            flex-direction: column !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .school-wallet-btn-group button {
            width: 100% !important;
            justify-content: center !important;
            padding: 0.75rem 1rem !important;
          }
          .school-wallet-kpi-grid {
            grid-template-columns: 1fr !important;
            gap: 0.65rem !important;
          }
          .school-wallet-tab-nav {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.6rem !important;
          }
          .school-wallet-tab-buttons {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding-bottom: 4px !important;
            width: 100% !important;
            scrollbar-width: none !important;
          }
          .school-wallet-tab-buttons::-webkit-scrollbar {
            display: none !important;
          }
          .school-wallet-tab-buttons button {
            white-space: nowrap !important;
            flex-shrink: 0 !important;
            padding: 0.45rem 0.75rem !important;
            font-size: 0.78rem !important;
          }
          .school-wallet-refresh-btn {
            width: 100% !important;
            justify-content: center !important;
            padding: 0.55rem !important;
          }
          .school-wallet-tx-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.5rem !important;
            padding: 0.75rem 0.85rem !important;
          }
          .school-wallet-tx-right {
            text-align: left !important;
            width: 100% !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            border-top: 1px dashed #E4E4E7 !important;
            padding-top: 0.4rem !important;
          }
        }
      `}</style>
      
      {/* ── 1. LUXURY OBSIDIAN HERO CARD ──────────────────────────────────── */}
      <div className="school-wallet-hero">
        {/* Subtle decorative glow */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, rgba(16, 185, 129, 0.05) 70%, transparent 100%)',
          pointerEvents: 'none'
        }} />

        <div className="school-wallet-header-flex">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <i className="fas fa-wallet" style={{ color: '#38BDF8' }} /> Total School Wallet Balance
            </div>

            <div className="school-wallet-balance-text">
              GH₵ {Number(effectiveWalletBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>

            {/* Chips Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.85rem' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '8px', padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#A1A1AA' }}>Usable:</span>
                <strong style={{ color: '#34D399' }}>GH₵ {Number(effectiveWalletAvailable).toFixed(2)}</strong>
              </div>

              {effectiveReferralEarnings > 0 && (
                <div style={{ background: 'rgba(37, 99, 235, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#93C5FD' }}>Referrals:</span>
                  <strong style={{ color: '#60A5FA' }}>+GH₵ {Number(effectiveReferralEarnings).toFixed(2)}</strong>
                </div>
              )}

              <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#A1A1AA' }}>Term:</span>
                <strong style={{ color: '#FFFFFF' }}>{academic_year} • {term}</strong>
              </div>
            </div>
          </div>

          {/* Right Header Status & Top Up Button */}
          <div className="school-wallet-right-actions">
            {/* Status Pill */}
            {isReferralFreeTermActive ? (
              <span style={{ padding: '0.35rem 0.85rem', borderRadius: '999px', background: 'rgba(16, 185, 129, 0.25)', color: '#34D399', fontSize: '0.78rem', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.5)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🎉 Free Term via Referrals
              </span>
            ) : isFirstTermFreeActive ? (
              <span style={{ padding: '0.35rem 0.85rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.2)', color: '#93C5FD', fontSize: '0.78rem', fontWeight: 800, border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🎁 Free Onboarding Term
              </span>
            ) : isPaidOrSubscribed ? (
              <span style={{ padding: '0.35rem 0.85rem', borderRadius: '999px', background: 'rgba(16, 185, 129, 0.2)', color: '#6EE7B7', fontSize: '0.78rem', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ✓ Subscribed &amp; Unlocked
              </span>
            ) : isShortage ? (
              <span style={{ padding: '0.35rem 0.85rem', borderRadius: '999px', background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5', fontSize: '0.78rem', fontWeight: 800, border: '1px solid rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚠️ Top-Up Required (Short: GH₵ {shortFall.toLocaleString()})
              </span>
            ) : (
              <span style={{ padding: '0.35rem 0.85rem', borderRadius: '999px', background: 'rgba(245, 158, 11, 0.2)', color: '#FCD34D', fontSize: '0.78rem', fontWeight: 800, border: '1px solid rgba(245, 158, 11, 0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⏳ Awaiting Payment Approval
              </span>
            )}

            {/* Quick Actions */}
            <div className="school-wallet-btn-group">
              {referralCredits.canClaimFreeTerm && !isPaidOrSubscribed && !isFirstTermFreeActive && (
                <button
                  type="button"
                  onClick={handleClaimReferralFreeTerm}
                  disabled={claimingReferralTerm}
                  style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#FFFFFF',
                    border: '1px solid #34D399',
                    borderRadius: '10px',
                    padding: '0.6rem 1.15rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: claimingReferralTerm ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.45)'
                  }}
                >
                  {claimingReferralTerm ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-gift" />}
                  Claim Free Term (2 Referrals)
                </button>
              )}

              {!isPaidOrSubscribed && !isFirstTermFreeActive && (
                <button
                  type="button"
                  onClick={handleApprovePayment}
                  disabled={approving}
                  style={{
                    background: '#10B981',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.6rem 1.15rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: approving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  {approving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check-circle" />}
                  Approve (GH₵ {Number(termFee).toLocaleString()})
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowTopUpModal(true)}
                style={{
                  background: '#FFFFFF',
                  color: '#09090b',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                  transition: 'transform 0.15s ease'
                }}
              >
                <i className="fas fa-plus-circle" style={{ color: '#2563eb' }} /> Top Up Wallet
              </button>
            </div>
          </div>
        </div>

        {(approvalMsg || referralClaimMsg) && (
          <div style={{
            marginTop: '1rem',
            padding: '0.6rem 0.9rem',
            borderRadius: '8px',
            fontSize: '0.82rem',
            background: (referralClaimMsg || approvalMsg)?.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${(referralClaimMsg || approvalMsg)?.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: (referralClaimMsg || approvalMsg)?.type === 'success' ? '#6EE7B7' : '#FCA5A5',
          }}>
            {referralClaimMsg?.text || approvalMsg?.text}
          </div>
        )}
      </div>

      {/* ── REFERRAL REWARD FREE TERM NOTIFICATION & CARRIER CARD ── */}
      {isReferralFreeTermActive ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)',
          border: '1.5px solid #10B981',
          borderRadius: '16px',
          padding: '1.15rem 1.4rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 4px 16px -4px rgba(16, 185, 129, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#10B981', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
              <i className="fas fa-gift" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#065F46' }}>
                  🎉 100% Free Term Granted via Referral Reward!
                </span>
                <span style={{ background: '#D1FAE5', color: '#047857', padding: '0.15rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800 }}>
                  2 Referrals Deducted
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#047857', lineHeight: 1.4 }}>
                Your school referred 2 institutions and unlocked 100% free terminal access.
                {referralCredits.availableReferrals > 0 ? (
                  <> You have <strong style={{ textDecoration: 'underline' }}>{referralCredits.availableReferrals} referred school(s)</strong> remaining in your bank to be used for future terms!</>
                ) : (
                  <> Refer 2 more schools to use another term 100% free!</>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('referrals')}
            style={{
              background: '#065F46',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            View Referral Bank
          </button>
        </div>
      ) : (!isPaidOrSubscribed && !isFirstTermFreeActive && referralCredits.canClaimFreeTerm) ? (
        <div style={{
          background: 'linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%)',
          border: '1.5px solid #F59E0B',
          borderRadius: '16px',
          padding: '1.15rem 1.4rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 4px 16px -4px rgba(245, 158, 11, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#F59E0B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
              <i className="fas fa-award" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#92400E' }}>
                  🎁 You Have Earned a 100% FREE Term via Referrals!
                </span>
                <span style={{ background: '#FDE68A', color: '#78350F', padding: '0.15rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800 }}>
                  {referralCredits.availableReferrals} Available Referrals
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#78350F', lineHeight: 1.4 }}>
                In this term you are supposed to pay, 2 referred schools will be deducted to give you complete free access (GH₵ 0.00 fee).
                The remaining <strong>{referralCredits.remainingAfterClaim} school(s)</strong> will stay safely in your bank for future terms!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClaimReferralFreeTerm}
            disabled={claimingReferralTerm}
            style={{
              background: '#D97706',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              padding: '0.65rem 1.25rem',
              fontSize: '0.85rem',
              fontWeight: 800,
              cursor: claimingReferralTerm ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)'
            }}
          >
            {claimingReferralTerm ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
            Apply 2 Referrals for Free Term
          </button>
        </div>
      ) : (!isPaidOrSubscribed && !isFirstTermFreeActive && referralCredits.availableReferrals === 1) ? (
        <div style={{
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '0.9rem 1.2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-users" style={{ color: '#2563eb', fontSize: '1.1rem' }} />
            <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
              🤝 <strong>1 of 2 Referrals Needed:</strong> Refer just 1 more school this term to enjoy your entire term 100% FREE!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('referrals')}
            style={{
              background: '#2563eb',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '0.4rem 0.85rem',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Invite a School
          </button>
        </div>
      ) : null}

      {/* ── 2. METRIC SUMMARY BAR ─────────────────────────────────────────── */}
      <div className="school-wallet-kpi-grid">
        {/* Card: Active Learners */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '1rem 1.15rem', boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase' }}>Active Learners</span>
            <i className="fas fa-user-graduate" style={{ color: '#2563eb', fontSize: '0.9rem' }} />
          </div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#09090b', marginTop: '2px' }}>
            {effectiveLearners} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#71717a' }}>Students</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 700, marginTop: '2px' }}>
            GH₵ {Number(rate_per_learner).toFixed(2)} / student / term
          </div>
        </div>

        {/* Card: Term Billing Fee */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '1rem 1.15rem', boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase' }}>Term Fee</span>
            <i className="fas fa-file-invoice-dollar" style={{ color: '#10B981', fontSize: '0.9rem' }} />
          </div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#09090b', marginTop: '2px' }}>
            {isFirstTermFreeActive ? 'GH₵ 0.00' : `GH₵ ${Number(termFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
          <div style={{ fontSize: '0.72rem', color: isFirstTermFreeActive ? '#10B981' : '#71717a', fontWeight: 600, marginTop: '2px' }}>
            {isFirstTermFreeActive ? '🎁 Complimentary Trial Waived' : `${effectiveLearners} × GH₵ ${Number(rate_per_learner).toFixed(2)}`}
          </div>
        </div>

        {/* Card: Referral Earnings */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '1rem 1.15rem', boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase' }}>Referral Rewards</span>
            <i className="fas fa-gift" style={{ color: '#8B5CF6', fontSize: '0.9rem' }} />
          </div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#8B5CF6', marginTop: '2px' }}>
            GH₵ {Number(effectiveReferralEarnings).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: 600, marginTop: '2px' }}>
            {referralStats?.rewardedCount || 0} verified institutions rewarded
          </div>
        </div>

        {/* Card: Free Term Referral Bank */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '1rem 1.15rem', boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase' }}>Free Term Bank</span>
            <i className="fas fa-graduation-cap" style={{ color: '#059669', fontSize: '0.9rem' }} />
          </div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
            {referralCredits.availableReferrals} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#71717a' }}>Schools Banked</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: referralCredits.canClaimFreeTerm ? '#059669' : '#71717a', fontWeight: 600, marginTop: '2px' }}>
            {referralCredits.canClaimFreeTerm 
              ? `🎉 Free Term Ready! (${referralCredits.remainingAfterClaim} carryover)` 
              : `${referralCredits.consumedReferrals} used • 2 needed per free term`}
          </div>
        </div>
      </div>

      {/* ── 3. SLEEK SEGMENTED TABS ────────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '18px', padding: '1.25rem', boxShadow: '0 4px 14px -2px rgba(0, 0, 0, 0.04)' }}>
        
        {/* Navigation Bar */}
        <div className="school-wallet-tab-nav">
          <div className="school-wallet-tab-buttons">
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              style={{
                background: activeTab === 'transactions' ? '#09090b' : 'transparent',
                color: activeTab === 'transactions' ? '#FFFFFF' : '#71717a',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-receipt" /> Transactions ({topUpHistory.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('referrals')}
              style={{
                background: activeTab === 'referrals' ? '#09090b' : 'transparent',
                color: activeTab === 'referrals' ? '#FFFFFF' : '#71717a',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-gift" /> Referral Program
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('details')}
              style={{
                background: activeTab === 'details' ? '#09090b' : 'transparent',
                color: activeTab === 'details' ? '#FFFFFF' : '#71717a',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-info-circle" /> Plan Details
            </button>
          </div>

          <button
            type="button"
            className="school-wallet-refresh-btn"
            onClick={fetchHistory}
            style={{
              background: '#FAFAFA',
              border: '1px solid #E4E4E7',
              borderRadius: '8px',
              padding: '0.4rem 0.8rem',
              color: '#2563eb',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <i className={`fas fa-sync-alt ${loadingHistory ? 'fa-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* ── TAB 1: TRANSACTIONS ────────────────────────────────────────── */}
        {activeTab === 'transactions' && (
          <div style={{ marginTop: '1rem' }}>
            {loadingHistory ? (
              <div style={{ padding: '2rem 0' }}>
                <LogoPreloader fullScreen={false} size="sm" />
              </div>
            ) : topUpHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '360px', overflowY: 'auto' }}>
                {topUpHistory.map((item) => {
                  const isDebit = item.isDebit;
                  const isReferralDeduction = isDebit && (
                    item.description?.toLowerCase().includes('referral') ||
                    item.reference?.startsWith('DED-REF-')
                  );
                  const isReferral = !isDebit && (
                    item.description?.toLowerCase().includes('referral') || 
                    item.reference?.startsWith('REF-') || 
                    item.description?.toLowerCase().includes('welcome')
                  );

                  return (
                    <div key={item.id || item.reference} className="school-wallet-tx-item" style={{
                      background: '#FAFAFA',
                      border: '1px solid #E4E4E7',
                      borderRadius: '12px',
                      padding: '0.85rem 1.15rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: isReferralDeduction ? '#FEF2F2' : (isDebit ? '#FEF2F2' : (isReferral ? '#EFF6FF' : '#ECFDF5')),
                          color: isReferralDeduction ? '#DC2626' : (isDebit ? '#EF4444' : (isReferral ? '#2563EB' : '#10B981')),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem'
                        }}>
                          <i className={`fas ${isReferralDeduction ? 'fa-rotate-left' : (isDebit ? 'fa-arrow-up' : (isReferral ? 'fa-gift' : 'fa-arrow-down'))}`} />
                        </div>
                        <div>
                          <strong style={{ color: isDebit ? '#EF4444' : (isReferral ? '#2563EB' : '#18181b'), fontSize: '0.95rem', display: 'block' }}>
                            {isDebit ? '- ' : '+ '}GH₵ {Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                            {item.description || item.method} • {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="school-wallet-tx-right" style={{ textAlign: 'right' }}>
                        <span style={{
                          padding: '0.25rem 0.65rem',
                          borderRadius: '6px',
                          background: isReferralDeduction ? '#FEF2F2' : (isDebit ? '#FEF2F2' : (isReferral ? '#EFF6FF' : '#ECFDF5')),
                          color: isReferralDeduction ? '#DC2626' : (isDebit ? '#EF4444' : (isReferral ? '#2563EB' : '#10B981')),
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          display: 'inline-block',
                          border: `1px solid ${isReferralDeduction ? '#FECACA' : (isDebit ? '#FECACA' : (isReferral ? '#BFDBFE' : '#A7F3D0'))}`
                        }}>
                          {isReferralDeduction ? '⚠️ REFERRAL DEDUCTION' : (isDebit ? '✓ SUBSCRIPTION DEBIT' : (isReferral ? '🎁 REFERRAL REWARD' : '💳 DIRECT TOP-UP'))}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: 'monospace', marginTop: '2px' }}>
                          Ref: {item.reference}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#71717a' }}>
                <i className="fas fa-receipt" style={{ fontSize: '2rem', color: '#D4D4D8', marginBottom: '0.5rem', display: 'block' }} />
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#18181b' }}>No Wallet Transactions Recorded</div>
                <div style={{ fontSize: '0.8rem', marginTop: '2px' }}>Top up your wallet or invite other schools to see activity here.</div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: REFERRAL PROGRAM ────────────────────────────────────── */}
        {activeTab === 'referrals' && (
          <div style={{ marginTop: '1rem' }}>
            <ReferralRewardsWidget schoolId={schoolId} compact={true} onRefresh={fetchHistory} />
          </div>
        )}

        {/* ── TAB 3: PLAN DETAILS ────────────────────────────────────────── */}
        {activeTab === 'details' && (
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div style={{ background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase' }}>Academic Session</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#18181b', marginTop: '4px' }}>{academic_year} — {term}</div>
              <div style={{ fontSize: '0.8rem', color: '#71717a', marginTop: '4px' }}>Active billing window configured for your school.</div>
            </div>

            <div style={{ background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase' }}>Student Licensing</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#18181b', marginTop: '4px' }}>GH₵ {Number(rate_per_learner).toFixed(2)} / learner</div>
              <div style={{ fontSize: '0.8rem', color: '#71717a', marginTop: '4px' }}>{effectiveLearners} enrolled learners calculated for terminal reports.</div>
            </div>

            <div style={{ background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase' }}>Report Access</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isPaidOrSubscribed ? '#10B981' : '#EF4444', marginTop: '4px' }}>
                {isPaidOrSubscribed ? '✓ 100% Unlocked' : '🔒 Payment Required'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#71717a', marginTop: '4px' }}>
                {isPaidOrSubscribed ? 'Terminal reports and analytics are available.' : 'Settle term bill to unlock terminal report downloads.'}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Top Up Modal */}
      {showTopUpModal && (
        <TopUpWalletModal
          schoolId={schoolId}
          currentBalance={effectiveWalletBalance}
          requiredAmount={termFee}
          onClose={() => setShowTopUpModal(false)}
          onSuccess={() => {
            fetchHistory();
            if (onRefresh) onRefresh();
          }}
        />
      )}

    </div>
  );
};

export default SchoolWalletWidget;
