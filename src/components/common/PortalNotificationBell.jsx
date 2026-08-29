import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolNotifications } from '../../context/SchoolNotificationContext';

const PortalNotificationBell = ({ dark = false }) => {
  const {
    notifications,
    unreadCount,
    removeNotification,
    clearAll,
    soundEnabled,
    toggleSound
  } = useSchoolNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Recently';
    const diff = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleCardClick = (notif) => {
    removeNotification(notif.id);
    if (notif.actionUrl) {
      setIsOpen(false);
      navigate(notif.actionUrl);
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          position: 'relative',
          background: dark ? (isOpen ? '#27272a' : '#18181b') : (isOpen ? '#F4F4F5' : '#FFFFFF'),
          border: dark ? '1px solid #27272a' : '1.5px solid #E4E4E7',
          color: unreadCount > 0 ? (dark ? '#FFFFFF' : '#2563eb') : (dark ? '#A1A1AA' : '#71717a'),
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '0.95rem',
          transition: 'all 0.2s ease',
          boxShadow: unreadCount > 0 ? '0 0 10px rgba(37, 99, 235, 0.25)' : 'none',
          flexShrink: 0
        }}
        title="Notifications"
      >
        <i className={`fas fa-bell ${unreadCount > 0 ? 'fa-shake' : ''}`}></i>

        {/* Counter Badge */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-3px',
            right: '-3px',
            background: '#EF4444',
            color: '#FFFFFF',
            fontSize: '0.65rem',
            fontWeight: 900,
            padding: '0.12rem 0.35rem',
            borderRadius: '999px',
            lineHeight: 1,
            border: `2px solid ${dark ? '#09090b' : '#FFFFFF'}`,
            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '46px',
          right: 0,
          width: '380px',
          maxWidth: '88vw',
          maxHeight: '480px',
          background: dark ? '#121217' : '#FFFFFF',
          border: dark ? '1px solid #27272a' : '1px solid #E4E4E7',
          borderRadius: '16px',
          boxShadow: '0 15px 35px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          overflow: 'hidden',
          animation: 'fadeInScale 0.15s ease forwards'
        }}>
          {/* Header */}
          <div style={{
            padding: '1rem 1.15rem',
            borderBottom: dark ? '1px solid #27272a' : '1px solid #F4F4F5',
            background: dark ? '#18181b' : '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-bell" style={{ color: '#2563eb' }}></i>
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
              {/* Sound Toggle */}
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? 'Mute Chimes' : 'Enable Notification Chimes'}
                style={{
                  background: 'transparent',
                  border: dark ? '1px solid #27272a' : '1px solid #E4E4E7',
                  color: soundEnabled ? '#2563eb' : '#A1A1AA',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.72rem'
                }}
              >
                <i className={`fas ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
              </button>

              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#EF4444',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '0.25rem 0.4rem'
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '340px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#71717a' }}>
                <i className="fas fa-bell-slash" style={{ fontSize: '1.8rem', color: '#D4D4D8', marginBottom: '0.5rem', display: 'block' }}></i>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: dark ? '#D4D4D8' : '#27272a' }}>No notifications</div>
                <div style={{ fontSize: '0.75rem', color: '#A1A1AA', marginTop: '2px' }}>
                  You are all caught up!
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleCardClick(notif)}
                    style={{
                      padding: '0.85rem 1.15rem',
                      borderBottom: dark ? '1px solid #1f1f23' : '1px solid #F4F4F5',
                      background: notif.isRead ? 'transparent' : (dark ? 'rgba(37, 99, 235, 0.08)' : '#F0F7FF'),
                      display: 'flex',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = notif.isRead ? 'transparent' : (dark ? 'rgba(37, 99, 235, 0.08)' : '#F0F7FF')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.84rem', color: dark ? '#FFFFFF' : '#09090b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {notif.title}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.68rem', color: '#A1A1AA', whiteSpace: 'nowrap' }}>
                            {formatRelativeTime(notif.timestamp)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(notif.id);
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#A1A1AA', cursor: 'pointer', fontSize: '0.75rem', padding: '1px 3px' }}
                            title="Dismiss"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.76rem', color: dark ? '#A1A1AA' : '#4B5563', lineHeight: 1.4, margin: '0 0 4px 0' }}>
                        {notif.message}
                      </div>

                      {notif.actionUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick(notif);
                          }}
                          style={{
                            background: '#2563eb',
                            border: 'none',
                            color: '#FFFFFF',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '5px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '2px'
                          }}
                        >
                          <span>{notif.actionLabel || 'View'}</span>
                          <i className="fas fa-arrow-right" style={{ fontSize: '0.6rem' }}></i>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalNotificationBell;
