import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupportTickets, createSupportTicket, addTicketMessage, updateSupportTicket, getSchoolsDirectory } from '../../services/operationsService';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import LogoPreloader from '../../components/common/LogoPreloader';

const CATEGORIES = ['General Support', 'Sync & Data Entry', 'Billing & License', 'Report Release', 'Access & Security'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

const OperationsSupportCenter = () => {
  const navigate = useNavigate();
  const { startImpersonation } = useAuth();
  const messagesEndRef = useRef(null);

  const [tickets, setTickets] = useState([]);
  const [schools, setSchools] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // New ticket form
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSchoolId, setNewSchoolId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('General Support');
  const [newPriority, setNewPriority] = useState('Medium');
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tData, sData] = await Promise.all([
        getSupportTickets(),
        getSchoolsDirectory(),
      ]);
      setTickets(tData);
      setSchools(sData);
      if (tData.length > 0 && !selectedTicket) {
        setSelectedTicket(tData[0]);
      }
    } catch (err) {
      console.error('[SupportCenter] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Real-time listener for incoming support tickets and messages
    const channel = supabase
      .channel('ops_support_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_support_tickets' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.messages]);

  const filteredTickets = tickets.filter(t =>
    statusFilter === 'all' || t.status === statusFilter
  );

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket || sending) return;

    setSending(true);
    try {
      const updated = await addTicketMessage(selectedTicket.id, selectedTicket.messages, 'Super Admin', replyText);
      const newTickets = tickets.map(t => t.id === updated.id ? updated : t);
      setTickets(newTickets);
      setSelectedTicket(updated);
      setReplyText('');
    } catch (err) {
      alert(`Error sending reply: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (ticketId, newStatus) => {
    try {
      const updated = await updateSupportTicket(ticketId, { status: newStatus });
      const newTickets = tickets.map(t => t.id === updated.id ? updated : t);
      setTickets(newTickets);
      if (selectedTicket?.id === ticketId) setSelectedTicket(updated);
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newSchoolId || !newTitle || !newMessage) return;
    setCreating(true);
    try {
      const school = schools.find(s => s.id === newSchoolId);
      const ticket = await createSupportTicket(newSchoolId, school?.name || 'Unknown School', newTitle, newCategory, newPriority, newMessage);
      const newTickets = [ticket, ...tickets];
      setTickets(newTickets);
      setSelectedTicket(ticket);
      setShowNewTicket(false);
      setNewSchoolId(''); setNewTitle(''); setNewMessage('');
    } catch (err) {
      alert(`Error creating ticket: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: '#18181b' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
            Support Center &amp; Headteacher Communication
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            {loading ? 'Loading tickets…' : `${tickets.length} total ticket${tickets.length !== 1 ? 's' : ''} — ${tickets.filter(t => t.status === 'Open').length} open`}
          </p>
        </div>
        <button
          onClick={() => setShowNewTicket(true)}
          style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(9,9,11,0.2)' }}
        >
          <i className="fas fa-plus"></i>
          New Support Ticket
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem' }}>

        {/* Ticket Inbox */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          {/* Status filter */}
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #E4E4E7', display: 'flex', gap: '4px', background: '#FAFAFA' }}>
            {['all', 'Open', 'In Progress', 'Resolved'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{ flex: 1, padding: '0.35rem 0.4rem', borderRadius: '6px', border: 'none', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', background: statusFilter === s ? '#09090b' : 'transparent', color: statusFilter === s ? '#FFFFFF' : '#71717a', textTransform: 'capitalize' }}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>

          {/* Ticket List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '540px' }}>
            {loading ? (
              <div style={{ padding: '1rem 0' }}>
                <LogoPreloader fullScreen={false} size="sm" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#71717a', fontSize: '0.82rem' }}>
                No tickets found. Create one to get started.
              </div>
            ) : (
              filteredTickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  style={{ padding: '0.85rem', borderRadius: '10px', background: selectedTicket?.id === t.id ? '#EFF6FF' : '#FFFFFF', border: `1px solid ${selectedTicket?.id === t.id ? '#2563eb' : '#E4E4E7'}`, cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#2563eb', fontWeight: 800 }}>{t.ticket_code}</span>
                    <span style={{ fontSize: '0.65rem', color: t.priority === 'High' || t.priority === 'Urgent' ? '#EF4444' : '#F59E0B', fontWeight: 800 }}>{t.priority}</span>
                  </div>
                  <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.85rem', lineHeight: 1.3 }}>{t.title}</div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '3px' }}>{t.school_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.68rem', color: t.status === 'Resolved' ? '#10B981' : t.status === 'In Progress' ? '#2563eb' : '#F59E0B', fontWeight: 800 }}>
                      ● {t.status}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#71717a' }}>
                      {t.messages?.length || 0} msg{(t.messages?.length || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ticket Conversation */}
        {selectedTicket ? (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', height: '580px', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            {/* Ticket Header */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#FAFAFA' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#2563eb', fontWeight: 800 }}>{selectedTicket.ticket_code}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: selectedTicket.priority === 'High' || selectedTicket.priority === 'Urgent' ? '#EF4444' : '#F59E0B' }}>
                    {selectedTicket.priority} Priority
                  </span>
                </div>
                <h3 style={{ margin: '2px 0 0', color: '#09090b', fontSize: '0.98rem', fontWeight: 800 }}>{selectedTicket.title}</h3>
                <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>School: <strong style={{ color: '#09090b' }}>{selectedTicket.school_name}</strong></span>
                  <span>•</span>
                  <span>Category: {selectedTicket.category}</span>
                  {selectedTicket.sender_name && (
                    <>
                      <span>•</span>
                      <span style={{ color: '#2563eb', fontWeight: 800 }}>
                        <i className="fas fa-user" /> {selectedTicket.sender_name} ({selectedTicket.sender_role || 'headteacher'})
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    if (selectedTicket?.school_id) {
                      const targetRole = selectedTicket.sender_role === 'teacher' ? 'teacher' : 'headteacher';
                      startImpersonation(selectedTicket.school_id, selectedTicket.school_name, targetRole, {
                        fullName: selectedTicket.sender_name || 'Impersonated User',
                        staffId: selectedTicket.sender_staff_id || null
                      });
                      navigate(targetRole === 'teacher' ? '/scores' : '/');
                    }
                  }}
                  title={`Remote Access as ${selectedTicket.sender_role === 'teacher' ? 'Teacher' : 'Headteacher'}`}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    background: '#09090b',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="fas fa-right-to-bracket" /> Access {selectedTicket.sender_role === 'teacher' ? 'Teacher' : 'Headteacher'} Portal
                </button>

                <select
                  value={selectedTicket.status}
                  onChange={e => handleStatusChange(selectedTicket.id, e.target.value)}
                  style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#09090b', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', outline: 'none' }}
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(!selectedTicket.messages || selectedTicket.messages.length === 0) ? (
                <div style={{ textAlign: 'center', color: '#71717a', padding: '2rem', fontSize: '0.82rem' }}>
                  No messages yet. Send the first reply below.
                </div>
              ) : (
                selectedTicket.messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.sender === 'Super Admin' ? 'flex-end' : 'flex-start',
                      maxWidth: '78%',
                      background: msg.sender === 'Super Admin' ? '#09090b' : '#F4F4F5',
                      color: msg.sender === 'Super Admin' ? '#FFFFFF' : '#18181b',
                      padding: '0.75rem 1rem',
                      borderRadius: msg.sender === 'Super Admin' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', opacity: 0.8, marginBottom: '3px', fontWeight: 800 }}>{msg.sender}</div>
                    <div>{msg.text}</div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '4px', textAlign: 'right' }}>
                      {msg.time ? new Date(msg.time).toLocaleString('en-GH', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Box */}
            <form onSubmit={handleSendReply} style={{ padding: '0.85rem 1.1rem', borderTop: '1px solid #E4E4E7', display: 'flex', gap: '8px', background: '#FAFAFA' }}>
              <input
                type="text"
                required
                placeholder={`Reply to ${selectedTicket.school_name}…`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                disabled={sending}
                style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.88rem', outline: 'none' }}
              />
              <button type="submit" disabled={sending || !replyText.trim()} style={{ padding: '0.7rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}>
                {sending ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
              </button>
            </form>
          </div>
        ) : (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', height: '580px', flexDirection: 'column', gap: '0.75rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <i className="fas fa-comments" style={{ fontSize: '2.5rem', color: '#A1A1AA' }}></i>
            <div style={{ fontWeight: 600 }}>Select a ticket from the inbox to view the conversation</div>
          </div>
        )}
      </div>

      {/* NEW TICKET MODAL */}
      {showNewTicket && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '540px', color: '#18181b', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', margin: '0 0 1.25rem', color: '#09090b', fontWeight: 800 }}>Create New Support Ticket</h2>
            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>School</label>
                <select required value={newSchoolId} onChange={e => setNewSchoolId(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}>
                  <option value="">— Select School —</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Ticket Title</label>
                <input type="text" required placeholder="Short description of the issue" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Category</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Priority</label>
                  <select value={newPriority} onChange={e => setNewPriority(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}>
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '0.4rem', fontWeight: 700 }}>Initial Message</label>
                <textarea rows={4} required placeholder="Describe the support request in detail…" value={newMessage} onChange={e => setNewMessage(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', resize: 'vertical', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowNewTicket(false)} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#71717a', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={creating} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, cursor: creating ? 'not-allowed' : 'pointer' }}>
                  {creating ? 'Creating…' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsSupportCenter;
