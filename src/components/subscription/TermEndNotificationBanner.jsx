import React from 'react';

const TermEndNotificationBanner = ({ statusInfo }) => {
  if (!statusInfo) return null;

  const {
    days_to_term_end = 999,
    notification_level = 'none',
    academic_year = '2025/2026',
    term = 'Term 1',
  } = statusInfo;

  if (notification_level === 'none' || days_to_term_end > 7 || days_to_term_end < 0) {
    return null;
  }

  let bg = 'rgba(37, 99, 235, 0.08)';
  let border = '1px solid rgba(37, 99, 235, 0.25)';
  let textColor = '#2563eb';
  let icon = 'fa-bell';
  let message = `The current term (${term}) will end in ${days_to_term_end} days. Please complete score entry and verify all learner results.`;

  if (days_to_term_end <= 1) {
    bg = '#FEF2F2';
    border = '1px solid #FECACA';
    textColor = '#EF4444';
    icon = 'fa-exclamation-circle';
    message = `Final reminder: The official term (${term}) ends tomorrow! Please ensure all scores are saved.`;
  } else if (days_to_term_end <= 3) {
    bg = '#FFFBEB';
    border = '1px solid #FDE68A';
    textColor = '#F59E0B';
    icon = 'fa-clock';
    message = `Reminder: Only ${days_to_term_end} days remaining for ${term}. Please complete all score entry.`;
  }

  return (
    <div
      style={{
        background: bg,
        border: border,
        borderRadius: '14px',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        boxShadow: '0 2px 8px rgba(9, 9, 11, 0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: textColor,
            fontSize: '1.1rem',
            flexShrink: 0,
            border: `1px solid ${border.replace('1px solid ', '')}`
          }}
        >
          <i className={`fas ${icon}`}></i>
        </div>
        <div>
          <div style={{ fontWeight: 800, color: textColor, fontSize: '0.9rem', fontFamily: 'Outfit, sans-serif' }}>
            Official Academic Term Notification ({academic_year} — {term})
          </div>
          <div style={{ color: '#71717a', fontSize: '0.83rem', marginTop: '2px', fontWeight: 500 }}>
            {message}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.75rem', color: textColor, fontWeight: 700, background: '#FFFFFF', padding: '0.3rem 0.75rem', borderRadius: '8px', border: `1px solid ${border.replace('1px solid ', '')}` }}>
        {days_to_term_end} Day{days_to_term_end !== 1 ? 's' : ''} Remaining
      </div>
    </div>
  );
};

export default TermEndNotificationBanner;
