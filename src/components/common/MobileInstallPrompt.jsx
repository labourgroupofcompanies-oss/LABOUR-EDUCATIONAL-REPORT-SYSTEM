import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MobileInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // 1. Check if already installed & running in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
      
      setIsInstalled(isStandaloneMode);
      return isStandaloneMode;
    };

    const standalone = checkStandalone();
    if (standalone) return; // Already installed, do nothing

    // 2. Check if mobile browser
    const ua = (window.navigator.userAgent || '').toLowerCase();
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    const isMobileBrowser = /android|iphone|ipad|ipod|mobile/i.test(ua) || window.innerWidth <= 768;
    
    setIsIOSDevice(isIOS);
    setIsMobile(isMobileBrowser);

    // 3. Check session dismissal
    const dismissedThisSession = sessionStorage.getItem('labour_edu_install_dismissed');
    if (dismissedThisSession === 'true') {
      setIsDismissed(true);
    }

    // 4. Capture native Android / Chromium install prompt
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      setIsInstallable(true);
      console.log('[PWA] beforeinstallprompt captured and ready');
    };

    // 5. Track successful app installation
    const handleAppInstalled = () => {
      console.log('[PWA] Application was successfully installed on the device');
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setShowIOSModal(false);
    };

    // 6. External trigger listener (e.g. from header or settings button)
    const handleManualTrigger = () => {
      setIsDismissed(false);
      if (isIOS) {
        setShowIOSModal(true);
      } else if (deferredPrompt) {
        deferredPrompt.prompt();
      } else {
        // Fallback info if prompt is not ready yet
        setIsInstallable(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('open-pwa-install', handleManualTrigger);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('open-pwa-install', handleManualTrigger);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (isIOSDevice) {
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) {
      // If browser hasn't fired beforeinstallprompt yet, give user guidance
      alert("To install, tap your browser's menu (three dots at top-right) and select 'Install app' or 'Add to Home screen'.");
      return;
    }

    // Show the native browser install prompt
    try {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
        setIsInstalled(true);
      } else {
        console.log('[PWA] User dismissed the install prompt');
      }
      setDeferredPrompt(null);
      setIsInstallable(false);
    } catch (err) {
      console.warn('[PWA] Install prompt error:', err);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setShowIOSModal(false);
    try {
      sessionStorage.setItem('labour_edu_install_dismissed', 'true');
    } catch (_) {}
  };

  // Do not render anything if already installed
  if (isInstalled) return null;

  // Decide if the banner should be visible:
  // Visible if on mobile browser, not dismissed, and either (installable via Chrome) OR (iOS device)
  const shouldShowBanner = isMobile && !isDismissed && (isInstallable || isIOSDevice);

  return (
    <>
      {/* ─── 1. Persistent / Slide-up Mobile Install Banner ─── */}
      <AnimatePresence>
        {shouldShowBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            style={{
              position: 'fixed',
              bottom: '16px',
              left: '12px',
              right: '12px',
              maxWidth: '480px',
              margin: '0 auto',
              zIndex: 99990,
              background: '#09090b',
              border: '1.5px solid #27272a',
              borderRadius: '20px',
              padding: '1rem 1.15rem',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(37, 99, 235, 0.2)',
              color: '#FFFFFF',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {/* Top Glowing Accent Line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '20px',
              right: '20px',
              height: '2px',
              background: 'linear-gradient(90deg, #2563eb 0%, #10b981 100%)',
              borderRadius: '2px'
            }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* App Icon */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src="/app-icon.png"
                  alt="Labour Edu Logo"
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    objectFit: 'contain',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    padding: '2px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
                  }}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/logo.png';
                  }}
                />
              </div>

              {/* Title & Benefits */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    color: '#FFFFFF',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    Install Labour Edu App
                  </div>
                  <span style={{
                    background: 'rgba(37, 99, 235, 0.2)',
                    border: '1px solid rgba(37, 99, 235, 0.4)',
                    color: '#60A5FA',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '6px',
                    letterSpacing: '0.04em'
                  }}>
                    FREE
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#A1A1AA', marginTop: '2px', lineHeight: 1.3 }}>
                  Fast offline access &amp; instant notifications.
                </div>
              </div>

              {/* Dismiss "X" Button */}
              <button
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#71717a',
                  fontSize: '1rem',
                  padding: '6px',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.85rem' }}>
              <button
                onClick={handleInstallClick}
                style={{
                  flex: 1,
                  padding: '0.65rem 1rem',
                  borderRadius: '12px',
                  background: '#2563eb',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                  transition: 'all 0.15s ease'
                }}
              >
                <i className="fas fa-download"></i>
                <span>{isIOSDevice ? 'Install on iPhone' : 'Install App'}</span>
              </button>

              <button
                onClick={handleDismiss}
                style={{
                  padding: '0.65rem 0.95rem',
                  borderRadius: '12px',
                  background: '#18181b',
                  border: '1px solid #27272a',
                  color: '#A1A1AA',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                Later
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 2. iOS Safari Step-by-Step Installation Modal ─── */}
      <AnimatePresence>
        {showIOSModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '12px'
          }}>
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              style={{
                width: '100%',
                maxWidth: '460px',
                background: '#18181b',
                border: '1.5px solid #27272a',
                borderRadius: '24px',
                padding: '1.75rem 1.5rem',
                color: '#FFFFFF',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.8)',
                fontFamily: 'Inter, sans-serif',
                position: 'relative'
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <img
                  src="/app-icon.png"
                  alt="Labour Logo"
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    margin: '0 auto 0.75rem auto',
                    background: '#09090b',
                    border: '1px solid #27272a',
                    padding: '3px'
                  }}
                />
                <h3 style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  margin: '0 0 4px 0'
                }}>
                  Install on iPhone / iPad
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#A1A1AA', margin: 0 }}>
                  Add Labour Edu directly to your home screen for instant full-screen access:
                </p>
              </div>

              {/* Steps Guide */}
              <div style={{
                background: '#09090b',
                border: '1px solid #27272a',
                borderRadius: '16px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'rgba(37, 99, 235, 0.15)',
                    color: '#60A5FA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    flexShrink: 0
                  }}>
                    1
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#E4E4E7', lineHeight: 1.4 }}>
                    Tap the <strong>Share</strong> button <i className="fas fa-arrow-up-from-bracket" style={{ color: '#2563EB', margin: '0 3px' }}></i> at the bottom of Safari.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34D399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    flexShrink: 0
                  }}>
                    2
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#E4E4E7', lineHeight: 1.4 }}>
                    Scroll down and select <strong>"Add to Home Screen"</strong> <i className="fas fa-plus-square" style={{ color: '#10B981', margin: '0 3px' }}></i>.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#FBBF24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    flexShrink: 0
                  }}>
                    3
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#E4E4E7', lineHeight: 1.4 }}>
                    Tap <strong>"Add"</strong> at the top right corner. Done!
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowIOSModal(false)}
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  padding: '0.8rem',
                  borderRadius: '14px',
                  background: '#2563eb',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
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
