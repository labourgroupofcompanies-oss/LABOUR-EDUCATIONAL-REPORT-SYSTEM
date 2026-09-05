import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { askOperationsAgent } from '../../services/operationsAgentService';
import { systemErrorTracker } from '../../services/systemErrorTracker';

// Lightweight safe Markdown renderer for chat responses
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
        <div key={`${keyPrefix}-tbl`} style={{ overflowX: 'auto', margin: '0.85rem 0' }}>
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', border: '1px solid #e2e8f0', background: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                {isHeader.split('|').filter(c => c.trim()).map((col, idx) => (
                  <th key={idx} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: '#334155' }}>
                    {formatInline(col.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9', background: rIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  {row.split('|').filter(c => c.trim()).map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: '8px 12px', color: '#1e293b' }}>
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
          style={{ color: '#0d9488', fontWeight: 700, textDecoration: 'underline' }}
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

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableRows.push(trimmed);
      return;
    } else if (inTable) {
      flushTable(index);
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={index} style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
          {formatInline(trimmed.replace('### ', ''))}
        </h3>
      );
    } else if (trimmed.startsWith('#### ')) {
      elements.push(
        <h4 key={index} style={{ margin: '0.85rem 0 0.4rem', fontSize: '0.95rem', fontWeight: 800, color: '#334155' }}>
          {formatInline(trimmed.replace('#### ', ''))}
        </h4>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed)) {
      elements.push(
        <div key={index} style={{ display: 'flex', gap: '8px', margin: '4px 0', fontSize: '0.88rem', lineHeight: 1.6, color: '#334155' }}>
          <span style={{ color: '#0d9488', fontWeight: 'bold' }}>&bull;</span>
          <span style={{ flex: 1 }}>{formatInline(trimmed.replace(/^[-•\d\.]+\s*/, ''))}</span>
        </div>
      );
    } else if (trimmed === '') {
      elements.push(<div key={index} style={{ height: '8px' }} />);
    } else {
      elements.push(
        <p key={index} style={{ margin: '6px 0', fontSize: '0.88rem', lineHeight: 1.6, color: '#1e293b' }}>
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

const OperationsAgentView = () => {
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
      text: `### 🤖 Welcome to Operations Copilot
I am your internal intelligence agent built directly into the Platform Operations Center. Ask me operational, financial, or academic questions about registered schools and platform health.

**Highlights:**
- ⚡ **Zero Latency**: Powered directly by your Supabase database and local indices.
- 🔒 **100% Private & Free**: Zero external API keys, zero token fees.
- 🩺 **Live System Telemetry**: 5-pillar diagnostics, runtime exception monitor, and offline sync tracking.
- 🎯 **Deep Insights**: Real-time health scores, enrollment counts, wallet balances, referral bonuses, and support queues.`,
      suggestions: [
        "Run 5-pillar system diagnostics",
        "Show recent system errors",
        "Platform overview & statistics",
        "Which schools are in critical health?",
        "Top 5 schools by student population",
        "Subscription and billing status"
      ],
      queryTimeMs: 10
    }
  ]);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          text: `⚠️ Query error: ${err.message}`,
          suggestions: ["Platform overview & statistics"]
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const QUICK_TOPICS = [
    { title: 'System Diagnostics', query: 'Run 5-pillar system diagnostics', icon: 'fa-heart-pulse', color: '#10B981' },
    { title: 'System Error Log', query: 'Show recent system errors', icon: 'fa-bug', color: '#EF4444' },
    { title: 'Platform Overview', query: 'Platform overview & statistics', icon: 'fa-gauge-high', color: '#F59E0B' },
    { title: 'Health Alerts', query: 'Which schools are in critical health?', icon: 'fa-triangle-exclamation', color: '#DC2626' },
    { title: 'Population Leaderboard', query: 'Top 5 schools by student population', icon: 'fa-user-graduate', color: '#8B5CF6' },
    { title: 'Billing & Subscriptions', query: 'Subscription and billing status', icon: 'fa-receipt', color: '#059669' },
    { title: 'Referral Rewards', query: 'Referral rewards and deductions', icon: 'fa-gift', color: '#D97706' },
    { title: 'Support Queue', query: 'Show open support tickets', icon: 'fa-headset', color: '#3B82F6' },
    { title: 'Admin Interventions', query: 'Show recent admin interventions', icon: 'fa-user-shield', color: '#6366F1' },
    { title: 'All Schools List', query: 'Show all schools directory', icon: 'fa-school-flag', color: '#14B8A6' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', background: '#f8fafc' }}>
      <style>{`
        .topic-pill {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 0.65rem 0.9rem;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .topic-pill:hover {
          border-color: #0d9488;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(13, 148, 136, 0.12);
        }
        .chat-prompt-chip {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
          border-radius: 9999px;
          padding: 5px 12px;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .chat-prompt-chip:hover {
          background: #0d9488;
          border-color: #0d9488;
          color: #ffffff;
        }
      `}</style>

      {/* ── Page Header ── */}
      <div style={{
        padding: '1.25rem 2rem',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10B981 0%, #0d9488 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
          }}>
            <i className="fas fa-robot" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>
              Operations Copilot
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Real-time platform intelligence &amp; autonomous query agent (Zero API Cost)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: unresolvedCount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            color: unresolvedCount > 0 ? '#b91c1c' : '#047857',
            border: unresolvedCount > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '9999px',
            padding: '4px 12px',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: unresolvedCount > 0 ? '#EF4444' : '#10B981'
            }} />
            {unresolvedCount > 0 ? `${unresolvedCount} System Error${unresolvedCount > 1 ? 's' : ''} Detected` : 'Internal Telemetry & DB Online'}
          </span>

          <button
            type="button"
            onClick={() => setMessages([messages[0]])}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Reset Chat Session"
          >
            <i className="fas fa-rotate-left" /> Clear Chat
          </button>
        </div>
      </div>

      {/* ── Main Workspace Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left Sidebar: Quick Prompts & Categories ── */}
        <div style={{
          width: '280px',
          background: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick Operations Prompts
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {QUICK_TOPICS.map((topic, idx) => (
              <div
                key={idx}
                className="topic-pill"
                onClick={() => handleSend(topic.query)}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: `${topic.color}15`,
                  color: topic.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  flexShrink: 0
                }}>
                  <i className={`fas ${topic.icon}`} />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                  {topic.title}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 'auto',
            padding: '0.85rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            fontSize: '0.75rem',
            color: '#64748b',
            lineHeight: 1.5
          }}>
            <strong style={{ color: '#0f172a', display: 'block', marginBottom: '2px' }}>
              💡 Natural Language Tips:
            </strong>
            Type questions like <em>"Search for St. Paul"</em>, <em>"Who has low balance?"</em>, or <em>"Show open tickets"</em>.
          </div>
        </div>

        {/* ── Center: Interactive Chat Feed ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
          {unresolvedCount > 0 && (
            <div style={{
              background: '#FEF2F2',
              borderBottom: '1px solid #FECACA',
              padding: '10px 2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.84rem',
              color: '#991B1B'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fas fa-triangle-exclamation" style={{ color: '#EF4444', fontSize: '1.05rem' }} />
                <span>
                  <strong>Active Error Telemetry:</strong> {unresolvedCount} unresolved system error{unresolvedCount > 1 ? 's' : ''} detected during runtime.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleSend('Show recent system errors')}
                  style={{
                    background: '#DC2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Inspect Errors
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('Run 5-pillar system diagnostics')}
                  style={{
                    background: '#ffffff',
                    color: '#7f1d1d',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Run Diagnostics
                </button>
              </div>
            </div>
          )}

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem 2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            {messages.map((m, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start'
                }}>
                  <div style={{
                    maxWidth: '82%',
                    borderRadius: m.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    padding: m.sender === 'user' ? '0.75rem 1.25rem' : '1.1rem 1.4rem',
                    background: m.sender === 'user' ? '#0f172a' : '#ffffff',
                    color: m.sender === 'user' ? '#ffffff' : '#0f172a',
                    fontSize: '0.88rem',
                    border: m.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)'
                  }}>
                    {m.sender === 'user' ? (
                      <span style={{ fontWeight: 500 }}>{m.text}</span>
                    ) : (
                      renderMarkdown(m.text)
                    )}
                  </div>
                </div>

                {m.queryTimeMs !== undefined && (
                  <div style={{
                    fontSize: '0.7rem',
                    color: '#94a3b8',
                    paddingLeft: m.sender === 'user' ? '0' : '8px',
                    textAlign: m.sender === 'user' ? 'right' : 'left'
                  }}>
                    ⚡ Database response time: <strong>{m.queryTimeMs}ms</strong>
                  </div>
                )}

                {/* Suggestions pill list */}
                {m.suggestions && m.suggestions.length > 0 && idx === messages.length - 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                    {m.suggestions.map((s, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        className="chat-prompt-chip"
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.85rem', padding: '0.75rem' }}>
                <i className="fas fa-spinner fa-spin" style={{ color: '#0d9488', fontSize: '1rem' }} />
                <span>Querying Supabase and local cache...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Bar ── */}
          <div style={{
            padding: '1.25rem 2rem',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0'
          }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{ display: 'flex', gap: '12px', alignItems: 'center' }}
            >
              <input
                type="text"
                placeholder="Ask Operations Copilot any question (e.g., 'Which schools need attention?', 'Search St. Marys', 'Total students')..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.85rem 1.25rem',
                  borderRadius: '12px',
                  border: '1.5px solid #e2e8f0',
                  fontSize: '0.9rem',
                  outline: 'none',
                  background: '#f8fafc',
                  color: '#0f172a',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#0d9488';
                  e.target.style.background = '#ffffff';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0';
                  e.target.style.background = '#f8fafc';
                }}
              />
              <button
                type="submit"
                disabled={!query.trim() || loading}
                style={{
                  background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.85rem 1.5rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  opacity: (!query.trim() || loading) ? 0.5 : 1,
                  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>Ask</span>
                <i className="fas fa-paper-plane" />
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OperationsAgentView;
