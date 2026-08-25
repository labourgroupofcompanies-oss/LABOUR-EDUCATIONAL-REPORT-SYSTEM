import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ─── Executive KPI Card ──────────────────────────────────────────────────
 */
export const KpiCard = ({ title, value, subtext, icon, trend, trendType = 'up', badge, color = '#2563eb', onClick }) => {
  const isPositive = trendType === 'up';
  
  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 12px 24px -4px rgba(9, 9, 11, 0.08)' }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        border: '1px solid #E4E4E7',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}
    >
      {/* Background Accent Gradient */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '90px',
          height: '90px',
          background: `radial-gradient(circle at top right, ${color}15, transparent 70%)`,
          pointerEvents: 'none'
        }} 
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#71717a', letterSpacing: '0.01em' }}>
          {title}
        </span>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color,
          fontSize: '1rem'
        }}>
          <i className={`fas ${icon}`}></i>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginTop: '0.25rem' }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#18181b', fontFamily: 'Outfit, sans-serif' }}>
          {value}
        </span>
        {trend && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: isPositive ? '#10B981' : '#EF4444',
            background: isPositive ? '#ECFDF5' : '#FEF2F2',
            padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            border: `1px solid ${isPositive ? '#A7F3D0' : '#FECACA'}`
          }}>
            <i className={`fas ${isPositive ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`}></i>
            {trend}
          </span>
        )}
      </div>

      {(subtext || badge) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#A1A1AA', marginTop: 'auto' }}>
          {subtext && <span>{subtext}</span>}
          {badge && (
            <span style={{
              background: '#FAFAFA',
              color: '#71717a',
              border: '1px solid #E4E4E7',
              fontWeight: 600,
              padding: '0.15rem 0.5rem',
              borderRadius: '6px',
              fontSize: '0.72rem'
            }}>
              {badge}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
};

/**
 * ─── Concise Status Badge ────────────────────────────────────────────────
 */
export const StatusBadge = ({ status, variant = 'info', icon, customColor, customBg }) => {
  const variants = {
    success: { bg: '#ECFDF5', color: '#10B981', border: '#A7F3D0', icon: 'fa-circle-check' },
    warning: { bg: '#FFFBEB', color: '#F59E0B', border: '#FDE68A', icon: 'fa-triangle-exclamation' },
    danger: { bg: '#FEF2F2', color: '#EF4444', border: '#FECACA', icon: 'fa-circle-xmark' },
    info: { bg: 'rgba(37, 99, 235, 0.08)', color: '#2563EB', border: 'rgba(37, 99, 235, 0.25)', icon: 'fa-circle-info' },
    neutral: { bg: '#FAFAFA', color: '#71717a', border: '#E4E4E7', icon: 'fa-circle' },
  };

  const current = variants[variant] || variants.info;
  const activeIcon = icon || current.icon;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      padding: '0.25rem 0.65rem',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 700,
      background: customBg || current.bg,
      color: customColor || current.color,
      border: `1px solid ${current.border}`,
      whiteSpace: 'nowrap',
      lineHeight: 1.2
    }}>
      <i className={`fas ${activeIcon}`} style={{ fontSize: '0.65rem' }}></i>
      {status}
    </span>
  );
};

/**
 * ─── Radial Progress Ring ─────────────────────────────────────────────────
 */
export const ProgressRing = ({ progress = 0, size = 64, strokeWidth = 6, color = '#2563eb', label }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E4E4E7"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.78rem',
          fontWeight: 800,
          color: '#18181b'
        }}>
          {Math.round(progress)}%
        </div>
      </div>
      {label && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#71717a' }}>{label}</span>}
    </div>
  );
};

/**
 * ─── Horizontal Progress Bar ──────────────────────────────────────────────
 */
export const ProgressBar = ({ progress = 0, height = 8, color = '#2563eb', showLabel = false }) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#71717a' }}>
          <span>Progress</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div style={{
        width: '100%',
        height: `${height}px`,
        background: '#E4E4E7',
        borderRadius: '999px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${clampedProgress}%`,
          height: '100%',
          background: color,
          borderRadius: '999px',
          transition: 'width 0.4s ease'
        }} />
      </div>
    </div>
  );
};

/**
 * ─── Card Row Component for Modern List / Table Replacements ──────────────
 */
export const CardRow = ({ avatar, title, subtitle, badges = [], metaText, actions, onClick }) => {
  return (
    <motion.div
      whileHover={{ backgroundColor: '#FAFAFA', scale: 1.002 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E4E4E7',
        padding: '0.9rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '0.5rem',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, flex: 1 }}>
        {avatar && (
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(37, 99, 235, 0.08)',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '1rem',
            flexShrink: 0
          }}>
            {typeof avatar === 'string' && avatar.startsWith('http') ? (
              <img src={avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }} />
            ) : (
              avatar
            )}
          </div>
        )}

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#18181b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </span>
            {badges.map((badgeItem, idx) => (
              <React.Fragment key={idx}>{badgeItem}</React.Fragment>
            ))}
          </div>
          {subtitle && (
            <span style={{ fontSize: '0.78rem', color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        {metaText && (
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#71717a' }}>
            {metaText}
          </span>
        )}
        {actions && <div>{actions}</div>}
      </div>
    </motion.div>
  );
};

/**
 * ─── Action Menu Overflow Dropdown ────────────────────────────────────────
 */
export const ActionMenu = ({ items = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          border: '1px solid #E4E4E7',
          background: '#FFFFFF',
          color: '#71717a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#18181b'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E4E4E7'; e.currentTarget.style.color = '#71717a'; }}
      >
        <i className="fas fa-ellipsis-vertical"></i>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              width: '180px',
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E4E4E7',
              boxShadow: '0 10px 25px -5px rgba(9, 9, 11, 0.1)',
              padding: '0.35rem',
              zIndex: 99,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem'
            }}
          >
            {items.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  if (item.onClick) item.onClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: item.danger ? '#EF4444' : '#18181b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.12s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? '#FEF2F2' : '#FAFAFA'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {item.icon && <i className={`fas ${item.icon}`} style={{ width: '16px' }}></i>}
                <span>{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * ─── Slide-over Drawer Overlay ────────────────────────────────────────────
 */
export const Drawer = ({ isOpen, onClose, title, children, width = '480px' }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', justifyContent: 'flex-end' }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(9, 9, 11, 0.5)',
              backdropFilter: 'blur(4px)'
            }}
          />

          {/* Drawer Container */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: width,
              height: '100%',
              background: '#FFFFFF',
              boxShadow: '-10px 0 30px rgba(9, 9, 11, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 100000
            }}
          >
            {/* Drawer Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #E4E4E7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#FAFAFA'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#09090b', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid #E4E4E7',
                  background: '#FFFFFF',
                  color: '#71717a',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/**
 * ─── Empty State Primitive ─────────────────────────────────────────────────
 */
export const EmptyState = ({ icon = 'fa-box-open', title = 'No Data Available', description, actionLabel, onAction }) => {
  return (
    <div style={{
      padding: '3rem 1.5rem',
      textAlign: 'center',
      background: '#FFFFFF',
      borderRadius: '16px',
      border: '1px dashed #E4E4E7',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem'
    }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '16px',
        background: 'rgba(37, 99, 235, 0.08)',
        color: '#2563eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.5rem',
        marginBottom: '0.25rem'
      }}>
        <i className={`fas ${icon}`}></i>
      </div>
      <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
        {title}
      </h4>
      {description && (
        <p style={{ fontSize: '0.82rem', color: '#71717a', maxWidth: '340px', margin: 0 }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-primary"
          style={{ marginTop: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
        >
          <i className="fas fa-plus" style={{ marginRight: '0.4rem' }}></i>
          {actionLabel}
        </button>
      )}
    </div>
  );
};

/**
 * ─── Skeleton Loading Shimmer ─────────────────────────────────────────────
 */
export const SkeletonLoader = ({ height = '20px', width = '100%', borderRadius = '8px', count = 1 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            height,
            width,
            borderRadius,
            background: 'linear-gradient(90deg, #FAFAFA 25%, #E4E4E7 50%, #FAFAFA 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite linear'
          }}
        />
      ))}
    </div>
  );
};
