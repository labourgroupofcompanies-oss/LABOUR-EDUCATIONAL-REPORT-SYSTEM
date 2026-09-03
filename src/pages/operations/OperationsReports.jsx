import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getSchoolsDirectory } from '../../services/operationsService';
import subscriptionService from '../../services/subscriptionService';
import LogoPreloader from '../../components/common/LogoPreloader';
import { supabase } from '../../lib/supabase';

const REPORT_TYPES = [
  { id: 'financial', label: 'Financial & Revenue Statement', icon: 'fa-file-invoice-dollar', color: '#10B981', desc: 'Inflow transactions, wallet credits, payment methods, and platform revenue.' },
  { id: 'billing', label: 'School Billing & Arrears Ledger', icon: 'fa-scale-balanced', color: '#3B82F6', desc: 'School-by-school term billing, payments made, and outstanding balances.' },
  { id: 'census', label: 'Platform Census & System Health', icon: 'fa-chart-pie', color: '#8B5CF6', desc: 'Regional distribution, student headcounts, report card production, and sync status.' },
  { id: 'referrals', label: 'Referral & Partner Commissions', icon: 'fa-gift', color: '#F59E0B', desc: 'Promoter earnings, referral codes, commission disbursements, and pending payouts.' },
];

const PERIOD_PRESETS = [
  { id: 'all', label: 'All-Time' },
  { id: 'this_year', label: 'This Academic Year' },
  { id: 'this_term', label: 'This Term' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_30', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom Range' },
];

