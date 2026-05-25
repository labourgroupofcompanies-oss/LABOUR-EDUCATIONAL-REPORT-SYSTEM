import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../../services/authService';

const ParentLogin = () => {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [stage, setStage] = useState(1); // 1 = Phone Input, 2 = Password Setup / Input
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reassuranceData, setReassuranceData] = useState(null);
  
  // Stage 2 inputs
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const handleVerifyPhone = async (e) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setLoading(true);
    setError('');
    
    try {
      const data = await authService.verifyParentPhone(phoneNumber);
      setReassuranceData(data);
      setStage(2);
    } catch (err) {
      setError(err.message || 'Verification failed. Please check the number.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    
    setLoading(true);
    setError('');
    
    try {
      if (reassuranceData.isRegistered) {
        // Log in
        await authService.loginParent(phoneNumber, password);
      } else {
        // First-time setup
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match. Please try again.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await authService.registerParent(phoneNumber, password);
      }
      
      // Save matched siblings list in localStorage for fast local use in dashboard
      localStorage.setItem('labour_edu_parent_siblings', JSON.stringify(reassuranceData.siblings));
      
      // Redirect to Parent Dashboard
      navigate('/parent/dashboard');
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetStage = () => {
    setStage(1);
    setReassuranceData(null);
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  return (
    <div className="parent-login-container">
      <style>{`
        .parent-login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 10% 20%, rgba(13, 148, 136, 0.08) 0%, rgba(59, 130, 246, 0.04) 90%), #0f172a;
          font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
          padding: 1.5rem;
          color: #f8fafc;
        }

        .login-card {
          width: 100%;
          max-width: 460px;
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .brand-section {
          text-align: center;
          margin-bottom: 2rem;
        }

        .portal-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(13, 148, 136, 0.15);
          color: #2dd4bf;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.4rem 0.9rem;
          border-radius: 999px;
          margin-bottom: 1rem;
          border: 1px solid rgba(13, 148, 136, 0.2);
        }

        .brand-section h1 {
          font-size: 1.75rem;
          font-weight: 800;
          background: linear-gradient(135deg, #fff 40%, #94a3b8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0 0 0.5rem;
        }

        .brand-section p {
          color: #94a3b8;
          font-size: 0.9rem;
          margin: 0;
        }

        .form-group {
          margin-bottom: 1.25rem;
          position: relative;
        }

        .form-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
          font-size: 1.05rem;
          transition: color 0.2s;
        }

        .login-input {
          width: 100%;
          padding: 0.85rem 1rem 0.85rem 2.75rem;
          background: rgba(15, 23, 42, 0.6);
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #fff;
          font-size: 1rem;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
        }

        .login-input:focus {
          border-color: #0d9488;
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.2);
          background: rgba(15, 23, 42, 0.8);
        }

        .login-input:focus + .input-icon {
          color: #2dd4bf;
        }

        .btn-submit {
          width: 100%;
          padding: 0.9rem;
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(13, 148, 136, 0.25);
          margin-top: 1.5rem;
        }

        .btn-submit:hover:not(:disabled) {
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(13, 148, 136, 0.35);
        }

        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          font-size: 0.85rem;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          animation: shake 0.4s ease;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }

        .reassurance-banner {
          background: linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%);
          border: 1px solid rgba(13, 148, 136, 0.2);
          border-radius: 16px;
          padding: 1.25rem;
          margin-bottom: 1.5rem;
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .reassurance-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: #2dd4bf;
          margin-bottom: 0.4rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .reassurance-text {
          font-size: 0.85rem;
          color: #e2e8f0;
          line-height: 1.4;
          margin: 0;
        }

        .sibling-list {
          margin-top: 0.6rem;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .sibling-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          width: fit-content;
        }

        .btn-back {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 1rem;
          transition: color 0.2s;
        }

        .btn-back:hover {
          color: #fff;
        }

      `}</style>

      <div className="login-card">
        <div className="brand-section">
          <div className="portal-badge">
            <i className="fas fa-users"></i> Sibling Parent Portal
          </div>
          <h1>Labour Edu</h1>
          <p>Access your children's reports & fee statements</p>
        </div>

        {error && (
          <div className="error-banner">
            <i className="fas fa-exclamation-circle" style={{ marginTop: '2px' }}></i>
            <span>{error}</span>
          </div>
        )}

        {stage === 1 ? (
          <form onSubmit={handleVerifyPhone}>
            <div className="form-group">
              <label className="form-label">Guardian Phone Number</label>
              <div className="input-wrapper">
                <input
                  type="tel"
                  className="login-input"
                  placeholder="e.g. 0244123456"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  disabled={loading}
                />
                <i className="fas fa-phone-alt input-icon"></i>
              </div>
            </div>

            <button type="submit" className="btn-submit" disabled={loading || !phoneNumber}>
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Checking Records...
                </>
              ) : (
                <>
                  Verify Phone Number <i className="fas fa-arrow-right"></i>
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit}>
            {reassuranceData && (
              <div className="reassurance-banner">
                <div className="reassurance-title">
                  <i className="fas fa-check-circle"></i> Account Identified
                </div>
                <p className="reassurance-text">
                  Welcome, <strong>{reassuranceData.guardianName}</strong> ({reassuranceData.guardianRelation}). We found{' '}
                  <strong>{reassuranceData.siblings.length}</strong> sibling record{reassuranceData.siblings.length !== 1 ? 's' : ''} linked to your contact:
                </p>
                <div className="sibling-list">
                  {reassuranceData.siblings.map((sibling) => (
                    <div key={sibling.id} className="sibling-item">
                      <i className="fas fa-user-grad" style={{ color: sibling.gender === 'Female' ? '#ec4899' : '#3b82f6', fontSize: '0.75rem' }}></i>
                      <span>{sibling.fullName} ({sibling.regNumber})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!reassuranceData?.isRegistered ? (
              // First time registration password prompt
              <>
                <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.4' }}>
                  <i className="fas fa-shield-alt" style={{ color: '#2dd4bf', marginRight: '6px' }}></i>
                  First-time setup: Choose a secure password to protect your family's portal.
                </div>
                
                <div className="form-group">
                  <label className="form-label">Create Password</label>
                  <div className="input-wrapper">
                    <input
                      type="password"
                      className="login-input"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={loading}
                    />
                    <i className="fas fa-lock input-icon"></i>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <div className="input-wrapper">
                    <input
                      type="password"
                      className="login-input"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={loading}
                    />
                    <i className="fas fa-lock input-icon"></i>
                  </div>
                </div>
              </>
            ) : (
              // Existing user password prompt
              <div className="form-group">
                <label className="form-label">Enter Password</label>
                <div className="input-wrapper">
                  <input
                    type="password"
                    className="login-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <i className="fas fa-lock input-icon"></i>
                </div>
                <div style={{ marginTop: '0.55rem', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right', fontWeight: 500 }}>
                  <span 
                    style={{ color: '#2dd4bf', cursor: 'help', textDecoration: 'underline' }} 
                    title="If you forgot your password, please contact the school administration or your child's head teacher. They can instantly reset it to '123456' for you. Once you log in, you can change it to a new secure one."
                  >
                    Forgot Password?
                  </span>
                </div>
              </div>
            )}

            <button type="submit" className="btn-submit" disabled={loading || !password}>
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Authenticating...
                </>
              ) : reassuranceData?.isRegistered ? (
                <>
                  Log In <i className="fas fa-sign-in-alt"></i>
                </>
              ) : (
                <>
                  Register Account <i className="fas fa-user-plus"></i>
                </>
              )}
            </button>

            <button type="button" className="btn-back" onClick={handleResetStage} disabled={loading}>
              <i className="fas fa-arrow-left"></i> Use a different phone number
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default ParentLogin;
