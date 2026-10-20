import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SHOW_DURATION_MS  = 15_000;  // visible for 15 seconds
const HIDE_DURATION_MS  = 30 * 60_000; // hidden for 30 minutes

const MobileInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt]   = useState(null);
  const [isInstallable, setIsInstallable]     = useState(false);
  const [isInstalled, setIsInstalled]         = useState(false);
  const [visible, setVisible]                 = useState(false);
  const [isIOSDevice, setIsIOSDevice]         = useState(false);
  const [showIOSModal, setShowIOSModal]       = useState(false);
  const [isChromeBrowser, setIsChromeBrowser] = useState(false);

  const showTimerRef  = useRef(null);
  const hideTimerRef  = useRef(null);

  // ── helpers ──────────────────────────────────────────────────────────────
  const clearTimers = () => {
    if (showTimerRef.current)  clearTimeout(showTimerRef.current);
    if (hideTimerRef.current)  clearTimeout(hideTimerRef.current);
  };

  /** Show the banner, then schedule auto-hide → re-show cycle */
  const startCycle = () => {
    clearTimers();
    setVisible(true);
    // Auto-dismiss after 15 s
    showTimerRef.current = setTimeout(() => {
      setVisible(false);
      // Re-appear after 30 min
      hideTimerRef.current = setTimeout(() => {
        startCycle();
      }, HIDE_DURATION_MS);
    }, SHOW_DURATION_MS);
  };

  /** User tapped "Later" – dismiss immediately, still re-show after 30 min */
  const handleLater = () => {
    clearTimers();
    setVisible(false);
    hideTimerRef.current = setTimeout(() => {
      startCycle();
    }, HIDE_DURATION_MS);
  };

  // ── boot ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Already installed?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches  ||
      window.matchMedia('(display-mode: minimal-ui)').matches  ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://') ||
      localStorage.getItem('labour_edu_pwa_installed') === 'true';

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Browser / device detection
    const ua     = (navigator.userAgent || '').toLowerCase();
    const isIOS  = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    const isChrome = /chrome|chromium|crios/i.test(ua);
    setIsIOSDevice(isIOS);
    setIsChromeBrowser(isChrome);

    // 3. Native install prompt (Chrome / Chromium desktop & Android)
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    // 4. Confirm installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setShowIOSModal(false);
      clearTimers();
      setVisible(false);
      try { localStorage.setItem('labour_edu_pwa_installed', 'true'); } catch (_) {}
    };

    // 5. Standalone-mode change (covers some edge cases)
    const mql = window.matchMedia('(display-mode: standalone)');
    const handleMql = (e) => {
      if (e.matches) handleAppInstalled();
    };
    if (mql.addEventListener)  mql.addEventListener('change', handleMql);
    else if (mql.addListener)  mql.addListener(handleMql);

    // 6. External trigger (e.g. header install button)
    const handleManualTrigger = () => {
      clearTimers();
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled',        handleAppInstalled);
    window.addEventListener('open-pwa-install',    handleManualTrigger);

    // 7. Start the show / hide cycle for all Chrome / iOS users
    if (isChrome || isIOS) {
      startCycle();
    }

    return () => {
      clearTimers();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled',        handleAppInstalled);
      window.removeEventListener('open-pwa-install',    handleManualTrigger);
      if (mql.removeEventListener)  mql.removeEventListener('change', handleMql);
      else if (mql.removeListener)  mql.removeListener(handleMql);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── install action ────────────────────────────────────────────────────────
  const handleInstall = async () => {
    if (isIOSDevice) {
      setShowIOSModal(true);
      return;
    }
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          clearTimers();
          setVisible(false);
          try { localStorage.setItem('labour_edu_pwa_installed', 'true'); } catch (_) {}
        }
        setDeferredPrompt(null);
        setIsInstallable(false);
      } catch (err) {
        console.warn('[PWA] Install error:', err);
      }
      return;
    }
    // Fallback guidance
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    if (isMobile) {
      alert("To install:\n1. Tap the three-dot menu (⋮)\n2. Select 'Install app' or 'Add to Home screen'.");
    } else {
      alert("To install:\n1. Click the install icon in Chrome's address bar (top-right)\nOR\n2. Chrome menu (⋮) → 'Save and share' → 'Install Labour Edu'.");
    }
  };

  if (isInstalled) return null;

  return (
    <>
      {/* ─── Slide-up Banner ─── */}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="install-banner"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{   y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              position:     'fixed',
              bottom:       '16px',
              left:         '12px',
              right:        '12px',
              maxWidth:     '420px',
              margin:       '0 auto',
              zIndex:       99990,
              background:   '#09090B',
              border:       '1px solid #27272A',
              borderRadius: '14px',
              padding:      '0.9rem 1rem',
              boxShadow:    '0 16px 40px rgba(0,0,0,0.55)',
              color:        '#FFFFFF',
              fontFamily:   'Inter, system-ui, sans-serif',
              display:      'flex',
              alignItems:   'center',
              gap:          '12px',
            }}
          >
            {/* App icon */}
            <img
              src="/app-icon.png"
              alt="Labour Edu"
              style={{
                width:        '40px',
                height:       '40px',
                borderRadius: '10px',
                objectFit:    'contain',
                background:   '#18181B',
                border:       '1px solid #3F3F46',
                padding:      '2px',
                flexShrink:   0,
              }}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.png'; }}
            />

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight:   700,
                fontSize:     '0.88rem',
                color:        '#FFFFFF',
                whiteSpace:   'nowrap',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
              }}>
                Install Labour Edu App
              </div>
            </div>

            {/* Install button */}
            <button
              onClick={handleInstall}
              style={{
                padding:      '0.45rem 0.9rem',
                borderRadius: '8px',
                background:   '#FFFFFF',
                border:       'none',
                color:        '#09090B',
                fontWeight:   700,
                fontSize:     '0.8rem',
                cursor:       'pointer',
                flexShrink:   0,
                whiteSpace:   'nowrap',
              }}
            >
              Install
            </button>

            {/* Later / close */}
            <button
              onClick={handleLater}
              aria-label="Dismiss"
              style={{
                background:  'none',
                border:      'none',
                color:       '#71717A',
                fontSize:    '1rem',
                padding:     '4px 6px',
                cursor:      'pointer',
                flexShrink:  0,
                lineHeight:  1,
              }}
            >
              <i className="fas fa-xmark" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── iOS Safari Step-by-Step Modal ─── */}
      <AnimatePresence>
        {showIOSModal && (
          <div style={{
            position:        'fixed',
            inset:           0,
            zIndex:          100000,
            background:      'rgba(0,0,0,0.72)',
            backdropFilter:  'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display:         'flex',
            alignItems:      'flex-end',
            justifyContent:  'center',
            padding:         '12px',
          }}>
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0,   opacity: 1 }}
              exit={{   y: 200, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              style={{
                width:        '100%',
                maxWidth:     '440px',
                background:   '#09090B',
                border:       '1.5px solid #27272A',
                borderRadius: '20px',
                padding:      '1.6rem 1.4rem',
                color:        '#FFFFFF',
                boxShadow:    '0 24px 50px rgba(0,0,0,0.8)',
                fontFamily:   'Inter, system-ui, sans-serif',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
                <img
                  src="/app-icon.png"
                  alt="Labour Edu"
                  style={{
                    width: '46px', height: '46px',
                    borderRadius: '12px',
                    margin: '0 auto 0.7rem',
                    background: '#18181B',
                    border: '1px solid #27272A',
                    padding: '2px',
                    display: 'block',
                  }}
                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.png'; }}
                />
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>
                  Install Labour Edu App
                </div>
                <div style={{ fontSize: '0.78rem', color: '#A1A1AA' }}>
                  Add to your home screen via Safari:
                </div>
              </div>

              <div style={{
                background: '#18181B', border: '1px solid #27272A',
                borderRadius: '12px', padding: '1rem',
                display: 'flex', flexDirection: 'column', gap: '12px',
              }}>
                {[
                  <>Tap the <strong>Share</strong> button <i className="fas fa-arrow-up-from-bracket" style={{ margin: '0 3px' }} /> at the bottom of Safari.</>,
                  <>Select <strong>"Add to Home Screen"</strong> <i className="fas fa-plus-square" style={{ margin: '0 3px' }} />.</>,
                  <>Tap <strong>"Add"</strong> in the top-right corner. Done!</>,
                ].map((text, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '7px',
                      background: '#27272A', color: '#FFF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: '0.83rem', color: '#E4E4E7', lineHeight: 1.4 }}>
                      {text}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowIOSModal(false)}
                style={{
                  width: '100%', marginTop: '1.1rem',
                  padding: '0.7rem', borderRadius: '10px',
                  background: '#FFFFFF', border: 'none',
                  color: '#09090B', fontWeight: 700,
                  fontSize: '0.88rem', cursor: 'pointer',
                }}
              >
                Got It
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default MobileInstallPrompt;
