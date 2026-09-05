import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { askOperationsAgent } from '../../services/operationsAgentService';
import { systemErrorTracker } from '../../services/systemErrorTracker';
import useDraggableButton from '../../hooks/useDraggableButton';

// Lightweight safe Markdown renderer for chat responses
const renderMarkdown = (text) => {
  if (!text) return null;

  // Split lines
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
          onClick={(e) => {
            // Keep drawer open or allow navigation
          }}
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

const OperationsCopilotDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [unresolvedCount, setUnresolvedCount] = useState(() => systemErrorTracker.getUnresolvedErrors().length);

  // Smooth dragging for the floating launcher button
  const {
    buttonRef,
    position,
    isActivelyDragging,
    handleMouseDown,
    handleTouchStart,
    preventClickIfDragged
  } = useDraggableButton('ops_copilot_icon_pos');

  useEffect(() => {
    setUnresolvedCount(systemErrorTracker.getUnresolvedErrors().length);
    const unsub = systemErrorTracker.subscribe((state) => {
      setUnresolvedCount(state.unresolved);
    });
    return () => unsub();
  }, []);

  const [messages, setMessages] = useState([
    {
      sender: 'agent',
      text: `### 👋 Operations Copilot Ready
I am your internal operations intelligence assistant. You can ask me questions about schools, learners, subscriptions, support tickets, and live system error detection with instant real-time answers.`,
      suggestions: [
        "Run system diagnostics",
        "Show recent system errors",
        "Platform overview & statistics",
        "Which schools are in critical health?",
        "Subscription and billing status"
      ],
      queryTimeMs: 12
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

  const handleSend = async (questionText) => {
    const textToSend = questionText || query;
    if (!textToSend.trim() || loading) return;

    const userMessage = { sender: 'user', text: textToSend.trim() };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await askOperationsAgent(textToSend);
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
          text: `⚠️ Error fetching operational data: ${err.message}`,
          suggestions: ["Platform overview & statistics"]
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .copilot-ops-launcher {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
        }
        .copilot-ops-drawer {
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
          .copilot-ops-launcher {
            bottom: 84px !important;
            right: 16px !important;
          }
          .copilot-ops-drawer {
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* ── Floating Launcher Button (Icon-Only Circular, Draggable) ── */}
      <div
        ref={buttonRef}
        className="copilot-ops-launcher no-print"
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
            background: unresolvedCount > 0 
              ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' 
              : 'linear-gradient(135deg, #09090b 0%, #1e3a8a 100%)',
            color: '#ffffff',
            border: unresolvedCount > 0 ? '2px solid #FECA CA' : '2px solid rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isActivelyDragging ? 'grabbing' : 'grab',
            boxShadow: unresolvedCount > 0 
              ? (isActivelyDragging ? '0 16px 36px rgba(239, 68, 68, 0.6)' : '0 10px 25px rgba(239, 68, 68, 0.45)')
              : (isActivelyDragging ? '0 16px 36px rgba(9, 9, 11, 0.5)' : '0 10px 25px rgba(9, 9, 11, 0.35)'),
            fontSize: '1.25rem',
            transition: isActivelyDragging ? 'none' : 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isOpen ? 'scale(0.92)' : (isActivelyDragging ? 'scale(1.08)' : 'scale(1)'),
            position: 'relative',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
          onMouseEnter={(e) => { if (!isActivelyDragging) e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)'; }}
          onMouseLeave={(e) => { if (!isActivelyDragging) e.currentTarget.style.transform = isOpen ? 'scale(0.92)' : 'scale(1)'; }}
          title={unresolvedCount > 0 ? `${unresolvedCount} system error(s) detected! Click to inspect.` : "Operations Copilot - Drag to move"}
          aria-label="Open Operations Copilot"
        >
          <i className={unresolvedCount > 0 ? "fas fa-triangle-exclamation" : "fas fa-robot"} />

          {/* Unresolved Error Badge */}
          {unresolvedCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              minWidth: '18px',
              height: '18px',
              borderRadius: '999px',
              background: '#ffffff',
              color: '#EF4444',
              fontSize: '0.65rem',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
              border: '1.5px solid #EF4444'
            }}>
              {unresolvedCount > 9 ? '9+' : unresolvedCount}
            </span>
          )}

          {/* Pulse ping for normal state */}
          {unresolvedCount === 0 && (
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#2563eb',
              boxShadow: '0 0 0 2px #ffffff'
            }} />
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
            className="copilot-ops-drawer"
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
              .copilot-chip {
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                color: #334155;
                border-radius: 999px;
                padding: 4px 10px;
                font-size: 0.72rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s;
                text-align: left;
                white-space: nowrap;
              }
              .copilot-chip:hover {
                background: #e2e8f0;
                border-color: #2563eb;
                color: #2563eb;
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
                  background: unresolvedCount > 0 ? '#EF4444' : '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem'
                }}>
                  <i className={unresolvedCount > 0 ? "fas fa-triangle-exclamation" : "fas fa-robot"} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
                    Operations Copilot
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: unresolvedCount > 0 ? '#EF4444' : '#10B981'
                    }} />
                    <span style={{ color: unresolvedCount > 0 ? '#fca5a5' : '#a1a1aa', fontWeight: unresolvedCount > 0 ? 700 : 400 }}>
                      {unresolvedCount > 0
                        ? `${unresolvedCount} Error${unresolvedCount > 1 ? 's' : ''} Detected`
                        : 'Real-time DB & Telemetry Active'}
                    </span>
                  </div>
                </div>
              </div>

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
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {/* Error Telemetry Alert Banner */}
            {unresolvedCount > 0 && (
              <div style={{
                background: '#FEF2F2',
                borderBottom: '1px solid #FECACA',
                padding: '8px 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#991B1B',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-triangle-exclamation" style={{ color: '#EF4444' }} />
                  <span><strong>{unresolvedCount} error{unresolvedCount > 1 ? 's' : ''}</strong> captured in telemetry</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSend('Show recent system errors')}
                  style={{
                    background: '#EF4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  View
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
                      ⚡ {m.queryTimeMs}ms (Internal DB)
                    </div>
                  )}

                  {/* Suggestion Chips */}
                  {m.suggestions && m.suggestions.length > 0 && idx === messages.length - 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {m.suggestions.map((s, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          className="copilot-chip"
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
                  <span>Analyzing database...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Box ── */}
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
                  placeholder="Ask about schools, learners, wallets, tickets..."
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

export default OperationsCopilotDrawer;
