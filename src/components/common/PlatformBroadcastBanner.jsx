import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import broadcastService from '../../services/broadcastService';

const PlatformBroadcastBanner = ({ isParentPortal = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [broadcasts, setBroadcasts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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

  // Modern Mobile Notification Theme Colors
  const getTheme = (severity) => {
    switch (severity) {
      case 'urgent':
        return {
          accent: '#EF4444',
          accentBg: 'rgba(239, 68, 68, 0.1)',
          glassBg: 'rgba(254, 242, 242, 0.72)',
          borderColor: 'rgba(239, 68, 68, 0.25)',
          icon: 'fa-circle-exclamation',
          tag: 'Urgent'
        };
      case 'warning':
        return {
          accent: '#F59E0B',
          accentBg: 'rgba(245, 158, 11, 0.12)',
          glassBg: 'rgba(255, 251, 235, 0.75)',
          borderColor: 'rgba(245, 158, 11, 0.28)',
          icon: 'fa-bullhorn',
          tag: 'Notice'
        };
      case 'success':
        return {
          accent: '#10B981',
          accentBg: 'rgba(16, 185, 129, 0.12)',
          glassBg: 'rgba(236, 253, 245, 0.72)',
          borderColor: 'rgba(16, 185, 129, 0.25)',
          icon: 'fa-circle-check',
          tag: 'Update'
        };
      case 'info':
      default:
        return {
          accent: '#2563EB',
          accentBg: 'rgba(37, 99, 235, 0.1)',
          glassBg: 'rgba(239, 246, 255, 0.72)',
          borderColor: 'rgba(37, 99, 235, 0.22)',
          icon: 'fa-bell',
          tag: 'Announcement'
        };
    }
  };

  const theme = getTheme(current.severity);
  const modalTheme = readerModalItem ? getTheme(readerModalItem.severity) : theme;

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return 'Just now';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now - d) / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (_) {
      return 'Recently';
    }
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

  const handleNext = (e) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % broadcasts.length);
  };

  const handlePrev = (e) => {
    e?.stopPropagation();
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
      <style>{`
        .broadcast-notif-wrapper {
          width: 100%;
          padding: 0.65rem 1rem 0.25rem 1rem;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
          position: relative;
          z-index: 80;
        }

        /* Mobile Phone Push Notification Card Style */
        .broadcast-notif-card {
          width: 100%;
          max-width: 680px;
          border-radius: 18px;
          backdrop-filter: blur(18px) saturate(180%);
          -webkit-backdrop-filter: blur(18px) saturate(180%);
          padding: 0.85rem 1.15rem 0.75rem 1.15rem;
          box-sizing: border-box;
          box-shadow: 
            0 10px 25px -4px rgba(15, 23, 42, 0.07),
            0 4px 10px -2px rgba(15, 23, 42, 0.03),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
          cursor: pointer;
          transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
        }

        .broadcast-notif-card:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 14px 30px -4px rgba(15, 23, 42, 0.11),
            0 6px 14px -2px rgba(15, 23, 42, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .broadcast-notif-card:active {
          transform: scale(0.99);
        }

        /* Header Row */
        .notif-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 0.4rem;
        }

        .notif-app-left {
          display: flex;
          align-items: center;
          gap: 7px;
          overflow: hidden;
        }

        .notif-icon-badge {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          flex-shrink: 0;
        }

        .notif-tag-label {
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .notif-bullet {
          font-size: 0.65rem;
          color: #94A3B8;
        }

        .notif-time-ago {
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748B;
        }

        /* Header Right Controls */
        .notif-controls-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .notif-pager-box {
          display: flex;
          align-items: center;
          gap: 3px;
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(0, 0, 0, 0.07);
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 0.72rem;
          font-weight: 700;
          color: #334155;
        }

        .notif-pager-btn {
          background: transparent;
          border: none;
          color: #475569;
          font-size: 0.7rem;
          cursor: pointer;
          padding: 1px 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .notif-pager-btn:hover {
          background: rgba(0, 0, 0, 0.06);
          color: #0F172A;
        }

        .notif-quick-clear-btn {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.75);
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: #64748B;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        .notif-quick-clear-btn:hover {
          background: #FEE2E2;
          color: #DC2626;
          border-color: #FECACA;
          transform: scale(1.05);
        }

        /* Body (Strictly what the admin typed) */
        .notif-title-text {
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 0.94rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 0.2rem 0;
          line-height: 1.35;
          letter-spacing: -0.01em;
        }

        .notif-preview-text {
          font-size: 0.84rem;
          color: #334155;
          line-height: 1.45;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Footer Tap Affordance */
        .notif-tap-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 0.45rem;
          padding-top: 0.35rem;
          border-top: 1px solid rgba(0, 0, 0, 0.04);
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748B;
        }

        .notif-tap-footer span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .notif-tap-footer i {
          font-size: 0.68rem;
          transition: transform 0.2s ease;
        }
        .broadcast-notif-card:hover .notif-tap-footer i {
          transform: translateX(3px);
        }

        /* ── Full Message Translucent Modal ── */
        .notif-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 1.25rem;
          box-sizing: border-box;
          animation: modalBackdropFade 0.2s ease;
        }

        .notif-modal-dialog {
          width: 100%;
          max-width: 580px;
          max-height: 85vh;
          overflow-y: auto;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(24px) saturate(190%);
          -webkit-backdrop-filter: blur(24px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.8);
          border-radius: 24px;
          box-shadow: 
            0 25px 60px -10px rgba(15, 23, 42, 0.3),
            0 10px 25px -5px rgba(15, 23, 42, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          display: flex;
          flex-direction: column;
          animation: modalCardPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes modalBackdropFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes modalCardPop {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .notif-modal-header {
          padding: 1.25rem 1.5rem 0.85rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .notif-modal-app-box {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .notif-modal-icon-badge {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
        }

        .notif-modal-close-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.05);
          border: none;
          color: #64748B;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.15s;
        }
        .notif-modal-close-btn:hover {
          background: rgba(0, 0, 0, 0.1);
          color: #0F172A;
        }

        .notif-modal-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .notif-modal-title {
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 1.2rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0;
          line-height: 1.35;
        }

        .notif-modal-message {
          font-size: 0.94rem;
          color: #334155;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* Action Buttons on Card */
        .notif-modal-action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 0.5rem;
        }

        .notif-cta-btn-primary {
          padding: 0.65rem 1.25rem;
          border-radius: 12px;
          background: #09090B;
          color: #FFFFFF;
          border: none;
          font-size: 0.86rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
          transition: all 0.2s;
        }
        .notif-cta-btn-primary:hover {
          background: #18181B;
          transform: translateY(-1px);
        }

        .notif-cta-btn-secondary {
          padding: 0.65rem 1.25rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.9);
          border: 1.5px solid #CBD5E1;
          color: #0F172A;
          font-size: 0.86rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .notif-cta-btn-secondary:hover {
          background: #F8FAFC;
          border-color: #94A3B8;
        }

        /* Footer Toolbar */
        .notif-modal-footer {
          padding: 1rem 1.5rem;
          background: rgba(248, 250, 252, 0.85);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          border-bottom-left-radius: 24px;
          border-bottom-right-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .notif-clear-notice-btn {
          background: transparent;
          border: 1px solid #FECACA;
          color: #DC2626;
          padding: 0.45rem 0.9rem;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .notif-clear-notice-btn:hover {
          background: #FEE2E2;
          border-color: #F87171;
        }

        .notif-dismiss-close-btn {
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          color: #334155;
          padding: 0.45rem 1.1rem;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }
        .notif-dismiss-close-btn:hover {
          background: #F1F5F9;
          color: #0F172A;
        }
      `}</style>

      <div className="broadcast-notif-wrapper">
        {/* Mobile Notification Card */}
        <div
          className="broadcast-notif-card"
          style={{
            background: theme.glassBg,
            border: `1.5px solid ${theme.borderColor}`
          }}
          onClick={() => setReaderModalItem(current)}
          role="button"
          tabIndex={0}
        >
          {/* Header row (Icon, Category, Time, Dismiss) */}
          <div className="notif-header-row">
            <div className="notif-app-left">
              <div className="notif-icon-badge" style={{ color: theme.accent, background: theme.accentBg }}>
                <i className={`fas ${theme.icon}`}></i>
              </div>
              <span className="notif-tag-label" style={{ color: theme.accent }}>
                {theme.tag}
              </span>
              <span className="notif-bullet">•</span>
              <span className="notif-time-ago">{formatRelativeTime(current.createdAt)}</span>
            </div>

            <div className="notif-controls-right" onClick={(e) => e.stopPropagation()}>
              {broadcasts.length > 1 && (
                <div className="notif-pager-box">
                  <button className="notif-pager-btn" onClick={handlePrev} title="Previous">
                    <i className="fas fa-chevron-left"></i>
                  </button>
                  <span>{currentIndex + 1}/{broadcasts.length}</span>
                  <button className="notif-pager-btn" onClick={handleNext} title="Next">
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              )}
              <button
                className="notif-quick-clear-btn"
                onClick={() => handleDismiss(current.id)}
                title="Clear notification"
                aria-label="Clear notification"
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* Body: Strictly what was typed by the user */}
          <div className="notif-content-box">
            <h4 className="notif-title-text">{current.title}</h4>
            <p className="notif-preview-text">{current.content}</p>
          </div>

          {/* Tap hint */}
          <div className="notif-tap-footer">
            <span>Tap to view full message</span>
            <i className="fas fa-chevron-right"></i>
          </div>
        </div>
      </div>

      {/* ── Full Message Reader Modal ── */}
      {readerModalItem && (
        <div className="notif-modal-backdrop" onClick={() => setReaderModalItem(null)}>
          <div className="notif-modal-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="notif-modal-header">
              <div className="notif-modal-app-box">
                <div
                  className="notif-modal-icon-badge"
                  style={{ color: modalTheme.accent, background: modalTheme.accentBg }}
                >
                  <i className={`fas ${modalTheme.icon}`}></i>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: modalTheme.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {modalTheme.tag}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                    {formatRelativeTime(readerModalItem.createdAt)} · {new Date(readerModalItem.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="notif-modal-close-btn"
                onClick={() => setReaderModalItem(null)}
                title="Close"
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            {/* Modal Body: Strictly the text typed by the admin */}
            <div className="notif-modal-body">
              <h3 className="notif-modal-title">{readerModalItem.title}</h3>
              <div className="notif-modal-message">
                {readerModalItem.content}
              </div>

              {/* Action Buttons if links were supplied */}
              {(readerModalItem.actionUrl || readerModalItem.blogUrl) && (
                <div className="notif-modal-action-row">
                  {readerModalItem.actionUrl && (
                    <button
                      type="button"
                      className="notif-cta-btn-primary"
                      onClick={() => {
                        setReaderModalItem(null);
                        handleOpenLink(readerModalItem.actionUrl);
                      }}
                    >
                      <span>{readerModalItem.actionLabel || 'Follow Link'}</span>
                      <i className="fas fa-arrow-up-right-from-square"></i>
                    </button>
                  )}

                  {readerModalItem.blogUrl && readerModalItem.blogUrl !== readerModalItem.actionUrl && (
                    <button
                      type="button"
                      className="notif-cta-btn-secondary"
                      onClick={() => {
                        setReaderModalItem(null);
                        handleOpenLink(readerModalItem.blogUrl);
                      }}
                    >
                      <i className="fas fa-book-open"></i>
                      <span>Read Full Article</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer: User decides to Clear or Close */}
            <div className="notif-modal-footer">
              <button
                type="button"
                className="notif-clear-notice-btn"
                onClick={() => handleDismiss(readerModalItem.id)}
                title="Remove and dismiss this notice"
              >
                <i className="fas fa-trash-can"></i>
                <span>Clear Notification</span>
              </button>

              <button
                type="button"
                className="notif-dismiss-close-btn"
                onClick={() => setReaderModalItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PlatformBroadcastBanner;
