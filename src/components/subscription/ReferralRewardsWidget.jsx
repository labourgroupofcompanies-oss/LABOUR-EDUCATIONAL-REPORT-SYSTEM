import React, { useState, useEffect, useMemo } from 'react';
import referralAnalyticsService from '../../services/referralAnalyticsService';
import referralService from '../../services/referralService';
import { rewardService } from '../../services/rewardService';

const ReferralRewardsWidget = ({ schoolId, schoolName = 'Your School' }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attachMessage, setAttachMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadStats = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);
      const res = await referralAnalyticsService.getSchoolReferralStats(schoolId);
      
      // Auto-disburse ONLY admin-verified referrals into the school wallet
      // Safety: never use manualOverride — require proper admin verification first
      if (res?.pipeline && res.pipeline.length > 0) {
        let hasCreditedAny = false;
        for (const item of res.pipeline) {
          // Only auto-claim referrals that an admin has already verified
          if (item.status === 'VERIFIED') {
            try {
              await rewardService.processReferralReward(item.referredSchoolId, {
                referralId: item.id
                // No manualOverride — requires proper verification status
              });
              hasCreditedAny = true;
            } catch (claimErr) {
              console.warn('[ReferralRewardsWidget] Auto-claim for verified referral failed:', claimErr.message);
            }
          }
        }
        if (hasCreditedAny) {
          const refreshed = await referralAnalyticsService.getSchoolReferralStats(schoolId);
          setStats(refreshed);
        } else {
          setStats(res);
        }
      } else {
        setStats(res);
      }
    } catch (err) {
      console.warn('[ReferralRewardsWidget] Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [schoolId]);

  const shareUrl = stats?.code ? `${window.location.origin}/onboarding?ref=${stats.code}` : `${window.location.origin}/onboarding`;

  const handleCopyCode = () => {
    if (!stats?.code) return;
    navigator.clipboard.writeText(stats.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `Hello! I use Labour Educational Report System to generate terminal student report cards and manage school records.\n\nClick the link below to onboard your school directly and enjoy your First Term Free with our referral bonus:\n${shareUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleAttachCodeSubmit = async (e) => {
    e.preventDefault();
    if (!inputCode.trim() || !schoolId) return;
    setAttaching(true);
    setAttachMessage(null);
    try {
      const res = await referralService.attachReferralCode(schoolId, inputCode.trim());
      setAttachMessage({ type: res.success ? 'success' : 'error', text: res.message });
      if (res.success) {
        setInputCode('');
        await loadStats();
      }
    } catch (err) {
      setAttachMessage({ type: 'error', text: err.message || 'Failed to attach referral code.' });
    } finally {
      setAttaching(false);
    }
  };

  // Filter pipeline items
  const filteredPipeline = useMemo(() => {
    if (!stats?.pipeline) return [];
    return stats.pipeline.filter(item => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'UNDER_VERIFICATION' && (item.status !== 'UNDER_VERIFICATION' && item.status !== 'PENDING')) return false;
        if (statusFilter !== 'UNDER_VERIFICATION' && item.status !== statusFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (item.schoolName || '').toLowerCase();
        const loc = (item.location || '').toLowerCase();
        return name.includes(q) || loc.includes(q);
      }
      return true;
    });
  }, [stats?.pipeline, statusFilter, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* ── Referral Share & Invite Bar ──────────────────────────────────── */}
      <div style={{ 
        background: '#FAFAFA', 
        borderRadius: '14px', 
        padding: '1.25rem 1.5rem', 
        border: '1px solid #E4E4E7',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Your Unique Referral Code (Earn GH₵ 20.00 / School)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 900, color: '#09090b', letterSpacing: '1px', background: '#FFFFFF', padding: '0.2rem 0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
              {stats?.code || 'GENERATING...'}
            </span>

            <button 
              type="button"
              onClick={handleCopyCode}
              style={{ 
                background: copiedCode ? '#10B981' : '#09090b', 
                color: '#FFFFFF', 
                border: 'none', 
                borderRadius: '8px', 
                padding: '0.4rem 0.8rem', 
                fontSize: '0.8rem', 
                fontWeight: 700, 
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <i className={`fas ${copiedCode ? 'fa-check' : 'fa-copy'}`} />
              {copiedCode ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCopyLink}
            style={{ 
              background: copiedLink ? '#10B981' : '#2563eb', 
              color: '#FFFFFF', 
              border: 'none', 
              borderRadius: '8px', 
              padding: '0.55rem 1rem', 
              fontSize: '0.82rem', 
              fontWeight: 700, 
              cursor: 'pointer', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px'
            }}
          >
            <i className={`fas ${copiedLink ? 'fa-check' : 'fa-link'}`} />
            <span>{copiedLink ? 'Link Copied!' : 'Copy Invite Link'}</span>
          </button>

          <button
            type="button"
            onClick={handleWhatsAppShare}
            style={{ 
              background: '#16a34a', 
              color: '#FFFFFF', 
              border: 'none', 
              borderRadius: '8px', 
              padding: '0.55rem 1rem', 
              fontSize: '0.82rem', 
              fontWeight: 700, 
              cursor: 'pointer', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px'
            }}
          >
            <i className="fab fa-whatsapp" style={{ fontSize: '0.95rem' }} />
            <span>WhatsApp Invite</span>
          </button>
        </div>
      </div>

      {/* ── Attach Referrer Code (Compact) ─────────────────────────────────── */}
      <div style={{ 
        background: '#FFFFFF', 
        borderRadius: '14px', 
        padding: '1rem 1.25rem', 
        border: '1px solid #E4E4E7',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ fontSize: '0.82rem', color: '#18181b', fontWeight: 600 }}>
          Referred by another school? Link their code:
        </div>

        <form onSubmit={handleAttachCodeSubmit} style={{ display: 'flex', gap: '8px', flex: '1', maxWidth: '380px' }}>
          <input
            type="text"
            placeholder="e.g. REF-ACCRA-102"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            style={{
              flex: 1,
              padding: '0.4rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #E4E4E7',
              fontSize: '0.82rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: '#18181b',
              background: '#FAFAFA'
            }}
          />
          <button
            type="submit"
            disabled={attaching || !inputCode.trim()}
            style={{
              padding: '0.4rem 0.95rem',
              background: '#09090b',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: attaching || !inputCode.trim() ? 'not-allowed' : 'pointer',
              opacity: attaching || !inputCode.trim() ? 0.6 : 1
            }}
          >
            {attaching ? 'Linking...' : 'Link'}
          </button>
        </form>

        {attachMessage && (
          <div style={{ width: '100%', fontSize: '0.8rem', color: attachMessage.type === 'success' ? '#10B981' : '#EF4444', fontWeight: 700, marginTop: '4px' }}>
            {attachMessage.text}
          </div>
        )}
      </div>

      {/* ── 6. Referral Activity Pipeline Table ─────────────────────────── */}
      <div style={{ 
        background: 'var(--surface)', 
        borderRadius: 'var(--radius-lg)', 
        border: '1px solid var(--border)', 
        overflow: 'hidden', 
        boxShadow: 'var(--shadow-sm)' 
      }}>
        
        {/* Table Toolbar */}
        <div style={{ 
          padding: '1.2rem 1.5rem', 
          borderBottom: '1px solid var(--border)', 
          background: 'var(--surface-alt)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '1rem' 
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)' }}>
              Referral Activity Pipeline
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Track the verification status and wallet credits for schools you have invited.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'UNDER_VERIFICATION', label: 'Under Verification' },
                { id: 'REWARDED', label: 'Rewarded' },
                { id: 'REVOKED', label: 'Revoked' },
                { id: 'REJECTED', label: 'Rejected' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setStatusFilter(t.id)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: statusFilter === t.id ? 'var(--accent)' : 'var(--border)',
                    background: statusFilter === t.id ? 'var(--accent)' : 'transparent',
                    color: statusFilter === t.id ? '#ffffff' : 'var(--text)',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'var(--transition)'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.75rem' }}></i>
              <input
                type="text"
                placeholder="Search school name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '0.45rem 0.85rem 0.45rem 2rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  width: '180px',
                  background: 'var(--surface)'
                }}
              />
            </div>

          </div>
        </div>

        {/* Table Content */}
        {filteredPipeline.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)', fontWeight: '700', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Referred School</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Invited Date</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Verification Status</th>
                  <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Wallet Credit</th>
                </tr>
              </thead>
              <tbody>
                {filteredPipeline.map((item) => {
                  let badgeBg = 'var(--warning-bg)', badgeColor = 'var(--warning-hover)', badgeBorder = 'var(--warning-border)', label = 'Under Verification';
                  let subtext = 'Pending developer review';

                  if (item.status === 'UNDER_REVIEW') { 
                    badgeBg = 'var(--error-bg)'; badgeColor = 'var(--error)'; badgeBorder = 'var(--error-border)'; 
                    label = 'Under Review'; 
                    subtext = 'Security audit review';
                  } else if (item.status === 'VERIFIED') { 
                    badgeBg = 'var(--accent-light)'; badgeColor = 'var(--accent)'; badgeBorder = '#BFDBFE'; 
                    label = 'Verified'; 
                    subtext = 'Approved! Wallet credit queued';
                  } else if (item.status === 'REWARDED') { 
                    badgeBg = 'var(--success-bg)'; badgeColor = 'var(--success)'; badgeBorder = 'var(--success-border)'; 
                    label = 'Rewarded (+GH₵ 20.00)'; 
                    subtext = 'Credited to school wallet balance';
                  } else if (item.status === 'REVOKED' || item.status === 'DEDUCTED') { 
                    badgeBg = '#FEF2F2'; badgeColor = '#DC2626'; badgeBorder = '#FECACA'; 
                    label = 'Revoked / Deducted'; 
                    subtext = item.rejectionReason || 'Referral reward deducted by administration';
                  } else if (item.status === 'REJECTED') { 
                    badgeBg = 'var(--surface-alt)'; badgeColor = 'var(--text-muted)'; badgeBorder = 'var(--border)'; 
                    label = 'Rejected'; 
                    subtext = 'Not eligible for referral';
                  }

                  return (
                    <tr 
                      key={item.id} 
                      style={{ borderBottom: '1px solid var(--border)', transition: 'var(--transition)' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.015)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '0.92rem' }}>{item.schoolName}</div>
                        {item.location && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.location}</div>}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ 
                          background: badgeBg, 
                          color: badgeColor, 
                          border: `1px solid ${badgeBorder}`,
                          padding: '0.25rem 0.7rem', 
                          borderRadius: '999px', 
                          fontSize: '0.75rem', 
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          {item.status === 'REWARDED' && <i className="fa-solid fa-circle-check"></i>}
                          {item.status === 'VERIFIED' && <i className="fa-solid fa-shield-check"></i>}
                          {(item.status === 'UNDER_VERIFICATION' || item.status === 'PENDING') && <i className="fa-solid fa-clock"></i>}
                          {item.status === 'UNDER_REVIEW' && <i className="fa-solid fa-triangle-exclamation"></i>}
                          {item.status === 'REJECTED' && <i className="fa-solid fa-circle-xmark"></i>}
                          {label}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>{subtext}</div>
                      </td>
                      <td style={{ padding: '1rem 1.25rem', textAlign: 'right', fontWeight: '800', color: item.status === 'REWARDED' ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.95rem' }}>
                        {item.status === 'REWARDED' ? `+GH₵ ${(item.rewardAmount || 20).toFixed(2)}` : 'GH₵ 20.00 (Pending)'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto', color: 'var(--text-light)', fontSize: '1.4rem' }}>
              <i className="fa-solid fa-user-group"></i>
            </div>
            <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--primary)', fontSize: '1rem', fontWeight: '800' }}>
              {searchQuery || statusFilter !== 'ALL' ? 'No Matching Referrals' : 'No Referrals in Pipeline Yet'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', marginInline: 'auto' }}>
              {searchQuery || statusFilter !== 'ALL' 
                ? 'Try adjusting your search query or filter tab to view records.' 
                : 'Share your referral code or WhatsApp invitation link above with other school headteachers to start accumulating wallet credits!'}
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

export default ReferralRewardsWidget;
