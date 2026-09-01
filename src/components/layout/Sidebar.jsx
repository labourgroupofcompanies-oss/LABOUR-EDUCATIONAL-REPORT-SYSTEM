import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { useSyncEngine } from '../../store/SyncEngineProvider';
import { useSchoolNotifications } from '../../context/SchoolNotificationContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const { pendingCount, failedCount, isSyncing, retryFailed, forceDrain } = useSyncEngine();
  const { unreadNotifications, markAsRead } = useSchoolNotifications();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'super_admin';
  const [logoError, setLogoError] = useState(false);

  const unreadBlogCount = unreadNotifications?.filter(n => n.category === 'blog').length || 0;

  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null,
    [user?.schoolId]
  );

  // Reset logo error whenever logoUrl changes
  useEffect(() => { setLogoError(false); }, [schoolInfo?.logoUrl]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768) onClose();
  };

  // Categorized Nav Groups with concise wording
  const adminNavSections = [
    {
      title: 'Overview',
      links: [
        { to: '/', icon: 'fa-chart-pie', label: 'Dashboard' }
      ]
    },
    {
      title: 'Academics',
      links: [
        { to: '/learners', icon: 'fa-user-graduate', label: 'Learners' },
        { to: '/scores', icon: 'fa-pen-to-square', label: 'Score Entry' },
        { to: '/reports', icon: 'fa-file-invoice', label: 'Reports' },
        { to: '/promotions', icon: 'fa-level-up-alt', label: 'Promotions' },
        { to: '/all-scores', icon: 'fa-list-check', label: 'Audit' }
      ]
    },
    {
      title: 'People',
      links: [
        { to: '/teachers', icon: 'fa-chalkboard-teacher', label: 'Teachers' },
        { to: '/messages', icon: 'fa-comments', label: 'Messages' }
      ]
    },
    {
      title: 'Management',
      links: [
        { to: '/setup', icon: 'fa-school', label: 'School Setup' },
        { to: '/financials', icon: 'fa-wallet', label: 'Top Up & Billing' },
        { to: '/settings', icon: 'fa-sliders-h', label: 'Settings' },
        { to: '/recycle-bin', icon: 'fa-trash-can', label: 'Recycle Bin' },
        { to: '/blog', icon: 'fa-newspaper', label: 'Blog' },
        { to: '/support', icon: 'fa-headset', label: 'Support & Help' }
      ]
    }
  ];

  const teacherNavSections = [
    {
      title: 'Overview',
      links: [
        { to: '/', icon: 'fa-chart-pie', label: 'Dashboard' }
      ]
    },
    {
      title: 'Classroom',
      links: [
        { to: '/scores', icon: 'fa-pen-to-square', label: 'Score Entry' },
        { to: '/class-remarks', icon: 'fa-clipboard-user', label: 'Remarks' }
      ]
    },
    {
      title: 'System',
      links: [
        { to: '/settings', icon: 'fa-sliders-h', label: 'Settings' },
        { to: '/blog', icon: 'fa-newspaper', label: 'Blog' },
        { to: '/support', icon: 'fa-headset', label: 'Support & Help' }
      ]
    }
  ];

  const navSections = isAdmin ? adminNavSections : teacherNavSections;

  const hasPending = pendingCount > 0;
  const hasFailed = failedCount > 0;

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Logo Header */}
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          {/* School logo */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: '42px', height: '42px', background: 'white', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', padding: '2px', border: '1px solid var(--accent)' }}>
              {schoolInfo?.logoUrl && !logoError ? (
                <img
                  src={schoolInfo.logoUrl}
                  alt="School Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={() => setLogoError(true)}
                />
              ) : (
                <i className="fas fa-school" style={{ fontSize: '1.25rem', color: 'var(--primary)' }}></i>
              )}
            </div>
            {/* Sync status dot — bottom-right of logo */}
            <span
              title={isSyncing ? 'Syncing…' : hasFailed ? 'Sync issue' : hasPending ? 'Sync pending' : 'All synced'}
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: '2px solid #09090b',
                background: isSyncing
                  ? '#2563eb'
                  : hasFailed
                    ? '#EF4444'
                    : hasPending
                      ? '#F59E0B'
                      : '#10B981',
                boxShadow: isSyncing
                  ? '0 0 6px rgba(37,99,235,0.8)'
                  : hasFailed
                    ? '0 0 6px rgba(239,68,68,0.8)'
                    : hasPending
                      ? '0 0 6px rgba(245,158,11,0.8)'
                      : '0 0 5px rgba(16,185,129,0.6)',
                animation: (isSyncing || hasPending) ? 'syncDotPulse 1.4s ease-in-out infinite' : 'none',
                transition: 'background 0.4s ease',
                cursor: 'default',
              }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'white', letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {schoolInfo?.name || 'School Portal'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>
              {isAdmin ? 'Headteacher Portal' : 'Teacher Portal'}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.6)', borderRadius: 'var(--radius-md)', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          className="hamburger-btn"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {/* Sync dot pulse keyframe injected inline once */}
      <style>{`@keyframes syncDotPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.3)} }`}</style>

      {/* Nav Groups */}
      <nav style={{ flex: 1, padding: '0.75rem 1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {navSections.map((section, idx) => (
          <div key={section.title || idx}>
            <div style={{ padding: '0 0.5rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>
                {section.title}
              </span>
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '3px', margin: 0, padding: 0 }}>
              {section.links.map(link => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === '/'}
                    data-tour={`sidebar-${link.to.replace('/', '') || 'dashboard'}`}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      handleNavClick();
                      if (link.to === '/blog') {
                        unreadNotifications?.filter(n => n.category === 'blog').forEach(n => markAsRead(n.id));
                      }
                    }}
                  >
                    <i className={`fas ${link.icon}`}></i>
                    <span>{link.label}</span>
                    {link.to === '/blog' && unreadBlogCount > 0 && (
                      <span style={{
                        marginLeft: 'auto',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        padding: '0.12rem 0.45rem',
                        borderRadius: '9999px',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        boxShadow: '0 0 8px rgba(37, 99, 235, 0.6)',
                        animation: 'pulse 2s infinite'
                      }}>
                        NEW
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User Profile Footer */}
      <div style={{ padding: '1rem', borderTop: '1px solid #27272a', position: 'sticky', bottom: 0, background: '#09090b', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
          <div style={{ width: '38px', height: '38px', minWidth: '38px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
            <i className="fas fa-user" style={{ color: 'white', fontSize: '0.9rem' }}></i>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.fullName || 'User'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>
              {isAdmin ? 'Super Admin' : 'Teacher'} • {user?.staffId}
            </div>
          </div>
        </div>
        {/* Force Sync — icon only button */}
        <button
          onClick={forceDrain}
          disabled={isSyncing}
          title={isSyncing ? 'Syncing…' : hasFailed ? 'Sync issue — tap to retry' : hasPending ? 'Tap to sync now' : 'All data synced'}
          style={{
            width: '100%',
            padding: '0.55rem',
            marginBottom: '0.5rem',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 'var(--radius-md)',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'var(--transition)',
            fontFamily: 'inherit',
          }}
        >
          {/* Inline dot */}
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            flexShrink: 0,
            background: isSyncing ? '#2563eb' : hasFailed ? '#EF4444' : hasPending ? '#F59E0B' : '#10B981',
            boxShadow: isSyncing ? '0 0 6px rgba(37,99,235,0.9)' : hasFailed ? '0 0 6px rgba(239,68,68,0.9)' : hasPending ? '0 0 6px rgba(245,158,11,0.8)' : '0 0 5px rgba(16,185,129,0.6)',
            animation: (isSyncing || hasPending) ? 'syncDotPulse 1.4s ease-in-out infinite' : 'none',
          }} />
          <i
            className={`fas ${isSyncing ? 'fa-arrows-rotate' : 'fa-cloud-arrow-up'}`}
            style={{ fontSize: '0.8rem', color: isSyncing ? '#2563eb' : hasFailed ? '#EF4444' : hasPending ? '#F59E0B' : 'rgba(255,255,255,0.4)', transition: 'color 0.3s' }}
          />
        </button>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: '0.6rem', background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'var(--transition)', fontFamily: 'inherit' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
        >
          <i className="fas fa-sign-out-alt"></i>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
