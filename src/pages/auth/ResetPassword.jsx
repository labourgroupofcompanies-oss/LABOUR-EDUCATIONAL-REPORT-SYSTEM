import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  // Handle URL errors or recovery state checks
  useEffect(() => {
    // Check hash parameters and search query parameters
    const hash = window.location.hash;
    const search = window.location.search;

    if (hash && hash.includes('error_description')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const errorDesc = params.get('error_description');
      setError(errorDesc || 'The password reset link is invalid or expired. Please request a new one.');
    } else if (search && search.includes('error_description')) {
      const params = new URLSearchParams(search);
      const errorDesc = params.get('error_description');
      setError(errorDesc || 'The password reset link is invalid or expired. Please request a new one.');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) throw updateErr;

      setSuccess('Your password has been updated successfully! Redirecting to the sign-in page...');
      
      // Auto-navigate to login after 3 seconds
      setTimeout(() => {
        supabase.auth.signOut().then(() => {
          navigate('/login');
        });
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to update password. Your recovery link may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: '440px', background: '#FFFFFF', borderRadius: '24px', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.12)', padding: '2.5rem', border: '1px solid #E2E8F0' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #1E3A8A, #D97706)', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', boxShadow: '0 10px 25px rgba(217, 119, 6, 0.25)' }}>
            <i className="fas fa-key" style={{ color: 'white', fontSize: '1.75rem' }}></i>
          </div>
          <h1 style={{ fontSize: '1.6rem', color: '#1E3A8A', fontWeight: 800, marginBottom: '0.35rem' }}>Set New Password</h1>
          <p style={{ color: '#64748B', fontSize: '0.875rem' }}>Create a strong, secure password for your account</p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#EF4444', padding: '0.85rem 1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.85rem', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: 'rgba(217, 119, 6, 0.08)', color: '#D97706', padding: '0.85rem 1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.85rem', border: '1px solid rgba(217, 119, 6, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-circle-check"></i>
            <span>{success}</span>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ color: '#0F172A', fontWeight: 600, fontSize: '0.82rem' }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <i className="fas fa-lock" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '0.9rem' }} />
                <input 
                  type={showNewPass ? "text" : "password"} 
                  className="form-input" 
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError('');
                  }}
                  required
                  minLength={6}
                  disabled={loading}
                  style={{ paddingLeft: '40px', paddingRight: '40px', height: '46px', borderRadius: '10px', border: '1.5px solid #E2E8F0' }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                >
                  <i className={`fas ${showNewPass ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.75rem' }}>
              <label className="form-label" style={{ color: '#0F172A', fontWeight: 600, fontSize: '0.82rem' }}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <i className="fas fa-lock" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '0.9rem' }} />
                <input 
                  type={showConfirmPass ? "text" : "password"} 
                  className="form-input" 
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  required
                  minLength={6}
                  disabled={loading}
                  style={{ paddingLeft: '40px', paddingRight: '40px', height: '46px', borderRadius: '10px', border: '1.5px solid #E2E8F0' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                >
                  <i className={`fas ${showConfirmPass ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className="btn" 
              style={{ width: '100%', height: '48px', background: '#1E3A8A', color: 'white', fontWeight: 700, borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(30, 58, 138, 0.25)' }}
              disabled={loading}
            >
              {loading ? <i className="fas fa-spinner fa-spin"></i> : <>
                <i className="fas fa-save"></i>
                <span>Save & Update Password</span>
              </>}
            </button>
          </form>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
          >
            <i className="fas fa-arrow-left" style={{ marginRight: '6px' }}></i> Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
