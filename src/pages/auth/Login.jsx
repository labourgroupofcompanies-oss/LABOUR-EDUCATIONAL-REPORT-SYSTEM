import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';

const Login = () => {
  // Login States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  // Portal Activation States
  const [showActivation, setShowActivation] = useState(false);
  const [activationEmail, setActivationEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');

  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // ── Forgot Password Request Handler ──────────────────────────────────
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setLoading(true);
    setError('');
    setForgotSuccess('');

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.toLowerCase().trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (resetErr) throw resetErr;

      setForgotSuccess('A secure password reset link has been sent to your email address! Please check your inbox and spam folder.');
      setForgotEmail('');
    } catch (err) {
      setError(err.message || 'Failed to send password reset email. Please verify the email address.');
    } finally {
      setLoading(false);
    }
  };

  // ── standard Sign In Handler ──────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate inputs before attempting login
      if (!email?.trim() || !password) {
        setError('Please enter both email and password');
        setLoading(false);
        return;
      }
      // Ensure email is trimmed and lower‑cased for Supabase
      const cleanedEmail = email.trim().toLowerCase();
      await login(cleanedEmail, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Teacher Profile Live Verification Handler ─────────────────────
  const verifyTeacher = async (emailInput) => {
    setError('');
    setActivationSuccess('');
    if (!emailInput) return;

    setChecking(true);
    try {
      // Invoke the plpgsql verify_unclaimed_teacher RLS-bypass function
      const { data, error: rpcErr } = await supabase.rpc('verify_unclaimed_teacher', {
        teacher_email: emailInput.toLowerCase().trim()
      });

      if (rpcErr) throw rpcErr;

      if (!data) {
        throw new Error('No registered teacher found with this email. Please verify the spelling or check with your school administrator.');
      }

      if (data.is_claimed) {
        throw new Error('This teacher portal has already been activated. You can sign in directly.');
      }

      // Auto-fill teacher registry metadata
      setTeacherProfile(data);
      setActivationSuccess(`Registry found for ${data.full_name}! Enter your desired login password below to claim your portal.`);
    } catch (err) {
      setError(err.message || 'Failed to verify email address.');
      setTeacherProfile(null);
    } finally {
      setChecking(false);
    }
  };

  // ── Portal Activation Handler ─────────────────────────────────────
  const handleActivate = async (e) => {
    e.preventDefault();
    if (!teacherProfile) return;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('Activating teacher account and provisioning login credentials...');
      // Invoke the plpgsql activate_teacher_account transaction function
      const { data: userId, error: rpcErr } = await supabase.rpc('activate_teacher_account', {
        teacher_email: teacherProfile.email,
        teacher_password: newPassword
      });

      if (rpcErr) {
        throw rpcErr;
      }

      // Cache profile locally in Dexie IndexedDB
      const localRecord = {
        id: userId,
        fullName: teacherProfile.full_name,
        staffId: teacherProfile.staff_id,
        email: teacherProfile.email,
        role: 'teacher',
        isClaimed: true,
        schoolId: teacherProfile.school_id,
        createdAt: new Date().toISOString()
      };
      await db.profiles.put(localRecord);

      // Clean up the old temporary profile and cascade to assignments in local Dexie DB
      if (teacherProfile.id && teacherProfile.id !== userId) {
        try {
          await db.profiles.delete(teacherProfile.id);
          
          const localAssigns = await db.teacherAssignments.where('teacherId').equals(teacherProfile.id).toArray();
          for (const a of localAssigns) {
            await db.teacherAssignments.update(a.id, { teacherId: userId });
          }
        } catch (dbErr) {
          console.warn('Local Dexie DB cleanup/cascading warning:', dbErr);
        }
      }

      // Auto-login the user immediately!
      try {
        await login(teacherProfile.email, newPassword);
        alert('Teacher Portal activated successfully! You have been logged in automatically.');
        navigate('/');
      } catch (loginErr) {
        console.error('Auto-login failed after activation:', loginErr);
        alert('Teacher Portal activated successfully! Please log in manually using the password you just created.');
        // Auto-populate the email in login view and toggle back
        setEmail(teacherProfile.email);
        setShowActivation(false);
        setTeacherProfile(null);
        setNewPassword('');
        setConfirmPassword('');
        setActivationEmail('');
        setActivationSuccess('');
      }
    } catch (err) {
      setError(err.message || 'Failed to claim teacher portal.');
    } finally {
      setLoading(false);
    }
  };

  // ── RENDER PORTAL ACTIVATION SHEET ────────────────────────────────
  if (showActivation) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div className="card fade-in" style={{ width: '100%', maxWidth: '450px', padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: '64px', height: '64px', background: 'var(--accent)', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', transform: 'rotate(-5deg)', boxShadow: '0 10px 20px rgba(13, 148, 136, 0.3)' }}>
              <i className="fas fa-key" style={{ color: 'white', fontSize: '2rem' }}></i>
            </div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Portal Activation</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Verify your email to create your login password</p>
          </div>

          {error && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <i className="fas fa-circle-exclamation" style={{ marginRight: '8px' }}></i>
              {error}
            </div>
          )}

          {activationSuccess && (
            <div style={{ backgroundColor: 'rgba(13, 148, 136, 0.1)', color: 'var(--accent)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid rgba(13, 148, 136, 0.2)' }}>
              <i className="fas fa-circle-check" style={{ marginRight: '8px' }}></i>
              {activationSuccess}
            </div>
          )}

          <form onSubmit={handleActivate}>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Your Registered Email</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="your-email@school.edu"
                  value={activationEmail}
                  onChange={(e) => {
                    setActivationEmail(e.target.value);
                    setTeacherProfile(null);
                    setActivationSuccess('');
                    setError('');
                  }}
                  required
                  disabled={checking || loading}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ background: 'var(--accent)', color: 'white', padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                  onClick={() => verifyTeacher(activationEmail)}
                  disabled={checking || loading || !activationEmail}
                >
                  {checking ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                  <span>Verify</span>
                </button>
              </div>
            </div>

            {/* Auto-filled Metadata details */}
            {teacherProfile && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', background: 'var(--background)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px' }}>Full Name</label>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem' }}>{teacherProfile.full_name}</div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px' }}>Staff ID</label>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem' }}>{teacherProfile.staff_id}</div>
                </div>
              </div>
            )}

            {teacherProfile && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Create Your Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Your Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={loading}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '0.875rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  disabled={loading}
                >
                  {loading ? <i className="fas fa-spinner fa-spin"></i> : <>
                    <i className="fas fa-circle-check"></i>
                    <span>Activate Portal & Sign In</span>
                  </>}
                </button>
              </div>
            )}
          </form>

          {/* Go Back Link */}
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setShowActivation(false);
                setError('');
                setTeacherProfile(null);
                setActivationSuccess('');
                setActivationEmail('');
              }}
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
  }

  // ── RENDER FORGOT PASSWORD SHEET ──────────────────────────────────
  if (showForgotPassword) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div className="card fade-in" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: '64px', height: '64px', background: 'var(--accent)', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', transform: 'rotate(-5deg)', boxShadow: '0 10px 20px rgba(13, 148, 136, 0.3)' }}>
              <i className="fas fa-paper-plane" style={{ color: 'white', fontSize: '2rem' }}></i>
            </div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Reset Password</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Enter your email to receive a recovery link</p>
          </div>

          {error && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <i className="fas fa-circle-exclamation" style={{ marginRight: '8px' }}></i>
              {error}
            </div>
          )}

          {forgotSuccess && (
            <div style={{ backgroundColor: 'rgba(13, 148, 136, 0.1)', color: 'var(--accent)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid rgba(13, 148, 136, 0.2)' }}>
              <i className="fas fa-circle-check" style={{ marginRight: '8px' }}></i>
              {forgotSuccess}
            </div>
          )}

          <form onSubmit={handleForgotPassword}>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Your Registered Email</label>
              <input 
                type="email" 
                className="form-input" 
                placeholder="name@school.edu"
                value={forgotEmail}
                onChange={(e) => {
                  setForgotEmail(e.target.value);
                  setError('');
                  setForgotSuccess('');
                }}
                required
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
                <i className="fas fa-paper-plane"></i>
                <span>Send Recovery Link</span>
              </>}
            </button>
          </form>

          {/* Go Back Link */}
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setError('');
                setForgotSuccess('');
                setForgotEmail('');
              }}
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
  }

  // ── RENDER STANDARD SIGN IN SHEET ────────────────────────────────
  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
      <div className="card fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ width: '70px', height: '70px', background: 'white', borderRadius: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', transform: 'rotate(-5deg)', boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)', overflow: 'hidden', padding: '4px' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Labour Edu</h1>
          <p style={{ color: 'var(--text-muted)' }}>Report Management System</p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <i className="fas fa-circle-exclamation" style={{ marginRight: '8px' }}></i>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="name@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" style={{ accentColor: 'var(--accent)' }} />
              Remember me
            </label>
            <button 
              type="button" 
              onClick={() => {
                setShowForgotPassword(true);
                setError('');
                setForgotSuccess('');
              }}
              style={{ background: 'none', border: 'none', fontSize: '0.875rem', color: 'var(--accent)', cursor: 'pointer', fontWeight: 500, padding: 0 }}
            >
              Forgot password?
            </button>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '0.875rem' }}
            disabled={loading}
          >
            {loading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <>
                <span>Sign In</span>
                <i className="fas fa-arrow-right"></i>
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-wifi-slash" style={{ marginRight: '6px' }}></i>
            Offline login supported
          </p>
        </div>

        {/* Portal Activation for pre-registered teachers */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '.6rem' }}>Are you a Teacher?</p>
          <button
            type="button"
            onClick={() => {
              setShowActivation(true);
              setError('');
            }}
            className="btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.85rem', fontWeight: 700, color: 'var(--accent)', background: 'transparent', border: '1.5px solid var(--accent)', borderRadius: 10, padding: '.5rem 1.2rem', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.background='var(--accent)'; e.currentTarget.style.color='white'; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--accent)'; }}
          >
            <i className="fas fa-key"></i> Activate Your Portal
          </button>
        </div>

        {/* Register new school */}
        <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
          <Link
            to="/onboarding"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color='var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}
          >
            <i className="fas fa-school"></i> New school? Register here
          </Link>
        </div>
      </div>
      
      <footer style={{ marginTop: '2.5rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: 'center' }}>
        &copy; 2024 Labour Edu Report System • Ghana Basic Schools
      </footer>
    </div>
  );
};

export default Login;
