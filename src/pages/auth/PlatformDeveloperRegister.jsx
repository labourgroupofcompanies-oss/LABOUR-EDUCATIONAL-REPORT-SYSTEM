import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import LogoPreloader from '../../components/common/LogoPreloader';
import { sha256 } from '../../utils/cryptoUtils';

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO CHANGE YOUR SECRET KEY:
//
// 1. Pick a new strong key (e.g. "MyS3cur3K3y!2026#Labour")
// 2. Open your browser console and run:
//      crypto.subtle.digest('SHA-256', new TextEncoder().encode('YourKeyHere'))
//        .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
// 3. Paste the resulting hash below as PLATFORM_KEY_HASH
// 4. Never commit the actual key — only this hash lives in the code.
//
// Current key hash below corresponds to the private key known only to you.
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORM_KEY_HASH = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';
//                         ↑ This is the SHA-256 of "password" — CHANGE THIS
//                           to the hash of your own private key (see above).

const MAX_ATTEMPTS = 3;
const STEPS = ['Verify', 'Identity', 'Password', 'Done'];

const PlatformDeveloperRegister = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [adminExists, setAdminExists] = useState(false);
  const [fakeNotFound, setFakeNotFound] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [secretKey, setSecretKey] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Check if super admin already registered
  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await supabase
          .from('report_profiles')
          .select('id')
          .eq('role', 'super_admin')
          .limit(1)
          .maybeSingle();
        if (data) setAdminExists(true);
      } catch (_) {}
      setChecking(false);
    };
    check();
  }, []);

  // ── Step 0: Verify key by comparing hashes ───────────────────────────────────
  const handleVerifyKey = async (e) => {
    e.preventDefault();
    if (locked) return;
    setError('');

    const inputHash = await sha256(secretKey.trim());

    if (inputHash !== PLATFORM_KEY_HASH) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        // Too many wrong attempts — show fake 404 for rest of session
        setLocked(true);
        setFakeNotFound(true);
        return;
      }

      // Show generic error — don't confirm it's a registration form
      setError(`Access denied. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining.`);
      setSecretKey('');
      return;
    }

    setStep(1);
  };

  // ── Step 1: Identity ─────────────────────────────────────────────────────────
  const handleIdentity = (e) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim() || fullName.trim().length < 3) {
      setError('Enter your full name (min. 3 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setStep(2);
  };

  // ── Step 2: Password ─────────────────────────────────────────────────────────
  const handlePasswordStep = (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    handleRegister();
  };

  // ── Register ─────────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { role: 'super_admin', full_name: fullName.trim() },
        },
      });

      if (signUpError) throw signUpError;
      if (!signUpData?.user) throw new Error('Registration failed.');

      const userId = signUpData.user.id;

      // Try profile insert — non-fatal if schema blocks null school_id
      await supabase.from('report_profiles').upsert({
        id: userId,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role: 'super_admin',
        school_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(({ error: pe }) => {
        if (pe) console.warn('[Register] Profile row non-fatal:', pe.message);
      });

      setStep(3);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = (() => {
    if (!password) return { label: '', color: '#334155', w: '0%' };
    if (password.length < 6) return { label: 'Weak', color: '#ef4444', w: '25%' };
    if (password.length < 10) return { label: 'Fair', color: '#f59e0b', w: '50%' };
    if (!/[^a-zA-Z0-9]/.test(password)) return { label: 'Good', color: '#38bdf8', w: '75%' };
    return { label: 'Strong', color: '#10b981', w: '100%' };
  })();

  // ── FAKE 404 — shown after 3 wrong attempts OR if admin already exists ────────
  if (!checking && (fakeNotFound || adminExists)) {
    return (
      <div style={S.page}>
        <div style={{ textAlign: 'center', color: '#334155' }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '6rem', fontWeight: 900, color: '#1e293b', lineHeight: 1 }}>404</div>
          <div style={{ fontSize: '1.1rem', color: '#475569', marginTop: '0.5rem' }}>Page Not Found</div>
          <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '0.5rem' }}>
            The page you're looking for doesn't exist.
          </div>
          <button onClick={() => navigate('/login')} style={{ ...S.ghostBtn, marginTop: '2rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            ← Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div style={S.page}>
        <LogoPreloader fullScreen={false} size="sm" />
      </div>
    );
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={S.iconRing('#10b981', 'rgba(16,185,129,0.12)')}>
              <i className="fas fa-check" style={{ fontSize: '1.5rem' }}></i>
            </div>
            <h1 style={S.title}>Registration Complete</h1>
            <p style={S.sub}>You are now the sole Platform Administrator.</p>
          </div>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>Registered As</div>
            <div style={{ color: 'white', fontWeight: 800 }}>{fullName}</div>
            <div style={{ color: '#38bdf8', fontSize: '0.85rem' }}>{email}</div>
            <span style={{ display: 'inline-block', marginTop: '8px', padding: '0.2rem 0.65rem', borderRadius: '6px', background: 'rgba(13,148,136,0.2)', color: '#2dd4bf', fontSize: '0.7rem', fontWeight: 800 }}>
              ★ PLATFORM SUPER ADMIN
            </span>
          </div>
          <button onClick={() => navigate('/login')} style={S.primaryBtn}>
            <i className="fas fa-rocket"></i> Go to Login
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN FORM ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={{ position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={S.card}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={S.iconRing('#2563eb', 'rgba(37,99,235,0.15)')}>
            <i className="fas fa-shield-halved" style={{ fontSize: '1.5rem' }}></i>
          </div>
          <h1 style={S.title}>Platform Developer Portal</h1>
          <p style={S.sub}>Labour Educational Report System — Internal Admin Registration</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.75rem' }}>
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', fontSize: '0.72rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s',
                  background: i < step ? '#10B981' : i === step ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `2px solid ${i < step ? '#10B981' : i === step ? '#2563eb' : 'rgba(255,255,255,0.08)'}`,
                  color: i < step ? 'white' : i === step ? '#2563eb' : '#475569',
                }}>
                  {i < step ? <i className="fas fa-check" style={{ fontSize: '0.65rem' }}></i> : i + 1}
                </div>
                <div style={{ fontSize: '0.58rem', color: i === step ? '#2563eb' : '#475569', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</div>
              </div>
              {i < STEPS.length - 1 && <div style={{ width: '36px', height: '2px', background: i < step ? '#10B981' : 'rgba(255,255,255,0.06)', margin: '0 4px', marginBottom: '14px', transition: 'background 0.3s' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '0.8rem 1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.83rem', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-triangle-exclamation"></i> {error}
          </div>
        )}

        {/* Step 0 — Key */}
        {step === 0 && (
          <form onSubmit={handleVerifyKey} style={S.form}>
            <div style={{ padding: '0.9rem 1rem', borderRadius: '10px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)', color: '#fbbf24', fontSize: '0.83rem', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <i className="fas fa-lock" style={{ marginTop: '2px', flexShrink: 0 }}></i>
              <span>This is a private, restricted portal. Enter the platform registration key to continue.</span>
            </div>
            <div>
              <label style={S.label}>Registration Key</label>
              <input
                type="password"
                autoFocus
                required
                placeholder="••••••••••••••••••"
                value={secretKey}
                onChange={e => { setSecretKey(e.target.value); setError(''); }}
                style={S.input}
              />
              {attempts > 0 && (
                <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px' }}>
                  {attempts} failed attempt{attempts > 1 ? 's' : ''}
                </div>
              )}
            </div>
            <button type="submit" style={S.primaryBtn}>
              <i className="fas fa-arrow-right"></i> Verify
            </button>
            <button type="button" onClick={() => navigate('/login')} style={S.ghostBtn}>
              ← Back to Login
            </button>
          </form>
        )}

        {/* Step 1 — Identity */}
        {step === 1 && (
          <form onSubmit={handleIdentity} style={S.form}>
            <div>
              <label style={S.label}>Full Name</label>
              <input type="text" required autoFocus placeholder="e.g. Emmanuel Ray" value={fullName} onChange={e => { setFullName(e.target.value); setError(''); }} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Email Address</label>
              <input type="email" required placeholder="you@example.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} style={S.input} />
              <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '4px' }}>This becomes your permanent platform login email.</div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setStep(0)} style={S.ghostBtn}>←</button>
              <button type="submit" style={{ ...S.primaryBtn, flex: 1 }}>Continue <i className="fas fa-arrow-right"></i></button>
            </div>
          </form>
        )}

        {/* Step 2 — Password */}
        {step === 2 && (
          <form onSubmit={handlePasswordStep} style={S.form}>
            <div>
              <label style={S.label}>Create Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} required autoFocus placeholder="Min. 8 characters" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} style={{ ...S.input, paddingRight: '3rem' }} />
                <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}>
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              {password && (
                <>
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', marginTop: '8px' }}>
                    <div style={{ height: '100%', width: pwStrength.w, background: pwStrength.color, transition: 'all 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: pwStrength.color, marginTop: '3px', fontWeight: 700 }}>{pwStrength.label}</div>
                </>
              )}
            </div>
            <div>
              <label style={S.label}>Confirm Password</label>
              <input type={showPassword ? 'text' : 'password'} required placeholder="Re-enter password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} style={{ ...S.input, borderColor: confirmPassword && password !== confirmPassword ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setStep(1)} style={S.ghostBtn}>←</button>
              <button type="submit" disabled={loading} style={{ ...S.primaryBtn, flex: 1, opacity: loading ? 0.7 : 1 }}>
                {loading ? <><i className="fas fa-spinner fa-spin"></i> Registering…</> : <><i className="fas fa-rocket"></i> Complete Registration</>}
              </button>
            </div>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.68rem', color: '#1e293b' }}>
          Labour Group of Companies — Internal Platform Only
        </div>
      </div>
    </div>
  );
};

const S = {
  page: { minHeight: '100vh', background: '#020817', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', fontFamily: "'Inter', sans-serif", position: 'relative' },
  card: { width: '100%', maxWidth: '440px', background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '24px', padding: '2.25rem', boxShadow: '0 30px 70px rgba(0,0,0,0.6)', position: 'relative', zIndex: 1 },
  title: { fontFamily: 'Outfit, sans-serif', fontSize: '1.45rem', fontWeight: 800, color: 'white', margin: '0.65rem 0 0.3rem' },
  sub: { color: '#475569', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 },
  label: { display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: { width: '100%', padding: '0.78rem 1rem', borderRadius: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', padding: '0.82rem', borderRadius: '12px', background: '#09090b', border: '1px solid #27272a', color: 'white', fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 18px rgba(9,9,11,0.5)' },
  ghostBtn: { padding: '0.82rem 1.1rem', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.1rem' },
  iconRing: (color, bg) => ({ width: '56px', height: '56px', borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.65rem' }),
};

export default PlatformDeveloperRegister;
