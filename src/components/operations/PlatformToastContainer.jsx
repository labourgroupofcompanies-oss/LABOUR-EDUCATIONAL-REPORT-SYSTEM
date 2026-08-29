import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformNotifications } from '../../context/PlatformNotificationContext';

const PlatformToastContainer = () => {
  const { toasts, dismissToast, removeNotification } = usePlatformNotifications();
  const navigate = useNavigate();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '72px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '380px',
      width: 'calc(100vw - 48px)',
      pointerEvents: 'none'
    }}>
      {toasts.map((toast) => {
        const getBorderColor = () => {
          if (toast.severity === 'urgent') return '#EF4444';
          if (toast.severity === 'success') return '#10B981';
          if (toast.severity === 'warning') return '#F59E0B';
          return '#3B82F6';
        };

        const getBadgeBg = () => {
          if (toast.severity === 'urgent') return 'rgba(239, 68, 68, 0.2)';
          if (toast.severity === 'success') return 'rgba(16, 185, 129, 0.2)';
          if (toast.severity === 'warning') return 'rgba(245, 158, 11, 0.2)';
          return 'rgba(59, 130, 246, 0.2)';
        };

        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(18, 18, 22, 0.96)',
              backdropFilter: 'blur(16px)',
              border: `1px solid ${getBorderColor()}`,
              borderLeft: `4px solid ${getBorderColor()}`,
              borderRadius: '14px',
              padding: '1rem 1.15rem',
              color: '#FFFFFF',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(37, 99, 235, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              animation: 'slideInRight 0.25s ease forwards'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '999px',
                  background: getBadgeBg(),
                  color: getBorderColor()
                }}>
                  {toast.category}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#A1A1AA' }}>
                  Just now
                </span>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '2px 4px'
                }}
                title="Dismiss"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FAFAFA', lineHeight: 1.3 }}>
              {toast.title}
            </div>

            {toast.message && (
              <div style={{ fontSize: '0.8rem', color: '#D4D4D8', lineHeight: 1.4 }}>
                {toast.message}
              </div>
            )}

            {toast.actionUrl && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  onClick={() => {
                    removeNotification(toast.id);
                    dismissToast(toast.id);
                    navigate(toast.actionUrl);
                  }}
                  style={{
                    background: '#2563eb',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <span>{toast.actionLabel || 'View'}</span>
                  <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PlatformToastContainer;
