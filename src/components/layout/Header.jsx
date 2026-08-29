import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import subscriptionService from '../../services/subscriptionService';
import TopUpWalletModal from '../subscription/TopUpWalletModal';
import PortalNotificationBell from '../common/PortalNotificationBell';

const Header = ({ title, onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoError, setLogoError] = useState(false);
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  const isAdmin = user?.role === 'super_admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Fetch school info to display logo & school name
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null,
    [user?.schoolId]
  );

  // Reset logo error state whenever the logoUrl changes
  useEffect(() => { setLogoError(false); }, [schoolInfo?.logoUrl]);

  // Real-time synchronization of wallet balance for Headteachers
  useEffect(() => {
    if (!user?.schoolId || !navigator.onLine) return;
    
    // 1. Fresh reconciled wallet balance fetch
    const fetchLatestBalance = async () => {
      try {
        const subInfo = await subscriptionService.getSubscriptionStatus(user.schoolId);
        if (subInfo && subInfo.wallet_balance !== undefined) {
          const newBal = Number(subInfo.wallet_balance || 0);
          const current = await db.schools.get(user.schoolId);
          if (current && (current.wallet_balance !== newBal || current.walletBalance !== newBal)) {
            await db.schools.update(user.schoolId, {
              wallet_balance: newBal,
              walletBalance: newBal
            });
          }
        }
      } catch (err) {
        console.warn('[Header] Failed to fetch latest wallet balance:', err);
      }
    };

    fetchLatestBalance();

    // 2. Realtime Postgres listener for immediate wallet updates (top-ups, billing deductions)
    const channel = supabase
      .channel(`school-wallet-live-${user.schoolId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'report_schools',
          filter: `id=eq.${user.schoolId}`
        },
        async (payload) => {
          if (payload.new && payload.new.wallet_balance !== undefined) {
            const newBal = Number(payload.new.wallet_balance || 0);
            const current = await db.schools.get(user.schoolId);
            if (current) {
              await db.schools.update(user.schoolId, {
                wallet_balance: newBal,
                walletBalance: newBal,
                is_first_term_free: payload.new.is_first_term_free
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.schoolId]);

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
    <header className="app-header" style={{
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid #E4E4E7',
      boxShadow: '0 2px 10px rgba(9, 9, 11, 0.03)',
      padding: '0 1.25rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '64px',
      position: 'sticky',
      top: 0,
      zIndex: 90,
      gap: '0.5rem'
    }}>
      <style>{`
        .header-title-text {
          font-family: Outfit, sans-serif;
          font-size: 1.05rem;
          font-weight: 900;
          color: #09090b;
          margin: 0;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .header-school-name-text {
          font-size: 0.7rem;
          color: #71717a;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }
        @media (max-width: 768px) {
          .app-header {
            padding: 0 0.65rem !important;
            height: 58px !important;
            gap: 0.35rem !important;
          }
          .header-left {
            gap: 0.35rem !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
            overflow: hidden !important;
          }
          .header-school-logo {
            width: 30px !important;
            height: 30px !important;
            border-radius: 8px !important;
            display: flex !important;
          }
          .header-title-container {
            min-width: 0 !important;
            overflow: hidden !important;
          }
          .header-title-text {
            font-size: 0.85rem !important;
          }
          .header-school-name-text {
            font-size: 0.62rem !important;
          }
          .header-right {
            gap: 0.35rem !important;
            flex-shrink: 0 !important;
          }
          .header-wallet-badge {
            padding: 0.3rem 0.55rem !important;
            font-size: 0.72rem !important;
            gap: 4px !important;
          }
          .header-status-badge-compact {
            padding: 0.3rem !important;
            width: 28px !important;
            height: 28px !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .header-guide-btn {
            padding: 0.3rem 0.55rem !important;
            font-size: 0.72rem !important;
            gap: 4px !important;
          }
          .header-logout-btn {
            width: 30px !important;
            height: 30px !important;
          }
        }
        @media (max-width: 420px) {
          .header-guide-text {
            display: none !important;
          }
          .header-guide-btn {
            width: 30px !important;
            height: 30px !important;
            border-radius: 50% !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
        }
      `}</style>
      
      {/* LEFT SECTION: Branding & Title */}
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0, minWidth: 0 }}>
        {/* Hamburger - Mobile */}
        <button
          className="hamburger-btn"
          onClick={onMenuClick}
          aria-label="Toggle menu"
          style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#18181b', cursor: 'pointer', padding: '0.2rem' }}
        >
          <i className="fas fa-bars"></i>
        </button>

        {/* Back Button */}
        {location.pathname !== '/' && location.pathname !== '/parent/dashboard' && (
          <button 
            className="back-btn" 
            onClick={handleBack} 
            title="Go Back"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#FAFAFA',
              border: '1.5px solid #E4E4E7',
              color: '#18181b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.2s ease'
            }}
          >
            <i className="fas fa-arrow-left" style={{ fontSize: '0.82rem' }}></i>
          </button>
        )}

        {/* School Logo */}
        <div 
          className="header-school-logo"
          onClick={() => navigate('/')}
          title="Go to Dashboard"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1.5px solid rgba(37, 99, 235, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            overflow: 'hidden',
            flexShrink: 0
          }}
        >
          {schoolInfo?.logoUrl && !logoError
            ? <img
                src={schoolInfo.logoUrl}
                alt="School Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={() => setLogoError(true)}
              />
            : <i className="fas fa-school" style={{ color: '#2563eb', fontSize: '0.95rem' }} />
          }
        </div>

        {/* Title and School Name */}
        <div className="header-title-container" onClick={() => navigate('/')} style={{ cursor: 'pointer', minWidth: 0, overflow: 'hidden' }}>
          <h1 className="header-title-text">
            {title}
          </h1>
          {schoolInfo?.name && (
            <span className="header-school-name-text">
              {schoolInfo.name}
            </span>
          )}
        </div>
      </div>

      {/* RIGHT SECTION: Quick Actions, Connection & User Profile */}
      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        
        {/* Live Wallet Balance Badge for Admins */}
        {isAdmin && (
          <button
            onClick={() => setShowTopUpModal(true)}
            className="header-wallet-badge"
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '999px',
              background: '#F0FDF4',
              border: '1.5px solid #BBF7D0',
              color: '#15803D',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              flexShrink: 0
            }}
            title="School Wallet Balance — Tap to manage or top up"
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#16A34A'; e.currentTarget.style.background = '#DCFCE7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#BBF7D0'; e.currentTarget.style.background = '#F0FDF4'; }}
          >
            <i className="fas fa-wallet" style={{ fontSize: '0.78rem', color: '#16A34A' }}></i>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              GH₵ {Number(schoolInfo?.wallet_balance ?? schoolInfo?.walletBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="hide-mobile" style={{ fontSize: '0.62rem', background: '#DCFCE7', padding: '1px 5px', borderRadius: '4px', color: '#15803D', fontWeight: 800 }}>
              Top Up
            </span>
          </button>
        )}

        {/* Online/Offline Status Indicator */}
        <div 
          className={`header-status-badge-compact ${isOnline ? 'online' : 'offline'}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '0.35rem 0.65rem',
            borderRadius: '999px',
            background: isOnline ? '#ECFDF5' : '#FFFBEB',
            border: `1.5px solid ${isOnline ? '#A7F3D0' : '#FDE68A'}`,
            color: isOnline ? '#10B981' : '#F59E0B',
            flexShrink: 0
          }}
          title={isOnline ? 'System Online (Sync Active)' : 'System Offline (Local Cache Active)'}
        >
          <i className="fas fa-circle" style={{ fontSize: '0.42rem', color: isOnline ? '#10B981' : '#F59E0B' }}></i>
          <span className="hide-mobile">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Portal Workflow Guide Trigger Button */}
        <button
          type="button"
          className="header-guide-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('open-portal-guide'))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: '#09090b',
            color: 'white',
            padding: '0.38rem 0.75rem',
            borderRadius: '999px',
            border: '1.5px solid #27272a',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 800,
            boxShadow: '0 2px 8px rgba(9, 9, 11, 0.2)',
            transition: 'all 0.2s ease',
            flexShrink: 0
          }}
          title="Open Portal Workflow Guide"
        >
          <i className="fas fa-compass" style={{ fontSize: '0.8rem', color: '#2563eb' }}></i>
          <span className="header-guide-text">Guide</span>
        </button>

        {/* Real-time Portal Notifications for Headteachers and Teachers */}
        <PortalNotificationBell />

        {/* Dedicated Sign Out / Logout Button (Icon Only) */}
        <button
          onClick={handleLogout}
          className="header-logout-btn"
          title="Sign Out"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: '#FEF2F2',
            border: '1.5px solid #FECACA',
            color: '#EF4444',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            flexShrink: 0
          }}
        >
          <i className="fas fa-sign-out-alt" style={{ fontSize: '0.85rem' }}></i>
        </button>

      </div>

      {showTopUpModal && (
        <TopUpWalletModal
          schoolId={user?.schoolId}
          currentBalance={Number(schoolInfo?.wallet_balance ?? schoolInfo?.walletBalance ?? 0)}
          onClose={() => setShowTopUpModal(false)}
          onSuccess={() => setShowTopUpModal(false)}
        />
      )}
    </header>
  );
};

export default Header;
