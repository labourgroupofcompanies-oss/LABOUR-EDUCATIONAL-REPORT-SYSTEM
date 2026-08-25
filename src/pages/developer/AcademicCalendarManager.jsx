import React, { useState, useEffect, useCallback } from 'react';
import subscriptionService from '../../services/subscriptionService';
import LogoPreloader from '../../components/common/LogoPreloader';

const CATEGORIES = ['GES', 'Private', 'International', 'TVET', 'Pre-School'];

const AcademicCalendarManager = () => {
  const [calendars, setCalendars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState(null);

  const [form, setForm] = useState({
    calendar_name: '',
    academic_year: '2025/2026',
    term: 'Term 3',
    school_category: 'GES',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
    score_entry_deadline: new Date(Date.now() + 53 * 86400000).toISOString().split('T')[0],
    is_active: true,
  });

  const loadCalendars = useCallback(async () => {
    setLoading(true);
    try {
      const data = await subscriptionService.getAcademicCalendars();
      setCalendars(data);
    } catch (err) {
      console.error('[CalendarManager] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendars();
  }, [loadCalendars]);

  const handleOpenModal = (cal = null) => {
    if (cal) {
      setEditingCalendar(cal);
      setForm({
        calendar_name: cal.calendar_name || '',
        academic_year: cal.academic_year || '2025/2026',
        term: cal.term || 'Term 3',
        school_category: cal.school_category || 'GES',
        start_date: cal.start_date || '',
        end_date: cal.end_date || '',
        score_entry_deadline: cal.score_entry_deadline || '',
        is_active: cal.is_active !== undefined ? cal.is_active : true,
      });
    } else {
      setEditingCalendar(null);
      setForm({
        calendar_name: 'GES Official Term 3 2025/2026',
        academic_year: '2025/2026',
        term: 'Term 3',
        school_category: 'GES',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
        score_entry_deadline: new Date(Date.now() + 53 * 86400000).toISOString().split('T')[0],
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...(editingCalendar ? { id: editingCalendar.id } : {}),
      };
      await subscriptionService.saveAcademicCalendar(payload);
      setShowModal(false);
      await loadCalendars();
    } catch (err) {
      alert(`Error saving calendar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this academic calendar?')) return;
    try {
      await subscriptionService.deleteAcademicCalendar(id);
      await loadCalendars();
    } catch (err) {
      alert(`Error deleting calendar: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: 0 }}>
            Platform Academic Calendar Manager
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Platform Admins create and control official academic schedules, term end cutoffs, and 7-day automated reminders.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{
            padding: '0.7rem 1.25rem',
            borderRadius: '10px',
            background: '#2563eb',
            border: 'none',
            color: 'white',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
          }}
        >
          <i className="fas fa-calendar-plus"></i> Create Official Calendar
        </button>
      </div>

      {/* Info Card */}
      <div style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '14px', padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <i className="fas fa-shield-alt" style={{ fontSize: '1.5rem', color: '#2563eb', marginTop: '2px' }}></i>
        <div>
          <div style={{ fontWeight: 800, color: '#2563eb', fontSize: '0.92rem' }}>Platform Governance Policy</div>
          <div style={{ color: '#cbd5e1', fontSize: '0.83rem', marginTop: '3px', lineHeight: 1.5 }}>
            Schools are strictly bound to official academic calendars assigned to their school category (GES, Private, International). Schools cannot modify official term end dates. At official term end, frozen billing snapshots are automatically generated.
          </div>
        </div>
      </div>

      {/* Calendar List */}
      <div style={{ background: '#09090b', borderRadius: '16px', border: '1px solid #27272a', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem 0' }}>
            <LogoPreloader fullScreen={false} size="sm" />
          </div>
        ) : calendars.length === 0 ? (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
            <i className="fas fa-calendar-times" style={{ fontSize: '2.5rem', color: '#475569', marginBottom: '1rem' }}></i>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem' }}>No Academic Calendars Configured</div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Click "Create Official Calendar" to establish baseline term dates.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Calendar Name</th>
                <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                <th style={{ padding: '0.85rem 1rem' }}>Year &amp; Term</th>
                <th style={{ padding: '0.85rem 1rem' }}>Start Date</th>
                <th style={{ padding: '0.85rem 1rem' }}>Official Term End</th>
                <th style={{ padding: '0.85rem 1rem' }}>Score Deadline</th>
                <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {calendars.map((c) => {
                const daysLeft = Math.ceil((new Date(c.end_date) - new Date()) / 86400000);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 800, color: 'white' }}>{c.calendar_name}</div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                        {c.school_category}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#a78bfa' }}>
                      {c.academic_year} — {c.term}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#94a3b8' }}>
                      {c.start_date}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 800, color: '#f43f5e' }}>{c.end_date}</div>
                      <div style={{ fontSize: '0.7rem', color: daysLeft <= 7 ? '#fbbf24' : '#64748b' }}>
                        {daysLeft > 0 ? `${daysLeft} days remaining` : 'Term Ended'}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#94a3b8' }}>
                      {c.score_entry_deadline || '—'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{ color: c.is_active ? '#34d399' : '#64748b', fontWeight: 800 }}>
                        ● {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenModal(c)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', marginRight: '6px' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE/EDIT MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '520px', color: 'white' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 0.25rem', fontSize: '1.4rem' }}>
              {editingCalendar ? 'Edit Official Calendar' : 'Create Official Academic Calendar'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.83rem', margin: '0 0 1.25rem' }}>
              Set official academic term dates for school categories.
            </p>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 700 }}>Calendar Title</label>
                <input
                  type="text"
                  required
                  value={form.calendar_name}
                  onChange={(e) => setForm({ ...form, calendar_name: e.target.value })}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 700 }}>Category</label>
                  <select
                    value={form.school_category}
                    onChange={(e) => setForm({ ...form, school_category: e.target.value })}
                    style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 700 }}>Academic Year</label>
                  <input
                    type="text"
                    required
                    value={form.academic_year}
                    onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                    style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 700 }}>Term</label>
                  <select
                    value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 700 }}>Term Start Date</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#f43f5e', marginBottom: '0.3rem', fontWeight: 700 }}>Official Term End Date</label>
                  <input
                    type="date"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(244,63,94,0.4)', color: 'white' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem', fontWeight: 700 }}>Score Entry Deadline</label>
                <input
                  type="date"
                  value={form.score_entry_deadline}
                  onChange={(e) => setForm({ ...form, score_entry_deadline: e.target.value })}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="is_active" style={{ fontSize: '0.85rem', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600 }}>Set as Active Calendar for this category</label>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: '#2563eb', border: 'none', color: 'white', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicCalendarManager;
