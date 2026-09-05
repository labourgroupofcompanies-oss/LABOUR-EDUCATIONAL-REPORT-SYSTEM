import React, { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import LearnerPhoto from '../common/LearnerPhoto';
import { getNextClassForPromotion } from '../../utils/promotionUtils';

const CONDUCT_PRESETS = [
  'Exceptional & Respectful',
  'Satisfactory & Well-Behaved',
  'Obedient & Disciplined',
  'Needs Self-Discipline',
  'Disruptive in Class',
  'Untidy & Irresponsible'
];

const ATTITUDE_PRESETS = [
  'Hardworking & Diligent',
  'Attentive & Enthusiastic',
  'Cooperative & Helpful',
  'Passive & Lacks Focus',
  'Careless & Reluctant',
  'Uncooperative in Class'
];

const TEACHER_REMARK_PRESETS = [
  { label: 'Brilliant / High Honor (80%+)', text: 'An exceptionally brilliant student with superb work ethics, exemplary conduct, and high intellectual standards.' },
  { label: 'Very Good / Hardworking (70%+)', text: 'A reliable and hardworking student who consistently delivers very good academic output and participates actively.' },
  { label: 'Satisfactory / Good Comprehension (55%+)', text: 'A satisfactory performance. Shows good comprehension of subject matter with potential for even higher achievement.' },
  { label: 'Average / Distracted (45%+)', text: 'An average effort shown this term. Can perform much better if distractions are minimized and more time is devoted to studies.' },
  { label: 'Needs Urgent Support (<45%)', text: 'Weak academic performance this term. Requires intensive remedial support, daily supervision, and regular homework completion.' }
];

const HEADTEACHER_REMARK_PRESETS = [
  { label: 'Outstanding Result', text: 'Outstanding academic result! Keep up this commendable standard of excellence.' },
  { label: 'Very Good Performance', text: 'Very good performance. Stay focused, determined, and push for even greater heights next term.' },
  { label: 'Good Result / Encourage', text: 'Good result overall. Revise consistently during vacation to excel in all subjects next term.' },
  { label: 'Fair Result / Need Effort', text: 'Fair performance. Needs to put in stronger personal effort and seek guidance in challenging areas.' },
  { label: 'Poor Result / Sit Up', text: 'Unsatisfactory result. Must sit up, study daily, and receive close parental and teacher supervision.' }
];

const WriteReportModal = ({
  isOpen,
  onClose,
  learner,
  summary,
  classId,
  className,
  academicYear,
  term,
  average,
  rank,
  totalGraded,
  schoolInfo,
  classes = [],
  userSchoolId,
  onSaveSuccess,
  syncCallback
}) => {
  if (!isOpen || !learner) return null;

  const [form, setForm] = useState({
    attendancePresent: '',
    attendanceTotal: '',
    conduct: '',
    attitude: '',
    teacherRemark: '',
    headteacherRemark: '',
    vacationDate: '',
    nextTermBegins: '',
    feesOwed: '',
    nextTermBill: '',
    promotedTo: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('remarks'); // 'remarks' | 'details'

  // Initialize or update form whenever learner or summary changes
  useEffect(() => {
    const nextClassObj = getNextClassForPromotion(classId, classes);
    const defaultPromotion = nextClassObj === 'Alumni' ? 'Alumni' : (nextClassObj?.id ? String(nextClassObj.id) : '');

    if (summary) {
      setForm({
        attendancePresent: summary.attendancePresent ?? '',
        attendanceTotal: summary.attendanceTotal ?? '',
        conduct: summary.conduct && summary.conduct !== '—' ? summary.conduct : 'Satisfactory & Well-Behaved',
        attitude: summary.attitude && summary.attitude !== '—' ? summary.attitude : 'Hardworking & Diligent',
        teacherRemark: summary.teacherRemark && summary.teacherRemark !== '—' ? summary.teacherRemark : '',
        headteacherRemark: summary.headteacherRemark && summary.headteacherRemark !== '—' ? summary.headteacherRemark : '',
        vacationDate: summary.vacationDate || schoolInfo?.vacationDate || '',
        nextTermBegins: summary.nextTermBegins || schoolInfo?.nextTermBegins || '',
        feesOwed: summary.feesOwed || '',
        nextTermBill: summary.nextTermBill || '',
        promotedTo: summary.promotedTo || defaultPromotion
      });
    } else {
      setForm({
        attendancePresent: '',
        attendanceTotal: '',
        conduct: 'Satisfactory & Well-Behaved',
        attitude: 'Hardworking & Diligent',
        teacherRemark: '',
        headteacherRemark: '',
        vacationDate: schoolInfo?.vacationDate || '',
        nextTermBegins: schoolInfo?.nextTermBegins || '',
        feesOwed: '',
        nextTermBill: '',
        promotedTo: defaultPromotion
      });
    }
  }, [learner, summary, classId, classes, schoolInfo]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-generate remarks based on student average
  const handleAutoGenerate = () => {
    const avg = Number(average);
    let t = '';
    let h = '';
    let c = 'Satisfactory & Well-Behaved';
    let a = 'Hardworking & Diligent';

    if (isNaN(avg) || average === null || average === undefined) {
      t = 'A pleasant student who participates steadily in class activities. Encourage more reading during the break.';
      h = 'Satisfactory participation. Encourage continued study and revision at home.';
    } else if (avg >= 80) {
      c = 'Exceptional & Respectful';
      a = 'Hardworking & Diligent';
      t = 'An exceptionally brilliant student with superb work ethics, exemplary conduct, and high intellectual standards.';
      h = 'Outstanding academic result! Keep up this commendable standard of excellence.';
    } else if (avg >= 70) {
      c = 'Exceptional & Respectful';
      a = 'Hardworking & Diligent';
      t = 'A reliable and hardworking student who consistently delivers very good academic output and participates actively.';
      h = 'Very good performance. Stay focused, determined, and push for even greater heights next term.';
    } else if (avg >= 55) {
      c = 'Satisfactory & Well-Behaved';
      a = 'Attentive & Enthusiastic';
      t = 'A satisfactory performance. Shows good comprehension of subject matter with potential for even higher achievement.';
      h = 'Good result overall. Revise consistently during vacation to excel in all subjects next term.';
    } else if (avg >= 45) {
      c = 'Obedient & Disciplined';
      a = 'Passive & Lacks Focus';
      t = 'An average effort shown this term. Can perform much better if distractions are minimized and more time is devoted to studies.';
      h = 'Fair performance. Needs to put in stronger personal effort and seek guidance in challenging areas.';
    } else {
      c = 'Needs Self-Discipline';
      a = 'Careless & Reluctant';
      t = 'Weak academic performance this term. Requires intensive remedial support, daily supervision, and regular homework completion.';
      h = 'Unsatisfactory result. Must sit up, study daily, and receive close parental and teacher supervision.';
    }

    setForm(prev => ({
      ...prev,
      conduct: c,
      attitude: a,
      teacherRemark: t,
      headteacherRemark: h
    }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!learner || !classId || !academicYear || !term) {
      alert('Missing student or class information.');
      return;
    }

    setIsSaving(true);
    try {
      const resolvedLearnerId = learner.supabaseId || learner.id;
      const numAvg = (average !== undefined && average !== null && !isNaN(average)) ? Number(average) : null;
      const numRank = (rank !== undefined && rank !== null && !isNaN(rank)) ? Number(rank) : null;
      const numGraded = (totalGraded !== undefined && totalGraded !== null) ? Number(totalGraded) : 0;

      const record = {
        ...(summary || {}),
        schoolId: userSchoolId || learner.schoolId,
        learnerId: resolvedLearnerId,
        classId: Number(classId),
        academicYear,
        term,
        attendancePresent: form.attendancePresent === '' ? 0 : Number(form.attendancePresent),
        attendanceTotal: form.attendanceTotal === '' ? 0 : Number(form.attendanceTotal),
        conduct: form.conduct || '—',
        attitude: form.attitude || '—',
        teacherRemark: form.teacherRemark || '—',
        headteacherRemark: form.headteacherRemark || '—',
        vacationDate: form.vacationDate || '',
        nextTermBegins: form.nextTermBegins || '',
        feesOwed: form.feesOwed || '',
        nextTermBill: form.nextTermBill || '',
        promotedTo: form.promotedTo || '',
        isReleased: Boolean(summary?.isReleased || summary?.is_released),
        classAverage: numAvg !== null ? numAvg : (summary?.classAverage ?? null),
        classRank: numRank !== null ? numRank : (summary?.classRank ?? null),
        totalGraded: numGraded > 0 ? numGraded : (summary?.totalGraded ?? 0),
        promotionStatus: summary?.promotionStatus || 'pending',
        synced: false
      };

      if (summary?.id) {
        record.id = summary.id;
      }
      if (summary?.supabaseId) {
        record.supabaseId = summary.supabaseId;
      }

      await db.reportSummaries.put(record);

      if (typeof syncCallback === 'function') {
        syncCallback().catch(err => console.warn('[WriteReportModal] Background sync notice:', err));
      }

      if (typeof onSaveSuccess === 'function') {
        onSaveSuccess(record);
      }

      onClose();
    } catch (err) {
      console.error('[WriteReportModal] Save error:', err);
      alert('Failed to save report: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="wrm-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto'
      }}
    >
      <div
        className="wrm-card"
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          overflow: 'hidden',
          animation: 'wrmScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}
      >
        <style>{`
          @keyframes wrmScaleIn {
            from { opacity: 0; transform: scale(0.95) translateY(12px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .wrm-input-label {
            font-size: 0.73rem;
            font-weight: 800;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .wrm-field-input {
            width: 100%;
            padding: 0.65rem 0.85rem;
            font-size: 0.88rem;
            border: 1.5px solid #e2e8f0;
            border-radius: 10px;
            color: #0f172a;
            background: #f8fafc;
            transition: all 0.2s ease;
            box-sizing: border-box;
          }
          .wrm-field-input:focus {
            outline: none;
            border-color: #0d9488;
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
          }
          .wrm-tab-btn {
            background: none;
            border: none;
            padding: 0.65rem 1.25rem;
            font-size: 0.85rem;
            font-weight: 700;
            color: #64748b;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .wrm-tab-btn.active {
            color: #0d9488;
            border-bottom-color: #0d9488;
          }
          .wrm-preset-chip {
            font-size: 0.7rem;
            font-weight: 600;
            padding: 3px 8px;
            background: #f1f5f9;
            color: #334155;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
          }
          .wrm-preset-chip:hover {
            background: #e2e8f0;
            color: #0f172a;
            border-color: #94a3b8;
          }
        `}</style>

        {/* ── Modal Header ── */}
        <div style={{
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: '#334155',
              flexShrink: 0
            }}>
              <LearnerPhoto
                photo={learner.photo || learner.photoUrl || null}
                size="thumb"
                alt={learner.fullName}
                gender={learner.gender}
              />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                {learner.fullName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                <span>{learner.regNumber || 'No Reg #'}</span>
                <span>&bull;</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{className || 'Class'}</span>
                <span>&bull;</span>
                <span>{term} ({academicYear})</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {average !== null && average !== undefined && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.12)',
                padding: '4px 10px',
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}>
                <div style={{ fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Average</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#34d399' }}>{Number(average).toFixed(1)}%</div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#ffffff',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              aria-label="Close"
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* ── Subheader / Quick Actions & Tabs ── */}
        <div style={{
          padding: '0.65rem 1.5rem',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className={`wrm-tab-btn ${activeTab === 'remarks' ? 'active' : ''}`}
              onClick={() => setActiveTab('remarks')}
            >
              <i className="fas fa-comment-dots" /> Remarks &amp; Conduct
            </button>
            <button
              type="button"
              className={`wrm-tab-btn ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              <i className="fas fa-calendar-check" /> Term Dates &amp; Bills
            </button>
          </div>

          <button
            type="button"
            onClick={handleAutoGenerate}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)'
            }}
            title="Auto-generate remarks based on the student's term score"
          >
            <i className="fas fa-wand-magic-sparkles" /> Auto-Generate Remarks
          </button>
        </div>

        {/* ── Form Body ── */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{
            padding: '1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>

            {activeTab === 'remarks' && (
              <>
                {/* Attendance & Character row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '1rem',
                  background: '#f8fafc',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div>
                    <label className="wrm-input-label">Days Present</label>
                    <input
                      type="number"
                      min="0"
                      className="wrm-field-input"
                      placeholder="e.g. 75"
                      value={form.attendancePresent}
                      onChange={e => setForm({ ...form, attendancePresent: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="wrm-input-label">Total Days</label>
                    <input
                      type="number"
                      min="0"
                      className="wrm-field-input"
                      placeholder="e.g. 80"
                      value={form.attendanceTotal}
                      onChange={e => setForm({ ...form, attendanceTotal: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="wrm-input-label">
                      <span>Conduct</span>
                    </label>
                    <select
                      className="wrm-field-input"
                      value={CONDUCT_PRESETS.includes(form.conduct) ? form.conduct : 'custom'}
                      onChange={e => {
                        if (e.target.value !== 'custom') setForm({ ...form, conduct: e.target.value });
                      }}
                      style={{ marginBottom: '4px' }}
                    >
                      <option value="custom">-- Custom Conduct --</option>
                      {CONDUCT_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      type="text"
                      className="wrm-field-input"
                      placeholder="Or type custom conduct..."
                      value={form.conduct}
                      onChange={e => setForm({ ...form, conduct: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="wrm-input-label">
                      <span>Attitude</span>
                    </label>
                    <select
                      className="wrm-field-input"
                      value={ATTITUDE_PRESETS.includes(form.attitude) ? form.attitude : 'custom'}
                      onChange={e => {
                        if (e.target.value !== 'custom') setForm({ ...form, attitude: e.target.value });
                      }}
                      style={{ marginBottom: '4px' }}
                    >
                      <option value="custom">-- Custom Attitude --</option>
                      {ATTITUDE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      type="text"
                      className="wrm-field-input"
                      placeholder="Or type custom attitude..."
                      value={form.attitude}
                      onChange={e => setForm({ ...form, attitude: e.target.value })}
                    />
                  </div>
                </div>

                {/* Class Advisor Remark */}
                <div>
                  <div className="wrm-input-label">
                    <span><i className="fas fa-chalkboard-teacher" style={{ marginRight: '6px', color: '#0d9488' }} /> Class Advisor's Remark</span>
                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Click chip below for quick preset</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                    {TEACHER_REMARK_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="wrm-preset-chip"
                        onClick={() => setForm(f => ({ ...f, teacherRemark: preset.text }))}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    className="wrm-field-input"
                    placeholder="Enter teacher remarks on academic effort, class participation, and areas for improvement..."
                    value={form.teacherRemark}
                    onChange={e => setForm({ ...form, teacherRemark: e.target.value })}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Headteacher Remark */}
                <div>
                  <div className="wrm-input-label">
                    <span><i className="fas fa-user-tie" style={{ marginRight: '6px', color: '#2563eb' }} /> Headteacher's Endorsement Remark</span>
                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>Click chip below for quick preset</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                    {HEADTEACHER_REMARK_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="wrm-preset-chip"
                        onClick={() => setForm(f => ({ ...f, headteacherRemark: preset.text }))}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    className="wrm-field-input"
                    placeholder="Enter headteacher's final assessment remark..."
                    value={form.headteacherRemark}
                    onChange={e => setForm({ ...form, headteacherRemark: e.target.value })}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </>
            )}

            {activeTab === 'details' && (
              <>
                {/* Term Dates & Financials */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1.25rem'
                }}>
                  <div>
                    <label className="wrm-input-label">Vacation Date</label>
                    <input
                      type="date"
                      className="wrm-field-input"
                      value={form.vacationDate}
                      onChange={e => setForm({ ...form, vacationDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="wrm-input-label">Next Term Resumes</label>
                    <input
                      type="date"
                      className="wrm-field-input"
                      value={form.nextTermBegins}
                      onChange={e => setForm({ ...form, nextTermBegins: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="wrm-input-label">Next Term Bill (GH₵)</label>
                    <input
                      type="text"
                      className="wrm-field-input"
                      placeholder="e.g. 450.00"
                      value={form.nextTermBill}
                      onChange={e => setForm({ ...form, nextTermBill: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="wrm-input-label">Previous Arrears / Fees Owed (GH₵)</label>
                    <input
                      type="text"
                      className="wrm-field-input"
                      placeholder="e.g. 0.00"
                      value={form.feesOwed}
                      onChange={e => setForm({ ...form, feesOwed: e.target.value })}
                    />
                  </div>
                </div>

                {/* Term 3 Promotion Recommendation */}
                {term === 'Term 3' && (() => {
                  const nextClassObj = getNextClassForPromotion(classId, classes);
                  const currentClassObj = classes?.find(c => String(c.id) === String(classId));
                  const isNextAlumni = nextClassObj === 'Alumni';

                  return (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '1rem 1.25rem',
                      background: '#f0fdf4',
                      border: '1.5px solid #bbf7d0',
                      borderRadius: '12px'
                    }}>
                      <label className="wrm-input-label" style={{ color: '#166534', marginBottom: '8px' }}>
                        <span><i className="fas fa-graduation-cap" style={{ marginRight: '6px' }} /> End-of-Year Promotion Decision</span>
                      </label>
                      <select
                        className="wrm-field-input"
                        value={form.promotedTo}
                        onChange={e => setForm({ ...form, promotedTo: e.target.value })}
                        style={{ background: '#ffffff', borderColor: '#86efac' }}
                      >
                        <option value="">-- Select Promotion Decision --</option>
                        {nextClassObj && !isNextAlumni && (
                          <option value={nextClassObj.id}>
                            Promoted to {nextClassObj.name}
                          </option>
                        )}
                        {nextClassObj && !isNextAlumni && (
                          <option value={`${nextClassObj.id}_probation`}>
                            Promoted to {nextClassObj.name} (On Probation)
                          </option>
                        )}
                        {currentClassObj && (
                          <option value={currentClassObj.id}>
                            Repeat {currentClassObj.name}
                          </option>
                        )}
                        <option value="Alumni">Graduate (Alumni)</option>
                      </select>
                      <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '6px' }}>
                        This promotion recommendation will be recorded on the student's terminal report card.
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

          </div>

          {/* ── Modal Footer ── */}
          <div style={{
            padding: '1rem 1.5rem',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '0.65rem 1.75rem',
                borderRadius: '10px',
                background: '#0d9488',
                border: 'none',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)'
              }}
            >
              {isSaving ? (
                <><i className="fas fa-spinner fa-spin" /> Saving...</>
              ) : (
                <><i className="fas fa-check" /> Save &amp; Update Card</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WriteReportModal;
