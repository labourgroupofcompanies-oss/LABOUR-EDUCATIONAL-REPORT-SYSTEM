import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getSchoolsDirectory } from '../../services/operationsService';
import subscriptionService from '../../services/subscriptionService';
import LogoPreloader from '../../components/common/LogoPreloader';

const CATEGORY_OPTIONS = [
  { id: 'Private', label: 'Private / Independent Schools' },
  { id: 'GES', label: 'Public / Government (GES)' },
  { id: 'International', label: 'International / Montessori' }
];

const OperationsSubscriptions = () => {
  const [schools, setSchools] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [billingCycles, setBillingCycles] = useState([]);
  const [termBills, setTermBills] = useState([]);
  const [transactions, setTransactions] = useState({ walletTransactions: [], paymentTransactions: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix' | 'transactions' | 'pricing_cycles' | 'audit'

  // Filtering & Search for Schools Subscription Status Matrix
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'free_trial' | 'healthy' | 'insufficient' | 'exempt'
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [matrixViewMode, setMatrixViewMode] = useState('cards'); // 'cards' | 'table'

  // Filtering & Search for Transactions Ledger
  const [txSearchTerm, setTxSearchTerm] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');

  // Category Pricing Form State
  const [selectedCategory, setSelectedCategory] = useState('Private');
  const [categoryPriceInput, setCategoryPriceInput] = useState('5.00');
  const [savingCategoryPrice, setSavingCategoryPrice] = useState(false);

  // Term Billing Cycle Form State (Labour Admin Control)
  const [cycleYear, setCycleYear] = useState('2025/2026');
  const [cycleTerm, setCycleTerm] = useState('Term 1');
  const [cycleDeadline, setCycleDeadline] = useState(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  const [startingCycle, setStartingCycle] = useState(false);
  const [cycleMsg, setCycleMsg] = useState(null);

  // Edit / Action Modal
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [modalType, setModalType] = useState(null); // 'config', 'topup', 'bills_history'
  const [saving, setSaving] = useState(false);

  // School Bills History Modal state
  const [schoolBills, setSchoolBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);

  // Form states for individual school config
  const [categoryForm, setCategoryForm] = useState('GES');
  const [overrideRateForm, setOverrideRateForm] = useState('');
  const [exemptDateForm, setExemptDateForm] = useState('');

  // TopUp Form
  const [topUpAmount, setTopUpAmount] = useState('500');
  const [topUpRef, setTopUpRef] = useState('');
  const [topUpNotes, setTopUpNotes] = useState('Manual Admin Top Up');

  // Map school ID to name
  const schoolNameMap = useMemo(() => {
    const map = {};
    (schools || []).forEach(s => {
      if (s.id) map[s.id] = s.name;
    });
    return map;
  }, [schools]);

  // Load all subscription data including transactions & term bills
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolsData, pricingData, logsData, cyclesData, txData, allBillsData] = await Promise.all([
        getSchoolsDirectory(true),
        subscriptionService.getSubscriptionPricing(),
        subscriptionService.getSubscriptionAuditLogs(),
        subscriptionService.getAllBillingCycles(),
        subscriptionService.getAllPlatformTransactions(),
        subscriptionService.getAllSchoolTermBills(),
      ]);

      setSchools(schoolsData || []);
      setPricing(pricingData || []);
      setAuditLogs(logsData || []);
      setBillingCycles(cyclesData || []);
      setTransactions(txData || { walletTransactions: [], paymentTransactions: [] });
      setTermBills(allBillsData || []);

      const currentCatPrice = pricingData?.find(p => p.school_category === selectedCategory);
      if (currentCatPrice) {
        setCategoryPriceInput(String(currentCatPrice.amount_per_learner || 5.00));
      }
    } catch (err) {
      console.error('[OperationsSubscriptions] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Start Term Billing Cycle (Labour Admin Trigger)
  const handleStartTermBilling = async (e) => {
    e.preventDefault();
    if (!cycleYear || !cycleTerm || !cycleDeadline) {
      alert('Please fill out all billing cycle parameters (Academic Year, Term, Deadline).');
      return;
    }

    if (!window.confirm(`Start Term Billing for ${cycleYear} (${cycleTerm})?\n\nThis will generate immutable billing snapshots for all eligible schools based on their current active learner count.`)) {
      return;
    }

    setStartingCycle(true);
    setCycleMsg(null);
    try {
      const deadlineIso = new Date(cycleDeadline).toISOString();
      const res = await subscriptionService.startTermBillingCycle(cycleYear, cycleTerm, deadlineIso, 'Labour Admin');
      setCycleMsg({
        type: 'success',
        text: res.message || `Billing cycle for ${cycleYear} (${cycleTerm}) initiated successfully!`
      });
      await loadData();
    } catch (err) {
      setCycleMsg({ type: 'error', text: 'Billing cycle error: ' + err.message });
    } finally {
      setStartingCycle(false);
    }
  };

  // Revert Term Billing Cycle (Labour Admin Action)
  const handleRevertTermBillingCycle = async (year, term) => {
    const targetYear = year || cycleYear;
    const targetTerm = term || cycleTerm;

    if (!window.confirm(`REVERT TERM BILLING TRIGGER for ${targetYear} (${targetTerm})?\n\nThis will remove unpaid billing snapshots for this term and allow you to adjust school exemptions or re-trigger billing.`)) {
      return;
    }

    setStartingCycle(true);
    setCycleMsg(null);
    try {
      const res = await subscriptionService.revertTermBillingCycle(targetYear, targetTerm, 'Labour Admin');
      setCycleMsg({
        type: 'success',
        text: res.message || `Billing cycle for ${targetYear} (${targetTerm}) successfully reverted.`
      });
      await loadData();
    } catch (err) {
      setCycleMsg({ type: 'error', text: 'Revert error: ' + err.message });
    } finally {
      setStartingCycle(false);
    }
  };

  // Toggle Exemption for a specific school for running term
  const handleToggleSchoolExemption = async (school) => {
    const termInfo = getSchoolRunningTermStatus(school);
    const isExempt = termInfo.statusKey === 'exempt';
    const confirmMsg = isExempt
      ? `Remove term exemption for "${school.name}"?`
      : `Exempt "${school.name}" from ${termInfo.termDisplay} bill?`;

    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    try {
      await subscriptionService.toggleSchoolTermExemption(
        school.id,
        termInfo.runningYear,
        termInfo.runningTerm,
        !isExempt,
        'Labour Admin'
      );
      await loadData();
    } catch (err) {
      alert(`Error updating school exemption: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategoryPricing = async (e) => {
    e.preventDefault();
    const rateVal = Number(categoryPriceInput);
    if (isNaN(rateVal) || rateVal < 0) {
      alert('Please enter a valid rate (0 or greater).');
      return;
    }

    setSavingCategoryPrice(true);
    try {
      await subscriptionService.updateSubscriptionPricing(selectedCategory, rateVal);
      alert(`Updated base per-learner pricing for ${selectedCategory} to GH₵ ${rateVal.toFixed(2)}.`);
      await loadData();
    } catch (err) {
      alert(`Error updating category price: ${err.message}`);
    } finally {
      setSavingCategoryPrice(false);
    }
  };

  const handleCategorySelectChange = (newCat) => {
    setSelectedCategory(newCat);
    const pObj = pricing.find(p => p.school_category?.toLowerCase() === newCat.toLowerCase());
    if (pObj) {
      setCategoryPriceInput(String(pObj.amount_per_learner || 5.00));
    }
  };

  const getSchoolEffectiveRate = (school) => {
    if (school.per_learner_rate_override !== null && school.per_learner_rate_override !== undefined) {
      return { rate: Number(school.per_learner_rate_override), isOverride: true };
    }
    const cat = school.school_category || school.school_type || 'Private';
    const pObj = pricing.find(p => p.school_category?.toLowerCase() === cat.toLowerCase());
    return { rate: pObj ? Number(pObj.amount_per_learner) : 5.00, isOverride: false };
  };

  /** Helper to determine exact running term and subscription status for that term */
  const getSchoolRunningTermStatus = (school) => {
    const runningTerm = school.current_term || 'Term 1';
    const runningYear = school.current_academic_year || '2025/2026';
    const termDisplay = `${runningTerm} (${runningYear})`;

    const isFirstTermFreeFlag = Boolean(school.is_first_term_free ?? true);
    const firstTermFreeTerminated = Boolean(school.first_term_free_terminated ?? false);
    const isExempt = school.subscription_exempt_until && new Date(school.subscription_exempt_until) >= new Date();

    // 16-week duration check
    const createdAt = school?.created_at ? new Date(school.created_at) : new Date();
    const maxFreeUntil = new Date(createdAt.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
    const within16Weeks = new Date() <= maxFreeUntil;

    // Strict onboarding term match
    const onboardingYear = school?.initial_academic_year || null;
    const onboardingTerm = school?.initial_term || null;
    const isOnboardingTerm = onboardingYear && onboardingTerm
      ? (onboardingYear.trim().toLowerCase() === runningYear.trim().toLowerCase() &&
         onboardingTerm.trim().toLowerCase() === runningTerm.trim().toLowerCase())
      : (!onboardingYear && !onboardingTerm); // if not recorded, initial term assumed

    const isTrialActive = isFirstTermFreeFlag && !firstTermFreeTerminated && within16Weeks && isOnboardingTerm;

    // Find term bill snapshot for this school for running term
    const currentBill = (termBills || []).find(
      b => b.school_id === school.id &&
           b.academic_year === runningYear &&
           b.term?.toLowerCase() === runningTerm.toLowerCase()
    ) || (termBills || []).find(b => b.school_id === school.id);

    let statusKey = 'active';
    let statusText = `${runningTerm} Subscription Active & Paid`;
    let badgeBg = '#ECFDF5';
    let badgeColor = '#10B981';
    let icon = 'fa-check-circle';

    const isSubscribedFlag = school.subscription_status === 'Active' || school.subscription_status === 'active' || Boolean(school.is_subscribed);

    if (isExempt) {
      statusKey = 'exempt';
      statusText = `${runningTerm}: Waived (Admin Exempted Until ${new Date(school.subscription_exempt_until).toLocaleDateString()})`;
      badgeBg = '#F5F3FF';
      badgeColor = '#7c3aed';
      icon = 'fa-shield-alt';
    } else if (isTrialActive) {
      statusKey = 'free_trial';
      statusText = `${runningTerm}: Waived (Free First Term Active)`;
      badgeBg = '#EFF6FF';
      badgeColor = '#2563eb';
      icon = 'fa-gift';
    } else if (currentBill && (currentBill.status === 'PAID' || currentBill.status === 'ACTIVE' || currentBill.status === 'COMPLETED' || currentBill.approval_status === 'APPROVED' || currentBill.approval_status === 'PAID')) {
      statusKey = 'paid';
      statusText = `${runningTerm}: Paid & Active (GH₵ ${Number(currentBill.total_amount || currentBill.amount_paid || currentBill.amount_due || 0).toFixed(2)})`;
      badgeBg = '#ECFDF5';
      badgeColor = '#10B981';
      icon = 'fa-check-circle';
    } else if (isSubscribedFlag) {
      statusKey = 'paid';
      statusText = `${runningTerm}: Subscription Active`;
      badgeBg = '#ECFDF5';
      badgeColor = '#10B981';
      icon = 'fa-check-circle';
    } else if (currentBill) {
      if (currentBill.approval_status === 'PENDING') {
        statusKey = 'pending_approval';
        statusText = `${runningTerm}: Payment Requested by Admin (Pending Approval)`;
        badgeBg = '#FFFBEB';
        badgeColor = '#F59E0B';
        icon = 'fa-hourglass-half';
      } else {
        statusKey = 'unpaid';
        statusText = `${runningTerm}: Bill Unpaid (Payment Due)`;
        badgeBg = '#FEF2F2';
        badgeColor = '#EF4444';
        icon = 'fa-lock';
      }
    } else {
      const { rate } = getSchoolEffectiveRate(school);
      const reqAmount = (school.learners_count || 0) * rate;
      const bal = schoolWalletLedgerMap ? (schoolWalletLedgerMap.get(String(school.id)) ?? Number(school.wallet_balance || 0)) : Number(school.wallet_balance || 0);

      const subLabel = !isOnboardingTerm ? 'Subsequent Term' : (within16Weeks ? '' : 'Trial Expired');

      if (bal >= reqAmount && reqAmount > 0) {
        statusKey = 'sufficient';
        statusText = `${runningTerm}: Wallet Balance Sufficient (GH₵ ${bal.toFixed(2)})`;
        badgeBg = '#ECFDF5';
        badgeColor = '#10B981';
        icon = 'fa-check-circle';
      } else if (bal > 0) {
        statusKey = 'insufficient';
        statusText = `${runningTerm}: ${subLabel ? subLabel + ' — ' : ''}Partial Balance (Bal: GH₵ ${bal.toFixed(2)}, Req: GH₵ ${reqAmount.toFixed(2)})`;
        badgeBg = '#FFFBEB';
        badgeColor = '#F59E0B';
        icon = 'fa-clock';
      } else {
        statusKey = 'insufficient';
        statusText = `${runningTerm}: ${subLabel ? subLabel + ' — ' : ''}Payment Due (Req: GH₵ ${reqAmount.toFixed(2)})`;
        badgeBg = '#FEF2F2';
        badgeColor = '#EF4444';
        icon = 'fa-lock';
      }
    }

    return {
      runningTerm,
      runningYear,
      termDisplay,
      statusKey,
      statusText,
      badgeBg,
      badgeColor,
      icon,
      currentBill,
      isOnboardingTerm,
      isTrialActive
    };
  };

  // Build a unified ledger: wallet_transactions + completed Paystack payment_transactions
  const unifiedLedger = useMemo(() => {
    const walletTxs = transactions.walletTransactions || [];
    const paymentTxs = transactions.paymentTransactions || [];

    const unified = walletTxs.map(t => {
      const isCredit = t.transaction_type === 'CREDIT' || t.type === 'CREDIT' || (Number(t.amount || 0) > 0 && !t.description?.toLowerCase().includes('debit'));
      return {
        ...t,
        transaction_type: isCredit ? 'CREDIT' : 'DEBIT',
        _source: 'wallet',
        _schoolName: t.report_schools?.name || schoolNameMap[t.school_id] || t.school_id || 'Unknown School',
        _sortDate: t.created_at,
      };
    });

    const existingRefs = new Set(walletTxs.map(w => w.reference).filter(Boolean));

    paymentTxs.forEach(pt => {
      const statusUpper = String(pt.status || '').toUpperCase();
      const isCompleted = ['COMPLETED', 'VERIFIED', 'WALLET_CREDITED', 'SUCCESS', 'PAID'].includes(statusUpper);
      const alreadyInWallet = pt.provider_reference && existingRefs.has(pt.provider_reference);

      if (isCompleted && !alreadyInWallet) {
        unified.push({
          id: pt.id,
          school_id: pt.school_id,
          transaction_type: 'CREDIT',
          type: 'CREDIT',
          amount: Number(pt.verified_amount || pt.requested_amount || 0),
          balance_before: null,
          balance_after: null,
          currency: pt.currency || 'GHS',
          reference: pt.provider_reference || `PAY-${String(pt.id).substring(0, 8)}`,
          description: `Paystack Online Payment (${pt.payment_method || pt.paystack_channel || 'card'})`,
          created_by: pt.customer_email || pt.initiated_by || 'Paystack',
          created_at: pt.completed_at || pt.paid_at || pt.created_at,
          report_schools: pt.report_schools,
          _source: 'paystack',
          _schoolName: pt.report_schools?.name || schoolNameMap[pt.school_id] || pt.school_id || 'Unknown School',
          _sortDate: pt.completed_at || pt.paid_at || pt.created_at,
          _paystackStatus: pt.status,
          _paymentMethod: pt.payment_method || pt.paystack_channel,
        });
      }
    });

    unified.sort((a, b) => new Date(b._sortDate || 0) - new Date(a._sortDate || 0));
    return unified;
  }, [transactions, schoolNameMap]);

  // Derive school wallet balance directly from wallet_transactions table
  const schoolWalletLedgerMap = useMemo(() => {
    const map = new Map();
    const walletTxs = transactions.walletTransactions || [];
    const paymentTxs = transactions.paymentTransactions || [];

    const bySchool = new Map();
    walletTxs.forEach(tx => {
      const sId = String(tx.school_id || tx.schoolId || '');
      if (sId) {
        if (!bySchool.has(sId)) bySchool.set(sId, []);
        bySchool.get(sId).push(tx);
      }
    });

    bySchool.forEach((txList, sId) => {
      txList.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const latestWithBal = txList.find(t => t.balance_after !== null && t.balance_after !== undefined && !isNaN(Number(t.balance_after)));
      if (latestWithBal) {
        map.set(sId, Number(latestWithBal.balance_after));
      } else {
        const credits = txList.filter(t => (t.transaction_type === 'CREDIT' || t.type === 'CREDIT' || t.type === 'DEPOSIT')).reduce((s, t) => s + Number(t.amount || 0), 0);
        const debits = txList.filter(t => (t.transaction_type === 'DEBIT' || t.type === 'DEBIT' || t.type === 'DEDUCTION')).reduce((s, t) => s + Number(t.amount || 0), 0);
        map.set(sId, Math.max(0, credits - debits));
      }
    });

    // Check if any school only has completed Paystack payment transactions
    paymentTxs.forEach(pt => {
      const sId = String(pt.school_id || pt.schoolId || '');
      const isSuccess = pt.status === 'COMPLETED' || pt.status === 'SUCCESS' || pt.status === 'success' || pt.status === 'completed';
      if (sId && isSuccess && !map.has(sId)) {
        const cur = map.get(sId) || 0;
        map.set(sId, cur + Number(pt.amount || 0));
      }
    });

    return map;
  }, [transactions]);

  // Executive Stats Calculation
  const stats = useMemo(() => {
    let healthy = 0;
    let insufficient = 0;
    let freeTrialActive = 0;
    let exemptCount = 0;
    let totalWalletBal = 0;
    let totalOutstanding = 0;

    schools.forEach((s) => {
      const bal = schoolWalletLedgerMap.get(String(s.id)) ?? Number(s.wallet_balance || 0);
      totalWalletBal += bal;
      const { rate } = getSchoolEffectiveRate(s);
      const reqAmount = (s.learners_count || 0) * rate;

      const isFirstTermFree = Boolean(s.is_first_term_free ?? true);
      const firstTermFreeTerminated = Boolean(s.first_term_free_terminated ?? false);
      const isTrialActive = isFirstTermFree && !firstTermFreeTerminated;
      const isExempt = s.subscription_exempt_until && new Date(s.subscription_exempt_until) >= new Date();

      if (isExempt) {
        exemptCount++;
      } else if (isTrialActive) {
        freeTrialActive++;
      } else if (bal >= reqAmount) {
        healthy++;
      } else {
        insufficient++;
        totalOutstanding += (reqAmount - bal);
      }
    });

    let totalTopUps = 0;
    let totalDeductions = 0;

    unifiedLedger.forEach((t) => {
      const amt = Number(t.amount || 0);
      if (t.transaction_type === 'CREDIT') totalTopUps += amt;
      else if (t.transaction_type === 'DEBIT') totalDeductions += amt;
    });

    return {
      totalSchoolsCount: schools.length,
      healthy,
      insufficient,
      freeTrialActive,
      exemptCount,
      totalWalletBal,
      totalOutstanding,
      totalTopUps,
      totalDeductions,
      totalTransactionsCount: unifiedLedger.length,
      paystackPaymentsCount: (transactions.paymentTransactions || []).length,
    };
  }, [schools, pricing, unifiedLedger, transactions, schoolWalletLedgerMap]);

  // Filtered Schools Directory & Matrix
  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const matchesSearch =
        s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.district?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.region?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCat = filterCategory === 'all' || (s.school_category || 'Private') === filterCategory;

      const bal = schoolWalletLedgerMap.get(String(s.id)) ?? Number(s.wallet_balance || 0);
      const { rate } = getSchoolEffectiveRate(s);
      const reqAmount = (s.learners_count || 0) * rate;

      const isFirstTermFree = Boolean(s.is_first_term_free ?? true);
      const firstTermFreeTerminated = Boolean(s.first_term_free_terminated ?? false);
      const isTrialActive = isFirstTermFree && !firstTermFreeTerminated;
      const isExempt = s.subscription_exempt_until && new Date(s.subscription_exempt_until) >= new Date();

      let statusKey = 'healthy';
      if (isExempt) statusKey = 'exempt';
      else if (isTrialActive) statusKey = 'free_trial';
      else if (bal < reqAmount) statusKey = 'insufficient';

      const matchesStatus = filterStatus === 'all' || statusKey === filterStatus;

      return matchesSearch && matchesCat && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'balance') return Number(b.wallet_balance || 0) - Number(a.wallet_balance || 0);
      if (sortBy === 'learners') return Number(b.learners_count || 0) - Number(a.learners_count || 0);
      if (sortBy === 'category') return (a.school_category || '').localeCompare(b.school_category || '');
      return a.name.localeCompare(b.name);
    });
  }, [schools, pricing, searchTerm, filterCategory, filterStatus, sortBy]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return unifiedLedger.filter((t) => {
      const schoolName = t._schoolName || '';
      const ref = t.reference || '';
      const desc = t.description || '';

      const matchesSearch =
        schoolName.toLowerCase().includes(txSearchTerm.toLowerCase()) ||
        ref.toLowerCase().includes(txSearchTerm.toLowerCase()) ||
        desc.toLowerCase().includes(txSearchTerm.toLowerCase());

      const txType = t.transaction_type || t.type || (Number(t.amount || 0) > 0 ? 'CREDIT' : 'DEBIT');

      const matchesType =
        txTypeFilter === 'all' ||
        (txTypeFilter === 'CREDIT' && txType === 'CREDIT') ||
        (txTypeFilter === 'DEBIT' && txType === 'DEBIT') ||
        (txTypeFilter === 'paystack' && t._source === 'paystack');

      return matchesSearch && matchesType;
    });
  }, [unifiedLedger, txSearchTerm, txTypeFilter]);

  // Term Revenue Analytics calculation
  const [selectedRevenueTerm, setSelectedRevenueTerm] = useState('Term 1 (2025/2026)');

  const termRevenueAnalytics = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    let categoryBreakdown = {
      Private: { billed: 0, collected: 0, schoolsCount: 0, paidCount: 0 },
      GES: { billed: 0, collected: 0, schoolsCount: 0, paidCount: 0 },
      International: { billed: 0, collected: 0, schoolsCount: 0, paidCount: 0 },
    };

    schools.forEach((s) => {
      const cat = s.school_category || s.school_type || 'Private';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { billed: 0, collected: 0, schoolsCount: 0, paidCount: 0 };
      }
      categoryBreakdown[cat].schoolsCount += 1;

      const { rate } = getSchoolEffectiveRate(s);
      const reqAmount = (s.learners_count || 0) * rate;
      const bal = Number(s.wallet_balance || 0);

      const termInfo = getSchoolRunningTermStatus(s);

      const matchesTermFilter =
        selectedRevenueTerm === 'all' ||
        termInfo.termDisplay.toLowerCase().includes(selectedRevenueTerm.toLowerCase()) ||
        termInfo.runningTerm.toLowerCase().includes(selectedRevenueTerm.toLowerCase());

      if (matchesTermFilter) {
        const isWaived = termInfo.statusKey === 'free_trial' || termInfo.statusKey === 'exempt';

        if (!isWaived) {
          totalBilled += reqAmount;
          categoryBreakdown[cat].billed += reqAmount;

          if (termInfo.statusKey === 'paid' || termInfo.statusKey === 'sufficient' || bal >= reqAmount) {
            totalCollected += reqAmount;
            categoryBreakdown[cat].collected += reqAmount;
            categoryBreakdown[cat].paidCount += 1;
          } else {
            const shortfall = Math.max(0, reqAmount - bal);
            totalOutstanding += shortfall;
            const collectedPartial = Math.min(bal, reqAmount);
            totalCollected += collectedPartial;
            categoryBreakdown[cat].collected += collectedPartial;
          }
        } else {
          categoryBreakdown[cat].paidCount += 1;
        }
      }
    });

    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 100;

    return {
      totalBilled,
      totalCollected,
      totalOutstanding,
      collectionRate,
      categoryBreakdown
    };
  }, [schools, termBills, selectedRevenueTerm, pricing]);

  const handleExportRevenueCSV = () => {
    const headers = ['School ID', 'School Name', 'Category', 'Running Term', 'Learners', 'Rate per Learner', 'Term Dues (GH₵)', 'Wallet Balance (GH₵)', 'Collected Revenue (GH₵)', 'Outstanding Shortfall (GH₵)', 'Subscription Status'];
    const rows = schools.map((s) => {
      const { rate } = getSchoolEffectiveRate(s);
      const reqAmount = (s.learners_count || 0) * rate;
      const bal = Number(s.wallet_balance || 0);
      const termInfo = getSchoolRunningTermStatus(s);
      const isWaived = termInfo.statusKey === 'free_trial' || termInfo.statusKey === 'exempt';
      const dues = isWaived ? 0 : reqAmount;
      const collected = isWaived ? 0 : Math.min(bal, reqAmount);
      const shortfall = isWaived ? 0 : Math.max(0, reqAmount - bal);

      return [
        s.id,
        `"${s.name}"`,
        s.school_category || 'Private',
        `"${termInfo.termDisplay}"`,
        s.learners_count || 0,
        rate,
        dues.toFixed(2),
        bal.toFixed(2),
        collected.toFixed(2),
        shortfall.toFixed(2),
        `"${termInfo.statusText.replace(/"/g, '""')}"`
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Term_Revenue_Report_${selectedRevenueTerm.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleFreeTrial = async (school) => {
    const isTerminated = school.first_term_free_terminated;
    const actionMsg = isTerminated
      ? `Re-enable Free First Term for "${school.name}"?`
      : `Terminate Free First Term for "${school.name}"?`;

    if (!window.confirm(actionMsg)) return;

    setSaving(true);
    try {
      if (isTerminated) {
        await subscriptionService.restoreSchoolFreeTrial(school.id, 'Platform Developer');
      } else {
        await subscriptionService.terminateSchoolFreeTrial(school.id, true, 'Platform Developer');
      }
      await loadData();
      if (modalType === 'config') setModalType(null);
    } catch (err) {
      alert(`Error updating free trial status: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenConfig = (school) => {
    setSelectedSchool(school);
    setCategoryForm(school.school_category || 'Private');
    setOverrideRateForm(school.per_learner_rate_override !== null && school.per_learner_rate_override !== undefined ? String(school.per_learner_rate_override) : '');
    setExemptDateForm(school.subscription_exempt_until ? school.subscription_exempt_until.split('T')[0] : '');
    setModalType('config');
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!selectedSchool) return;
    setSaving(true);
    try {
      await subscriptionService.updateSchoolSubscriptionConfig(selectedSchool.id, {
        school_category: categoryForm,
        per_learner_rate_override: overrideRateForm !== '' ? Number(overrideRateForm) : null,
        subscription_exempt_until: exemptDateForm || null,
      });
      setModalType(null);
      await loadData();
    } catch (err) {
      alert(`Error updating config: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenTopUp = (school) => {
    setSelectedSchool(school);
    setTopUpAmount('500');
    setTopUpRef(`ADM-${Date.now().toString().slice(-6)}`);
    setTopUpNotes('Manual Admin Credit Deposit');
    setModalType('topup');
  };

  const handleSaveTopUp = async (e) => {
    e.preventDefault();
    if (!selectedSchool || !topUpAmount) return;
    setSaving(true);
    try {
      await subscriptionService.topUpSchoolWallet(
        selectedSchool.id,
        Number(topUpAmount),
        topUpRef,
        topUpNotes,
        'Platform Admin'
      );
      setModalType(null);
      await loadData();
    } catch (err) {
      alert(`Error topping up wallet: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenBillsHistory = async (school) => {
    setSelectedSchool(school);
    setSchoolBills([]);
    setLoadingBills(true);
    setModalType('bills_history');
    try {
      const bills = await subscriptionService.getSchoolTermBills(school.id);
      setSchoolBills(bills || []);
    } catch (err) {
      console.error('Error fetching school bills:', err);
    } finally {
      setLoadingBills(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['School ID', 'School Name', 'Category', 'Region', 'Learners', 'Wallet Balance', 'Effective Rate', 'Req Amount', 'Subscription Status'];
    const rows = filteredSchools.map((s) => {
      const { rate } = getSchoolEffectiveRate(s);
      const reqAmount = (s.learners_count || 0) * rate;
      const isFirstTermFree = Boolean(s.is_first_term_free ?? true);
      const firstTermFreeTerminated = Boolean(s.first_term_free_terminated ?? false);
      const isTrialActive = isFirstTermFree && !firstTermFreeTerminated;
      const isExempt = s.subscription_exempt_until && new Date(s.subscription_exempt_until) >= new Date();
      const statusLabel = isExempt ? 'EXEMPT' : isTrialActive ? 'FIRST_TERM_FREE' : (s.wallet_balance || 0) >= reqAmount ? 'ACTIVE' : 'INSUFFICIENT_FUNDS';

      return [
        s.id,
        `"${s.name}"`,
        s.school_category || 'Private',
        `"${s.region || ''}"`,
        s.learners_count || 0,
        s.wallet_balance || 0,
        rate,
        reqAmount,
        statusLabel
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `school_subscriptions_matrix_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: '#18181b' }}>
      
      {/* ── HEADER TITLE & QUICK ACTIONS ──────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
            Subscription &amp; Financial Center
          </h1>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Monitor school subscriptions, wallet balances, term billing, and payment ledgers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.open('/Platform_Operations_User_Manual.pdf', '_blank')}
            style={{ padding: '0.55rem 1.05rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#09090b', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Download/view official PDF User Manual"
          >
            <i className="fas fa-file-pdf" style={{ color: '#EF4444' }} /> User Manual (PDF)
          </button>
          <button
            onClick={() => loadData()}
            style={{ padding: '0.55rem 1.05rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#09090b', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} style={{ color: '#2563eb' }} /> Refresh
          </button>
          <button
            onClick={handleExportCSV}
            style={{ padding: '0.55rem 1.15rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(9, 9, 11, 0.2)' }}
          >
            <i className="fas fa-file-csv" style={{ color: '#10B981' }} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── EXECUTIVE KPI METRICS BAR ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        
        <div style={{ padding: '1.1rem', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#EFF6FF', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
            <i className="fas fa-school" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Total Schools</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 900, color: '#09090b', marginTop: '2px' }}>
              {stats.totalSchoolsCount}
            </div>
          </div>
        </div>

        <div style={{ padding: '1.1rem', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#EFF6FF', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
            <i className="fas fa-gift" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Free Onboarding</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 900, color: '#0284c7', marginTop: '2px' }}>
              {stats.freeTrialActive}
            </div>
          </div>
        </div>

        <div style={{ padding: '1.1rem', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
            <i className="fas fa-wallet" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Wallet Balance</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>
              GH₵ {stats.totalWalletBal.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ padding: '1.1rem', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
            <i className="fas fa-lock" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Frozen Accounts</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 900, color: '#EF4444', marginTop: '2px' }}>
              {stats.insufficient}
            </div>
          </div>
        </div>

        <div style={{ padding: '1.1rem', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#F5F3FF', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
            <i className="fas fa-shield-halved" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 800, textTransform: 'uppercase' }}>Exempted</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 900, color: '#7c3aed', marginTop: '2px' }}>
              {stats.exemptCount}
            </div>
          </div>
        </div>

      </div>

      {/* ── TERM SUBSCRIPTION REVENUE ANALYTICS DASHBOARD ───────────────────────── */}
      <div style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '20px', padding: '1.4rem 1.6rem', boxShadow: '0 8px 30px rgba(9,9,11,0.15)', display: 'flex', flexDirection: 'column', gap: '1.1rem', color: '#FFFFFF' }}>
        
        {/* Header & Term Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 900, color: '#FFFFFF', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-coins" style={{ color: '#2563eb' }} /> Term Revenue Analytics
            </h3>
            <p style={{ color: '#A1A1AA', fontSize: '0.82rem', margin: '2px 0 0' }}>
              Billed, collected, and outstanding revenue summary for the selected term.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#A1A1AA' }}>Term:</label>
            <select
              value={selectedRevenueTerm}
              onChange={(e) => setSelectedRevenueTerm(e.target.value)}
              style={{ padding: '0.5rem 0.85rem', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#FFFFFF', fontWeight: 800, fontSize: '0.82rem', outline: 'none', cursor: 'pointer' }}
            >
              <option value="Term 1 (2025/2026)" style={{ background: '#09090b', color: '#fff' }}>Term 1 (2025/2026)</option>
              <option value="Term 2 (2025/2026)" style={{ background: '#09090b', color: '#fff' }}>Term 2 (2025/2026)</option>
              <option value="Term 3 (2025/2026)" style={{ background: '#09090b', color: '#fff' }}>Term 3 (2025/2026)</option>
              <option value="all" style={{ background: '#09090b', color: '#fff' }}>All Terms Cumulative</option>
            </select>

            <button
              onClick={handleExportRevenueCSV}
              style={{ padding: '0.5rem 0.9rem', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Export detailed revenue CSV report for selected term"
            >
              <i className="fas fa-file-download" style={{ color: '#2563eb' }} /> Revenue Report CSV
            </button>
          </div>
        </div>

        {/* 4 Term Revenue KPI Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
          
          {/* Total Billed Revenue */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 800, textTransform: 'uppercase' }}>Total Billed</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 900, color: '#FFFFFF', marginTop: '2px' }}>
              GH₵ {termRevenueAnalytics.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Realized Collected Revenue */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 800, textTransform: 'uppercase' }}>Collected</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>
              GH₵ {termRevenueAnalytics.totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Outstanding Receivables */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#EF4444', fontWeight: 800, textTransform: 'uppercase' }}>Outstanding</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 900, color: '#EF4444', marginTop: '2px' }}>
              GH₵ {termRevenueAnalytics.totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Realization Rate */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(37, 99, 235, 0.3)', borderRadius: '12px', padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase' }}>Realization Rate</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 900, color: '#60a5fa', marginTop: '2px' }}>
              {termRevenueAnalytics.collectionRate.toFixed(1)} %
            </div>
          </div>

        </div>

        {/* School Category Breakdown Pills */}
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#A1A1AA', textTransform: 'uppercase' }}>Category Breakdown:</span>
          
          {Object.entries(termRevenueAnalytics.categoryBreakdown).map(([cat, data]) => (
            <div key={cat} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#A1A1AA', fontWeight: 700 }}>{cat}:</span>
              <strong style={{ color: '#FFFFFF', fontWeight: 900 }}>GH₵ {data.collected.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              <span style={{ color: '#71717a', fontSize: '0.7rem' }}>({data.paidCount}/{data.schoolsCount} paid)</span>
            </div>
          ))}
        </div>

      </div>

      {/* ── TOP NAV TAB CONTROLS ────────────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '20px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1rem' }}>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('matrix')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '10px',
                background: activeTab === 'matrix' ? '#09090b' : '#FAFAFA',
                border: activeTab === 'matrix' ? '1px solid #09090b' : '1px solid #E4E4E7',
                color: activeTab === 'matrix' ? '#FFFFFF' : '#71717a',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-table-cells-large" style={{ color: activeTab === 'matrix' ? '#2563eb' : '#71717a' }} />
              Subscription Matrix ({filteredSchools.length})
            </button>

            <button
              onClick={() => setActiveTab('transactions')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '10px',
                background: activeTab === 'transactions' ? '#09090b' : '#FAFAFA',
                border: activeTab === 'transactions' ? '1px solid #09090b' : '1px solid #E4E4E7',
                color: activeTab === 'transactions' ? '#FFFFFF' : '#71717a',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-money-bill-transfer" style={{ color: activeTab === 'transactions' ? '#2563eb' : '#71717a' }} />
              Transactions Ledger ({stats.totalTransactionsCount})
            </button>

            <button
              onClick={() => setActiveTab('pricing_cycles')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '10px',
                background: activeTab === 'pricing_cycles' ? '#09090b' : '#FAFAFA',
                border: activeTab === 'pricing_cycles' ? '1px solid #09090b' : '1px solid #E4E4E7',
                color: activeTab === 'pricing_cycles' ? '#FFFFFF' : '#71717a',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-sliders" style={{ color: activeTab === 'pricing_cycles' ? '#2563eb' : '#71717a' }} />
              Term Billing Controls
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '10px',
                background: activeTab === 'audit' ? '#09090b' : '#FAFAFA',
                border: activeTab === 'audit' ? '1px solid #09090b' : '1px solid #E4E4E7',
                color: activeTab === 'audit' ? '#FFFFFF' : '#71717a',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <i className="fas fa-shield-halved" style={{ color: activeTab === 'audit' ? '#2563eb' : '#71717a' }} />
              Audit Logs ({auditLogs.length})
            </button>
          </div>

        </div>

        {/* ── TAB 1: ALL SCHOOLS SUBSCRIPTION MATRIX & STATUS MONITOR ───────────── */}
        {activeTab === 'matrix' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Filter Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: '#FAFAFA', padding: '1rem', borderRadius: '14px', border: '1px solid #E4E4E7' }}>
              
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', flex: '1 1 300px' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
                  <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA' }} />
                  <input
                    type="text"
                    placeholder="Search school name, ID, region..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.85rem 0.55rem 2.2rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', outline: 'none', fontWeight: 600 }}
                >
                  <option value="all">All Categories</option>
                  <option value="Private">Private Schools</option>
                  <option value="GES">GES / Government</option>
                  <option value="International">International</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', outline: 'none', fontWeight: 600 }}
                >
                  <option value="name">Sort: School Name</option>
                  <option value="learners">Sort: Learners Count</option>
                  <option value="balance">Sort: Wallet Balance</option>
                  <option value="category">Sort: Category</option>
                </select>
              </div>

              {/* Quick Status Filter Pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setFilterStatus('all')}
                  style={{ padding: '0.4rem 0.85rem', borderRadius: '999px', background: filterStatus === 'all' ? '#09090b' : '#FFFFFF', border: '1px solid', borderColor: filterStatus === 'all' ? '#09090b' : '#E4E4E7', color: filterStatus === 'all' ? '#FFFFFF' : '#71717a', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  All ({schools.length})
                </button>
                <button
                  onClick={() => setFilterStatus('free_trial')}
                  style={{ padding: '0.4rem 0.85rem', borderRadius: '999px', background: filterStatus === 'free_trial' ? '#EFF6FF' : '#FFFFFF', border: '1px solid', borderColor: filterStatus === 'free_trial' ? '#2563eb' : '#E4E4E7', color: filterStatus === 'free_trial' ? '#2563eb' : '#71717a', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  🎁 Free Term ({stats.freeTrialActive})
                </button>
                <button
                  onClick={() => setFilterStatus('healthy')}
                  style={{ padding: '0.4rem 0.85rem', borderRadius: '999px', background: filterStatus === 'healthy' ? '#ECFDF5' : '#FFFFFF', border: '1px solid', borderColor: filterStatus === 'healthy' ? '#10B981' : '#E4E4E7', color: filterStatus === 'healthy' ? '#10B981' : '#71717a', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  🟢 Active ({stats.healthy})
                </button>
                <button
                  onClick={() => setFilterStatus('insufficient')}
                  style={{ padding: '0.4rem 0.85rem', borderRadius: '999px', background: filterStatus === 'insufficient' ? '#FEF2F2' : '#FFFFFF', border: '1px solid', borderColor: filterStatus === 'insufficient' ? '#EF4444' : '#E4E4E7', color: filterStatus === 'insufficient' ? '#EF4444' : '#71717a', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  🔴 Frozen ({stats.insufficient})
                </button>
                <button
                  onClick={() => setFilterStatus('exempt')}
                  style={{ padding: '0.4rem 0.85rem', borderRadius: '999px', background: filterStatus === 'exempt' ? '#F5F3FF' : '#FFFFFF', border: '1px solid', borderColor: filterStatus === 'exempt' ? '#7c3aed' : '#E4E4E7', color: filterStatus === 'exempt' ? '#7c3aed' : '#71717a', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  🛡️ Exempt ({stats.exemptCount})
                </button>
              </div>

            </div>

            {/* View Switcher & Matrix View */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.25rem 0' }}>
              <div style={{ fontSize: '0.85rem', color: '#71717a', fontWeight: 700 }}>
                Showing <strong style={{ color: '#09090b' }}>{filteredSchools.length}</strong> school subscription card{filteredSchools.length === 1 ? '' : 's'}
              </div>

              <div style={{ display: 'flex', gap: '4px', background: '#FAFAFA', padding: '3px', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
                <button
                  type="button"
                  onClick={() => setMatrixViewMode('cards')}
                  style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: matrixViewMode === 'cards' ? '#09090b' : 'transparent', border: 'none', color: matrixViewMode === 'cards' ? '#FFFFFF' : '#71717a', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <i className="fas fa-th-large" /> Cards View
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixViewMode('table')}
                  style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: matrixViewMode === 'table' ? '#09090b' : 'transparent', border: 'none', color: matrixViewMode === 'table' ? '#FFFFFF' : '#71717a', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <i className="fas fa-list" /> Table View
                </button>
              </div>
            </div>

            {/* CARD GRID FORMAT VIEW */}
            {matrixViewMode === 'cards' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '1.25rem' }}>
                {filteredSchools.length > 0 ? (
                  filteredSchools.map((school) => {
                    const { rate, isOverride } = getSchoolEffectiveRate(school);
                    const reqAmount = (school.learners_count || 0) * rate;
                    const bal = schoolWalletLedgerMap.get(String(school.id)) ?? Number(school.wallet_balance || 0);

                    const isFirstTermFree = Boolean(school.is_first_term_free ?? true);
                    const firstTermFreeTerminated = Boolean(school.first_term_free_terminated ?? false);
                    const isTrialActive = isFirstTermFree && !firstTermFreeTerminated;
                    const isExempt = school.subscription_exempt_until && new Date(school.subscription_exempt_until) >= new Date();

                    const termInfo = getSchoolRunningTermStatus(school);
                    const isUnlocked = isTrialActive || isExempt || bal >= reqAmount || termInfo.statusKey === 'paid' || termInfo.statusKey === 'sufficient';
                    const hasOutstanding = !isTrialActive && !isExempt && termInfo.statusKey !== 'paid' && bal < reqAmount;

                    return (
                      <div
                        key={school.id}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E4E4E7',
                          borderRadius: '20px',
                          padding: '1.35rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Top Accent Strip */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: termInfo.badgeColor }} />

                        {/* Card Header: School Name, Running Term & Status Banner */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <div>
                              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 900, color: '#09090b', margin: 0, lineHeight: 1.25 }}>
                                {school.name}
                              </h3>
                              <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <code style={{ background: '#F4F4F5', padding: '0.15rem 0.5rem', borderRadius: '4px', color: '#2563eb', fontWeight: 800 }}>{school.id}</code>
                                <span>• {school.region || school.district || 'Ghana Basic'}</span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <span style={{ padding: '0.25rem 0.65rem', borderRadius: '8px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.73rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                {school.school_category || school.school_type || 'Private'}
                              </span>

                              {/* Running Term Badge */}
                              <span style={{ padding: '0.2rem 0.65rem', borderRadius: '6px', background: '#EFF6FF', border: '1px solid #DBEAFE', color: '#2563eb', fontSize: '0.73rem', fontWeight: 800, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i className="fas fa-calendar-alt" /> {termInfo.termDisplay}
                              </span>
                            </div>
                          </div>

                          {/* Term Subscription Status Banner */}
                          <div style={{ marginTop: '0.2rem', background: termInfo.badgeBg, border: `1px solid ${termInfo.badgeColor}`, color: termInfo.badgeColor, padding: '0.5rem 0.9rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', lineHeight: 1.3 }}>
                            <i className={`fas ${termInfo.icon}`} style={{ fontSize: '0.9rem' }} />
                            <span>{termInfo.statusText}</span>
                          </div>
                        </div>

                        {/* Card Body: Metrics Grid (2x2) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#FAFAFA', padding: '0.95rem', borderRadius: '14px', border: '1px solid #E4E4E7' }}>
                          
                          {/* Active Learners */}
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 800 }}>Active Learners</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 900, color: '#09090b', marginTop: '2px' }}>
                              {school.learners_count || 0}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#71717a' }}>
                              GH₵ {rate.toFixed(2)}/learner {isOverride && <span style={{ color: '#2563eb', fontWeight: 800 }}>(Custom)</span>}
                            </div>
                          </div>

                          {/* Term Fee Required */}
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 800 }}>Term Fee</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 900, color: isTrialActive ? '#2563eb' : '#09090b', marginTop: '2px' }}>
                              {isTrialActive ? 'GH₵ 0.00' : `GH₵ ${reqAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                            </div>
                          </div>

                          {/* Wallet Balance */}
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 800 }}>Wallet Balance</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 900, color: isUnlocked ? '#10B981' : '#EF4444', marginTop: '2px' }}>
                              GH₵ {bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                          </div>

                          {/* Outstanding Balance */}
                          <div>
                            <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 800 }}>Outstanding</div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 900, color: hasOutstanding ? '#EF4444' : '#10B981', marginTop: '2px' }}>
                              {hasOutstanding
                                ? `GH₵ ${(reqAmount - bal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                : 'GH₵ 0.00'}
                            </div>
                          </div>

                        </div>

                        {/* Access Entitlement Chip */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.75rem', fontWeight: 700 }}>
                          {isUnlocked ? (
                            <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', background: '#ECFDF5', border: '1px solid #D1FAE5', color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <i className="fas fa-check" /> Reports Unlocked &amp; Available
                            </span>
                          ) : (
                            <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <i className="fas fa-lock" /> Reports Frozen (Deposit Due)
                            </span>
                          )}
                        </div>

                        {/* Card Action Buttons Footer */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '0.25rem', paddingTop: '0.75rem', borderTop: '1px solid #E4E4E7', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenTopUp(school)}
                            style={{ flex: '1 1 120px', padding: '0.55rem 0.75rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                          >
                            <i className="fas fa-plus-circle" style={{ color: '#2563eb' }} /> Top Up
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleSchoolExemption(school)}
                            style={{
                              flex: '1 1 120px',
                              padding: '0.55rem 0.75rem',
                              borderRadius: '10px',
                              background: '#FFFFFF',
                              border: '1px solid #E4E4E7',
                              color: isExempt ? '#7c3aed' : '#18181b',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px'
                            }}
                          >
                            <i className="fas fa-shield-alt" style={{ color: isExempt ? '#7c3aed' : '#71717a' }} />
                            {isExempt ? 'Revoke Exemption' : 'Exempt (Waive)'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenConfig(school)}
                            style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
                            title="Configure rate override and category"
                          >
                            <i className="fas fa-cog" style={{ color: '#71717a' }} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenBillsHistory(school)}
                            style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
                            title="View term bill snapshots"
                          >
                            <i className="fas fa-history" style={{ color: '#2563eb' }} />
                          </button>
                        </div>

                      </div>
                    );
                  })
                ) : (
                  <div style={{ gridColumn: '1 / -1', padding: '4rem', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
                    <i className="fas fa-filter" style={{ fontSize: '2rem', color: '#A1A1AA', marginBottom: '0.75rem' }} />
                    <h3 style={{ color: '#09090b', margin: '0 0 0.5rem', fontWeight: 800 }}>No Schools Match Filters</h3>
                    <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>Try clearing your search term or selecting a different status filter.</p>
                  </div>
                )}
              </div>
            )}

            {/* TABLE FORMAT VIEW */}
            {matrixViewMode === 'table' && (
              <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E4E7', color: '#71717a', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th style={{ padding: '0.9rem 1rem', fontWeight: 800 }}>School Profile</th>
                      <th style={{ padding: '0.9rem 1rem', fontWeight: 800 }}>Category</th>
                      <th style={{ padding: '0.9rem 1rem', fontWeight: 800 }}>Learners &amp; Rate</th>
                      <th style={{ padding: '0.9rem 1rem', fontWeight: 800 }}>Term Dues</th>
                      <th style={{ padding: '0.9rem 1rem', fontWeight: 800 }}>Wallet Balance</th>
                      <th style={{ padding: '0.9rem 1rem', fontWeight: 800 }}>Subscription Status</th>
                      <th style={{ padding: '0.9rem 1rem', fontWeight: 800 }}>Reports Access</th>
                      <th style={{ padding: '0.9rem 1rem', textAlign: 'right', fontWeight: 800 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchools.length > 0 ? (
                      filteredSchools.map((school) => {
                        const { rate, isOverride } = getSchoolEffectiveRate(school);
                        const reqAmount = (school.learners_count || 0) * rate;
                        const bal = schoolWalletLedgerMap.get(String(school.id)) ?? Number(school.wallet_balance || 0);

                        const isFirstTermFree = Boolean(school.is_first_term_free ?? true);
                        const firstTermFreeTerminated = Boolean(school.first_term_free_terminated ?? false);
                        const isTrialActive = isFirstTermFree && !firstTermFreeTerminated;
                        const isExempt = school.subscription_exempt_until && new Date(school.subscription_exempt_until) >= new Date();

                        const termInfo = getSchoolRunningTermStatus(school);
                        const isUnlocked = isTrialActive || isExempt || bal >= reqAmount || termInfo.statusKey === 'paid' || termInfo.statusKey === 'sufficient';
                        const hasOutstanding = !isTrialActive && !isExempt && termInfo.statusKey !== 'paid' && bal < reqAmount;

                        return (
                          <tr key={school.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.92rem' }}>{school.name}</div>
                              <div style={{ fontSize: '0.73rem', color: '#71717a', marginTop: '2px', display: 'flex', gap: '8px' }}>
                                <code style={{ color: '#2563eb' }}>ID: {school.id}</code>
                                <span>• {school.region || school.district || 'Ghana Basic'}</span>
                              </div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.78rem', fontWeight: 700 }}>
                                {school.school_category || school.school_type || 'Private'}
                              </span>
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 800, color: '#09090b' }}>
                                {school.learners_count || 0} <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 500 }}>Learners</span>
                              </div>
                              <div style={{ fontSize: '0.73rem', color: '#71717a', marginTop: '2px' }}>
                                GH₵ {rate.toFixed(2)}/learner {isOverride && <span style={{ color: '#2563eb', fontWeight: 800 }}>(Custom)</span>}
                              </div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: isTrialActive ? '#2563eb' : '#09090b' }}>
                              {isTrialActive ? (
                                <div>GH₵ 0.00 <span style={{ fontSize: '0.72rem', color: '#2563eb' }}>(Waived)</span></div>
                              ) : (
                                <div>GH₵ {reqAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1rem', fontWeight: 900, color: isUnlocked ? '#10B981' : '#EF4444' }}>
                                GH₵ {bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </div>
                              {hasOutstanding && (
                                <div style={{ fontSize: '0.72rem', color: '#EF4444', fontWeight: 700, marginTop: '2px' }}>
                                  Short: GH₵ {(reqAmount - bal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              {isExempt ? (
                                <span style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', background: '#F5F3FF', color: '#7c3aed', fontSize: '0.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #DDD6FE' }}>
                                  <i className="fas fa-shield-halved" /> EXEMPT UNTIL {new Date(school.subscription_exempt_until).toLocaleDateString()}
                                </span>
                              ) : isTrialActive ? (
                                <span style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', background: '#EFF6FF', color: '#2563eb', fontSize: '0.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #DBEAFE' }}>
                                  🎁 FREE ONBOARDING TERM
                                </span>
                              ) : isUnlocked ? (
                                <span style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', background: '#ECFDF5', color: '#10B981', fontSize: '0.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #D1FAE5' }}>
                                  🟢 ACTIVE &amp; UNLOCKED
                                </span>
                              ) : (
                                <span style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', background: '#FEF2F2', color: '#EF4444', fontSize: '0.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #FEE2E2' }}>
                                  🔴 INSUFFICIENT / FROZEN
                                </span>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              {isUnlocked ? (
                                <div style={{ color: '#10B981', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <i className="fas fa-check-circle" /> Reports Available
                                </div>
                              ) : (
                                <div style={{ color: '#EF4444', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <i className="fas fa-lock" /> Reports &amp; Cards Frozen
                                </div>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => handleOpenTopUp(school)}
                                  style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', background: '#09090b', border: 'none', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Top Up
                                </button>
                                <button
                                  onClick={() => handleOpenBillsHistory(school)}
                                  style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#09090b', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Bills
                                </button>
                                <button
                                  onClick={() => handleOpenConfig(school)}
                                  style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#71717a', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Config
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#71717a' }}>
                          No schools matching the selected subscription filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* ── TAB 2: TRANSACTIONS & FINANCIAL LEDGER ──────────────────────────── */}
        {activeTab === 'transactions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#09090b' }}>
                All Platform Wallet Transactions &amp; Paystack Online Payments
              </h3>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search school, ref, description..."
                  value={txSearchTerm}
                  onChange={(e) => setTxSearchTerm(e.target.value)}
                  style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', outline: 'none' }}
                />
                <select
                  value={txTypeFilter}
                  onChange={(e) => setTxTypeFilter(e.target.value)}
                  style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.85rem', outline: 'none', fontWeight: 600 }}
                >
                  <option value="all">All Transaction Types</option>
                  <option value="CREDIT">Top-Ups (Credits)</option>
                  <option value="DEBIT">Subscriptions (Debits)</option>
                  <option value="paystack">Paystack Online</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#18181b' }}>
                <thead>
                  <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left', color: '#71717a', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Date &amp; Time</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>School Name</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Transaction Type</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Amount</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Wallet Trail (Before ➔ After)</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Reference</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Description / By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((tx) => {
                      const isCredit = tx.transaction_type === 'CREDIT' || tx.type === 'CREDIT' || (Number(tx.amount || 0) > 0 && !tx.description?.toLowerCase().includes('debit'));
                      const schoolName = tx._schoolName || 'Unknown School';
                      const isPaystack = tx._source === 'paystack';
                      
                      return (
                        <tr key={tx.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                          <td style={{ padding: '0.85rem 1rem', color: '#71717a', whiteSpace: 'nowrap' }}>
                            {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: '#09090b' }}>
                            {schoolName}
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {isCredit ? (
                                <span style={{ padding: '0.25rem 0.65rem', borderRadius: '999px', background: '#ECFDF5', color: '#10B981', fontSize: '0.72rem', fontWeight: 800, border: '1px solid #D1FAE5' }}>
                                  <i className="fas fa-arrow-down" style={{ marginRight: '4px' }} /> TOP-UP / CREDIT
                                </span>
                              ) : (
                                <span style={{ padding: '0.25rem 0.65rem', borderRadius: '999px', background: '#EFF6FF', color: '#2563eb', fontSize: '0.72rem', fontWeight: 800, border: '1px solid #DBEAFE' }}>
                                  <i className="fas fa-arrow-up" style={{ marginRight: '4px' }} /> SUBSCRIPTION / DEBIT
                                </span>
                              )}
                              {isPaystack && (
                                <span style={{ padding: '0.15rem 0.45rem', borderRadius: '999px', background: '#F5F3FF', color: '#7c3aed', fontSize: '0.65rem', fontWeight: 700, border: '1px solid #DDD6FE' }}>
                                  PAYSTACK
                                </span>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontWeight: 900, color: isCredit ? '#10B981' : '#2563eb', fontSize: '0.95rem' }}>
                            {isCredit ? '+' : '-'} GH₵ {Number(tx.amount || 0).toLocaleString()}
                          </td>

                          <td style={{ padding: '0.85rem 1rem', color: '#18181b', fontSize: '0.8rem' }}>
                            {tx.balance_before != null && tx.balance_after != null ? (
                              <>GH₵ {Number(tx.balance_before).toLocaleString()} ➔ <strong style={{ color: '#09090b' }}>GH₵ {Number(tx.balance_after).toLocaleString()}</strong></>
                            ) : (
                              <span style={{ color: '#71717a', fontStyle: 'italic' }}>—</span>
                            )}
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <code style={{ background: '#FAFAFA', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#2563eb', fontSize: '0.75rem', border: '1px solid #E4E4E7' }}>
                              {tx.reference || 'N/A'}
                            </code>
                          </td>

                          <td style={{ padding: '0.85rem 1rem', color: '#71717a' }}>
                            <div>{tx.description || 'Wallet Transaction'}</div>
                            {tx.created_by && <div style={{ fontSize: '0.72rem', color: '#71717a' }}>By: {tx.created_by}</div>}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#71717a' }}>
                        No financial transactions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: PRICING CONTROLS & TERM BILLING CYCLES ─────────────────────── */}
        {activeTab === 'pricing_cycles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* LABOUR ADMIN TERM BILLING CYCLE CONTROL CARD */}
            <div style={{ padding: '1.5rem', borderRadius: '20px', background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 900, color: '#09090b', margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-play-circle" style={{ color: '#2563eb' }} /> Labour Admin Term Billing Trigger
                  </h3>
                  <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>
                    Initiate a new term billing cycle. Generates immutable billing snapshots for all eligible schools based on their active learner count.
                  </p>
                </div>
              </div>

              <form onSubmit={handleStartTermBilling} style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', background: '#FAFAFA', padding: '1.1rem', borderRadius: '14px', border: '1px solid #E4E4E7' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>Academic Year</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2025/2026"
                    value={cycleYear}
                    onChange={(e) => setCycleYear(e.target.value)}
                    style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>

                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>Term</label>
                  <select
                    value={cycleTerm}
                    onChange={(e) => setCycleTerm(e.target.value)}
                    style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.9rem', outline: 'none', fontWeight: 600 }}
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>

                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>Payment Deadline</label>
                  <input
                    type="date"
                    required
                    value={cycleDeadline}
                    onChange={(e) => setCycleDeadline(e.target.value)}
                    style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
                  <button
                    type="submit"
                    disabled={startingCycle}
                    style={{
                      padding: '0.75rem 1.4rem',
                      borderRadius: '10px',
                      background: '#09090b',
                      border: 'none',
                      color: 'white',
                      fontWeight: 900,
                      fontSize: '0.9rem',
                      cursor: startingCycle ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(9,9,11,0.2)'
                    }}
                  >
                    {startingCycle ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-bolt" style={{ color: '#2563eb' }} />}
                    START TERM BILLING
                  </button>

                  <button
                    type="button"
                    disabled={startingCycle}
                    onClick={() => handleRevertTermBillingCycle(cycleYear, cycleTerm)}
                    style={{
                      padding: '0.75rem 1.4rem',
                      borderRadius: '10px',
                      background: '#FEF2F2',
                      border: '1px solid #FEE2E2',
                      color: '#EF4444',
                      fontWeight: 900,
                      fontSize: '0.9rem',
                      cursor: startingCycle ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    title="Revert/cancel billing trigger for the selected year and term to adjust exemptions or re-trigger"
                  >
                    <i className="fas fa-undo" />
                    REVERT BILLING TRIGGER
                  </button>
                </div>
              </form>

              {cycleMsg && (
                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.85rem', background: cycleMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2', border: cycleMsg.type === 'success' ? '1px solid #D1FAE5' : '1px solid #FEE2E2', color: cycleMsg.type === 'success' ? '#10B981' : '#EF4444' }}>
                  {cycleMsg.text}
                </div>
              )}

              {/* ACTIVE BILLING CYCLES LIST WITH REVERT ACTIONS */}
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid #E4E4E7', paddingTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.75rem', color: '#09090b', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-list-alt" style={{ color: '#2563eb' }} /> Active Billing Cycles History &amp; Revert Controls
                </h4>

                {billingCycles.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
                    {billingCycles.map((cycle) => (
                      <div key={cycle.id || `${cycle.academic_year}-${cycle.term}`} style={{ background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <div>
                          <strong style={{ color: '#09090b', fontSize: '0.9rem', display: 'block' }}>{cycle.academic_year} — {cycle.term}</strong>
                          <span style={{ fontSize: '0.73rem', color: '#71717a' }}>
                            Deadline: {cycle.billing_deadline ? new Date(cycle.billing_deadline).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRevertTermBillingCycle(cycle.academic_year, cycle.term)}
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#EF4444', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          title={`Revert ${cycle.academic_year} ${cycle.term} billing trigger`}
                        >
                          <i className="fas fa-undo" /> Revert
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#71717a' }}>No active billing cycles recorded yet.</div>
                )}
              </div>
            </div>

            {/* GLOBAL CATEGORY PRICING CONTROL CARD */}
            <div style={{ padding: '1.5rem', borderRadius: '20px', background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 900, color: '#09090b', margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-tags" style={{ color: '#2563eb' }} /> Global Category Base Pricing Control
                  </h3>
                  <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>
                    Set the per-learner rate for any school category. Updating a category automatically applies to all schools in that group.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {CATEGORY_OPTIONS.map(cat => {
                    const pObj = pricing.find(p => p.school_category?.toLowerCase() === cat.id.toLowerCase());
                    const currentRate = pObj ? Number(pObj.amount_per_learner) : 5.00;
                    return (
                      <div key={cat.id} style={{ background: '#FAFAFA', border: '1px solid #E4E4E7', padding: '0.4rem 0.85rem', borderRadius: '10px', fontSize: '0.78rem' }}>
                        <span style={{ color: '#71717a', fontWeight: 600 }}>{cat.id}: </span>
                        <strong style={{ color: '#09090b', fontWeight: 900 }}>GH₵ {currentRate.toFixed(2)}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleSaveCategoryPricing} style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', background: '#FAFAFA', padding: '1rem', borderRadius: '14px', border: '1px solid #E4E4E7' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>Select School Category</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategorySelectChange(e.target.value)}
                    style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.9rem', outline: 'none' }}
                  >
                    {CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>

                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>Base Per-Learner Rate (GH₵)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#2563eb', fontWeight: 800, fontSize: '0.85rem' }}>GH₵</span>
                    <input
                      type="number"
                      step="0.10"
                      min="0"
                      required
                      placeholder="5.00"
                      value={categoryPriceInput}
                      onChange={(e) => setCategoryPriceInput(e.target.value)}
                      style={{ width: '100%', padding: '0.7rem 0.85rem 0.7rem 2.8rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#18181b', fontSize: '0.95rem', fontWeight: 800, outline: 'none' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingCategoryPrice}
                  style={{
                    padding: '0.75rem 1.75rem',
                    borderRadius: '10px',
                    background: '#09090b',
                    border: 'none',
                    color: 'white',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    cursor: savingCategoryPrice ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(9,9,11,0.2)',
                    flexShrink: 0
                  }}
                >
                  {savingCategoryPrice ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                  Save Rate
                </button>
              </form>
            </div>

          </div>
        )}

        {/* ── TAB 4: AUDIT LOGS ─────────────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <div style={{ overflowX: 'auto', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', color: '#18181b' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left', color: '#71717a', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Timestamp</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>School Name / ID</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Event</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 800 }}>Performed By</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                    <td style={{ padding: '0.85rem 1rem', color: '#71717a' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: '#09090b' }}>{schoolNameMap[log.school_id] || log.school_id}</td>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#2563eb' }}>{log.event}</td>
                    <td style={{ padding: '0.85rem 1rem', color: '#71717a' }}>{log.performed_by || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ── MODALS (TopUp, Config, Bills History) ─────────────────────────── */}

      {/* 1. TOP UP MODAL */}
      {modalType === 'topup' && selectedSchool && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '450px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#09090b', fontFamily: 'Outfit, sans-serif', fontWeight: 800 }}>Manual Admin Top Up — {selectedSchool.name}</h3>
            <form onSubmit={handleSaveTopUp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '4px', fontWeight: 700 }}>Amount (GH₵)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '4px', fontWeight: 700 }}>Reference</label>
                <input
                  type="text"
                  required
                  value={topUpRef}
                  onChange={(e) => setTopUpRef(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
                <button type="button" onClick={() => setModalType(null)} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#71717a', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Depositing...' : 'Confirm Top Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. SCHOOL CONFIG MODAL */}
      {modalType === 'config' && selectedSchool && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '450px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#09090b', fontFamily: 'Outfit, sans-serif', fontWeight: 800 }}>Configure School — {selectedSchool.name}</h3>
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '4px', fontWeight: 700 }}>Category</label>
                <select
                  value={categoryForm}
                  onChange={(e) => setCategoryForm(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}
                >
                  {CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#09090b', marginBottom: '4px', fontWeight: 700 }}>Custom Override Rate (GH₵ per learner)</label>
                <input
                  type="number"
                  step="0.10"
                  placeholder="Leave empty for category default"
                  value={overrideRateForm}
                  onChange={(e) => setOverrideRateForm(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#18181b', outline: 'none' }}
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => handleToggleFreeTrial(selectedSchool)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', background: selectedSchool.first_term_free_terminated ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${selectedSchool.first_term_free_terminated ? '#D1FAE5' : '#FEE2E2'}`, color: selectedSchool.first_term_free_terminated ? '#10B981' : '#EF4444', fontWeight: 800, cursor: 'pointer' }}
                >
                  {selectedSchool.first_term_free_terminated ? 'Restore Free Onboarding Term' : 'Terminate Free Onboarding Term'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1rem' }}>
                <button type="button" onClick={() => setModalType(null)} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#71717a', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. SCHOOL BILLING & SUBSCRIPTION HISTORY MODAL */}
      {modalType === 'bills_history' && selectedSchool && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid #E4E4E7', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#09090b', fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 900 }}>
                  Billing &amp; Subscription History
                </h3>
                <div style={{ color: '#2563eb', fontSize: '0.9rem', fontWeight: 700, marginTop: '2px' }}>
                  {selectedSchool.name} <span style={{ color: '#71717a', fontWeight: 400 }}>({selectedSchool.id})</span>
                </div>
              </div>
              <button
                onClick={() => setModalType(null)}
                style={{ background: 'transparent', border: 'none', color: '#71717a', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {loadingBills ? (
              <div style={{ padding: '1rem 0' }}>
                <LogoPreloader fullScreen={false} size="sm" />
              </div>
            ) : schoolBills.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {schoolBills.map((bill) => (
                  <div key={bill.id} style={{ background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ color: '#09090b', fontSize: '0.95rem' }}>{bill.academic_year} — {bill.term}</strong>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: bill.status === 'PAID' ? '#ECFDF5' : bill.status === 'APPROVED' ? '#EFF6FF' : '#FEF2F2',
                        color: bill.status === 'PAID' ? '#10B981' : bill.status === 'APPROVED' ? '#2563eb' : '#EF4444',
                        border: `1px solid ${bill.status === 'PAID' ? '#D1FAE5' : bill.status === 'APPROVED' ? '#DBEAFE' : '#FEE2E2'}`
                      }}>
                        {bill.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', color: '#71717a', marginTop: '8px' }}>
                      <div>Learners Count: <strong style={{ color: '#09090b' }}>{bill.active_learner_count}</strong></div>
                      <div>Rate / Learner: <strong style={{ color: '#09090b' }}>GH₵ {bill.rate_per_learner}</strong></div>
                      <div>Total Bill Amount: <strong style={{ color: '#2563eb' }}>GH₵ {Number(bill.total_amount || 0).toFixed(2)}</strong></div>
                      <div>Created At: <strong style={{ color: '#18181b' }}>{new Date(bill.created_at).toLocaleDateString()}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#71717a' }}>
                No generated term bills found for this school yet.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => setModalType(null)}
                style={{ padding: '0.55rem 1.25rem', borderRadius: '10px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default OperationsSubscriptions;
