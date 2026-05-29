import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../store/AuthContext';
import { enqueueSync } from '../../services/syncEngine';

const ClassTeacherEntry = () => {
  const { user } = useAuth();
  
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [academicYear, setAcademicYear] = useState('');
  const [activeLearnerId, setActiveLearnerId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const classes = useLiveQuery(() => user?.schoolId ? db.classes.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);
  const learners = useLiveQuery(() => user?.schoolId ? db.learners.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);
  const reportSummaries = useLiveQuery(() => user?.schoolId ? db.reportSummaries.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);
  const teacherAssignments = useLiveQuery(() => user?.schoolId ? db.teacherAssignments.filter(s => s.schoolId === user.schoolId).toArray() : [], [user?.schoolId]);
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]
  );

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

  // Sync summaries from cloud on load
  useEffect(() => {
    if (!navigator.onLine || !user?.schoolId) return;
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
    if (activeSummary) {
      setForm({
        attendancePresent: activeSummary.attendancePresent ?? '',
        attendanceTotal: activeSummary.attendanceTotal ?? '',
        conduct: activeSummary.conduct || '',
        attitude: activeSummary.attitude || '',
        teacherRemark: activeSummary.teacherRemark || '',
        promotedTo: activeSummary.promotedTo || '',
      });
    } else {
      setForm({
        attendancePresent: '', attendanceTotal: '',
        conduct: '', attitude: '', teacherRemark: '', promotedTo: '',
      });
    }
  }, [activeSummary, activeLearnerId]);

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
      synced: false,
    };
    
    if (activeSummary) { 
      record.id = activeSummary.id; 
      record.supabaseId = activeSummary.supabaseId; 
    }

    try {
      const savedId = await db.reportSummaries.put(record);
      const cloud = {
        school_id: user.schoolId,
        learner_id: resolvedLearnerId,
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
        updated_at: new Date().toISOString(),
      };

      if (activeSummary?.supabaseId) {
        await enqueueSync('update', 'report_summaries', { filter: { id: activeSummary.supabaseId }, data: cloud });
        await db.reportSummaries.update(savedId, { synced: true });
      } else {
        await enqueueSync('insert', 'report_summaries', cloud);
        await db.reportSummaries.update(savedId, { synced: true });
      }
      alert('Remarks saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Error saving. Please try again.');
    } finally { setIsSaving(false); }
  };

  return (
    <Layout title="Class Remarks & Attendance">
      <style>{`
        .learners-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }
        .learner-card { background: #fff; border-radius: 20px; padding: 1.25rem; display: flex; flex-direction: column; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid rgba(226, 232, 240, 0.8); position: relative; overflow: hidden; cursor: pointer; }
        .learner-card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: linear-gradient(90deg, #0d9488, #3b82f6); opacity: 0; transition: opacity 0.3s; }
        .learner-card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.08); border-color: rgba(13, 148, 136, 0.3); }
        .learner-card:hover::before { opacity: 1; }
        .lc-header { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
        .lc-photo { width: 56px; height: 56px; border-radius: 16px; object-fit: cover; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .lc-photo-placeholder { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .lc-name { font-weight: 700; color: #0f172a; font-size: 1.05rem; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lc-reg { font-size: 0.72rem; background: rgba(13, 148, 136, 0.1); color: #0d9488; padding: 0.2rem 0.5rem; border-radius: 6px; font-weight: 700; display: inline-block; letter-spacing: 0.03em; }
        .lc-status { margin-top: auto; font-size: 0.75rem; font-weight: 600; padding: 0.6rem; border-radius: 10px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
        .status-filled { background: rgba(16, 185, 129, 0.1); color: #059669; }
        .status-empty { background: rgba(245, 158, 11, 0.1); color: #d97706; }
        
        .entry-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;overflow-y:auto;}
        .entry-modal{background:#fff;border-radius:20px;width:100%;max-width:580px;box-shadow:0 25px 60px rgba(0,0,0,0.2);animation:modalIn .25s cubic-bezier(.34,1.56,.64,1) both;margin:auto;}
        @keyframes modalIn{from{opacity:0;transform:scale(.94) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .entry-modal-header{padding:1.5rem 1.5rem 1rem;display:flex;justify-content:space-between;align-items:center; border-bottom: 1px solid var(--border); }
        .entry-modal-body{padding:1.5rem;}
        .close-btn { background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #64748b; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .close-btn:hover { background: #e2e8f0; color: #0f172a; transform: rotate(90deg); }
      `}</style>
      <div className="fade-in">
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
                      {l.photo ? (
                        <img src={l.photo} alt={l.fullName} className="lc-photo" />
                      ) : (
                        <div className="lc-photo-placeholder" style={{ background: l.gender === 'Female' ? 'rgba(236,72,153,.1)' : 'rgba(59,130,246,.1)' }}>
                          <i className="fas fa-user" style={{ color: l.gender === 'Female' ? '#ec4899' : '#3b82f6', fontSize: '1.2rem' }}></i>
                        </div>
                      )}
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

                  <div className="form-group">
                    <label className="form-label">Conduct</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g., Excellent, Respectful, etc."
                      value={form.conduct}
                      onChange={e => setForm({...form, conduct: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Attitude</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g., Attentive, Diligent, etc."
                      value={form.attitude}
                      onChange={e => setForm({...form, attitude: e.target.value})}
                    />
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

                  {selectedTerm === 'Term 3' && (
                    <div className="form-group">
                      <label className="form-label">Promote To (End of Year Recommendation)</label>
                      <select 
                        className="form-input"
                        value={form.promotedTo}
                        onChange={e => setForm({...form, promotedTo: e.target.value})}
                      >
                        <option value="">-- No Recommendation / N/A --</option>
                        {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value="Alumni">Graduate (Alumni)</option>
                      </select>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', marginTop: '4px' }}>
                        Select the class this student should be promoted to, or Graduate if they are finishing.
                      </small>
                    </div>
                  )}

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
