import React, { useState, useMemo, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';

const Promotions = () => {
  const { user } = useAuth();
  
  // State
  const [selectedClass, setSelectedClass] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Term 3'); // Usually promotions happen in Term 3
  const [isExecuting, setIsExecuting] = useState(false);

  // Live Queries
  const classes = useLiveQuery(() => user?.schoolId ? db.classes.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);
  const learners = useLiveQuery(() => user?.schoolId ? db.learners.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);
  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]
  );
  
  // We need to fetch report summaries from Supabase directly to ensure we have the latest
  // Or we can use local db.reportSummaries and sync. Let's use local first, but we might want to fetch cloud.
  const localSummaries = useLiveQuery(() => user?.schoolId ? db.reportSummaries.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);

  // Set default Academic Year from school settings
  useEffect(() => {
    if (schoolInfo?.currentAcademicYear && !academicYear) {
      setAcademicYear(schoolInfo.currentAcademicYear);
    }
  }, [schoolInfo, academicYear]);

  // Derived Data
  const classSummaries = useMemo(() => {
    if (!localSummaries || !selectedClass || !academicYear || !selectedTerm) return [];
    
    return localSummaries.filter(s => 
      Number(s.classId) === Number(selectedClass) &&
      s.academicYear === academicYear &&
      s.term === selectedTerm &&
      s.promotedTo // Only include those where teacher has made a recommendation
    );
  }, [localSummaries, selectedClass, academicYear, selectedTerm]);

  const getClass = id => classes?.find(c => c.id === Number(id))?.name || 'Unknown Class';
  const getLearnerName = id => {
    const l = learners?.find(l => l.id === id || l.supabaseId === id || String(l.id) === String(id));
    return l?.fullName || 'Unknown Learner';
  };
  const getLearnerReg = id => {
    const l = learners?.find(l => l.id === id || l.supabaseId === id || String(l.id) === String(id));
    return l?.regNumber || 'N/A';
  };

  const pendingCount = classSummaries.filter(s => s.promotionStatus !== 'approved').length;
  const approvedCount = classSummaries.filter(s => s.promotionStatus === 'approved').length;

  const handleExecutePromotions = async () => {
    if (!selectedClass || !academicYear || !selectedTerm) {
      alert("Please select a Class, Academic Year, and Term.");
      return;
    }

    if (pendingCount === 0) {
      alert("No pending promotions to execute for this class.");
      return;
    }

    if (!await window.confirm(`Are you sure you want to execute ${pendingCount} promotions for this class? This will officially move students to their new classes.`)) {
      return;
    }

    setIsExecuting(true);
    try {
      if (!navigator.onLine) {
        alert("You must be online to execute promotions.");
        setIsExecuting(false);
        return;
      }

      // Call Supabase RPC
      const { error } = await supabase.rpc('execute_class_promotions', {
        p_school_id: user.schoolId,
        p_class_id: Number(selectedClass),
        p_academic_year: academicYear,
        p_term: selectedTerm
      });

      if (error) {
        console.error("Supabase RPC Error:", error);
        alert(`Failed to execute promotions: ${error.message}`);
      } else {
        // Successfully executed on server.
        // Now sync the local database so UI updates immediately
        
        const summariesToUpdate = classSummaries.filter(s => s.promotionStatus !== 'approved');
        
        for (const summary of summariesToUpdate) {
          const l = learners.find(l => l.id === summary.learnerId || l.supabaseId === summary.learnerId || String(l.id) === String(summary.learnerId));
          
          if (l) {
            if (summary.promotedTo === 'Alumni') {
              await db.learners.update(l.id, { status: 'Alumni' });
            } else {
              const newClassId = Number(summary.promotedTo);
              if (!isNaN(newClassId)) {
                await db.learners.update(l.id, { currentClassId: newClassId });
              }
            }
          }
          
          // Mark summary as approved locally
          if (summary.id) {
            await db.reportSummaries.update(summary.id, { promotionStatus: 'approved' });
          }
        }

        alert("Promotions executed successfully!");
      }

    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while executing promotions.");
    } finally {
      setIsExecuting(false);
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
        .status-pending { background: rgba(245, 158, 11, 0.1); color: #d97706; }
        .status-approved { background: rgba(16, 185, 129, 0.1); color: #059669; }
        
        .promo-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .btn-execute { background: linear-gradient(135deg, #0d9488, #0f766e); color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(13, 148, 136, 0.2); }
        .btn-execute:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(13, 148, 136, 0.3); }
        .btn-execute:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
      `}</style>

      <div className="fade-in">
        <div className="promo-card">
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: 'var(--primary)' }}>Filter Criteria</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ACADEMIC YEAR</label>
              <input type="text" className="form-input" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="e.g. 2025/2026" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TERM (Usually Term 3)</label>
              <select className="form-input" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>SOURCE CLASS</label>
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
                <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--primary)', fontSize: '1.2rem' }}>
                  Promotions for {getClass(selectedClass)}
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
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
                  <><i className="fas fa-check-double"></i> Approve & Execute {pendingCount} Promotions</>
                )}
              </button>
            </div>

            <div className="table-wrap">
              <table className="promo-table">
                <thead>
                  <tr>
                    <th>Learner Name</th>
                    <th>Reg Number</th>
                    <th>Teacher's Recommendation (Promote To)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {classSummaries.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                        <i className="fas fa-inbox" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block', opacity: 0.5 }}></i>
                        No teacher recommendations found for this class in {selectedTerm} {academicYear}.<br/>
                        <span style={{ fontSize: '0.75rem', marginTop: '0.5rem', display: 'inline-block' }}>Teachers must fill out the 'Promoted To' field on the report cards.</span>
                      </td>
                    </tr>
                  ) : (
                    classSummaries.map((summary, idx) => (
                      <tr key={summary.id || idx}>
                        <td style={{ fontWeight: 600 }}>{getLearnerName(summary.learnerId)}</td>
                        <td>{getLearnerReg(summary.learnerId)}</td>
                        <td>
                          {summary.promotedTo === 'Alumni' ? (
                            <span style={{ color: '#0d9488', fontWeight: 700 }}><i className="fas fa-graduation-cap"></i> Graduate (Alumni)</span>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{getClass(summary.promotedTo)}</span>
                          )}
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
            
            <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px' }}>
              <i className="fas fa-info-circle" style={{ color: '#0d9488', marginTop: '2px' }}></i>
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
