import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import recycleBinService from '../../services/recycleBinService';

const RecycleBin = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null); // for snapshot preview modal
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'restore' | 'delete' | 'empty', item: Object }
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState(null);

  // Live query for local Dexie items
  const localItems = useLiveQuery(
    () => schoolId ? db.recycleBin.where('schoolId').equals(schoolId).reverse().sortBy('deletedAt') : [],
    [schoolId]
  ) || [];

  // Fetch / sync from Supabase when entering page
  useEffect(() => {
    if (schoolId) {
      recycleBinService.getRecycleBinItems(schoolId).catch(console.warn);
    }
  }, [schoolId]);

  const showToast = (message, type = 'success') => {
    setFeedbackToast({ message, type });
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  const handleRestore = async (item) => {
    setIsProcessing(true);
    try {
      const res = await recycleBinService.restoreFromRecycleBin(item, user);
      if (res.success) {
        showToast(`Successfully restored "${item.entityName}" back to active database!`);
        setConfirmAction(null);
        setSelectedItem(null);
      } else {
        showToast(res.error || 'Failed to restore item.', 'error');
      }
    } catch (err) {
      showToast('Error restoring item: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePermanentDelete = async (item) => {
    setIsProcessing(true);
    try {
      const res = await recycleBinService.permanentlyDelete(item);
      if (res.success) {
        showToast(`Permanently deleted "${item.entityName}".`);
        setConfirmAction(null);
        setSelectedItem(null);
      } else {
        showToast(res.error || 'Failed to permanently delete item.', 'error');
      }
    } catch (err) {
      showToast('Error deleting item: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmptyBin = async () => {
    setIsProcessing(true);
    try {
      const res = await recycleBinService.emptyRecycleBin(schoolId);
      if (res.success) {
        showToast('Recycle Bin has been emptied completely.');
        setConfirmAction(null);
      } else {
        showToast(res.error || 'Failed to empty recycle bin.', 'error');
      }
    } catch (err) {
      showToast('Error emptying recycle bin: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter items based on active tab and search query
  const filteredItems = useMemo(() => {
    return localItems.filter(item => {
      const matchesTab = activeTab === 'all' || item.entityType?.toLowerCase() === activeTab.toLowerCase();
      const matchesSearch = !searchQuery || 
        item.entityName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.entityId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.deletedBy?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [localItems, activeTab, searchQuery]);

  const counts = useMemo(() => {
    const res = { all: localItems.length, learner: 0, teacher: 0, class: 0, subject: 0 };
    localItems.forEach(i => {
      if (res[i.entityType] !== undefined) res[i.entityType]++;
    });
    return res;
  }, [localItems]);

  const calculateDaysLeft = (expiresAtStr) => {
    if (!expiresAtStr) return '30d';
    const expires = new Date(expiresAtStr).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? `${diffDays} days left` : 'Expiring today';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Layout>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.75rem' }}>
            <i className="fa-solid fa-trash-can" style={{ color: 'var(--accent)' }}></i>
            Recycle Bin
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
            Safely recover deleted records or purge them permanently. Items are retained for 30 days.
          </p>
        </div>

        {localItems.length > 0 && (
          <button
            onClick={() => setConfirmAction({ type: 'empty' })}
            style={{
              padding: '0.65rem 1.1rem',
              backgroundColor: 'var(--error-bg)',
              color: 'var(--error)',
              border: '1px solid var(--error-border)',
              borderRadius: 'var(--radius-md)',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'var(--transition)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--error-bg)'}
          >
            <i className="fa-solid fa-dumpster-fire"></i>
            Empty Recycle Bin
          </button>
        )}
      </div>

      {/* Toast Notification */}
      {feedbackToast && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: feedbackToast.type === 'error' ? 'var(--error-bg)' : 'var(--success-bg)',
          color: feedbackToast.type === 'error' ? 'var(--error)' : 'var(--success)',
          border: `1px solid ${feedbackToast.type === 'error' ? 'var(--error-border)' : 'var(--success-border)'}`,
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontWeight: '500'
        }}>
          <i className={`fa-solid ${feedbackToast.type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
          {feedbackToast.message}
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--surface)', padding: '1.2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Total Deleted</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '0.35rem' }}>{counts.all}</div>
        </div>
        <div style={{ background: 'var(--surface)', padding: '1.2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Learners</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--accent)', marginTop: '0.35rem' }}>{counts.learner}</div>
        </div>
        <div style={{ background: 'var(--surface)', padding: '1.2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Retention Period</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--success)', marginTop: '0.35rem' }}>30 Days</div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `All (${counts.all})` },
              { id: 'learner', label: `Learners (${counts.learner})` },
              { id: 'teacher', label: `Teachers (${counts.teacher})` },
              { id: 'class', label: `Classes (${counts.class})` },
              { id: 'subject', label: `Subjects (${counts.subject})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor: activeTab === tab.id ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'var(--text)',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'var(--transition)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '260px' }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
            <input
              type="text"
              placeholder="Search by name, ID or deleter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem 0.55rem 2.3rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                outline: 'none',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>
      </div>

      {/* Responsive styles */}
      <style>{`
        .rb-table-wrap { display: block; }
        .rb-cards-wrap { display: none; }
        @media (max-width: 700px) {
          .rb-table-wrap { display: none; }
          .rb-cards-wrap { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; }
        }
        .rb-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          box-shadow: var(--shadow-sm);
        }
        .rb-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .rb-card-name { font-weight: 700; font-size: 1rem; color: var(--text); line-height: 1.3; }
        .rb-card-reg  { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem; }
        .rb-type-badge {
          display: inline-block;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-sm);
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          background: var(--accent-light);
          color: var(--accent);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .rb-card-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.35rem 1rem;
          font-size: 0.82rem;
          color: var(--text-muted);
        }
        .rb-card-meta span strong { color: var(--text); font-weight: 600; }
        .rb-card-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }
        .rb-card-actions button { flex: 1; justify-content: center; }
        .rb-purge-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.8rem;
          color: var(--warning-hover);
          font-weight: 600;
        }
      `}</style>

      {/* Items List */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-trash-can" style={{ fontSize: '3rem', color: 'var(--border)', marginBottom: '1rem' }}></i>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text)' }}>Recycle Bin is Empty</h3>
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              {searchQuery ? 'No deleted records matched your search query.' : 'There are no deleted items waiting to be recovered.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Desktop Table ── */}
            <div className="rb-table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.92rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '0.85rem 1.25rem' }}>Item Name</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Type</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Deleted Date</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Deleted By</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Auto-Purge In</th>
                    <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'var(--transition)' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.015)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text)' }}>{item.entityName}</div>
                        {item.dataPayload?.learner?.regNumber && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reg: {item.dataPayload.learner.regNumber}</div>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {item.entityType}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{formatDate(item.deletedAt)}</td>
                      <td style={{ padding: '1rem', color: 'var(--text)' }}>
                        <div>{item.deletedBy || 'Admin'}</div>
                        {item.deletedByRole && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.deletedByRole}</div>}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--warning-hover)', fontWeight: '600' }}>
                          <i className="fa-regular fa-clock"></i>
                          {calculateDaysLeft(item.expiresAt)}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button onClick={() => setSelectedItem(item)} title="View Details"
                            style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <i className="fa-solid fa-eye"></i>
                          </button>
                          <button onClick={() => setConfirmAction({ type: 'restore', item })} title="Restore Record"
                            style={{ padding: '0.45rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--success-border)', background: 'var(--success-bg)', color: 'var(--success)', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                            <i className="fa-solid fa-rotate-left"></i> Restore
                          </button>
                          <button onClick={() => setConfirmAction({ type: 'delete', item })} title="Permanently Delete"
                            style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--error-border)', background: 'var(--error-bg)', color: 'var(--error)', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile Cards ── */}
            <div className="rb-cards-wrap">
              {filteredItems.map((item, idx) => (
                <div key={item.id || idx} className="rb-card">
                  {/* Card header: name + type badge */}
                  <div className="rb-card-header">
                    <div>
                      <div className="rb-card-name">{item.entityName}</div>
                      {item.dataPayload?.learner?.regNumber && (
                        <div className="rb-card-reg">Reg: {item.dataPayload.learner.regNumber}</div>
                      )}
                    </div>
                    <span className="rb-type-badge">{item.entityType}</span>
                  </div>

                  {/* Meta info grid */}
                  <div className="rb-card-meta">
                    <span><strong>Deleted:</strong> {formatDate(item.deletedAt)}</span>
                    <span className="rb-purge-badge">
                      <i className="fa-regular fa-clock"></i>
                      {calculateDaysLeft(item.expiresAt)}
                    </span>
                    <span style={{ gridColumn: '1 / -1' }}>
                      <strong>By:</strong> {item.deletedBy || 'Admin'}
                      {item.deletedByRole && <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({item.deletedByRole})</span>}
                    </span>
                  </div>

                  {/* Action buttons — full-width row */}
                  <div className="rb-card-actions">
                    <button
                      onClick={() => setSelectedItem(item)}
                      style={{ padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                      <i className="fa-solid fa-eye"></i> Details
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'restore', item })}
                      style={{ padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--success-border)', background: 'var(--success-bg)', color: 'var(--success)', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                      <i className="fa-solid fa-rotate-left"></i> Restore
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'delete', item })}
                      style={{ padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--error-border)', background: 'var(--error-bg)', color: 'var(--error)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                      <i className="fa-solid fa-trash"></i> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>


      {/* Snapshot Preview Modal */}
      {selectedItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-xl)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedItem.entityName}</h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Snapshot Data Details</span>
              </div>
              <button 
                onClick={() => setSelectedItem(null)}
                style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div><strong>Type:</strong> {selectedItem.entityType}</div>
                <div><strong>Deleted At:</strong> {formatDate(selectedItem.deletedAt)}</div>
                <div><strong>Deleted By:</strong> {selectedItem.deletedBy}</div>
                <div><strong>Auto-Purge:</strong> {calculateDaysLeft(selectedItem.expiresAt)}</div>
              </div>

              {selectedItem.entityType === 'learner' && selectedItem.dataPayload?.learner && (
                <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>Learner Profile</h4>
                  <div><strong>Full Name:</strong> {selectedItem.dataPayload.learner.fullName}</div>
                  <div><strong>Reg Number:</strong> {selectedItem.dataPayload.learner.regNumber || 'N/A'}</div>
                  <div><strong>Gender:</strong> {selectedItem.dataPayload.learner.gender || 'N/A'}</div>
                  <div><strong>Guardian:</strong> {selectedItem.dataPayload.learner.guardianName || 'N/A'} ({selectedItem.dataPayload.learner.guardianPhone || 'N/A'})</div>
                  <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Attached Scores: <strong>{selectedItem.dataPayload.scores?.length || 0}</strong> records | Report Summaries: <strong>{selectedItem.dataPayload.summaries?.length || 0}</strong> records
                  </div>
                </div>
              )}


            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setSelectedItem(null)}
                style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
              >
                Close
              </button>
              <button
                onClick={() => handleRestore(selectedItem)}
                disabled={isProcessing}
                style={{ padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--success)', color: '#fff', fontWeight: '600', cursor: 'pointer' }}
              >
                {isProcessing ? 'Restoring...' : 'Restore Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            maxWidth: '480px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: 'var(--shadow-xl)'
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', color: confirmAction.type === 'restore' ? 'var(--success)' : 'var(--error)' }}>
              {confirmAction.type === 'restore' && 'Restore Deleted Record?'}
              {confirmAction.type === 'delete' && 'Permanently Delete Record?'}
              {confirmAction.type === 'empty' && 'Empty Entire Recycle Bin?'}
            </h3>

            <p style={{ color: 'var(--text)', fontSize: '0.95rem', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
              {confirmAction.type === 'restore' && (
                <>Are you sure you want to restore <strong>{confirmAction.item?.entityName}</strong>? All associated marks and report cards will also be recovered.</>
              )}
              {confirmAction.type === 'delete' && (
                <>Are you sure you want to permanently erase <strong>{confirmAction.item?.entityName}</strong>? This action CANNOT be undone.</>
              )}
              {confirmAction.type === 'empty' && (
                <>Are you sure you want to permanently delete all <strong>{localItems.length} items</strong> from the Recycle Bin? This action cannot be reversed.</>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setConfirmAction(null)}
                disabled={isProcessing}
                style={{ padding: '0.55rem 1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'restore') handleRestore(confirmAction.item);
                  else if (confirmAction.type === 'delete') handlePermanentDelete(confirmAction.item);
                  else if (confirmAction.type === 'empty') handleEmptyBin();
                }}
                disabled={isProcessing}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: confirmAction.type === 'restore' ? 'var(--success)' : 'var(--error)',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {isProcessing ? 'Processing...' : (confirmAction.type === 'restore' ? 'Confirm Restore' : 'Confirm Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default RecycleBin;
