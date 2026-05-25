import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  // Handle Hash fragments/Recovery state check
  useEffect(() => {
    // Check if the current URL contains access token or recovery error
    const hash = window.location.hash;
    if (hash && hash.includes('error_description')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
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

      setSuccess('Your password has been successfully updated! Redirecting to the sign-in page...');
      
      // Auto-navigate to login after 3 seconds
      setTimeout(() => {
        // Sign out to clear temporary recovery session, forcing a fresh sign in
        supabase.auth.signOut().then(() => {
          navigate('/login');
        });
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to update password. Your recovery link might be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', minHeight: '100vh' }}>
      <div className="card fade-in" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--accent)', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', transform: 'rotate(-5deg)', boxShadow: '0 10px 20px rgba(13, 148, 136, 0.3)' }}>
            <i className="fas fa-lock-open" style={{ color: 'white', fontSize: '2rem' }}></i>
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Set New Password</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Enter a strong, secure password for your account</p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <i className="fas fa-circle-exclamation" style={{ marginRight: '8px' }}></i>
            {error}
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: 'rgba(13, 148, 136, 0.1)', color: 'var(--accent)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid rgba(13, 148, 136, 0.2)' }}>
            <i className="fas fa-circle-check" style={{ marginRight: '8px' }}></i>
            {success}
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">New Password</label>
              <input 
                type="password" 
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
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.75rem' }}>
              <label className="form-label">Confirm Password</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
                required
                minLength={6}
                disabled={loading}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
            onMouseEnter={e => e.target.style.color = 'var(--text)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
          >
            <i className="fas fa-arrow-left" style={{ marginRight: '6px' }}></i> Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
