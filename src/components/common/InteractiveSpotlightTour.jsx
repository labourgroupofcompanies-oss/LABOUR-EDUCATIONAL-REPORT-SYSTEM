import React, { useState, useEffect, useCallback, useRef } from 'react';

const InteractiveSpotlightTour = ({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onGo
}) => {
  const [targetRect, setTargetRect] = useState(null);
  const pollIntervalRef = useRef(null);

  // Measure target element position & scroll into view
  const updateTargetPosition = useCallback(() => {
    if (!isActive || !currentStep) return false;

    // Mobile check: open sidebar drawer if target is in sidebar
    const isMobile = window.innerWidth <= 768;
    if (isMobile && currentStep.target && currentStep.target.includes('sidebar-')) {
      const sidebarEl = document.querySelector('.sidebar');
      if (sidebarEl && !sidebarEl.classList.contains('open')) {
        sidebarEl.classList.add('open');
      }
    }

    let element = null;

    // Try primary targets
    if (currentStep.target) {
      const selectors = currentStep.target.split(',').map(s => s.trim());
      for (const sel of selectors) {
        try {
          const found = document.querySelector(sel);
          if (found && found.offsetWidth > 0 && found.offsetHeight > 0) {
            element = found;
            break;
          }
        } catch (e) {
          // Ignore invalid selector queries
        }
      }
    }

    // Try fallback targets if primary not found
    if (!element && currentStep.fallback) {
      const fallbacks = currentStep.fallback.split(',').map(s => s.trim());
      for (const f of fallbacks) {
        try {
          const foundFallback = document.querySelector(f);
          if (foundFallback) {
            element = foundFallback;
            break;
          }
        } catch (e) {
          // Ignore invalid selector queries
        }
      }
    }

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      return true;
    } else {
      // Fallback screen position if target element is not in DOM
      setTargetRect({
        top: 80,
        left: 16,
        width: Math.min(260, window.innerWidth - 32),
        height: 50,
      });
      return false;
    }
  }, [isActive, currentStep]);

  // Target polling engine: polls DOM when step changes
  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    let attempts = 0;
    const maxAttempts = 20;
    pollIntervalRef.current = setInterval(() => {
      attempts++;
      const found = updateTargetPosition();
      if (found || attempts >= maxAttempts) {
        clearInterval(pollIntervalRef.current);
      }
    }, 100);

    const handleWindowEvents = () => updateTargetPosition();
    window.addEventListener('resize', handleWindowEvents);
    window.addEventListener('scroll', handleWindowEvents, true);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      window.removeEventListener('resize', handleWindowEvents);
      window.removeEventListener('scroll', handleWindowEvents, true);
    };
  }, [isActive, currentStepIndex, currentStep, updateTargetPosition]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onSkip?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onSkip]);

  if (!isActive || !currentStep || !targetRect) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  // Popover positioning calculations
  const isMobile = window.innerWidth <= 768;
  const popoverWidth = Math.min(340, window.innerWidth - 24);

  let popoverLeft = isMobile
    ? Math.max(12, (window.innerWidth / 2) - (popoverWidth / 2))
    : Math.max(16, targetRect.left + targetRect.width + 16);

  if (popoverLeft + popoverWidth > window.innerWidth - 12) {
    popoverLeft = window.innerWidth - popoverWidth - 12;
  }

  let popoverTop = isMobile
    ? Math.min(window.innerHeight - 260, Math.max(16, targetRect.top + targetRect.height + 12))
    : Math.max(16, Math.min(window.innerHeight - 250, targetRect.top));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
      
      {/* Dark Dim Backdrop with Cutout Effect */}
      <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'auto' }}>
        <defs>
          <mask id="portal-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={Math.max(0, targetRect.left - 6)}
              y={Math.max(0, targetRect.top - 6)}
              width={targetRect.width + 12}
              height={targetRect.height + 12}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.78)"
          mask="url(#portal-spotlight-mask)"
        />
      </svg>

      {/* Animated Glowing Spotlight Outline Frame */}
      <div
        style={{
          position: 'fixed',
          top: targetRect.top - 6,
          left: targetRect.left - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
          borderRadius: '12px',
          border: '2.5px solid #2563eb',
          boxShadow: '0 0 25px rgba(37, 99, 235, 0.75), inset 0 0 15px rgba(37, 99, 235, 0.3)',
          pointerEvents: 'none',
          transition: 'all 0.3s ease-out',
        }}
      />

      {/* Glassmorphic Popover Tooltip Card */}
      <div
        style={{
          position: 'fixed',
          top: popoverTop,
          left: popoverLeft,
          width: `${popoverWidth}px`,
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '18px',
          padding: '1.2rem',
          color: '#FAFAFA',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px rgba(37, 99, 235, 0.15)',
          zIndex: 10001,
          pointerEvents: 'auto',
          transition: 'all 0.25s ease-out',
        }}
      >
        {/* Header Badge & Skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <span style={{
            background: 'rgba(37, 99, 235, 0.15)',
            color: '#2563eb',
            border: '1px solid rgba(37, 99, 235, 0.3)',
            padding: '0.2rem 0.6rem',
            borderRadius: '20px',
            fontSize: '0.72rem',
            fontWeight: 900
          }}>
            Step {currentStepIndex + 1} of {totalSteps}
          </span>

          <button
            onClick={onSkip}
            style={{ background: 'transparent', border: 'none', color: '#71717a', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}
          >
            Skip Tour ✕
          </button>
        </div>

        {/* Title & Body */}
        <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 800, margin: '0 0 0.35rem', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {currentStep.icon && <i className={`fas ${currentStep.icon}`} style={{ color: currentStep.color || '#2563eb', fontSize: '0.95rem' }}></i>}
          <span>{currentStep.title}</span>
        </h4>
        <p style={{ fontSize: '0.8rem', color: '#A1A1AA', margin: '0 0 1rem', lineHeight: '1.45' }}>
          {currentStep.description}
        </p>

        {/* Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #27272a', paddingTop: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
          <button
            onClick={onPrev}
            disabled={isFirstStep}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '8px',
              background: '#18181b',
              border: '1px solid #27272a',
              color: isFirstStep ? '#71717a' : '#A1A1AA',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: isFirstStep ? 'not-allowed' : 'pointer'
            }}
          >
            ← Back
          </button>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {/* Go Action Button */}
            {currentStep.route && (
              <button
                onClick={onGo}
                style={{
                  padding: '0.42rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(37, 99, 235, 0.15)',
                  border: '1px solid rgba(37, 99, 235, 0.4)',
                  color: '#2563eb',
                  fontSize: '0.75rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title={`Navigate to ${currentStep.title}`}
              >
                <span>Go</span>
                <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
              </button>
            )}

            {/* Next / Finish Button */}
            <button
              onClick={onNext}
              style={{
                padding: '0.45rem 1.1rem',
                borderRadius: '8px',
                background: isLastStep ? '#10B981' : '#2563eb',
                border: 'none',
                color: 'white',
                fontSize: '0.78rem',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: isLastStep ? '0 4px 12px rgba(16, 185, 129, 0.4)' : '0 4px 12px rgba(37, 99, 235, 0.4)'
              }}
            >
              {isLastStep ? 'Finish ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractiveSpotlightTour;
