import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolNotifications } from '../../context/SchoolNotificationContext';

const CATEGORY_COLORS = {
  scores:   '#2563eb',
  blog:     '#8b5cf6',
  referrals:'#10b981',
  finance:  '#f59e0b',
  reports:  '#ec4899',
  broadcast:'#007aff',
  general:  '#71717a',
};

const SEVERITY_COLORS = {
  urgent:  '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  info:    '#2563eb',
};

const getCategoryIcon = (category) => {
  switch (category) {
    case 'scores':    return 'fa-clipboard-list';
    case 'blog':      return 'fa-newspaper';
    case 'referrals': return 'fa-handshake';
    case 'finance':   return 'fa-wallet';
    case 'reports':   return 'fa-file-alt';
    case 'broadcast': return 'fa-bolt-lightning';
    default:          return 'fa-bell';
  }
};

const PortalNotificationBell = ({ dark = false }) => {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    soundEnabled,
    toggleSound
  } = useSchoolNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const autoReadTimerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Auto-mark all as read after 3s of viewing
  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      autoReadTimerRef.current = setTimeout(() => markAllAsRead(), 3000);
    }
    return () => {
      if (autoReadTimerRef.current) {
        clearTimeout(autoReadTimerRef.current);
        autoReadTimerRef.current = null;
      }
    };
  }, [isOpen, unreadCount, markAllAsRead]);

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Recently';
    const diff = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleCardClick = useCallback((notif) => {
    markAsRead(notif.id);
    if (notif.actionUrl) {
      setIsOpen(false);
      navigate(notif.actionUrl);
    }
  }, [markAsRead, navigate]);

  const accentColor = (notif) =>
    SEVERITY_COLORS[notif.severity] || CATEGORY_COLORS[notif.category] || '#2563eb';

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ''}`}
        style={{
          position: 'relative',
          background: dark ? (isOpen ? '#27272a' : '#18181b') : (isOpen ? '#F4F4F5' : '#FFFFFF'),
          border: dark ? '1px solid #27272a' : '1.5px solid #E4E4E7',
          color: unreadCount > 0 ? (dark ? '#FFFFFF' : '#2563eb') : (dark ? '#A1A1AA' : '#71717a'),
          width: '36px', height: '36px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '0.95rem',
          transition: 'all 0.2s ease',
          boxShadow: unreadCount > 0 ? '0 0 10px rgba(37,99,235,0.25)' : 'none',
          flexShrink: 0
        }}
        title="Notifications"
      >
        <i className={`fas fa-bell ${unreadCount > 0 ? 'fa-shake' : ''}`}></i>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-3px', right: '-3px',
            background: '#EF4444', color: '#FFFFFF',
            fontSize: '0.65rem', fontWeight: 900,
            padding: '0.12rem 0.35rem', borderRadius: '999px', lineHeight: 1,
            border: `2px solid ${dark ? '#09090b' : '#FFFFFF'}`,
            boxShadow: '0 2px 4px rgba(239,68,68,0.4)'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '46px', right: 0,
          width: '390px', maxWidth: '92vw', maxHeight: '500px',
          background: dark ? '#121217' : '#FFFFFF',
          border: dark ? '1px solid #27272a' : '1px solid #E4E4E7',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          zIndex: 1000, overflow: 'hidden',
          animation: 'fadeInScale 0.15s ease forwards'
        }}>
          {/* Header */}
          <div style={{
            padding: '0.9rem 1.15rem',
            borderBottom: dark ? '1px solid #27272a' : '1px solid #F0F0F0',
            background: dark ? '#18181b' : '#FAFAFA',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '8px', flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-bell" style={{ color: '#2563eb', fontSize: '0.88rem' }}></i>
              <span style={{ fontWeight: 800, fontSize: '0.92rem', color: dark ? '#FFFFFF' : '#09090b', fontFamily: 'Outfit, sans-serif' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{ background: '#2563eb', color: '#FFFFFF', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800 }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllAsRead} title="Mark all as read"
                  style={{ background: 'transparent', border: dark ? '1px solid #27272a' : '1px solid #E4E4E7', color: dark ? '#A1A1AA' : '#2563eb', padding: '0.25rem 0.5rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <i className="fas fa-check-double" style={{ marginRight: '3px' }}></i>Read all
                </button>
              )}
              <button type="button" onClick={toggleSound} title={soundEnabled ? 'Mute chimes' : 'Enable chimes'}
                style={{ background: 'transparent', border: dark ? '1px solid #27272a' : '1px solid #E4E4E7', color: soundEnabled ? '#2563eb' : '#A1A1AA', padding: '0.25rem 0.5rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem' }}>
                <i className={`fas ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
              </button>
              {notifications.length > 0 && (
                <button type="button" onClick={clearAll}
                  style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: '0.25rem 0.4rem' }}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '360px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                <i className="fas fa-bell-slash" style={{ fontSize: '2rem', color: '#D4D4D8', marginBottom: '0.6rem', display: 'block' }}></i>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: dark ? '#D4D4D8' : '#27272a' }}>No notifications</div>
                <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>You are all caught up!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {notifications.map((notif) => {
                  const accent = accentColor(notif);
                  const catIcon = getCategoryIcon(notif.category);
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleCardClick(notif)}
                      style={{
                        padding: '0.8rem 1rem 0.8rem 0.85rem',
                        borderBottom: dark ? '1px solid #1f1f23' : '1px solid #F4F4F5',
                        borderLeft: `3px solid ${notif.isRead ? 'transparent' : accent}`,
                        background: notif.isRead ? 'transparent' : (dark ? 'rgba(37,99,235,0.06)' : '#F8FBFF'),
                        display: 'flex', gap: '0',
                        cursor: 'pointer', transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.04)' : '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = notif.isRead ? 'transparent' : (dark ? 'rgba(37,99,235,0.06)' : '#F8FBFF')}
                    >
                      {/* Category icon pill */}
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: `${accent}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginRight: '10px', marginTop: '1px'
                      }}>
                        <i className={`fas ${catIcon}`} style={{ fontSize: '0.7rem', color: accent }}></i>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                            {!notif.isRead && (
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: accent, flexShrink: 0, display: 'inline-block' }} />
                            )}
                            <span style={{ fontWeight: 800, fontSize: '0.83rem', color: dark ? '#FFFFFF' : '#09090b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {notif.title}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.67rem', color: '#A1A1AA', whiteSpace: 'nowrap' }}>{formatRelativeTime(notif.timestamp)}</span>
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); removeNotification(notif.id); }}
                              style={{ background: 'transparent', border: 'none', color: '#A1A1AA', cursor: 'pointer', fontSize: '0.7rem', padding: '1px 4px', lineHeight: 1, borderRadius: '4px' }}
                              title="Dismiss permanently">
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.76rem', color: dark ? '#A1A1AA' : '#52525b', lineHeight: 1.45, marginBottom: notif.actionUrl ? '5px' : 0 }}>
                          {notif.message}
                        </div>

                        {notif.actionUrl && (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); handleCardClick(notif); }}
                            style={{ background: accent, border: 'none', color: '#FFFFFF', padding: '0.2rem 0.55rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span>{notif.actionLabel || 'View'}</span>
                            <i className="fas fa-arrow-right" style={{ fontSize: '0.58rem' }}></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {unreadCount > 0 && (
            <div style={{
              padding: '0.45rem 1rem',
              borderTop: dark ? '1px solid #27272a' : '1px solid #F0F0F0',
              background: dark ? '#18181b' : '#FAFAFA',
              fontSize: '0.67rem', color: '#A1A1AA', textAlign: 'center', flexShrink: 0
            }}>
              Auto-marking as read in 3s · Click × to dismiss permanently
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PortalNotificationBell;
