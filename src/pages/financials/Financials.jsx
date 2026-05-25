import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';

const Financials = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const classes = useLiveQuery(() => user?.schoolId ? db.classes.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const learners = useLiveQuery(() => user?.schoolId ? db.learners.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const reportSummaries = useLiveQuery(() => user?.schoolId ? db.reportSummaries.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const schoolInfo = useLiveQuery(() => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]);

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [academicYear, setAcademicYear] = useState('');
  
  // financialData: { learnerId: { nextTermBill: '', feesOwed: '' } }
  const [financialData, setFinancialData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (schoolInfo) {
      if (schoolInfo.currentAcademicYear && !academicYear) setAcademicYear(schoolInfo.currentAcademicYear);
      if (schoolInfo.currentTerm && selectedTerm === 'Term 1') setSelectedTerm(schoolInfo.currentTerm);
    }
  }, [schoolInfo]);

  // Derived learners for the selected class
  const classLearners = useMemo(() => {
    if (!selectedClass || !learners) return [];
    return learners
      .filter(l => l.currentClassId === Number(selectedClass))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [learners, selectedClass]);

  // Pre-fill the financialData state when class, term, or year changes
  useEffect(() => {
    if (!classLearners.length || !reportSummaries) {
      setFinancialData({});
      return;
    }
    const newData = {};
    classLearners.forEach(learner => {
      const summary = reportSummaries.find(
        s => (s.learnerId === learner.id || s.learnerId === String(learner.id) || (learner.supabaseId && s.learnerId === learner.supabaseId)) && 
             s.academicYear === academicYear && 
             s.term === selectedTerm
      );
      newData[learner.id] = {
        nextTermBill: summary?.nextTermBill || '',
        feesOwed: summary?.feesOwed || ''
      };
    });
    setFinancialData(newData);
  }, [classLearners, reportSummaries, academicYear, selectedTerm]);

  const handleInputChange = (learnerId, field, value) => {
    setFinancialData(prev => ({
      ...prev,
      [learnerId]: {
        ...prev[learnerId],
        [field]: value
      }
    }));
  };

  const handleSaveAll = async () => {
    if (!selectedClass || !academicYear || !selectedTerm) {
      alert('Please select a Class, Academic Year, and Term.');
      return;
    }
    
    setIsSaving(true);
    let successCount = 0;
    
    try {
      for (const learner of classLearners) {
        const data = financialData[learner.id];
        if (!data) continue;

        const resolvedLearnerId = learner.supabaseId || learner.id;

        // Find existing summary or create a new one
        let summary = reportSummaries.find(
          s => (s.learnerId === learner.id || s.learnerId === String(learner.id) || (learner.supabaseId && s.learnerId === learner.supabaseId)) && 
               s.academicYear === academicYear && 
               s.term === selectedTerm
        );

        let record = {
          schoolId: user.schoolId,
          learnerId: resolvedLearnerId,
          classId: Number(selectedClass),
          academicYear,
          term: selectedTerm,
          nextTermBill: data.nextTermBill,
          feesOwed: data.feesOwed,
          synced: false
        };

        if (summary) {
          record = { ...summary, ...record }; // Retain attendance, remarks, etc.
        }

        const savedId = await db.reportSummaries.put(record);

        // Sync to cloud if online
        if (navigator.onLine) {
          // IMPORTANT: If you want to insert a NEW record that hasn't had academic data filled yet,
          // we need to supply basic defaults to satisfy Supabase row constraints if any.
          const cloud = {
            school_id: user.schoolId,
            learner_id: resolvedLearnerId,
            class_id: Number(selectedClass),
            academic_year: academicYear,
            term: selectedTerm,
            next_term_bill: data.nextTermBill,
            fees_owed: data.feesOwed,
            updated_at: new Date().toISOString()
          };

          if (summary && summary.supabaseId) {
            const { error } = await supabase.from('report_summaries').update(cloud).eq('id', summary.supabaseId);
            if (!error) await db.reportSummaries.update(savedId, { synced: true });
          } else {
            const { data: newCloudData, error } = await supabase.from('report_summaries').insert([cloud]).select().single();
            if (!error && newCloudData) {
              await db.reportSummaries.update(savedId, { supabaseId: newCloudData.id, synced: true });
            }
          }
        }
        successCount++;
      }
      
      alert(`Successfully saved financial records for ${successCount} learners!`);
    } catch (err) {
      console.error(err);
      alert('An error occurred while saving. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Layout title="Financial Records">
        <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
          <h2>Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Financial Records">
      <div className="fade-in">
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 4px', fontSize: '1.45rem', fontWeight: 900, color: 'var(--primary)', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
            <span style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '1rem', flexShrink: 0 }}>
              <i className="fas fa-file-invoice-dollar" />
            </span>
            Learner Financials
          </h1>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
            Manage Next Term Bills and Arrears for report cards.
          </p>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Class</label>
              <select className="form-input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                <option value="">Select Class</option>
                {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Term</label>
              <select className="form-input" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Academic Year</label>
              <input type="text" className="form-input" placeholder="e.g. 2025/2026" value={academicYear} onChange={e => setAcademicYear(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Data Table */}
        {selectedClass && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)', fontWeight: 800 }}>
                {classes?.find(c => c.id === Number(selectedClass))?.name} ({classLearners.length} Learners)
              </h3>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveAll}
                disabled={isSaving || classLearners.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, padding: '0.7rem 1.5rem', fontFamily: "'Inter', sans-serif" }}
              >
                {isSaving ? <><i className="fas fa-spinner fa-spin" /> Saving...</> : <><i className="fas fa-save" /> Save All Financials</>}
              </button>
            </div>
            
            <div className="table-wrapper">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead style={{ background: 'var(--background)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <tr>
                    <th style={{ padding: '1rem', textAlign: 'left', width: '50px', fontWeight: 800 }}>#</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 800 }}>Learner Name</th>
                    <th style={{ padding: '1rem', textAlign: 'left', width: '250px', fontWeight: 800 }}>Next Term Bill</th>
                    <th style={{ padding: '1rem', textAlign: 'left', width: '250px', fontWeight: 800 }}>Previous Arrears</th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: '0.875rem' }}>
                  {classLearners.length > 0 ? classLearners.map((learner, idx) => (
                    <tr key={learner.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--primary)' }}>{learner.fullName}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="e.g. GHC 450"
                          value={financialData[learner.id]?.nextTermBill || ''}
                          onChange={(e) => handleInputChange(learner.id, 'nextTermBill', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="e.g. GHC 150"
                          value={financialData[learner.id]?.feesOwed || ''}
                          onChange={(e) => handleInputChange(learner.id, 'feesOwed', e.target.value)}
                        />
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No learners found in this class.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Financials;
