import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';

const Login = () => {
  // Login States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const navigate = useNavigate();
  const { login, user } = useAuth();

  const [refCode, setRefCode] = useState('');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const params = new URLSearchParams(window.location.search);
    const code = params.get('ref');
    if (code) {
      setRefCode(code.toUpperCase());
      sessionStorage.setItem('labour_edu_ref_code', code.toUpperCase());
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const userEmail = (user.email || '').toLowerCase().trim();
      if (userEmail === 'shrtgallery3@gmail.com' || user.role === 'platform_developer' || user.isPlatformDeveloper) {
        navigate('/platform/operations');
      } else {
        navigate('/');
      }
    }
  }, [user, navigate]);

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

      setForgotSuccess('Recovery link sent! Please check your email inbox.');
      setForgotEmail('');
    } catch (err) {
      setError(err.message || 'Failed to send password reset email. Check email address.');
    } finally {
      setLoading(false);
    }
  };

  // ── Standard Sign In Handler ──────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!email?.trim() || !password) {
        setError('Please enter both email and password.');
        setLoading(false);
        return;
      }
      const cleanedEmail = email.trim().toLowerCase();
      await login(cleanedEmail, password);
      navigate('/');
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
      const { data, error: rpcErr } = await supabase.rpc('verify_unclaimed_teacher', {
        teacher_email: emailInput.toLowerCase().trim()
      });

      if (rpcErr) throw rpcErr;

      if (!data) {
        throw new Error('No registered teacher found with this email.');
      }

      if (data.is_claimed) {
        throw new Error('This teacher portal is already active. Please sign in directly.');
      }

      setTeacherProfile(data);
      setActivationSuccess(`Registry found for ${data.full_name}! Create your portal password below.`);
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
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: userId, error: rpcErr } = await supabase.rpc('activate_teacher_account', {
        teacher_email: teacherProfile.email,
        teacher_password: newPassword
      });

      if (rpcErr) throw rpcErr;

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

      if (teacherProfile.id && teacherProfile.id !== userId) {
        try {
          await db.profiles.delete(teacherProfile.id);
          const localAssigns = await db.teacherAssignments.where('teacherId').equals(teacherProfile.id).toArray();
          for (const a of localAssigns) {
            await db.teacherAssignments.update(a.id, { teacherId: userId });
          }
        } catch (dbErr) {
          console.warn('Local cleanup notice:', dbErr);
        }
      }

      try {
        await login(teacherProfile.email, newPassword);
        alert('Teacher Portal activated successfully!');
        navigate('/');
      } catch (loginErr) {
        alert('Portal activated! Please sign in with your new password.');
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

  // ── RENDER PORTAL ACTIVATION VIEW ─────────────────────────────────
  if (showActivation) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        minHeight: '100vh',
        background: 'rgba(9, 9, 11, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        overflowY: 'auto'
      }}>
        <div style={{ width: '100%', maxWidth: '440px', background: '#FFFFFF', borderRadius: '24px', boxShadow: '0 25px 60px rgba(0, 0, 0, 0.3)', padding: '2.25rem', border: '1px solid #E4E4E7', margin: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ width: '56px', height: '56px', background: 'rgba(37, 99, 235, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#2563eb', fontSize: '1.4rem', border: '1px solid rgba(37, 99, 235, 0.25)' }}>
              <i className="fas fa-key" />
            </div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.4rem', color: '#09090b', fontWeight: 800, margin: '0 0 0.25rem' }}>Teacher Portal Activation</h2>
            <p style={{ color: '#71717a', fontSize: '0.82rem', margin: 0 }}>Verify your email to set your portal password</p>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#EF4444', padding: '0.75rem 1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.82rem', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-exclamation-circle" />
              <span>{error}</span>
            </div>
          )}

          {activationSuccess && (
            <div style={{ background: '#ECFDF5', color: '#10B981', padding: '0.75rem 1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.82rem', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-check-circle" />
              <span>{activationSuccess}</span>
            </div>
          )}

          <form onSubmit={handleActivate}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', color: '#18181b', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.4rem' }}>Registered Email</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="email" 
                  placeholder="teacher@school.edu.gh"
                  value={activationEmail}
                  onChange={(e) => { setActivationEmail(e.target.value); setError(''); setActivationSuccess(''); }}
                  required
                  disabled={checking || !!teacherProfile}
                  style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '12px', border: '1.5px solid #E4E4E7', fontSize: '0.9rem', outline: 'none', color: '#18181b' }}
                />
                {!teacherProfile && (
                  <button 
                    type="button" 
                    onClick={() => verifyTeacher(activationEmail)}
                    disabled={checking || !activationEmail.trim()}
                    style={{ background: '#2563eb', color: 'white', fontWeight: 800, padding: '0 1.15rem', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    {checking ? <i className="fas fa-spinner fa-spin" /> : 'Verify'}
                  </button>
                )}
              </div>
            </div>

            {teacherProfile && (
              <div style={{ background: '#FAFAFA', border: '1px solid #E4E4E7', padding: '1rem', borderRadius: '14px', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.85rem' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    <i className="fas fa-user-check" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#09090b' }}>{teacherProfile.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#71717a' }}>Staff ID: {teacherProfile.staff_id || 'Active'}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', color: '#18181b', fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.35rem' }}>Create Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1.5px solid #E4E4E7', fontSize: '0.9rem', outline: 'none', color: '#18181b' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#18181b', fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.35rem' }}>Confirm Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1.5px solid #E4E4E7', fontSize: '0.9rem', outline: 'none', color: '#18181b' }}
                  />
                </div>
              </div>
            )}

            {teacherProfile && (
              <button 
                type="submit" 
                disabled={loading}
                style={{ width: '100%', padding: '0.85rem', background: '#09090b', color: 'white', fontWeight: 900, borderRadius: '14px', border: 'none', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 4px 14px rgba(9, 9, 11, 0.3)' }}
              >
                {loading ? <i className="fas fa-spinner fa-spin" /> : 'Activate & Sign In'}
              </button>
            )}
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => { setShowActivation(false); setError(''); setTeacherProfile(null); }}
              style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 700 }}
            >
              <i className="fas fa-arrow-left" style={{ marginRight: '6px' }} /> Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER FORGOT PASSWORD VIEW ───────────────────────────────────
  if (showForgotPassword) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        minHeight: '100vh',
        background: 'rgba(9, 9, 11, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        overflowY: 'auto'
      }}>
        <div style={{ width: '100%', maxWidth: '420px', background: '#FFFFFF', borderRadius: '24px', boxShadow: '0 25px 60px rgba(0, 0, 0, 0.3)', padding: '2.25rem', border: '1px solid #E4E4E7', margin: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ width: '56px', height: '56px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', border: '1px solid rgba(37, 99, 235, 0.25)', fontSize: '1.3rem' }}>
              <i className="fas fa-paper-plane" />
            </div>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.4rem', color: '#09090b', fontWeight: 800, margin: '0 0 0.25rem' }}>Reset Password</h2>
            <p style={{ color: '#71717a', fontSize: '0.82rem', margin: 0 }}>Enter your email for a recovery link</p>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#EF4444', padding: '0.75rem 1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.82rem', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-exclamation-circle" />
              <span>{error}</span>
            </div>
          )}

          {forgotSuccess && (
            <div style={{ background: '#ECFDF5', color: '#10B981', padding: '0.75rem 1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.82rem', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-check-circle" />
              <span>{forgotSuccess}</span>
            </div>
          )}

          <form onSubmit={handleForgotPassword}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#18181b', fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.4rem' }}>Registered Email</label>
              <input 
                type="email" 
                placeholder="name@school.edu.gh"
                value={forgotEmail}
                onChange={(e) => { setForgotEmail(e.target.value); setError(''); setForgotSuccess(''); }}
                required
                disabled={loading}
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1.5px solid #E4E4E7', fontSize: '0.9rem', outline: 'none', color: '#18181b' }}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              style={{ width: '100%', padding: '0.85rem', background: '#09090b', color: 'white', fontWeight: 900, borderRadius: '14px', border: 'none', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 4px 14px rgba(9, 9, 11, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-paper-plane" /> Send Recovery Link</>}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => { setShowForgotPassword(false); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 700 }}
            >
              <i className="fas fa-arrow-left" style={{ marginRight: '6px' }} /> Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN MINIMALIST & ELEGANT SIGN IN ─────────────────────────────
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at center, #18181b 0%, #09090b 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      
      {/* Background Ambient Glow Accent */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, rgba(0,0,0,0) 70%)',
        pointerEvents: 'none'
      }} />

      {/* Main Container Card */}
      <div style={{
        width: '100%',
        maxWidth: '430px',
        background: '#FFFFFF',
        borderRadius: '28px',
        boxShadow: '0 25px 70px -15px rgba(0, 0, 0, 0.65)',
        padding: '2.5rem 2.25rem',
        border: '1px solid #27272a',
        position: 'relative',
        zIndex: 2,
        margin: 'auto'
      }}>
        
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: '#FFFFFF',
            borderRadius: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
            padding: '4px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
            border: '2px solid #2563eb'
          }}>
            <img src="/logo.png" alt="Labour Edu Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          <h1 style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: '1.65rem',
            fontWeight: 900,
            color: '#09090b',
            margin: '0 0 0.25rem',
            letterSpacing: '-0.01em'
          }}>
            Labour Edu
          </h1>
          <p style={{ margin: 0, color: '#71717a', fontSize: '0.85rem', fontWeight: 600 }}>
            Ghana School Management Portal
          </p>

          {/* Network Status Badge */}
          <div style={{ marginTop: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, background: isOnline ? '#ECFDF5' : '#FFFBEB', color: isOnline ? '#10B981' : '#F59E0B', border: `1px solid ${isOnline ? '#A7F3D0' : '#FDE68A'}` }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#10B981' : '#F59E0B' }} />
            {isOnline ? 'Cloud Online' : 'Offline Access Active'}
          </div>
        </div>

        {/* Alerts */}
        {refCode && (
          <div style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', borderRadius: '14px', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#2563eb', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-gift" style={{ color: '#2563eb', fontSize: '1rem' }} />
            <span>Referral <code style={{ background: 'rgba(37, 99, 235, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>{refCode}</code> active</span>
          </div>
        )}

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '14px', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#EF4444', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-exclamation-circle" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          
          {/* Email Field */}
          <div style={{ marginBottom: '1.15rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#18181b', marginBottom: '0.4rem' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-envelope" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontSize: '0.9rem' }} />
              <input
                type="email"
                required
                placeholder="name@school.edu.gh"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem 0.8rem 2.6rem',
                  borderRadius: '14px',
                  border: '1.5px solid #E4E4E7',
                  fontSize: '0.92rem',
                  color: '#18181b',
                  fontWeight: 600,
                  outline: 'none',
                  transition: 'all 0.15s ease',
                  background: '#FFFFFF'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                onBlur={e => e.currentTarget.style.borderColor = '#E4E4E7'}
              />
            </div>
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: '1.15rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#18181b', marginBottom: '0.4rem' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-lock" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontSize: '0.9rem' }} />
              <input
                type={showPasswordText ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.8rem 2.6rem 0.8rem 2.6rem',
                  borderRadius: '14px',
                  border: '1.5px solid #E4E4E7',
                  fontSize: '0.92rem',
                  color: '#18181b',
                  fontWeight: 600,
                  outline: 'none',
                  transition: 'all 0.15s ease',
                  background: '#FFFFFF'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                onBlur={e => e.currentTarget.style.borderColor = '#E4E4E7'}
              />
              <button
                type="button"
                onClick={() => setShowPasswordText(!showPasswordText)}
                style={{
                  position: 'absolute',
                  right: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <i className={`fas ${showPasswordText ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>

          {/* Form Options Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#71717a', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" style={{ accentColor: '#2563eb', width: '16px', height: '16px', borderRadius: '4px' }} />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => { setShowForgotPassword(true); setError(''); setForgotSuccess(''); }}
              style={{ background: 'transparent', border: 'none', fontSize: '0.82rem', color: '#2563eb', fontWeight: 800, cursor: 'pointer', padding: 0 }}
            >
              Forgot password?
            </button>
          </div>

          {/* Main Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.9rem',
              borderRadius: '14px',
              background: '#09090b',
              border: 'none',
              color: '#FFFFFF',
              fontWeight: 900,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 6px 20px rgba(9, 9, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'transform 0.15s ease, background 0.15s ease'
            }}
          >
            {loading ? (
              <i className="fas fa-spinner fa-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <i className="fas fa-arrow-right" />
              </>
            )}
          </button>

        </form>

        {/* Quick Portal Action Buttons */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          
          {/* Teacher Portal Activation */}
          <button
            type="button"
            onClick={() => { setShowActivation(true); setError(''); }}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              color: '#2563eb',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <i className="fas fa-key" style={{ color: '#2563eb' }} />
            <span>Teacher? Activate Your Portal</span>
          </button>

          {/* Register New School */}
          <Link
            to="/onboarding"
            style={{
              textAlign: 'center',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#2563eb',
              textDecoration: 'none',
              padding: '0.4rem'
            }}
          >
            <i className="fas fa-school" style={{ marginRight: '6px' }} />
            New school? Register your institution
          </Link>

        </div>

        {/* Footer Text Below Login Page */}
        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.78rem', color: '#A1A1AA', fontWeight: 600 }}>
          &copy; 2026 Labour Edu System &bull; Ghana Basic
        </div>

      </div>

    </div>
  );
};

export default Login;
