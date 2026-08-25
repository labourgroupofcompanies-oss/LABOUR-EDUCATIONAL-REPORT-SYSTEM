import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { useSyncEngine } from '../../store/SyncEngineProvider';

const MobileNavBar = () => {
  const { user } = useAuth();
  const { pendingCount, isSyncing } = useSyncEngine();

  const isTeacher = user?.role !== 'super_admin';

  const teacherTabs = [
    { to: '/', icon: 'fa-house', label: 'Home', end: true },
    { to: '/scores', icon: 'fa-pen-to-square', label: 'Scores' },
    { to: '/class-remarks', icon: 'fa-clipboard-user', label: 'Remarks' },
    { to: '/settings', icon: 'fa-user-gear', label: 'Settings' },
  ];

  const adminTabs = [
    { to: '/', icon: 'fa-house', label: 'Home', end: true },
    { to: '/learners', icon: 'fa-user-graduate', label: 'Learners' },
    { to: '/all-scores', icon: 'fa-list-check', label: 'All Scores' },
    { to: '/reports', icon: 'fa-file-invoice', label: 'Reports' },
    { to: '/settings', icon: 'fa-user-gear', label: 'Settings' },
  ];

  const tabs = isTeacher ? teacherTabs : adminTabs;

  return (
    <nav className="mobile-bottom-nav">
      {tabs.map((t, idx) => (
        <NavLink
          key={idx}
          to={t.to}
          end={t.end}
          data-tour={`mobile-nav-${t.to.replace('/', '') || 'dashboard'}`}
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <div className="mobile-nav-icon-wrap">
            <i className={`fas ${t.icon}`}></i>
            {t.to === '/scores' && pendingCount > 0 && (
              <span className="mobile-nav-badge">{pendingCount}</span>
            )}
          </div>
          <span className="mobile-nav-label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileNavBar;
