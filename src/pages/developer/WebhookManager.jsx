import React, { useState, useEffect } from 'react';
import { createWebhook, getWebhooks, toggleWebhookStatus, deleteWebhook, getWebhookDeliveries, retryWebhookDelivery, rotateWebhookSecret } from '../../services/developerService';

const SUPPORTED_EVENTS = [
  'learner.created',
  'learner.updated',
  'teacher.created',
  'teacher.updated',
  'attendance.submitted',
  'scores.submitted',
  'report_card.generated',
  'fees.payment_received',
  'school.created',
  'school.updated'
];

const WebhookManager = () => {
  const [webhooks, setWebhooks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('endpoints');

  // New Webhook Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [environment, setEnvironment] = useState('sandbox');
  const [selectedEvents, setSelectedEvents] = useState(['scores.submitted', 'report_card.generated']);

  // Secret Modal (Displayed Once)
  const [secretModal, setSecretModal] = useState(null);
  const [inspectPayload, setInspectPayload] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const hooks = await getWebhooks();
      setWebhooks(hooks);
      const dels = await getWebhookDeliveries();
      setDeliveries(dels);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    if (!url.trim() || !name.trim()) return;

    try {
      const created = await createWebhook({
        name,
        url,
        environment,
        events: selectedEvents
      });

      setIsCreateOpen(false);
      setName('');
      setUrl('');
      setSecretModal({
        title: 'Webhook Registered & Secret Generated',
        secret: created.rawSecret,
        name: created.name
      });
      loadData();
    } catch (err) {
      alert(`Error creating webhook: ${err.message}`);
    }
  };

  const handleRotateSecret = async (id) => {
    if (!window.confirm('Are you sure you want to regenerate this webhook signing secret? Existing HMAC validations using the old secret will fail.')) return;
    try {
      const rotated = await rotateWebhookSecret(id);
      setSecretModal({
        title: 'Webhook Signing Secret Regenerated',
        secret: rotated.rawSecret,
        name: rotated.name
      });
    } catch (err) {
      alert(`Error regenerating secret: ${err.message}`);
    }
  };

  const handleToggle = async (id, current) => {
    try {
      await toggleWebhookStatus(id, !current);
      loadData();
    } catch (err) {
      alert(`Error toggling webhook: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to DELETE this webhook endpoint?')) return;
    try {
      await deleteWebhook(id);
      loadData();
    } catch (err) {
      alert(`Error deleting webhook: ${err.message}`);
    }
  };

  const handleRetryDelivery = async (deliveryId) => {
    try {
      await retryWebhookDelivery(deliveryId);
      loadData();
    } catch (err) {
      alert(`Error retrying webhook: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: 0 }}>
            Webhook Manager & Event Dispatcher
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Configure real-time event streaming with HMAC-SHA256 signature security, delivery logs, and payload inspection.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
            color: 'white',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)'
          }}
        >
          <i className="fas fa-bolt"></i>
          Register Webhook Endpoint
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setActiveTab('endpoints')}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'endpoints' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
            color: activeTab === 'endpoints' ? '#a78bfa' : '#94a3b8',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          Registered Webhooks ({webhooks.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'history' ? 'rgba(167, 139, 250, 0.15)' : 'transparent',
            color: activeTab === 'history' ? '#a78bfa' : '#94a3b8',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          Delivery Logs & Payload Inspector ({deliveries.length})
        </button>
      </div>

      {/* TAB 1: ENDPOINTS LIST */}
      {activeTab === 'endpoints' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {webhooks.length === 0 ? (
            <div style={{ background: '#0f172a', padding: '4rem 2rem', textAlign: 'center', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b' }}>
              <i className="fas fa-bolt" style={{ fontSize: '2.5rem', color: '#334155', marginBottom: '1rem' }}></i>
              <h3 style={{ color: '#cbd5e1', margin: '0 0 0.5rem' }}>No Webhooks Registered</h3>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>Register an HTTP endpoint to receive real-time updates when score cards or student profiles update.</p>
            </div>
          ) : (
            webhooks.map(wh => (
              <div key={wh.id} style={{
                background: '#0f172a',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.5rem'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'white' }}>{wh.name}</span>
                    <span style={{
                      padding: '0.15rem 0.5rem',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: wh.environment === 'production' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: wh.environment === 'production' ? '#34d399' : '#fbbf24'
                    }}>
                      {wh.environment}
                    </span>
                    <span style={{ color: wh.is_active ? '#34d399' : '#f87171', fontWeight: 700, fontSize: '0.78rem' }}>
                      ● {wh.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#a78bfa', marginBottom: '0.75rem' }}>
                    {wh.url}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {wh.events?.map(evt => (
                      <span key={evt} style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', color: '#cbd5e1' }}>
                        {evt}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleRotateSecret(wh.id)}
                    title="Regenerate signing secret"
                    style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', border: 'none', color: '#38bdf8', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    <i className="fas fa-key"></i> Secret
                  </button>
                  <button
                    onClick={() => handleToggle(wh.id, wh.is_active)}
                    style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: 'none', color: '#e2e8f0', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {wh.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDelete(wh.id)}
                    style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: 'none', color: '#fca5a5', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: DELIVERY LOGS & INSPECTOR */}
      {activeTab === 'history' && (
        <div style={{ background: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '1rem' }}>Event Trigger</th>
                <th style={{ padding: '1rem' }}>Status / Code</th>
                <th style={{ padding: '1rem' }}>Latency</th>
                <th style={{ padding: '1rem' }}>Retries</th>
                <th style={{ padding: '1rem' }}>Timestamp</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    No webhook delivery events logged yet.
                  </td>
                </tr>
              ) : (
                deliveries.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#e2e8f0' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 700, color: '#a78bfa' }}>{d.event}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{d.platform_webhooks?.name || 'Webhook Target'}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        background: d.status === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: d.status === 'success' ? '#34d399' : '#fca5a5'
                      }}>
                        {d.response_status || 500} • {d.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>
                      {d.response_time_ms || 120} ms
                    </td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>
                      {d.retry_count || 0}
                    </td>
                    <td style={{ padding: '1rem', color: '#94a3b8' }}>
                      {new Date(d.created_at).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setInspectPayload(d)}
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.15)', border: 'none', color: '#38bdf8', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Inspect Payload
                        </button>
                        <button
                          onClick={() => handleRetryDelivery(d.id)}
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', border: 'none', color: '#34d399', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Retry Delivery
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* REGISTER WEBHOOK MODAL */}
      {isCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '540px', color: 'white' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 1rem' }}>Register Webhook Endpoint</h2>

            <form onSubmit={handleCreateWebhook} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Webhook Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Report Card Sync Listener"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Payload Target URL (HTTPS)</label>
                <input
                  type="url"
                  required
                  placeholder="https://your-domain.com/webhooks/labour-edu"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
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
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Subscribed Events</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '160px', overflowY: 'auto', background: '#1e293b', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {SUPPORTED_EVENTS.map(evt => (
                    <label key={evt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(evt)}
                        onChange={e => {
                          if (e.target.checked) setSelectedEvents([...selectedEvents, evt]);
                          else setSelectedEvents(selectedEvents.filter(x => x !== evt));
                        }}
                      />
                      {evt}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: '#a78bfa', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}
                >
                  Register Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONE-TIME WEBHOOK SECRET MODAL */}
      {secretModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(167, 139, 250, 0.4)', borderRadius: '24px', padding: '2.5rem', width: '100%', maxWidth: '560px', color: 'white', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 0.5rem' }}>{secretModal.title}</h2>
            <p style={{ color: '#fca5a5', fontSize: '0.85rem', lineHeight: 1.5 }}>
              ⚠️ Store this HMAC-SHA256 signing secret securely. It is encrypted in our database and will <strong>NEVER be shown again</strong>.
            </p>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1rem', margin: '1.5rem 0', fontFamily: 'monospace', color: '#a78bfa', wordBreak: 'break-all' }}>
              {secretModal.secret}
            </div>
            <button
              onClick={() => setSecretModal(null)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#334155', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}
            >
              I have saved the webhook secret
            </button>
          </div>
        </div>
      )}

      {/* PAYLOAD INSPECTOR MODAL */}
      {inspectPayload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '640px', color: 'white' }}>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Webhook Payload Inspector</span>
              <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600 }}>{inspectPayload.event}</span>
            </h3>

            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Header Signature: X-Signature-SHA256</div>
            <pre style={{ background: '#090d16', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', color: '#34d399', fontFamily: 'monospace', fontSize: '0.82rem', margin: '0 0 1rem', overflowX: 'auto' }}>
              {inspectPayload.response_body || JSON.stringify({
                event: inspectPayload.event,
                timestamp: inspectPayload.created_at,
                school_id: "sch_99381a7b",
                data: {
                  learner_id: "lrn_88391a",
                  term: 2,
                  academic_year: "2025/2026",
                  score_updated: true
                }
              }, null, 2)}
            </pre>

            <button
              onClick={() => setInspectPayload(null)}
              style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', background: '#334155', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer' }}
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebhookManager;
