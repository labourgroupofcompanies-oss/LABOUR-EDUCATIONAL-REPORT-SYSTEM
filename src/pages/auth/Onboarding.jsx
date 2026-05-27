import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';

// ── Step indicators ───────────────────────────────────────────────────────────
const STEPS = [
  { num: 1, label: 'School Details', icon: 'fa-school' },
  { num: 2, label: 'Admin Account',  icon: 'fa-user-shield' },
  { num: 3, label: 'Confirmation',   icon: 'fa-check-circle' },
];

// ── Generate a short school ID ────────────────────────────────────────────────
const makeSchoolId = (name) => {
  const initials = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4);
  const suffix   = Math.floor(1000 + Math.random() * 9000);
  return `SCH-${initials}${suffix}`;
};

// ═════════════════════════════════════════════════════════════════════════════
const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  // Step 1 — School
  const [school, setSchool] = useState({
    name: '', location: '', district: '', region: '', circuit: '',
  });

  // Step 2 — Admin
  const [admin, setAdmin] = useState({
    fullName: '', staffId: '', email: '', password: '', confirm: '',
  });

  // ── Navigation ─────────────────────────────────────────────────────────────
  const next = () => { setError(''); setStep(s => s + 1); };
  const back = () => { setError(''); setStep(s => s - 1); };

  // ── Step 1 validation ──────────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!school.name.trim())     { setError('School name is required.'); return false; }
    if (!school.location.trim()) { setError('School location is required.'); return false; }
    return true;
  };

  // ── Step 2 validation ──────────────────────────────────────────────────────
  const validateStep2 = () => {
    if (!admin.fullName.trim()) { setError('Full name is required.'); return false; }
    if (!admin.email.trim())    { setError('Email address is required.'); return false; }
    if (admin.password.length < 6) { setError('Password must be at least 6 characters.'); return false; }
    if (admin.password !== admin.confirm) { setError('Passwords do not match.'); return false; }
    return true;
  };

  // ── Final submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const schoolId = makeSchoolId(school.name);

      // 1. Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email:    admin.email,
        password: admin.password,
        options: {
          data: {
            full_name: admin.fullName,
            school_id: schoolId,
            role:      'super_admin',
          }
        }
      });
      if (authError) throw new Error(authError.message);

      // 2 & 3. Insert school and admin profile atomically via RPC to bypass RLS restrictions
      const { error: rpcError } = await supabase.rpc('register_school_and_admin', {
        p_school_id: schoolId,
        p_school_name: school.name,
        p_location: school.location,
        p_district: school.district || null,
        p_region: school.region || null,
        p_circuit: school.circuit || null,
        p_admin_id: authData.user.id,
        p_full_name: admin.fullName,
        p_email: admin.email,
        p_staff_id: admin.staffId || 'ADM-001'
      });
      if (rpcError) throw new Error(rpcError.message);

      // 4. Seed local Dexie DB for offline use
      await db.schools.put({ id: schoolId, name: school.name, location: school.location, district: school.district || null, region: school.region || null, circuit: school.circuit || null });
      await db.profiles.put({
        id: authData.user.id, schoolId, fullName: admin.fullName,
        staffId: admin.staffId || 'ADM-001', email: admin.email, role: 'super_admin',
      });

      setDone(true);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const styles = `
    .ob-wrap{min-height:100vh;background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#0d9488 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;}
    .ob-card{background:#fff;border-radius:24px;width:100%;max-width:560px;box-shadow:0 30px 80px rgba(0,0,0,0.35);overflow:hidden;animation:obIn .35s cubic-bezier(.34,1.56,.64,1) both;}
    @keyframes obIn{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:none}}
    .ob-header{background:linear-gradient(135deg,#0f172a,#1e293b);padding:2rem 2rem 1.5rem;color:white;}
    .ob-steps{display:flex;gap:0;margin-bottom:1.5rem;}
    .ob-step{flex:1;display:flex;flex-direction:column;align-items:center;position:relative;}
    .ob-step:not(:last-child)::after{content:'';position:absolute;top:18px;left:calc(50% + 18px);right:calc(-50% + 18px);height:2px;background:rgba(255,255,255,.15);}
    .ob-step.done::after,.ob-step.active::after{background:rgba(13,148,136,.6);}
    .ob-dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700;margin-bottom:.4rem;transition:all .3s;}
    .ob-dot.pending{background:rgba(255,255,255,.1);color:rgba(255,255,255,.4);}
    .ob-dot.active{background:#0d9488;color:white;box-shadow:0 0 0 4px rgba(13,148,136,.3);}
    .ob-dot.done{background:#10b981;color:white;}
    .ob-step-lbl{font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.45);}
    .ob-step.active .ob-step-lbl,.ob-step.done .ob-step-lbl{color:rgba(255,255,255,.8);}
    .ob-body{padding:2rem;}
    .ob-title{font-size:1.15rem;font-weight:700;color:#0f172a;margin:0 0 .3rem;}
    .ob-sub{font-size:.82rem;color:#64748b;margin:0 0 1.5rem;}
    .ob-field{margin-bottom:1rem;}
    .ob-label{display:block;font-size:.75rem;font-weight:600;color:#475569;margin-bottom:.35rem;text-transform:uppercase;letter-spacing:.03em;}
    .ob-input{width:100%;padding:.7rem 1rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.95rem;font-family:inherit;color:#0f172a;outline:none;transition:border-color .2s,box-shadow .2s;background:#fff;}
    .ob-input:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.1);}
    .ob-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
    @media(max-width:480px){.ob-row{grid-template-columns:1fr;}.ob-body{padding:1.5rem;}.ob-header{padding:1.5rem 1.5rem 1rem;}}
    .ob-error{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:.7rem 1rem;color:#dc2626;font-size:.82rem;margin-bottom:1rem;display:flex;align-items:center;gap:8px;}
    .ob-btn-primary{width:100%;padding:.85rem;background:linear-gradient(135deg,#0d9488,#0f766e);color:white;border:none;border-radius:12px;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;transition:opacity .2s,transform .15s;}
    .ob-btn-primary:hover:not(:disabled){opacity:.92;transform:translateY(-1px);}
    .ob-btn-primary:disabled{opacity:.6;cursor:not-allowed;}
    .ob-btn-ghost{width:100%;padding:.8rem;background:#f1f5f9;color:#475569;border:none;border-radius:12px;font-size:.95rem;font-weight:600;font-family:inherit;cursor:pointer;transition:background .2s;}
    .ob-btn-ghost:hover{background:#e2e8f0;}
    .ob-divider{border:none;border-top:1px solid #f1f5f9;margin:1.25rem 0;}
    .ob-success-icon{width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#0d9488,#10b981);display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;box-shadow:0 10px 30px rgba(13,148,136,.3);animation:pop .4s cubic-bezier(.34,1.56,.64,1) .1s both;}
    @keyframes pop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
    .ob-info-row{display:flex;align-items:center;gap:10px;padding:.65rem .9rem;background:#f8fafc;border-radius:10px;margin-bottom:.5rem;font-size:.85rem;}
    .ob-info-icon{width:30px;height:30px;border-radius:8px;background:rgba(13,148,136,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  `;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="ob-wrap">
      <style>{styles}</style>

      <div className="ob-card">
        {/* ── Header with Steps ── */}
        <div className="ob-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
            <div style={{ width: 40, height: 40, background: 'white', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '2px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: '1rem', color: 'white' }}>Labour Edu</div>
              <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.45)' }}>School Registration</div>
            </div>
          </div>

          <div className="ob-steps">
            {STEPS.map(s => {
              const state = step === s.num ? 'active' : step > s.num ? 'done' : 'pending';
              return (
                <div key={s.num} className={`ob-step ${state}`}>
                  <div className={`ob-dot ${state}`}>
                    {state === 'done'
                      ? <i className="fas fa-check"></i>
                      : <i className={`fas ${s.icon}`}></i>}
                  </div>
                  <span className="ob-step-lbl">{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="ob-body">
          {error && (
            <div className="ob-error">
              <i className="fas fa-exclamation-triangle"></i>{error}
            </div>
          )}

          {/* ══ STEP 1: School Details ══ */}
          {step === 1 && (
            <>
              <p className="ob-title">Tell us about your school</p>
              <p className="ob-sub">This information will appear on all generated reports.</p>

              <div className="ob-field">
                <label className="ob-label">School Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input className="ob-input" placeholder="e.g. Labour Basic School"
                  value={school.name} onChange={e => setSchool({ ...school, name: e.target.value })} />
              </div>

              <div className="ob-field">
                <label className="ob-label">Location / Town <span style={{ color: '#ef4444' }}>*</span></label>
                <input className="ob-input" placeholder="e.g. Accra, Ghana"
                  value={school.location} onChange={e => setSchool({ ...school, location: e.target.value })} />
              </div>

              <div className="ob-row">
                <div className="ob-field" style={{ marginBottom: 0 }}>
                  <label className="ob-label">District</label>
                  <input className="ob-input" placeholder="e.g. Ayawaso East"
                    value={school.district} onChange={e => setSchool({ ...school, district: e.target.value })} />
                </div>
                <div className="ob-field" style={{ marginBottom: 0 }}>
                  <label className="ob-label">Region</label>
                  <input className="ob-input" placeholder="e.g. Greater Accra"
                    value={school.region} onChange={e => setSchool({ ...school, region: e.target.value })} />
                </div>
              </div>

              <div className="ob-field" style={{ marginTop: '1rem' }}>
                <label className="ob-label">Circuit (optional)</label>
                <input className="ob-input" placeholder="e.g. Adabraka Circuit"
                  value={school.circuit} onChange={e => setSchool({ ...school, circuit: e.target.value })} />
              </div>

              <hr className="ob-divider" />
              <button className="ob-btn-primary" onClick={() => { if (validateStep1()) next(); }}>
                <span>Continue</span><i className="fas fa-arrow-right"></i>
              </button>
            </>
          )}

          {/* ══ STEP 2: Admin Account ══ */}
          {step === 2 && (
            <>
              <p className="ob-title">Create the Headteacher account</p>
              <p className="ob-sub">This account will have full admin access to your school's data.</p>

              <div className="ob-field">
                <label className="ob-label">Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input className="ob-input" placeholder="e.g. Mr. Kwame Asante"
                  value={admin.fullName} onChange={e => setAdmin({ ...admin, fullName: e.target.value })} />
              </div>

              <div className="ob-field">
                <label className="ob-label">Staff ID</label>
                <input className="ob-input" placeholder="e.g. ADM-001 (optional)"
                  value={admin.staffId} onChange={e => setAdmin({ ...admin, staffId: e.target.value })} />
              </div>

              <div className="ob-field">
                <label className="ob-label">Email Address <span style={{ color: '#ef4444' }}>*</span></label>
                <input className="ob-input" type="email" placeholder="headteacher@school.edu.gh"
                  value={admin.email} onChange={e => setAdmin({ ...admin, email: e.target.value })} />
              </div>

              <div className="ob-row">
                <div className="ob-field" style={{ marginBottom: 0 }}>
                  <label className="ob-label">Password <span style={{ color: '#ef4444' }}>*</span></label>
                  <input className="ob-input" type="password" placeholder="Min. 6 characters"
                    value={admin.password} onChange={e => setAdmin({ ...admin, password: e.target.value })} />
                </div>
                <div className="ob-field" style={{ marginBottom: 0 }}>
                  <label className="ob-label">Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
                  <input className="ob-input" type="password" placeholder="Repeat password"
                    value={admin.confirm} onChange={e => setAdmin({ ...admin, confirm: e.target.value })} />
                </div>
              </div>

              {/* Password strength indicator */}
              {admin.password && (
                <div style={{ marginTop: '.75rem', display: 'flex', gap: 4 }}>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: admin.password.length > i * 3 + 2 ? (admin.password.length > 10 ? '#10b981' : admin.password.length > 6 ? '#f59e0b' : '#ef4444') : '#e2e8f0', transition: 'background .3s' }} />
                  ))}
                  <span style={{ fontSize: '.7rem', color: '#94a3b8', whiteSpace: 'nowrap', alignSelf: 'center', marginLeft: 6 }}>
                    {admin.password.length > 10 ? 'Strong' : admin.password.length > 6 ? 'Medium' : 'Weak'}
                  </span>
                </div>
              )}

              <hr className="ob-divider" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem' }}>
                <button className="ob-btn-ghost" onClick={back}>
                  <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
                </button>
                <button className="ob-btn-primary" disabled={loading} onClick={() => { if (validateStep2()) handleSubmit(); }}>
                  {loading ? <><i className="fas fa-spinner fa-spin"></i><span>Registering…</span></> : <><i className="fas fa-check"></i><span>Register School</span></>}
                </button>
              </div>
            </>
          )}

          {/* ══ STEP 3: Success ══ */}
          {step === 3 && done && (
            <div style={{ textAlign: 'center', padding: '.5rem 0' }}>
              <div className="ob-success-icon">
                <i className="fas fa-check" style={{ color: 'white', fontSize: '2rem' }}></i>
              </div>
              <h2 style={{ margin: '0 0 .4rem', color: '#0f172a', fontSize: '1.3rem' }}>School Registered! 🎉</h2>
              <p style={{ color: '#64748b', fontSize: '.875rem', marginBottom: '1.5rem' }}>
                Your school has been set up successfully. Check your email to verify your account, then log in.
              </p>

              {/* Summary */}
              <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                <div className="ob-info-row">
                  <div className="ob-info-icon"><i className="fas fa-school" style={{ color: '#0d9488', fontSize: '.8rem' }}></i></div>
                  <div><div style={{ fontSize: '.72rem', color: '#94a3b8' }}>School</div><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{school.name}</div></div>
                </div>
                <div className="ob-info-row">
                  <div className="ob-info-icon"><i className="fas fa-map-marker-alt" style={{ color: '#0d9488', fontSize: '.8rem' }}></i></div>
                  <div><div style={{ fontSize: '.72rem', color: '#94a3b8' }}>Location</div><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{school.location}</div></div>
                </div>
                <div className="ob-info-row">
                  <div className="ob-info-icon"><i className="fas fa-envelope" style={{ color: '#0d9488', fontSize: '.8rem' }}></i></div>
                  <div><div style={{ fontSize: '.72rem', color: '#94a3b8' }}>Admin Email</div><div style={{ fontWeight: 600, fontSize: '.9rem' }}>{admin.email}</div></div>
                </div>
              </div>

              <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: '.75rem 1rem', fontSize: '.8rem', color: '#92400e', marginBottom: '1.5rem', textAlign: 'left' }}>
                <i className="fas fa-envelope-open-text" style={{ marginRight: 6 }}></i>
                A confirmation email has been sent to <strong>{admin.email}</strong>. Please verify your email before logging in.
              </div>

              <button className="ob-btn-primary" onClick={() => navigate('/login')}>
                <i className="fas fa-sign-in-alt"></i>
                <span>Go to Login</span>
              </button>
            </div>
          )}

          {step !== 3 && (
            <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '.8rem', color: '#94a3b8' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: '#0d9488', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
            </p>
          )}
        </div>
      </div>

      <p style={{ color: 'rgba(255,255,255,.3)', fontSize: '.72rem', marginTop: '1.5rem' }}>
        © {new Date().getFullYear()} Labour Edu Report System • Ghana Basic Schools
      </p>
    </div>
  );
};

export default Onboarding;
