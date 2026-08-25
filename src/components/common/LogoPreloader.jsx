import React from 'react';

/**
 * LogoPreloader - Exact Official Brand "L" Ant with Green Leaf Loading Animation
 * 
 * Recreates the official Labour Edu brand mark:
 * - Rounded blue app icon badge
 * - Bold white stylized "L"
 * - Detailed ant carrying the green leaf with walking legs, wiggling antennae,
 *   eye blinking, and gentle leaf sway physics.
 * 
 * @param {boolean} fullScreen - Whether to take full viewport overlay (default: true)
 * @param {boolean|null} showText - Explicit toggle for text (defaults to value of fullScreen)
 * @param {string} text - Custom tagline text (default: 'Simple.')
 * @param {string} size - 'sm' | 'md' | 'lg' (default: 'lg')
 */
const LogoPreloader = ({ fullScreen = true, showText = null, text = 'Simple.', size = 'lg' }) => {
  const isLg = size === 'lg';
  const isMd = size === 'md';

  const shouldRenderText = showText !== null ? showText : fullScreen;

  // Icon badge dimensions
  const badgeSize = isLg ? 160 : isMd ? 110 : 76;
  const badgeRadius = isLg ? 36 : isMd ? 24 : 18;

  const styleTag = `
    @keyframes badgeGlowPulse {
      0%, 100% {
        box-shadow: 0 16px 40px -8px rgba(22, 119, 255, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.12);
        transform: translateY(0px) scale(1);
      }
      50% {
        box-shadow: 0 24px 55px -6px rgba(22, 119, 255, 0.65), 0 0 35px rgba(34, 197, 94, 0.25);
        transform: translateY(-3px) scale(1.015);
      }
    }

    @keyframes antMarch {
      0%, 100% { transform: translate(0px, 0px); }
      25% { transform: translate(-3px, -1.5px) rotate(-1.5deg); }
      50% { transform: translate(-6px, 0px) rotate(0deg); }
      75% { transform: translate(-3px, -2px) rotate(1.5deg); }
    }

    @keyframes leafSway {
      0%, 100% { transform: rotate(0deg); }
      30% { transform: rotate(-5deg) scale(1.03); }
      70% { transform: rotate(4deg) scale(0.98); }
    }

    @keyframes antennaTwitchL {
      0%, 100% { transform: rotate(0deg); }
      20% { transform: rotate(-10deg); }
      40% { transform: rotate(6deg); }
      70% { transform: rotate(-4deg); }
    }

    @keyframes antennaTwitchR {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(8deg); }
      50% { transform: rotate(-12deg); }
      80% { transform: rotate(4deg); }
    }

    @keyframes frontLegMove {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(18deg) translateY(-2px); }
    }

    @keyframes midLegMove {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(-16deg) translateY(-2px); }
    }

    @keyframes backLegMove {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(14deg) translateY(-1.5px); }
    }

    @keyframes eyeBlink {
      0%, 92%, 100% { transform: scaleY(1); opacity: 1; }
      95% { transform: scaleY(0.1); opacity: 0.3; }
    }

    @keyframes abdomenBreathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.04) rotate(-1deg); }
    }

    @keyframes barShimmerMove {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `;

  const content = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: shouldRenderText ? (isLg ? '1.25rem' : '0.85rem') : '0.75rem',
      userSelect: 'none',
      position: 'relative',
      padding: fullScreen ? 0 : '1rem'
    }}>
      <style>{styleTag}</style>

      {/* Official Brand Logo Icon Badge */}
      <div style={{
        position: 'relative',
        width: `${badgeSize}px`,
        height: `${badgeSize}px`,
        borderRadius: `${badgeRadius}px`,
        background: 'linear-gradient(145deg, #2575fc 0%, #1a60e8 40%, #0d4ed8 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'badgeGlowPulse 3s ease-in-out infinite',
        overflow: 'hidden',
      }}>
        {/* Subtle inner highlight shine across top-left */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '45%',
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 100%)',
          borderRadius: `${badgeRadius}px ${badgeRadius}px 0 0`,
          pointerEvents: 'none',
        }} />

        {/* Crisp Vector Graphic matching the logo */}
        <svg
          viewBox="0 0 200 200"
          width={badgeSize}
          height={badgeSize}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            {/* Green Leaf Gradient */}
            <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" />
              <stop offset="50%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#16a34a" />
            </linearGradient>

            {/* Ant Body Gradient */}
            <radialGradient id="antBodyGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="70%" stopColor="#0a0f1d" />
              <stop offset="100%" stopColor="#030712" />
            </radialGradient>

            {/* Ant Head Gradient */}
            <radialGradient id="antHeadGrad" cx="40%" cy="30%" r="60%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="80%" stopColor="#0b1120" />
            </radialGradient>

            {/* Subtle drop shadow under ant onto the L */}
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="#091e42" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* ── THE WHITE "L" ── */}
          {/* Vertical stem */}
          <path
            d="M 68 50 
               C 68 40, 86 40, 86 50 
               L 86 112 
               L 150 112 
               C 156 112, 156 126, 150 126 
               L 74 126 
               C 68 126, 68 120, 68 112 
               Z"
            fill="#ffffff"
          />
          {/* Smooth rounded corner on inside of the 'L' */}
          <path
            d="M 68 50
               C 68 38, 88 38, 88 50
               L 88 108
               C 88 114, 94 114, 102 114
               L 146 114
               C 152 114, 152 126, 144 126
               L 76 126
               C 68 126, 68 120, 68 112
               Z"
            fill="#ffffff"
          />

          {/* Precise Solid White "L" matching reference */}
          <path
            d="M 76 42
               C 66 42, 66 52, 66 58
               L 66 116
               C 66 126, 74 128, 82 128
               L 144 128
               C 152 128, 152 120, 144 120
               L 88 120
               C 86 120, 84 118, 84 114
               L 84 58
               C 84 52, 84 42, 76 42
               Z"
            fill="#ffffff"
          />

          {/* ── THE ANT & LEAF GROUP (with animated walking / march) ── */}
          <g style={{ animation: 'antMarch 2.4s ease-in-out infinite' }} filter="url(#softShadow)">

            {/* ── BACK LEGS (rendered behind the body) ── */}
            {/* Back-right leg */}
            <path
              d="M 124 106 Q 138 98 144 107"
              stroke="#0a0f1d"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
              style={{
                transformOrigin: '124px 106px',
                animation: 'backLegMove 0.6s ease-in-out infinite'
              }}
            />
            {/* Mid-right leg */}
            <path
              d="M 120 108 Q 134 114 135 124"
              stroke="#0a0f1d"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
              style={{
                transformOrigin: '120px 108px',
                animation: 'midLegMove 0.6s ease-in-out infinite 0.15s'
              }}
            />
            {/* Front-right leg */}
            <path
              d="M 112 108 Q 124 120 127 131"
              stroke="#0a0f1d"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
              style={{
                transformOrigin: '112px 108px',
                animation: 'frontLegMove 0.6s ease-in-out infinite 0.3s'
              }}
            />

            {/* ── FRONT LEGS (reaching forward/down onto the L) ── */}
            {/* Front-left leg */}
            <path
              d="M 112 106 Q 106 116 108 124"
              stroke="#0a0f1d"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
              style={{
                transformOrigin: '112px 106px',
                animation: 'frontLegMove 0.6s ease-in-out infinite'
              }}
            />
            {/* Mid-left leg */}
            <path
              d="M 118 108 Q 116 118 121 126"
              stroke="#0a0f1d"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
              style={{
                transformOrigin: '118px 108px',
                animation: 'midLegMove 0.6s ease-in-out infinite 0.2s'
              }}
            />

            {/* ── ABDOMEN (large rear oval) ── */}
            <g style={{ transformOrigin: '136px 110px', animation: 'abdomenBreathe 2s ease-in-out infinite' }}>
              <ellipse
                cx="136"
                cy="110"
                rx="14"
                ry="10.5"
                transform="rotate(25 136 110)"
                fill="url(#antBodyGrad)"
              />
              {/* Abdomen highlight sheen */}
              <ellipse
                cx="135"
                cy="107"
                rx="8"
                ry="4"
                transform="rotate(25 135 107)"
                fill="rgba(255, 255, 255, 0.12)"
              />
            </g>

            {/* ── THORAX (middle segment) ── */}
            <ellipse
              cx="120"
              cy="104"
              rx="7"
              ry="6"
              fill="url(#antBodyGrad)"
            />

            {/* ── HEAD ── */}
            <g>
              <circle
                cx="110"
                cy="96"
                r="7.5"
                fill="url(#antHeadGrad)"
              />

              {/* White Pupil Eye */}
              <circle
                cx="108"
                cy="94.5"
                r="1.8"
                fill="#ffffff"
                style={{
                  transformOrigin: '108px 94.5px',
                  animation: 'eyeBlink 3.5s infinite'
                }}
              />

              {/* ── ANTENNAE ── */}
              {/* Left Antenna */}
              <path
                d="M 108 90 Q 102 82 104 76"
                stroke="#0a0f1d"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                style={{
                  transformOrigin: '108px 90px',
                  animation: 'antennaTwitchL 1.8s ease-in-out infinite'
                }}
              />
              {/* Right Antenna */}
              <path
                d="M 112 90 Q 112 80 118 78"
                stroke="#0a0f1d"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                style={{
                  transformOrigin: '112px 90px',
                  animation: 'antennaTwitchR 1.8s ease-in-out infinite 0.25s'
                }}
              />
            </g>

            {/* ── GREEN LEAF (in ant's mandibles) ── */}
            <g style={{
              transformOrigin: '106px 98px',
              animation: 'leafSway 2.4s ease-in-out infinite'
            }}>
              {/* Leaf Body */}
              <path
                d="M 106 99 
                   C 96 99, 84 92, 82 82
                   C 94 84, 102 91, 106 99
                   Z"
                fill="url(#leafGrad)"
              />
              <path
                d="M 106 99 
                   C 98 106, 86 104, 82 82
                   C 92 98, 101 99, 106 99
                   Z"
                fill="url(#leafGrad)"
              />
              {/* Crisp complete leaf shape */}
              <path
                d="M 106 98 
                   C 98 90, 84 86, 82 82 
                   C 86 96, 94 104, 106 98 
                   Z"
                fill="url(#leafGrad)"
              />
              {/* Central White Leaf Vein */}
              <path
                d="M 104 97 Q 93 91 84 83"
                stroke="rgba(255, 255, 255, 0.75)"
                strokeWidth="1"
                strokeLinecap="round"
                fill="none"
              />
            </g>

          </g>
        </svg>
      </div>

      {/* Brand Title & Tagline (Appears on FullScreen / Explicit Text screens) */}
      {shouldRenderText && (
        <div style={{ textAlign: 'center', zIndex: 2 }}>
          <div style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 900,
            fontSize: isLg ? '1.4rem' : '1.1rem',
            color: '#ffffff',
            letterSpacing: '0.05em',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            justifyContent: 'center'
          }}>
            <span>LABOUR</span>
            <span style={{ color: '#2563eb' }}>EDU</span>
          </div>

          <div style={{
            fontSize: isLg ? '0.8rem' : '0.72rem',
            marginTop: '4px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            justifyContent: 'center',
            color: '#94a3b8'
          }}>
            <span style={{ color: '#2563eb' }}>Work</span> &bull;
            <span style={{ color: '#10b981' }}>Made</span> &bull;
            <span style={{ color: '#f97316' }}>{text || 'Simple.'}</span>
          </div>
        </div>
      )}

      {/* Subtle Shimmer Bar */}
      <div style={{
        width: isLg ? '140px' : isMd ? '100px' : '70px',
        height: '3px',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 2
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, #2563eb 0%, #10b981 50%, #f97316 100%)',
          backgroundSize: '200% 100%',
          animation: 'barShimmerMove 1.6s linear infinite',
          borderRadius: '999px'
        }} />
      </div>

    </div>
  );

  if (!fullScreen) return content;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'radial-gradient(circle at 50% 45%, #0f172a 0%, #090d16 60%, #030712 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      backdropFilter: 'blur(16px)'
    }}>
      {content}
    </div>
  );
};

export default LogoPreloader;
