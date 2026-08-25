import { supabase } from '../lib/supabase';
import db from '../lib/db';
import learnerRepository from '../repositories/learnerRepository';

export const GLOBAL_WALLET_RESET_TIMESTAMP = '2026-08-25T21:40:00.000Z';

export function getEffectiveResetTimestamp(schoolId = null) {
  try {
    const schoolReset = schoolId ? localStorage.getItem('wallet_reset_at_' + schoolId) : null;
    const globalReset = localStorage.getItem('platform_global_wallet_reset_at');
    if (schoolReset && globalReset) {
      return new Date(schoolReset) > new Date(globalReset) ? schoolReset : globalReset;
    }
    return schoolReset || globalReset || GLOBAL_WALLET_RESET_TIMESTAMP;
  } catch (_) {
    return GLOBAL_WALLET_RESET_TIMESTAMP;
  }
}

/**
 * Enterprise Service Layer for School Wallet, Subscription & Term Billing System
 */
const subscriptionService = {
  async getSubscriptionStatus(schoolId, academicYear = null, term = null) {
    return await this.getSchoolSubscriptionStatus(schoolId, academicYear, term);
  },

  /**
   * Get dynamic subscription & report entitlement status for a school.
   * The server-side RPC (get_school_subscription_status) is the single
   * authoritative source of truth for billing_status / is_unlocked /
   * reports_locked. We only enrich the response with the local learner
   * count so the UI shows an up-to-date figure without an extra round-trip.
   */
  async getSchoolSubscriptionStatus(schoolId, academicYear = null, term = null) {
    if (!schoolId) return null;
    try {
      // Local learner count from Dexie IndexedDB (fast, offline-capable)
      const activeLearnerCnt = await learnerRepository.getActiveLearnerCount(schoolId).catch(() => 0);

      const { data, error } = await supabase.rpc('get_school_subscription_status', {
        p_school_id:     schoolId,
        p_academic_year: academicYear,
        p_term:          term,
      });

      if (error || !data) {
        console.warn('[subscriptionService] RPC get_school_subscription_status notice:', error);
        return this.getFallbackSubscriptionStatus(schoolId, academicYear, term);
      }

      // Reconcile learner count: prefer local if newer
      const serverLearnerCount  = Number(data.active_learner_count || data.learner_count || 0);
      const effectiveLearnerCount = activeLearnerCnt > 0 ? activeLearnerCnt : serverLearnerCount;

      let walletBal = Number(data.wallet_balance ?? 0);
      const amountDue  = Number(data.amount_due ?? 0);
      const rate       = Number(data.rate_per_learner ?? 5.00);
      const isUnlocked = Boolean(data.is_unlocked);

      // Check if school has a local or platform-wide reset timestamp
      const resetAt = getEffectiveResetTimestamp(schoolId);

      // Always fetch authoritative wallet_balance directly from report_schools in Supabase
      if (navigator.onLine) {
        try {
          const { data: schoolDb } = await supabase
            .from('report_schools')
            .select('wallet_balance, is_first_term_free')
            .eq('id', schoolId)
            .maybeSingle();
          if (schoolDb && schoolDb.wallet_balance !== undefined && schoolDb.wallet_balance !== null) {
            walletBal = resetAt ? 0 : Number(schoolDb.wallet_balance);
          }

          // Auto-reconcile: credit all valid non-rejected referral rewards created AFTER reset
          const { data: rawCloudRefs } = await supabase
            .from('report_referrals')
            .select('id, referred_school_id, reward_amount, status, fraud_flag, created_at')
            .eq('referrer_school_id', String(schoolId).trim())
            .neq('status', 'REJECTED');

          const cloudRefs = (rawCloudRefs || []).filter(r => !resetAt || new Date(r.created_at) > new Date(resetAt));

          if (cloudRefs && cloudRefs.length > 0) {
            const { data: existingRefTxs } = await supabase
              .from('wallet_transactions')
              .select('reference')
              .eq('school_id', String(schoolId).trim());

            const existingRefCodes = new Set((existingRefTxs || []).map(t => t.reference));

            for (const ref of cloudRefs) {
              if (ref.fraud_flag || ref.status === 'UNDER_REVIEW') continue;
              if (!ref.id) continue;

              const refYear = ref.created_at ? new Date(ref.created_at).getFullYear() : new Date().getFullYear();
              const refSuffix = String(ref.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
              const refReference = `REF-${refYear}-${refSuffix}`;

              if (!existingRefCodes.has(refReference)) {
                const amount = Number(ref.reward_amount || 20.00);
                const beforeBal = Number(walletBal || 0);
                const afterBal = beforeBal + amount;

                try {
                  const txPayload = {
                    school_id: String(schoolId).trim(),
                    transaction_type: 'CREDIT',
                    currency: 'GHS',
                    amount,
                    balance_before: beforeBal,
                    balance_after: afterBal,
                    reference: refReference,
                    description: 'Referral Reward Credit (+GH₵20.00)',
                    created_by: 'Referral Rewards Engine'
                  };

                  let { error: insertErr } = await supabase.from('wallet_transactions').insert(txPayload);
                  if (insertErr) {
                    try {
                      await supabase.from('platform_wallet_transactions').insert(txPayload);
                    } catch (_) {}
                  }

                  await supabase.from('report_referrals').update({
                    status: 'REWARDED',
                    reward_date: new Date().toISOString()
                  }).eq('id', ref.id);

                  existingRefCodes.add(refReference);
                  walletBal = afterBal;
                } catch (txErr) {
                  console.warn('[subscriptionService] Referral credit operation notice:', txErr.message);
                }
              }
            }
          }

          // Authoritative Reconciled Balance from Sum(Credits) - Sum(Debits) created AFTER reset
          const { data: rawSchoolTxs } = await supabase
            .from('wallet_transactions')
            .select('amount, transaction_type, created_at')
            .eq('school_id', String(schoolId).trim());

          const allSchoolTxs = (rawSchoolTxs || []).filter(t => !resetAt || new Date(t.created_at) > new Date(resetAt));

          if (allSchoolTxs.length > 0) {
            const totalCredits = allSchoolTxs
              .filter(t => (t.transaction_type || '').toUpperCase() === 'CREDIT')
              .reduce((sum, t) => sum + Number(t.amount || 0), 0);
            const totalDebits = allSchoolTxs
              .filter(t => (t.transaction_type || '').toUpperCase() === 'DEBIT')
              .reduce((sum, t) => sum + Number(t.amount || 0), 0);
            const netBalance = Math.max(0, totalCredits - totalDebits);

            walletBal = netBalance;
            try {
              await supabase
                .from('report_schools')
                .update({ wallet_balance: walletBal })
                .eq('id', schoolId);
            } catch (_) {}
          } else if (resetAt) {
            walletBal = 0;
            try {
              await supabase
                .from('report_schools')
                .update({ wallet_balance: 0.00 })
                .eq('id', schoolId);
            } catch (_) {}
          }
        } catch (dbErr) {
          console.warn('[subscriptionService] Direct school wallet_balance fetch notice:', dbErr);
        }
      }

      // Keep local Dexie cache synchronized for instant reactivity across all views
      try {
        const localSchool = await db.schools.get(schoolId).catch(() => null);
        if (localSchool) {
          await db.schools.update(schoolId, {
            wallet_balance: walletBal,
            walletBalance: walletBal,
            is_first_term_free: Boolean(data.is_first_term_free)
          });
        }
      } catch (_) {}

      return {
        ...data,
        // Authoritative entitlement decisions — do NOT override from client-side logic
        is_unlocked:               isUnlocked,
        reports_locked:            Boolean(data.reports_locked),
        billing_status:            data.billing_status || 'UNKNOWN',
        // Enriched / reconciled fields
        wallet_balance:            walletBal,
        wallet_available:          walletBal - Number(data.wallet_reserved || 0),
        learner_count:             effectiveLearnerCount,
        active_learner_count:      effectiveLearnerCount,
        rate_per_learner:          rate,
        required_amount:           amountDue,
        amount_due:                amountDue,
        outstanding_amount:        isUnlocked ? 0 : Math.max(0, amountDue - walletBal),
        // Free-term metadata
        is_first_term_free:        Boolean(data.is_first_term_free),
        is_first_term_free_active: Boolean(data.is_first_term_free),
        is_onboarding_term:        Boolean(data.is_onboarding_term),
        onboarding_year:           data.onboarding_year     || null,
        onboarding_term_label:     data.onboarding_term     || null,
        free_term_reason:          data.free_term_reason    || null,
        resolution_source:         data.resolution_source   || null,
      };
    } catch (err) {
      console.error('[subscriptionService] getSchoolSubscriptionStatus exception:', err);
      return this.getFallbackSubscriptionStatus(schoolId, academicYear, term);
    }
  },

  /**
   * Fallback calculator used when the RPC is unavailable (offline / error).
   * Applies the exact same business rules as the server-side RPC:
   *   - Free term ONLY if the requested year+term matches the school's
   *     onboarding year+term AND within the 16-week window.
   *   - Subsequent terms always require payment.
   */
  async getFallbackSubscriptionStatus(schoolId, academicYear = null, term = null) {
    try {
      let school = null;
      if (navigator.onLine) {
        try {
          const { data } = await supabase
            .from('report_schools')
            .select('*')
            .eq('id', schoolId)
            .single();
          if (data) {
            school = data;
            const localObj = await db.schools.get(schoolId).catch(() => null);
            if (localObj) {
              await db.schools.update(schoolId, {
                per_learner_rate_override: data.per_learner_rate_override,
                wallet_balance:            data.wallet_balance,
                initial_academic_year:     data.initial_academic_year,
                initial_term:              data.initial_term,
                first_term_free_terminated: data.first_term_free_terminated,
              }).catch(() => null);
            }
          }
        } catch (_) {}
      }

      if (!school && schoolId) {
        school = await db.schools.get(schoolId).catch(() => null);
      }

      // ── Resolve the term we're evaluating ────────────────────────────────
      // Priority: explicit param > active billing cycle > school profile > default
      let resolvedYear = academicYear;
      let resolvedTerm = term;
      let resolutionSource = 'EXPLICIT_REQUEST';

      if (!resolvedYear || !resolvedTerm) {
        // Try active billing cycle
        try {
          const { data: cycle } = await supabase
            .from('billing_cycles')
            .select('academic_year, term')
            .eq('status', 'ACTIVE')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (cycle) {
            resolvedYear     = cycle.academic_year;
            resolvedTerm     = cycle.term;
            resolutionSource = 'ACTIVE_BILLING_CYCLE';
          }
        } catch (_) {}
      }

      if (!resolvedYear || !resolvedTerm) {
        // Try active academic calendar
        try {
          const today = new Date().toISOString().split('T')[0];
          const { data: cal } = await supabase
            .from('platform_academic_calendars')
            .select('academic_year, term')
            .eq('is_active', true)
            .lte('start_date', today)
            .gte('end_date', today)
            .order('start_date', { ascending: false })
            .limit(1)
            .single();
          if (cal) {
            resolvedYear     = cal.academic_year;
            resolvedTerm     = cal.term;
            resolutionSource = 'ACTIVE_ACADEMIC_CALENDAR';
          }
        } catch (_) {}
      }

      if (!resolvedYear || !resolvedTerm) {
        resolvedYear     = school?.current_academic_year || school?.currentAcademicYear || '2025/2026';
        resolvedTerm     = school?.current_term || school?.currentTerm || 'Term 1';
        resolutionSource = 'SCHOOL_PROFILE';
      }

      // ── Wallet balance from ledger ────────────────────────────────────────
      let ledgerBalance = null;
      try {
        const resetAt = getEffectiveResetTimestamp(schoolId);
        const { data: rawTxRows } = await supabase
          .from('wallet_transactions')
          .select('balance_after, transaction_type, amount, created_at')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false })
          .limit(100);

        const txRows = (rawTxRows || []).filter(t => !resetAt || new Date(t.created_at) > new Date(resetAt));

        if (txRows && txRows.length > 0) {
          const latestWithBal = txRows.find(
            t => t.balance_after !== null && t.balance_after !== undefined && !isNaN(Number(t.balance_after))
          );
          if (latestWithBal) {
            ledgerBalance = Number(latestWithBal.balance_after);
          } else {
            const credits = txRows.filter(t => (t.transaction_type || '').toUpperCase() === 'CREDIT').reduce((s, t) => s + Number(t.amount || 0), 0);
            const debits  = txRows.filter(t => (t.transaction_type || '').toUpperCase() === 'DEBIT').reduce((s, t)  => s + Number(t.amount || 0), 0);
            ledgerBalance = Math.max(0, credits - debits);
          }
        } else if (resetAt) {
          ledgerBalance = 0;
        }
      } catch (_) {}

      // Fallback reconciliation if ledgerBalance is still null
      if (ledgerBalance === null) {
        try {
          const history = await this.getSchoolTopUpHistory(schoolId);
          if (history && history.length > 0) {
            let net = 0;
            for (const tx of history) {
              net += tx.isDebit ? -Number(tx.amount || 0) : Number(tx.amount || 0);
            }
            if (net > 0) ledgerBalance = Math.max(0, net);
          }
        } catch (_) {}
      }

      const walletBal = ledgerBalance !== null
        ? ledgerBalance
        : Number(school?.wallet_balance ?? school?.walletBalance ?? 0);

      // ── Term bill lookup for the resolved term ────────────────────────────
      let termBill = null;
      try {
        const { data: billData } = await supabase
          .from('school_term_bills')
          .select('id, status, approval_status, amount_due, active_learner_count, rate_per_learner, billing_cycle_id')
          .eq('school_id', schoolId)
          .eq('academic_year', resolvedYear)
          .eq('term', resolvedTerm)
          .limit(1)
          .single();
        if (billData) termBill = billData;
      } catch (_) {}

      // ── Rate ──────────────────────────────────────────────────────────────
      const walletRes  = Number(school?.wallet_reserved || school?.walletReserved || 0);
      const learnerCnt = await learnerRepository.getActiveLearnerCount(schoolId).catch(() => 0);
      const rate       = Number(school?.per_learner_rate_override ?? school?.per_learner_rate ?? school?.ratePerLearner ?? 5.00);
      const reqAmount  = termBill ? Number(termBill.amount_due) : (learnerCnt * rate);

      // ── Admin exemption ───────────────────────────────────────────────────
      const isExempt = school?.subscription_exempt_until &&
                       new Date(school.subscription_exempt_until) >= new Date();

      // ── Free-term evaluation — STRICT onboarding term match ───────────────
      const isFirstTermFreeFlag  = school?.is_first_term_free ?? true;
      const freeTermTerminated   = school?.first_term_free_terminated ?? false;
      const onboardingYear       = school?.initial_academic_year || null;
      const onboardingTerm       = school?.initial_term || null;

      // 16-week guard
      const createdAt        = school?.created_at ? new Date(school.created_at) : new Date();
      const maxFreeUntil     = new Date(createdAt.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
      const withinWindow     = new Date() <= maxFreeUntil;

      // Must be the EXACT onboarding term (case-insensitive, trimmed)
      const isOnboardingTerm = onboardingYear && onboardingTerm
        ? (onboardingYear.trim().toLowerCase() === resolvedYear.trim().toLowerCase() &&
           onboardingTerm.trim().toLowerCase() === resolvedTerm.trim().toLowerCase())
        : true; // no onboarding record yet → grant free term

      const isFirstTermFreeActive =
        isFirstTermFreeFlag &&
        !freeTermTerminated &&
        withinWindow &&
        isOnboardingTerm;

      // ── Paid term bill check ──────────────────────────────────────────────
      const hasPaidTermBill = termBill
        ? (termBill.status === 'PAID' ||
           termBill.status === 'FIRST_TERM_FREE' ||
           termBill.status === 'EXEMPT')
        : false;

      // ── Final entitlement decision ────────────────────────────────────────
      const isSubscribedActive = school?.subscription_status === 'Active' || hasPaidTermBill;
      const isUnlocked         = isFirstTermFreeActive || isExempt || isSubscribedActive || walletBal >= reqAmount;
      const billingStatus      = isFirstTermFreeActive
        ? 'FIRST_TERM_FREE'
        : isExempt
        ? 'EXEMPT'
        : termBill?.status === 'PAID'
        ? 'PAID'
        : (isSubscribedActive || walletBal >= reqAmount)
        ? 'ACTIVE'
        : termBill
        ? (termBill.status || 'AWAITING_APPROVAL')
        : 'NO_BILL';

      return {
        is_unlocked:               isUnlocked,
        billing_status:            billingStatus,
        reports_locked:            !isUnlocked,
        can_view_data:             true,
        can_enter_results:         true,
        can_edit_results:          true,
        can_generate_reports:      isUnlocked,
        can_download_reports:      isUnlocked,
        can_print_reports:         isUnlocked,
        can_export_reports:        isUnlocked,
        wallet_balance:            walletBal,
        wallet_reserved:           walletRes,
        wallet_available:          walletBal - walletRes,
        required_amount:           isFirstTermFreeActive ? 0 : reqAmount,
        amount_due:                isFirstTermFreeActive ? 0 : reqAmount,
        outstanding_amount:        isUnlocked ? 0 : Math.max(0, reqAmount - walletBal),
        learner_count:             learnerCnt,
        active_learner_count:      learnerCnt,
        rate_per_learner:          rate,
        academic_year:             resolvedYear,
        term:                      resolvedTerm,
        resolution_source:         resolutionSource,
        is_exempt:                 isExempt,
        is_first_term_free:        isFirstTermFreeActive,
        is_first_term_free_active: isFirstTermFreeActive,
        is_onboarding_term:        isOnboardingTerm,
        first_term_free_terminated: freeTermTerminated,
        onboarding_year:           onboardingYear,
        onboarding_term_label:     onboardingTerm,
        bill_id:                   termBill?.id || null,
        approval_status:           termBill?.approval_status || 'PENDING',
        lock_reason:               isUnlocked
          ? null
          : `Term subscription for ${resolvedTerm} (${resolvedYear}) is unpaid. Required: GH₵ ${reqAmount.toFixed(2)}, Wallet: GH₵ ${walletBal.toFixed(2)}.`,
      };
    } catch (err) {
      console.error('[subscriptionService] Fallback error:', err);
      const learnerCnt = await learnerRepository.getActiveLearnerCount(schoolId).catch(() => 0);
      return {
        is_unlocked:          true,
        billing_status:       'ACTIVE',
        reports_locked:       false,
        can_view_data:        true,
        can_enter_results:    true,
        can_edit_results:     true,
        can_generate_reports: true,
        can_download_reports: true,
        can_print_reports:    true,
        can_export_reports:   true,
        wallet_balance:       0,
        wallet_reserved:      0,
        wallet_available:     0,
        required_amount:      learnerCnt * 5.00,
        amount_due:           learnerCnt * 5.00,
        outstanding_amount:   0,
        learner_count:        learnerCnt,
        active_learner_count: learnerCnt,
        rate_per_learner:     5.00,
        academic_year:        '2025/2026',
        term:                 'Term 1',
        is_exempt:            false,
        is_first_term_free:   false,
        is_onboarding_term:   false,
      };
    }
  },

  /**
   * Resolve the currently active academic term for a school.
   * Mirrors the server-side resolve_school_running_term() RPC logic.
   * Priority: Active billing cycle → Active academic calendar → School profile → Default.
   */
  async getSchoolCurrentRunningTerm(schoolId) {
    // 1. Active billing cycle
    try {
      const { data: cycle } = await supabase
        .from('billing_cycles')
        .select('academic_year, term, billing_deadline')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (cycle) {
        return { year: cycle.academic_year, term: cycle.term, source: 'ACTIVE_BILLING_CYCLE', deadline: cycle.billing_deadline };
      }
    } catch (_) {}

    // 2. Active academic calendar (today falls within start_date..end_date)
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: cal } = await supabase
        .from('platform_academic_calendars')
        .select('academic_year, term')
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('start_date', { ascending: false })
        .limit(1)
        .single();
      if (cal) {
        return { year: cal.academic_year, term: cal.term, source: 'ACTIVE_ACADEMIC_CALENDAR' };
      }
    } catch (_) {}

    // 3. School profile
    if (schoolId) {
      try {
        const school = await db.schools.get(schoolId);
        if (school?.currentAcademicYear && school?.currentTerm) {
          return { year: school.currentAcademicYear, term: school.currentTerm, source: 'SCHOOL_PROFILE' };
        }
      } catch (_) {}
    }

    // 4. Safe default
    return { year: '2025/2026', term: 'Term 1', source: 'SAFE_DEFAULT' };
  },


  /**
   * Start Term Billing Cycle (Labour Admin Action)
   */
  async startTermBillingCycle(academicYear, term, billingDeadline, startedBy = 'Labour Admin') {
    try {
      const { data, error } = await supabase.rpc('start_term_billing_cycle', {
        p_academic_year: academicYear,
        p_term: term,
        p_billing_deadline: billingDeadline,
        p_started_by: startedBy,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[subscriptionService] startTermBillingCycle error:', err);
      throw err;
    }
  },

  /**
   * Revert / Cancel a Term Billing Cycle (Labour Admin Action)
   */
  async revertTermBillingCycle(academicYear, term, revertedBy = 'Labour Admin') {
    try {
      const { data, error } = await supabase.rpc('revert_term_billing_cycle', {
        p_academic_year: academicYear,
        p_term: term,
        p_reverted_by: revertedBy,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[subscriptionService] revertTermBillingCycle error:', err);
      throw err;
    }
  },

  /**
   * Toggle Exemption for a specific school for a term
   */
  async toggleSchoolTermExemption(schoolId, academicYear, term, isExempt, performedBy = 'Labour Admin') {
    try {
      const { data, error } = await supabase.rpc('toggle_school_term_exemption', {
        p_school_id: schoolId,
        p_academic_year: academicYear,
        p_term: term,
        p_exempt: Boolean(isExempt),
        p_performed_by: performedBy,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[subscriptionService] toggleSchoolTermExemption error:', err);
      throw err;
    }
  },

  /**
   * School Payment Approval & Atomic Wallet Deduction
   * Reliably deducts term subscription fees from wallet balance (including referral rewards).
   */
  async approveAndPayTermBill(billId, userId = 'School Admin', options = {}) {
    const { schoolId, termFee = 0, academicYear, term } = options;

    // 1. Try stored procedure if billId is available
    if (billId) {
      try {
        const { data, error } = await supabase.rpc('approve_and_pay_term_bill', {
          p_bill_id: billId,
          p_user_id: userId,
        });

        if (!error && data) {
          if (data.status === 'PAID' || data.success) {
            return data;
          }
          if (data.status === 'INSUFFICIENT_FUNDS') {
            return data;
          }
        }
      } catch (rpcErr) {
        console.warn('[subscriptionService] RPC approve_and_pay_term_bill notice, applying direct wallet deduction fallback:', rpcErr);
      }
    }

    // 2. Direct wallet deduction fallback
    if (!schoolId) {
      throw new Error('School ID is required to process wallet payment.');
    }

    // Fetch authoritative current balance
    let currentBalance = 0;
    if (navigator.onLine) {
      try {
        const { data: schoolDb } = await supabase
          .from('report_schools')
          .select('wallet_balance')
          .eq('id', schoolId)
          .maybeSingle();
        currentBalance = Number(schoolDb?.wallet_balance || 0);
      } catch (_) {}
    } else {
      const localSchool = await db.schools.get(schoolId);
      currentBalance = Number(localSchool?.wallet_balance || localSchool?.walletBalance || 0);
    }

    const feeToDeduct = Number(termFee || 0);

    if (feeToDeduct > 0 && currentBalance < feeToDeduct) {
      const shortfall = Math.ceil(feeToDeduct - currentBalance);
      return {
        success: false,
        status: 'INSUFFICIENT_FUNDS',
        top_up_required: shortfall,
        current_balance: currentBalance,
        message: `Wallet balance (GH₵ ${currentBalance.toFixed(2)}) is below term fee (GH₵ ${feeToDeduct.toFixed(2)}). Please top up GH₵ ${shortfall.toFixed(2)}.`
      };
    }

    const newBalance = Math.max(0, currentBalance - feeToDeduct);
    const txRef = `SUB-${Date.now().toString().slice(-6)}`;

    // Update Supabase
    if (navigator.onLine) {
      try {
        await supabase
          .from('report_schools')
          .update({ wallet_balance: newBalance })
          .eq('id', schoolId);

        if (billId) {
          await supabase
            .from('school_term_bills')
            .update({
              status: 'PAID',
              approval_status: 'APPROVED',
              paid_at: new Date().toISOString(),
              approved_by: userId
            })
            .eq('id', billId)
            .catch(() => null);
        }

        try {
          await supabase.from('wallet_transactions').insert({
            school_id: schoolId,
            transaction_type: 'DEBIT',
            currency: 'GHS',
            amount: feeToDeduct,
            balance_before: currentBalance,
            balance_after: newBalance,
            reference: txRef,
            description: `Term Subscription Fee (${academicYear || ''} ${term || ''})`,
            created_by: userId
          });
        } catch (_) {}
      } catch (cloudErr) {
        console.warn('[subscriptionService] Cloud wallet deduction notice:', cloudErr);
      }
    }

    // Update Local Dexie
    try {
      const localSchool = await db.schools.get(schoolId);
      if (localSchool) {
        await db.schools.update(schoolId, {
          wallet_balance: newBalance,
          walletBalance: newBalance
        });
      }
    } catch (_) {}

    return {
      success: true,
      status: 'PAID',
      new_balance: newBalance,
      message: `Payment of GH₵ ${feeToDeduct.toFixed(2)} approved and deducted from wallet successfully!`
    };
  },

  /**
   * Get all term bills for a school
   */
  async getSchoolTermBills(schoolId) {
    if (!schoolId) return [];
    try {
      const { data, error } = await supabase
        .from('school_term_bills')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[subscriptionService] getSchoolTermBills error:', err);
      return [];
    }
  },

  /**
   * Get all school term bills across all schools (for platform ops monitoring)
   */
  async getAllSchoolTermBills() {
    try {
      const { data, error } = await supabase
        .from('school_term_bills')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('[subscriptionService] getAllSchoolTermBills error:', err.message);
      return [];
    }
  },

  /**
   * Get all active billing cycles (Labour Admin)
   */
  async getAllBillingCycles() {
    try {
      const { data, error } = await supabase
        .from('billing_cycles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[subscriptionService] getAllBillingCycles error:', err);
      return [];
    }
  },

  /**
   * Evaluate Free Term Eligibility for a school (16-Week Rule)
   */
  async evaluateFreeTermEligibility(schoolId, academicYear = null, term = null) {
    if (!schoolId) return null;
    try {
      const { data, error } = await supabase.rpc('evaluate_free_term_eligibility', {
        p_school_id: schoolId,
        p_academic_year: academicYear,
        p_term: term,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[subscriptionService] evaluateFreeTermEligibility error:', err);
      return { eligible: false, reason: err.message };
    }
  },

  /**
   * Admin / Developer override per-learner subscription rate
   */
  async updatePerLearnerRate(schoolId, newRate) {
    if (!schoolId) return;
    const rateVal = Number(newRate);
    if (isNaN(rateVal) || rateVal < 0) throw new Error('Invalid rate amount');

    if (navigator.onLine) {
      await supabase
        .from('report_schools')
        .update({ per_learner_rate_override: rateVal })
        .eq('id', schoolId)
        .catch(() => null);
    }

    await db.schools.update(schoolId, {
      per_learner_rate_override: rateVal,
      ratePerLearner: rateVal
    });
  },

  /**
  /**
   * Top Up / Deposit into School Wallet
   */
  async topUpSchoolWallet(schoolId, amount, reference = null, description = 'Wallet Top Up', performedBy = 'Headteacher') {
    try {
      const numAmount = Number(amount);
      const txRef = reference || `DEP-${Date.now()}`;

      // 1. Try stored procedure deposit_school_wallet
      const { data, error } = await supabase.rpc('deposit_school_wallet', {
        p_school_id: schoolId,
        p_amount: numAmount,
        p_reference: txRef,
        p_description: description,
        p_performed_by: performedBy,
      });

      if (!error && data?.success) return data;

      // 2. Fallback direct update on report_schools
      const { data: school } = await supabase
        .from('report_schools')
        .select('wallet_balance')
        .eq('id', schoolId)
        .single();

      const oldBal = Number(school?.wallet_balance || 0);
      const newBal = oldBal + numAmount;

      await supabase
        .from('report_schools')
        .update({ wallet_balance: newBal })
        .eq('id', schoolId);

      // 3. Insert transaction record into wallet_transactions
      const txPayload = {
        school_id: schoolId,
        transaction_type: 'CREDIT',
        currency: 'GHS',
        amount: numAmount,
        balance_before: oldBal,
        balance_after: newBal,
        reference: txRef,
        description,
        created_by: performedBy,
      };

      let insertErr = null;
      try {
        const { error: wErr } = await supabase.from('wallet_transactions').insert(txPayload);
        if (wErr) insertErr = wErr;
      } catch (e) {
        insertErr = e;
      }

      // 4. Fallback insert to platform_wallet_transactions if wallet_transactions fails
      if (insertErr) {
        console.warn('[subscriptionService] wallet_transactions insert warning, attempting fallback insert:', insertErr?.message);
        try {
          await supabase.from('platform_wallet_transactions').insert(txPayload);
        } catch (_) {}
      }

      // Update local IndexedDB cache for instant UI reactivity across all components
      try {
        const localSchool = await db.schools.get(schoolId);
        if (localSchool) {
          await db.schools.update(schoolId, {
            wallet_balance: newBal,
            walletBalance: newBal
          });
        }
      } catch (_) {}

      return { success: true, old_balance: oldBal, new_balance: newBal, amount: numAmount, reference: txRef };
    } catch (err) {
      console.error('[subscriptionService] topUpSchoolWallet error:', err);
      return { success: false, message: err.message };
    }
  },

  /**
   * Get all wallet transactions for a school
   */
  async getWalletTransactions(schoolId) {
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (error && error.code === '42P01') {
        // Fallback to platform_wallet_transactions if legacy table name
        const { data: legacyData } = await supabase
          .from('platform_wallet_transactions')
          .select('*')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false });
        return legacyData || [];
      }

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[subscriptionService] getWalletTransactions error:', err);
      return [];
    }
  },

  /**
   * Get unified top-up history for a specific school (credits/deposits only)
   */
  async getSchoolTopUpHistory(schoolId) {
    try {
      if (!schoolId) return [];

      const resetAt = getEffectiveResetTimestamp(schoolId);

      const { data: rawWalletData } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      const { data: rawPaymentData } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      const { data: rawRefData } = await supabase
        .from('report_referrals')
        .select('*')
        .eq('referrer_school_id', String(schoolId).trim())
        .neq('status', 'REJECTED');

      const walletData = (rawWalletData || []).filter(tx => !resetAt || new Date(tx.created_at) > new Date(resetAt));
      const paymentData = (rawPaymentData || []).filter(p => !resetAt || new Date(p.created_at || p.completed_at) > new Date(resetAt));
      const refData = (rawRefData || []).filter(r => !resetAt || new Date(r.created_at) > new Date(resetAt));

      const topUpList = [];

      (walletData || []).forEach(tx => {
        const isDebit = tx.type === 'DEBIT' || tx.transaction_type === 'DEBIT' || tx.description?.toLowerCase().includes('debit') || tx.description?.toLowerCase().includes('deduct');
        const isReferral = tx.description?.toLowerCase().includes('referral') || tx.reference?.startsWith('REF-') || tx.description?.toLowerCase().includes('welcome');
        
        topUpList.push({
          id: tx.id,
          amount: Math.abs(Number(tx.amount || 0)),
          isDebit,
          reference: tx.reference || tx.provider_reference || `TXN-${String(tx.id).substring(0, 8)}`,
          method: isDebit 
            ? 'Subscription Fee Deduction' 
            : (isReferral ? 'Referral Rewards' : 'Direct Online Deposit'),
          description: tx.description 
            ? tx.description.replace(/paystack/gi, 'Online Top-Up') 
            : (isDebit ? 'Term Subscription Deduction' : (isReferral ? 'Referral Reward Credit (+GH₵20.00)' : 'Direct Wallet Top-Up Deposit')),
          created_at: tx.created_at,
          status: 'COMPLETED'
        });
      });

      (refData || []).forEach(ref => {
        const year = new Date().getFullYear();
        const refSuffix = String(ref.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
        const refReference = `REF-${year}-${refSuffix}`;
        const exists = topUpList.some(t => t.reference === refReference || t.reference === ref.id);
        if (!exists) {
          topUpList.push({
            id: ref.id,
            amount: Number(ref.reward_amount || 20.00),
            isDebit: false,
            reference: refReference,
            method: 'Referral Rewards',
            description: 'Referral Reward Credit (+GH₵20.00)',
            created_at: ref.created_at,
            status: 'COMPLETED'
          });
        }
      });

      (paymentData || []).forEach(ptx => {
        const exists = topUpList.some(t => t.reference === ptx.provider_reference);
        if (!exists && (ptx.status === 'COMPLETED' || ptx.status === 'SUCCESS')) {
          topUpList.push({
            id: ptx.id,
            amount: Number(ptx.verified_amount || ptx.requested_amount || 0),
            isDebit: false,
            reference: ptx.provider_reference || `PAY-${String(ptx.id).substring(0, 8)}`,
            method: 'Direct Online Deposit',
            description: 'Online Wallet Top-Up Deposit',
            created_at: ptx.created_at || ptx.completed_at,
            status: ptx.status
          });
        }
      });

      topUpList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return topUpList;
    } catch (err) {
      console.error('[subscriptionService] getSchoolTopUpHistory error:', err);
      return [];
    }
  },

  /**
   * Academic Calendars CRUD
   */
  async getAcademicCalendars() {
    try {
      const { data, error } = await supabase
        .from('platform_academic_calendars')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[subscriptionService] getAcademicCalendars error:', err);
      return [];
    }
  },

  async saveAcademicCalendar(calendarData) {
    try {
      const { data, error } = await supabase
        .from('platform_academic_calendars')
        .upsert([calendarData])
        .select();

      if (error) throw error;
      return data[0];
    } catch (err) {
      console.error('[subscriptionService] saveAcademicCalendar error:', err);
      throw err;
    }
  },

  async deleteAcademicCalendar(calendarId) {
    try {
      const { error } = await supabase
        .from('platform_academic_calendars')
        .delete()
        .eq('id', calendarId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[subscriptionService] deleteAcademicCalendar error:', err);
      throw err;
    }
  },

  /**
   * Pricing Rates CRUD (Local + Cloud Sync)
   */
  async getSubscriptionPricing() {
    const PRICING_CACHE_KEY = 'labour_edu_category_pricing';
    let cached = null;
    try {
      const raw = localStorage.getItem(PRICING_CACHE_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch (_) {}

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('platform_subscription_pricing')
          .select('*')
          .order('school_category', { ascending: true });

        if (!error && data && data.length > 0) {
          localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('[subscriptionService] getSubscriptionPricing cloud query notice:', err);
      }
    }

    return cached || [
      { id: '1', school_category: 'GES', amount_per_learner: 5.0, currency: 'GH₵' },
      { id: '2', school_category: 'Private', amount_per_learner: 5.0, currency: 'GH₵' },
      { id: '3', school_category: 'International', amount_per_learner: 15.0, currency: 'GH₵' },
    ];
  },

  async updateSubscriptionPricing(category, amount) {
    const PRICING_CACHE_KEY = 'labour_edu_category_pricing';
    const rateVal = Number(amount);
    if (isNaN(rateVal) || rateVal < 0) throw new Error('Please enter a valid numeric rate');

    let currentList = await this.getSubscriptionPricing();
    const existingIndex = currentList.findIndex(p => p.school_category === category);

    if (existingIndex >= 0) {
      currentList[existingIndex] = {
        ...currentList[existingIndex],
        amount_per_learner: rateVal,
        updated_at: new Date().toISOString()
      };
    } else {
      currentList.push({
        id: String(Date.now()),
        school_category: category,
        amount_per_learner: rateVal,
        currency: 'GH₵',
        updated_at: new Date().toISOString()
      });
    }

    localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(currentList));

    if (navigator.onLine) {
      try {
        const payload = {
          school_category: category,
          amount_per_learner: rateVal,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('platform_subscription_pricing')
          .upsert(payload, { onConflict: 'school_category' });

        if (error) {
          await supabase
            .from('platform_subscription_pricing')
            .update({ amount_per_learner: rateVal, updated_at: new Date().toISOString() })
            .eq('school_category', category);
        }
      } catch (cloudErr) {
        console.warn('[subscriptionService] Cloud pricing update notice:', cloudErr);
      }
    }

    return currentList.find(p => p.school_category === category);
  },

  /**
   * Developer / Admin Terminate or Restore Free Trial for a School
   */
  async terminateSchoolFreeTrial(schoolId, terminate = true, performedBy = 'Platform Developer') {
    if (!schoolId) return;

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase.rpc('terminate_school_free_trial', {
          p_school_id: schoolId,
          p_terminate: terminate,
          p_performed_by: performedBy,
        });
        if (!error && data) {
          await db.schools.update(schoolId, { first_term_free_terminated: terminate }).catch(() => null);
          return data;
        }
      } catch (err) {
        console.warn('[subscriptionService] RPC terminate_school_free_trial fallback:', err);
      }
    }

    if (navigator.onLine) {
      await supabase
        .from('report_schools')
        .update({ first_term_free_terminated: terminate })
        .eq('id', schoolId)
        .catch(() => null);

      try {
        await supabase.from('platform_subscription_audit').insert({
          school_id: schoolId,
          event: terminate ? 'Free Trial Terminated by Developer' : 'Free Trial Restored by Developer',
          details: { first_term_free_terminated: terminate },
          performed_by: performedBy,
        });
      } catch (_) {}
    }

    await db.schools.update(schoolId, { first_term_free_terminated: terminate }).catch(() => null);

    return { success: true, school_id: schoolId, first_term_free_terminated: terminate };
  },

  async restoreSchoolFreeTrial(schoolId, performedBy = 'Platform Developer') {
    return await this.terminateSchoolFreeTrial(schoolId, false, performedBy);
  },

  /**
   * Update school category, rate override, or exception status
   */
  async updateSchoolSubscriptionConfig(schoolId, config) {
    try {
      const updateData = {};
      if (config.school_category !== undefined) updateData.school_category = config.school_category;
      if (config.per_learner_rate_override !== undefined) {
        updateData.per_learner_rate_override = config.per_learner_rate_override !== '' && config.per_learner_rate_override !== null
          ? Number(config.per_learner_rate_override)
          : null;
      }
      if (config.subscription_exempt_until !== undefined) updateData.subscription_exempt_until = config.subscription_exempt_until || null;
      if (config.subscription_notes !== undefined) updateData.subscription_notes = config.subscription_notes || null;
      if (config.first_term_free_terminated !== undefined) updateData.first_term_free_terminated = Boolean(config.first_term_free_terminated);
      if (config.is_first_term_free !== undefined) updateData.is_first_term_free = Boolean(config.is_first_term_free);

      const { data, error } = await supabase
        .from('report_schools')
        .update(updateData)
        .eq('id', schoolId)
        .select();

      await db.schools.update(schoolId, updateData).catch(() => null);

      if (error) throw error;

      try {
        await supabase.from('platform_subscription_audit').insert({
          school_id: schoolId,
          event: 'Subscription Config Updated',
          details: config,
          performed_by: 'Platform Admin',
        });
      } catch (_) {}

      return data?.[0] || { id: schoolId, ...config };
    } catch (err) {
      console.error('[subscriptionService] updateSchoolSubscriptionConfig error:', err);
      throw err;
    }
  },

  /**
   * Fetch all subscription audit logs for a school or platform wide
   */
  async getSubscriptionAuditLogs(schoolId = null) {
    try {
      let query = supabase
        .from('platform_subscription_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (schoolId) {
        query = query.eq('school_id', schoolId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[subscriptionService] getSubscriptionAuditLogs error:', err);
      return [];
    }
  },

  /**
   * Fetch all financial transactions across all schools (top-ups, billing deductions, Paystack online payments).
   * Resilient: tries join first, falls back to plain select, then also tries legacy table.
   */
  async getAllPlatformTransactions() {
    let walletTxs = [];
    let paymentTxs = [];

    // ── 1. Wallet Transactions (immutable ledger) ──────────────────────────
    try {
      // Try with FK join to get school name inline
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*, report_schools(name)')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!error && data && data.length > 0) {
        walletTxs = data;
      } else if (error) {
        console.warn('[subscriptionService] wallet_transactions join query failed, trying plain select:', error.message);
        // Fallback: select without join
        const { data: plain, error: plainErr } = await supabase
          .from('wallet_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (!plainErr && plain) walletTxs = plain;
        else console.warn('[subscriptionService] wallet_transactions plain query also failed:', plainErr?.message);
      }
    } catch (err) {
      console.warn('[subscriptionService] wallet_transactions error:', err.message);
    }

    // If wallet_transactions returned nothing, try legacy platform_wallet_transactions
    if (walletTxs.length === 0) {
      try {
        const { data: legacy, error: legacyErr } = await supabase
          .from('platform_wallet_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (!legacyErr && legacy && legacy.length > 0) {
          console.info('[subscriptionService] Using legacy platform_wallet_transactions table.');
          walletTxs = legacy;
        }
      } catch (_) {
        // Legacy table doesn't exist — that's fine
      }
    }

    // ── 2. Merge Local Dexie Wallet Ledger (db.walletLedger) for 100% Accuracy ──
    try {
      const localLedger = await db.walletLedger.toArray();
      const existingRefs = new Set(walletTxs.map(w => w.reference || w.id).filter(Boolean));

      for (const loc of localLedger) {
        if (!existingRefs.has(loc.reference) && !existingRefs.has(loc.id)) {
          walletTxs.push({
            id: loc.id,
            school_id: loc.schoolId,
            type: loc.amount >= 0 ? 'CREDIT' : 'DEBIT',
            transaction_type: loc.amount >= 0 ? 'CREDIT' : 'DEBIT',
            amount: Math.abs(loc.amount),
            balance_before: null,
            balance_after: null,
            currency: 'GHS',
            reference: loc.reference || loc.id,
            description: loc.type === 'REFERRAL_REWARD' 
              ? 'Referral Reward Credit' 
              : (loc.type === 'WELCOME_BONUS' 
                  ? 'Welcome Bonus Credit' 
                  : (loc.metadata?.description || (loc.type ? String(loc.type).replace(/_/g, ' ') : 'Wallet Transaction'))),
            created_by: loc.processedBy || 'System',
            created_at: loc.createdAt
          });
          existingRefs.add(loc.reference || loc.id);
        }
      }
    } catch (dbErr) {
      console.warn('[subscriptionService] Local ledger merge notice:', dbErr);
    }

    // ── 3. Payment Transactions (Paystack online payments) ─────────────────
    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*, report_schools(name)')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!error && data) {
        paymentTxs = data;
      } else if (error) {
        // Fallback without join
        const { data: plain } = await supabase
          .from('payment_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000);
        paymentTxs = plain || [];
      }
    } catch (err) {
      console.warn('[subscriptionService] payment_transactions query error:', err.message);
    }

    const filteredWalletTxs = walletTxs.filter(tx => {
      const resetAt = getEffectiveResetTimestamp(tx.school_id || tx.schoolId);
      return !resetAt || new Date(tx.created_at) > new Date(resetAt);
    });

    const filteredPaymentTxs = paymentTxs.filter(pt => {
      const resetAt = getEffectiveResetTimestamp(pt.school_id || pt.schoolId);
      return !resetAt || new Date(pt.completed_at || pt.paid_at || pt.created_at) > new Date(resetAt);
    });

    return {
      walletTransactions: filteredWalletTxs,
      paymentTransactions: filteredPaymentTxs,
    };
  },

  /**
   * Reset school wallet balance, transactions, and referral records for clean end-to-end testing
   */
  async resetSchoolWalletAndReferrals(schoolId) {
    if (!schoolId) return { success: false, message: 'Missing school ID' };
    const cleanId = String(schoolId).trim();

    // 1. Reset Supabase Cloud state
    if (navigator.onLine) {
      try {
        // Reset report_schools.wallet_balance to 0.00
        await supabase
          .from('report_schools')
          .update({ wallet_balance: 0.00 })
          .eq('id', cleanId);

        // Delete wallet_transactions for this school
        await supabase
          .from('wallet_transactions')
          .delete()
          .eq('school_id', cleanId);

        // Delete platform_wallet_transactions
        try {
          await supabase
            .from('platform_wallet_transactions')
            .delete()
            .eq('school_id', cleanId);
        } catch (_) {}

        // Delete payment_transactions
        try {
          await supabase
            .from('payment_transactions')
            .delete()
            .eq('school_id', cleanId);
        } catch (_) {}

        // Delete referrals where this school is referrer or referee
        await supabase
          .from('report_referrals')
          .delete()
          .or(`referrer_school_id.eq.${cleanId},referred_school_id.eq.${cleanId}`);

        // Reset term bills to AWAITING_APPROVAL
        try {
          await supabase
            .from('school_term_bills')
            .update({
              status: 'AWAITING_APPROVAL',
              approval_status: 'PENDING',
              paid_at: null,
              approved_by: null
            })
            .eq('school_id', cleanId);
        } catch (_) {}
      } catch (err) {
        console.warn('[subscriptionService] Cloud reset notice:', err);
      }
    }

    // 2. Reset Local Dexie IndexedDB cache
    try {
      // Reset db.schools wallet balance and referral stats
      const localSchool = await db.schools.get(cleanId);
      if (localSchool) {
        await db.schools.update(cleanId, {
          wallet_balance: 0,
          walletBalance: 0,
          totalSuccessfulReferrals: 0,
          totalReferralEarnings: 0,
          referralLocked: false,
          referredBySchoolId: null
        });
      }

      // Delete referrals in Dexie
      const localRefs = await db.referrals
        .filter(r => String(r.referrerSchoolId).trim() === cleanId || String(r.referredSchoolId).trim() === cleanId)
        .toArray();
      for (const r of localRefs) {
        if (r.id) await db.referrals.delete(r.id);
      }

      // Delete walletLedger transactions in Dexie
      const localLedger = await db.walletLedger
        .where('schoolId')
        .equals(cleanId)
        .toArray();
      for (const entry of localLedger) {
        if (entry.id) await db.walletLedger.delete(entry.id);
      }
    } catch (localErr) {
      console.warn('[subscriptionService] Local Dexie reset notice:', localErr);
    }

    return { success: true, message: 'Wallet balance, transactions, and referral records reset to 0.' };
  },
};

export default subscriptionService;
