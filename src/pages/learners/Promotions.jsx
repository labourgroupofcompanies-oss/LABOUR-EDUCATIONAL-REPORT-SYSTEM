import React, { useState, useMemo, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { enqueueSync } from '../../services/syncEngine';
import { getNextClassForPromotion, formatPromotionDecision } from '../../utils/promotionUtils';

const isUUID = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

const Promotions = () => {
  const { user } = useAuth();
  
  // State
  const [selectedClass, setSelectedClass] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Term 3'); // Usually promotions happen in Term 3
  const [isExecuting, setIsExecuting] = useState(false);

  // Live DB Queries
  const classes = useLiveQuery(() => user?.schoolId ? db.classes.filter(c => String(c.schoolId) === String(user.schoolId) || String(c.school_id || '') === String(user.schoolId)).toArray() : [], [user]);
  const schoolInfo = useLiveQuery(() => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]);
  const learners = useLiveQuery(() => user?.schoolId ? db.learners.filter(l => String(l.schoolId) === String(user.schoolId) || String(l.school_id || '') === String(user.schoolId)).toArray() : [], [user]);
  const reportSummaries = useLiveQuery(() => user?.schoolId ? db.reportSummaries.filter(r => String(r.schoolId) === String(user.schoolId) || String(r.school_id || '') === String(user.schoolId)).toArray() : [], [user]);

  // Set default academic year from school info
  useEffect(() => {
    if (schoolInfo?.currentAcademicYear) {
      setAcademicYear(schoolInfo.currentAcademicYear);
    }
  }, [schoolInfo]);

  // Filter summaries for selected class, year, term
  const classSummaries = useMemo(() => {
    if (!selectedClass || !academicYear || !selectedTerm || !reportSummaries) return [];
    return reportSummaries.filter(s => 
      String(s.classId) === String(selectedClass) && 
      s.academicYear === academicYear && 
      s.term === selectedTerm
    );
  }, [selectedClass, academicYear, selectedTerm, reportSummaries]);

  const getClass = id => {
    if (!id) return 'Not Selected';
    if (id === 'Alumni') return 'Graduate (Alumni)';
    const str = String(id);
    const isProbation = str.endsWith('_probation');
    const cleanId = Number(str.replace('_probation', ''));
    const className = classes?.find(c => Number(c.id) === cleanId)?.name || 'Unknown Class';
    return isProbation ? `${className} (On Probation)` : className;
  };
  const getLearnerName = id => {
    const l = learners?.find(l => l.id === Number(id) || l.supabaseId === id || String(l.id) === String(id));
    return l ? l.fullName : 'Unknown Learner';
  };
  const getLearnerReg = id => {
    const l = learners?.find(l => l.id === Number(id) || l.supabaseId === id || String(l.id) === String(id));
    return l ? l.regNumber : 'N/A';
  };

  const pendingCount = classSummaries.filter(s => s.promotionStatus !== 'approved').length;
  const approvedCount = classSummaries.filter(s => s.promotionStatus === 'approved').length;

  const handleExecutePromotions = async () => {
    if (!selectedClass || !academicYear || !selectedTerm) {
      alert("Please select Class, Academic Year, and Term to execute promotions.");
      return;
    }

    const pendingCount = classSummaries.filter(s => s.promotionStatus !== 'approved').length;
    if (pendingCount === 0) {
      alert("All learners in this class have already been promoted.");
      return;
    }

    if (!await window.confirm(`Are you sure you want to execute ${pendingCount} promotions for this class? This will officially move students to their new classes.`)) {
      return;
    }

    setIsExecuting(true);
    try {
      const summariesToUpdate = classSummaries.filter(s => s.promotionStatus !== 'approved');
      
      for (const summary of summariesToUpdate) {
        const l = learners.find(l => l.id === summary.learnerId || l.supabaseId === summary.learnerId || String(l.id) === String(summary.learnerId));
        
        if (l) {
          if (summary.promotedTo === 'Alumni') {
            await db.learners.update(l.id, { status: 'Alumni', synced: false });
            if (isUUID(l.supabaseId)) {
              await enqueueSync('update', 'report_learners', {
                filter: { id: l.supabaseId },
                data: { status: 'Alumni' }
              }, user.schoolId);
            } else if (l.regNumber) {
              await enqueueSync('update', 'report_learners', {
                filter: { reg_number: l.regNumber, school_id: user.schoolId },
                data: { status: 'Alumni' }
              }, user.schoolId);
            }
          } else {
            const rawVal = String(summary.promotedTo || '');
            const cleanVal = rawVal.replace('_probation', '');
            const newClassId = Number(cleanVal);
            if (!isNaN(newClassId)) {
              await db.learners.update(l.id, { currentClassId: newClassId, synced: false });
              if (isUUID(l.supabaseId)) {
                await enqueueSync('update', 'report_learners', {
                  filter: { id: l.supabaseId },
                  data: { class_id: newClassId }
                }, user.schoolId);
              } else if (l.regNumber) {
                await enqueueSync('update', 'report_learners', {
                  filter: { reg_number: l.regNumber, school_id: user.schoolId },
                  data: { class_id: newClassId }
                }, user.schoolId);
              }
            }
          }
        }
        
        // Mark summary as approved locally and queue outbox sync
        if (summary.id) {
          await db.reportSummaries.update(summary.id, { promotionStatus: 'approved' });
          if (isUUID(summary.supabaseId)) {
            await enqueueSync('update', 'report_summaries', {
              filter: { id: summary.supabaseId },
              data: { promotion_status: 'approved' }
            }, user.schoolId);
          }
        }
      }

      // If online, also attempt the server RPC trigger
      if (navigator.onLine) {
        try {
          await supabase.rpc('execute_class_promotions', {
            p_school_id: user.schoolId,
            p_class_id: Number(selectedClass),
            p_academic_year: academicYear,
            p_term: selectedTerm
          });
        } catch (rpcErr) {
          console.warn('[Promotions] Server RPC warning (queued via outbox instead):', rpcErr);
        }
      }

      alert("Promotions executed successfully!");

    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while executing promotions: " + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUpdatePromotedTo = async (summary, newValue) => {
    try {
      // Update local cache to reflect immediately
      if (summary.id) {
        await db.reportSummaries.update(summary.id, { promotedTo: newValue });
      }

      // Queue outbox sync for cloud update (works online & offline) only if valid UUID exists
      if (isUUID(summary.supabaseId)) {
        await enqueueSync('update', 'report_summaries', {
          filter: { id: summary.supabaseId },
          data: { promoted_to: newValue }
        }, user.schoolId);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update recommendation: " + err.message);
    }
  };

  return (
    <Layout title="Academic Year Promotions">
      <style>{`
        .promo-card { background: #fff; border-radius: 16px; padding: 1.5rem; box-shadow: var(--shadow-sm); border: 1px solid var(--border); margin-bottom: 1.5rem; }
        .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
        .promo-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .promo-table th { background: #f8fafc; padding: 1rem; text-align: left; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem; border-bottom: 1px solid var(--border); }
        .promo-table td { padding: 1rem; border-bottom: 1px solid var(--border); color: var(--primary); }
        .promo-table tbody tr:last-child td { border-bottom: none; }
        .promo-table tbody tr:hover { background: #f8fafc; }
        
        .status-badge { padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem; }
        .status-pending { background: #FFFBEB; color: #F59E0B; border: 1px solid #FDE68A; }
        .status-approved { background: #ECFDF5; color: #10B981; border: 1px solid #A7F3D0; }
        
        .promo-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .btn-execute { background: #09090b; color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(9, 9, 11, 0.25); }
        .btn-execute:hover:not(:disabled) { transform: translateY(-1px); background: #18181b; }
        .btn-execute:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
      `}</style>

      <div className="fade-in">
        <div className="promo-card">
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#09090b' }}>Filter Criteria</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#71717a' }}>ACADEMIC YEAR</label>
              <input type="text" className="form-input" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="e.g. 2025/2026" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#71717a' }}>TERM (Usually Term 3)</label>
              <select className="form-input" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#71717a' }}>SOURCE CLASS</label>
              <select className="form-input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                <option value="">-- Select Class --</option>
                {classes?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {selectedClass && (
          <div className="promo-card">
            <div className="promo-header">
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', color: '#09090b', fontSize: '1.2rem' }}>
                  Promotions for {getClass(selectedClass)}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#71717a' }}>
                  Found <strong>{classSummaries.length}</strong> recommendations ({pendingCount} pending, {approvedCount} approved)
                </div>
              </div>
              
              <button 
                className="btn-execute" 
                onClick={handleExecutePromotions}
                disabled={isExecuting || pendingCount === 0}
              >
                {isExecuting ? (
                  <><i className="fas fa-spinner fa-spin"></i> Executing...</>
                ) : (
                  <><i className="fas fa-check-double"></i> Approve &amp; Execute {pendingCount} Promotions</>
                )}
              </button>
            </div>

            <div className="table-wrap">
              <table className="promo-table">
                <thead>
                  <tr>
                    <th>Learner Name</th>
                    <th>Reg Number</th>
                    <th>Teacher's Recommendation</th>
                    <th>Override / Repeat</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {classSummaries.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#71717a' }}>
                        <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block', opacity: 0.5 }}></i>
                        No teacher recommendations found for this class in {selectedTerm} {academicYear}.<br/>
                        <span style={{ fontSize: '0.75rem', marginTop: '0.5rem', display: 'inline-block' }}>Teachers must fill out the 'Promoted To' field on the report cards.</span>
                      </td>
                    </tr>
                  ) : (
                    classSummaries.map((summary, idx) => (
                      <tr key={summary.id || idx}>
                        <td style={{ fontWeight: 600, color: '#18181b' }}>{getLearnerName(summary.learnerId)}</td>
                        <td>{getLearnerReg(summary.learnerId)}</td>
                        <td>
                          {summary.promotedTo === 'Alumni' ? (
                            <span style={{ color: '#2563eb', fontWeight: 700 }}><i className="fas fa-graduation-cap"></i> Graduate (Alumni)</span>
                          ) : (
                            <span style={{ fontWeight: 600 }}>
                              {String(summary.promotedTo) === String(selectedClass) && <span style={{ color: '#F59E0B', marginRight: '4px' }}><i className="fas fa-redo"></i> Repeat:</span>}
                              {String(summary.promotedTo).endsWith('_probation') && <span style={{ color: '#F59E0B', marginRight: '4px' }}><i className="fas fa-exclamation-triangle"></i> Probation:</span>}
                              {getClass(summary.promotedTo)}
                            </span>
                          )}
                        </td>
                        <td>
                          {summary.promotionStatus === 'approved' ? (
                            <span style={{ color: '#71717a', fontSize: '0.75rem' }}>Locked (Executed)</span>
                          ) : (() => {
                              const nextClassObj = getNextClassForPromotion(selectedClass, classes);
                              const currentClassObj = classes?.find(c => String(c.id) === String(selectedClass));
                              const otherClasses = classes?.filter(c => String(c.id) !== String(selectedClass) && (!nextClassObj || String(c.id) !== String(nextClassObj.id)));

                              return (
                                <select 
                                  className="form-input" 
                                  style={{ padding: '0.3rem', fontSize: '0.75rem', height: 'auto', minWidth: '160px', borderColor: String(summary.promotedTo).endsWith('_probation') ? '#F59E0B' : String(summary.promotedTo) === String(selectedClass) ? '#F59E0B' : '#E4E4E7' }}
                                  value={summary.promotedTo || ''}
                                  onChange={(e) => handleUpdatePromotedTo(summary, e.target.value)}
                                >
                                  {nextClassObj && nextClassObj !== 'Alumni' && (
                                    <optgroup label="Immediate Next Class">
                                      <option value={nextClassObj.id}>Promote to {nextClassObj.name}</option>
                                      <option value={`${nextClassObj.id}_probation`}>Promote to {nextClassObj.name} (On Probation)</option>
                                    </optgroup>
                                  )}

                                  {currentClassObj && (
                                    <optgroup label="Repeat / Retain">
                                      <option value={currentClassObj.id}>Repeat {currentClassObj.name}</option>
                                    </optgroup>
                                  )}

                                  <optgroup label="Graduation">
                                    <option value="Alumni">Graduate (Alumni)</option>
                                  </optgroup>

                                  {otherClasses && otherClasses.length > 0 && (
                                    <optgroup label="Other Classes (Manual Override)">
                                      {otherClasses.map(c => (
                                        <option key={`other_${c.id}`} value={c.id}>Transfer to {c.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              );
                            })()}
                        </td>
                        <td>
                          {summary.promotionStatus === 'approved' ? (
                            <span className="status-badge status-approved">
                              <i className="fas fa-check-circle"></i> Approved
                            </span>
                          ) : (
                            <span className="status-badge status-pending">
                              <i className="fas fa-clock"></i> Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#71717a', display: 'flex', gap: '0.5rem', background: '#FAFAFA', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
              <i className="fas fa-info-circle" style={{ color: '#2563eb', marginTop: '2px' }}></i>
              <div>
                <strong>How it works:</strong> Executing promotions will move students to their newly assigned classes and mark the summary as approved. Graduated students will be marked as "Alumni" and will no longer appear in active class rosters.
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Promotions;
