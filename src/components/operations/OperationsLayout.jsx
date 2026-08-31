import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { usePlatformNotifications } from '../../context/PlatformNotificationContext';

const OperationsLayout = () => {
  const location = useLocation();
  const { categoryCounts } = usePlatformNotifications();

  const navSections = [
    {
      title: 'OVERVIEW & METRICS',
      items: [
        { to: '/platform/operations', icon: 'fa-gauge-high', label: 'Dashboard', end: true, badge: categoryCounts?.dashboard, badgeColor: '#F59E0B' },
        { to: '/platform/operations/analytics', icon: 'fa-chart-pie', label: 'Analytics & Insights' },
      ]
    },
    {
      title: 'INTELLIGENCE & PUBLISHING',
      items: [
        { to: '/platform/operations/ges-radar', icon: 'fa-satellite-dish', label: 'GES & Education Radar', badge: categoryCounts?.radar, badgeColor: '#0891B2' },
        { to: '/platform/operations/broadcasts', icon: 'fa-bullhorn', label: 'Broadcasts & Alerts' },
        { to: '/platform/operations/blog', icon: 'fa-newspaper', label: 'Blog & Manuals' },
      ]
    },
    {
      title: 'SCHOOL OVERSIGHT',
      items: [
        { to: '/platform/operations/schools', icon: 'fa-school-flag', label: 'Schools Directory', badge: categoryCounts?.schools, badgeColor: '#3B82F6' },
        { to: '/platform/operations/calendar', icon: 'fa-calendar-alt', label: 'Academic Calendar' },
        { to: '/platform/operations/interventions', icon: 'fa-user-shield', label: 'Interventions & Audit' },
      ]
    },
    {
      title: 'FINANCE & CLIENT SERVICES',
      items: [
        { to: '/platform/operations/support', icon: 'fa-headset', label: 'Support Center', badge: categoryCounts?.support, badgeColor: '#EF4444' },
        { to: '/platform/operations/subscriptions', icon: 'fa-receipt', label: 'Billing & Transactions', badge: categoryCounts?.billing, badgeColor: '#10B981' },
        { to: '/platform/operations/referrals', icon: 'fa-gift', label: 'Referrals & Rewards' },
      ]
    }
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
        <nav style={{ flex: 1, padding: '1rem 0.85rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {navSections.map((section, sIdx) => (
            <div key={sIdx}>
              <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
                {section.title}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {section.items.map(item => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '9px',
                        color: isActive ? '#FFFFFF' : '#A1A1AA',
                        background: isActive ? '#2563eb' : 'transparent',
                        fontWeight: isActive ? 800 : 600,
                        fontSize: '0.86rem',
                        textDecoration: 'none',
                        boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      })}
                    >
                      {({ isActive }) => (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className={`fas ${item.icon}`} style={{ width: '16px', textAlign: 'center', color: isActive ? '#FFFFFF' : '#71717a' }}></i>
                            <span>{item.label}</span>
                          </div>

                          {/* Dynamic Notification Badge */}
                          {item.badge > 0 && (
                            <span style={{
                              background: isActive ? '#FFFFFF' : (item.badgeColor || '#EF4444'),
                              color: isActive ? '#2563eb' : '#FFFFFF',
                              fontSize: '0.68rem',
                              fontWeight: 900,
                              padding: '0.1rem 0.45rem',
                              borderRadius: '999px',
                              lineHeight: 1,
                              boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                            }}>
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
