import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { motion, AnimatePresence } from 'framer-motion';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log(`Service Worker registered at: ${swUrl}`);
      if (r) {
        // Automatically check for updates every 15 minutes
        setInterval(() => {
          console.log('[PWA] Checking for service worker updates...');
          r.update().catch(err => console.warn('Failed to check for PWA update:', err));
        }, 15 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('Service Worker registration failed:', error);
    },
  });

  // Auto-activate and override old software version instantly when new update is uploaded
  React.useEffect(() => {
    if (needRefresh) {
      console.log('[PWA] New version detected! Auto-updating and reloading clients...');
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const hasPrompt = offlineReady || needRefresh;

  return (
    <AnimatePresence>
      {hasPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{
            position: 'fixed',
            right: '24px',
            bottom: '24px',
            zIndex: 99999,
            width: '380px',
            maxWidth: 'calc(100vw - 48px)',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            padding: '1.25rem',
            fontFamily: "'Inter', sans-serif",
            color: '#f8fafc',
            overflow: 'hidden',
          }}
        >
          {/* Subtle top ambient glowing border */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: needRefresh
                ? 'linear-gradient(90deg, #0d9488 0%, #10b981 100%)'
                : 'linear-gradient(90deg, #3b82f6 0%, #0d9488 100%)',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: needRefresh
                  ? 'rgba(13, 148, 136, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
                color: needRefresh ? '#0d9488' : '#3b82f6',
                flexShrink: 0,
                border: needRefresh ? '1px solid rgba(13, 148, 136, 0.2)' : '1px solid rgba(59, 130, 246, 0.2)',
              }}
            >
              {needRefresh ? (
                <i className="fa-solid fa-cloud-arrow-down" style={{ fontSize: '1.25rem' }}></i>
              ) : (
                <i className="fa-solid fa-circle-check" style={{ fontSize: '1.25rem' }}></i>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                {needRefresh ? 'Update Available!' : 'App Ready Offline'}
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: '#94a3b8', lineHeight: 1.4, fontWeight: 500 }}>
                {needRefresh
                  ? 'A new, improved version of the Labour Edu Report System is available. Update now to load new features.'
                  : 'Labour Edu is now fully cached and optimized to work with or without an active internet connection.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1.25rem' }}>
            <button
              onClick={close}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              Close
            </button>

            {needRefresh && (
              <button
                onClick={() => updateServiceWorker(true)}
                style={{
                  background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '6px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(13, 148, 136, 0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(13, 148, 136, 0.25)';
                }}
              >
                Update &amp; Restart
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ReloadPrompt;
