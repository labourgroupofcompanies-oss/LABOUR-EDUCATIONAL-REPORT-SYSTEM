import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { PlatformNotificationProvider, usePlatformNotifications } from '../../context/PlatformNotificationContext';
import PlatformNotificationBell from '../operations/PlatformNotificationBell';
import PlatformToastContainer from '../operations/PlatformToastContainer';

const PlatformShellContent = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { markAllAsRead } = usePlatformNotifications();

  const isDevPortal = location.pathname.startsWith('/platform/developer');
  const isOpsCenter = location.pathname.startsWith('/platform/operations');

  // Automatically vanish / mark notifications as read when the Super Admin opens that specific page
  useEffect(() => {
    const timer = setTimeout(() => {
      if (location.pathname.startsWith('/platform/operations/schools')) {
        markAllAsRead('schools');
      } else if (location.pathname.startsWith('/platform/operations/support')) {
        markAllAsRead('support');
      } else if (
        location.pathname.startsWith('/platform/operations/subscriptions') ||
        location.pathname.startsWith('/platform/operations/transactions')
      ) {
        markAllAsRead('billing');
      } else if (location.pathname === '/platform/operations' || location.pathname === '/platform/operations/') {
        markAllAsRead('dashboard');
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [location.pathname, markAllAsRead]);

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#FAFAFA', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Live Floating Toast Container */}
      <PlatformToastContainer />

      {/* Topmost Platform Header */}
      <header style={{
        height: '58px',
        background: '#09090b',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #27272a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.75rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)'
      }}>
        {/* Brand Logo & Platform Console Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/platform/operations')}>
            <img
              src="/logo.png"
              alt="Labour Logo"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                objectFit: 'contain',
                background: '#18181b',
                border: '1px solid #27272a',
                padding: '3px',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
              }}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/app-icon.png';
              }}
            />
            <div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1rem', color: '#FFFFFF', letterSpacing: '0.01em' }}>
                Platform Administration
              </div>
              <div style={{ fontSize: '0.66rem', color: '#2563eb', fontWeight: 800, letterSpacing: '0.08em' }}>
                SUPER ADMIN CONSOLE
              </div>
            </div>
          </div>

          {/* Module Switcher Tabs */}
          <div style={{ display: 'flex', gap: '5px', background: '#18181b', padding: '4px', borderRadius: '12px', border: '1px solid #27272a', marginLeft: '1.5rem' }}>
            <NavLink
              to="/platform/operations"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.45rem 1rem',
                borderRadius: '9px',
                background: isOpsCenter ? '#2563eb' : 'transparent',
                color: isOpsCenter ? '#ffffff' : '#71717a',
                fontSize: '0.83rem',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: isOpsCenter ? '0 3px 10px rgba(37, 99, 235, 0.35)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fas fa-tower-observation" style={{ color: isOpsCenter ? '#ffffff' : '#71717a' }}></i>
              <span>Platform Operations</span>
            </NavLink>

            <NavLink
              to="/platform/developer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.45rem 1rem',
                borderRadius: '9px',
                background: isDevPortal ? '#2563eb' : 'transparent',
                color: isDevPortal ? '#ffffff' : '#71717a',
                fontSize: '0.83rem',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: isDevPortal ? '0 3px 10px rgba(37, 99, 235, 0.4)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fas fa-code" style={{ color: isDevPortal ? '#ffffff' : '#71717a' }}></i>
              <span>Developer Portal</span>
            </NavLink>
          </div>
        </div>

        {/* Notification Bell, User Badge & Exit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Real-time Notification Bell */}
          <PlatformNotificationBell />

          <span style={{ fontSize: '0.78rem', color: '#71717a', background: '#18181b', border: '1px solid #27272a', padding: '0.3rem 0.75rem', borderRadius: '8px', fontWeight: 600 }}>
            Super Admin: <strong style={{ color: '#FAFAFA' }}>{user?.email || 'admin@laboureducation.com'}</strong>
          </span>

          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '9px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#EF4444',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <i className="fas fa-sign-out-alt"></i>
            School Dashboard
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Outlet />
      </div>
    </div>
  );
};

const PlatformShellLayout = () => {
  return (
    <PlatformNotificationProvider>
      <PlatformShellContent />
    </PlatformNotificationProvider>
  );
};

export default PlatformShellLayout;
