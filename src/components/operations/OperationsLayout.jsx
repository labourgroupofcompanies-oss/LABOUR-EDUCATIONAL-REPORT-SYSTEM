import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { usePlatformNotifications } from '../../context/PlatformNotificationContext';

const OperationsLayout = () => {
  const location = useLocation();
  const { categoryCounts } = usePlatformNotifications();

  const navSections = [
    {
      title: 'CORE',
      items: [
        { to: '/platform/operations', icon: 'fa-gauge-high', label: 'Dashboard', iconColor: '#F59E0B', end: true, badge: categoryCounts?.dashboard, badgeColor: '#F59E0B' },
        { to: '/platform/operations/analytics', icon: 'fa-chart-pie', label: 'Analytics', iconColor: '#8B5CF6' },
      ]
    },
    {
      title: 'RADAR & PUBLISHING',
      items: [
        { to: '/platform/operations/ges-radar', icon: 'fa-satellite-dish', label: 'GES Radar', iconColor: '#06B6D4', badge: categoryCounts?.radar, badgeColor: '#06B6D4' },
        { to: '/platform/operations/broadcasts', icon: 'fa-bullhorn', label: 'Broadcasts', iconColor: '#F97316' },
        { to: '/platform/operations/blog', icon: 'fa-newspaper', label: 'Blog & Docs', iconColor: '#3B82F6' },
      ]
    },
    {
      title: 'ACADEMICS',
      items: [
        { to: '/platform/operations/schools', icon: 'fa-school-flag', label: 'Schools', iconColor: '#10B981', badge: categoryCounts?.schools, badgeColor: '#10B981' },
        { to: '/platform/operations/calendar', icon: 'fa-calendar-alt', label: 'Calendar', iconColor: '#EC4899' },
        { to: '/platform/operations/interventions', icon: 'fa-user-shield', label: 'Interventions', iconColor: '#6366F1' },
      ]
    },
    {
      title: 'SERVICES & FINANCE',
      items: [
        { to: '/platform/operations/support', icon: 'fa-headset', label: 'Support', iconColor: '#EF4444', badge: categoryCounts?.support, badgeColor: '#EF4444' },
        { to: '/platform/operations/subscriptions', icon: 'fa-receipt', label: 'Billing', iconColor: '#14B8A6', badge: categoryCounts?.billing, badgeColor: '#14B8A6' },
        { to: '/platform/operations/referrals', icon: 'fa-gift', label: 'Referrals', iconColor: '#EAB308' },
      ]
    }
  ];

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: 'calc(100vh - 58px)', background: '#FAFAFA' }}>
      {/* Operations Sidebar */}
      <aside style={{
        width: '240px',
        minWidth: '240px',
        background: '#09090b',
        borderRight: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: '58px',
        height: 'calc(100vh - 58px)',
        zIndex: 40,
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.2)'
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '1.15rem 1.25rem', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontSize: '0.88rem',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
          }}>
            <i className="fas fa-tower-observation"></i>
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '0.95rem', color: '#FFFFFF', letterSpacing: '0.01em', lineHeight: 1.2 }}>
              Operations Hub
            </div>
            <div style={{ fontSize: '0.66rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Management Console
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '0.85rem 0.75rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {navSections.map((section, sIdx) => (
            <div key={sIdx}>
              <div style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                color: '#52525b',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '0.35rem',
                paddingLeft: '0.65rem'
              }}>
                {section.title}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {section.items.map(item => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '10px',
                        color: isActive ? '#FFFFFF' : '#A1A1AA',
                        background: isActive ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'transparent',
                        fontWeight: isActive ? 800 : 600,
                        fontSize: '0.84rem',
                        textDecoration: 'none',
                        boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.4)' : 'none',
                        transition: 'all 0.15s ease',
                        position: 'relative'
                      })}
                      onMouseEnter={e => {
                        if (!e.currentTarget.classList.contains('active')) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          e.currentTarget.style.color = '#FFFFFF';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!e.currentTarget.classList.contains('active')) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#A1A1AA';
                        }
                      }}
                    >
                      {({ isActive }) => (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '7px',
                              background: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.75rem',
                              color: isActive ? '#FFFFFF' : item.iconColor
                            }}>
                              <i className={`fas ${item.icon}`}></i>
                            </div>
                            <span style={{ letterSpacing: '0.01em' }}>{item.label}</span>
                          </div>

                          {/* Dynamic Notification Badge */}
                          {item.badge > 0 && (
                            <span style={{
                              background: isActive ? '#FFFFFF' : (item.badgeColor || '#EF4444'),
                              color: isActive ? '#1E40AF' : '#FFFFFF',
                              fontSize: '0.66rem',
                              fontWeight: 900,
                              padding: '0.1rem 0.45rem',
                              borderRadius: '999px',
                              lineHeight: 1,
                              boxShadow: '0 2px 6px rgba(0,0,0,0.35)'
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
