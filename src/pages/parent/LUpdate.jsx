import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import authService from '../../services/authService';
import LearnerPhoto from '../../components/common/LearnerPhoto';

// ─── constants ───────────────────────────────────────────────────────────────
const LAST_SYNC_KEY = 'labour_edu_daily_logs_last_sync';
const DEFAULT_DAYS = 30;

// ─── helpers ─────────────────────────────────────────────────────────────────
const formatDisplayDate = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const isToday = (isoDate) => isoDate === new Date().toISOString().split('T')[0];
const isYesterday = (isoDate) => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return isoDate === y.toISOString().split('T')[0];
};

const dayLabel = (isoDate) => {
  if (isToday(isoDate)) return 'Today';
  if (isYesterday(isoDate)) return 'Yesterday';
  return formatDisplayDate(isoDate);
};

export default function LUpdate() {
  const navigate = useNavigate();
  const parent = authService.getCurrentParent();

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const [selectedChildKey, setSelectedChildKey] = useState('all');

  // Track online status
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Read siblings from localStorage
  const cachedSiblings = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('labour_edu_parent_siblings') || '[]');
    } catch {
      return [];
    }
  }, []);

  // Normalise siblings
  const siblings = useMemo(() => {
    return cachedSiblings.map(s => {
      const key = String(s.supabaseId || s.id || s.learnerId || '');
      return {
        key,
        id: s.id,
        supabaseId: s.supabaseId,
        fullName: s.fullName || s.full_name || 'Learner',
        regNumber: s.regNumber || s.reg_number || '',
        classId: Number(s.currentClassId || s.class_id || s.classId || 0),
        schoolId: s.schoolId || s.school_id,
        gender: s.gender || '',
        photo: s.photo || s.photoUrl || s.photo_url || null
      };
    }).filter(s => s.key);
  }, [cachedSiblings]);

  const siblingKeyMap = useMemo(() => {
    const map = new Map();
    siblings.forEach(s => map.set(s.key, s));
    return map;
  }, [siblings]);

  // Classes for name lookup
  const allClasses = useLiveQuery(() => db.classes.toArray(), []) || [];
  const getClassName = (classId) =>
    allClasses.find(c => c.id === classId || String(c.id) === String(classId))?.name || 'Class';

  // Live Dexie query for daily logs
  const allLogs = useLiveQuery(async () => {
    if (siblings.length === 0) return [];

    const keysToQuery = selectedChildKey === 'all'
      ? siblings.map(s => s.key)
      : [selectedChildKey];

    const results = [];
    for (const key of keysToQuery) {
      const childObj = siblingKeyMap.get(key);
      const sId = childObj?.schoolId;

      // Query by compound index [schoolId+learnerId+date]
      if (sId) {
        let logs;
        try {
          logs = await db.dailyLogs
            .where('[schoolId+learnerId+date]')
            .between([sId, key, ''], [sId, key, '\uffff'], true, true)
            .reverse()
            .toArray();
        } catch {
          logs = await db.dailyLogs
            .filter(l => l.schoolId === sId && String(l.learnerId) === key)
            .toArray();
        }
        results.push(...logs);
      } else {
        const logs = await db.dailyLogs
          .filter(l => String(l.learnerId) === key)
          .toArray();
        results.push(...logs);
      }
    }

    // Sort descending by date
    return results.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [siblings, selectedChildKey, siblingKeyMap]) || [];

  // Incremental sync from Supabase
  useEffect(() => {
    if (!isOnline || siblings.length === 0) return;
    let cancelled = false;

    const syncLogs = async () => {
      setSyncing(true);
      setSyncError(null);
      try {
        const lastSync = localStorage.getItem(LAST_SYNC_KEY);
        const cutoff = lastSync
          ? new Date(lastSync).toISOString()
          : (() => {
              const d = new Date();
              d.setDate(d.getDate() - DEFAULT_DAYS);
              return d.toISOString();
            })();

        let newLastSync = lastSync || cutoff;

        // Group siblings by school
        const schoolSiblingsMap = new Map();
        for (const s of siblings) {
          if (!s.schoolId) continue;
          if (!schoolSiblingsMap.has(s.schoolId)) schoolSiblingsMap.set(s.schoolId, []);
          schoolSiblingsMap.get(s.schoolId).push(s.key);
        }

        for (const [schoolId, learnerIds] of schoolSiblingsMap.entries()) {
          if (cancelled) break;
          try {
            const { data, error } = await supabase
              .from('report_daily_logs')
              .select('*')
              .eq('school_id', schoolId)
              .in('learner_id', learnerIds)
              .gt('updated_at', cutoff)
              .order('date', { ascending: false });

            if (error) {
              console.warn('[LUpdate] Supabase fetch error:', error);
              continue;
            }

            if (!data || data.length === 0) continue;

            for (const row of data) {
              const lId = String(row.learner_id || '');
              let existing;
              try {
                existing = await db.dailyLogs
                  .where('[schoolId+learnerId+date]')
                  .equals([schoolId, lId, row.date])
                  .first();
              } catch {
                existing = await db.dailyLogs
                  .filter(l => l.schoolId === schoolId && String(l.learnerId) === lId && l.date === row.date)
                  .first();
              }

              const entry = {
                schoolId,
                classId: Number(row.class_id),
                learnerId: lId,
                date: row.date,
                teacherId: row.teacher_id,
                notice: row.notice || null,
                entries: row.entries || [],
                supabaseId: row.id,
                updatedAt: row.updated_at,
                synced: true
              };

              if (existing) {
                await db.dailyLogs.update(existing.id, entry);
              } else {
                await db.dailyLogs.add(entry);
              }

              if (!newLastSync || row.updated_at > newLastSync) {
                newLastSync = row.updated_at;
              }
            }
          } catch (innerErr) {
            console.warn('[LUpdate] error syncing logs for school:', schoolId, innerErr);
          }
        }

        if (!cancelled) {
          localStorage.setItem(LAST_SYNC_KEY, newLastSync);
        }
      } catch (err) {
        if (!cancelled) setSyncError('Could not sync latest updates. Showing cached data.');
        console.warn('[LUpdate] sync error:', err);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };

    syncLogs();
    return () => { cancelled = true; };
  }, [isOnline, siblings]);

  const toggleLog = (logId) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  };

  // Group logs by date
  const logsByDate = useMemo(() => {
    const map = new Map();
    for (const log of allLogs) {
      if (!map.has(log.date)) map.set(log.date, []);
      map.get(log.date).push(log);
    }
    return [...map.entries()].sort((a, b) => (b[0] > a[0] ? 1 : -1));
  }, [allLogs]);

  const hasChildren = siblings.length > 0;
  const multiChild = siblings.length > 1;

  return (
    <div style={styles.page}>
      {/* ── Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/parent/dashboard')}>
          <i className="fas fa-arrow-left" />
        </button>
        <div style={styles.headerCenter}>
          <div style={styles.headerIcon}><i className="fas fa-calendar-day" /></div>
          <div>
            <h1 style={styles.pageTitle}>L Update</h1>
            <p style={styles.pageSubtitle}>Daily class activities & marks from teacher</p>
          </div>
        </div>
        <div style={styles.statusDot} title={isOnline ? 'Online' : 'Offline'}>
          {isOnline
            ? <span style={{ ...styles.dot, background: '#22c55e' }} />
            : <span style={{ ...styles.dot, background: '#94a3b8' }} />
          }
          <span style={styles.statusLabel}>{isOnline ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {/* ── Child Selector Tabs (if multiple children) */}
      {multiChild && (
        <div style={styles.childTabsWrap}>
          <button
            style={{
              ...styles.childTab,
              background: selectedChildKey === 'all' ? '#09090B' : '#fff',
              color: selectedChildKey === 'all' ? '#fff' : '#52525B',
              borderColor: selectedChildKey === 'all' ? '#09090B' : '#E4E4E7'
            }}
            onClick={() => setSelectedChildKey('all')}
          >
            All Children
          </button>
          {siblings.map(s => {
            const isSelected = selectedChildKey === s.key;
            return (
              <button
                key={s.key}
                style={{
                  ...styles.childTab,
                  background: isSelected ? '#09090B' : '#fff',
                  color: isSelected ? '#fff' : '#09090B',
                  borderColor: isSelected ? '#09090B' : '#E4E4E7'
                }}
                onClick={() => setSelectedChildKey(s.key)}
              >
                <div style={styles.tabPhotoWrap}>
                  <LearnerPhoto
                    photo={s.photo}
                    size="thumb"
                    alt={s.fullName}
                    gender={s.gender}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <span>{s.fullName.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Sync indicator */}
      {syncing && (
        <div style={styles.syncBanner}>
          <i className="fas fa-sync fa-spin" style={{ marginRight: 8 }} />
          Checking for new daily updates…
        </div>
      )}
      {syncError && (
        <div style={{ ...styles.syncBanner, background: '#fff3cd', borderColor: '#ffc107', color: '#856404' }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />
          {syncError}
        </div>
      )}

      {/* ── No children found */}
      {!hasChildren && (
        <div style={styles.emptyState}>
          <i className="fas fa-user-graduate" style={styles.emptyIcon} />
          <p style={styles.emptyText}>No learner records found.</p>
          <p style={styles.emptySubText}>Please log in again or contact the school office.</p>
        </div>
      )}

      {/* ── No logs recorded yet */}
      {hasChildren && allLogs.length === 0 && !syncing && (
        <div style={styles.emptyState}>
          <i className="fas fa-calendar-xmark" style={styles.emptyIcon} />
          <p style={styles.emptyText}>No daily updates yet.</p>
          <p style={styles.emptySubText}>
            {isOnline
              ? 'The teacher has not logged any daily performance entries yet.'
              : 'You are offline. Updates will synchronize automatically once reconnected.'}
          </p>
        </div>
      )}

      {/* ── Daily Feed */}
      {logsByDate.map(([date, logsForDate]) => (
        <div key={date} style={styles.dayGroup}>
          <div style={styles.dayHeader}>
            <span style={styles.dayLabel}>{dayLabel(date)}</span>
            {isToday(date) && <span style={styles.todayBadge}>Today</span>}
          </div>

          {logsForDate.map(log => {
            const expanded = expandedLogs.has(log.id);
            const child = siblingKeyMap.get(String(log.learnerId));
            const className = getClassName(log.classId || child?.classId);
            const hasEntries = Array.isArray(log.entries) && log.entries.length > 0;

            return (
              <div key={log.id || `${log.learnerId}-${log.date}`} style={styles.logCard}>
                {/* Card header with Child Photo & Name */}
                <div style={styles.logCardHeader}>
                  <div style={styles.cardLearnerInfo}>
                    <div style={styles.cardPhotoWrap}>
                      <LearnerPhoto
                        photo={child?.photo}
                        size="thumb"
                        alt={child?.fullName || 'Child'}
                        gender={child?.gender || ''}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div>
                      <div style={styles.cardLearnerName}>
                        {child?.fullName || 'Learner'}
                      </div>
                      <div style={styles.cardLearnerClass}>
                        {className} {child?.regNumber && `• ${child.regNumber}`}
                      </div>
                    </div>
                  </div>

                  {hasEntries && (
                    <button style={styles.expandBtn} onClick={() => toggleLog(log.id)}>
                      <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} />
                    </button>
                  )}
                </div>

                {/* Teacher Notice / Note */}
                {log.notice && (
                  <div style={styles.noticeBanner}>
                    <i className="fas fa-bullhorn" style={{ color: '#09090B', marginRight: 8, marginTop: 2 }} />
                    <span style={styles.noticeText}>{log.notice}</span>
                  </div>
                )}

                {/* Collapsed view: Pills */}
                {hasEntries && !expanded && (
                  <div style={styles.subjectPills}>
                    {log.entries.map((en, i) => (
                      <span key={i} style={styles.pill}>
                        {en.subjectName || 'Subject'}
                        {en.scoreObtained && (
                          <strong style={{ marginLeft: 6, color: '#09090B' }}>{en.scoreObtained}</strong>
                        )}
                      </span>
                    ))}
                    <button style={styles.viewDetailBtn} onClick={() => toggleLog(log.id)}>
                      View Details <i className="fas fa-angle-down" />
                    </button>
                  </div>
                )}

                {/* Expanded view: Detailed breakdown */}
                {hasEntries && expanded && (
                  <div style={styles.entriesList}>
                    {log.entries.map((en, i) => (
                      <div key={i} style={styles.entryItem}>
                        <div style={styles.entryItemHeader}>
                          <i className="fas fa-book" style={{ color: '#52525B', marginRight: 8 }} />
                          <span style={styles.entrySubjectName}>{en.subjectName || 'Subject'}</span>
                          {en.scoreObtained && (
                            <span style={styles.scoreBadge}>{en.scoreObtained}</span>
                          )}
                        </div>

                        {en.topicStudied && (
                          <div style={styles.entryRow}>
                            <span style={styles.entryRowLabel}>Topic:</span>
                            <span style={styles.entryRowValue}>{en.topicStudied}</span>
                          </div>
                        )}

                        {en.exerciseTitle && (
                          <div style={styles.entryRow}>
                            <span style={styles.entryRowLabel}>Exercise:</span>
                            <span style={styles.entryRowValue}>{en.exerciseTitle}</span>
                          </div>
                        )}

                        {en.assignmentQuestions && (
                          <div style={styles.assignmentBox}>
                            <div style={styles.assignmentHeader}>
                              <i className="fas fa-pen-to-square" style={{ marginRight: 6 }} />
                              Assignment
                              {en.assignmentDueDate && (
                                <span style={styles.dueBadge}>Due: {en.assignmentDueDate}</span>
                              )}
                            </div>
                            <p style={styles.assignmentText}>{en.assignmentQuestions}</p>
                          </div>
                        )}
                      </div>
                    ))}

                    <button style={styles.collapseBtn} onClick={() => toggleLog(log.id)}>
                      <i className="fas fa-angle-up" /> Collapse Details
                    </button>
                  </div>
                )}

                {!hasEntries && !log.notice && (
                  <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
                    No subject entries recorded for this day.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ height: 60 }} />
    </div>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
    padding: '0 0 2rem',
    color: '#0f172a'
  },
  header: {
    background: '#09090B',
    color: '#fff',
    padding: 'max(1rem, env(safe-area-inset-top)) 1rem 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },
  backBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#fff',
    width: 36,
    height: 36,
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.9rem',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerCenter: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  headerIcon: {
    width: 38,
    height: 38,
    background: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    flexShrink: 0
  },
  pageTitle: {
    fontSize: '1.1rem',
    fontWeight: 800,
    margin: 0,
    color: '#fff'
  },
  pageSubtitle: {
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.6)',
    margin: '2px 0 0'
  },
  statusDot: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block'
  },
  statusLabel: {
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.7)'
  },
  childTabsWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0.75rem 1rem 0.25rem',
    overflowX: 'auto'
  },
  childTab: {
    border: '1.5px solid #E4E4E7',
    borderRadius: 24,
    padding: '4px 12px 4px 6px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 700,
    whiteSpace: 'nowrap'
  },
  tabPhotoWrap: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    border: '1px solid #E4E4E7'
  },
  syncBanner: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    margin: '0.75rem 1rem',
    padding: '0.6rem 1rem',
    fontSize: '0.82rem',
    color: '#166534',
    display: 'flex',
    alignItems: 'center'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 1.5rem',
    textAlign: 'center'
  },
  emptyIcon: {
    fontSize: '2.5rem',
    color: '#cbd5e1',
    marginBottom: '1rem'
  },
  emptyText: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#52525B',
    margin: '0 0 0.5rem'
  },
  emptySubText: {
    fontSize: '0.82rem',
    color: '#94a3b8',
    margin: 0,
    maxWidth: 300
  },
  dayGroup: {
    padding: '0 1rem',
    marginTop: '1.25rem'
  },
  dayHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: '0.6rem'
  },
  dayLabel: {
    fontSize: '0.78rem',
    fontWeight: 800,
    color: '#52525B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  todayBadge: {
    background: '#09090B',
    color: '#fff',
    fontSize: '0.62rem',
    fontWeight: 800,
    padding: '2px 7px',
    borderRadius: 4,
    textTransform: 'uppercase'
  },
  logCard: {
    background: '#fff',
    border: '1.5px solid #E4E4E7',
    borderRadius: 14,
    padding: '1rem',
    marginBottom: '0.85rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
  },
  logCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardLearnerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  cardPhotoWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#F4F4F5',
    border: '1px solid #E4E4E7'
  },
  cardLearnerName: {
    fontSize: '0.92rem',
    fontWeight: 800,
    color: '#09090B'
  },
  cardLearnerClass: {
    fontSize: '0.72rem',
    color: '#71717A',
    fontWeight: 600,
    marginTop: 2
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#71717A',
    fontSize: '0.85rem',
    padding: '4px 8px'
  },
  noticeBanner: {
    background: '#F4F4F5',
    borderRadius: 8,
    padding: '0.6rem 0.75rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
    border: '1px solid #E4E4E7'
  },
  noticeText: {
    fontSize: '0.85rem',
    color: '#09090B',
    lineHeight: 1.5,
    margin: 0
  },
  subjectPills: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6
  },
  pill: {
    background: '#F4F4F5',
    color: '#52525B',
    border: '1px solid #E4E4E7',
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: '0.78rem',
    fontWeight: 600
  },
  viewDetailBtn: {
    background: 'none',
    border: '1.5px solid #E4E4E7',
    borderRadius: 20,
    padding: '3px 12px',
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#52525B',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5
  },
  entriesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem'
  },
  entryItem: {
    background: '#F4F4F5',
    borderRadius: 10,
    padding: '0.8rem',
    border: '1px solid #E4E4E7',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  entryItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  entrySubjectName: {
    fontSize: '0.9rem',
    fontWeight: 800,
    color: '#09090B',
    flex: 1
  },
  scoreBadge: {
    background: '#09090B',
    color: '#fff',
    fontSize: '0.72rem',
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: 6
  },
  entryRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start'
  },
  entryRowLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#71717A',
    minWidth: 70,
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  },
  entryRowValue: {
    fontSize: '0.875rem',
    color: '#09090B',
    lineHeight: 1.4
  },
  assignmentBox: {
    background: '#fff',
    border: '1.5px solid #E4E4E7',
    borderRadius: 8,
    padding: '0.65rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  assignmentHeader: {
    fontSize: '0.75rem',
    fontWeight: 800,
    color: '#52525B',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center'
  },
  dueBadge: {
    background: '#F4F4F5',
    border: '1px solid #E4E4E7',
    color: '#52525B',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    marginLeft: 8
  },
  assignmentText: {
    fontSize: '0.875rem',
    color: '#09090B',
    margin: 0,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap'
  },
  collapseBtn: {
    alignSelf: 'center',
    background: 'none',
    border: '1px solid #E4E4E7',
    borderRadius: 20,
    padding: '4px 14px',
    fontSize: '0.78rem',
    color: '#71717A',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  }
};
