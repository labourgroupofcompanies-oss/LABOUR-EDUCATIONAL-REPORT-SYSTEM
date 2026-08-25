import React, { useState, useEffect } from 'react';
import { getApiVersions, updateApiVersionStage, createApiVersion } from '../../services/developerService';
import LogoPreloader from '../../components/common/LogoPreloader';

const STAGES = ['Draft', 'Preview', 'Active', 'Deprecated', 'Sunset', 'Retired'];

const getStageBadgeStyle = (st) => {
  switch (st) {
    case 'Active':      return { bg: 'rgba(16,185,129,0.15)',  color: '#34d399', border: 'rgba(16,185,129,0.3)' };
    case 'Preview':     return { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8', border: 'rgba(56,189,248,0.3)' };
    case 'Draft':       return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: 'rgba(148,163,184,0.3)' };
    case 'Deprecated':  return { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)' };
    case 'Sunset':      return { bg: 'rgba(239,68,68,0.15)',   color: '#fca5a5', border: 'rgba(239,68,68,0.3)' };
    case 'Retired':     return { bg: 'rgba(100,116,139,0.2)',  color: '#64748b', border: 'rgba(100,116,139,0.3)' };
    default:            return { bg: 'rgba(255,255,255,0.1)',  color: 'white',   border: 'transparent' };
  }
};

const ApiVersionManager = () => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingVersion, setEditingVersion] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [stage, setStage] = useState('Active');
  const [changelog, setChangelog] = useState('');
  const [deprecationDate, setDeprecationDate] = useState('');
  const [sunsetDate, setSunsetDate] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Create form state
  const [newVersion, setNewVersion] = useState('');
  const [newStage, setNewStage] = useState('Draft');
  const [newChangelog, setNewChangelog] = useState('');

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await getApiVersions();
      setVersions(data || []);
    } catch (err) {
      console.error('[ApiVersionManager] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVersions(); }, []);

  const handleOpenEdit = (v) => {
    setEditingVersion(v);
    setStage(v.stage || 'Active');
    setChangelog(v.changelog || '');
    setDeprecationDate(v.deprecation_date ? v.deprecation_date.substring(0, 10) : '');
    setSunsetDate(v.sunset_date ? v.sunset_date.substring(0, 10) : '');
    setIsDefault(v.is_default || false);
  };

  const handleSaveVersion = async (e) => {
    e.preventDefault();
    if (!editingVersion) return;
    setSaving(true);
    try {
      await updateApiVersionStage(
        editingVersion.id, stage, changelog,
        deprecationDate ? new Date(deprecationDate).toISOString() : null,
        sunsetDate ? new Date(sunsetDate).toISOString() : null,
        isDefault
      );
      setEditingVersion(null);
      await loadVersions();
    } catch (err) {
      alert(`Error updating version: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateVersion = async (e) => {
    e.preventDefault();
    if (!newVersion.trim()) return;
    setSaving(true);
    try {
      await createApiVersion({ version: newVersion.trim(), stage: newStage, changelog: newChangelog });
      setShowCreate(false);
      setNewVersion('');
      setNewChangelog('');
      await loadVersions();
    } catch (err) {
      alert(`Error creating version: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: 0 }}>
            API Version Manager &amp; Lifecycle
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Enforce 6-stage lifecycle: Draft → Preview → Active → Deprecated → Sunset → Retired. Schedule deprecation dates.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#2563eb', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <i className="fas fa-plus"></i> New API Version
        </button>
      </div>

      {/* Lifecycle Visual Legend */}
      <div style={{ background: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        {STAGES.map((st, idx) => {
          const s = getStageBadgeStyle(st);
          return (
            <React.Fragment key={st}>
              <div style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem' }}>{idx + 1}.</span> {st}
              </div>
              {idx < STAGES.length - 1 && <i className="fas fa-arrow-right" style={{ color: '#334155', fontSize: '0.8rem' }}></i>}
            </React.Fragment>
          );
        })}
      </div>

      {/* Version Cards */}
      {loading ? (
        <div style={{ padding: '2rem 0' }}>
          <LogoPreloader fullScreen={false} size="sm" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {versions.map(v => {
            const s = getStageBadgeStyle(v.stage);
            return (
              <div key={v.id} style={{ background: '#0f172a', borderRadius: '16px', border: `1px solid ${v.is_default ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`, padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 800, color: 'white' }}>{v.version}</span>
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{v.stage}</span>
                    {v.is_default && (
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, background: 'rgba(13,148,136,0.2)', color: '#2dd4bf', border: '1px solid rgba(13,148,136,0.3)' }}>
                        ★ DEFAULT
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                    {v.changelog || 'No release notes provided.'}
                  </p>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem', color: '#94a3b8', flexWrap: 'wrap' }}>
                    <span>Released: {new Date(v.release_date || v.created_at).toLocaleDateString('en-GH', { dateStyle: 'medium' })}</span>
                    {v.deprecation_date && <span style={{ color: '#fbbf24' }}>Deprecation: {new Date(v.deprecation_date).toLocaleDateString('en-GH', { dateStyle: 'medium' })}</span>}
                    {v.sunset_date && <span style={{ color: '#fca5a5' }}>Sunset: {new Date(v.sunset_date).toLocaleDateString('en-GH', { dateStyle: 'medium' })}</span>}
                  </div>
                </div>
                <button onClick={() => handleOpenEdit(v)} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <i className="fas fa-pen-to-square"></i> Configure
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* EDIT MODAL */}
      {editingVersion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '540px', color: 'white' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 1rem' }}>Configure: {editingVersion.version}</h2>
            <form onSubmit={handleSaveVersion} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Lifecycle Stage</label>
                <select value={stage} onChange={e => setStage(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer' }}>
                <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
                Mark as Primary Default API Gateway Version
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Deprecation Date</label>
                  <input type="date" value={deprecationDate} onChange={e => setDeprecationDate(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Sunset Date</label>
                  <input type="date" value={sunsetDate} onChange={e => setSunsetDate(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Changelog / Release Notes</label>
                <textarea rows={4} value={changelog} onChange={e => setChangelog(e.target.value)} placeholder="Describe additions, breaking changes, or deprecations…" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditingVersion(null)} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '480px', color: 'white' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 1.25rem' }}>Create New API Version</h2>
            <form onSubmit={handleCreateVersion} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Version Number</label>
                <input type="text" required placeholder="e.g. v2.1.0 or v3.0.0-alpha" value={newVersion} onChange={e => setNewVersion(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Initial Stage</label>
                <select value={newStage} onChange={e => setNewStage(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Release Notes</label>
                <textarea rows={3} value={newChangelog} onChange={e => setNewChangelog(e.target.value)} placeholder="Brief description of what's new or changed…" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Creating…' : 'Create Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiVersionManager;
