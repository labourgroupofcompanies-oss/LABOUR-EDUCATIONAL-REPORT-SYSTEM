import React from 'react';
import { useNavigate } from 'react-router-dom';

const AccessDenied403 = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, #18181b 0%, #09090b 100%)',
      color: '#FAFAFA',
      fontFamily: 'Inter, sans-serif',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '540px',
        width: '100%',
        background: '#09090b',
        borderRadius: '24px',
        border: '1px solid #27272a',
        padding: '3rem 2.5rem',
        textAlign: 'center',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
          color: '#EF4444',
          fontSize: '2.5rem'
        }}>
          <i className="fas fa-shield-cat"></i>
        </div>

        <span style={{
          display: 'inline-block',
          padding: '0.25rem 0.85rem',
          borderRadius: '9999px',
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#EF4444',
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '1rem',
          border: '1px solid rgba(239, 68, 68, 0.25)'
        }}>
          HTTP 403 • Access Restricted
        </span>

        <h1 style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '2rem',
          fontWeight: 800,
          marginBottom: '0.75rem',
          color: '#FFFFFF'
        }}>
          Platform Developer Portal
        </h1>

        <p style={{
          color: '#71717a',
          fontSize: '0.95rem',
          lineHeight: 1.6,
          marginBottom: '2rem'
        }}>
          Access to this area is strictly reserved for <strong>Super Admin Platform Administrators</strong>. 
          Your account does not possess the requisite security permissions to inspect or configure global platform APIs.
        </p>

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center'
        }}>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.85rem 1.75rem',
              borderRadius: '12px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.2s ease'
            }}
          >
            <i className="fas fa-home"></i>
            Return to Dashboard
          </button>
        </div>

        <div style={{
          marginTop: '2.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid #27272a',
          fontSize: '0.75rem',
          color: '#71717a'
        }}>
          Security incident logged • IP address recorded
        </div>
      </div>
    </div>
  );
};

export default AccessDenied403;
