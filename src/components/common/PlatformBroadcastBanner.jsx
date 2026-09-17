import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import broadcastService from '../../services/broadcastService';
import schoolNotificationService from '../../services/schoolNotificationService';

const PlatformBroadcastBanner = ({ isParentPortal = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [broadcasts, setBroadcasts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [readerModalItem, setReaderModalItem] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  const getNormalizedRole = () => {
    if (isParentPortal) return 'parent';
    const rawRole = user?.role || 'all';
    return broadcastService.normalizeRole(rawRole);
  };

  const fetchActiveBroadcasts = async () => {
    const role = getNormalizedRole();
    const userId = user?.id || null;

    try {
      await broadcastService.getAllBroadcasts();
    } catch (e) {}

    const list = broadcastService.getActiveBroadcastsForRole(role, userId);
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
  }, [user?.role, user?.id, isParentPortal]);

  const current = broadcasts[currentIndex] || broadcasts[0];

  // Auto-record active broadcast in notification bell section so it's always preserved in history
  useEffect(() => {
    if (current && current.id) {
      schoolNotificationService.addNotification({
        id: `broadcast_${current.id}`,
        title: `📢 ${current.title}`,
        message: current.content || 'Official message from Platform Developer.',
        category: 'broadcast',
        timestamp: current.createdAt || new Date().toISOString(),
        actionUrl: current.actionUrl || null,
        actionLabel: current.actionLabel || 'View Notice',
        severity: current.severity || 'info'
      }, false, false);
    }
  }, [current?.id]);

  // 7-second popup auto-disappear timer (pauses when hovered or modal is open)
  useEffect(() => {
    if (!current || isHovered || readerModalItem) return;

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        handleDismiss(current.id);
        setIsExiting(false);
        setTimerKey(prev => prev + 1);
      }, 350);
    }, 7000);

    return () => clearTimeout(timer);
  }, [current?.id, currentIndex, isHovered, readerModalItem, broadcasts.length]);

  if (!broadcasts || broadcasts.length === 0) return null;
  if (!current || !current.bannerEnabled) return null;

  // iOS-style Vibrancy & Glassmorphism Theme Configuration
  const getTheme = (severity) => {
    switch (severity) {
      case 'urgent':
        return {
          accent: '#FF3B30',
          accentGradient: 'linear-gradient(135deg, #FF3B30 0%, #FF6259 100%)',
          iconGlow: 'rgba(255, 59, 48, 0.35)',
          tagBg: 'rgba(255, 59, 48, 0.12)',
          tagText: '#FF3B30',
          borderColor: 'rgba(255, 59, 48, 0.22)',
          icon: 'fa-circle-exclamation',
          tag: 'Urgent Alert'
        };
      case 'warning':
        return {
          accent: '#FF9500',
          accentGradient: 'linear-gradient(135deg, #FF9500 0%, #FFB340 100%)',
          iconGlow: 'rgba(255, 149, 0, 0.35)',
          tagBg: 'rgba(255, 149, 0, 0.14)',
          tagText: '#D97706',
          borderColor: 'rgba(255, 149, 0, 0.25)',
          icon: 'fa-triangle-exclamation',
          tag: 'Official Notice'
        };
      case 'success':
        return {
          accent: '#34C759',
          accentGradient: 'linear-gradient(135deg, #34C759 0%, #30D158 100%)',
          iconGlow: 'rgba(52, 199, 89, 0.35)',
          tagBg: 'rgba(52, 199, 89, 0.14)',
          tagText: '#15803D',
          borderColor: 'rgba(52, 199, 89, 0.25)',
          icon: 'fa-circle-check',
          tag: 'System Update'
        };
      case 'info':
      default:
        return {
          accent: '#007AFF',
          accentGradient: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
          iconGlow: 'rgba(0, 122, 255, 0.35)',
          tagBg: 'rgba(0, 122, 255, 0.12)',
          tagText: '#007AFF',
          borderColor: 'rgba(0, 122, 255, 0.22)',
          icon: 'fa-bolt-lightning',
          tag: 'Developer Broadcast'
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
    const role = getNormalizedRole();
    const userId = user?.id || null;
    broadcastService.dismissBroadcast(broadcastId, role, userId);
    const remaining = broadcasts.filter(b => b.id !== broadcastId);
    setBroadcasts(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
    }
    if (readerModalItem?.id === broadcastId) {
      setReaderModalItem(null);
    }
  };

  const handleCardClick = (broadcast) => {
    // 1. Open full modal with all information
    setReaderModalItem(broadcast);
    // 2. Immediately vanish / dismiss the floating pop card
    const role = getNormalizedRole();
    const userId = user?.id || null;
    broadcastService.dismissBroadcast(broadcast.id, role, userId);
    const remaining = broadcasts.filter(b => b.id !== broadcast.id);
    setBroadcasts(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
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
        /* ─── iOS Phone Push Notification & Dynamic Glass Card (Floating Fixed Overlay) ─── */
        .ios-broadcast-container {
          position: fixed;
          top: 18px;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 0 1rem;
          box-sizing: border-box;
          z-index: 99999;
          pointer-events: none; /* Allows interacting with the page behind around the card */
          perspective: 1000px;
        }

        .ios-notif-card {
          pointer-events: auto; /* Card itself is fully interactive */
          width: 100%;
          max-width: 620px;
          border-radius: 22px;
          /* Ultra translucent Frosted Apple Liquid Glass */
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: blur(32px) saturate(210%);
          -webkit-backdrop-filter: blur(32px) saturate(210%);
          border: 1px solid rgba(255, 255, 255, 0.75);
          box-shadow: 
            0 20px 45px -8px rgba(15, 23, 42, 0.18),
            0 8px 20px -4px rgba(15, 23, 42, 0.08),
            inset 0 1px 1.5px rgba(255, 255, 255, 0.95),
            inset 0 -1px 1px rgba(0, 0, 0, 0.03);
          padding: 0.9rem 1.15rem 0.85rem 1.15rem;
          box-sizing: border-box;
          cursor: pointer;
          transition: all 0.32s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          position: relative;
          overflow: hidden;
          animation: iosSlideDown 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.15) forwards;
        }

        @keyframes iosSlideDown {
          0% {
            opacity: 0;
            transform: translateY(-40px) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes iosSlideUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-50px) scale(0.92);
          }
        }

        .ios-notif-card.ios-exit {
          animation: iosSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
          pointer-events: none;
        }

        @keyframes countdownProgress {
          0% {
            width: 100%;
          }
          100% {
            width: 0%;
          }
        }

        .ios-notif-card:hover {
          transform: translateY(-2px) scale(1.008);
          background: rgba(255, 255, 255, 0.78);
          box-shadow: 
            0 22px 45px -8px rgba(15, 23, 42, 0.16),
            0 8px 20px -4px rgba(15, 23, 42, 0.08),
            inset 0 1px 2px rgba(255, 255, 255, 1);
        }

        .ios-notif-card:active {
          transform: scale(0.985);
          transition-duration: 0.12s;
        }

        /* Ambient Glass Specular Sheen */
        .ios-notif-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 45%;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0) 100%);
          pointer-events: none;
          border-top-left-radius: 22px;
          border-top-right-radius: 22px;
        }

        /* Top Bar / App Identity Header */
        .ios-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 0.55rem;
          position: relative;
          z-index: 2;
        }

        .ios-app-identity {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .ios-app-icon {
          width: 26px;
          height: 26px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          font-size: 0.78rem;
          flex-shrink: 0;
          box-shadow: 0 4px 10px -2px rgba(0, 0, 0, 0.25);
          position: relative;
        }

        .ios-app-label {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Outfit", Roboto, sans-serif;
          font-size: 0.76rem;
          font-weight: 700;
          color: #0F172A;
          letter-spacing: -0.01em;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .ios-tag-pill {
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.12rem 0.45rem;
          border-radius: 6px;
        }

        .ios-timestamp {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          font-size: 0.72rem;
          font-weight: 500;
          color: #64748B;
        }

        /* Controls */
        .ios-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .ios-pager {
          display: flex;
          align-items: center;
          gap: 3px;
          background: rgba(0, 0, 0, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 0.68rem;
          font-weight: 700;
          color: #334155;
        }

        .ios-pager-btn {
          background: transparent;
          border: none;
          color: #475569;
          font-size: 0.65rem;
          cursor: pointer;
          padding: 2px 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.15s;
        }
        .ios-pager-btn:hover {
          color: #0F172A;
          background: rgba(0, 0, 0, 0.08);
        }

        .ios-dismiss-btn {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.4);
          color: #64748B;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ios-dismiss-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #DC2626;
          border-color: rgba(239, 68, 68, 0.3);
          transform: scale(1.1);
        }

        /* Message Body */
        .ios-body {
          position: relative;
          z-index: 2;
          padding-left: 2px;
        }

        .ios-title {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Outfit", sans-serif;
          font-size: 0.94rem;
          font-weight: 800;
          color: #09090B;
          margin: 0 0 0.2rem 0;
          line-height: 1.35;
          letter-spacing: -0.015em;
        }

        .ios-preview {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", -apple-system, sans-serif;
          font-size: 0.83rem;
          color: #334155;
          line-height: 1.45;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Footer Tap Glance */
        .ios-footer-hint {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 0.5rem;
          padding-top: 0.4rem;
          border-top: 1px solid rgba(0, 0, 0, 0.04);
          font-size: 0.72rem;
          font-weight: 600;
          color: #64748B;
        }

        .ios-footer-hint span {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .ios-footer-hint i {
          font-size: 0.65rem;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .ios-notif-card:hover .ios-footer-hint i {
          transform: translateX(4px);
        }

        /* ─── Ultra Frosted iOS Dialog Modal ─── */
        .ios-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.38);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 1.25rem;
          box-sizing: border-box;
          animation: iosFadeIn 0.2s ease;
        }

        .ios-modal-sheet {
          width: 100%;
          max-width: 560px;
          max-height: 86vh;
          overflow-y: auto;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(36px) saturate(220%);
          -webkit-backdrop-filter: blur(36px) saturate(220%);
          border: 1px solid rgba(255, 255, 255, 0.9);
          border-radius: 28px;
          box-shadow: 
            0 32px 70px -12px rgba(15, 23, 42, 0.28),
            0 12px 30px -6px rgba(15, 23, 42, 0.1),
            inset 0 1px 2px rgba(255, 255, 255, 1);
          display: flex;
          flex-direction: column;
          animation: iosSheetPop 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.15);
        }

        @keyframes iosFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes iosSheetPop {
          0% { opacity: 0; transform: scale(0.92) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        .ios-sheet-header {
          padding: 1.25rem 1.4rem 0.9rem 1.4rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .ios-sheet-app-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ios-sheet-app-icon {
          width: 36px;
          height: 36px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          font-size: 1.05rem;
          box-shadow: 0 6px 14px -3px rgba(0, 0, 0, 0.25);
        }

        .ios-sheet-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.6);
          color: #64748B;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.88rem;
          transition: all 0.15s;
        }
        .ios-sheet-close-btn:hover {
          background: rgba(0, 0, 0, 0.1);
          color: #0F172A;
        }

        .ios-sheet-body {
          padding: 1.4rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }

        .ios-sheet-title {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Outfit", sans-serif;
          font-size: 1.25rem;
          font-weight: 800;
          color: #09090B;
          margin: 0;
          line-height: 1.32;
          letter-spacing: -0.02em;
        }

        .ios-sheet-content {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          font-size: 0.93rem;
          color: #334155;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* Action Buttons */
        .ios-sheet-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 0.4rem;
        }

        .ios-cta-primary {
          padding: 0.7rem 1.35rem;
          border-radius: 14px;
          background: #09090B;
          color: #FFFFFF;
          border: none;
          font-size: 0.86rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ios-cta-primary:hover {
          background: #18181B;
          transform: translateY(-1px);
        }

        .ios-cta-secondary {
          padding: 0.7rem 1.35rem;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid #CBD5E1;
          color: #0F172A;
          font-size: 0.86rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .ios-cta-secondary:hover {
          background: #F8FAFC;
          border-color: #94A3B8;
        }

        .ios-sheet-footer {
          padding: 0.95rem 1.4rem;
          background: rgba(248, 250, 252, 0.75);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          border-bottom-left-radius: 28px;
          border-bottom-right-radius: 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ios-clear-btn {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #DC2626;
          padding: 0.45rem 0.95rem;
          border-radius: 10px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .ios-clear-btn:hover {
          background: rgba(239, 68, 68, 0.08);
          border-color: #EF4444;
        }

        .ios-close-btn {
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          color: #334155;
          padding: 0.45rem 1.15rem;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ios-close-btn:hover {
          background: #F1F5F9;
          color: #0F172A;
        }
      `}</style>

      {/* Floating popup card only renders when full modal is NOT open */}
      {!readerModalItem && current && current.bannerEnabled && (
        <div className="ios-broadcast-container">
          {/* iPhone / Dynamic Island translucent notification card */}
          <div
            key={`${current.id}_${currentIndex}_${timerKey}`}
            className={`ios-notif-card ${isExiting ? 'ios-exit' : ''}`}
            onClick={() => handleCardClick(current)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="button"
            tabIndex={0}
            aria-label="Broadcast notification card"
          >
          {/* Header Row: iOS App Icon + Tag + Relative Timestamp + Controls */}
          <div className="ios-header">
            <div className="ios-app-identity">
              <div
                className="ios-app-icon"
                style={{
                  background: theme.accentGradient,
                  boxShadow: `0 4px 12px ${theme.iconGlow}`
                }}
              >
                <i className={`fas ${theme.icon}`}></i>
              </div>
              <div className="ios-app-label">
                <span>LABOUR EDU</span>
                <span
                  className="ios-tag-pill"
                  style={{
                    background: theme.tagBg,
                    color: theme.tagText
                  }}
                >
                  {theme.tag}
                </span>
              </div>
              <span className="ios-timestamp">• {formatRelativeTime(current.createdAt)}</span>
            </div>

            <div className="ios-controls" onClick={(e) => e.stopPropagation()}>
              {broadcasts.length > 1 && (
                <div className="ios-pager">
                  <button className="ios-pager-btn" onClick={handlePrev} title="Previous message">
                    <i className="fas fa-chevron-left"></i>
                  </button>
                  <span>{currentIndex + 1} of {broadcasts.length}</span>
                  <button className="ios-pager-btn" onClick={handleNext} title="Next message">
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              )}
              <button
                className="ios-dismiss-btn"
                onClick={() => handleDismiss(current.id)}
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="ios-body">
            <h4 className="ios-title">{current.title}</h4>
            <p className="ios-preview">{current.content}</p>
          </div>

          {/* Subtitle Glance */}
          <div className="ios-footer-hint">
            <span>
              <i className="fas fa-fingerprint" style={{ color: theme.accent }}></i>
              Tap to view full message
            </span>
            <i className="fas fa-chevron-right" style={{ color: theme.accent }}></i>
          </div>
        </div>
      </div>
    )}

      {/* ─── iPhone Frosted Glass Modal Viewer ─── */}
      {readerModalItem && (
        <div className="ios-modal-backdrop" onClick={() => setReaderModalItem(null)}>
          <div className="ios-modal-sheet" onClick={(e) => e.stopPropagation()}>
            {/* Sheet Header */}
            <div className="ios-sheet-header">
              <div className="ios-sheet-app-box">
                <div
                  className="ios-sheet-app-icon"
                  style={{
                    background: modalTheme.accentGradient,
                    boxShadow: `0 6px 16px ${modalTheme.iconGlow}`
                  }}
                >
                  <i className={`fas ${modalTheme.icon}`}></i>
                </div>
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 800, color: modalTheme.tagText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {modalTheme.tag}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                    {formatRelativeTime(readerModalItem.createdAt)} · {new Date(readerModalItem.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="ios-sheet-close-btn"
                onClick={() => setReaderModalItem(null)}
                title="Close"
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            {/* Sheet Body */}
            <div className="ios-sheet-body">
              <h3 className="ios-sheet-title">{readerModalItem.title}</h3>
              <div className="ios-sheet-content">
                {readerModalItem.content}
              </div>

              {/* Action Buttons */}
              {(readerModalItem.actionUrl || readerModalItem.blogUrl) && (
                <div className="ios-sheet-actions">
                  {readerModalItem.actionUrl && (
                    <button
                      type="button"
                      className="ios-cta-primary"
                      onClick={() => {
                        setReaderModalItem(null);
                        handleOpenLink(readerModalItem.actionUrl);
                      }}
                    >
                      <span>{readerModalItem.actionLabel || 'Open Link'}</span>
                      <i className="fas fa-arrow-up-right-from-square"></i>
                    </button>
                  )}

                  {readerModalItem.blogUrl && readerModalItem.blogUrl !== readerModalItem.actionUrl && (
                    <button
                      type="button"
                      className="ios-cta-secondary"
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

            {/* Sheet Footer */}
            <div className="ios-sheet-footer">
              <button
                type="button"
                className="ios-clear-btn"
                onClick={() => handleDismiss(readerModalItem.id)}
                title="Dismiss this notice"
              >
                <i className="fas fa-trash-can"></i>
                <span>Clear Notification</span>
              </button>

              <button
                type="button"
                className="ios-close-btn"
                onClick={() => setReaderModalItem(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PlatformBroadcastBanner;

