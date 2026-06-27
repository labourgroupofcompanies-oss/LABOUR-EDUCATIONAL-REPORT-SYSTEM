import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../lib/db';
import authService from '../../services/authService';
import LearnerPhoto from '../../components/common/LearnerPhoto';

const ParentFeesView = () => {
  const { learnerId } = useParams();
  const navigate = useNavigate();
  const parent = authService.getCurrentParent();

  // Atomic multi-table Dexie query to prevent reactive cascading waterfalls
  const viewData = useLiveQuery(async () => {
    if (!learnerId) return null;
    
    // 1. Resolve active learner robustly
    let learner = null;
    const numId = Number(learnerId);
    if (!isNaN(numId)) {
      learner = await db.learners.get(numId);
    }
    if (!learner) {
      learner = await db.learners.where('supabaseId').equals(learnerId).first();
    }
    if (!learner) {
      learner = await db.learners.where('learnerId').equals(learnerId).first();
    }
    if (!learner) return { notFound: true };

    // 2. Load school metadata, classes, and report summaries in parallel
    const schoolId = learner.schoolId;
    const learnerKeys = [learner.id, String(learner.id), learner.supabaseId].filter(Boolean);
    const [school, allClasses, summariesList, paymentsList] = await Promise.all([
      schoolId ? db.schools.get(schoolId) : null,
      schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [],
      schoolId ? db.reportSummaries.where('schoolId').equals(schoolId).toArray() : [],
      db.payments.where('learnerId').anyOf(learnerKeys).toArray()
    ]);

    return {
      activeLearner: learner,
      schoolInfo: school,
      classes: allClasses,
      reportSummaries: summariesList,
      payments: paymentsList
    };
  }, [learnerId]);

  const activeLearner = viewData?.activeLearner;
  const schoolInfo = viewData?.schoolInfo;
  const classes = viewData?.classes;
  const reportSummaries = viewData?.reportSummaries;
  const payments = viewData?.payments || [];

  const currentClass = useMemo(() => {
    if (!activeLearner || !classes) return null;
    return classes.find(c => c.id === activeLearner.currentClassId);
  }, [activeLearner, classes]);
  
  const activeSummary = useMemo(() => {
    if (!activeLearner || !reportSummaries || !schoolInfo) return null;
    const year = schoolInfo.currentAcademicYear || '';
    const term = schoolInfo.currentTerm || 'Term 1';
    
    return reportSummaries.find(s =>
      (s.learnerId === activeLearner.id || s.learnerId === String(activeLearner.id) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) && 
      s.academicYear === year && 
      s.term === term
    );
  }, [activeLearner, reportSummaries, schoolInfo]);

  // Filter payments for the active sibling in the current academic year and term
  const activeTermPayments = useMemo(() => {
    if (!activeLearner || !payments || !schoolInfo) return [];
    const year = schoolInfo.currentAcademicYear || '';
    const term = schoolInfo.currentTerm || 'Term 1';
    
    return payments.filter(p => 
      p.academicYear === year && 
      p.term === term
    ).sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  }, [activeLearner, payments, schoolInfo]);

  // Ledger totals calculation
  const financials = useMemo(() => {
    const parseValue = (val) => {
      if (val === undefined || val === null || val === '') return NaN;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? NaN : parsed;
    };

    const rawArrears = parseValue(activeSummary?.feesOwed);
    const rawNextBill = parseValue(activeSummary?.nextTermBill);
    
    const arrears = isNaN(rawArrears) ? null : rawArrears;
    const nextBill = isNaN(rawNextBill) ? null : rawNextBill;
    
    const arrearsVal = arrears === null ? 0 : arrears;
    const nextBillVal = nextBill === null ? 0 : nextBill;
    
    const totalPaymentsVal = activeTermPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const currentTermRemaining = arrearsVal - totalPaymentsVal;
    const nextTermAmountToPay = currentTermRemaining + nextBillVal;

    return {
      arrears,
      nextBill,
      totalPaymentsVal,
      currentTermRemaining,
      nextTermAmountToPay
    };
  }, [activeSummary, activeTermPayments]);

  if (!viewData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', color: '#64748b' }}>
        <div>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '1rem', color: '#3b82f6' }}></i>
          <p>Loading ledger details...</p>
        </div>
      </div>
    );
  }

  if (viewData.notFound) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h2>Learner Not Found</h2>
        <button className="btn" onClick={() => navigate('/parent/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="fees-view-container">
      <style>{`
        .fees-view-container {
          min-height: 100vh;
          background: #f8fafc;
          font-family: 'Outfit', 'Inter', system-ui, sans-serif;
          padding: 2rem 1rem 4rem;
          color: #0f172a;
        }

        .fees-page-wrap {
          max-width: 900px;
          margin: 0 auto;
        }

        .btn-back-dash {
          background: transparent;
          border: none;
          color: #475569;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: color 0.2s;
          margin-bottom: 1.5rem;
        }

        .btn-back-dash:hover {
          color: #0f172a;
        }

        /* ── Header details card ── */
        .fees-student-header {
          background: #fff;
          border-radius: 20px;
          padding: 1.5rem;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.02);
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          margin-bottom: 1.75rem;
        }

        .f-avatar {
          width: 54px;
          height: 54px;
          border-radius: 12px;
          object-fit: cover;
          border: 1.5px solid #cbd5e1;
        }

        .f-avatar-ph {
          width: 54px;
          height: 54px;
          border-radius: 12px;
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }

        .f-student-name {
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0 0 0.15rem;
          color: #0f172a;
        }

        .f-student-meta {
          font-size: 0.78rem;
          color: #64748b;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* ── Ledger breakdown card ── */
        .ledger-card {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: #fff;
          border-radius: 24px;
          padding: 2.25rem;
          box-shadow: 0 15px 35px rgba(15, 23, 42, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 2rem;
          position: relative;
          overflow: hidden;
        }

        .ledger-card::after {
          content: '';
          position: absolute;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%);
          top: -30px;
          right: -30px;
          pointer-events: none;
        }

        .ledger-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #38bdf8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ledger-row {
          display: flex;
          justify-content: space-between;
          padding: 0.9rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.95rem;
        }

        .ledger-row.total {
          border-bottom: none;
          padding-top: 1.5rem;
          margin-top: 0.5rem;
          border-top: 2px solid rgba(255, 255, 255, 0.15);
        }

        .ledger-row-lbl {
          color: #94a3b8;
          font-weight: 600;
        }

        .ledger-row.total .ledger-row-lbl {
          color: #fff;
          font-size: 1.15rem;
          font-weight: 800;
        }

        .ledger-row-val {
          font-weight: 700;
          font-size: 1.05rem;
          color: #f8fafc;
        }

        .ledger-row.total .ledger-row-val {
          color: #38bdf8;
          font-size: 1.5rem;
          font-weight: 800;
        }

        /* ── Instructions details ── */
        .info-card {
          background: #fff;
          border-radius: 20px;
          padding: 1.75rem;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
          border: 1px solid #e2e8f0;
          margin-bottom: 1.5rem;
        }

        .info-card-title {
          font-size: 0.95rem;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 1rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .info-card-title i {
          color: #3b82f6;
        }

        @media (max-width: 480px) {
          .fees-student-header {
            flex-direction: column;
            text-align: center;
            padding: 1.25rem;
          }
          .f-student-meta {
            justify-content: center;
          }
          .ledger-card {
            padding: 1.5rem;
          }
          .ledger-row.total .ledger-row-val {
            font-size: 1.25rem;
          }
        }
      `}</style>

      <div className="fees-page-wrap">
        <button className="btn-back-dash" onClick={() => navigate('/parent/dashboard')}>
          <i className="fas fa-arrow-left"></i> Sibling Dashboard
        </button>

        {/* Student Profile Card */}
        <div className="fees-student-header">
          <LearnerPhoto
            photo={activeLearner.photo || activeLearner.photoUrl || null}
            alt={activeLearner.fullName}
            className="f-avatar"
          />
          
          <div>
            <h2 className="f-student-name">{activeLearner.fullName}</h2>
            <div className="f-student-meta">
              <span>{activeLearner.regNumber}</span>
              <span>•</span>
              <span>{currentClass?.name || 'Grade'}</span>
              <span>•</span>
              <span>{schoolInfo?.currentAcademicYear || '2025/2026'} Academic Ledger</span>
            </div>
          </div>
        </div>

        {/* Statement of Account Ledger */}
        <div className="ledger-card">
          <div className="ledger-title">
            <i className="fas fa-file-invoice-dollar"></i> Statement of Account
          </div>
          
          <div className="ledger-row">
            <span className="ledger-row-lbl">Previous Outstanding Arrears (Balance Forward)</span>
            <span className="ledger-row-val">{financials.arrears !== null ? `GH¢ ${financials.arrears.toFixed(2)}` : '-'}</span>
          </div>

          <div className="ledger-row">
            <span className="ledger-row-lbl">Total Payments (This Term)</span>
            <span className="ledger-row-val" style={{ color: '#34d399' }}>GH¢ {financials.totalPaymentsVal.toFixed(2)}</span>
          </div>

          <div className="ledger-row">
            <span className="ledger-row-lbl">Current Term Arrears Balance</span>
            <span className="ledger-row-val">
              {financials.currentTermRemaining < 0 
                ? `Surplus: GH¢ ${Math.abs(financials.currentTermRemaining).toFixed(2)}` 
                : `GH¢ ${financials.currentTermRemaining.toFixed(2)}`}
            </span>
          </div>

          <div className="ledger-row">
            <span className="ledger-row-lbl">Next Term Bill (Academic Tuition &amp; Levies)</span>
            <span className="ledger-row-val">{financials.nextBill !== null ? `GH¢ ${financials.nextBill.toFixed(2)}` : '-'}</span>
          </div>

          <div className="ledger-row total">
            <span className="ledger-row-lbl">Next Term Total Amount to Pay</span>
            <span className="ledger-row-val">GH¢ {financials.nextTermAmountToPay !== null && !isNaN(financials.nextTermAmountToPay) ? financials.nextTermAmountToPay.toFixed(2) : '0.00'}</span>
          </div>
        </div>

        {/* Payment History Card */}
        <div className="info-card">
          <h3 className="info-card-title" style={{ margin: 0, paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
            <i className="fas fa-history"></i> Payment History ({schoolInfo?.currentTerm || 'Term 1'})
          </h3>
          
          {activeTermPayments.length > 0 ? (
            <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '0.5rem 1rem', fontWeight: 700 }}>Date</th>
                    <th style={{ padding: '0.5rem 1rem', fontWeight: 700 }}>Amount Paid</th>
                    <th style={{ padding: '0.5rem 1rem', fontWeight: 700 }}>Payment Method</th>
                    <th style={{ padding: '0.5rem 1rem', fontWeight: 700 }}>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTermPayments.map((p, idx) => (
                    <tr key={p.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                        {new Date(p.paymentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#059669' }}>
                        GH¢ {(parseFloat(p.amount) || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#0f172a', fontWeight: 600 }}>
                        <span style={{ 
                          display: 'inline-block', 
                          padding: '0.15rem 0.5rem', 
                          borderRadius: '6px', 
                          fontSize: '0.75rem',
                          background: p.paymentMethod === 'Cash' ? '#fef3c7' : p.paymentMethod === 'Mobile Money' ? '#e0f2fe' : '#dcfce7',
                          color: p.paymentMethod === 'Cash' ? '#92400e' : p.paymentMethod === 'Mobile Money' ? '#0369a1' : '#15803d'
                        }}>
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {p.reference || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '2rem 1rem 1rem' }}>
              No payments recorded for this term.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentFeesView;
