import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { askOperationsAgent } from '../../services/operationsAgentService';
import { systemErrorTracker } from '../../services/systemErrorTracker';

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
      const dataRows = tableRows.slice(2); // skip header and separator

      elements.push(
        <div key={`${keyPrefix}-tbl`} style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
          <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                {isHeader.split('|').filter(c => c.trim()).map((col, idx) => (
                  <th key={idx} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800, color: '#334155' }}>
                    {formatInline(col.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9', background: rIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  {row.split('|').filter(c => c.trim()).map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: '6px 10px', color: '#1e293b' }}>
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
    const parts = [];
    let remaining = str;
    let idx = 0;

    // Replace [label](url) links
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
          style={{ color: '#0d9488', fontWeight: 700, textDecoration: 'underline' }}
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
    // Replace **bold**
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const segments = [];
    let last = 0;
    let bMatch;

    while ((bMatch = boldRegex.exec(text)) !== null) {
      if (bMatch.index > last) {
        segments.push(text.substring(last, bMatch.index));
      }
      segments.push(<strong key={`${key}-${bMatch.index}`}>{bMatch[1]}</strong>);
      last = boldRegex.lastIndex;
    }
    if (last < text.length) {
      segments.push(text.substring(last));
    }
    return segments.length > 0 ? segments : text;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Table row detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableRows.push(trimmed);
      return;
    } else if (inTable) {
      flushTable(index);
    }

    // Heading 3 / 4
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={index} style={{ margin: '0.85rem 0 0.4rem', fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
          {formatInline(trimmed.replace('### ', ''))}
        </h4>
      );
    } else if (trimmed.startsWith('#### ')) {
      elements.push(
        <h5 key={index} style={{ margin: '0.65rem 0 0.35rem', fontSize: '0.88rem', fontWeight: 800, color: '#334155' }}>
          {formatInline(trimmed.replace('#### ', ''))}
        </h5>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed)) {
      elements.push(
        <div key={index} style={{ display: 'flex', gap: '6px', margin: '3px 0', fontSize: '0.83rem', lineHeight: 1.5, color: '#334155' }}>
          <span style={{ color: '#0d9488' }}>&bull;</span>
          <span style={{ flex: 1 }}>{formatInline(trimmed.replace(/^[-•\d\.]+\s*/, ''))}</span>
        </div>
      );
    } else if (trimmed === '') {
      elements.push(<div key={index} style={{ height: '6px' }} />);
    } else {
      elements.push(
        <p key={index} style={{ margin: '4px 0', fontSize: '0.84rem', lineHeight: 1.55, color: '#1e293b' }}>
          {formatInline(trimmed)}
        </p>
      );
    }
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
I am your internal operations intelligence assistant. You can ask me questions about **schools, learners, subscriptions, support tickets, and live system error detection** with instant real-time answers.`,
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
      {/* ── Floating Launcher Button ── */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '8px'
        }}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
            color: '#ffffff',
            border: unresolvedCount > 0 ? '1.5px solid #EF4444' : '1.5px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '9999px',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            boxShadow: unresolvedCount > 0 ? '0 10px 30px rgba(239, 68, 68, 0.35)' : '0 10px 30px rgba(0, 0, 0, 0.3)',
            fontWeight: 800,
            fontSize: '0.85rem',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isOpen ? 'scale(0.96)' : 'scale(1)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          title={unresolvedCount > 0 ? `${unresolvedCount} system error(s) detected! Click to inspect.` : "Open Operations Copilot"}
        >
          <div style={{
            position: 'relative',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: unresolvedCount > 0 ? '#EF4444' : '#10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem'
          }}>
            <i className={unresolvedCount > 0 ? "fas fa-triangle-exclamation" : "fas fa-robot"} />
            {unresolvedCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#ffffff',
                boxShadow: '0 0 0 2px #EF4444'
              }} />
            )}
          </div>
          <span>Operations Copilot</span>
          {unresolvedCount > 0 ? (
            <span style={{
              background: 'rgba(239, 68, 68, 0.25)',
              color: '#fca5a5',
              fontSize: '0.65rem',
              padding: '2px 7px',
              borderRadius: '999px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#EF4444' }} />
              {unresolvedCount} Error{unresolvedCount > 1 ? 's' : ''}
            </span>
          ) : (
            <span style={{
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              fontSize: '0.65rem',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 800
            }}>
              0 API Cost
            </span>
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
            style={{
              width: '100%',
              maxWidth: '460px',
              height: '100%',
              background: '#ffffff',
              boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
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
                border-color: #0d9488;
                color: #0d9488;
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
                  background: unresolvedCount > 0 ? '#EF4444' : '#10B981',
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Link
                  to="/platform/operations/copilot"
                  onClick={() => setIsOpen(false)}
                  style={{
                    color: '#a1a1aa',
                    padding: '6px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    textDecoration: 'none'
                  }}
                  title="Expand to Full Workspace"
                >
                  <i className="fas fa-up-right-and-down-left-from-center" />
                </Link>

                <button
                  type="button"
                  onClick={() => setMessages([messages[0]])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#a1a1aa',
                    padding: '6px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                  title="Clear Chat History"
                >
                  <i className="fas fa-trash-can" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    padding: '6px',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                  title="Close Drawer"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            {/* ── Active Errors Alert Banner ── */}
            {unresolvedCount > 0 && (
              <div style={{
                background: '#FEF2F2',
                borderBottom: '1px solid #FECACA',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.76rem',
                color: '#991B1B',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-triangle-exclamation" style={{ color: '#EF4444' }} />
                  <span><strong>{unresolvedCount} System Error{unresolvedCount > 1 ? 's' : ''}</strong> captured</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleSend('Show recent system errors')}
                    style={{
                      background: '#DC2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Clear resolved errors')}
                    style={{
                      background: '#ffffff',
                      color: '#7f1d1d',
                      border: '1px solid #fca5a5',
                      borderRadius: '6px',
                      padding: '2px 6px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* ── Messages Stream ── */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              background: '#f8fafc'
            }}>
              {messages.map((m, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start'
                  }}>
                    <div style={{
                      maxWidth: '88%',
                      borderRadius: m.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: m.sender === 'user' ? '0.65rem 1rem' : '0.85rem 1.15rem',
                      background: m.sender === 'user' ? '#0f172a' : '#ffffff',
                      color: m.sender === 'user' ? '#ffffff' : '#0f172a',
                      fontSize: '0.85rem',
                      border: m.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                    }}>
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
                      color: '#94a3b8',
                      textAlign: m.sender === 'user' ? 'right' : 'left',
                      paddingLeft: m.sender === 'user' ? '0' : '4px'
                    }}>
                      ⚡ Computed in {m.queryTimeMs}ms (Local DB)
                    </div>
                  )}

                  {/* Suggestions pills */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.8rem', padding: '0.5rem' }}>
                  <i className="fas fa-spinner fa-spin" style={{ color: '#0d9488' }} />
                  <span>Analyzing database...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Box ── */}
            <div style={{
              padding: '0.85rem 1rem',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
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
                    border: '1.5px solid #e2e8f0',
                    fontSize: '0.85rem',
                    outline: 'none',
                    background: '#f8fafc',
                    color: '#0f172a'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#0d9488'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
                <button
                  type="submit"
                  disabled={!query.trim() || loading}
                  style={{
                    background: '#0d9488',
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
                    transition: 'opacity 0.2s'
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
