import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import broadcastService from '../../services/broadcastService';

const PlatformBroadcastBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeBroadcast, setActiveBroadcast] = useState(null);

  const fetchActive = () => {
    const role = user?.role === 'super_admin' ? 'headteacher' : (user?.role || 'all');
    const list = broadcastService.getActiveBroadcastsForRole(role);
    if (list && list.length > 0) {
      setActiveBroadcast(list[0]);
    } else {
      setActiveBroadcast(null);
    }
  };

  useEffect(() => {
    fetchActive();

    const handleUpdate = () => {
      fetchActive();
    };

    window.addEventListener('platform-broadcast-updated', handleUpdate);
    return () => {
      window.removeEventListener('platform-broadcast-updated', handleUpdate);
    };
  }, [user?.role]);

  if (!activeBroadcast || !activeBroadcast.bannerEnabled) return null;

  const getStyle = () => {
    switch (activeBroadcast.severity) {
      case 'urgent':
        return { bg: '#DC2626', border: '#B91C1C', text: '#FFFFFF', icon: 'fa-triangle-exclamation' };
      case 'warning':
        return { bg: '#D97706', border: '#B45309', text: '#FFFFFF', icon: 'fa-bullhorn' };
      case 'success':
        return { bg: '#059669', border: '#047857', text: '#FFFFFF', icon: 'fa-circle-check' };
      case 'info': default:
        return { bg: '#2563EB', border: '#1D4ED8', text: '#FFFFFF', icon: 'fa-circle-info' };
    }
  };

  const st = getStyle();

  const handleDismiss = () => {
    broadcastService.dismissBroadcast(activeBroadcast.id);
    setActiveBroadcast(null);
  };

  return (
    <div style={{
      background: st.bg,
      color: st.text,
      padding: '0.65rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      fontSize: '0.84rem',
      fontWeight: 600,
      borderBottom: `1px solid ${st.border}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      position: 'relative',
      zIndex: 85
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <i className={`fas ${st.icon}`} style={{ fontSize: '0.95rem', flexShrink: 0 }}></i>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <strong>{activeBroadcast.title}:</strong> {activeBroadcast.content}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {activeBroadcast.actionUrl && (
          <button
            onClick={() => navigate(activeBroadcast.actionUrl)}
            style={{
              background: '#FFFFFF',
              color: '#09090b',
              border: 'none',
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>{activeBroadcast.actionLabel || 'View'}</span>
            <i className="fas fa-arrow-right" style={{ fontSize: '0.65rem' }}></i>
          </button>
        )}

        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            fontSize: '0.9rem',
            padding: '2px 4px',
            opacity: 0.85
          }}
          title="Dismiss Banner"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
    </div>
  );
};

export default PlatformBroadcastBanner;
