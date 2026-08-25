import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const OperationsLayout = () => {
  const location = useLocation();

  const opsNavItems = [
    { to: '/platform/operations', icon: 'fa-gauge-high', label: 'Dashboard', end: true },
    { to: '/platform/operations/schools', icon: 'fa-school-flag', label: 'Schools' },
    { to: '/platform/operations/support', icon: 'fa-headset', label: 'Support' },
    { to: '/platform/operations/subscriptions', icon: 'fa-receipt', label: 'Billing & Transactions' },
    { to: '/platform/operations/referrals', icon: 'fa-gift', label: 'Referrals & Rewards' },
    { to: '/platform/operations/calendar', icon: 'fa-calendar-alt', label: 'Academic Calendar' },
    { to: '/platform/operations/blog', icon: 'fa-newspaper', label: 'Blog & Manuals' },
    { to: '/platform/operations/interventions', icon: 'fa-user-shield', label: 'Interventions' },
    { to: '/platform/operations/analytics', icon: 'fa-chart-pie', label: 'Analytics' },
  ];

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: 'calc(100vh - 58px)', background: '#FAFAFA' }}>
      {/* Operations Sidebar */}
      <aside style={{
        width: '260px',
        minWidth: '260px',
        background: '#09090b',
        borderRight: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: '58px',
        height: 'calc(100vh - 58px)',
        zIndex: 40,
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15)'
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '1.35rem 1.25rem', borderBottom: '1px solid #27272a' }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.05rem', color: '#FFFFFF', letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-tower-observation" style={{ color: '#2563eb' }}></i>
            <span>Platform Operations</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#A1A1AA', marginTop: '3px', fontWeight: 600 }}>
            School Oversight &amp; Support Hub
          </div>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '1rem 0.85rem', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem', paddingLeft: '0.5rem' }}>
            Operations Modules
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {opsNavItems.map(item => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '0.7rem 0.9rem',
                    borderRadius: '10px',
                    color: isActive ? '#FFFFFF' : '#A1A1AA',
                    background: isActive ? '#2563eb' : 'transparent',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '0.88rem',
                    textDecoration: 'none',
                    boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
                    transition: 'all 0.2s ease'
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <i className={`fas ${item.icon}`} style={{ width: '18px', textAlign: 'center', color: isActive ? '#FFFFFF' : '#71717a' }}></i>
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main Operations Outlet */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto', minWidth: 0, background: '#FAFAFA' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default OperationsLayout;
