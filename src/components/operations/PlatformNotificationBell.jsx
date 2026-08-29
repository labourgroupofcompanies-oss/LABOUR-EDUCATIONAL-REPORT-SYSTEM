import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformNotifications } from '../../context/PlatformNotificationContext';

const PlatformNotificationBell = () => {
  const {
    notifications,
    unreadCount,
    categoryCounts,
    markAsRead,
    markAllAsRead,
    clearAll,
    simulateNotification,
    soundEnabled,
    toggleSound
  } = usePlatformNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'schools' | 'support' | 'billing' | 'dashboard'
  const [showOnlyUnread, setShowOnlyUnread] = useState(true); // Default to unread so read messages vanish
  const [showTestMenu, setShowTestMenu] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowTestMenu(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredNotifications = notifications.filter(n => {
    const matchesCategory = activeCategory === 'all' || n.category === activeCategory;
    const matchesUnread = showOnlyUnread ? !n.isRead : true;
    return matchesCategory && matchesUnread;
  });

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Recently';
    const diff = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'schools': return { icon: 'fa-school-flag', color: '#60A5FA', bg: 'rgba(37, 99, 235, 0.18)' };
      case 'support': return { icon: 'fa-headset', color: '#F87171', bg: 'rgba(239, 68, 68, 0.18)' };
      case 'billing': return { icon: 'fa-credit-card', color: '#34D399', bg: 'rgba(16, 185, 129, 0.18)' };
      case 'dashboard': default: return { icon: 'fa-tower-observation', color: '#FBBF24', bg: 'rgba(245, 158, 11, 0.18)' };
    }
  };

  const handleNotificationClick = (notif) => {
    markAsRead(notif.id);
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
          background: isOpen ? '#27272a' : '#18181b',
          border: '1px solid #27272a',
          color: unreadCount > 0 ? '#FFFFFF' : '#A1A1AA',
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1rem',
          transition: 'all 0.2s ease',
          boxShadow: unreadCount > 0 ? '0 0 12px rgba(37, 99, 235, 0.3)' : 'none'
        }}
        title="Platform Notifications"
      >
        <i className={`fas fa-bell ${unreadCount > 0 ? 'fa-shake' : ''}`} style={{ color: unreadCount > 0 ? '#60A5FA' : '#A1A1AA' }}></i>

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: '#EF4444',
            color: '#FFFFFF',
            fontSize: '0.68rem',
            fontWeight: 900,
            padding: '0.15rem 0.4rem',
            borderRadius: '999px',
            lineHeight: 1,
            border: '2px solid #09090b',
            boxShadow: '0 2px 6px rgba(239, 68, 68, 0.6)'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '48px',
          right: 0,
          width: '430px',
          maxWidth: '92vw',
          maxHeight: '580px',
          background: '#0e0e12',
          border: '1px solid #27272a',
          borderRadius: '18px',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6), 0 0 20px rgba(37, 99, 235, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100,
          overflow: 'hidden',
          animation: 'fadeInScale 0.15s ease forwards'
        }}>
          {/* Header */}
          <div style={{
            padding: '1.15rem 1.25rem',
            borderBottom: '1px solid #27272a',
            background: '#141419',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-bell" style={{ color: '#2563eb' }}></i>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#FFFFFF', fontFamily: 'Outfit, sans-serif' }}>
                Platform Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{ background: '#2563eb', color: '#FFFFFF', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 800 }}>
                  {unreadCount} new
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Toggle Unread vs All */}
              <button
                type="button"
                onClick={() => setShowOnlyUnread(prev => !prev)}
                title={showOnlyUnread ? 'Switch to All History' : 'Switch to Unread Only'}
                style={{
                  background: showOnlyUnread ? '#27272a' : '#1f1f23',
                  border: '1px solid #3f3f46',
                  color: showOnlyUnread ? '#93C5FD' : '#71717a',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}
              >
                {showOnlyUnread ? 'Unread' : 'All'}
              </button>

              {/* Sound Toggle */}
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? 'Mute Chimes' : 'Enable Notification Chimes'}
                style={{
                  background: soundEnabled ? 'rgba(37, 99, 235, 0.2)' : '#1f1f23',
                  border: '1px solid #27272a',
                  color: soundEnabled ? '#60A5FA' : '#71717a',
                  padding: '0.3rem 0.55rem',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
              >
                <i className={`fas ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
              </button>

              {/* Mark All As Read */}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllAsRead(activeCategory === 'all' ? null : activeCategory)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#60A5FA',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '0.3rem 0.5rem',
                    borderRadius: '6px'
                  }}
                  title="Mark current view as read and vanish"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div style={{
            display: 'flex',
            gap: '5px',
            padding: '0.65rem 1rem',
            background: '#101015',
            borderBottom: '1px solid #222226',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}>
            {[
              { id: 'all', label: 'All', count: categoryCounts.all },
              { id: 'schools', label: 'Schools', count: categoryCounts.schools },
              { id: 'support', label: 'Support', count: categoryCounts.support },
              { id: 'billing', label: 'Billing', count: categoryCounts.billing },
              { id: 'dashboard', label: 'Dashboard', count: categoryCounts.dashboard }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: activeCategory === tab.id ? '1px solid #2563eb' : '1px solid #27272a',
                  background: activeCategory === tab.id ? '#2563eb' : '#18181b',
                  color: activeCategory === tab.id ? '#FFFFFF' : '#A1A1AA',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span style={{
                    background: activeCategory === tab.id ? '#FFFFFF' : '#EF4444',
                    color: activeCategory === tab.id ? '#2563eb' : '#FFFFFF',
                    fontSize: '0.65rem',
                    fontWeight: 900,
                    padding: '0.05rem 0.35rem',
                    borderRadius: '999px'
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Notification List Container */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '340px' }}>
            {filteredNotifications.length === 0 ? (
              <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: '#71717a' }}>
                <i className="fas fa-bell-slash" style={{ fontSize: '2.2rem', color: '#27272a', marginBottom: '0.75rem', display: 'block' }}></i>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#D4D4D8' }}>All Caught Up!</div>
                <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '4px' }}>
                  {showOnlyUnread ? 'No unread notifications in this category.' : 'No notification history available.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredNotifications.map((notif) => {
                  const catStyle = getCategoryIcon(notif.category);
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      style={{
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid #1f1f23',
                        background: notif.isRead ? 'transparent' : 'rgba(37, 99, 235, 0.07)',
                        display: 'flex',
                        gap: '12px',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = notif.isRead ? 'transparent' : 'rgba(37, 99, 235, 0.07)'}
                    >
                      {/* Category Icon */}
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: catStyle.bg,
                        color: catStyle.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.95rem',
                        flexShrink: 0
                      }}>
                        <i className={`fas ${catStyle.icon}`}></i>
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                          <div style={{ fontWeight: notif.isRead ? 600 : 800, fontSize: '0.86rem', color: notif.isRead ? '#E4E4E7' : '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {notif.title}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: '#71717a', whiteSpace: 'nowrap' }}>
                            {formatRelativeTime(notif.timestamp)}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.78rem', color: '#A1A1AA', lineHeight: 1.4, margin: '0 0 6px 0' }}>
                          {notif.message}
                        </div>

                        {notif.actionUrl && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotificationClick(notif);
                              }}
                              style={{
                                background: '#1e293b',
                                border: '1px solid #334155',
                                color: '#93C5FD',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                              }}
                            >
                              <span>{notif.actionLabel || 'View & Open'}</span>
                              <i className="fas fa-arrow-right" style={{ fontSize: '0.65rem' }}></i>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Unread indicator blue dot */}
                      {!notif.isRead && (
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#3B82F6',
                          flexShrink: 0,
                          marginTop: '6px',
                          boxShadow: '0 0 8px #3B82F6'
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Controls & Live Simulator */}
          <div style={{
            padding: '0.75rem 1.25rem',
            background: '#121217',
            borderTop: '1px solid #222226',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem'
          }}>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowTestMenu(prev => !prev)}
                style={{
                  background: 'transparent',
                  border: '1px solid #27272a',
                  color: '#A1A1AA',
                  padding: '0.25rem 0.55rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <i className="fas fa-flask"></i>
                <span>Test Triggers</span>
              </button>

              {/* Simulation Menu */}
              {showTestMenu && (
                <div style={{
                  position: 'absolute',
                  bottom: '30px',
                  left: 0,
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '10px',
                  padding: '5px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  width: '180px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  zIndex: 110
                }}>
                  <button
                    type="button"
                    onClick={() => { simulateNotification('school'); setShowTestMenu(false); }}
                    style={{ background: 'transparent', border: 'none', color: '#E4E4E7', padding: '0.35rem 0.6rem', textAlign: 'left', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    🏫 + New School Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => { simulateNotification('support'); setShowTestMenu(false); }}
                    style={{ background: 'transparent', border: 'none', color: '#E4E4E7', padding: '0.35rem 0.6rem', textAlign: 'left', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    🎧 + Support Ticket Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => { simulateNotification('billing'); setShowTestMenu(false); }}
                    style={{ background: 'transparent', border: 'none', color: '#E4E4E7', padding: '0.35rem 0.6rem', textAlign: 'left', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    💳 + Payment Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => { simulateNotification('dashboard'); setShowTestMenu(false); }}
                    style={{ background: 'transparent', border: 'none', color: '#E4E4E7', padding: '0.35rem 0.6rem', textAlign: 'left', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    ⚡ + Dashboard Alert
                  </button>
                </div>
              )}
            </div>

            {filteredNotifications.length > 0 && (
              <button
                type="button"
                onClick={() => clearAll(activeCategory === 'all' ? null : activeCategory)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#EF4444',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 600
                }}
              >
                Clear list
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformNotificationBell;
