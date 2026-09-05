import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../store/AuthContext';
import { askTeacherAgent } from '../../services/teacherAgentService';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../lib/db';
import useDraggableButton from '../../hooks/useDraggableButton';

/**
 * Lightweight safe Markdown renderer for Teacher Copilot
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

    const regex = /(\*\*([^*]+)\*\*|_([^_]+)_|`([^`]+)`)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.substring(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={idx++} style={{ fontWeight: 700, color: '#09090b' }}>{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(<em key={idx++}>{match[3]}</em>);
      } else if (match[4]) {
        parts.push(
          <code key={idx++} style={{
            background: '#f4f4f5',
            padding: '2px 5px',
            borderRadius: '4px',
            fontSize: '0.88em',
            fontFamily: 'monospace',
            color: '#2563eb'
          }}>
            {match[4]}
          </code>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < str.length) {
      parts.push(str.substring(lastIndex));
    }

    return parts.length > 0 ? parts : str;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableRows.push(trimmed);
      return;
    } else if (inTable) {
      flushTable(`tbl-${index}`);
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={index} style={{
          fontSize: '0.98rem',
          fontWeight: 800,
          margin: '0.85rem 0 0.35rem 0',
          color: '#09090b',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {formatInline(trimmed.replace(/^###\s+/, ''))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h4 key={index} style={{
          fontSize: '0.88rem',
          fontWeight: 700,
          margin: '0.65rem 0 0.25rem 0',
          color: '#18181b'
        }}>
          {formatInline(trimmed.replace(/^####\s+/, ''))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={index} style={{
          fontSize: '0.82rem',
          lineHeight: '1.45',
          color: '#27272a',
          marginLeft: '1.1rem',
          marginBottom: '3px'
        }}>
          {formatInline(trimmed.replace(/^[-•*]\s+/, ''))}
        </li>
      );
      return;
    }

    if (trimmed === '') {
      elements.push(<div key={index} style={{ height: '5px' }} />);
      return;
    }

    elements.push(
      <p key={index} style={{
        fontSize: '0.82rem',
        lineHeight: '1.45',
        margin: '0 0 5px 0',
        color: '#27272a'
      }}>
        {formatInline(trimmed)}
      </p>
    );
  });

  if (inTable) {
    flushTable('tbl-end');
  }

  return elements;
};

/**
 * TeacherCopilotDrawer Component
 * Provides an intelligent assistant strictly scoped to a teacher's assigned classes.
 */
