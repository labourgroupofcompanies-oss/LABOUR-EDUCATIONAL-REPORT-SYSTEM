import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'super_admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
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

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Logo */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', minWidth: '40px', background: 'var(--accent)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-graduation-cap" style={{ color: 'white', fontSize: '1.1rem' }}></i>
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'white' }}>Labour Edu</div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: '1px' }}>Report Management</div>
          </div>
        </div>
        {/* Close button (mobile) */}
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: 'rgba(255,255,255,0.6)', borderRadius: 'var(--radius-md)', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          className="hamburger-btn"
          style2={{ display: 'flex' }}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      {/* Nav Links */}
      <nav style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        {/* Role badge */}
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