const OperationsReports = () => {
  const [selectedReport, setSelectedReport] = useState('financial');
  const [period, setPeriod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all'); // all, Private, GES, International
  const [searchTerm, setSearchTerm] = useState('');

  // Data states
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState([]);
  const [transactions, setTransactions] = useState({ walletTransactions: [], paymentTransactions: [] });
  const [referrals, setReferrals] = useState([]);

  // Load live data from Supabase
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolsData, txsData, referralsRes] = await Promise.allSettled([
        getSchoolsDirectory(),
        subscriptionService.getAllTransactions(),
        supabase.from('report_referrals').select('*, report_schools(name)').order('created_at', { ascending: false })
      ]);

      if (schoolsData.status === 'fulfilled' && schoolsData.value) {
        setSchools(schoolsData.value);
      }
      if (txsData.status === 'fulfilled' && txsData.value) {
        setTransactions(txsData.value);
      }
      if (referralsRes.status === 'fulfilled' && referralsRes.value.data) {
        setReferrals(referralsRes.value.data);
      }
    } catch (err) {
      console.error('[OperationsReports] Failed to fetch report data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Date Range filter helper
  const isWithinPeriod = useCallback((dateStr) => {
    if (!dateStr) return true;
    if (period === 'all') return true;

    const date = new Date(dateStr);
    const now = new Date();

    if (period === 'this_month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    if (period === 'last_30') {
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      return date >= thirtyDaysAgo;
    }
    if (period === 'custom') {
      if (startDate && new Date(dateStr) < new Date(startDate)) return false;
      if (endDate && new Date(dateStr) > new Date(endDate + 'T23:59:59')) return false;
      return true;
    }
    return true;
  }, [period, startDate, endDate]);

  // ── 1. Financial Report Data ────────────────────────────────────────────────
  const financialData = useMemo(() => {
    const rawWallet = transactions.walletTransactions || [];

    // Filter by period & search
    const filteredWallet = rawWallet.filter(tx => {
      if (!isWithinPeriod(tx.created_at)) return false;
      if (categoryFilter !== 'all') {
        const sch = schools.find(s => s.id === tx.school_id || s.id === tx.schoolId);
        if (sch && sch.school_category !== categoryFilter && sch.school_type !== categoryFilter) return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const sName = (tx.report_schools?.name || tx.school_name || '').toLowerCase();
        const ref = (tx.reference || tx.id || '').toLowerCase();
        const desc = (tx.description || tx.type || '').toLowerCase();
        if (!sName.includes(term) && !ref.includes(term) && !desc.includes(term)) return false;
      }
      return true;
    });

    let totalCredits = 0;
    let totalDebits = 0;
    filteredWallet.forEach(tx => {
      const amt = Number(tx.amount || 0);
      if (tx.type === 'credit' || (tx.amount > 0 && tx.type !== 'debit')) {
        totalCredits += amt;
      } else {
        totalDebits += Math.abs(amt);
      }
    });

    // Total Float in School Wallets right now
    const totalPlatformFloat = schools.reduce((sum, s) => sum + Math.max(0, Number(s.wallet_balance || 0)), 0);

    return {
      items: filteredWallet,
      totalCredits,
      totalDebits,
      netInflow: totalCredits - totalDebits,
      totalPlatformFloat,
      totalTransactions: filteredWallet.length
    };
  }, [transactions, schools, isWithinPeriod, categoryFilter, searchTerm]);

  // ── 2. School Billing & Arrears Data ────────────────────────────────────────
  const billingData = useMemo(() => {
    const filtered = schools.filter(s => {
      if (categoryFilter !== 'all' && s.school_category !== categoryFilter && s.school_type !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = (s.name || '').toLowerCase();
        const loc = (s.location || s.district || '').toLowerCase();
        if (!name.includes(term) && !loc.includes(term)) return false;
      }
      return true;
    });

    let totalBillableLearners = 0;
    let totalPositiveBalance = 0;
    let totalArrears = 0;

    filtered.forEach(s => {
      totalBillableLearners += Number(s.learners_count || 0);
      const bal = Number(s.wallet_balance || 0);
      if (bal >= 0) totalPositiveBalance += bal;
      else totalArrears += Math.abs(bal);
    });

    return {
      schools: filtered,
      totalSchools: filtered.length,
      totalBillableLearners,
      totalPositiveBalance,
      totalArrears
    };
  }, [schools, categoryFilter, searchTerm]);

  // ── 3. Platform Census & Academic Operations Data ───────────────────────────
  const censusData = useMemo(() => {
    const filtered = schools.filter(s => {
      if (categoryFilter !== 'all' && s.school_category !== categoryFilter && s.school_type !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = (s.name || '').toLowerCase();
        const loc = (s.location || s.district || s.region || '').toLowerCase();
        if (!name.includes(term) && !loc.includes(term)) return false;
      }
      return true;
    });

    let totalLearners = 0;
    let totalStaff = 0;
    let totalScores = 0;
    let totalReports = 0;

    const regionCounts = {};
    const categoryCounts = { Private: 0, GES: 0, International: 0 };

    filtered.forEach(s => {
      totalLearners += Number(s.learners_count || 0);
      totalStaff += Number(s.staff_count || 0);
      totalScores += Number(s.total_scores_count || 0);
      totalReports += Number(s.reports_count || 0);

      const reg = s.region || 'Unspecified';
      regionCounts[reg] = (regionCounts[reg] || 0) + 1;

      const cat = s.school_category || (s.school_type === 'public' ? 'GES' : 'Private');
      if (categoryCounts[cat] !== undefined) categoryCounts[cat] += 1;
      else categoryCounts['Private'] += 1;
    });

    return {
      schools: filtered,
      totalSchools: filtered.length,
      totalLearners,
      totalStaff,
      totalScores,
      totalReports,
      regionCounts,
      categoryCounts
    };
  }, [schools, categoryFilter, searchTerm]);

  // ── 4. Referral & Commission Data ───────────────────────────────────────────
  const referralData = useMemo(() => {
    const filtered = referrals.filter(r => {
      if (!isWithinPeriod(r.created_at)) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const promoter = (r.promoter_name || r.promoter_email || '').toLowerCase();
        const code = (r.referral_code || '').toLowerCase();
        const sName = (r.report_schools?.name || '').toLowerCase();
        if (!promoter.includes(term) && !code.includes(term) && !sName.includes(term)) return false;
      }
      return true;
    });

    let totalCommissionsEarned = 0;
    let totalPaidOut = 0;

    filtered.forEach(r => {
      const amt = Number(r.reward_amount || r.commission_amount || 0);
      totalCommissionsEarned += amt;
      if (r.status === 'paid' || r.payout_status === 'completed') totalPaidOut += amt;
    });

    return {
      items: filtered,
      totalReferrals: filtered.length,
      totalCommissionsEarned,
      totalPaidOut,
      pendingPayout: totalCommissionsEarned - totalPaidOut
    };
  }, [referrals, isWithinPeriod, searchTerm]);

  // ── Export to CSV Handler ───────────────────────────────────────────────────
  const handleExportCSV = () => {
    let rows = [];
    let filename = `platform_report_${selectedReport}_${new Date().toISOString().slice(0, 10)}.csv`;

    if (selectedReport === 'financial') {
      rows.push(['Date', 'School Name', 'Type', 'Amount (GHS)', 'Description', 'Reference']);
      financialData.items.forEach(t => {
        rows.push([
          new Date(t.created_at).toLocaleDateString(),
          `"${(t.report_schools?.name || t.school_name || 'N/A').replace(/"/g, '""')}"`,
          t.type || 'transaction',
          Number(t.amount || 0).toFixed(2),
          `"${(t.description || '').replace(/"/g, '""')}"`,
          t.reference || t.id || ''
        ]);
      });
    } else if (selectedReport === 'billing') {
      rows.push(['School Name', 'Category', 'Region', 'District', 'Learners', 'Wallet Balance (GHS)', 'Status']);
      billingData.schools.forEach(s => {
        rows.push([
          `"${(s.name || '').replace(/"/g, '""')}"`,
          s.school_category || s.school_type || 'Private',
          s.region || 'N/A',
          s.district || 'N/A',
          s.learners_count || 0,
          Number(s.wallet_balance || 0).toFixed(2),
          Number(s.wallet_balance || 0) >= 0 ? 'Sufficient' : 'Deficit / In Arrears'
        ]);
      });
    } else if (selectedReport === 'census') {
      rows.push(['School Name', 'Category', 'Region', 'Learners', 'Teachers', 'Scores Logged', 'Reports Released']);
      censusData.schools.forEach(s => {
        rows.push([
          `"${(s.name || '').replace(/"/g, '""')}"`,
          s.school_category || s.school_type || 'Private',
          s.region || 'N/A',
          s.learners_count || 0,
          s.staff_count || 0,
          s.total_scores_count || 0,
          s.reports_count || 0
        ]);
      });
    } else if (selectedReport === 'referrals') {
      rows.push(['Date', 'Referral Code', 'Promoter', 'Referred School', 'Commission (GHS)', 'Status']);
      referralData.items.forEach(r => {
        rows.push([
          new Date(r.created_at).toLocaleDateString(),
          r.referral_code || '—',
          `"${(r.promoter_name || 'N/A').replace(/"/g, '""')}"`,
          `"${(r.report_schools?.name || 'N/A').replace(/"/g, '""')}"`,
          Number(r.reward_amount || r.commission_amount || 0).toFixed(2),
          r.status || 'pending'
        ]);
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const currentReportObj = REPORT_TYPES.find(r => r.id === selectedReport);

  return (
    <div className="operations-reports-page" style={{ padding: '1.75rem 2rem', width: '100%', boxSizing: 'border-box' }}>
      <style>{`
        @media print {
          body {
            background: white !important;
            color: #09090b !important;
          }
          .no-print {
            display: none !important;
          }
          .operations-reports-page {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .print-header {
            display: block !important;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 1rem;
            margin-bottom: 1.5rem;
          }
          .print-kpi-grid {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 10px !important;
            margin-bottom: 1.5rem !important;
          }
          .report-table-wrap {
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
          }
          .report-table th, .report-table td {
            padding: 6px 8px !important;
            font-size: 0.72rem !important;
          }
          .print-footer {
            display: flex !important;
            justify-content: space-between;
            margin-top: 2.5rem;
            padding-top: 1rem;
            border-top: 1px solid #cbd5e1;
            page-break-inside: avoid;
          }
          @page {
            size: A4 landscape;
            margin: 10mm 12mm;
          }
        }

        .print-header, .print-footer {
          display: none;
        }

        .report-nav-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 1.25rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .report-nav-card:hover {
          border-color: #3b82f6;
          transform: translateY(-2px);
          box-shadow: 0 10px 20px -5px rgba(59, 130, 246, 0.1);
        }
        .report-nav-card.active {
          border-color: #2563eb;
          background: #eff6ff;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.12);
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .report-table th {
          background: #0f172a;
          color: #fff;
          text-align: left;
          padding: 0.75rem 1rem;
          font-weight: 700;
          letter-spacing: 0.03em;
        }
        .report-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
        }
        .report-table tbody tr:nth-child(even) {
          background: #f8fafc;
        }
        .report-table tbody tr:hover {
          background: #f1f5f9;
        }
      `}</style>

      {/* ── PRINT-ONLY HEADER ── */}
      <div className="print-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a' }}>
              LABOUR EDUCATIONAL PLATFORM OPERATIONS
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
              Official System Executive Audit &amp; Financial Statement
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#64748b' }}>
            <div><strong>Report Type:</strong> {currentReportObj?.label}</div>
            <div><strong>Generated On:</strong> {new Date().toLocaleString('en-GB')}</div>
            <div><strong>Filter Period:</strong> {period.toUpperCase()}</div>
          </div>
        </div>
      </div>

      {/* ── SCREEN TITLE & TOOLBAR ── */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-file-contract" style={{ color: '#2563eb', fontSize: '1.2rem' }}></i>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Platform Reports &amp; Executive Audits
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                Generate official financial statements, billing ledgers, and academic census audits.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={loadData}
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.55rem 1rem', background: '#fff', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '10px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-rotate" /> Refresh
          </button>
          <button
            onClick={handleExportCSV}
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.55rem 1.1rem', background: '#059669', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-file-excel" /> Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.55rem 1.25rem', background: '#0f172a', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)' }}
          >
            <i className="fa-solid fa-print" /> Print Report (PDF)
          </button>
        </div>
      </div>

      {/* ── REPORT CATEGORY SELECTOR CARDS ── */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {REPORT_TYPES.map(rep => {
          const isActive = selectedReport === rep.id;
          return (
            <div
              key={rep.id}
              className={`report-nav-card ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedReport(rep.id)}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: `${rep.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`fa-solid ${rep.icon}`} style={{ color: rep.color, fontSize: '1.25rem' }}></i>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: isActive ? '#1d4ed8' : '#0f172a' }}>
                  {rep.label}
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3 }}>
                  {rep.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FILTER TOOLBAR ── */}
      <div className="no-print" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-solid fa-filter" style={{ color: '#2563eb' }}></i> Filters:
          </div>

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 600, background: '#fff', color: '#0f172a', outline: 'none' }}
          >
            {PERIOD_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          {period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.8rem' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.8rem' }}
              />
            </div>
          )}

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 600, background: '#fff', color: '#0f172a', outline: 'none' }}
          >
            <option value="all">All School Categories</option>
            <option value="Private">Private Schools</option>
            <option value="GES">Public / GES Schools</option>
            <option value="International">International Schools</option>
          </select>
        </div>

        <div style={{ position: 'relative', minWidth: '240px' }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}></i>
          <input
            type="text"
            placeholder="Search school or reference..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.45rem 0.85rem 0.45rem 2.25rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <LogoPreloader size={48} />
          <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>
            Compiling audit metrics from database...
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI EXECUTIVE SUMMARY TILES ── */}
          <div className="print-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {selectedReport === 'financial' && (
              <>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total Gross Credits</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10B981', marginTop: '4px' }}>
                    GH₵ {financialData.totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>{financialData.totalTransactions} total transactions</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total Debits / Deductions</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#EF4444', marginTop: '4px' }}>
                    GH₵ {financialData.totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Term bills &amp; service charges</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Platform Wallet Float</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
                    GH₵ {financialData.totalPlatformFloat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Prepaid credit held in schools</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Active Participating Schools</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                    {schools.length} Schools
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Registered on platform</div>
                </div>
              </>
            )}

            {selectedReport === 'billing' && (
              <>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total Billable Students</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                    {billingData.totalBillableLearners.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Across {billingData.totalSchools} schools</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Prepaid Wallet Float</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10B981', marginTop: '4px' }}>
                    GH₵ {billingData.totalPositiveBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Healthy funded accounts</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Outstanding Arrears</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#EF4444', marginTop: '4px' }}>
                    GH₵ {billingData.totalArrears.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Deficits awaiting settlement</div>
                </div>
              </>
            )}

            {selectedReport === 'census' && (
              <>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total Enrolled Learners</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
                    {censusData.totalLearners.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Registered students</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Teaching &amp; Admin Staff</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                    {censusData.totalStaff.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Authorized staff accounts</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total Subject Scores</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10B981', marginTop: '4px' }}>
                    {censusData.totalScores.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Continuous assessment entries</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Reports Published</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#8B5CF6', marginTop: '4px' }}>
                    {censusData.totalReports.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Released to parent portals</div>
                </div>
              </>
            )}

            {selectedReport === 'referrals' && (
              <>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total Commissions Earned</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10B981', marginTop: '4px' }}>
                    GH₵ {referralData.totalCommissionsEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Across {referralData.totalReferrals} referral events</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Disbursed Payouts</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
                    GH₵ {referralData.totalPaidOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Paid to promoters</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Pending Claims</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#F59E0B', marginTop: '4px' }}>
                    GH₵ {referralData.pendingPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Awaiting disbursement</div>
                </div>
              </>
            )}
          </div>

          {/* ── DETAILED REPORT TABLE ── */}
          <div className="report-table-wrap" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                  {currentReportObj?.label}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Showing authoritative live platform records
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, background: '#f1f5f9', padding: '4px 10px', borderRadius: '20px', color: '#334155' }}>
                {selectedReport === 'financial' && `${financialData.items.length} Entries`}
                {selectedReport === 'billing' && `${billingData.schools.length} Schools`}
                {selectedReport === 'census' && `${censusData.schools.length} Schools`}
                {selectedReport === 'referrals' && `${referralData.items.length} Referrals`}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {selectedReport === 'financial' && (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>School / Institution</th>
                      <th>Transaction Type</th>
                      <th>Description</th>
                      <th>Amount (GH₵)</th>
                      <th>Reference ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialData.items.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>No transactions recorded matching the selected filter.</td></tr>
                    ) : (
                      financialData.items.map((t, idx) => {
                        const isCredit = t.type === 'credit' || (t.amount > 0 && t.type !== 'debit');
                        return (
                          <tr key={t.id || idx}>
                            <td>{new Date(t.created_at || t.paid_at).toLocaleDateString('en-GB')}</td>
                            <td style={{ fontWeight: 700 }}>{t.report_schools?.name || t.school_name || `School #${t.school_id || t.schoolId}`}</td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: isCredit ? '#dcfce7' : '#fee2e2', color: isCredit ? '#15803d' : '#b91c1c' }}>
                                {t.type ? t.type.toUpperCase() : (isCredit ? 'CREDIT' : 'DEBIT')}
                              </span>
                            </td>
                            <td>{t.description || t.reason || 'Wallet transaction'}</td>
                            <td style={{ fontWeight: 800, color: isCredit ? '#15803d' : '#b91c1c' }}>
                              {isCredit ? '+' : '-'} {Math.abs(Number(t.amount || 0)).toFixed(2)}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#64748b' }}>
                              {t.reference || t.id}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {selectedReport === 'billing' && (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>School Name</th>
                      <th>Category</th>
                      <th>Region / District</th>
                      <th>Enrolled Students</th>
                      <th>Billing Rate</th>
                      <th>Wallet Balance (GH₵)</th>
                      <th>Account Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingData.schools.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>No schools found matching the selected filter.</td></tr>
                    ) : (
                      billingData.schools.map(s => {
                        const bal = Number(s.wallet_balance || 0);
                        const isSufficient = bal >= 0;
                        return (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 700 }}>{s.name}</td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: '#f1f5f9', color: '#334155' }}>
                                {s.school_category || s.school_type || 'Private'}
                              </span>
                            </td>
                            <td>{[s.region, s.district].filter(Boolean).join(' • ') || '—'}</td>
                            <td style={{ fontWeight: 700 }}>{s.learners_count || 0}</td>
                            <td>GH₵ {Number(s.subscription_rate || 5).toFixed(2)} / student</td>
                            <td style={{ fontWeight: 800, color: isSufficient ? '#15803d' : '#b91c1c' }}>
                              GH₵ {bal.toFixed(2)}
                            </td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: isSufficient ? '#dcfce7' : '#fee2e2', color: isSufficient ? '#15803d' : '#b91c1c' }}>
                                {isSufficient ? 'Healthy Balance' : 'Arrears / Action Required'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {selectedReport === 'census' && (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>School Name</th>
                      <th>Category</th>
                      <th>Location / Region</th>
                      <th>Learners</th>
                      <th>Teachers</th>
                      <th>Scores Logged</th>
                      <th>Reports Published</th>
                      <th>Academic Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {censusData.schools.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>No schools found matching the selected filter.</td></tr>
                    ) : (
                      censusData.schools.map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 700 }}>{s.name}</td>
                          <td>{s.school_category || s.school_type || 'Private'}</td>
                          <td>{[s.location, s.region].filter(Boolean).join(', ') || '—'}</td>
                          <td style={{ fontWeight: 700 }}>{s.learners_count || 0}</td>
                          <td>{s.staff_count || 0}</td>
                          <td>{s.total_scores_count || 0}</td>
                          <td style={{ fontWeight: 700, color: '#2563eb' }}>{s.reports_count || 0}</td>
                          <td>{s.current_term || 'Term 1'} ({s.current_academic_year || 'Current'})</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {selectedReport === 'referrals' && (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Referral Code</th>
                      <th>Promoter / Partner</th>
                      <th>Referred Institution</th>
                      <th>Commission (GH₵)</th>
                      <th>Disbursement Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralData.items.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>No referral events recorded matching the selected filter.</td></tr>
                    ) : (
                      referralData.items.map((r, idx) => (
                        <tr key={r.id || idx}>
                          <td>{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563eb' }}>{r.referral_code || '—'}</td>
                          <td style={{ fontWeight: 700 }}>{r.promoter_name || r.promoter_email || 'Direct Promoter'}</td>
                          <td>{r.report_schools?.name || `School #${r.referred_school_id}`}</td>
                          <td style={{ fontWeight: 800, color: '#15803d' }}>
                            GH₵ {Number(r.reward_amount || r.commission_amount || 0).toFixed(2)}
                          </td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: r.status === 'paid' ? '#dcfce7' : '#fef9c3', color: r.status === 'paid' ? '#15803d' : '#a16207' }}>
                              {(r.status || 'pending').toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── PRINT-ONLY FOOTER SIGN-OFF ── */}
      <div className="print-footer">
        <div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Report Prepared &amp; Certified By:</div>
          <div style={{ marginTop: '30px', borderTop: '1px dashed #0f172a', width: '220px', paddingTop: '4px', fontWeight: 700, fontSize: '0.8rem' }}>
            Operations &amp; Audit Officer
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8' }}>
          <div>Labour Educational Report System &copy; {new Date().getFullYear()}</div>
          <div>Confidential Executive Operations Statement</div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Director of Operations Authorization:</div>
          <div style={{ marginTop: '30px', borderTop: '1px dashed #0f172a', width: '220px', paddingTop: '4px', fontWeight: 700, fontSize: '0.8rem' }}>
            Executive Director Sign &amp; Stamp
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationsReports;
