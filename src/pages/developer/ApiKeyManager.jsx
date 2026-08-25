import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { generateApiKey, getApiKeys, rotateApiKey, revokeApiKey, toggleApiKeyStatus } from '../../services/developerService';
import LogoPreloader from '../../components/common/LogoPreloader';

const AVAILABLE_SCOPES = [
  { id: 'read:schools', label: 'Read Schools', desc: 'Inspect school profiles & metadata' },
  { id: 'read:learners', label: 'Read Learners', desc: 'Query learner enrollment lists' },
  { id: 'write:learners', label: 'Write Learners', desc: 'Enroll or update learner records' },
  { id: 'read:scores', label: 'Read Scores', desc: 'Fetch academic assessment marks' },
  { id: 'write:scores', label: 'Write Scores', desc: 'Submit CA and exam scores' },
  { id: 'read:attendance', label: 'Read Attendance', desc: 'Fetch class attendance records' },
  { id: 'write:attendance', label: 'Write Attendance', desc: 'Submit daily class attendance' },
  { id: 'read:financials', label: 'Read Financials', desc: 'Inspect fee billing & payments' },
  { id: 'write:financials', label: 'Write Financials', desc: 'Record student fee payments' },
  { id: 'export:reports', label: 'Export Reports', desc: 'Generate terminal report PDFs' },
  { id: 'manage:webhooks', label: 'Manage Webhooks', desc: 'Register or modify webhooks' },
  { id: 'manage:apikeys', label: 'Manage API Keys', desc: 'Rotate or provision API tokens' },
];

