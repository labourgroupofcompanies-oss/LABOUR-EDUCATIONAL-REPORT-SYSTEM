import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { askHeadteacherAgent } from '../../services/headteacherAgentService';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../lib/db';
import useDraggableButton from '../../hooks/useDraggableButton';

/**
 * Lightweight safe Markdown renderer for Headteacher Copilot
 * Strips raw markdown artifacts (#, *, _) while maintaining clean typography.
 */
const renderMarkdown = (text) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let inTable = false;
  let tableRows = [];

  const flushTable = (keyPrefix) => {
    if (tableRows.length > 0) {
      const isHeader = tableRows[0];
      const dataRows = tableRows.slice(2);

      elements.push(
        <div key={`${keyPrefix}-tbl`} style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
          <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', border: '1px solid #E4E4E7', background: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#f4f4f5', borderBottom: '1.5px solid #E4E4E7' }}>
                {isHeader.split('|').filter(c => c.trim()).map((col, idx) => (
                  <th key={idx} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800, color: '#18181b' }}>
                    {formatInline(col.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderBottom: '1px solid #f4f4f5', background: rIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  {row.split('|').filter(c => c.trim()).map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: '6px 10px', color: '#27272a' }}>
                      {formatInline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
    inTable = false;
  };

  const formatInline = (str) => {
    if (!str) return '';
    const parts = [];
    let idx = 0;

    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(renderBasicFormatting(str.substring(lastIndex, match.index), idx++));
      }
      const label = match[1];
      const url = match[2];
      parts.push(
        <Link
          key={idx++}
          to={url}
          style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}
        >
          {label}
        </Link>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < str.length) {
      parts.push(renderBasicFormatting(str.substring(lastIndex), idx++));
    }

    return parts.length > 0 ? parts : str;
  };

  const renderBasicFormatting = (text, key) => {
    if (!text) return text;

    const tokenRegex = /(`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g;
    const segments = [];
    let last = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > last) {
        const plain = text.substring(last, match.index).replace(/[*#_`]/g, '');
        if (plain) segments.push(plain);
      }

      if (match[2]) {
        segments.push(
          <code key={`${key}-c-${match.index}`} style={{
            background: '#f4f4f5',
            color: '#09090b',
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '0.85em',
            fontWeight: 600,
            fontFamily: 'monospace'
          }}>
            {match[2]}
          </code>
        );
      } else if (match[3]) {
        segments.push(
          <strong key={`${key}-b-${match.index}`} style={{ fontWeight: 700, color: '#09090b' }}>
            {match[3].replace(/[*#_`]/g, '')}
          </strong>
        );
      } else if (match[4] || match[5]) {
        const italicContent = (match[4] || match[5]).replace(/[*#_`]/g, '');
        segments.push(
          <span key={`${key}-i-${match.index}`} style={{ fontStyle: 'italic', color: '#52525b' }}>
            {italicContent}
          </span>
        );
      }
      last = tokenRegex.lastIndex;
    }

    if (last < text.length) {
      const remaining = text.substring(last).replace(/[*#_`]/g, '');
      if (remaining) segments.push(remaining);
    }

    return segments.length > 0 ? segments : text.replace(/[*#_`]/g, '');
  };

  lines.forEach((line, index) => {
    let trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableRows.push(trimmed);
      return;
    } else if (inTable) {
      flushTable(index);
    }

    // Clean headings: strip # symbols
    if (/^#{1,6}\s+/.test(trimmed)) {
      const headingLevel = trimmed.match(/^(#{1,6})\s+/)[1].length;
      const headingText = trimmed.replace(/^#{1,6}\s+/, '').replace(/^[*_]+|[*_]+$/g, '');

      if (headingLevel <= 3) {
        elements.push(
          <h4 key={index} style={{ margin: '0.75rem 0 0.35rem', fontSize: '0.95rem', fontWeight: 800, color: '#09090b' }}>
            {formatInline(headingText)}
          </h4>
        );
      } else {
        elements.push(
          <h5 key={index} style={{ margin: '0.6rem 0 0.3rem', fontSize: '0.86rem', fontWeight: 800, color: '#27272a' }}>
            {formatInline(headingText)}
          </h5>
        );
      }
      return;
    }

    // Unordered lists (- or • or *)
    if (/^[-•*]\s+/.test(trimmed)) {
      const listContent = trimmed.replace(/^[-•*]\s+/, '');
      elements.push(
        <div key={index} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '0.83rem', lineHeight: 1.5, color: '#27272a' }}>
          <span style={{ color: '#2563eb', fontWeight: 'bold' }}>&bull;</span>
          <span style={{ flex: 1 }}>{formatInline(listContent)}</span>
        </div>
      );
      return;
    }

    // Ordered numbered lists (1. or 2.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const numberMatch = trimmed.match(/^(\d+)\.\s+/)[1];
      const listContent = trimmed.replace(/^\d+\.\s+/, '');
      elements.push(
        <div key={index} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '0.83rem', lineHeight: 1.5, color: '#27272a' }}>
          <span style={{ color: '#2563eb', fontWeight: 700, minWidth: '16px' }}>{numberMatch}.</span>
          <span style={{ flex: 1 }}>{formatInline(listContent)}</span>
        </div>
      );
      return;
    }

    if (trimmed === '') {
      elements.push(<div key={index} style={{ height: '6px' }} />);
      return;
    }

    elements.push(
      <p key={index} style={{ margin: '4px 0', fontSize: '0.84rem', lineHeight: 1.55, color: '#18181b' }}>
        {formatInline(trimmed)}
      </p>
    );
  });

  if (inTable) {
    flushTable('last');
  }

  return elements;
};

const HeadteacherCopilotDrawer = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Smooth dragging for the floating launcher button
  const {
    buttonRef,
    position,
    isActivelyDragging,
    handleMouseDown,
    handleTouchStart,
    preventClickIfDragged
  } = useDraggableButton('ht_copilot_icon_pos');

  // Strictly restricted to headteacher (super_admin role within school context)
  const isHeadteacher = user?.role === 'super_admin' && !!user?.schoolId;

  // Real-time school info for drawer header
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null,
    [user?.schoolId]
  );

  // Unreleased reports badge count
  const unreleasedReports = useLiveQuery(
    async () => {
      if (!user?.schoolId) return 0;
      try {
        const sId = String(user.schoolId);
        return await db.reportSummaries
          .filter(r => String(r.schoolId || r.school_id) === sId && (r.isReleased === 0 || r.isReleased === false))
          .count();
      } catch {
        return 0;
      }
    },
    [user?.schoolId]
  );

  const initialWelcomeText = `### 👋 Welcome Headteacher!
Ask me anything you want from your portal and I will help you do it! Whether you need to check teacher score submissions, release report cards to parents, register students, top up your wallet, or need step-by-step guidance on any activity in **${schoolInfo?.name || 'Your School'}**, I am here to assist you anytime with instant answers.`;

  const [messages, setMessages] = useState([
    {
      sender: 'agent',
      text: initialWelcomeText,
      suggestions: [
        'Score submission status',
        'Are report cards released?',
        'Class enrollment breakdown',
        'Teacher assignments',
        'School wallet balance'
      ],
      queryTimeMs: 8
    }
  ]);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isHeadteacher) {
    return null;
  }

  const handleSend = async (questionText) => {
    const textToSend = questionText || query;
    if (!textToSend.trim() || loading || !user?.schoolId) return;

    const userMessage = { sender: 'user', text: textToSend.trim() };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await askHeadteacherAgent(textToSend, user.schoolId);
      setMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: response.text,
          suggestions: response.suggestions,
          queryTimeMs: response.queryTimeMs
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: `### ⚠️ Could Not Retrieve Information\nWe were unable to load this information right now. Your school records remain completely safe. Please check your internet connection and try asking again.`,
          suggestions: ['Score submission status', 'Class enrollment breakdown', 'Are report cards released?']
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .ht-copilot-chip {
          background: #ffffff;
          border: 1px solid #E4E4E7;
          color: #27272a;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          white-space: nowrap;
        }
        .ht-copilot-chip:hover {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .copilot-ht-launcher {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9998;
        }
        .copilot-ht-drawer {
          width: 100%;
          max-width: 460px;
          height: 100%;
          background: #ffffff;
          box-shadow: -10px 0 40px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (max-width: 768px) {
          .copilot-ht-launcher {
            bottom: 84px !important;
            right: 16px !important;
          }
          .copilot-ht-drawer {
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* ── Floating Circular Launcher Button (Icon-Only, Draggable) ── */}
      <div
        ref={buttonRef}
        className="copilot-ht-launcher no-print"
        style={position ? {
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          bottom: 'auto',
          right: 'auto',
          zIndex: 9998,
          touchAction: 'none'
        } : { touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <button
          type="button"
          onClick={(e) => {
            if (preventClickIfDragged(e)) return;
            setIsOpen(!isOpen);
          }}
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #09090b 0%, #1e3a8a 100%)',
            color: '#ffffff',
            border: '2px solid rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isActivelyDragging ? 'grabbing' : 'grab',
            boxShadow: isActivelyDragging 
              ? '0 16px 36px rgba(9, 9, 11, 0.5)' 
              : '0 10px 25px rgba(9, 9, 11, 0.35)',
            fontSize: '1.25rem',
            transition: isActivelyDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s',
            transform: isOpen ? 'scale(0.92)' : (isActivelyDragging ? 'scale(1.08)' : 'scale(1)'),
            position: 'relative',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
          onMouseEnter={(e) => { if (!isActivelyDragging) e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)'; }}
          onMouseLeave={(e) => { if (!isActivelyDragging) e.currentTarget.style.transform = isOpen ? 'scale(0.92)' : 'scale(1)'; }}
          title={`Headteacher Copilot (${schoolInfo?.name || 'School Operations'}) - Drag to move`}
          aria-label="Open Headteacher Copilot"
        >
          <i className="fas fa-robot" />

          {/* Unreleased report indicator badge */}
          {unreleasedReports > 0 ? (
            <span
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                minWidth: '18px',
                height: '18px',
                borderRadius: '999px',
                background: '#F59E0B',
                color: '#ffffff',
                fontSize: '0.65rem',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                border: '1.5px solid #ffffff'
              }}
              title={`${unreleasedReports} report card(s) ready for release`}
            >
              {unreleasedReports > 9 ? '9+' : unreleasedReports}
            </span>
          ) : (
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#10B981',
                boxShadow: '0 0 0 2px #ffffff'
              }}
              title="Local School Intelligence Online"
            />
          )}
        </button>
      </div>

      {/* ── Slide-over Drawer Panel ── */}
      {isOpen && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99998,
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            className="copilot-ht-drawer"
          >
            <style>{`
              @keyframes drawerSlideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}</style>

            {/* ── Drawer Header ── */}
            <div style={{
              padding: '1.1rem 1.25rem',
              background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #27272a',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
                }}>
                  <i className="fas fa-robot" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
                    Headteacher Copilot
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#10B981'
                    }} />
                    <span>{schoolInfo?.name || 'Local School Context'} • Private &amp; Secure</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setMessages([messages[0]])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                  title="Clear Chat History"
                >
                  <i className="fas fa-rotate-left" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#a1a1aa',
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '6px'
                  }}
                  title="Close Drawer"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            {/* Unreleased Reports Alert Banner */}
            {unreleasedReports > 0 && (
              <div style={{
                background: '#FFFBEB',
                borderBottom: '1px solid #FEF3C7',
                padding: '8px 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#92400E',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-clipboard-check" style={{ color: '#F59E0B' }} />
                  <span><strong>{unreleasedReports} report card(s)</strong> awaiting release</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSend('Are report cards released?')}
                  style={{
                    background: '#F59E0B',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Inspect
                </button>
              </div>
            )}

            {/* ── Chat Feed ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: '#FAFAFA'
              }}
            >
              {messages.map((m, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '88%',
                        borderRadius: m.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        padding: m.sender === 'user' ? '0.65rem 0.95rem' : '0.85rem 1rem',
                        background: m.sender === 'user' ? '#09090b' : '#ffffff',
                        color: m.sender === 'user' ? '#ffffff' : '#18181b',
                        fontSize: '0.82rem',
                        lineHeight: 1.45,
                        border: m.sender === 'user' ? 'none' : '1px solid #E4E4E7',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                      }}
                    >
                      {m.sender === 'user' ? (
                        <span>{m.text}</span>
                      ) : (
                        renderMarkdown(m.text)
                      )}
                    </div>
                  </div>

                  {m.queryTimeMs !== undefined && (
                    <div style={{
                      fontSize: '0.65rem',
                      color: '#a1a1aa',
                      paddingLeft: m.sender === 'user' ? '0' : '4px',
                      textAlign: m.sender === 'user' ? 'right' : 'left'
                    }}>
                      ⚡ Verified School Records
                    </div>
                  )}

                  {/* Suggestion Chips */}
                  {m.suggestions && m.suggestions.length > 0 && idx === messages.length - 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {m.suggestions.map((s, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          className="ht-copilot-chip"
                          onClick={() => handleSend(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#71717a', fontSize: '0.8rem', padding: '0.5rem' }}>
                  <i className="fas fa-spinner fa-spin" style={{ color: '#2563eb' }} />
                  <span>Analyzing school records...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Bar ── */}
            <div style={{
              padding: '0.85rem 1rem',
              background: '#ffffff',
              borderTop: '1px solid #E4E4E7',
              flexShrink: 0
            }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <input
                  type="text"
                  placeholder="Ask about scores, learners, reports, teachers, wallet..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.65rem 0.95rem',
                    borderRadius: '10px',
                    border: '1.5px solid #E4E4E7',
                    fontSize: '0.85rem',
                    outline: 'none',
                    background: '#FAFAFA',
                    color: '#18181b'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#E4E4E7'}
                />
                <button
                  type="submit"
                  disabled={!query.trim() || loading}
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    width: '38px',
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    opacity: (!query.trim() || loading) ? 0.5 : 1,
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  <i className="fas fa-paper-plane" style={{ fontSize: '0.85rem' }} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HeadteacherCopilotDrawer;
