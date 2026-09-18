import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { useSyncEngine } from '../../store/SyncEngineProvider';

const ImpersonationBanner = () => {
  const { user, stopImpersonation } = useAuth();
  const { triggerPullSync } = useSyncEngine();
  const navigate = useNavigate();

  if (!user?.isImpersonating) return null;

  const handleExitToInterventions = async () => {
    await stopImpersonation();
    navigate('/platform/operations/interventions');
  };

  const handleExitToSchool = async () => {
    const targetSchoolId = user?.schoolId;
    await stopImpersonation();
    if (targetSchoolId) {
      navigate(`/platform/operations/schools/${targetSchoolId}`);
    } else {
      navigate('/platform/operations/interventions');
    }
  };

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10000,
      background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)',
      color: '#ffffff',
      padding: '0.6rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '10px',
      fontSize: '0.85rem',
      fontWeight: 700,
      boxShadow: '0 4px 16px rgba(79, 70, 229, 0.35)',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: '#10B981',
          boxShadow: '0 0 10px #10B981',
          animation: 'pulseDot 1.2s ease-in-out infinite'
        }} />
        <span>
          <strong style={{ letterSpacing: '0.04em' }}>⚡ HEADTEACHER PORTAL INTERVENTION SESSION:</strong> Operating as Headteacher inside <u style={{ color: '#FDE047', fontWeight: 800 }}>{user?.schoolName || 'School Portal'}</u> <span style={{ opacity: 0.85, fontSize: '0.78rem' }}>({user?.schoolId})</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {triggerPullSync && (
          <button
            onClick={() => triggerPullSync()}
            title="Force pull latest data from cloud"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <i className="fas fa-rotate" /> Sync Cloud
          </button>
        )}

        <button
          onClick={handleExitToSchool}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '0.35rem 0.75rem',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <i className="fas fa-school" /> School Info
        </button>

        <button
          onClick={handleExitToInterventions}
          style={{
            background: '#ffffff',
            color: '#4f46e5',
            border: 'none',
            padding: '0.4rem 0.95rem',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '0.78rem',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <i className="fas fa-right-from-bracket" /> Exit Session &amp; Return to Ops
        </button>
      </div>

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
