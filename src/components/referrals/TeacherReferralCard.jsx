import React, { useState, useEffect } from 'react';
import { referralService } from '../../services/referralService';
import { db } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

const TeacherReferralCard = ({ schoolId, schoolName }) => {
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const liveSchool = useLiveQuery(
    () => schoolId ? db.schools.get(schoolId) : null,
    [schoolId]
  );

  const activeSchoolName = schoolName || liveSchool?.name || 'Your School';

  useEffect(() => {
    let isMounted = true;
    const fetchCode = async () => {
      if (!schoolId) return;
      try {
        setLoading(true);
        // First check local Dexie
        if (liveSchool?.referralCode) {
          if (isMounted) setReferralCode(liveSchool.referralCode);
          setLoading(false);
          return;
        }
        // Otherwise fetch or generate via referralService
        const code = await referralService.getSchoolReferralCode(schoolId);
        if (isMounted && code) {
          setReferralCode(code);
        }
      } catch (err) {
        console.warn('[TeacherReferralCard] Error fetching referral code:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchCode();
    return () => { isMounted = false; };
  }, [schoolId, liveSchool?.referralCode]);

  const shareUrl = referralCode
    ? `${window.location.origin}/onboarding?ref=${referralCode}`
    : `${window.location.origin}/onboarding`;

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleCopyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `Hello! I use Labour Educational Report System to generate terminal student report cards and manage school records for ${activeSchoolName}.\n\nClick the link below to onboard your school directly and enjoy your First Term Free with our referral bonus:\n${shareUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E4E4E7',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
        padding: '1.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#F4F4F5',
              border: '1px solid #E4E4E7',
              color: '#09090B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.05rem',
              flexShrink: 0
            }}
          >
            <i className="fas fa-share-nodes" />
          </div>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#71717A', marginBottom: '2px' }}>
              <i className="fas fa-check" style={{ fontSize: '0.65rem' }} /> {activeSchoolName} Referral Link
            </div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#09090b', fontFamily: 'Outfit, sans-serif' }}>
              Refer Other Schools
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#71717a' }}>
              Invite teachers and headteachers in other schools. When they register using your link, their school receives their First Term Free.
            </p>
          </div>
        </div>

        {referralCode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F4F4F5', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700 }}>Code:</span>
            <strong style={{ fontFamily: 'monospace', fontSize: '0.92rem', color: '#18181b', letterSpacing: '0.05em' }}>
              {referralCode}
            </strong>
            <button
              type="button"
              onClick={handleCopyCode}
              title="Copy Referral Code"
              style={{
                background: copiedCode ? '#09090B' : '#FFFFFF',
                color: copiedCode ? '#FFFFFF' : '#09090B',
                border: '1px solid #E4E4E7',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {copiedCode ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* ── Share URL Box ── */}
      <div
        style={{
          background: '#FAFAFA',
          borderRadius: '12px',
          padding: '1.1rem',
          border: '1px solid #E4E4E7',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem'
        }}
      >
        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Your School's Direct Invite Link
        </label>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            readOnly
            value={loading ? 'Generating link...' : shareUrl}
            style={{
              flex: '1',
              minWidth: '240px',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid #E4E4E7',
              background: '#FFFFFF',
              color: '#09090B',
              fontSize: '0.85rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              outline: 'none'
            }}
          />

          <button
            type="button"
            onClick={handleCopyLink}
            disabled={loading}
            style={{
              background: '#09090B',
              color: '#FFFFFF',
              border: '1px solid #09090B',
              borderRadius: '8px',
              padding: '0.65rem 1.15rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s',
              flexShrink: 0
            }}
          >
            <i className={`fas ${copiedLink ? 'fa-check' : 'fa-copy'}`} />
            <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
          </button>

          <button
            type="button"
            onClick={handleWhatsAppShare}
            disabled={loading}
            style={{
              background: '#FFFFFF',
              color: '#09090B',
              border: '1px solid #E4E4E7',
              borderRadius: '8px',
              padding: '0.65rem 1.15rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s',
              flexShrink: 0
            }}
          >
            <i className="fab fa-whatsapp" style={{ fontSize: '0.95rem' }} />
            <span>Share on WhatsApp</span>
          </button>
        </div>
      </div>

      {/* ── How It Works ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        <div style={{ background: '#FAFAFA', borderRadius: '10px', padding: '0.85rem 1rem', border: '1px solid #E4E4E7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#09090B', color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
            <strong style={{ fontSize: '0.82rem', color: '#09090B' }}>Copy or Share</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#71717a', lineHeight: 1.45 }}>
            Send the invite link to colleague teachers, headteachers, or educational WhatsApp groups.
          </p>
        </div>

        <div style={{ background: '#FAFAFA', borderRadius: '10px', padding: '0.85rem 1rem', border: '1px solid #E4E4E7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#09090B', color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
            <strong style={{ fontSize: '0.82rem', color: '#09090B' }}>Instant Setup</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#71717a', lineHeight: 1.45 }}>
            When they click your link, your school's code is applied automatically with no manual typing needed.
          </p>
        </div>

        <div style={{ background: '#FAFAFA', borderRadius: '10px', padding: '0.85rem 1rem', border: '1px solid #E4E4E7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#09090B', color: '#FFFFFF', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
            <strong style={{ fontSize: '0.82rem', color: '#09090B' }}>First Term Free</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#71717a', lineHeight: 1.45 }}>
            The new school immediately unlocks their first academic term free of charge to create report cards.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeacherReferralCard;
