import React, { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../store/AuthContext';
import { getSchoolSupportTickets, createSupportTicket, addTicketMessage } from '../../services/operationsService';
import { supabase } from '../../lib/supabase';
import LogoPreloader from '../../components/common/LogoPreloader';

const CATEGORIES = ['General Support', 'Sync & Data Entry', 'Billing & License', 'Report Release', 'Access & Security'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

const HeadteacherSupport = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;
  const schoolName = user?.schoolName || 'School';
  const messagesEndRef = useRef(null);

  // Data states
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  // UI Filter states
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'active' | 'resolved'
  const [searchFilter, setSearchFilter] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // New Ticket Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('General Support');
  const [newPriority, setNewPriority] = useState('Medium');
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const data = await getSchoolSupportTickets(schoolId);
      setTickets(data || []);
      if (data && data.length > 0 && !selectedTicket) {
        setSelectedTicket(data[0]);
      }
    } catch (err) {
      console.error('[HeadteacherSupport] Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Subscribe to real-time updates on support tickets for this school
  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel('public:platform_support_tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_support_tickets', filter: `school_id=eq.${schoolId}` },
        () => {
          loadTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, loadTickets]);

  // Auto-scroll conversation thread
  useEffect(() => {
    if (selectedTicket?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicket?.messages]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket || sending) return;

    setSending(true);
    try {
      const roleLabel = user?.role === 'teacher' ? 'Teacher' : user?.role === 'super_admin' ? 'Super Admin' : 'Headteacher';
      const senderName = user?.fullName ? `${user.fullName} (${roleLabel})` : roleLabel;
      const updated = await addTicketMessage(selectedTicket.id, selectedTicket.messages, senderName, replyText);
      const newTickets = tickets.map(t => t.id === updated.id ? updated : t);
      setTickets(newTickets);
      setSelectedTicket(updated);
      setReplyText('');
    } catch (err) {
      alert(`Error sending message: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newMessage.trim() || creating) return;

    setCreating(true);
    try {
      const senderInfo = {
        name: user?.fullName || 'User',
        role: user?.role || 'headteacher',
        staffId: user?.staffId || null
      };
      const ticket = await createSupportTicket(
        schoolId,
        schoolName,
        newTitle.trim(),
        newCategory,
        newPriority,
        newMessage.trim(),
        senderInfo
      );
      const updatedList = [ticket, ...tickets];
      setTickets(updatedList);
      setSelectedTicket(ticket);
      setMobileShowChat(true);
      setShowNewModal(false);
      setNewTitle('');
      setNewMessage('');
    } catch (err) {
      alert(`Error submitting support ticket: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  // Filtered tickets
  const filteredTickets = tickets.filter(t => {
    if (activeTab === 'active' && (t.status === 'Resolved' || t.status === 'Closed')) return false;
    if (activeTab === 'resolved' && (t.status !== 'Resolved' && t.status !== 'Closed')) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchCode = (t.ticket_code || '').toLowerCase().includes(q);
      const matchCat = (t.category || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCode && !matchCat) return false;
    }
    return true;
  });

  const openCount = tickets.filter(t => t.status === 'Open' || t.status === 'In Progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;

  return (
    <Layout title="Help & Support">
      <style>{`
        .support-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0.5rem 0;
        }
        .support-grid {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 1.5rem;
          height: 640px;
        }
        @media screen and (max-width: 900px) {
          .support-grid {
            grid-template-columns: 1fr;
            height: auto;
          }
          .mobile-hidden {
            display: none !important;
          }
        }
      `}</style>

      <div className="support-container fade-in">
        
        {/* Minimalist Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.6rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
              Help &amp; Support
            </h1>
            <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '3px 0 0' }}>
              Direct line to Platform Operations for assistance and inquiries.
            </p>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '10px',
              background: '#09090b',
              border: 'none',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(9, 9, 11, 0.25)'
            }}
          >
            <i className="fas fa-plus" style={{ fontSize: '0.8rem' }} />
            <span>New Request</span>
          </button>
        </div>

        {/* Minimalist Summary Badges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem', maxWidth: '720px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '0.85rem 1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: '#71717a', fontWeight: 600 }}>Total Requests</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#09090b' }}>{tickets.length}</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '0.85rem 1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: '#F59E0B', fontWeight: 600 }}>Active</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#F59E0B' }}>{openCount}</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '0.85rem 1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: 600 }}>Resolved</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#10B981' }}>{resolvedCount}</span>
          </div>
        </div>

        {/* Support Grid View */}
        {loading ? (
          <div style={{ padding: '2rem 0', background: '#ffffff', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
            <LogoPreloader fullScreen={false} size="sm" />
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
            <i className="fas fa-headset" style={{ fontSize: '2.5rem', color: '#A1A1AA', marginBottom: '1rem' }} />
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.4rem', color: '#09090b' }}>No Support Requests</h3>
            <p style={{ color: '#71717a', fontSize: '0.85rem', maxWidth: '380px', margin: '0 auto 1.25rem' }}>
              Have questions or need assistance? Submit a request and Platform Operations will help you promptly.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              style={{ padding: '0.65rem 1.25rem', borderRadius: '9px', background: '#09090b', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Submit Support Request
            </button>
          </div>
        ) : (
          <div className="support-grid">
            
            {/* Ticket Roster Sidebar */}
            <div className={`card ${mobileShowChat ? 'mobile-hidden' : ''}`} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem', background: '#ffffff', border: '1px solid #E4E4E7', borderRadius: '16px' }}>
              
              {/* Filter Pills */}
              <div style={{ display: 'flex', background: '#FAFAFA', border: '1px solid #E4E4E7', padding: '3px', borderRadius: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  style={{ flex: 1, border: 'none', padding: '0.35rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: activeTab === 'all' ? '#09090b' : 'transparent', color: activeTab === 'all' ? '#ffffff' : '#71717a' }}
                >
                  All ({tickets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('active')}
                  style={{ flex: 1, border: 'none', padding: '0.35rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: activeTab === 'active' ? '#09090b' : 'transparent', color: activeTab === 'active' ? '#ffffff' : '#71717a' }}
                >
                  Active ({openCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('resolved')}
                  style={{ flex: 1, border: 'none', padding: '0.35rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', background: activeTab === 'resolved' ? '#09090b' : 'transparent', color: activeTab === 'resolved' ? '#ffffff' : '#71717a' }}
                >
                  Resolved ({resolvedCount})
                </button>
              </div>

              {/* Search input */}
              <input
                type="text"
                placeholder="Search ticket..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.8rem', color: '#18181b', background: '#fff', outline: 'none' }}
              />

              {/* Ticket Cards List */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredTickets.map(ticket => {
                  const isSelected = selectedTicket?.id === ticket.id;
                  const statusBg = ticket.status === 'Resolved' ? '#ECFDF5' : ticket.status === 'In Progress' ? '#EFF6FF' : '#FFFBEB';
                  const statusColor = ticket.status === 'Resolved' ? '#10B981' : ticket.status === 'In Progress' ? '#2563eb' : '#F59E0B';

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setMobileShowChat(true);
                      }}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '10px',
                        border: isSelected ? '1.5px solid #2563eb' : '1px solid #E4E4E7',
                        background: isSelected ? '#EFF6FF' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>
                          {ticket.ticket_code || 'TCK-SUPPORT'}
                        </span>
                        <span style={{ padding: '0.1rem 0.45rem', borderRadius: '999px', background: statusBg, color: statusColor, fontSize: '0.65rem', fontWeight: 700 }}>
                          {ticket.status}
                        </span>
                      </div>

                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#09090b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ticket.title}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#71717a', marginTop: '4px' }}>
                        <span>{ticket.category || 'General'}</span>
                        <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conversation Thread */}
            {selectedTicket ? (
              <div className={`card ${!mobileShowChat ? 'mobile-hidden' : ''}`} style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#ffffff', border: '1px solid #E4E4E7', borderRadius: '16px' }}>
                
                {/* Header */}
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E4E4E7', background: '#FAFAFA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setMobileShowChat(false)}
                      style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#09090b', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      ← Back
                    </button>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#09090b', fontFamily: 'Outfit, sans-serif' }}>
                        {selectedTicket.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '2px' }}>
                        {selectedTicket.ticket_code} • {selectedTicket.category || 'General'} • {new Date(selectedTicket.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    background: selectedTicket.status === 'Resolved' ? '#ECFDF5' : selectedTicket.status === 'In Progress' ? '#EFF6FF' : '#FFFBEB',
                    color: selectedTicket.status === 'Resolved' ? '#10B981' : selectedTicket.status === 'In Progress' ? '#2563eb' : '#F59E0B',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}>
                    {selectedTicket.status}
                  </span>
                </div>

                {/* Messages Body */}
                <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#ffffff' }}>
                  
                  {/* Initial Description */}
                  {selectedTicket.description && (
                    <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '0.85rem 1rem', fontSize: '0.88rem', color: '#18181b' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2563eb', marginBottom: '4px' }}>Original Request</div>
                      <div>{selectedTicket.description}</div>
                    </div>
                  )}

                  {/* Messages list */}
                  {(selectedTicket.messages || []).map((msg, i) => {
                    const isOpsAdmin = msg.sender === 'Super Admin' || msg.sender === 'Platform Operations' || msg.sender === 'Support Team' || String(msg.sender).includes('Admin');
                    return (
                      <div
                        key={i}
                        style={{
                          alignSelf: isOpsAdmin ? 'flex-start' : 'flex-end',
                          maxWidth: '80%',
                          background: isOpsAdmin ? '#09090b' : '#2563eb',
                          color: 'white',
                          borderRadius: '12px',
                          padding: '0.75rem 1rem'
                        }}
                      >
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.8, marginBottom: '3px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                          <span>{msg.sender}</span>
                          <span>{msg.time ? new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                        <div style={{ fontSize: '0.88rem', lineHeight: 1.45 }}>{msg.text}</div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Form */}
                <form onSubmit={handleSendReply} style={{ padding: '0.85rem 1rem', borderTop: '1px solid #E4E4E7', background: '#FAFAFA', display: 'flex', gap: '0.6rem' }}>
                  <input
                    type="text"
                    placeholder="Type your response..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ flex: 1, padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.88rem', outline: 'none', color: '#18181b', background: '#fff' }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    style={{
                      padding: '0.65rem 1.25rem',
                      borderRadius: '8px',
                      background: '#09090b',
                      border: 'none',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </form>

              </div>
            ) : null}

          </div>
        )}

        {/* Modal: Create Ticket */}
        {showNewModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
            <div style={{ background: '#ffffff', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid #E4E4E7' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#09090b' }}>
                  Submit Support Request
                </h3>
                <button onClick={() => setShowNewModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', color: '#71717a', cursor: 'pointer' }}>
                  <i className="fas fa-times" />
                </button>
              </div>

              <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#18181b', marginBottom: '0.3rem' }}>Subject</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Assistance with terminal report publishing"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.88rem', color: '#18181b' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#18181b', marginBottom: '0.3rem' }}>Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.82rem', background: '#ffffff', color: '#18181b' }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#18181b', marginBottom: '0.3rem' }}>Priority</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.82rem', background: '#ffffff', color: '#18181b' }}
                    >
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#18181b', marginBottom: '0.3rem' }}>Description</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe your request..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.88rem', fontFamily: 'inherit', resize: 'vertical', color: '#18181b' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    style={{ padding: '0.6rem 1.1rem', borderRadius: '8px', background: 'transparent', border: '1px solid #E4E4E7', color: '#71717a', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    style={{ padding: '0.6rem 1.35rem', borderRadius: '8px', background: '#09090b', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: creating ? 'not-allowed' : 'pointer' }}
                  >
                    {creating ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default HeadteacherSupport;
