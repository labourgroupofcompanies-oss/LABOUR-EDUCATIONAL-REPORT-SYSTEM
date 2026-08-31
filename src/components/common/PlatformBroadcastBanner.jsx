import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import broadcastService from '../../services/broadcastService';

const PlatformBroadcastBanner = ({ isParentPortal = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [broadcasts, setBroadcasts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [readerModalItem, setReaderModalItem] = useState(null);

  const fetchActiveBroadcasts = () => {
    let role = 'all';
    if (isParentPortal) {
      role = 'parent';
    } else if (user?.role === 'super_admin') {
      role = 'headteacher';
    } else if (user?.role) {
      role = user.role;
    }

    const list = broadcastService.getActiveBroadcastsForRole(role);
    if (list && list.length > 0) {
      setBroadcasts(list);
      if (currentIndex >= list.length) {
        setCurrentIndex(0);
      }
    } else {
      setBroadcasts([]);
      setCurrentIndex(0);
    }
  };

  useEffect(() => {
    fetchActiveBroadcasts();

    const handleUpdate = () => {
      fetchActiveBroadcasts();
    };

    window.addEventListener('platform-broadcast-updated', handleUpdate);
    return () => {
      window.removeEventListener('platform-broadcast-updated', handleUpdate);
    };
  }, [user?.role, isParentPortal]);

  if (!broadcasts || broadcasts.length === 0) return null;

  const current = broadcasts[currentIndex] || broadcasts[0];
  if (!current || !current.bannerEnabled) return null;

  // Severity color schemes & badges
  const getTheme = (severity) => {
    switch (severity) {
      case 'urgent':
        return {
          bgGradient: 'linear-gradient(135deg, #FEF2F2 0%, #FFF1F2 100%)',
          borderColor: '#FECACA',
          accentColor: '#DC2626',
          badgeBg: '#FEE2E2',
          badgeText: '#991B1B',
          icon: 'fa-triangle-exclamation',
          typeLabel: 'Urgent Directive',
          btnBg: 'linear-gradient(135deg, #DC2626, #B91C1C)',
          btnShadow: '0 4px 14px rgba(220, 38, 38, 0.25)'
        };
      case 'warning':
        return {
          bgGradient: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
          borderColor: '#FDE68A',
          accentColor: '#D97706',
          badgeBg: '#FEF3C7',
          badgeText: '#92400E',
          icon: 'fa-bullhorn',
          typeLabel: 'GES Official Notice',
          btnBg: 'linear-gradient(135deg, #D97706, #B45309)',
          btnShadow: '0 4px 14px rgba(217, 119, 6, 0.25)'
        };
      case 'success':
        return {
          bgGradient: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
          borderColor: '#A7F3D0',
          accentColor: '#059669',
          badgeBg: '#D1FAE5',
          badgeText: '#065F46',
          icon: 'fa-circle-check',
          typeLabel: 'Academic Milestone',
          btnBg: 'linear-gradient(135deg, #059669, #047857)',
          btnShadow: '0 4px 14px rgba(5, 150, 105, 0.25)'
        };
      case 'info':
      default:
        return {
          bgGradient: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
          borderColor: '#BFDBFE',
          accentColor: '#2563EB',
          badgeBg: '#DBEAFE',
          badgeText: '#1E40AF',
          icon: 'fa-landmark-dome',
          typeLabel: 'National Circular',
          btnBg: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
          btnShadow: '0 4px 14px rgba(37, 99, 235, 0.25)'
        };
    }
  };

  const theme = getTheme(current.severity);

  // Simplified teaser string for the card display
  const getTeaser = (text, maxLength = 135) => {
    if (!text) return '';
    const clean = text.replace(/[\n\r]+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return clean.slice(0, maxLength).trim() + '...';
  };

  const handleDismiss = (broadcastId) => {
    broadcastService.dismissBroadcast(broadcastId);
    const remaining = broadcasts.filter(b => b.id !== broadcastId);
    setBroadcasts(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
    }
    if (readerModalItem?.id === broadcastId) {
      setReaderModalItem(null);
    }
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % broadcasts.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + broadcasts.length) % broadcasts.length);
  };

  const handleOpenLink = (url) => {
    if (!url) return;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      navigate(url);
    }
  };

  return (
    <>
      <div
        style={{
          width: '100%',
          padding: '0.65rem 1rem 0.35rem 1rem',
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 80
        }}
      >
        {/* Minimized Pill View */}
        {isMinimized ? (
          <div
            style={{
              background: '#FFFFFF',
              border: `1.5px solid ${theme.borderColor}`,
              borderLeft: `5px solid ${theme.accentColor}`,
              borderRadius: '12px',
              padding: '0.5rem 0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)',
              maxWidth: '1200px',
              margin: '0 auto',
              cursor: 'pointer'
            }}
            onClick={() => setIsMinimized(false)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: theme.accentColor,
                  display: 'inline-block',
                  animation: 'pulse 1.5s infinite'
                }}
              />
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: theme.accentColor, textTransform: 'uppercase' }}>
                {theme.typeLabel}:
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#09090b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {current.title}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {current.blogUrl ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenLink(current.blogUrl);
                  }}
                  style={{
                    background: theme.accentColor,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Read Blog
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setReaderModalItem(current);
                  }}
                  style={{
                    background: theme.accentColor,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Read Info
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(false);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
                title="Expand Card"
              >
                <i className="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>
        ) : (
          /* Full Modern Directive Card */
          <div
            style={{
              background: theme.bgGradient,
              border: `1.5px solid ${theme.borderColor}`,
              borderLeft: `6px solid ${theme.accentColor}`,
              borderRadius: '16px',
              padding: '1rem 1.25rem',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.06)',
              maxWidth: '1280px',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              position: 'relative',
              transition: 'all 0.3s ease'
            }}
          >
            {/* Top Ribbon Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Government & Directive Badge */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: theme.badgeBg,
                    color: theme.badgeText,
                    border: `1px solid ${theme.borderColor}`,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase'
                  }}
                >
                  <i className={`fas ${theme.icon}`} style={{ fontSize: '0.75rem', color: theme.accentColor }}></i>
                  <span>{theme.typeLabel}</span>
                </div>

                {/* Live Pulse Indicator */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#FFFFFF',
                    border: '1px solid #E4E4E7',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '999px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: '#09090b'
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: theme.accentColor,
                      display: 'inline-block'
                    }}
                  />
                  <span>Action Directive</span>
                </div>

                {/* Audience Tag */}
                <span style={{ fontSize: '0.72rem', color: '#52525b', fontWeight: 600 }}>
                  Audience: <strong style={{ color: '#09090b', textTransform: 'capitalize' }}>{current.targetAudience === 'all' ? 'All Portals' : current.targetAudience}</strong>
                </span>
              </div>

              {/* Navigation Controls & Action Utilities */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {broadcasts.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '2px 6px', marginRight: '4px' }}>
                    <button
                      onClick={handlePrev}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3f3f46', padding: '2px 4px', fontSize: '0.75rem' }}
                      title="Previous Notice"
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#09090b' }}>
                      {currentIndex + 1} of {broadcasts.length}
                    </span>
                    <button
                      onClick={handleNext}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3f3f46', padding: '2px 4px', fontSize: '0.75rem' }}
                      title="Next Notice"
                    >
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>
                )}

                {/* Minimize Button */}
                <button
                  onClick={() => setIsMinimized(true)}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E4E4E7',
                    borderRadius: '8px',
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#71717a',
                    fontSize: '0.72rem'
                  }}
                  title="Minimize Notice Card"
                >
                  <i className="fas fa-minus"></i>
                </button>

                {/* Dismiss Button */}
                <button
                  onClick={() => handleDismiss(current.id)}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E4E4E7',
                    borderRadius: '8px',
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#71717a',
                    fontSize: '0.75rem'
                  }}
                  title="Dismiss this Announcement"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>

            {/* Card Content Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: '260px' }}>
                <h4
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '1rem',
                    fontWeight: 800,
                    color: '#09090b',
                    margin: '0 0 0.25rem 0',
                    lineHeight: 1.3
                  }}
                >
                  {current.title}
                </h4>
                <p
                  style={{
                    fontSize: '0.84rem',
                    color: '#374151',
                    margin: 0,
                    lineHeight: 1.45
                  }}
                >
                  {getTeaser(current.content)}
                </p>
              </div>

              {/* Call-To-Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                {/* Direct Blog Link Button (Read More) */}
                {current.blogUrl ? (
                  <>
                    <button
                      onClick={() => handleOpenLink(current.blogUrl)}
                      style={{
                        background: theme.btnBg,
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '0.5rem 1rem',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: theme.btnShadow,
                        transition: 'all 0.2s ease'
                      }}
                      title="Read complete guide and breakdown on Blog & Manuals"
                    >
                      <i className="fas fa-book-open"></i>
                      <span>Read More</span>
                      <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                    </button>

                    <button
                      onClick={() => setReaderModalItem(current)}
                      style={{
                        background: '#FFFFFF',
                        color: '#09090b',
                        border: '1px solid #D4D4D8',
                        borderRadius: '10px',
                        padding: '0.5rem 0.85rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Quick Preview"
                    >
                      <i className="fas fa-eye" style={{ color: '#71717a' }}></i>
                      <span>Preview</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setReaderModalItem(current)}
                    style={{
                      background: theme.btnBg,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.5rem 1rem',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: theme.btnShadow,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <i className="fas fa-book-open"></i>
                    <span>Read Information</span>
                    <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                  </button>
                )}

                {current.actionUrl && current.actionUrl !== current.blogUrl && (
                  <button
                    onClick={() => handleOpenLink(current.actionUrl)}
                    style={{
                      background: '#FFFFFF',
                      color: '#09090b',
                      border: '1px solid #D4D4D8',
                      borderRadius: '10px',
                      padding: '0.5rem 0.85rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <span>{current.actionLabel || 'Go to Page'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FULL DIRECTIVE READER MODAL */}
      {readerModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9, 9, 11, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1.25rem',
            boxSizing: 'border-box'
          }}
          onClick={() => setReaderModalItem(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '22px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header Banner */}
            <div
              style={{
                background: theme.bgGradient,
                borderBottom: `1.5px solid ${theme.borderColor}`,
                padding: '1.5rem 1.75rem',
                borderTopLeftRadius: '22px',
                borderTopRightRadius: '22px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '1rem'
              }}
            >
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: theme.badgeBg, color: theme.badgeText, border: `1px solid ${theme.borderColor}`, padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  <i className={`fas ${theme.icon}`}></i>
                  <span>Official Ghana Education Broadcast</span>
                </div>
                <h3
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '1.3rem',
                    fontWeight: 900,
                    color: '#09090b',
                    margin: 0,
                    lineHeight: 1.3
                  }}
                >
                  {readerModalItem.title}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '0.4rem', fontSize: '0.75rem', color: '#52525b', fontWeight: 600 }}>
                  <span><i className="fas fa-user-shield" style={{ marginRight: '4px', color: theme.accentColor }}></i> Author: {readerModalItem.author || 'Platform Super Admin'}</span>
                  <span>•</span>
                  <span><i className="fas fa-calendar-day" style={{ marginRight: '4px' }}></i> {new Date(readerModalItem.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>

              <button
                onClick={() => setReaderModalItem(null)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E4E4E7',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  color: '#71717a',
                  flexShrink: 0
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body Content */}
            <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  fontSize: '0.94rem',
                  color: '#18181b',
                  lineHeight: 1.65,
                  whiteSpace: 'pre-line'
                }}
              >
                {readerModalItem.content}
              </div>

              {/* Dedicated Blog Link Card inside Modal if available */}
              {readerModalItem.blogUrl && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(59, 130, 246, 0.12))',
                    border: '1.5px solid #BFDBFE',
                    borderRadius: '14px',
                    padding: '1.1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                      <i className="fas fa-newspaper"></i>
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E3A8A' }}>
                        Full Breakdown on Labour Edu Blog
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#3B82F6' }}>
                        Detailed guidelines, statutory tables &amp; printable references
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setReaderModalItem(null);
                      handleOpenLink(readerModalItem.blogUrl);
                    }}
                    style={{
                      background: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '0.45rem 1rem',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 3px 10px rgba(37, 99, 235, 0.3)'
                    }}
                  >
                    <span>Read Full Blog Article</span>
                    <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                  </button>
                </div>
              )}

              {/* Key Takeaways Card */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '1.1rem 1.25rem'
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-circle-info" style={{ color: theme.accentColor }}></i>
                  <span>Important Compliance &amp; Guidelines for Stakeholders</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.84rem', color: '#475569', lineHeight: 1.55 }}>
                  <li><strong>Headteachers &amp; Admins:</strong> Review broadsheet submission deadlines and institutional records.</li>
                  <li><strong>Subject &amp; Class Teachers:</strong> Verify that continuous assessment scores and exam marks are accurately computed.</li>
                  <li><strong>Parents &amp; Guardians:</strong> Monitor student progress and review official terminal report updates.</li>
                </ul>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div
              style={{
                background: '#FAFAFA',
                borderTop: '1px solid #E4E4E7',
                padding: '1.1rem 1.75rem',
                borderBottomLeftRadius: '22px',
                borderBottomRightRadius: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <button
                onClick={() => handleDismiss(readerModalItem.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <i className="fas fa-check-double"></i>
                <span>Mark as Acknowledged</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setReaderModalItem(null)}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '10px',
                    background: '#FFFFFF',
                    border: '1px solid #D4D4D8',
                    color: '#09090b',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>

                {readerModalItem.blogUrl ? (
                  <button
                    onClick={() => {
                      setReaderModalItem(null);
                      handleOpenLink(readerModalItem.blogUrl);
                    }}
                    style={{
                      padding: '0.55rem 1.25rem',
                      borderRadius: '10px',
                      background: theme.btnBg,
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: theme.btnShadow
                    }}
                  >
                    <i className="fas fa-book-open"></i>
                    <span>Read Full Guide</span>
                    <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                  </button>
                ) : readerModalItem.actionUrl && (
                  <button
                    onClick={() => {
                      setReaderModalItem(null);
                      handleOpenLink(readerModalItem.actionUrl);
                    }}
                    style={{
                      padding: '0.55rem 1.25rem',
                      borderRadius: '10px',
                      background: theme.btnBg,
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: theme.btnShadow
                    }}
                  >
                    <span>{readerModalItem.actionLabel || 'Proceed to Page'}</span>
                    <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PlatformBroadcastBanner;
