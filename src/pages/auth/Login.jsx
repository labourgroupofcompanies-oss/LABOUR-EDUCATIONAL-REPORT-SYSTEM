import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import authService from '../../services/authService';
import loginRateLimitService from '../../services/loginRateLimitService';

const Login = () => {
  // Login States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lockout, setLockout] = useState(() => loginRateLimitService.checkLockout());
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

  // Portal Tab State ('staff' or 'parent')
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('portal') === 'parent' ? 'parent' : 'staff';
    } catch {
      return 'staff';
    }
  });

  // Parent Portal Login States
  const [parentPhone, setParentPhone] = useState('');
  const [parentStage, setParentStage] = useState(1); // 1 = Phone Input, 2 = Password Setup / Input
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState('');
  const [parentReassurance, setParentReassurance] = useState(null);
  const [parentPassword, setParentPassword] = useState('');
  const [parentConfirmPassword, setParentConfirmPassword] = useState('');
  const [showParentPasswordText, setShowParentPasswordText] = useState(false);

  // Interval timer for real-time lockout countdown & anti-refresh tracking
  // Must be placed AFTER activeTab and parentPhone are declared
  useEffect(() => {
    const checkLock = () => {
      const activeIdentifier = activeTab === 'staff' ? email.trim() : parentPhone.trim();
      setLockout(loginRateLimitService.checkLockout(activeIdentifier));
    };
    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, [email, parentPhone, activeTab]);

  // ── Parent Portal Handlers ──────────────────────────────────────────
  const handleVerifyParentPhone = async (e) => {
    e.preventDefault();
    if (!parentPhone.trim()) return;

    const lockCheck = loginRateLimitService.checkLockout(parentPhone.trim());
    if (lockCheck.isLocked) {
      setParentError(`Account temporarily restricted: 5 failed login attempts reached. Security lockout active for another ${lockCheck.remainingFormatted}. Refreshing will not bypass this restriction.`);
      setLockout(lockCheck);
      return;
    }

    setParentLoading(true);
    setParentError('');

    try {
      const data = await authService.verifyParentPhone(parentPhone.trim());
      setParentReassurance(data);
      setParentStage(2);
    } catch (err) {
      setParentError(err.message || 'Verification failed. Please check the mobile number.');
    } finally {
      setParentLoading(false);
    }
  };

  const handleParentPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!parentPassword) return;

    const cleanPhone = parentPhone.trim();
    const lockCheck = loginRateLimitService.checkLockout(cleanPhone);
    if (lockCheck.isLocked) {
      setParentError(`Account temporarily restricted: 5 failed login attempts reached. Security lockout active for another ${lockCheck.remainingFormatted}. Refreshing will not bypass this restriction.`);
      setLockout(lockCheck);
      return;
    }

    setParentLoading(true);
    setParentError('');

    try {
      if (parentReassurance?.isRegistered) {
        // Returning parent login
        await authService.loginParent(cleanPhone, parentPassword);
      } else {
        // First-time registration & password setup
        if (parentPassword !== parentConfirmPassword) {
          throw new Error('Passwords do not match. Please try again.');
        }
        if (parentPassword.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await authService.registerParent(cleanPhone, parentPassword);
      }

      if (parentReassurance?.siblings) {
        localStorage.setItem('labour_edu_parent_siblings', JSON.stringify(parentReassurance.siblings));
      }

      navigate('/parent/dashboard');
    } catch (err) {
      setParentError(err.message || 'Authentication failed. Please try again.');
      setLockout(loginRateLimitService.checkLockout(cleanPhone));
    } finally {
      setParentLoading(false);
    }
  };

  const handleResetParentStage = () => {
    setParentStage(1);
    setParentReassurance(null);
    setParentPassword('');
    setParentConfirmPassword('');
    setParentError('');
  };

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
    setError('');

    const cleanedEmail = email?.trim().toLowerCase();
    const lockCheck = loginRateLimitService.checkLockout(cleanedEmail);
    if (lockCheck.isLocked) {
      setError(`Account temporarily restricted: 5 failed login attempts reached. Security lockout active for another ${lockCheck.remainingFormatted}. Refreshing will not bypass this restriction.`);
      setLockout(lockCheck);
      return;
    }

    setLoading(true);

    try {
      if (!cleanedEmail || !password) {
        setError('Please enter both email and password.');
        setLoading(false);
        return;
      }
      await login(cleanedEmail, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials and try again.');
      setLockout(loginRateLimitService.checkLockout(cleanedEmail));
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

        {/* Portal Role Switcher Tabs */}
        <div style={{
          display: 'flex',
          background: '#F4F4F5',
          borderRadius: '14px',
          padding: '4px',
          marginBottom: '1.5rem',
          border: '1px solid #E4E4E7'
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('staff'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.65rem 0.5rem',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'staff' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'staff' ? '#09090b' : '#71717a',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'staff' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <i className="fas fa-chalkboard-user" style={{ color: activeTab === 'staff' ? '#2563eb' : '#a1a1aa' }} />
            <span>Staff Portal</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('parent'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.65rem 0.5rem',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'parent' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'parent' ? '#0d9488' : '#71717a',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: activeTab === 'parent' ? '0 2px 6px rgba(13,148,136,0.15)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <i className="fas fa-users" style={{ color: activeTab === 'parent' ? '#0d9488' : '#a1a1aa' }} />
            <span>Parents Portal</span>
          </button>
        </div>

        {/* ── STAFF PORTAL VIEW ─────────────────────────────────────── */}
        {activeTab === 'staff' && (
          <div>
            {/* Alerts */}
            {refCode && (
              <div style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', borderRadius: '14px', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#2563eb', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fas fa-gift" style={{ color: '#2563eb', fontSize: '1rem' }} />
                <span>Referral <code style={{ background: 'rgba(37, 99, 235, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>{refCode}</code> active</span>
              </div>
            )}

            {/* Security Lockout Banner */}
            {lockout.isLocked && (
              <div style={{
                background: '#FEF2F2',
                border: '1.5px solid #F87171',
                borderRadius: '16px',
                padding: '1.1rem 1rem',
                marginBottom: '1.25rem',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#B91C1C', fontWeight: 900, fontSize: '0.92rem', marginBottom: '0.35rem' }}>
                  <i className="fas fa-shield-halved" style={{ fontSize: '1.1rem' }} />
                  <span>Security Lockout Active</span>
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#7F1D1D', lineHeight: 1.4 }}>
                  Maximum of 5 failed login attempts reached. Access is temporarily suspended (Tier {lockout.strikeCount}: {lockout.tierLabel}).
                </p>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#FFFFFF',
                  padding: '0.65rem 0.95rem',
                  borderRadius: '10px',
                  border: '1px solid #FECACA'
                }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991B1B' }}>
                    Lockout Countdown:
                  </span>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '1.15rem',
                    fontWeight: 900,
                    color: '#DC2626',
                    letterSpacing: '1px'
                  }}>
                    <i className="fas fa-clock" style={{ marginRight: '6px', fontSize: '0.9rem' }} />
                    {lockout.remainingDigital}
                  </span>
                </div>
                <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-lock" />
                  <span>Anti-Tamper: Refreshing the browser will not bypass or reset this countdown.</span>
                </div>
              </div>
            )}

            {/* Remaining Attempts Warning */}
            {!lockout.isLocked && lockout.failedAttempts > 0 && (
              <div style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '12px',
                padding: '0.65rem 0.9rem',
                marginBottom: '1rem',
                color: '#B45309',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fas fa-exclamation-triangle" style={{ flexShrink: 0 }} />
                <span>Security Notice: {lockout.failedAttempts} of 5 login attempts used. ({lockout.remainingAttempts} attempt{lockout.remainingAttempts !== 1 ? 's' : ''} left before lockout)</span>
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
                disabled={loading || lockout.isLocked}
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  borderRadius: '14px',
                  background: lockout.isLocked ? '#9CA3AF' : '#09090b',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '0.95rem',
                  cursor: (loading || lockout.isLocked) ? 'not-allowed' : 'pointer',
                  boxShadow: lockout.isLocked ? 'none' : '0 6px 20px rgba(9, 9, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'transform 0.15s ease, background 0.15s ease'
                }}
              >
                {loading ? (
                  <i className="fas fa-spinner fa-spin" />
                ) : lockout.isLocked ? (
                  <>
                    <i className="fas fa-lock" />
                    <span>Locked ({lockout.remainingDigital})</span>
                  </>
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
              
              {/* Parents Portal Action Card */}
              <button
                type="button"
                onClick={() => { setActiveTab('parent'); setError(''); setParentError(''); }}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(37, 99, 235, 0.05) 100%)',
                  border: '1.5px solid rgba(13, 148, 136, 0.25)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(13, 148, 136, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0d9488',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}>
                    <i className="fas fa-users" />
                  </div>
                  <div>
                    <div style={{ color: '#0f766e', fontWeight: 800, fontSize: '0.88rem' }}>
                      Parents Portal
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.74rem', fontWeight: 600 }}>
                      Access child reports, fees &amp; attendance
                    </div>
                  </div>
                </div>
                <i className="fas fa-chevron-right" style={{ color: '#0d9488', fontSize: '0.85rem' }} />
              </button>

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
          </div>
        )}

        {/* ── PARENTS PORTAL VIEW ───────────────────────────────────── */}
        {activeTab === 'parent' && (
          <div>
            {/* Security Lockout Banner */}
            {lockout.isLocked && (
              <div style={{
                background: '#FEF2F2',
                border: '1.5px solid #F87171',
                borderRadius: '16px',
                padding: '1.1rem 1rem',
                marginBottom: '1.25rem',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#B91C1C', fontWeight: 900, fontSize: '0.92rem', marginBottom: '0.35rem' }}>
                  <i className="fas fa-shield-halved" style={{ fontSize: '1.1rem' }} />
                  <span>Security Lockout Active</span>
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#7F1D1D', lineHeight: 1.4 }}>
                  Maximum of 5 failed login attempts reached. Access is temporarily suspended (Tier {lockout.strikeCount}: {lockout.tierLabel}).
                </p>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#FFFFFF',
                  padding: '0.65rem 0.95rem',
                  borderRadius: '10px',
                  border: '1px solid #FECACA'
                }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991B1B' }}>
                    Lockout Countdown:
                  </span>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '1.15rem',
                    fontWeight: 900,
                    color: '#DC2626',
                    letterSpacing: '1px'
                  }}>
                    <i className="fas fa-clock" style={{ marginRight: '6px', fontSize: '0.9rem' }} />
                    {lockout.remainingDigital}
                  </span>
                </div>
                <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-lock" />
                  <span>Anti-Tamper: Refreshing the browser will not bypass or reset this countdown.</span>
                </div>
              </div>
            )}

            {/* Remaining Attempts Warning */}
            {!lockout.isLocked && lockout.failedAttempts > 0 && (
              <div style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '12px',
                padding: '0.65rem 0.9rem',
                marginBottom: '1rem',
                color: '#B45309',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fas fa-exclamation-triangle" style={{ flexShrink: 0 }} />
                <span>Security Notice: {lockout.failedAttempts} of 5 login attempts used. ({lockout.remainingAttempts} attempt{lockout.remainingAttempts !== 1 ? 's' : ''} left before lockout)</span>
              </div>
            )}

            {/* Parent Error Alert */}
            {parentError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '14px', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#EF4444', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-exclamation-circle" style={{ flexShrink: 0 }} />
                <span>{parentError}</span>
              </div>
            )}

            {parentStage === 1 ? (
              /* Stage 1: Phone Verification */
              <form onSubmit={handleVerifyParentPhone}>
                <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(13, 148, 136, 0.1)',
                    color: '#0d9488',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '4px 12px',
                    borderRadius: '999px',
                    marginBottom: '0.5rem'
                  }}>
                    <i className="fas fa-shield-alt" />
                    <span>Guardian Mobile Verification</span>
                  </div>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem', lineHeight: 1.4 }}>
                    Enter your phone number registered with the school to access your child's terminal report cards &amp; fees.
                  </p>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#18181b', marginBottom: '0.4rem' }}>
                    Guardian Phone Number
                  </label>
                  <div style={{ position: 'relative' }}>
                    <i className="fas fa-phone-alt" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontSize: '0.9rem' }} />
                    <input
                      type="tel"
                      required
                      disabled={parentLoading}
                      placeholder="e.g. 0244123456"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
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
                      onFocus={e => e.currentTarget.style.borderColor = '#0d9488'}
                      onBlur={e => e.currentTarget.style.borderColor = '#E4E4E7'}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={parentLoading || !parentPhone.trim() || lockout.isLocked}
                  style={{
                    width: '100%',
                    padding: '0.9rem',
                    borderRadius: '14px',
                    background: lockout.isLocked ? '#9CA3AF' : '#0d9488',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 900,
                    fontSize: '0.95rem',
                    cursor: (parentLoading || !parentPhone.trim() || lockout.isLocked) ? 'not-allowed' : 'pointer',
                    boxShadow: lockout.isLocked ? 'none' : '0 6px 20px rgba(13, 148, 136, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: (parentLoading || !parentPhone.trim()) ? 0.7 : 1,
                    transition: 'transform 0.15s ease, background 0.15s ease'
                  }}
                >
                  {parentLoading ? (
                    <><i className="fas fa-spinner fa-spin" /> Verifying Records...</>
                  ) : lockout.isLocked ? (
                    <><i className="fas fa-lock" /> Locked ({lockout.remainingDigital})</>
                  ) : (
                    <><span>Verify Phone Number</span><i className="fas fa-arrow-right" /></>
                  )}
                </button>
              </form>
            ) : (
              /* Stage 2: Password Setup (First-time) or Password Input (Returning) */
              <form onSubmit={handleParentPasswordSubmit}>
                {parentReassurance && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.1) 0%, rgba(37, 99, 235, 0.06) 100%)',
                    border: '1.5px solid rgba(13, 148, 136, 0.25)',
                    borderRadius: '16px',
                    padding: '1rem',
                    marginBottom: '1.25rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0f766e', fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                      <i className="fas fa-check-circle" style={{ color: '#0d9488' }} />
                      <span>Account Identified</span>
                    </div>
                    <p style={{ margin: '0 0 0.5rem', color: '#334155', fontSize: '0.8rem', lineHeight: 1.4 }}>
                      Welcome, <strong>{parentReassurance.guardianName}</strong> ({parentReassurance.guardianRelation}). Found <strong>{parentReassurance.siblings?.length || 0}</strong> student record(s) linked to your number:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {parentReassurance.siblings?.map((child) => (
                        <div key={child.id || child.regNumber} style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: '#0f766e',
                          background: '#FFFFFF',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(13, 148, 136, 0.2)'
                        }}>
                          <i className="fas fa-user-graduate" style={{ color: child.gender === 'Female' ? '#ec4899' : '#3b82f6', fontSize: '0.72rem' }} />
                          <span>{child.fullName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!parentReassurance?.isRegistered ? (
                  /* First Time: Set Password */
                  <>
                    <div style={{ background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: '12px', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="fas fa-shield-alt" style={{ color: '#0d9488', fontSize: '0.9rem', flexShrink: 0 }} />
                      <span>First-time setup: Choose a password (at least 6 characters) to protect your family's portal.</span>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#18181b', marginBottom: '0.35rem' }}>
                        Create Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <i className="fas fa-lock" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontSize: '0.9rem' }} />
                        <input
                          type={showParentPasswordText ? 'text' : 'password'}
                          required
                          minLength={6}
                          disabled={parentLoading}
                          placeholder="At least 6 characters"
                          value={parentPassword}
                          onChange={(e) => setParentPassword(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.75rem 2.6rem 0.75rem 2.6rem',
                            borderRadius: '12px',
                            border: '1.5px solid #E4E4E7',
                            fontSize: '0.9rem',
                            color: '#18181b',
                            fontWeight: 600,
                            outline: 'none',
                            background: '#FFFFFF'
                          }}
                          onFocus={e => e.currentTarget.style.borderColor = '#0d9488'}
                          onBlur={e => e.currentTarget.style.borderColor = '#E4E4E7'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowParentPasswordText(!showParentPasswordText)}
                          style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}
                        >
                          <i className={`fas ${showParentPasswordText ? 'fa-eye-slash' : 'fa-eye'}`} />
                        </button>
                      </div>
                    </div>

                    <div style={{ marginBottom: '1.25rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#18181b', marginBottom: '0.35rem' }}>
                        Confirm Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <i className="fas fa-lock" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontSize: '0.9rem' }} />
                        <input
                          type={showParentPasswordText ? 'text' : 'password'}
                          required
                          minLength={6}
                          disabled={parentLoading}
                          placeholder="Repeat your password"
                          value={parentConfirmPassword}
                          onChange={(e) => setParentConfirmPassword(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.75rem 1rem 0.75rem 2.6rem',
                            borderRadius: '12px',
                            border: '1.5px solid #E4E4E7',
                            fontSize: '0.9rem',
                            color: '#18181b',
                            fontWeight: 600,
                            outline: 'none',
                            background: '#FFFFFF'
                          }}
                          onFocus={e => e.currentTarget.style.borderColor = '#0d9488'}
                          onBlur={e => e.currentTarget.style.borderColor = '#E4E4E7'}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* Returning User: Enter Password */
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#18181b', marginBottom: '0.35rem' }}>
                      Enter Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <i className="fas fa-lock" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#71717a', fontSize: '0.9rem' }} />
                      <input
                        type={showParentPasswordText ? 'text' : 'password'}
                        required
                        disabled={parentLoading}
                        placeholder="••••••••"
                        value={parentPassword}
                        onChange={(e) => setParentPassword(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.8rem 2.6rem 0.8rem 2.6rem',
                          borderRadius: '14px',
                          border: '1.5px solid #E4E4E7',
                          fontSize: '0.92rem',
                          color: '#18181b',
                          fontWeight: 600,
                          outline: 'none',
                          background: '#FFFFFF'
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = '#0d9488'}
                        onBlur={e => e.currentTarget.style.borderColor = '#E4E4E7'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowParentPasswordText(!showParentPasswordText)}
                        style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}
                      >
                        <i className={`fas ${showParentPasswordText ? 'fa-eye-slash' : 'fa-eye'}`} />
                      </button>
                    </div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.74rem', color: '#64748b', textAlign: 'right' }}>
                      <span
                        title="If you forgot your password, please contact the school administration. They can reset it for you."
                        style={{ color: '#0d9488', cursor: 'pointer', fontWeight: 700 }}
                        onClick={() => alert("To reset your parent password, please contact your child's headteacher or school administration. They can reset it in the portal.")}
                      >
                        Forgot Password?
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={parentLoading || !parentPassword || lockout.isLocked}
                  style={{
                    width: '100%',
                    padding: '0.9rem',
                    borderRadius: '14px',
                    background: lockout.isLocked ? '#9CA3AF' : '#0d9488',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 900,
                    fontSize: '0.95rem',
                    cursor: (parentLoading || !parentPassword || lockout.isLocked) ? 'not-allowed' : 'pointer',
                    boxShadow: lockout.isLocked ? 'none' : '0 6px 20px rgba(13, 148, 136, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: (parentLoading || !parentPassword) ? 0.7 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {parentLoading ? (
                    <><i className="fas fa-spinner fa-spin" /> Authenticating...</>
                  ) : lockout.isLocked ? (
                    <><i className="fas fa-lock" /> Locked ({lockout.remainingDigital})</>
                  ) : parentReassurance?.isRegistered ? (
                    <><span>Sign In to Parents Portal</span><i className="fas fa-arrow-right" /></>
                  ) : (
                    <><span>Create Password &amp; Access Portal</span><i className="fas fa-user-check" /></>
                  )}
                </button>

                <div style={{ marginTop: '0.85rem', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleResetParentStage}
                    disabled={parentLoading}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <i className="fas fa-arrow-left" /> Use a different phone number
                  </button>
                </div>
              </form>
            )}

            {/* Switch back to Staff */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #E4E4E7', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => { setActiveTab('staff'); setError(''); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <i className="fas fa-chalkboard-user" /> Are you a Teacher or Headteacher? Sign in here
              </button>
            </div>
          </div>
        )}

        {/* Footer Text & Privacy Policy Link */}
        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.76rem', color: '#A1A1AA', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span>&copy; 2026 Labour Group of Companies</span>
          <span>&bull;</span>
          <Link to="/privacy-policy" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 700 }}>
            Privacy Policy &amp; Terms
          </Link>
        </div>

      </div>

    </div>
  );
};

export default Login;
