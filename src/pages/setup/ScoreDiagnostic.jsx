import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { enqueueSync } from '../../services/syncEngine';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const statusColor = {
  synced:    { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46', dot: '#10b981' },
  partial:   { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', dot: '#f59e0b' },
  local_only:{ bg: '#fff7ed', border: '#fdba74', text: '#9a3412', dot: '#f97316' },
  missing:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', dot: '#ef4444' },
  cloud_only:{ bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', dot: '#3b82f6' },
};

const StatusBadge = ({ status, label }) => {
  const c = statusColor[status] || statusColor.partial;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px',
      borderRadius: '999px', letterSpacing: '0.03em', whiteSpace: 'nowrap'
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ScoreDiagnostic = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;

  // ── Local data ───────────────────────────────────────────────────────────
  const localScores   = useLiveQuery(() => schoolId ? db.scores.where('schoolId').equals(schoolId).toArray() : [], [schoolId]);
  const classes       = useLiveQuery(() => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [], [schoolId]);
  const subjects      = useLiveQuery(() => schoolId ? db.subjects.where('schoolId').equals(schoolId).toArray() : [], [schoolId]);
  const learners      = useLiveQuery(() => schoolId ? db.learners.where('schoolId').equals(schoolId).toArray() : [], [schoolId]);
  const outboxItems   = useLiveQuery(() => db.outbox.toArray(), []);
  const schoolInfo    = useLiveQuery(() => schoolId ? db.schools.get(schoolId) : null, [schoolId]);

  // ── Cloud data ────────────────────────────────────────────────────────────
  const [cloudScores, setCloudScores]     = useState([]);
  const [cloudLoading, setCloudLoading]   = useState(false);
  const [lastFetched, setLastFetched]     = useState(null);
  const [syncingGroups, setSyncingGroups] = useState(new Set());
  const [syncResults, setSyncResults]     = useState({});
  const [isOnline, setIsOnline]           = useState(navigator.onLine);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const fetchCloudScores = useCallback(async () => {
    if (!schoolId || !navigator.onLine) return;
    setCloudLoading(true);
    try {
      const { data, error } = await supabase
        .from('report_scores')
        .select('learner_id, class_id, subject_id, term, academic_year, total_score, updated_at, ca_scores, exam_score')
        .eq('school_id', schoolId);
      if (!error && data) {
        setCloudScores(data);
        setLastFetched(new Date());
      }
    } catch (err) {
      console.error('[Diagnostic] Cloud fetch failed:', err);
    } finally {
      setCloudLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { fetchCloudScores(); }, [fetchCloudScores]);

  // ── Build comparison groups ───────────────────────────────────────────────
  const groups = useMemo(() => {
    if (!localScores || !classes || !subjects || !learners) return [];

    const classMap   = new Map((classes  || []).map(c => [c.id, c.name]));
    const subjectMap = new Map((subjects || []).map(s => [s.id, s.name]));

    // Index cloud scores
    const cloudIndex = new Map();
    cloudScores.forEach(cs => {
      const key = `${cs.class_id}|${cs.subject_id}|${cs.term}|${cs.academic_year}`;
      if (!cloudIndex.has(key)) cloudIndex.set(key, new Set());
      cloudIndex.get(key).add(cs.learner_id);
    });

    // Index local scores
    const localIndex = new Map();
    localScores.forEach(ls => {
      const key = `${ls.classId}|${ls.subjectId}|${ls.term}|${ls.academicYear}`;
      if (!localIndex.has(key)) localIndex.set(key, []);
      localIndex.get(key).push(ls);
    });

    // Index learners
    const learnerMap = new Map();
    learners.forEach(l => {
      if (l.supabaseId) learnerMap.set(l.supabaseId, l);
      learnerMap.set(String(l.id), l);
    });

    // Combine all unique keys
    const allKeys = new Set([...localIndex.keys(), ...cloudIndex.keys()]);
    const result = [];

    allKeys.forEach(key => {
      const [classId, subjectId, term, academicYear] = key.split('|');
      const localEntries  = localIndex.get(key) || [];
      const cloudLearnerIds = cloudIndex.get(key) || new Set();

      // Build per-learner rows
      const localLearnerIds = new Set(localEntries.map(s => s.learnerId));
      const allLearnerIds   = new Set([...localLearnerIds, ...cloudLearnerIds]);

      let syncedCount = 0, localOnlyCount = 0, cloudOnlyCount = 0;
      const rows = [];

      allLearnerIds.forEach(lid => {
        const inLocal = localLearnerIds.has(lid);
        const inCloud = cloudLearnerIds.has(lid);
        const learner = learnerMap.get(lid) || learnerMap.get(String(lid));
        let rowStatus;
        if (inLocal && inCloud) { rowStatus = 'synced'; syncedCount++; }
        else if (inLocal && !inCloud) { rowStatus = 'local_only'; localOnlyCount++; }
        else { rowStatus = 'cloud_only'; cloudOnlyCount++; }

        rows.push({
          learnerId: lid,
          learnerName: learner?.fullName || `Learner (${lid.slice(0, 8)}…)`,
          status: rowStatus,
        });
      });

      // Group-level status
      let groupStatus;
      if (localOnlyCount === 0 && cloudOnlyCount === 0 && syncedCount > 0)
        groupStatus = 'synced';
      else if (localOnlyCount > 0 && cloudOnlyCount === 0 && syncedCount === 0)
        groupStatus = 'local_only';
      else if (cloudOnlyCount > 0 && localOnlyCount === 0)
        groupStatus = 'cloud_only';
      else if (localOnlyCount > 0)
        groupStatus = 'partial';
      else
        groupStatus = 'missing';

      // Pending outbox item for this group?
      const hasPendingOutbox = (outboxItems || []).some(o =>
        o.table === 'report_scores' &&
        ['pending','processing','failed'].includes(o.status) &&
        o.payload.includes(String(classId)) &&
        o.payload.includes(String(subjectId))
      );

      result.push({
        key,
        classId: Number(classId),
        subjectId: Number(subjectId),
        term,
        academicYear,
        className:   classMap.get(Number(classId))   || `Class #${classId}`,
        subjectName: subjectMap.get(Number(subjectId)) || `Subject #${subjectId}`,
        totalLocal:  localEntries.length,
        totalCloud:  cloudLearnerIds.size,
        syncedCount,
        localOnlyCount,
        cloudOnlyCount,
        groupStatus,
        hasPendingOutbox,
        rows: rows.sort((a, b) => a.learnerName.localeCompare(b.learnerName)),
      });
    });

    // Sort: problems first
    const order = { local_only: 0, partial: 1, missing: 2, cloud_only: 3, synced: 4 };
    return result.sort((a, b) => (order[a.groupStatus] ?? 5) - (order[b.groupStatus] ?? 5));
  }, [localScores, cloudScores, classes, subjects, learners, outboxItems]);

  // ── Force re-sync a group ────────────────────────────────────────────────
  const handleForceSync = useCallback(async (group) => {
    if (!schoolId || !navigator.onLine) {
      alert('You must be online to force a re-sync.');
      return;
    }
    const key = group.key;
    setSyncingGroups(prev => new Set([...prev, key]));
    setSyncResults(prev => ({ ...prev, [key]: null }));

    try {
      // Gather local score entries for this group
      const localEntries = (localScores || []).filter(s =>
        s.classId === group.classId &&
        s.subjectId === group.subjectId &&
        s.term === group.term &&
        s.academicYear === group.academicYear
      );

      if (localEntries.length === 0) {
        setSyncResults(prev => ({ ...prev, [key]: { ok: false, msg: 'No local scores found to upload.' } }));
        return;
      }

      // Build cloud payload
      const insertData = localEntries.map(s => ({
        school_id:    schoolId,
        learner_id:   s.learnerId,
        class_id:     s.classId,
        subject_id:   s.subjectId,
        ca_scores:    s.caScores || [],
        exam_score:   s.examScore !== '' && s.examScore !== null && s.examScore !== undefined ? Number(s.examScore) : null,
        class_score:  Number(s.classScore) || 0,
        total_score:  Number(s.totalScore) || null,
        grade:        s.grade || null,
        remark:       s.remark || null,
        is_submitted: s.isSubmitted || false,
        academic_year: s.academicYear,
        term:         s.term,
        updated_at:   new Date().toISOString(),
      }));

      await enqueueSync(
        'delete_insert',
        'report_scores',
        {
          deleteFilter: {
            school_id:    schoolId,
            class_id:     group.classId,
            subject_id:   group.subjectId,
            term:         group.term,
            academic_year: group.academicYear,
          },
          insertData,
        },
        schoolId
      );

      setSyncResults(prev => ({
        ...prev,
        [key]: { ok: true, msg: `${insertData.length} score(s) queued for upload. Syncing…` }
      }));

      // Refresh cloud data after a short delay
      setTimeout(fetchCloudScores, 4000);
    } catch (err) {
      setSyncResults(prev => ({ ...prev, [key]: { ok: false, msg: `Error: ${err.message}` } }));
    } finally {
      setSyncingGroups(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [schoolId, localScores, fetchCloudScores]);

  // ── Stats summary ────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const total      = groups.length;
    const synced     = groups.filter(g => g.groupStatus === 'synced').length;
    const problems   = groups.filter(g => g.groupStatus !== 'synced' && g.groupStatus !== 'cloud_only').length;
    const localOnly  = groups.filter(g => g.groupStatus === 'local_only').length;
    const partial    = groups.filter(g => g.groupStatus === 'partial').length;
    return { total, synced, problems, localOnly, partial };
  }, [groups]);

  const pendingOutbox  = (outboxItems || []).filter(o => o.status === 'pending' || o.status === 'processing').length;
  const failedOutbox   = (outboxItems || []).filter(o => o.status === 'failed').length;

  // ── Expanded rows ─────────────────────────────────────────────────────────
  const [expandedKeys, setExpandedKeys] = useState(new Set());
  const toggleExpand = (key) => {
    setExpandedKeys(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const [filterTerm,  setFilterTerm]  = useState('');
  const [filterYear,  setFilterYear]  = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [showOnlyProblems, setShowOnlyProblems] = useState(true);

  const displayedGroups = useMemo(() => {
    return groups.filter(g => {
      if (showOnlyProblems && g.groupStatus === 'synced') return false;
      if (filterTerm  && g.term         !== filterTerm)  return false;
      if (filterYear  && g.academicYear !== filterYear)  return false;
      if (filterClass && String(g.classId) !== filterClass) return false;
      return true;
    });
  }, [groups, showOnlyProblems, filterTerm, filterYear, filterClass]);

  const uniqueTerms  = useMemo(() => [...new Set(groups.map(g => g.term))].sort(), [groups]);
  const uniqueYears  = useMemo(() => [...new Set(groups.map(g => g.academicYear))].sort().reverse(), [groups]);
  const uniqueClasses = useMemo(() => (classes || []).map(c => ({ id: c.id, name: c.name })), [classes]);

  return (
    <Layout title="Score Sync Diagnostic">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@700;800;900&display=swap');
        .diag-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .diag-row { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); transition: box-shadow 0.2s, border-color 0.2s; cursor: pointer; }
        .diag-row:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-color: #94a3b8; }
        .diag-learner-row { display: flex; align-items: center; gap: 10px; padding: 0.55rem 1rem; border-radius: 8px; font-size: 0.82rem; }
        .diag-learner-row:nth-child(odd) { background: rgba(0,0,0,0.02); }
        .stat-pill { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; border-radius: 14px; min-width: 110px; flex: 1; }
        .filter-select { height: 36px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 0.82rem; padding: 0 10px; outline: none; }
        .force-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 8px; border: none; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit, Inter, sans-serif', fontSize: '1.6rem', fontWeight: 900, color: 'var(--primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: '#eff6ff', borderRadius: 10, width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-stethoscope" style={{ color: '#3b82f6', fontSize: '1rem' }} />
              </span>
              Score Sync Diagnostic
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginTop: 4 }}>
              Compare local scores vs Supabase cloud — identify and fix missing or unsynced records.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {!isOnline && (
              <span style={{ fontSize: '0.78rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 12px', fontWeight: 700 }}>
                <i className="fas fa-wifi-slash" style={{ marginRight: 5 }} />Offline
              </span>
            )}
            {lastFetched && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Last fetched: {lastFetched.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchCloudScores}
              disabled={cloudLoading || !isOnline}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.83rem', cursor: cloudLoading ? 'wait' : 'pointer', opacity: (!isOnline || cloudLoading) ? 0.6 : 1 }}
            >
              <i className={`fas ${cloudLoading ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
              {cloudLoading ? 'Fetching…' : 'Refresh Cloud'}
            </button>
          </div>
        </div>

        {/* ── Outbox Status ── */}
        {(pendingOutbox > 0 || failedOutbox > 0) && (
          <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem', borderRadius: 12, background: pendingOutbox > 0 ? '#eff6ff' : '#fef2f2', border: `1px solid ${pendingOutbox > 0 ? '#93c5fd' : '#fca5a5'}`, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <i className={`fas ${pendingOutbox > 0 ? 'fa-rotate fa-spin' : 'fa-triangle-exclamation'}`} style={{ color: pendingOutbox > 0 ? '#3b82f6' : '#ef4444' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: pendingOutbox > 0 ? '#1e40af' : '#991b1b' }}>
              {pendingOutbox > 0
                ? `${pendingOutbox} outbox item(s) currently syncing to Supabase. Refresh in a moment.`
                : `${failedOutbox} outbox item(s) failed to sync. Use "Force Re-sync" below or check your connection.`
              }
            </div>
          </div>
        )}

        {/* ── Summary Pills ── */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div className="stat-pill" style={{ background: '#ecfdf5', border: '1px solid #6ee7b7' }}>
            <span style={{ fontSize: '1.7rem', fontWeight: 900, color: '#065f46', fontFamily: 'Outfit, sans-serif' }}>{summary.synced}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fully Synced</span>
          </div>
          <div className="stat-pill" style={{ background: '#fff7ed', border: '1px solid #fdba74' }}>
            <span style={{ fontSize: '1.7rem', fontWeight: 900, color: '#9a3412', fontFamily: 'Outfit, sans-serif' }}>{summary.localOnly}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Local Only</span>
          </div>
          <div className="stat-pill" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
            <span style={{ fontSize: '1.7rem', fontWeight: 900, color: '#92400e', fontFamily: 'Outfit, sans-serif' }}>{summary.partial}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Partial Sync</span>
          </div>
          <div className="stat-pill" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '1.7rem', fontWeight: 900, color: '#1e293b', fontFamily: 'Outfit, sans-serif' }}>{summary.total}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Groups</span>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="diag-card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={showOnlyProblems} onChange={e => setShowOnlyProblems(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#ef4444' }} />
              Show problems only
            </label>
            <select className="filter-select" value={filterYear}  onChange={e => setFilterYear(e.target.value)}>
              <option value="">All Years</option>
              {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="filter-select" value={filterTerm}  onChange={e => setFilterTerm(e.target.value)}>
              <option value="">All Terms</option>
              {uniqueTerms.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All Classes</option>
              {uniqueClasses.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            {(filterYear || filterTerm || filterClass) && (
              <button onClick={() => { setFilterYear(''); setFilterTerm(''); setFilterClass(''); }}
                style={{ fontSize: '0.78rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Clear filters
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing <strong>{displayedGroups.length}</strong> of {groups.length} group(s)
            </span>
          </div>
        </div>

        {/* ── Group List ── */}
        {cloudLoading && groups.length === 0 ? (
          <div className="diag-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-spinner fa-spin fa-2x" style={{ color: '#3b82f6', marginBottom: '1rem' }} /><br />
            Fetching cloud data…
          </div>
        ) : !isOnline && groups.length === 0 ? (
          <div className="diag-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-wifi-slash fa-2x" style={{ marginBottom: '1rem', color: '#f59e0b' }} />
            <h3 style={{ margin: '0 0 0.5rem' }}>You're Offline</h3>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Connect to the internet to run a full diagnostic and see cloud sync status.</p>
          </div>
        ) : displayedGroups.length === 0 ? (
          <div className="diag-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-circle-check fa-2x" style={{ color: '#10b981', marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem', color: '#065f46' }}>All Good!</h3>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>No sync problems detected. All score groups appear to be synced.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {displayedGroups.map(group => {
              const isExpanded  = expandedKeys.has(group.key);
              const isSyncing   = syncingGroups.has(group.key);
              const result      = syncResults[group.key];
              const c           = statusColor[group.groupStatus] || statusColor.partial;

              return (
                <div key={group.key} style={{ border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden', background: 'var(--surface)', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>

                  {/* Group Header */}
                  <div
                    className="diag-row"
                    style={{ border: 'none', borderRadius: 0, background: c.bg, gap: '1rem' }}
                    onClick={() => toggleExpand(group.key)}
                  >
                    {/* Left: class/subject info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.93rem', color: 'var(--primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {group.className} — {group.subjectName}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {group.term} &bull; {group.academicYear}
                        </div>
                      </div>
                    </div>

                    {/* Center: counts */}
                    <div style={{ display: 'flex', gap: '1.25rem', flexShrink: 0 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#065f46', fontFamily: 'Outfit, sans-serif' }}>{group.totalLocal}</div>
                        <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Local</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1e40af', fontFamily: 'Outfit, sans-serif' }}>{group.totalCloud}</div>
                        <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Cloud</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: group.localOnlyCount > 0 ? '#9a3412' : '#065f46', fontFamily: 'Outfit, sans-serif' }}>{group.localOnlyCount}</div>
                        <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Missing</div>
                      </div>
                    </div>

                    {/* Right: badge + actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                      <StatusBadge
                        status={group.groupStatus}
                        label={
                          group.groupStatus === 'synced'     ? 'Synced' :
                          group.groupStatus === 'local_only' ? 'Local Only' :
                          group.groupStatus === 'partial'    ? 'Partial' :
                          group.groupStatus === 'cloud_only' ? 'Cloud Only' : 'Unknown'
                        }
                      />
                      {group.hasPendingOutbox && (
                        <span title="Upload pending in outbox" style={{ fontSize: '0.7rem', color: '#1e40af', background: '#dbeafe', borderRadius: 6, padding: '2px 7px', fontWeight: 700 }}>
                          <i className="fas fa-rotate fa-spin" style={{ marginRight: 3 }} />Queued
                        </span>
                      )}
                      {group.localOnlyCount > 0 && (
                        <button
                          className="force-btn"
                          disabled={isSyncing || !isOnline}
                          onClick={e => { e.stopPropagation(); handleForceSync(group); }}
                          style={{ background: isSyncing ? '#e2e8f0' : 'linear-gradient(135deg,#f97316,#ef4444)', color: isSyncing ? '#64748b' : '#fff', opacity: !isOnline ? 0.5 : 1 }}
                        >
                          <i className={`fas ${isSyncing ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} />
                          {isSyncing ? 'Syncing…' : 'Force Re-sync'}
                        </button>
                      )}
                      <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} style={{ color: '#94a3b8', fontSize: '0.75rem' }} />
                    </div>
                  </div>

                  {/* Result message */}
                  {result && (
                    <div style={{ padding: '0.6rem 1.25rem', background: result.ok ? '#ecfdf5' : '#fef2f2', borderTop: `1px solid ${result.ok ? '#6ee7b7' : '#fca5a5'}`, fontSize: '0.8rem', fontWeight: 600, color: result.ok ? '#065f46' : '#991b1b', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <i className={`fas ${result.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                      {result.msg}
                    </div>
                  )}

                  {/* Learner rows (expanded) */}
                  {isExpanded && (
                    <div style={{ padding: '0.75rem 1.25rem 1rem', background: '#f8fafc', borderTop: `1px solid ${c.border}` }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: '0.5rem' }}>
                        {group.rows.length} Learner(s)
                      </div>
                      {group.rows.map(row => {
                        const rc = statusColor[row.status] || statusColor.partial;
                        return (
                          <div key={row.learnerId} className="diag-learner-row">
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc.dot, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontWeight: 600, color: 'var(--text)', fontSize: '0.82rem' }}>{row.learnerName}</span>
                            <StatusBadge
                              status={row.status}
                              label={
                                row.status === 'synced'     ? '✓ Synced' :
                                row.status === 'local_only' ? '⚠ Local Only' :
                                row.status === 'cloud_only' ? '☁ Cloud Only' : 'Partial'
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Legend ── */}
        <div className="diag-card" style={{ marginTop: '1.5rem', padding: '1rem 1.5rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: '0.75rem' }}>Legend</div>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            {[
              { status: 'synced',     label: 'Synced — Scores exist in both local device and Supabase cloud.' },
              { status: 'local_only', label: 'Local Only — Scores saved locally but NOT uploaded to Supabase yet.' },
              { status: 'partial',    label: 'Partial — Some learners synced, others still local-only.' },
              { status: 'cloud_only', label: 'Cloud Only — Scores in Supabase but missing from this device.' },
            ].map(({ status, label }) => {
              const c = statusColor[status];
              return (
                <div key={status} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 220 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: 3 }} />
                  <span><strong style={{ color: c.text }}>{status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {label}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default ScoreDiagnostic;
