import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../store/AuthContext';
import { enqueueSync } from '../../services/syncEngine';
import LearnerPhoto from '../../components/common/LearnerPhoto';
import { getNextClassForPromotion } from '../../utils/promotionUtils';

const ClassTeacherEntry = () => {
  const { user } = useAuth();
  
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [academicYear, setAcademicYear] = useState('');
  const [activeLearnerId, setActiveLearnerId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Online / Offline tracking ────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const classes = useLiveQuery(() => user?.schoolId ? db.classes.filter(c => String(c.schoolId) === String(user.schoolId) || String(c.school_id || '') === String(user.schoolId)).toArray() : [], [user?.schoolId]);
  const learners = useLiveQuery(() => user?.schoolId ? db.learners.filter(l => String(l.schoolId) === String(user.schoolId) || String(l.school_id || '') === String(user.schoolId)).toArray() : [], [user?.schoolId]);
  const reportSummaries = useLiveQuery(() => user?.schoolId ? db.reportSummaries.filter(r => String(r.schoolId) === String(user.schoolId) || String(r.school_id || '') === String(user.schoolId)).toArray() : [], [user?.schoolId]);
  const teacherAssignments = useLiveQuery(() => user?.schoolId ? db.teacherAssignments.filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)).toArray() : [], [user?.schoolId]);
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]
  );

  // Live count of pending outbox items for sync status display
  const outboxItems = useLiveQuery(() => db.outbox.toArray(), []);
  useEffect(() => {
    if (!outboxItems) return;
    const count = outboxItems.filter(i => i.status === 'pending' || i.status === 'failed' || i.status === 'processing').length;
    setPendingSyncCount(count);
  }, [outboxItems]);

  const formatDateSafe = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const [form, setForm] = useState({
    attendancePresent: '',
    attendanceTotal: '',
    conduct: '',
    attitude: '',
    teacherRemark: '',
    promotedTo: '',
  });

  useEffect(() => {
    if (schoolInfo) {
      if (schoolInfo.currentAcademicYear) setAcademicYear(schoolInfo.currentAcademicYear);
      if (schoolInfo.currentTerm) setSelectedTerm(schoolInfo.currentTerm);
    }
  }, [schoolInfo]);

  // Sync summaries from cloud on load (skipped silently when offline — Dexie cache is used instead)
  useEffect(() => {
    if (!user?.schoolId) return;
    if (!navigator.onLine) {
      console.log('[ClassTeacherEntry] Offline — serving report summaries from local IndexedDB cache.');
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.from('report_summaries').select('*').eq('school_id', user.schoolId);
        if (data && !error) {
          for (const s of data) {
            const existing = await db.reportSummaries.where('supabaseId').equals(s.id).first();
            await db.reportSummaries.put({
              id: existing?.id,
              schoolId: s.school_id, learnerId: s.learner_id, classId: s.class_id,
              academicYear: s.academic_year, term: s.term,
              attendancePresent: s.attendance_present, attendanceTotal: s.attendance_total,
              conduct: s.conduct, attitude: s.attitude,
              teacherRemark: s.teacher_remark, headteacherRemark: s.headteacher_remark,
              promotedTo: s.promoted_to, nextTermBegins: s.next_term_begins,
              feesOwed: s.fees_owed, nextTermBill: s.next_term_bill, synced: true, supabaseId: s.id,
            });
          }
        }
      } catch (err) { console.error('Cloud sync error:', err); }
    })();
  }, [user]);

  // Filter classes where user is class teacher (subjectId is null)
  const classTeacherClasses = useMemo(() => {
    if (!classes || !teacherAssignments || !user) return [];
    if (user.role === 'super_admin') return classes; // fallback for admin testing
    const assignedIds = new Set(
      teacherAssignments
        .filter(a => a.teacherId === user.id && a.subjectId === null)
        .map(a => Number(a.classId))
    );
    return classes.filter(c => assignedIds.has(Number(c.id)));
  }, [classes, teacherAssignments, user]);

  const classLearners = useMemo(() => {
    if (!selectedClass || !learners) return [];
    return learners.filter(l => l.currentClassId === Number(selectedClass))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [learners, selectedClass]);

  const activeLearner = useMemo(() => classLearners.find(l => l.id === activeLearnerId), [classLearners, activeLearnerId]);

  const activeSummary = useMemo(() => {
    if (!activeLearnerId || !activeLearner || !reportSummaries || !academicYear || !selectedTerm) return null;
    return reportSummaries.find(s =>
      (s.learnerId === activeLearnerId || s.learnerId === String(activeLearnerId) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) && s.academicYear === academicYear && s.term === selectedTerm
    );
  }, [activeLearnerId, activeLearner, reportSummaries, academicYear, selectedTerm]);

  useEffect(() => {
    const nextClassObj = getNextClassForPromotion(selectedClass, classes);
    const autoDefaultNext = nextClassObj === 'Alumni' ? 'Alumni' : nextClassObj ? String(nextClassObj.id) : '';

    if (activeSummary) {
      setForm({
        attendancePresent: activeSummary.attendancePresent ?? '',
        attendanceTotal: activeSummary.attendanceTotal ?? '',
        conduct: activeSummary.conduct || '',
        attitude: activeSummary.attitude || '',
        teacherRemark: activeSummary.teacherRemark || '',
        promotedTo: activeSummary.promotedTo || autoDefaultNext,
      });
    } else {
      setForm({
        attendancePresent: '', attendanceTotal: '',
        conduct: '', attitude: '', teacherRemark: '',
        promotedTo: autoDefaultNext,
      });
    }
  }, [activeSummary, activeLearnerId, selectedClass, classes]);

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!activeLearnerId || !selectedClass || !academicYear || !selectedTerm) { 
      alert('Missing required fields.'); return; 
    }
    setIsSaving(true);
    const resolvedLearnerId = activeLearner?.supabaseId || activeLearnerId;

    // We merge with activeSummary so we don't overwrite headteacher remarks etc.
    const record = {
      ...(activeSummary || {}),
      schoolId: user.schoolId,
      learnerId: resolvedLearnerId,
      classId: Number(selectedClass),
      academicYear,
      term: selectedTerm,
      attendancePresent: Number(form.attendancePresent) || 0,
      attendanceTotal: Number(form.attendanceTotal) || 0,
      conduct: form.conduct,
      attitude: form.attitude,
      teacherRemark: form.teacherRemark,
      promotedTo: form.promotedTo,
      classAverage: activeSummary?.classAverage || activeSummary?.class_average || null,
      classRank: activeSummary?.classRank || activeSummary?.class_rank || null,
      totalGraded: activeSummary?.totalGraded || activeSummary?.total_graded || null,
      synced: false,
    };
    
    if (activeSummary) { 
      record.id = activeSummary.id; 
      record.supabaseId = activeSummary.supabaseId; 
    }

    try {
      const savedId = await db.reportSummaries.put(record);

      // Enqueue cloud sync (works offline — drains when back online) only if student has valid UUID
      const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
      
      if (isUuid(activeLearner?.supabaseId)) {
        const cloud = {
          school_id: user.schoolId,
          learner_id: activeLearner.supabaseId,
          class_id: Number(selectedClass),
          academic_year: academicYear,
          term: selectedTerm,
          attendance_present: Number(form.attendancePresent) || 0,
          attendance_total:   Number(form.attendanceTotal)   || 0,
          conduct: form.conduct,
          attitude: form.attitude,
          teacher_remark: form.teacherRemark,
          // Keep existing headteacher/admin fields
          headteacher_remark: activeSummary?.headteacherRemark || '',
          promoted_to: form.promotedTo,
          next_term_begins: activeSummary?.nextTermBegins || '',
          fees_owed: activeSummary?.feesOwed || '',
          next_term_bill: activeSummary?.nextTermBill || '',
          class_average: activeSummary?.classAverage || activeSummary?.class_average || null,
          class_rank: activeSummary?.classRank || activeSummary?.class_rank || null,
          total_graded: activeSummary?.totalGraded || activeSummary?.total_graded || null,
          updated_at: new Date().toISOString(),
        };

         if (isUuid(activeSummary?.supabaseId)) {
          await enqueueSync('update', 'report_summaries', { filter: { id: activeSummary.supabaseId }, data: cloud }, user.schoolId);
         } else {
          await enqueueSync('insert', 'report_summaries', cloud, user.schoolId);
         }
       }

      // Mark synced:true only if we are online and the outbox can drain immediately,
      // otherwise leave as synced:false so the SyncEngine marks it after a successful drain.
      if (navigator.onLine) {
        await db.reportSummaries.update(savedId, { synced: true });
      }

      if (isOnline) {
        alert('Remarks saved and synced to cloud successfully!');
      } else {
        alert('Remarks saved offline. They will sync automatically when you reconnect.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving. Please try again.');
    } finally { setIsSaving(false); }
  };

  return (
    <Layout title="Class Remarks & Attendance">
      <style>{`
        .entry-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;overflow-y:auto;}
        .entry-modal{background:#fff;border-radius:20px;width:100%;max-width:580px;box-shadow:0 25px 60px rgba(0,0,0,0.2);animation:modalIn .25s cubic-bezier(.34,1.56,.64,1) both;margin:auto;}
        @keyframes modalIn{from{opacity:0;transform:scale(.94) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .entry-modal-header{padding:1.5rem 1.5rem 1rem;display:flex;justify-content:space-between;align-items:center; border-bottom: 1px solid var(--border); }
        .entry-modal-body{padding:1.5rem;}
        .close-btn { background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #64748b; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .close-btn:hover { background: #e2e8f0; color: #0f172a; transform: rotate(90deg); }
      `}</style>
      <div className="fade-in">

        {/* ── Offline / Sync status banner ────────────────────────────────── */}
        {!isOnline && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            background: '#FFFBEB',
            border: '1px solid #FEF3C7', borderRadius: '12px',
            padding: '0.75rem 1.25rem', marginBottom: '1.25rem',
            fontSize: '0.88rem', color: '#92400e', fontWeight: 600,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <i className="fas fa-wifi-slash" style={{ fontSize: '1.1rem', color: '#F59E0B', flexShrink: 0 }}></i>
            <div>
              <strong>You are offline.</strong> Remarks you save will be stored locally and synced automatically when you reconnect.
            </div>
          </div>
        )}
        {isOnline && pendingSyncCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            background: '#EFF6FF',
            border: '1px solid #DBEAFE', borderRadius: '12px',
            padding: '0.75rem 1.25rem', marginBottom: '1.25rem',
            fontSize: '0.88rem', color: '#1e40af', fontWeight: 600,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <i className="fas fa-rotate fa-spin" style={{ fontSize: '1rem', color: '#2563eb', flexShrink: 0 }}></i>
            <div>
              Syncing {pendingSyncCount} pending record{pendingSyncCount !== 1 ? 's' : ''} to the cloud…
            </div>
          </div>
        )}
        {isOnline && pendingSyncCount === 0 && outboxItems !== undefined && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            background: '#ECFDF5',
            border: '1px solid #D1FAE5', borderRadius: '12px',
            padding: '0.65rem 1.25rem', marginBottom: '1.25rem',
            fontSize: '0.85rem', color: '#065f46', fontWeight: 600,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <i className="fas fa-cloud-check" style={{ fontSize: '1rem', color: '#10B981', flexShrink: 0 }}></i>
            <div>All remarks synced to the cloud.</div>
          </div>
        )}

        <div className="card" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <label className="form-label">Select Assigned Class</label>
            <select className="form-input" value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setActiveLearnerId(null); }}>
              <option value="">-- Choose Class --</option>
              {classTeacherClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
            <label className="form-label">Term</label>
            <select className="form-input" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
            <label className="form-label">Academic Year</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. 2025/2026"
              value={academicYear} 
              onChange={(e) => setAcademicYear(e.target.value)} 
            />
          </div>
        </div>

        {schoolInfo && (schoolInfo.vacationDate || schoolInfo.nextTermBegins) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '0.85rem 1.25rem',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
            fontSize: '0.85rem',
            color: 'var(--text)',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-calendar-alt" style={{ color: 'var(--accent)', fontSize: '1rem' }} />
              <span style={{ fontWeight: 600 }}>Official School Dates:</span>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {schoolInfo.vacationDate && (
                <span><strong>Vacation Date:</strong> {formatDateSafe(schoolInfo.vacationDate)}</span>
              )}
              {schoolInfo.nextTermBegins && (
                <span><strong>Next Term Begins:</strong> {formatDateSafe(schoolInfo.nextTermBegins)}</span>
              )}
            </div>
          </div>
        )}

        {selectedClass && classLearners.length > 0 && (
          <div className="learners-grid">
            {classLearners.map(l => {
              const summary = reportSummaries?.find(s => 
                (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId)) && 
                s.academicYear === academicYear && 
                s.term === selectedTerm
              );
              
              const hasRemarks = summary && (summary.teacherRemark || summary.conduct || summary.attendanceTotal);

              return (
                <div key={l.id} className="learner-card" onClick={() => setActiveLearnerId(l.id)}>
                  <div className="lc-header">
                    <div className="lc-photo-wrap">
                      <LearnerPhoto
                        photo={l.photo || l.photoUrl}
                        thumbnail={l.photoThumb || l.photoThumbUrl || null}
                        size="thumb"
                        alt={l.fullName}
                        gender={l.gender}
                        className="lc-photo"
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="lc-name" title={l.fullName}>{l.fullName}</div>
                      <div className="lc-reg">{l.regNumber}</div>
                    </div>
                  </div>
                  <div className={`lc-status ${hasRemarks ? 'status-filled' : 'status-empty'}`}>
                    {hasRemarks ? (
                      <><i className="fas fa-check-circle"></i> Remarks Saved</>
                    ) : (
                      <><i className="fas fa-exclamation-circle"></i> Needs Remarks</>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {selectedClass && classLearners.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <p>No learners found in this class.</p>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {activeLearnerId && (
        <div className="entry-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setActiveLearnerId(null); }}>
          <div className="entry-modal">
            <div className="entry-modal-header">
              <div>
                <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.25rem' }}>
                  Remarks Entry
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {activeLearner?.fullName} ({activeLearner?.regNumber})
                </div>
              </div>
              <button className="close-btn" onClick={() => setActiveLearnerId(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="entry-modal-body">
              <form onSubmit={(e) => { handleSave(e); setActiveLearnerId(null); }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Days Present</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={form.attendancePresent}
                        onChange={e => setForm({...form, attendancePresent: e.target.value})}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Total Days</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={form.attendanceTotal}
                        onChange={e => setForm({...form, attendanceTotal: e.target.value})}
                      />
                    </div>
                  </div>

                  {/* Conduct Field with 6 Options + Custom Entry */}
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Conduct</span>
                      <small style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '0.72rem' }}>Pick preset or type custom text below</small>
                    </label>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <select
                        className="form-input"
                        style={{ fontSize: '0.82rem', padding: '0.4rem 0.65rem' }}
                        value={['Exceptional & Respectful', 'Satisfactory & Well-Behaved', 'Obedient & Disciplined', 'Needs Self-Discipline', 'Disruptive in Class', 'Untidy & Irresponsible'].includes(form.conduct) ? form.conduct : 'custom'}
                        onChange={e => {
                          if (e.target.value !== 'custom') {
                            setForm({ ...form, conduct: e.target.value });
                          }
                        }}
                      >
                        <option value="custom">✏️ Custom Entry (Type below or pick preset…)</option>
                        <optgroup label="Good / Positive">
                          <option value="Exceptional & Respectful">Satisfactory & Respectful (Good)</option>
                          <option value="Satisfactory & Well-Behaved">Well-Behaved & Disciplined (Good)</option>
                          <option value="Obedient & Disciplined">Obedient & Cooperative (Good)</option>
                        </optgroup>
                        <optgroup label="Needs Improvement / Bad">
                          <option value="Needs Self-Discipline">Needs Self-Discipline (Needs Work)</option>
                          <option value="Disruptive in Class">Disruptive in Class (Needs Work)</option>
                          <option value="Untidy & Irresponsible">Untidy & Irresponsible (Needs Work)</option>
                        </optgroup>
                      </select>

                      <input 
                        type="text" 
                        list="conduct-preset-list"
                        className="form-input" 
                        placeholder="Type custom conduct or select preset above…"
                        value={form.conduct}
                        onChange={e => setForm({...form, conduct: e.target.value})}
                      />

                      <datalist id="conduct-preset-list">
                        <option value="Exceptional & Respectful" />
                        <option value="Satisfactory & Well-Behaved" />
                        <option value="Obedient & Disciplined" />
                        <option value="Needs Self-Discipline" />
                        <option value="Disruptive in Class" />
                        <option value="Untidy & Irresponsible" />
                      </datalist>
                    </div>
                  </div>

                  {/* Attitude Field with 6 Options + Custom Entry */}
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Attitude</span>
                      <small style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '0.72rem' }}>Pick preset or type custom text below</small>
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <select
                        className="form-input"
                        style={{ fontSize: '0.82rem', padding: '0.4rem 0.65rem' }}
                        value={['Hardworking & Diligent', 'Attentive & Enthusiastic', 'Cooperative & Helpful', 'Passive & Lacks Focus', 'Careless & Reluctant', 'Uncooperative in Class'].includes(form.attitude) ? form.attitude : 'custom'}
                        onChange={e => {
                          if (e.target.value !== 'custom') {
                            setForm({ ...form, attitude: e.target.value });
                          }
                        }}
                      >
                        <option value="custom">✏️ Custom Entry (Type below or pick preset…)</option>
                        <optgroup label="Good / Positive">
                          <option value="Hardworking & Diligent">Hardworking & Diligent (Good)</option>
                          <option value="Attentive & Enthusiastic">Attentive & Enthusiastic (Good)</option>
                          <option value="Cooperative & Helpful">Cooperative & Helpful (Good)</option>
                        </optgroup>
                        <optgroup label="Needs Improvement / Bad">
                          <option value="Passive & Lacks Focus">Passive & Lacks Focus (Needs Work)</option>
                          <option value="Careless & Reluctant">Careless & Reluctant (Needs Work)</option>
                          <option value="Uncooperative in Class">Uncooperative in Class (Needs Work)</option>
                        </optgroup>
                      </select>

                      <input 
                        type="text" 
                        list="attitude-preset-list"
                        className="form-input" 
                        placeholder="Type custom attitude or select preset above…"
                        value={form.attitude}
                        onChange={e => setForm({...form, attitude: e.target.value})}
                      />

                      <datalist id="attitude-preset-list">
                        <option value="Hardworking & Diligent" />
                        <option value="Attentive & Enthusiastic" />
                        <option value="Cooperative & Helpful" />
                        <option value="Passive & Lacks Focus" />
                        <option value="Careless & Reluctant" />
                        <option value="Uncooperative in Class" />
                      </datalist>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Class Teacher's Remark</label>
                    <textarea 
                      className="form-input" 
                      rows="4" 
                      placeholder="Enter specific remarks about the student's performance..."
                      value={form.teacherRemark}
                      onChange={e => setForm({...form, teacherRemark: e.target.value})}
                    ></textarea>
                  </div>

                  {selectedTerm === 'Term 3' && (() => {
                    const nextClassObj = getNextClassForPromotion(selectedClass, classes);
                    const currentClassObj = classes?.find(c => String(c.id) === String(selectedClass));
                    const isNextAlumni = nextClassObj === 'Alumni';

                    return (
                      <div className="form-group">
                        <label className="form-label">End of Year Promotion Recommendation</label>
                        <select 
                          className="form-input"
                          value={form.promotedTo}
                          onChange={e => setForm({...form, promotedTo: e.target.value})}
                        >
                          <option value="">-- Select Recommendation --</option>
                          
                          {/* 1. Immediate Next Class (Regular Promotion) */}
                          {nextClassObj && !isNextAlumni && (
                            <option value={nextClassObj.id}>
                              Promoted to {nextClassObj.name}
                            </option>
                          )}

                          {/* 2. Immediate Next Class (On Probation) */}
                          {nextClassObj && !isNextAlumni && (
                            <option value={`${nextClassObj.id}_probation`}>
                              Promoted to {nextClassObj.name} (On Probation)
                            </option>
                          )}

                          {/* 3. Repeat Current Class */}
                          {currentClassObj && (
                            <option value={currentClassObj.id}>
                              Repeat {currentClassObj.name}
                            </option>
                          )}

                          {/* 4. Graduation */}
                          <option value="Alumni">Graduate (Alumni)</option>
                        </select>
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'block', marginTop: '4px' }}>
                          Target: {nextClassObj && !isNextAlumni ? `Next sequential class is ${nextClassObj.name}` : 'Final class (Graduation)'}.
                        </small>
                      </div>
                    );
                  })()}

                  <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ width: '100%', marginTop: '1rem', padding: '0.85rem' }}>
                    {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                    <span>{isSaving ? 'Saving...' : 'Save Remarks & Attendance'}</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
    </Layout>
  );
};

export default ClassTeacherEntry;
