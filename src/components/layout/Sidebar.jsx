import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { useSyncEngine } from '../../store/SyncEngineProvider';
import { supabase } from '../../lib/supabase';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const { pendingCount, failedCount, isSyncing, retryFailed, forceDrain } = useSyncEngine();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'super_admin';

  // Check if the Supabase session is still alive.
  // If missing, sync will silently fail and the user needs to log out and back in.
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionExpired(!session);
    });
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768) onClose();
  };

  const navLinks = [
    { to: '/', icon: 'fa-chart-line', label: 'Dashboard', adminOnly: false },
    { to: '/learners', icon: 'fa-user-graduate', label: 'Learners', adminOnly: true },
    { to: '/promotions', icon: 'fa-level-up-alt', label: 'Promotions', adminOnly: true },
    { to: '/teachers', icon: 'fa-chalkboard-teacher', label: 'Teachers', adminOnly: true },
    { to: '/setup', icon: 'fa-school', label: 'School Setup', adminOnly: true },
    { to: '/settings', icon: 'fa-cogs', label: 'Settings', adminOnly: true },
    { to: '/financials', icon: 'fa-file-invoice-dollar', label: 'Financials', adminOnly: true },
    { to: '/messages', icon: 'fa-comments', label: 'Communication Center', adminOnly: true },
    { to: '/scores', icon: 'fa-edit', label: 'Score Entry', adminOnly: false, teacherOnly: true },
    { to: '/class-remarks', icon: 'fa-clipboard-user', label: 'Class Remarks', adminOnly: false, teacherOnly: true },
    { to: '/reports', icon: 'fa-file-invoice', label: 'Reports', adminOnly: true },
  ];

  const visibleLinks = navLinks.filter(l => {
    if (isAdmin && l.teacherOnly) return false;
    if (!isAdmin && l.adminOnly) return false;
    return true;
  });

  const hasPending = pendingCount > 0;
  const hasFailed = failedCount > 0;

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Logo */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', minWidth: '40px', background: 'white', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'white' }}>Labour Edu</div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: '1px' }}>Report Management</div>
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

      {/* Session Expired Warning — shown when Supabase JWT is gone but app thinks user is logged in */}
      {sessionExpired && (
        <div style={{
          margin: '0.75rem 1rem 0',
          padding: '0.7rem 0.75rem',
          borderRadius: '10px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239,68,68,0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <i className="fas fa-exclamation-circle" style={{ fontSize: '0.85rem', color: '#f87171', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fca5a5', marginBottom: '4px' }}>
                Session Expired — Sync Disabled
              </div>
              <div style={{ fontSize: '0.63rem', color: 'rgba(252,165,165,0.8)', lineHeight: 1.4, marginBottom: '6px' }}>
                Your data is saved locally. Log out and back in to restore cloud sync.
              </div>
              <button
                onClick={handleLogout}
                style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', color: '#fca5a5', cursor: 'pointer', fontSize: '0.63rem', fontWeight: 700, padding: '0.25rem 0.6rem', fontFamily: 'inherit' }}
              >
                <i className="fas fa-sign-out-alt" style={{ marginRight: '4px' }} />
                Log Out &amp; Re-Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Status Bar */}
      {(hasPending || hasFailed || isSyncing) && (
        <div style={{
          margin: '0.75rem 1rem 0',
          padding: '0.6rem 0.75rem',
          borderRadius: '10px',
          background: hasFailed
            ? 'rgba(239, 68, 68, 0.12)'
            : isSyncing
              ? 'rgba(59, 130, 246, 0.12)'
              : 'rgba(245, 158, 11, 0.12)',
          border: `1px solid ${hasFailed ? 'rgba(239,68,68,0.25)' : isSyncing ? 'rgba(59,130,246,0.25)' : 'rgba(245,158,11,0.25)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <i
            className={`fas ${isSyncing ? 'fa-sync fa-spin' : hasFailed ? 'fa-triangle-exclamation' : 'fa-cloud-arrow-up'}`}
            style={{
              fontSize: '0.8rem',
              color: hasFailed ? '#f87171' : isSyncing ? '#60a5fa' : '#fbbf24'
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: hasFailed ? '#fca5a5' : isSyncing ? '#93c5fd' : '#fde68a' }}>
              {isSyncing
                ? 'Syncing to cloud...'
                : hasFailed
                  ? `${failedCount} sync failed`
                  : `${pendingCount} pending sync`
              }
            </div>
            {hasFailed && !isSyncing && (
              <button
                onClick={retryFailed}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', fontSize: '0.62rem', fontWeight: 600, padding: 0, marginTop: '2px', fontFamily: 'inherit', textDecoration: 'underline' }}
              >
                Retry failed items
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav Links */}
      <nav style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        <div style={{ padding: '0.5rem 1rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)' }}>
            {isAdmin ? 'Admin Menu' : 'Teacher Menu'}
          </span>
        </div>

        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {visibleLinks.map(link => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <i className={`fas ${link.icon}`}></i>
                <span>{link.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User Profile Footer */}
      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
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
        {/* Force Sync + Logout */}
        <button
          onClick={forceDrain}
          disabled={isSyncing}
          style={{
            width: '100%',
            padding: '0.6rem',
            marginBottom: '0.5rem',
            background: isSyncing ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 'var(--radius-md)',
            color: isSyncing ? 'rgba(165,180,252,0.5)' : '#a5b4fc',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            transition: 'var(--transition)',
            fontFamily: 'inherit'
          }}
          title="Force a full sync of all local data to the cloud"
        >
          <i className={`fas ${isSyncing ? 'fa-sync fa-spin' : 'fa-cloud-upload-alt'}`}></i>
          <span>{isSyncing ? 'Syncing...' : 'Force Sync Now'}</span>
          {(pendingCount > 0 || failedCount > 0) && !isSyncing && (
            <span style={{ background: failedCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)', color: failedCount > 0 ? '#fca5a5' : '#fde68a', borderRadius: '10px', fontSize: '0.6rem', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
              {failedCount > 0 ? `${failedCount} failed` : `${pendingCount} pending`}
            </span>
          )}
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
