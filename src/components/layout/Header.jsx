import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';

const Header = ({ title, onMenuClick }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Fetch school info to display logo
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null,
    [user?.schoolId]
  );

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      if (location.pathname.startsWith('/parent')) {
        navigate('/parent/dashboard');
      } else {
        navigate('/');
      }
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Hamburger - shows on mobile via CSS */}
        <button className="hamburger-btn" onClick={onMenuClick} aria-label="Toggle menu">
          <i className="fas fa-bars"></i>
        </button>

        {/* Back Button - modern, premium, micro-animated */}
        {location.pathname !== '/' && location.pathname !== '/parent/dashboard' && (
          <button 
            className="back-btn" 
            onClick={handleBack} 
            title="Go Back"
            aria-label="Go Back"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
        )}

        {/* School Logo */}
        <div 
          className="header-school-logo"
          onClick={() => navigate('/')}
          title="Go to Dashboard"
        >
          {schoolInfo?.logoUrl
            ? <img src={schoolInfo.logoUrl} alt="logo" />
            : <i className="fas fa-school" />
          }
        </div>

        {/* Title and School Name */}
        <div className="header-title-container" onClick={() => navigate('/')} title="Go to Dashboard">
          <h1 className="header-title">{title}</h1>
          {schoolInfo?.name && (
            <span className="header-school-name">
              {schoolInfo.name}
            </span>
          )}
        </div>
      </div>

      <div className="header-right">
        {/* Online/Offline indicator */}
        <div className={`header-status-badge ${isOnline ? 'online' : 'offline'}`}>
          <i className="fas fa-circle status-dot"></i>
          <span className="hide-mobile">{isOnline ? 'Online' : 'Offline Mode'}</span>
          <span className="show-mobile">
            <i className={`fas ${isOnline ? 'fa-wifi' : 'fa-wifi-slash'}`}></i>
          </span>
        </div>

        {/* User chip */}
        <div className="header-user-chip">
          <div className="user-avatar">
            <i className="fas fa-user"></i>
          </div>
          <span className="user-name hide-mobile">
            {user?.fullName?.split(' ')[0] || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
