import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolNotifications } from '../../context/SchoolNotificationContext';

const PortalToastContainer = () => {
  const { toasts, dismissToast, removeNotification } = useSchoolNotifications();
  const navigate = useNavigate();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '72px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '360px',
      width: 'calc(100vw - 40px)',
      pointerEvents: 'none'
    }}>
      {toasts.map((toast) => {
        const getBorderColor = () => {
          if (toast.severity === 'urgent') return '#EF4444';
          if (toast.severity === 'success') return '#10B981';
          if (toast.severity === 'warning') return '#F59E0B';
          return '#2563EB';
        };

        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              background: '#FFFFFF',
              border: `1px solid #E4E4E7`,
              borderLeft: `4px solid ${getBorderColor()}`,
              borderRadius: '14px',
              padding: '0.95rem 1.15rem',
              color: '#09090b',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              animation: 'slideInRight 0.25s ease forwards'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                background: '#EFF6FF',
                color: '#2563EB'
              }}>
                {toast.category || 'Alert'}
              </span>

              <button
                onClick={() => dismissToast(toast.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#A1A1AA',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '2px 4px'
                }}
                title="Dismiss"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#09090b', lineHeight: 1.3 }}>
              {toast.title}
            </div>

            {toast.message && (
              <div style={{ fontSize: '0.78rem', color: '#71717a', lineHeight: 1.4 }}>
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

export default PortalToastContainer;