const TeacherCopilotDrawer = () => {
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
  } = useDraggableButton('teacher_copilot_icon_pos');

  // Strictly Teacher role
  const isTeacher = user?.role === 'teacher';

  // Fetch school info
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null,
    [user?.schoolId]
  );

  // Live query for teacher's draft scores
  const draftScoresCount = useLiveQuery(
    async () => {
      if (!user?.id || !user?.schoolId) return 0;
      try {
        const sId = String(user.schoolId);
        // Get teacher's assigned classes
        const assigns = await db.teacherAssignments
          .filter(a => String(a.schoolId || a.school_id) === sId && String(a.teacherId) === String(user.id))
          .toArray();

        const classIds = new Set(assigns.map(a => Number(a.classId)));
        if (classIds.size === 0) return 0;

        const scores = await db.scores
          .filter(s =>
            String(s.schoolId || s.school_id) === sId &&
            classIds.has(Number(s.classId)) &&
            (s.isSubmitted === 0 || s.isSubmitted === false)
          )
          .count();

        return scores;
      } catch {
        return 0;
      }
    },
    [user?.id, user?.schoolId]
  );

  const initialWelcomeText = `### 👋 Welcome Teacher ${user?.fullName || ''}!
Ask me anything you want from your portal and I will help you do it! Whether you need to enter student marks, submit scores to the Headteacher, check missing grades, or need step-by-step guidance on your teaching activities in **${schoolInfo?.name || 'Your School'}**, I am here to assist you anytime.`;

  const [messages, setMessages] = useState([
    {
      sender: 'agent',
      text: initialWelcomeText,
      suggestions: [
        'What is my score entry progress?',
        'Which students are missing scores?',
        'Show my assigned classes',
        'Are my marks safely saved on this device?'
      ]
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

  if (!isTeacher) {
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
      const response = await askTeacherAgent(textToSend, user);
      setMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: response.text,
          suggestions: response.suggestions
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: `### ⚠️ Could Not Retrieve Information\nWe were unable to load your class records right now. Your grades remain completely safe on this device. Please check your connection and try asking again.`,
          suggestions: ['What is my score entry progress?', 'Show my assigned classes']
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .t-copilot-chip {
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
        .t-copilot-chip:hover {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .copilot-launcher-wrap {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9998;
        }
        .copilot-drawer-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          max-width: 430px;
          background: #ffffff;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          box-shadow: -8px 0 32px rgba(0,0,0,0.22);
          animation: drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (max-width: 768px) {
          .copilot-launcher-wrap {
            bottom: 84px !important;
            right: 16px !important;
          }
          .copilot-drawer-panel {
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* ── Floating Circular Launcher Button (Icon-Only, Draggable) ── */}
      <div
        ref={buttonRef}
        className="copilot-launcher-wrap no-print"
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
            setIsOpen(true);
          }}
          style={{
            position: 'relative',
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
            border: '1.5px solid #27272a',
            color: '#ffffff',
            boxShadow: isActivelyDragging
              ? '0 16px 36px rgba(0, 0, 0, 0.45)'
              : '0 8px 24px rgba(0, 0, 0, 0.28)',
            cursor: isActivelyDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.35rem',
            transition: isActivelyDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s',
            transform: isActivelyDragging ? 'scale(1.08)' : 'scale(1)',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
          title="Teacher Grading & Class Copilot - Drag to move"
          onMouseEnter={e => {
            if (!isActivelyDragging) {
              e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 12px 30px rgba(37, 99, 235, 0.35)';
              e.currentTarget.style.borderColor = '#2563eb';
            }
          }}
          onMouseLeave={e => {
            if (!isActivelyDragging) {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.28)';
              e.currentTarget.style.borderColor = '#27272a';
            }
          }}
        >
          <i className="fas fa-robot" style={{ color: '#ffffff' }} />

          {/* Draft Scores Indicator Badge */}
          {draftScoresCount > 0 ? (
            <span
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                background: '#F59E0B',
                color: '#ffffff',
                fontSize: '0.62rem',
                fontWeight: 800,
                borderRadius: '999px',
                padding: '2px 6px',
                border: '2px solid #09090b',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.6)'
              }}
              title={`${draftScoresCount} draft mark(s) waiting to be submitted`}
            >
              {draftScoresCount}
            </span>
          ) : (
            <span
              style={{
                position: 'absolute',
                bottom: '3px',
                right: '3px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#10B981',
                border: '2px solid #09090b'
              }}
              title="Grading Assistant Active"
            />
          )}
        </button>
      </div>

      {/* ── Sliding Side Drawer ── */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(3px)',
              zIndex: 9999,
              animation: 'fadeIn 0.2s ease-out'
            }}
          />

          {/* Drawer Container */}
          <div
            className="copilot-drawer-panel"
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
                  <i className="fas fa-chalkboard-teacher" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
                    Teacher Copilot
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#10B981'
                    }} />
                    <span>{user?.fullName || 'Teacher'} • {schoolInfo?.name || 'Your School'}</span>
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

            {/* Draft Marks Alert Banner */}
            {draftScoresCount > 0 && (
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
                  <i className="fas fa-save" style={{ color: '#F59E0B' }} />
                  <span><strong>{draftScoresCount} draft mark(s)</strong> awaiting submission</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSend('What is my score entry progress?')}
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

                  {m.sender === 'agent' && (
                    <div style={{
                      fontSize: '0.65rem',
                      color: '#a1a1aa',
                      paddingLeft: '4px',
                      textAlign: 'left'
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
                          className="t-copilot-chip"
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
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    padding: '0.65rem 1rem',
                    background: '#ffffff',
                    borderRadius: '14px 14px 14px 2px',
                    border: '1px solid #E4E4E7',
                    fontSize: '0.78rem',
                    color: '#71717a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-circle-notch fa-spin" style={{ color: '#2563eb' }} />
                    <span>Analyzing your class records...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Box ── */}
            <div style={{
              padding: '0.85rem 1rem',
              background: '#ffffff',
              borderTop: '1px solid #E4E4E7',
              display: 'flex',
              gap: '8px',
              flexShrink: 0
            }}>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about your marks, students, or progress..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #E4E4E7',
                  fontSize: '0.82rem',
                  outline: 'none',
                  background: '#FAFAFA',
                  color: '#18181b',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                onBlur={e => e.currentTarget.style.borderColor = '#E4E4E7'}
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={loading || !query.trim()}
                style={{
                  background: query.trim() ? '#2563eb' : '#f4f4f5',
                  color: query.trim() ? '#ffffff' : '#a1a1aa',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0 14px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: query.trim() ? 'pointer' : 'default',
                  transition: 'all 0.15s ease'
                }}
              >
                <i className="fas fa-paper-plane" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default TeacherCopilotDrawer;