const ApiKeyManager = () => {
  const { activeEnv } = useOutletContext() || { activeEnv: 'production' };
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEnv, setFilterEnv] = useState('all');

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('sandbox');
  const [selectedScopes, setSelectedScopes] = useState(['read:schools', 'read:learners', 'read:scores']);
  const [expiresInDays, setExpiresInDays] = useState('90');

  // Secret Exposure Modal (Only Shown Once)
  const [newKeyModal, setNewKeyModal] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const list = await getApiKeys();
      setKeys(list);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const expiresAt = expiresInDays === 'never'
        ? null
        : new Date(Date.now() + parseInt(expiresInDays) * 86400000).toISOString();

      const created = await generateApiKey({
        name,
        environment,
        scopes: selectedScopes,
        expiresAt
      });

      setIsCreateOpen(false);
      setName('');
      setNewKeyModal({
        title: 'API Key Created Successfully',
        key: created.rawKey,
        name: created.name,
        environment: created.environment
      });
      loadKeys();
    } catch (err) {
      alert(`Error creating API key: ${err.message}`);
    }
  };

  const handleRotateKey = async (id) => {
    if (!window.confirm('Are you sure you want to rotate this key? The old key will immediately stop working.')) return;
    try {
      const rotated = await rotateApiKey(id);
      setNewKeyModal({
        title: 'API Key Rotated Successfully',
        key: rotated.rawKey,
        name: rotated.name,
        environment: rotated.environment
      });
      loadKeys();
    } catch (err) {
      alert(`Error rotating key: ${err.message}`);
    }
  };

  const handleRevokeKey = async (id) => {
    if (!window.confirm('Are you sure you want to REVOKE this key? This action is permanent.')) return;
    try {
      await revokeApiKey(id);
      loadKeys();
    } catch (err) {
      alert(`Error revoking key: ${err.message}`);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await toggleApiKeyStatus(id, !currentStatus);
      loadKeys();
    } catch (err) {
      alert(`Error toggling key: ${err.message}`);
    }
  };

  const handleCopyKey = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredKeys = keys.filter(k => filterEnv === 'all' || k.environment === filterEnv);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: 0 }}>
            API Key Manager
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Provision, scope, rotate, and enforce RLS authorization on platform API tokens.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '12px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
          }}
        >
          <i className="fas fa-key"></i>
          Provision New API Key
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.75rem' }}>
        {['all', 'production', 'sandbox'].map(env => (
          <button
            key={env}
            onClick={() => setFilterEnv(env)}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: filterEnv === env ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: filterEnv === env ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {env === 'all' ? 'All Environments' : env}
          </button>
        ))}
      </div>

      {/* API Keys Table */}
      <div style={{
        background: '#0f172a',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '2rem 0' }}>
            <LogoPreloader fullScreen={false} size="sm" />
          </div>
        ) : filteredKeys.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
            <i className="fas fa-key" style={{ fontSize: '2.5rem', color: '#334155', marginBottom: '1rem' }}></i>
            <h3 style={{ color: '#cbd5e1', margin: '0 0 0.5rem' }}>No API Keys Provisioned</h3>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>Click "Provision New API Key" above to generate a scoped token.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '1rem' }}>Key Name / Prefix</th>
                  <th style={{ padding: '1rem' }}>Env</th>
                  <th style={{ padding: '1rem' }}>Scopes</th>
                  <th style={{ padding: '1rem' }}>Status</th>
                  <th style={{ padding: '1rem' }}>Created</th>
                  <th style={{ padding: '1rem' }}>Expires</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#e2e8f0' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 700, color: 'white' }}>{k.name}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#38bdf8', marginTop: '2px' }}>
                        {k.key_prefix}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        background: k.environment === 'production' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: k.environment === 'production' ? '#34d399' : '#fbbf24'
                      }}>
                        {k.environment}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '240px' }}>
                        {k.scopes?.map(s => (
                          <span key={s} style={{ background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.68rem', color: '#cbd5e1' }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ color: k.is_active ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: k.is_active ? '#34d399' : '#f87171' }}></span>
                        {k.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleToggleStatus(k.id, k.is_active)}
                          title={k.is_active ? 'Disable key' : 'Enable key'}
                          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#cbd5e1', borderRadius: '6px', padding: '0.4rem 0.6rem', cursor: 'pointer' }}
                        >
                          <i className={`fas ${k.is_active ? 'fa-pause' : 'fa-play'}`}></i>
                        </button>
                        <button
                          onClick={() => handleRotateKey(k.id)}
                          title="Rotate key"
                          style={{ background: 'rgba(56,189,248,0.15)', border: 'none', color: '#38bdf8', borderRadius: '6px', padding: '0.4rem 0.6rem', cursor: 'pointer' }}
                        >
                          <i className="fas fa-arrows-rotate"></i>
                        </button>
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          title="Revoke key"
                          style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#fca5a5', borderRadius: '6px', padding: '0.4rem 0.6rem', cursor: 'pointer' }}
                        >
                          <i className="fas fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE API KEY MODAL */}
      {isCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '540px', color: 'white' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 1rem' }}>Generate API Key</h2>
            
            <form onSubmit={handleCreateKey} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Key Name / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ghana Education Service Sync Worker"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Environment</label>
                <select
                  value={environment}
                  onChange={e => setEnvironment(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.9rem' }}
                >
                  <option value="sandbox">Sandbox (Testing)</option>
                  <option value="production">Production (Live)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Granular Scopes</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '180px', overflowY: 'auto', background: '#1e293b', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {AVAILABLE_SCOPES.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(s.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedScopes([...selectedScopes, s.id]);
                          else setSelectedScopes(selectedScopes.filter(x => x !== s.id));
                        }}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Key Expiration</label>
                <select
                  value={expiresInDays}
                  onChange={e => setExpiresInDays(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.9rem' }}
                >
                  <option value="30">30 Days</option>
                  <option value="90">90 Days</option>
                  <option value="365">1 Year</option>
                  <option value="never">Never Expire</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONE-TIME SECRET DISPLAY MODAL */}
      {newKeyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '24px', padding: '2.5rem', width: '100%', maxWidth: '580px', color: 'white', textAlign: 'center' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <i className="fas fa-key"></i>
            </div>
            
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 0.5rem' }}>{newKeyModal.title}</h2>
            <p style={{ color: '#fca5a5', fontSize: '0.85rem', lineHeight: 1.5 }}>
              ⚠️ <strong>SECURITY WARNING:</strong> Copy this API key now. For your security, this key is hashed in our database and will <strong>NEVER be displayed again</strong>.
            </p>

            <div style={{ background: '#1e293b', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '1rem', margin: '1.5rem 0', fontFamily: 'monospace', fontSize: '0.95rem', color: '#38bdf8', wordBreak: 'break-all', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span>{newKeyModal.key}</span>
              <button
                onClick={() => handleCopyKey(newKeyModal.key)}
                style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: copied ? '#10B981' : '#2563eb', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}
              >
                {copied ? 'Copied!' : 'Copy Key'}
              </button>
            </div>

            <button
              onClick={() => setNewKeyModal(null)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#334155', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}
            >
              I have saved this key securely
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeyManager;
