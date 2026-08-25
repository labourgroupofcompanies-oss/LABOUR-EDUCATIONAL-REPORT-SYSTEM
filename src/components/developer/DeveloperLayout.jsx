import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';

const DeveloperLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeEnv, setActiveEnv] = useState('production');

  const devNavItems = [
    { to: '/platform/developer', icon: 'fa-gauge-high', label: 'Dashboard', end: true },
    { to: '/platform/developer/transactions', icon: 'fa-receipt', label: 'School Transactions' },
    { to: '/platform/developer/api-keys', icon: 'fa-key', label: 'API Keys' },
    { to: '/platform/developer/api-docs', icon: 'fa-book-open', label: 'API Docs' },
    { to: '/platform/developer/api-versions', icon: 'fa-code-branch', label: 'API Versions' },
    { to: '/platform/developer/webhooks', icon: 'fa-bolt', label: 'Webhooks' },
    { to: '/platform/developer/sandbox', icon: 'fa-vial', label: 'Sandbox' },
    { to: '/platform/developer/analytics', icon: 'fa-chart-line', label: 'Analytics' },
    { to: '/platform/developer/security', icon: 'fa-shield-halved', label: 'Security' },
    { to: '/platform/developer/sdk', icon: 'fa-cubes', label: 'SDK Downloads' },
    { to: '/platform/developer/blog', icon: 'fa-newspaper', label: 'Blog & Manuals CMS' },
  ];

  const systemQuickLinks = [
    { label: 'System Health', icon: 'fa-heart-pulse', path: '/' },
    { label: 'Audit Center', icon: 'fa-list-check', path: '/score-diagnostic' },
    { label: 'System Settings', icon: 'fa-sliders-h', path: '/settings' },
    { label: 'School Setup', icon: 'fa-school', path: '/setup' },
  ];

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#09090b',
      color: '#e2e8f0',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Developer Portal Sidebar */}
      <aside style={{
        width: '280px',
        minWidth: '280px',
        background: '#09090b',
        borderRight: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        zIndex: 40
      }}>
        {/* Header Logo */}
        <div style={{
          padding: '1.5rem 1.25rem',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '1.2rem',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
          }}>
            <i className="fas fa-terminal"></i>
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.05rem', color: '#FFFFFF' }}>
              Platform Developer
            </div>
            <div style={{ fontSize: '0.68rem', color: '#2563eb', fontWeight: 700, letterSpacing: '0.05em' }}>
              SUPER ADMIN CONSOLE
            </div>
          </div>
        </div>

        {/* Environment Badge Switcher */}
        <div style={{ padding: '1rem 1.25rem 0.5rem' }}>
          <div style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid #27272a',
            borderRadius: '10px',
            padding: '3px'
          }}>
            <button
              onClick={() => setActiveEnv('production')}
              style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                borderRadius: '8px',
                border: 'none',
                background: activeEnv === 'production' ? '#2563eb' : 'transparent',
                color: activeEnv === 'production' ? 'white' : '#71717a',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <i className="fas fa-server" style={{ fontSize: '0.7rem' }}></i>
              Production
            </button>
            <button
              onClick={() => setActiveEnv('sandbox')}
              style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                borderRadius: '8px',
                border: 'none',
                background: activeEnv === 'sandbox' ? '#F59E0B' : 'transparent',
                color: activeEnv === 'sandbox' ? '#09090b' : '#71717a',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <i className="fas fa-flask" style={{ fontSize: '0.7rem' }}></i>
              Sandbox
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '0.75rem 1rem', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
            Developer Modules
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {devNavItems.map(item => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '10px',
                    color: isActive ? '#FFFFFF' : '#71717a',
                    background: isActive ? '#2563eb' : 'transparent',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.88rem',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease'
                  })}
                >
                  <i className={`fas ${item.icon}`} style={{ width: '18px', textAlign: 'center' }}></i>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #27272a' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
              System Integrations
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {systemQuickLinks.map(link => (
                <li key={link.label}>
                  <button
                    onClick={() => navigate(link.path)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#71717a',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
                    onMouseLeave={e => e.currentTarget.style.color = '#71717a'}
                  >
                    <i className={`fas ${link.icon}`} style={{ width: '16px' }}></i>
                    <span>{link.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* User Footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid #27272a',
          background: 'rgba(9, 9, 11, 0.8)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '0.85rem',
              fontWeight: 700
            }}>
              SA
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {user?.fullName || 'Super Admin'}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#2563eb' }}>
                Full Platform Scope
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid #27272a',
              color: '#A1A1AA',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <i className="fas fa-arrow-left"></i>
            Exit to School Dashboard
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#09090b' }}>
        {/* Top Header */}
        <header style={{
          height: '64px',
          background: '#09090b',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#71717a' }}>
            <span onClick={() => navigate('/platform/developer')} style={{ cursor: 'pointer', color: '#2563eb' }}>Developer Portal</span>
            <i className="fas fa-chevron-right" style={{ fontSize: '0.65rem' }}></i>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
              {location.pathname === '/platform/developer' ? 'Dashboard Overview' : location.pathname.split('/').pop().replace('-', ' ').toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10B981',
              fontSize: '0.75rem',
              fontWeight: 700
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }}></span>
              API v1.2.0 • Active
            </div>
          </div>
        </header>

        {/* Outlet Page Content */}
        <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          <Outlet context={{ activeEnv }} />
        </main>
      </div>
    </div>
  );
};

export default DeveloperLayout;
