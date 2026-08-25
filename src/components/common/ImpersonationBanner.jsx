import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';

const ImpersonationBanner = () => {
  const { user, stopImpersonation } = useAuth();
  const navigate = useNavigate();

  if (!user?.isImpersonating) return null;

  const handleExit = () => {
    stopImpersonation();
    navigate('/platform/operations/support');
  };

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10000,
      background: 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)',
      color: '#ffffff',
      padding: '0.65rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '0.88rem',
      fontWeight: 700,
      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 0 10px #ffffff',
          animation: 'pulseDot 1.2s ease-in-out infinite'
        }} />
        <span>
          <strong>REMOTE SUPPORT SESSION ACTIVE:</strong> Operating inside <u>{user?.schoolName || 'School Portal'}</u> (ID: {user?.schoolId})
        </span>
      </div>

      <button
        onClick={handleExit}
        style={{
          background: '#ffffff',
          color: '#dc2626',
          border: 'none',
          padding: '0.4rem 1rem',
          borderRadius: '8px',
          fontWeight: 800,
          fontSize: '0.8rem',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <i className="fas fa-right-from-bracket" /> Exit Session & Return to Ops
      </button>

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
};

export default ImpersonationBanner;
