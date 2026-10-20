import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../store/AuthContext';
import { enqueueSync } from '../../services/syncEngine';
import LearnerPhoto from '../../components/common/LearnerPhoto';
import { getTeacherIdentifierSet, isAssignmentForTeacher } from '../../utils/teacherUtils';

// ─── helpers ────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().split('T')[0];

const blankEntry = () => ({
  _key: Math.random().toString(36).slice(2),
  subjectId: '',
  subjectName: '',
  topicStudied: '',
  exerciseTitle: '',
  scoreObtained: '',
  assignmentQuestions: '',
  assignmentDueDate: ''
});

export default function PUpdate() {
  const { user } = useAuth();
  const schoolId = user?.schoolId || '';
  const teacherId = user?.id || '';

  // ── View mode: 'list' (learner cards) or 'entry' (form for selected child)
  const [selectedLearner, setSelectedLearner] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [selectedClassId, setSelectedClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Form state for selected child
  const [notice, setNotice] = useState('');
  const [entries, setEntries] = useState([blankEntry()]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', msg }
  const [loadingLog, setLoadingLog] = useState(false);

  // ── Teacher ID tokens for assignment matching
  const [teacherIdTokens, setTeacherIdTokens] = useState(new Set());
  useEffect(() => {
    if (user && db) {
      getTeacherIdentifierSet(user, db).then(setTeacherIdTokens);
    }
  }, [user]);

  // ── Live DB data
  const classes = useLiveQuery(
    () => schoolId ? db.classes.where('schoolId').equals(schoolId).sortBy('name') : [],
    [schoolId]
  ) || [];

  const allAssignments = useLiveQuery(
    () => schoolId ? db.teacherAssignments.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  ) || [];

  const allLearners = useLiveQuery(
    () => schoolId ? db.learners.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  ) || [];

  const allSubjects = useLiveQuery(
    () => schoolId ? db.subjects.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  ) || [];

  // All logs for the selected date (to show status badges on learner cards)
  const dateLogs = useLiveQuery(
    () => schoolId && date
      ? db.dailyLogs.where('schoolId').equals(schoolId).filter(l => l.date === date).toArray()
      : [],
    [schoolId, date]
  ) || [];

  const isAdmin = user?.role === 'super_admin' || user?.role === 'headteacher' || user?.role === 'admin' || user?.isImpersonating;

  // Classes assigned to this teacher
  const assignedClassIds = useMemo(() => {
    if (isAdmin) return null; // null = all classes
    const set = new Set();
    allAssignments
      .filter(a => isAssignmentForTeacher(a, teacherIdTokens, user))
      .forEach(a => {
        if (a.classId) set.add(Number(a.classId));
      });
    return set;
  }, [isAdmin, allAssignments, teacherIdTokens, user]);

  const visibleClasses = useMemo(() => {
    if (!assignedClassIds) return classes;
    return classes.filter(c => assignedClassIds.has(c.id));
  }, [classes, assignedClassIds]);

  // Learners filtered by teacher's classes + search query
  const assignedLearners = useMemo(() => {
    let list = allLearners.filter(l => l.status !== 'Archived' && l.status !== 'Inactive');

    if (!isAdmin && assignedClassIds) {
      list = list.filter(l => assignedClassIds.has(Number(l.currentClassId)));
    }

    if (selectedClassId) {
      list = list.filter(l => Number(l.currentClassId) === Number(selectedClassId));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(l =>
        (l.fullName && l.fullName.toLowerCase().includes(q)) ||
        (l.regNumber && l.regNumber.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }, [allLearners, isAdmin, assignedClassIds, selectedClassId, searchQuery]);

  // Lookup map for log status on selected date
  const loggedLearnerKeySet = useMemo(() => {
    const set = new Set();
    dateLogs.forEach(l => {
      if (l.learnerId) set.add(String(l.learnerId));
    });
    return set;
  }, [dateLogs]);

  // Class subjects for the active learner's class
  const activeClassId = selectedLearner ? Number(selectedLearner.currentClassId) : null;
  const classSubjectsRaw = useLiveQuery(
    () => activeClassId && schoolId
      ? db.classSubjects.where('[schoolId+classId]').equals([schoolId, activeClassId]).toArray()
      : [],
    [schoolId, activeClassId]
  ) || [];

  const classSubjectOptions = useMemo(() => {
    const subjectIdSet = new Set(classSubjectsRaw.map(cs => cs.subjectId));
    return allSubjects.filter(s => subjectIdSet.has(s.id));
  }, [classSubjectsRaw, allSubjects]);

  const getClassName = (classId) =>
    classes.find(c => c.id === Number(classId))?.name || 'Class';

  // ── Auto-load existing log when selected learner or date changes
  useEffect(() => {
    if (!selectedLearner || !date || !schoolId) return;
    let cancelled = false;
    const load = async () => {
      setLoadingLog(true);
      try {
        const lKey = String(selectedLearner.supabaseId || selectedLearner.id);
        let existing;
        try {
          existing = await db.dailyLogs
            .where('[schoolId+learnerId+date]')
            .equals([schoolId, lKey, date])
            .first();
        } catch {
          existing = await db.dailyLogs
            .filter(l => l.schoolId === schoolId && String(l.learnerId) === lKey && l.date === date)
            .first();
        }

        if (cancelled) return;
        if (existing) {
          setNotice(existing.notice || '');
          setEntries(
            (existing.entries || []).length > 0
              ? existing.entries.map(e => ({ ...e, _key: Math.random().toString(36).slice(2) }))
              : [blankEntry()]
          );
        } else {
          setNotice('');
          setEntries([blankEntry()]);
        }
      } catch (err) {
        console.warn('[PUpdate] load error:', err);
      } finally {
        if (!cancelled) setLoadingLog(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedLearner, date, schoolId]);

  // ── Entry row helpers
  const updateEntry = useCallback((key, field, value) => {
    setEntries(prev => prev.map(e => e._key === key ? { ...e, [field]: value } : e));
  }, []);

  const addEntry = useCallback(() => {
    setEntries(prev => [...prev, blankEntry()]);
  }, []);

  const removeEntry = useCallback((key) => {
    setEntries(prev => prev.length <= 1 ? [blankEntry()] : prev.filter(e => e._key !== key));
  }, []);

  const handleSubjectSelect = useCallback((key, subjectId) => {
    const subject = classSubjectOptions.find(s => s.id === Number(subjectId));
    setEntries(prev => prev.map(e =>
      e._key === key
        ? { ...e, subjectId, subjectName: subject?.name || '' }
        : e
    ));
  }, [classSubjectOptions]);

  // ── Save handler
  const handleSubmit = async (e, next = false) => {
    if (e) e.preventDefault();
    if (!selectedLearner) {
      setToast({ type: 'error', msg: 'No learner selected.' });
      return;
    }

    const cleanEntries = entries
      .filter(en => en.subjectName.trim() || en.topicStudied.trim() || en.exerciseTitle.trim() || en.scoreObtained.trim())
      .map(({ _key, ...rest }) => rest);

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const lKey = String(selectedLearner.supabaseId || selectedLearner.id);
      const cId = Number(selectedLearner.currentClassId);

      const payload = {
        schoolId,
        classId: cId,
        learnerId: lKey,
        teacherId,
        date,
        notice: notice.trim() || null,
        entries: cleanEntries,
        updatedAt: now,
        synced: false
      };

      let existing;
      try {
        existing = await db.dailyLogs
          .where('[schoolId+learnerId+date]')
          .equals([schoolId, lKey, date])
          .first();
      } catch {
        existing = await db.dailyLogs
          .filter(l => l.schoolId === schoolId && String(l.learnerId) === lKey && l.date === date)
          .first();
      }

      let localId;
      if (existing) {
        await db.dailyLogs.update(existing.id, { ...payload, supabaseId: existing.supabaseId || null });
        localId = existing.id;
      } else {
        localId = await db.dailyLogs.add({ ...payload, supabaseId: null });
      }

      // Supabase payload
      const supabasePayload = {
        school_id: schoolId,
        class_id: cId,
        learner_id: lKey,
        teacher_id: teacherId,
        date,
        notice: notice.trim() || null,
        entries: cleanEntries,
        updated_at: now
      };

      await enqueueSync('upsert', 'report_daily_logs', supabasePayload, schoolId);
      await db.dailyLogs.update(localId, { synced: true });

      setToast({ type: 'success', msg: `Saved daily update for ${selectedLearner.fullName}!` });

      if (next) {
        // Move to the next learner in the list
        const currentIndex = assignedLearners.findIndex(l => l.id === selectedLearner.id);
        if (currentIndex >= 0 && currentIndex < assignedLearners.length - 1) {
          setSelectedLearner(assignedLearners[currentIndex + 1]);
        } else {
          setSelectedLearner(null);
        }
      }
    } catch (err) {
      console.error('[PUpdate] save error:', err);
      setToast({ type: 'error', msg: 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // Toast timer
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <Layout>
      <div style={styles.page}>
        {/* ── Toast */}
        {toast && (
          <div style={{ ...styles.toast, background: toast.type === 'success' ? '#09090B' : '#ef4444' }}>
            <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`} />
            {' '}{toast.msg}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            VIEW 1: ASSIGNED LEARNERS CARDS (CLICK TO OPEN P UPDATE)
           ════════════════════════════════════════════════════════════════════════ */}
        {!selectedLearner && (
          <>
            {/* Header */}
            <div style={styles.header}>
              <div style={styles.headerLeft}>
                <div style={styles.headerIcon}><i className="fas fa-clipboard-list" /></div>
                <div>
                  <h1 style={styles.pageTitle}>P Update</h1>
                  <p style={styles.pageSubtitle}>Select an assigned learner to log their daily performance</p>
                </div>
              </div>

              {/* Date Selector */}
              <div style={styles.dateBadgeWrap}>
                <label style={styles.dateBadgeLabel}>Date:</label>
                <input
                  type="date"
                  style={styles.dateBadgeInput}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  max={todayISO()}
                />
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div style={styles.filterBar}>
              <div style={styles.searchWrap}>
                <i className="fas fa-search" style={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search by learner name or reg number..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>

              {visibleClasses.length > 1 && (
                <div style={styles.classFilterWrap}>
                  <select
                    style={styles.classSelect}
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                  >
                    <option value="">All Assigned Classes ({assignedLearners.length})</option>
                    {visibleClasses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Learners Card Grid */}
            {assignedLearners.length === 0 ? (
              <div style={styles.emptyState}>
                <i className="fas fa-user-graduate" style={styles.emptyIcon} />
                <p style={styles.emptyText}>No assigned learners found.</p>
                <p style={styles.emptySubText}>
                  {searchQuery
                    ? 'No learners match your search criteria.'
                    : 'Check your teacher class assignments or contact the school administrator.'}
                </p>
              </div>
            ) : (
              <div style={styles.learnersGrid}>
                {assignedLearners.map(learner => {
                  const lKey = String(learner.supabaseId || learner.id);
                  const isLogged = loggedLearnerKeySet.has(lKey);

                  return (
                    <div
                      key={learner.id}
                      style={{
                        ...styles.learnerCard,
                        borderColor: isLogged ? '#10B981' : '#E4E4E7'
                      }}
                      onClick={() => setSelectedLearner(learner)}
                    >
                      <div style={styles.cardTop}>
                        <div style={styles.photoWrap}>
                          <LearnerPhoto
                            photo={learner.photo || learner.photoUrl}
                            thumbnail={learner.photoThumb || learner.photoThumbUrl || null}
                            size="thumb"
                            alt={learner.fullName}
                            gender={learner.gender}
                            style={styles.photo}
                          />
                        </div>
                        <div style={styles.cardInfo}>
                          <div style={styles.learnerName} title={learner.fullName}>
                            {learner.fullName}
                          </div>
                          <div style={styles.learnerMeta}>
                            <span style={styles.regBadge}>{learner.regNumber || 'No Reg'}</span>
                            <span style={styles.classBadge}>
                              {getClassName(learner.currentClassId)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={styles.cardFooter}>
                        {isLogged ? (
                          <span style={styles.statusLogged}>
                            <i className="fas fa-check-circle" style={{ marginRight: 5 }} />
                            Logged for {date === todayISO() ? 'Today' : date}
                          </span>
                        ) : (
                          <span style={styles.statusPending}>
                            <i className="far fa-circle" style={{ marginRight: 5 }} />
                            Needs Update
                          </span>
                        )}
                        <span style={styles.cardActionHint}>
                          Record <i className="fas fa-chevron-right" style={{ fontSize: '0.75rem' }} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            VIEW 2: DATA ENTRY FORM FOR SELECTED LEARNER
           ════════════════════════════════════════════════════════════════════════ */}
        {selectedLearner && (
          <div style={styles.entryView}>
            {/* Nav Back & Child Header */}
            <div style={styles.entryHeader}>
              <button
                type="button"
                style={styles.backBtn}
                onClick={() => setSelectedLearner(null)}
              >
                <i className="fas fa-arrow-left" style={{ marginRight: 6 }} /> Back to Learners
              </button>

              <div style={styles.dateBadgeWrap}>
                <label style={styles.dateBadgeLabel}>Date:</label>
                <input
                  type="date"
                  style={styles.dateBadgeInput}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  max={todayISO()}
                />
              </div>
            </div>

            {/* Child Profile Banner */}
            <div style={styles.childBanner}>
              <div style={styles.bannerPhotoWrap}>
                <LearnerPhoto
                  photo={selectedLearner.photo || selectedLearner.photoUrl}
                  thumbnail={selectedLearner.photoThumb || selectedLearner.photoThumbUrl || null}
                  size="thumb"
                  alt={selectedLearner.fullName}
                  gender={selectedLearner.gender}
                  style={styles.bannerPhoto}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.bannerName}>{selectedLearner.fullName}</div>
                <div style={styles.bannerMeta}>
                  <span style={styles.bannerClass}>
                    <i className="fas fa-school" style={{ marginRight: 5 }} />
                    {getClassName(selectedLearner.currentClassId)}
                  </span>
                  <span style={styles.bannerReg}>
                    <i className="fas fa-id-card" style={{ marginRight: 5 }} />
                    {selectedLearner.regNumber || 'No Reg'}
                  </span>
                </div>
              </div>
            </div>

            {loadingLog && (
              <div style={styles.loadingBanner}>
                <i className="fas fa-spinner fa-spin" /> Loading log for this child…
              </div>
            )}

            {/* P Update Form */}
            <form onSubmit={e => handleSubmit(e, false)} style={styles.form}>
              {/* Notice / Teacher Note */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <i className="fas fa-bullhorn" style={{ marginRight: 8 }} />
                  Teacher Notice / Note to Parents <span style={styles.optionalBadge}>Optional</span>
                </div>
                <textarea
                  style={styles.textarea}
                  placeholder="e.g. Learner participated actively in mathematics today. Please ensure homework is completed."
                  value={notice}
                  onChange={e => setNotice(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Subjects Covered Today */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <i className="fas fa-book-open" style={{ marginRight: 8 }} />
                  Subjects & Performance Today
                </div>

                {entries.map((entry, idx) => (
                  <div key={entry._key} style={styles.entryCard}>
                    <div style={styles.entryCardHeader}>
                      <span style={styles.entryBadge}>Subject Entry {idx + 1}</span>
                      <button
                        type="button"
                        style={styles.removeBtn}
                        onClick={() => removeEntry(entry._key)}
                        title="Remove entry"
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>

                    {/* Subject & Topic */}
                    <div style={styles.entryRow}>
                      <div style={{ ...styles.field, flex: 1 }}>
                        <label style={styles.label}>Subject</label>
                        {classSubjectOptions.length > 0 ? (
                          <select
                            style={styles.select}
                            value={entry.subjectId}
                            onChange={e => handleSubjectSelect(entry._key, e.target.value)}
                          >
                            <option value="">— Select Subject —</option>
                            {classSubjectOptions.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            style={styles.input}
                            placeholder="e.g. Mathematics"
                            value={entry.subjectName}
                            onChange={e => updateEntry(entry._key, 'subjectName', e.target.value)}
                          />
                        )}
                      </div>
                      <div style={{ ...styles.field, flex: 1 }}>
                        <label style={styles.label}>Topic Studied</label>
                        <input
                          style={styles.input}
                          placeholder="e.g. Multiplication & Division"
                          value={entry.topicStudied}
                          onChange={e => updateEntry(entry._key, 'topicStudied', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Exercise & Score */}
                    <div style={styles.entryRow}>
                      <div style={{ ...styles.field, flex: 1 }}>
                        <label style={styles.label}>Exercise / Classwork</label>
                        <input
                          style={styles.input}
                          placeholder="e.g. Ex 4B Questions 1 to 10"
                          value={entry.exerciseTitle}
                          onChange={e => updateEntry(entry._key, 'exerciseTitle', e.target.value)}
                        />
                      </div>
                      <div style={{ ...styles.field, maxWidth: 160 }}>
                        <label style={styles.label}>Marks / Score</label>
                        <input
                          style={styles.input}
                          placeholder="e.g. 9/10"
                          value={entry.scoreObtained}
                          onChange={e => updateEntry(entry._key, 'scoreObtained', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Assignment */}
                    <div style={styles.field}>
                      <label style={styles.label}>
                        Assignment Questions <span style={styles.optionalBadge}>Optional</span>
                      </label>
                      <textarea
                        style={styles.textarea}
                        placeholder="Type full assignment questions here so parents can verify if learner hasn't written clearly…"
                        value={entry.assignmentQuestions}
                        onChange={e => updateEntry(entry._key, 'assignmentQuestions', e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div style={{ ...styles.field, maxWidth: 220 }}>
                      <label style={styles.label}>
                        Due Date <span style={styles.optionalBadge}>Optional</span>
                      </label>
                      <input
                        type="date"
                        style={styles.input}
                        value={entry.assignmentDueDate}
                        onChange={e => updateEntry(entry._key, 'assignmentDueDate', e.target.value)}
                      />
                    </div>
                  </div>
                ))}

                <button type="button" style={styles.addEntryBtn} onClick={addEntry}>
                  <i className="fas fa-plus" /> Add Another Subject
                </button>
              </div>

              {/* Submit Buttons */}
              <div style={styles.submitRow}>
                <button
                  type="button"
                  style={styles.saveNextBtn}
                  disabled={saving}
                  onClick={() => handleSubmit(null, true)}
                >
                  <i className="fas fa-check-double" /> Submit & Next Learner
                </button>
                <button type="submit" style={styles.submitBtn} disabled={saving}>
                  {saving ? (
                    <><i className="fas fa-spinner fa-spin" /> Saving…</>
                  ) : (
                    <><i className="fas fa-paper-plane" /> Submit</>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '1.25rem 1rem 4rem',
    fontFamily: "'Outfit', 'Inter', system-ui, sans-serif"
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.25rem',
    flexWrap: 'wrap',
    gap: '0.75rem'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  headerIcon: {
    width: 44,
    height: 44,
    background: '#09090B',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '1.1rem',
    flexShrink: 0
  },
  pageTitle: {
    fontSize: '1.35rem',
    fontWeight: 800,
    color: '#09090B',
    margin: 0
  },
  pageSubtitle: {
    fontSize: '0.82rem',
    color: '#71717A',
    margin: '2px 0 0'
  },
  dateBadgeWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    border: '1.5px solid #E4E4E7',
    borderRadius: 10,
    padding: '0.4rem 0.75rem'
  },
  dateBadgeLabel: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#52525B',
    textTransform: 'uppercase'
  },
  dateBadgeInput: {
    border: 'none',
    background: 'transparent',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#09090B',
    outline: 'none',
    cursor: 'pointer'
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.5rem',
    flexWrap: 'wrap'
  },
  searchWrap: {
    flex: 1,
    minWidth: 240,
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    color: '#A1A1AA',
    fontSize: '0.88rem'
  },
  searchInput: {
    width: '100%',
    padding: '0.6rem 2.2rem 0.6rem 2.2rem',
    border: '1.5px solid #E4E4E7',
    borderRadius: 10,
    fontSize: '0.88rem',
    background: '#fff',
    color: '#09090B',
    outline: 'none'
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 10,
    background: 'none',
    border: 'none',
    color: '#A1A1AA',
    cursor: 'pointer',
    padding: 4
  },
  classFilterWrap: {
    minWidth: 180
  },
  classSelect: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    border: '1.5px solid #E4E4E7',
    borderRadius: 10,
    fontSize: '0.88rem',
    fontWeight: 600,
    background: '#fff',
    color: '#09090B',
    outline: 'none'
  },
  learnersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem'
  },
  learnerCard: {
    background: '#fff',
    border: '1.5px solid #E4E4E7',
    borderRadius: 14,
    padding: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    marginBottom: '0.85rem'
  },
  photoWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#F4F4F5',
    border: '1px solid #E4E4E7'
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  cardInfo: {
    flex: 1,
    minWidth: 0
  },
  learnerName: {
    fontSize: '0.95rem',
    fontWeight: 800,
    color: '#09090B',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  learnerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap'
  },
  regBadge: {
    fontSize: '0.7rem',
    color: '#71717A',
    fontWeight: 700
  },
  classBadge: {
    background: '#F4F4F5',
    color: '#52525B',
    fontSize: '0.68rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4
  },
  cardFooter: {
    borderTop: '1px solid #F4F4F5',
    paddingTop: '0.6rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.78rem'
  },
  statusLogged: {
    color: '#10B981',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center'
  },
  statusPending: {
    color: '#71717A',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center'
  },
  cardActionHint: {
    color: '#09090B',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 1.5rem',
    background: '#fff',
    border: '1.5px dashed #E4E4E7',
    borderRadius: 16
  },
  emptyIcon: {
    fontSize: '2.5rem',
    color: '#A1A1AA',
    marginBottom: '1rem'
  },
  emptyText: {
    fontSize: '1rem',
    fontWeight: 800,
    color: '#09090B',
    margin: '0 0 0.5rem'
  },
  emptySubText: {
    fontSize: '0.82rem',
    color: '#71717A',
    margin: 0
  },
  entryView: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem'
  },
  entryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.75rem'
  },
  backBtn: {
    background: '#fff',
    border: '1.5px solid #E4E4E7',
    borderRadius: 10,
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#09090B',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  childBanner: {
    background: '#fff',
    border: '1.5px solid #E4E4E7',
    borderRadius: 14,
    padding: '1rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  bannerPhotoWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#F4F4F5',
    border: '1.5px solid #E4E4E7'
  },
  bannerPhoto: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  bannerName: {
    fontSize: '1.2rem',
    fontWeight: 800,
    color: '#09090B'
  },
  bannerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginTop: 4,
    flexWrap: 'wrap'
  },
  bannerClass: {
    fontSize: '0.85rem',
    color: '#52525B',
    fontWeight: 700
  },
  bannerReg: {
    fontSize: '0.85rem',
    color: '#71717A',
    fontWeight: 600
  },
  toast: {
    position: 'fixed',
    top: 'max(1rem, env(safe-area-inset-top, 1rem))',
    right: 'max(1rem, env(safe-area-inset-right, 1rem))',
    left: 'max(1rem, env(safe-area-inset-left, 1rem))',
    maxWidth: 360,
    marginLeft: 'auto',
    background: '#09090B',
    color: '#fff',
    padding: '0.75rem 1rem',
    borderRadius: 10,
    fontSize: '0.875rem',
    fontWeight: 600,
    zIndex: 9999,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
    minWidth: 160
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#52525B',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  input: {
    border: '1.5px solid #E4E4E7',
    borderRadius: 8,
    padding: '0.55rem 0.75rem',
    fontSize: '0.9rem',
    color: '#09090B',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  select: {
    border: '1.5px solid #E4E4E7',
    borderRadius: 8,
    padding: '0.55rem 0.75rem',
    fontSize: '0.9rem',
    color: '#09090B',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  textarea: {
    border: '1.5px solid #E4E4E7',
    borderRadius: 8,
    padding: '0.6rem 0.75rem',
    fontSize: '0.875rem',
    color: '#09090B',
    background: '#fff',
    outline: 'none',
    width: '100%',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  section: {
    background: '#fff',
    border: '1.5px solid #E4E4E7',
    borderRadius: 12,
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  sectionHeader: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#09090B',
    display: 'flex',
    alignItems: 'center'
  },
  optionalBadge: {
    background: '#F4F4F5',
    color: '#71717A',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    marginLeft: 8,
    textTransform: 'uppercase'
  },
  entryCard: {
    background: '#F4F4F5',
    borderRadius: 10,
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    border: '1px solid #E4E4E7'
  },
  entryCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  entryBadge: {
    fontSize: '0.72rem',
    fontWeight: 800,
    color: '#52525B',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#71717A',
    fontSize: '0.9rem',
    padding: '2px 6px',
    borderRadius: 6,
    lineHeight: 1
  },
  entryRow: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap'
  },
  addEntryBtn: {
    background: '#09090B',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '0.6rem 1.1rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start'
  },
  submitRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    flexWrap: 'wrap'
  },
  saveNextBtn: {
    background: '#fff',
    color: '#09090B',
    border: '1.5px solid #09090B',
    borderRadius: 10,
    padding: '0.7rem 1.5rem',
    fontSize: '0.92rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  submitBtn: {
    background: '#09090B',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '0.7rem 2rem',
    fontSize: '0.92rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  loadingBanner: {
    background: '#F4F4F5',
    border: '1px solid #E4E4E7',
    borderRadius: 8,
    padding: '0.6rem 1rem',
    fontSize: '0.82rem',
    color: '#52525B',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  }
};
