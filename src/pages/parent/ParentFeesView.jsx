import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../lib/db';
import authService from '../../services/authService';

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
    const [school, allClasses, summariesList] = await Promise.all([
      schoolId ? db.schools.get(schoolId) : null,
      db.classes.toArray(),
      db.reportSummaries.toArray()
    ]);

    return {
      activeLearner: learner,
      schoolInfo: school,
      classes: allClasses,
      reportSummaries: summariesList
    };
  }, [learnerId]);

  const activeLearner = viewData?.activeLearner;
  const schoolInfo = viewData?.schoolInfo;
  const classes = viewData?.classes;
  const reportSummaries = viewData?.reportSummaries;

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
    const totalDue = (arrears === null && nextBill === null) ? NaN : (arrearsVal + nextBillVal);

    return {
      arrears,
      nextBill,
      totalDue
    };
  }, [activeSummary]);

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

        .bank-details-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem 1.25rem;
          margin-top: 0.5rem;
        }

        .bank-row {
          display: flex;
          margin-bottom: 0.5rem;
          font-size: 0.85rem;
        }

        .bank-row:last-child {
          margin-bottom: 0;
        }

        .bank-lbl {
          width: 130px;
          color: #64748b;
          font-weight: 600;
        }

        .bank-val {
          font-weight: 700;
          color: #0f172a;
        }

        .policy-item {
          display: flex;
          gap: 10px;
          font-size: 0.85rem;
          color: #475569;
          margin-bottom: 0.75rem;
          line-height: 1.4;
        }

        .policy-item:last-child {
          margin-bottom: 0;
        }

        .policy-item i {
          color: #10b981;
          margin-top: 3px;
        }

        .disclaimer-banner {
          background: rgba(245, 158, 11, 0.06);
          border: 1px dashed rgba(245, 158, 11, 0.25);
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          gap: 10px;
          font-size: 0.82rem;
          color: #b45309;
          line-height: 1.5;
        }

        .disclaimer-banner i {
          font-size: 1.1rem;
          margin-top: 2px;
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
          {activeLearner.photoUrl || activeLearner.photo ? (
            <img src={activeLearner.photoUrl || activeLearner.photo} alt={activeLearner.fullName} className="f-avatar" />
          ) : (
            <div className="f-avatar-ph">
              <i className="fas fa-user-graduate"></i>
            </div>
          )}
          
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
            <span className="ledger-row-lbl">Current Term Academic Tuition &amp; Levies</span>
            <span className="ledger-row-val">{financials.nextBill !== null ? `GH¢ ${financials.nextBill.toFixed(2)}` : '-'}</span>
          </div>

          <div className="ledger-row total">
            <span className="ledger-row-lbl">Total Sibling Account Balance Due</span>
            <span className="ledger-row-val">GH¢ {financials.totalDue !== null && !isNaN(financials.totalDue) ? financials.totalDue.toFixed(2) : '0.00'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentFeesView;
