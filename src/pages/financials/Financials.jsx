import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { enqueueSync } from '../../services/syncEngine';

const getPreviousTermAndYear = (currentTerm, currentYear) => {
  if (currentTerm === 'Term 2') {
    return { term: 'Term 1', year: currentYear };
  } else if (currentTerm === 'Term 3') {
    return { term: 'Term 2', year: currentYear };
  } else {
    // Term 1 -> rolls back to Term 3 of previous year
    const parts = currentYear.split('/');
    if (parts.length === 2) {
      const prevStart = parseInt(parts[0]) - 1;
      const prevEnd = parseInt(parts[1]) - 1;
      return { term: 'Term 3', year: `${prevStart}/${prevEnd}` };
    }
    return { term: 'Term 3', year: currentYear };
  }
};

const Financials = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const classes = useLiveQuery(() => user?.schoolId ? db.classes.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const learners = useLiveQuery(() => user?.schoolId ? db.learners.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const reportSummaries = useLiveQuery(() => user?.schoolId ? db.reportSummaries.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const payments = useLiveQuery(() => user?.schoolId ? db.payments.where('schoolId').equals(user.schoolId).toArray() : [], [user]);
  const schoolInfo = useLiveQuery(() => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]);

  const [activeTab, setActiveTab] = useState('billing'); // 'billing' or 'history'
  
  // Tab 1: Billing & Arrears States
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [academicYear, setAcademicYear] = useState('');
  const [financialData, setFinancialData] = useState({});
  const [flatRateAmount, setFlatRateAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Tab 2: General Payment History States
  const [timeFilter, setTimeFilter] = useState('all'); // 'all', 'daily', 'weekly'
  const [methodFilter, setMethodFilter] = useState('all'); // 'all', 'Cash', 'Mobile Money', 'Bank Transfer'
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Recording Modal States
  const [selectedLearnerForPayment, setSelectedLearnerForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

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

  // Selected class detail
  const selectedClassObj = useMemo(() => {
    if (!selectedClass || !classes) return null;
    return classes.find(c => c.id === Number(selectedClass));
  }, [classes, selectedClass]);

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

  // Get total payments for each class learner in the current term
  const classLearnersPaymentTotals = useMemo(() => {
    const totals = {};
    if (!classLearners.length || !payments) return totals;

    classLearners.forEach(learner => {
      const learnerPayments = payments.filter(
        p => (p.learnerId === learner.id || p.learnerId === String(learner.id) || (learner.supabaseId && p.learnerId === learner.supabaseId)) &&
             p.academicYear === academicYear &&
             p.term === selectedTerm
      );
      totals[learner.id] = learnerPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    });

    return totals;
  }, [classLearners, payments, academicYear, selectedTerm]);

  const handleInputChange = (learnerId, field, value) => {
    setFinancialData(prev => ({
      ...prev,
      [learnerId]: {
        ...prev[learnerId],
        [field]: value
      }
    }));
  };

  const handleApplyFlatRate = () => {
    if (!flatRateAmount || isNaN(parseFloat(flatRateAmount))) {
      alert('Please enter a valid flat rate amount.');
      return;
    }

    const updatedData = { ...financialData };
    classLearners.forEach(learner => {
      updatedData[learner.id] = {
        ...updatedData[learner.id],
        nextTermBill: flatRateAmount
      };
    });
    setFinancialData(updatedData);
  };

  const handleRollForward = async () => {
    if (!selectedClass || !academicYear || !selectedTerm) {
      alert('Please select Class, Term, and Academic Year first.');
      return;
    }

    const { term: prevTerm, year: prevYear } = getPreviousTermAndYear(selectedTerm, academicYear);
    
    if (!window.confirm(`Are you sure you want to roll forward balances? This will calculate outstanding balances from ${prevYear} ${prevTerm} (Arrears + Bill - Payments) and pre-fill the "Previous Arrears" field for all students in this class.`)) {
      return;
    }

    const resolvedPrevSummaries = await db.reportSummaries
      .where('schoolId').equals(user.schoolId)
      .filter(s => s.academicYear === prevYear && s.term === prevTerm)
      .toArray();

    const resolvedPrevPayments = await db.payments
      .where('schoolId').equals(user.schoolId)
      .filter(p => p.academicYear === prevYear && p.term === prevTerm)
      .toArray();

    const updatedData = { ...financialData };

    classLearners.forEach(learner => {
      const prevSummary = resolvedPrevSummaries.find(
        s => s.learnerId === learner.id || s.learnerId === String(learner.id) || (learner.supabaseId && s.learnerId === learner.supabaseId)
      );

      const prevArrears = parseFloat(prevSummary?.feesOwed) || 0;
      const prevBill = parseFloat(prevSummary?.nextTermBill) || 0;
      
      const learnerPrevPayments = resolvedPrevPayments.filter(
        p => p.learnerId === learner.id || p.learnerId === String(learner.id) || (learner.supabaseId && p.learnerId === learner.supabaseId)
      );
      const totalPaid = learnerPrevPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      const outstandingBalance = (prevArrears + prevBill) - totalPaid;
      
      updatedData[learner.id] = {
        ...updatedData[learner.id],
        feesOwed: outstandingBalance > 0 ? String(outstandingBalance) : '0'
      };
    });

    setFinancialData(updatedData);
    alert('Arrears pre-filled successfully! Please review the values and click "Save All Financials" to persist.');
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

        // Sync to cloud
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
          await enqueueSync('update', 'report_summaries', { filter: { id: summary.supabaseId }, data: cloud }, user.schoolId);
          await db.reportSummaries.update(savedId, { synced: true });
        } else {
          await enqueueSync('insert', 'report_summaries', cloud, user.schoolId);
          await db.reportSummaries.update(savedId, { synced: true });
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

  // Payment Recording Handlers
  const handleOpenPaymentModal = (learner) => {
    setSelectedLearnerForPayment(learner);
    
    // Calculate current outstanding balance to pre-fill payment amount
    const summary = reportSummaries?.find(
      s => (s.learnerId === learner.id || s.learnerId === String(learner.id) || (learner.supabaseId && s.learnerId === learner.supabaseId)) && 
           s.academicYear === academicYear && 
           s.term === selectedTerm
    );
    const prevArrears = parseFloat(summary?.feesOwed) || 0;
    const termBill = parseFloat(summary?.nextTermBill) || 0;
    
    const learnerPayments = payments?.filter(
      p => (p.learnerId === learner.id || p.learnerId === String(learner.id) || (learner.supabaseId && p.learnerId === learner.supabaseId)) &&
           p.academicYear === academicYear &&
           p.term === selectedTerm
    ) || [];
    const totalPaid = learnerPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const outstanding = (prevArrears + termBill) - totalPaid;

    setPaymentAmount(outstanding > 0 ? String(outstanding) : '');
    setPaymentMethod('Cash');
    setPaymentReference('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!selectedLearnerForPayment || !paymentAmount || isNaN(parseFloat(paymentAmount))) {
      alert('Please enter a valid payment amount.');
      return;
    }

    const amountNum = parseFloat(paymentAmount);
    const resolvedLearnerId = selectedLearnerForPayment.supabaseId || selectedLearnerForPayment.id;

    try {
      const newPayment = {
        schoolId: user.schoolId,
        learnerId: resolvedLearnerId,
        academicYear,
        term: selectedTerm,
        amount: amountNum,
        paymentDate: new Date(paymentDate).toISOString(),
        paymentMethod,
        reference: paymentReference,
        synced: false
      };

      const savedId = await db.payments.add(newPayment);

      // Cloud payload
      const cloudPayload = {
        school_id: user.schoolId,
        learner_id: resolvedLearnerId,
        academic_year: academicYear,
        term: selectedTerm,
        amount: amountNum,
        payment_date: new Date(paymentDate).toISOString(),
        payment_method: paymentMethod,
        reference: paymentReference
      };

      await enqueueSync('insert', 'report_payments', cloudPayload, user.schoolId);
      await db.payments.update(savedId, { synced: true });

      alert('Payment recorded successfully!');
      setPaymentAmount('');
      setPaymentReference('');
    } catch (err) {
      console.error(err);
      alert('Failed to save payment: ' + err.message);
    }
  };

  const handleDeletePayment = async (id, supabaseId) => {
    if (!window.confirm('Are you sure you want to delete/void this payment record? This will instantly restore the student outstanding balance.')) return;
    try {
      await db.payments.delete(id);
      
      if (supabaseId) {
        await enqueueSync('delete', 'report_payments', { filter: { id: supabaseId } }, user.schoolId);
      }
      alert('Payment voided successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to void payment: ' + err.message);
    }
  };

  // General Payment Ledger filtering
  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    let list = [...payments];

    // Filter by time
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (timeFilter === 'daily') {
      list = list.filter(p => {
        const pDate = new Date(p.paymentDate);
        pDate.setHours(0, 0, 0, 0);
        return pDate.getTime() === today.getTime();
      });
    } else if (timeFilter === 'weekly') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      oneWeekAgo.setHours(0, 0, 0, 0);
      list = list.filter(p => {
        const pDate = new Date(p.paymentDate);
        return pDate.getTime() >= oneWeekAgo.getTime();
      });
    }

    // Filter by method
    if (methodFilter !== 'all') {
      list = list.filter(p => p.paymentMethod === methodFilter);
    }

    // Filter by student name
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(p => {
        const learner = learners?.find(l => l.id === p.learnerId || String(l.id) === p.learnerId || (l.supabaseId && l.supabaseId === p.learnerId));
        return learner?.fullName.toLowerCase().includes(query);
      });
    }

    // Sort by date descending
    return list.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  }, [payments, timeFilter, methodFilter, searchQuery, learners]);

  const activeLearnerPaymentsForModal = useMemo(() => {
    if (!selectedLearnerForPayment || !payments) return [];
    return payments
      .filter(p => (p.learnerId === selectedLearnerForPayment.id || p.learnerId === String(selectedLearnerForPayment.id) || (selectedLearnerForPayment.supabaseId && p.learnerId === selectedLearnerForPayment.supabaseId)) &&
                   p.academicYear === academicYear &&
                   p.term === selectedTerm)
      .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  }, [selectedLearnerForPayment, payments, academicYear, selectedTerm]);

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
        
        {/* Header Section */}
        <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 4px', fontSize: '1.45rem', fontWeight: 900, color: 'var(--primary)', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
              <span style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '1rem', flexShrink: 0 }}>
                <i className="fas fa-file-invoice-dollar" />
              </span>
              School Financials Management
            </h1>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
              Record learner payments, roll forward term balances, and manage class flat rate bills.
            </p>
          </div>

          {/* Tab Selection */}
          <div style={{ display: 'inline-flex', background: 'var(--background)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <button 
              onClick={() => setActiveTab('billing')}
              style={{
                border: 'none',
                padding: '0.5rem 1.25rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '8px',
                cursor: 'pointer',
                background: activeTab === 'billing' ? 'var(--surface)' : 'transparent',
                color: activeTab === 'billing' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'billing' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <i className="fas fa-table" style={{ marginRight: '6px' }} /> Class Billing & Balances
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              style={{
                border: 'none',
                padding: '0.5rem 1.25rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '8px',
                cursor: 'pointer',
                background: activeTab === 'history' ? 'var(--surface)' : 'transparent',
                color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'history' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <i className="fas fa-receipt" style={{ marginRight: '6px' }} /> School Payment Ledger
            </button>
          </div>
        </div>

        {/* Tab 1: Billing & Balances */}
        {activeTab === 'billing' && (
          <>
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

            {/* Bulk Actions Panel */}
            {selectedClass && (
              <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Set Class Flat Rate:</span>
                    <input 
                      type="number" 
                      placeholder="Amount (GH¢)" 
                      value={flatRateAmount} 
                      onChange={e => setFlatRateAmount(e.target.value)}
                      className="form-input" 
                      style={{ width: '130px', padding: '0.4rem 0.75rem', height: 'auto', minHeight: 'unset', fontSize: '0.85rem' }} 
                    />
                    <button 
                      onClick={handleApplyFlatRate} 
                      className="btn btn-accent" 
                      style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                      Apply to All
                    </button>
                  </div>
                  {selectedClassObj?.category && (
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: 'rgba(16, 185, 129, 0.08)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Category: {selectedClassObj.category}
                    </span>
                  )}
                </div>

                <div>
                  <button 
                    onClick={handleRollForward}
                    className="btn" 
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', padding: '0.45rem 1.25rem', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <i className="fas fa-redo-alt" /> Roll Forward Balances
                  </button>
                </div>
              </div>
            )}

            {/* Data Table */}
            {selectedClass && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)', fontWeight: 800 }}>
                    {selectedClassObj?.name} ({classLearners.length} Learners)
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
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
                    <thead style={{ background: 'var(--background)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <tr>
                        <th style={{ padding: '1rem', textAlign: 'left', width: '50px', fontWeight: 800 }}>#</th>
                        <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 800 }}>Learner Name</th>
                        <th style={{ padding: '1rem', textAlign: 'left', width: '180px', fontWeight: 800 }}>Next Term Bill</th>
                        <th style={{ padding: '1rem', textAlign: 'left', width: '180px', fontWeight: 800 }}>Previous Arrears</th>
                        <th style={{ padding: '1rem', textAlign: 'left', width: '150px', fontWeight: 800 }}>Payments Made</th>
                        <th style={{ padding: '1rem', textAlign: 'left', width: '150px', fontWeight: 800 }}>Balance Due</th>
                        <th style={{ padding: '1rem', textAlign: 'center', width: '150px', fontWeight: 800 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: '0.875rem' }}>
                      {classLearners.length > 0 ? classLearners.map((learner, idx) => {
                        const bill = parseFloat(financialData[learner.id]?.nextTermBill) || 0;
                        const arrears = parseFloat(financialData[learner.id]?.feesOwed) || 0;
                        const paid = classLearnersPaymentTotals[learner.id] || 0;
                        const balanceDue = (arrears + bill) - paid;

                        return (
                          <tr key={learner.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--text-muted)' }}>{idx + 1}</td>
                            <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--primary)' }}>{learner.fullName}</td>
                            <td style={{ padding: '0.5rem 1rem' }}>
                              <input 
                                type="text" 
                                className="form-input" 
                                placeholder="e.g. 450"
                                value={financialData[learner.id]?.nextTermBill || ''}
                                onChange={(e) => handleInputChange(learner.id, 'nextTermBill', e.target.value)}
                                style={{ height: 'auto', minHeight: 'unset', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                              />
                            </td>
                            <td style={{ padding: '0.5rem 1rem' }}>
                              <input 
                                type="text" 
                                className="form-input" 
                                placeholder="e.g. 150"
                                value={financialData[learner.id]?.feesOwed || ''}
                                onChange={(e) => handleInputChange(learner.id, 'feesOwed', e.target.value)}
                                style={{ height: 'auto', minHeight: 'unset', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                              />
                            </td>
                            <td style={{ padding: '1rem', fontWeight: 700, color: '#10b981' }}>
                              GH¢ {paid.toFixed(2)}
                            </td>
                            <td style={{ padding: '1rem', fontWeight: 800, color: balanceDue > 0 ? '#ef4444' : '#10b981' }}>
                              GH¢ {balanceDue.toFixed(2)}
                            </td>
                            <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                              <button 
                                onClick={() => handleOpenPaymentModal(learner)}
                                className="btn" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(59, 130, 246, 0.08)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.15)' }}
                              >
                                <i className="fas fa-coins" /> Record Payment
                              </button>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No learners found in this class.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab 2: School Payment Ledger */}
        {activeTab === 'history' && (
          <div className="fade-in">
            {/* History Filters */}
            <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Period</label>
                <select className="form-input" value={timeFilter} onChange={e => setTimeFilter(e.target.value)}>
                  <option value="all">All Payments</option>
                  <option value="daily">Daily (Today)</option>
                  <option value="weekly">Weekly (Last 7 Days)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Payment Method</label>
                <select className="form-input" value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
                  <option value="all">All Methods</option>
                  <option value="Cash">Cash</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Search Learner</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search student name..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                />
              </div>
            </div>

            {/* General Payment History Ledger Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)', fontWeight: 800 }}>
                  School Payments Log Ledger ({filteredPayments.length} records found)
                </h3>
              </div>

              <div className="table-wrapper">
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead style={{ background: 'var(--background)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <tr>
                      <th style={{ padding: '1rem', textAlign: 'left', width: '50px', fontWeight: 800 }}>#</th>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 800 }}>Student Name</th>
                      <th style={{ padding: '1rem', textAlign: 'left', width: '150px', fontWeight: 800 }}>Class</th>
                      <th style={{ padding: '1rem', textAlign: 'left', width: '130px', fontWeight: 800 }}>Date</th>
                      <th style={{ padding: '1rem', textAlign: 'left', width: '130px', fontWeight: 800 }}>Amount</th>
                      <th style={{ padding: '1rem', textAlign: 'left', width: '150px', fontWeight: 800 }}>Method</th>
                      <th style={{ padding: '1rem', textAlign: 'left', width: '180px', fontWeight: 800 }}>Reference</th>
                      <th style={{ padding: '1rem', textAlign: 'center', width: '100px', fontWeight: 800 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '0.875rem' }}>
                    {filteredPayments.length > 0 ? filteredPayments.map((p, idx) => {
                      const learner = learners?.find(l => l.id === p.learnerId || String(l.id) === p.learnerId || (l.supabaseId && l.supabaseId === p.learnerId));
                      const classObj = classes?.find(c => c.id === learner?.currentClassId);

                      return (
                        <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--primary)' }}>{learner?.fullName || 'Unknown Learner'}</td>
                          <td style={{ padding: '1rem', color: 'var(--text)' }}>{classObj?.name || '—'}</td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                            {new Date(p.paymentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                          <td style={{ padding: '1rem', fontWeight: 700, color: '#10b981' }}>
                            GH¢ {(p.amount || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <span style={{ 
                              display: 'inline-block', 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '6px', 
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: p.paymentMethod === 'Cash' ? '#fef3c7' : p.paymentMethod === 'Mobile Money' ? '#e0f2fe' : '#dcfce7',
                              color: p.paymentMethod === 'Cash' ? '#92400e' : p.paymentMethod === 'Mobile Money' ? '#0369a1' : '#15803d'
                            }}>
                              {p.paymentMethod}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.reference || '—'}</td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                            <button 
                              onClick={() => handleDeletePayment(p.id, p.supabaseId)}
                              className="btn btn-danger" 
                              style={{ padding: '0.45rem 0.65rem', borderRadius: '6px' }}
                            >
                              <i className="fas fa-trash-can" style={{ fontSize: '0.8rem' }} />
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                          No payment records found matching filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Record Payment Modal */}
        {selectedLearnerForPayment && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px', padding: '2rem', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--primary)' }}>Record Learner Payment</h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{selectedLearnerForPayment.fullName} ({selectedLearnerForPayment.regNumber})</p>
                </div>
                <button 
                  onClick={() => setSelectedLearnerForPayment(null)}
                  style={{ border: 'none', background: 'transparent', fontSize: '1.25rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              {/* Outstanding Balance Summary Widget */}
              {(() => {
                const summary = reportSummaries?.find(
                  s => (s.learnerId === selectedLearnerForPayment.id || s.learnerId === String(selectedLearnerForPayment.id) || (selectedLearnerForPayment.supabaseId && s.learnerId === selectedLearnerForPayment.supabaseId)) && 
                       s.academicYear === academicYear && 
                       s.term === selectedTerm
                );
                const prevArrears = parseFloat(summary?.feesOwed) || 0;
                const termBill = parseFloat(summary?.nextTermBill) || 0;
                const totalPaid = activeLearnerPaymentsForModal.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                const outstanding = (prevArrears + termBill) - totalPaid;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: 'var(--background)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Arrears + Tuition</span>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>GH¢ {(prevArrears + termBill).toFixed(2)}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Payments</span>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>GH¢ {totalPaid.toFixed(2)}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Balance Due</span>
                      <div style={{ fontSize: '1rem', fontWeight: 900, color: outstanding > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>GH¢ {outstanding.toFixed(2)}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Payment Entry Form */}
              <form onSubmit={handleAddPayment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Amount to Pay (GH¢)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-input" 
                    value={paymentAmount} 
                    onChange={e => setPaymentAmount(e.target.value)} 
                    placeholder="e.g. 250.00" 
                    required 
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Payment Date</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={paymentDate} 
                    onChange={e => setPaymentDate(e.target.value)} 
                    required 
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Payment Method</label>
                  <select className="form-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="Cash">Cash</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Reference (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={paymentReference} 
                    onChange={e => setPaymentReference(e.target.value)} 
                    placeholder="Tx ID, Slip #, Check #" 
                  />
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => setSelectedLearnerForPayment(null)} 
                    className="btn" 
                    style={{ background: '#f1f5f9', color: '#475569', padding: '0.625rem 1.25rem', fontWeight: 700 }}
                  >
                    Close
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ padding: '0.625rem 1.75rem', fontWeight: 700 }}
                  >
                    Submit Payment
                  </button>
                </div>
              </form>

              {/* Student Payments list in this modal */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Term Payment History Log
                </h4>
                
                {activeLearnerPaymentsForModal.length > 0 ? (
                  <div style={{ overflowX: 'auto', maxHeight: '180px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontWeight: 800 }}>
                          <th style={{ padding: '0.4rem' }}>Date</th>
                          <th style={{ padding: '0.4rem' }}>Amount</th>
                          <th style={{ padding: '0.4rem' }}>Method</th>
                          <th style={{ padding: '0.4rem' }}>Reference</th>
                          <th style={{ padding: '0.4rem', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeLearnerPaymentsForModal.map((p, idx) => (
                          <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-muted)' }}>
                              {new Date(p.paymentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td style={{ padding: '0.5rem 0.4rem', fontWeight: 700, color: '#10b981' }}>
                              GH¢ {(p.amount || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text)' }}>{p.paymentMethod}</td>
                            <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.reference || '—'}</td>
                            <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center' }}>
                              <button 
                                onClick={() => handleDeletePayment(p.id, p.supabaseId)}
                                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                              >
                                <i className="fas fa-trash-can" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0' }}>
                    No payments recorded for this student in the current term.
                  </p>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default Financials;
