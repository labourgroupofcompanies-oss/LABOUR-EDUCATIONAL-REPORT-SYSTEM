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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
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
          onClick={() => navigate('/')}
          style={{
            width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
            overflow: 'hidden', border: '2px solid var(--border)',
            background: 'var(--background)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer'
          }}
          title="Go to Dashboard"
        >
          {schoolInfo?.logoUrl
            ? <img src={schoolInfo.logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <i className="fas fa-school" style={{ fontSize: '0.8rem', color: 'var(--accent)' }} />
          }
        </div>

        <div onClick={() => navigate('/')} style={{ cursor: 'pointer' }} title="Go to Dashboard">
          <h1 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700, lineHeight: 1 }}>{title}</h1>
          {schoolInfo?.name && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {schoolInfo.name}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Online/Offline indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: isOnline ? 'var(--success)' : 'var(--warning)', background: isOnline ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', padding: '0.35rem 0.75rem', borderRadius: '999px', border: `1px solid ${isOnline ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
          <i className={`fas fa-circle`} style={{ fontSize: '0.45rem' }}></i>
          <span className="hide-mobile">{isOnline ? 'Online' : 'Offline Mode'}</span>
          <span style={{ display: 'none' }} className="show-mobile">
            <i className={`fas ${isOnline ? 'fa-wifi' : 'fa-wifi-slash'}`}></i>
          </span>
        </div>

        {/* User chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--background)', padding: '0.4rem 0.75rem', borderRadius: '999px', border: '1px solid var(--border)' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-user" style={{ color: 'white', fontSize: '0.7rem' }}></i>
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }} className="hide-mobile">
            {user?.fullName?.split(' ')[0] || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
