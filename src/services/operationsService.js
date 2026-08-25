/**
 * operationsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform Operations Center — Live Data Service
 * Reads real data from Supabase with Super Admin bypass RLS.
 * Calculates Health Scores dynamically from actual school usage metrics.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase';
import db from '../lib/db';
import learnerRepository from '../repositories/learnerRepository';
import { getEffectiveResetTimestamp } from './subscriptionService';

// ─── LOCAL CACHE (session-scoped) ─────────────────────────────────────────────
let _schoolsCache = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

// ─── HEALTH SCORE CALCULATOR ──────────────────────────────────────────────────

/**
 * Calculate School Health Score (0–100%) from real metric values.
 * Weights: Sync/Submission(20%), Score Completion(25%), Reports(20%),
 *          Support Issues(15%), Subscription(10%), Active Users(10%)
 */
export const calculateSchoolHealthScore = (data) => {
  // Score completion: submitted / total scores ratio
  const totalScores = data.total_scores_count || 0;
  const submittedScores = data.submitted_scores_count || 0;
  const scoreCompletion = totalScores > 0
    ? Math.round((submittedScores / totalScores) * 100)
    : (data.score_completion_score ?? 80);

  // Report generation: how many learners have a report summary
  const learners = data.learners_count || 1;
  const reportsCount = data.reports_count || 0;
  const reportStatus = learners > 0
    ? Math.min(100, Math.round((reportsCount / learners) * 100))
    : (data.report_generation_score ?? 80);

  // Support issues: inverse of open tickets (default 100 if no issues)
  const supportStatus = data.support_issues_score ?? 100;

  // Subscription health
  const subMap = { 'Active': 100, 'Trial': 75, 'Suspended': 20, 'Expired': 0 };
  const subStatus = subMap[data.subscription_status] ?? 60;

  // Sync health (defaults high, degrades if no scores recorded)
  const syncHealth = data.sync_health_score ?? (totalScores > 0 ? 95 : 70);

  // Active users: staff with recent logins (approximated by staff count vs expected)
  const activeUsers = data.active_users_score ?? (data.staff_count > 0 ? 90 : 60);

  const totalScore = Math.round(
    (syncHealth       * 0.20) +
    (scoreCompletion  * 0.25) +
    (reportStatus     * 0.20) +
    (supportStatus    * 0.15) +
    (subStatus        * 0.10) +
    (activeUsers      * 0.10)
  );

  let healthStatus = 'Healthy';
  if (totalScore < 60) healthStatus = 'Critical';
  else if (totalScore < 80) healthStatus = 'Warning';

  return {
    totalScore,
    healthStatus,
    breakdown: { syncHealth, scoreCompletion, reportStatus, supportStatus, subStatus, activeUsers }
  };
};

// ─── GET CURRENT SUPER ADMIN NAME ─────────────────────────────────────────────
const getSuperAdminName = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email || user?.user_metadata?.full_name || 'Super Admin';
  } catch {
    return 'Super Admin';
  }
};

// ─── RECORD SCHOOL TIMELINE EVENT ────────────────────────────────────────────
export const recordSchoolTimelineEvent = async (schoolId, eventType, title, description = '', metadata = {}) => {
  try {
    const actorName = await getSuperAdminName();
    const { error } = await supabase.from('platform_school_timeline_events').insert([{
      school_id: schoolId,
      event_type: eventType,
      title,
      description,
      actor_name: actorName,
      metadata,
      created_at: new Date().toISOString()
    }]);
    if (error) {
      console.warn('[OpsService] Timeline event record skipped (run SQL migration to create platform_school_timeline_events table):', error.message);
    }
  } catch (err) {
    console.warn('[OpsService] Failed to record timeline event:', err);
  }
};

// ─── RECORD SUPPORT INTERVENTION ─────────────────────────────────────────────
export const recordSupportIntervention = async (schoolId, schoolName, actionType, description, previousState = {}, newState = {}, result = 'success') => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('platform_support_interventions').insert([{
      admin_id: user?.id || null,
      admin_name: user?.email || 'Super Admin',
      school_id: schoolId,
      school_name: schoolName,
      action_type: actionType,
      description,
      previous_state: previousState,
      new_state: newState,
      result,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.warn('[OpsService] Failed to record intervention:', err);
  }
};

// ─── MASTER SCHOOLS DIRECTORY ─────────────────────────────────────────────────

/**
 * Load all registered schools with authentic live data from database.
 * Merges Supabase cloud records and Dexie IndexedDB records with exact learner counts.
 */
export const getSchoolsDirectory = async (forceRefresh = false) => {
  // Return cache if fresh
  if (!forceRefresh && _schoolsCache && (Date.now() - _cacheTimestamp) < CACHE_TTL_MS) {
    return _schoolsCache;
  }

  try {
    // 1. Query report_schools directly from Supabase
    let rawSchools = [];
    try {
      const { data, error } = await supabase
        .from('report_schools')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) {
        rawSchools = data;
      }
    } catch (e) {
      console.warn('[OpsService] Supabase schools fetch notice:', e.message);
    }

    // 2. Query local IndexedDB schools
    let localSchools = [];
    try {
      if (db?.schools) {
        localSchools = await db.schools.toArray();
      }
    } catch (_) {}

    // Combine authentic database schools by ID from both Supabase and Dexie IndexedDB
    const schoolsMap = new Map();
    (localSchools || []).forEach(s => {
      if (s.id) {
        schoolsMap.set(String(s.id), { ...s });
      }
    });
    (rawSchools || []).forEach(s => {
      if (s.id) {
        const existing = schoolsMap.get(String(s.id)) || {};
        schoolsMap.set(String(s.id), { ...existing, ...s });
      }
    });

    const combinedSchools = Array.from(schoolsMap.values());

    if (combinedSchools.length === 0) {
      _schoolsCache = [];
      _cacheTimestamp = Date.now();
      return [];
    }

    // Try fetching platform_school_stats view to get pre-aggregated counts if available
    let statsMap = {};
    try {
      const { data: statsData } = await supabase
        .from('platform_school_stats')
        .select('*');
      if (statsData) {
        statsData.forEach(st => {
          statsMap[st.school_id || st.id] = st;
        });
      }
    } catch (_) {}

    // Pre-fetch transactions and term bills in a single batch
    let allWalletTxs = [];
    let allPlatformWalletTxs = [];
    let allPaymentTxs = [];
    let allTermBills = [];

    try {
      const [wRes, pwtRes, payRes, billsRes] = await Promise.allSettled([
        supabase.from('wallet_transactions').select('*').limit(2000),
        supabase.from('platform_wallet_transactions').select('*').limit(2000),
        supabase.from('payment_transactions').select('*').limit(2000),
        supabase.from('school_term_bills').select('*').limit(2000),
      ]);
      if (wRes.status === 'fulfilled' && wRes.value.data) allWalletTxs = wRes.value.data;
      if (pwtRes.status === 'fulfilled' && pwtRes.value.data) allPlatformWalletTxs = pwtRes.value.data;
      if (payRes.status === 'fulfilled' && payRes.value.data) allPaymentTxs = payRes.value.data;
      if (billsRes.status === 'fulfilled' && billsRes.value.data) allTermBills = billsRes.value.data;
    } catch (_) {}

    // Group transactions and bills by school ID
    const walletMap = new Map();
    const billsMap = new Map();

    const addTx = (schoolId, tx) => {
      if (!schoolId) return;
      const sId = String(schoolId);
      const resetAt = getEffectiveResetTimestamp(sId);
      const txDate = tx.created_at || tx.completed_at || tx.paid_at;
      if (resetAt && txDate && new Date(txDate) <= new Date(resetAt)) {
        return; // Exclude pre-reset transactions
      }
      if (!walletMap.has(sId)) walletMap.set(sId, []);
      walletMap.get(sId).push(tx);
    };

    allWalletTxs.forEach(t => addTx(t.school_id || t.schoolId, t));
    allPlatformWalletTxs.forEach(t => addTx(t.school_id || t.schoolId, t));
    allPaymentTxs.forEach(t => addTx(t.school_id || t.schoolId, t));

    allTermBills.forEach(b => {
      const sId = String(b.school_id || b.schoolId || '');
      if (sId) {
        if (!billsMap.has(sId)) billsMap.set(sId, []);
        billsMap.get(sId).push(b);
      }
    });

    // For each school, build enriched school object with real, authentic metrics from DB
    const enriched = await Promise.all(combinedSchools.map(async (s) => {
      const st = statsMap[s.id] || {};

      let learnersCount = st.learners_count;
      let staffCount = st.staff_count;
      let classesCount = st.classes_count;
      let headteacherName = s.headteacher_name || st.headteacher_name || s.contact_name || 'Headteacher';
      let submittedScores = st.submitted_scores_count;
      let totalScores = st.total_scores_count;
      let reportsCount = st.reports_count;
      let releasedReports = st.released_reports_count;
      let openTickets = st.open_tickets_count;

      // 1. Live learners count from Supabase
      let cloudLearners = 0;
      try {
        const { count, error } = await supabase.from('report_learners').select('id', { count: 'exact', head: true }).eq('school_id', s.id);
        if (!error && count !== null && count !== undefined) cloudLearners = count;
      } catch (_) {}

      // 2. Local learners count from IndexedDB
      let localLearnerCount = 0;
      try {
        if (learnerRepository?.getLearnerCount) {
          localLearnerCount = await learnerRepository.getLearnerCount(s.id);
        } else if (db?.learners) {
          localLearnerCount = await db.learners.where('schoolId').equals(s.id).count();
        }
      } catch (_) {}

      const accurateLearnersCount = Math.max(cloudLearners, localLearnerCount, st.learners_count || 0, s.learners_count || 0);

      // 3. Teaching staff count from Supabase
      if (staffCount === undefined || staffCount === null) {
        try {
          const { count, error } = await supabase.from('report_profiles').select('id', { count: 'exact', head: true }).eq('school_id', s.id).in('role', ['teacher', 'class_teacher']);
          if (!error && count !== null) staffCount = count;
        } catch (_) {}
        if (!staffCount && db?.profiles) {
          try {
            staffCount = await db.profiles.where('schoolId').equals(s.id).count();
          } catch (_) {}
        }
      }

      // 4. Classes count
      if (classesCount === undefined || classesCount === null) {
        try {
          const { count, error } = await supabase.from('report_classes').select('id', { count: 'exact', head: true }).eq('school_id', s.id);
          if (!error && count !== null) classesCount = count;
        } catch (_) {}
        if (!classesCount && db?.classes) {
          try {
            classesCount = await db.classes.where('schoolId').equals(s.id).count();
          } catch (_) {}
        }
      }

      // 5. Headteacher lookup
      if (!headteacherName || headteacherName === 'Headteacher') {
        try {
          const { data: htData } = await supabase.from('report_profiles').select('full_name').eq('school_id', s.id).in('role', ['headteacher', 'super_admin', 'admin']).order('created_at', { ascending: true }).limit(1);
          if (htData && htData[0]?.full_name) {
            headteacherName = htData[0].full_name;
          }
        } catch (_) {}
      }

      // 6. Assessment scores
      if (submittedScores === undefined || totalScores === undefined) {
        try {
          const { data: scData, count: scCount } = await supabase.from('report_scores').select('id, is_submitted', { count: 'exact' }).eq('school_id', s.id);
          if (scData) {
            submittedScores = scData.filter(x => x.is_submitted).length;
            totalScores = scCount || scData.length;
          }
        } catch (_) {}
      }

      // 7. Student Reports
      if (reportsCount === undefined || releasedReports === undefined) {
        try {
          const { data: repData, count: repCount } = await supabase.from('report_summaries').select('id, is_released', { count: 'exact' }).eq('school_id', s.id);
          if (repData) {
            releasedReports = repData.filter(x => x.is_released).length;
            reportsCount = repCount || repData.length;
          }
        } catch (_) {}
      }

      // 8. Open Support Tickets
      if (openTickets === undefined || openTickets === null) {
        try {
          const { count } = await supabase.from('platform_support_tickets').select('id', { count: 'exact', head: true }).eq('school_id', s.id).eq('status', 'Open');
          openTickets = count || 0;
        } catch (_) {
          openTickets = 0;
        }
      }

      // 9. Derive Wallet Balance directly from wallet_transactions database ledger
      const schoolTxs = walletMap.get(String(s.id)) || [];
      let derivedBalance = null;

      if (schoolTxs.length > 0) {
        // Sort newest first
        schoolTxs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        
        // Option A: If newest transaction has balance_after recorded, that is the authoritative current ledger balance
        const latestTxWithBalance = schoolTxs.find(t => t.balance_after !== null && t.balance_after !== undefined && !isNaN(Number(t.balance_after)));
        if (latestTxWithBalance) {
          derivedBalance = Number(latestTxWithBalance.balance_after);
        } else {
          // Option B: Compute net ledger sum: (Credits + Deposits + Refunds) - (Debits + Deductions)
          const credits = schoolTxs
            .filter(t => {
              const type = (t.transaction_type || t.type || '').toUpperCase();
              const isCredit = type === 'CREDIT' || type === 'DEPOSIT' || type === 'REFUND' || (!type && Number(t.amount || 0) > 0);
              const isSuccess = !t.status || t.status === 'COMPLETED' || t.status === 'SUCCESS' || t.status === 'success' || t.status === 'completed';
              return isCredit && isSuccess;
            })
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

          const debits = schoolTxs
            .filter(t => {
              const type = (t.transaction_type || t.type || '').toUpperCase();
              const isDebit = type === 'DEBIT' || type === 'DEDUCTION' || type === 'WITHDRAWAL';
              const isSuccess = !t.status || t.status === 'COMPLETED' || t.status === 'SUCCESS' || t.status === 'success' || t.status === 'completed';
              return isDebit && isSuccess;
            })
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

          derivedBalance = Math.max(0, credits - debits);
        }
      }

      // If no transactions in wallet_transactions table, fallback to report_schools.wallet_balance
      const resetAt = getEffectiveResetTimestamp(s.id);
      let authoritativeBalance = 0;
      if (derivedBalance !== null) {
        authoritativeBalance = derivedBalance;
      } else if (!resetAt) {
        authoritativeBalance = Number(s.wallet_balance !== undefined && s.wallet_balance !== null ? s.wallet_balance : (s.walletBalance ?? st.wallet_balance ?? 0));
      }

      // 10. Check if school has paid/approved term bill
      const schoolBills = billsMap.get(String(s.id)) || [];
      const isPaidTermBill = schoolBills.some(b => 
        b.status === 'PAID' || 
        b.status === 'ACTIVE' || 
        b.status === 'COMPLETED' || 
        b.approval_status === 'APPROVED' || 
        b.approval_status === 'PAID'
      );

      const isSubscribed = Boolean(isPaidTermBill || s.subscription_status === 'Active' || s.is_subscribed);

      const merged = {
        ...st,
        ...s, // authoritative school table columns
        id: s.id,
        name: s.name || s.school_name || `School ${s.id}`,
        wallet_balance: authoritativeBalance,
        per_learner_rate_override: s.per_learner_rate_override !== undefined ? s.per_learner_rate_override : (s.perLearnerRateOverride ?? null),
        is_first_term_free: s.is_first_term_free !== undefined ? s.is_first_term_free : true,
        first_term_free_terminated: Boolean(s.first_term_free_terminated || false),
        subscription_exempt_until: s.subscription_exempt_until || null,
        subscription_status: isSubscribed ? 'Active' : (s.subscription_status || 'Trial'),
        school_category: s.school_category || st.school_category || s.schoolCategory || (s.school_type === 'public' ? 'GES' : s.school_type === 'international' ? 'International' : 'Private'),
        current_academic_year: s.current_academic_year || s.currentAcademicYear || '2025/2026',
        current_term: s.current_term || s.currentTerm || 'Term 1',
        headteacher_name: headteacherName,
        headteacher: headteacherName,
        phone: s.phone || s.contact_phone || 'N/A',
        email: s.email || s.contact_email || 'N/A',
        location: s.location || s.address || 'N/A',
        circuit: s.circuit || s.location || 'N/A',
        district: s.district || 'N/A',
        region: s.region || 'N/A',
        classes_count: classesCount || 0,
        learners_count: accurateLearnersCount || 0,
        staff_count: staffCount || 0,
        submitted_scores_count: submittedScores || 0,
        total_scores_count: totalScores || 0,
        reports_count: reportsCount || 0,
        released_reports_count: releasedReports || 0,
        support_issues_score: openTickets === 0 ? 100 : openTickets <= 2 ? 70 : 40,
        created_at: s.created_at || s.createdAt || new Date().toISOString(),
      };

      return buildSchoolObject(merged, s.id, s.name);
    }));

    _schoolsCache = enriched;
    _cacheTimestamp = Date.now();
    return enriched;

  } catch (err) {
    console.error('[OpsService] getSchoolsDirectory failed:', err);
    return [];
  }
};

/** Build a normalised school object with health score */
const buildSchoolObject = (s, id, name) => {
  const rawType = (s.school_type || '').toLowerCase();
  const rawCat = s.school_category || (rawType === 'public' || rawType === 'ges' ? 'GES' : rawType === 'international' ? 'International' : 'Private');

  const obj = {
    ...s,
    id: id || s.id || s.school_id,
    name: name || s.name || s.school_name || 'Unnamed School',
    wallet_balance: Number(s.wallet_balance || s.walletBalance || 0),
    per_learner_rate_override: s.per_learner_rate_override !== undefined ? s.per_learner_rate_override : null,
    is_first_term_free: s.is_first_term_free !== undefined ? s.is_first_term_free : true,
    first_term_free_terminated: s.first_term_free_terminated !== undefined ? s.first_term_free_terminated : false,
    subscription_exempt_until: s.subscription_exempt_until || null,
    school_category: rawCat,
    school_type: s.school_type || (rawCat === 'GES' ? 'public' : rawCat === 'International' ? 'international' : 'private'),
    circuit: s.circuit || s.location || 'N/A',
    district: s.district || 'N/A',
    region: s.region || 'N/A',
    phone: s.phone || s.contact_phone || 'N/A',
    email: s.email || s.contact_email || 'N/A',
    location: s.location || s.address || 'N/A',
    classes_count: s.classes_count || 0,
    headteacher_name: s.headteacher_name || s.contact_name || 'Headteacher',
    headteacher: s.headteacher_name || s.contact_name || 'Headteacher',
    learners_count: s.learners_count || 0,
    staff_count: s.staff_count || 0,
    current_academic_year: s.current_academic_year || '2025/2026',
    current_term: s.current_term || 'Term 1',
    active_term: s.current_term ? `${s.current_term} (${s.current_academic_year || '2025/2026'})` : 'Term 1 (2025/2026)',
    reports_released: s.reports_released ?? false,
    is_read_only: s.is_read_only ?? false,
    subscription_status: s.subscription_status || 'Active',
    subscription_tier: s.subscription_tier || 'Standard',
    created_at: s.created_at || new Date().toISOString(),
    // Raw health metric inputs
    submitted_scores_count: s.submitted_scores_count || 0,
    total_scores_count: s.total_scores_count || 0,
    reports_count: s.reports_count || 0,
    released_reports_count: s.released_reports_count || 0,
    support_issues_score: s.support_issues_score ?? 100,
    sync_health_score: s.sync_health_score ?? (s.total_scores_count > 0 ? 95 : 70),
    active_users_score: s.active_users_score ?? (s.staff_count > 0 ? 88 : 60),
  };
  return { ...obj, health: calculateSchoolHealthScore(obj) };
};

// ─── SCHOOL TIMELINE EVENTS ───────────────────────────────────────────────────

export const getSchoolTimelineEvents = async (schoolId) => {
  const { data, error } = await supabase
    .from('platform_school_timeline_events')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!error && data && data.length > 0) return data;

  // Seed starter events by querying the school's real registration date
  try {
    const { data: school } = await supabase
      .from('report_schools')
      .select('name, created_at, current_academic_year, current_term')
      .eq('id', schoolId)
      .single();

    if (school) {
      // Auto-seed the registration timeline event so it's not empty
      await supabase.from('platform_school_timeline_events').upsert([{
        school_id: schoolId,
        event_type: 'school_registration',
        title: 'School Profile Registered',
        description: `${school.name} was onboarded into the Labour Educational Report System.`,
        actor_name: 'System',
        metadata: { academic_year: school.current_academic_year },
        created_at: school.created_at || new Date().toISOString()
      }], { onConflict: 'school_id,event_type,title' }).select();

      // Re-fetch after seeding
      const { data: seeded } = await supabase
        .from('platform_school_timeline_events')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      return seeded || [];
    }
  } catch { /* ignore */ }

  return [];
};

// ─── REMOTE INTERVENTIONS ─────────────────────────────────────────────────────

/**
 * Override or lock report card release for a school.
 * Updates report_summaries.is_released for ALL summaries of that school.
 */
export const overrideReportRelease = async (schoolId, schoolName, isReleased) => {
  // 1. Update the school's reports_released flag
  const { error: schoolErr } = await supabase
    .from('report_schools')
    .update({ reports_released: isReleased, updated_at: new Date().toISOString() })
    .eq('id', schoolId);

  if (schoolErr) {
    console.warn('[OpsService] Could not update report_schools.reports_released:', schoolErr.message);
  }

  // 2. Update all report_summaries for this school
  await supabase
    .from('report_summaries')
    .update({ is_released: isReleased, updated_at: new Date().toISOString() })
    .eq('school_id', schoolId);

  // 3. Log the intervention
  await recordSupportIntervention(
    schoolId, schoolName,
    'override_report_release',
    `Report card publication overridden to ${isReleased ? 'RELEASED (visible to parents)' : 'LOCKED (hidden from parents)'}.`,
    { isReleased: !isReleased },
    { isReleased }
  );

  // 4. Record in timeline
  await recordSchoolTimelineEvent(
    schoolId, 'report_release',
    `Report Cards ${isReleased ? 'Released to Parents' : 'Locked by Admin'}`,
    `Super Admin intervention: Terminal report cards are now ${isReleased ? 'visible to parents' : 'hidden from the Parent Portal'}.`
  );

  // Invalidate cache
  _schoolsCache = null;
};

/**
 * Toggle Read-Only mode for a school.
 * Updates report_schools.is_read_only and platform_school_subscriptions.is_read_only.
 */
export const toggleReadOnlyMode = async (schoolId, schoolName, isReadOnly) => {
  // Update report_schools
  await supabase
    .from('report_schools')
    .update({ is_read_only: isReadOnly, updated_at: new Date().toISOString() })
    .eq('id', schoolId);

  // Update subscription record ONLY if it exists (prevents 400 console error if table or row is missing)
  try {
    const { data: existingSub } = await supabase
      .from('platform_school_subscriptions')
      .select('id')
      .eq('school_id', schoolId)
      .maybeSingle();

    if (existingSub) {
      await supabase
        .from('platform_school_subscriptions')
        .update({ is_read_only: isReadOnly, updated_at: new Date().toISOString() })
        .eq('school_id', schoolId);
    }
  } catch (_) {
    /* non-critical platform analytics table — ignore */
  }

  await recordSupportIntervention(
    schoolId, schoolName,
    'toggle_read_only_mode',
    `School data entry access set to ${isReadOnly ? 'READ ONLY — all edits blocked' : 'FULL EDIT — access restored'}.`,
    { isReadOnly: !isReadOnly },
    { isReadOnly }
  );

  await recordSchoolTimelineEvent(
    schoolId, 'read_only_mode_change',
    `Read-Only Mode ${isReadOnly ? 'Enabled' : 'Disabled'}`,
    `Super Admin intervention: ${isReadOnly ? 'All data entry has been restricted to read-only.' : 'Full edit access has been restored.'}`
  );

  _schoolsCache = null;
};

/**
 * Update or upsert a school's subscription record.
 */
export const updateSchoolSubscription = async (schoolId, schoolName, tier, status, renewalDate) => {
  // Upsert into platform_school_subscriptions (safely catch if table missing)
  try {
    await supabase
      .from('platform_school_subscriptions')
      .upsert([{
        school_id: schoolId,
        school_name: schoolName,
        tier,
        status,
        renewal_date: new Date(renewalDate).toISOString(),
        price_ghs: tier === 'Enterprise' ? 4800 : tier === 'Standard' ? 2500 : 1200,
        updated_at: new Date().toISOString()
      }], { onConflict: 'school_id' });
  } catch (err) {
    console.warn('[OpsService] Platform subscription update skipped:', err);
  }

  // Also update the shortcut columns on report_schools
  await supabase
    .from('report_schools')
    .update({
      subscription_tier: tier,
      subscription_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', schoolId);

  await recordSupportIntervention(
    schoolId, schoolName,
    'update_subscription',
    `Subscription updated to ${tier} (${status}) through ${new Date(renewalDate).toLocaleDateString('en-GH')}.`,
    {},
    { tier, status, renewalDate }
  );

  await recordSchoolTimelineEvent(
    schoolId, 'subscription_change',
    `Subscription Updated: ${tier} (${status})`,
    `Platform subscription configured as ${tier} tier, status ${status}, valid through ${new Date(renewalDate).toLocaleDateString('en-GH')}.`
  );

  _schoolsCache = null;
};

// ─── INTERVENTIONS AUDIT LOG ──────────────────────────────────────────────────

export const getInterventionsAuditLog = async () => {
  const { data, error } = await supabase
    .from('platform_support_interventions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[OpsService] getInterventionsAuditLog error:', error.message);
    return [];
  }
  return data || [];
};

// ─── SUPPORT TICKETS ──────────────────────────────────────────────────────────

export const getSupportTickets = async () => {
  const { data, error } = await supabase
    .from('platform_support_tickets')
    .select('*')
    .order('created_at', { ascending: false });

  if (!error && data && data.length > 0) return data;
  return [];
};

export const getSchoolSupportTickets = async (schoolId) => {
  if (!schoolId) return [];
  const { data, error } = await supabase
    .from('platform_support_tickets')
    .select('*')
    .eq('school_id', String(schoolId))
    .order('created_at', { ascending: false });

  if (!error && data) return data;
  return [];
};

export const createSupportTicket = async (schoolId, schoolName, title, category, priority, initialMessage, senderInfo = {}) => {
  const ticketCode = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
  const senderLabel = senderInfo.name
    ? `${senderInfo.name} (${senderInfo.role === 'teacher' ? 'Teacher' : 'Headteacher'})`
    : 'User';

  const { data, error } = await supabase
    .from('platform_support_tickets')
    .insert([{
      school_id: schoolId,
      school_name: schoolName,
      ticket_code: ticketCode,
      title,
      category,
      priority,
      status: 'Open',
      sender_name: senderInfo.name || 'User',
      sender_role: senderInfo.role || 'headteacher',
      sender_staff_id: senderInfo.staffId || null,
      messages: initialMessage ? [{ sender: senderLabel, text: initialMessage, time: new Date().toISOString() }] : [],
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateSupportTicket = async (ticketId, updates) => {
  const { data, error } = await supabase
    .from('platform_support_tickets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const addTicketMessage = async (ticketId, currentMessages, senderName, text) => {
  const newMessages = [
    ...(currentMessages || []),
    { sender: senderName, text, time: new Date().toISOString() }
  ];
  return updateSupportTicket(ticketId, { messages: newMessages, status: 'In Progress' });
};

// ─── OPERATIONS ANALYTICS METRICS ────────────────────────────────────────────

export const getOperationsAnalyticsMetrics = async () => {
  const schools = await getSchoolsDirectory();

  const totalSchools = schools.length;
  const totalLearners = schools.reduce((sum, s) => sum + (s.learners_count || 0), 0);
  const totalStaff = schools.reduce((sum, s) => sum + (s.staff_count || 0), 0);
  const healthyCount = schools.filter(s => s.health.healthStatus === 'Healthy').length;
  const warningCount = schools.filter(s => s.health.healthStatus === 'Warning').length;
  const criticalCount = schools.filter(s => s.health.healthStatus === 'Critical').length;
  const activeSubscriptions = schools.filter(s => s.subscription_status === 'Active').length;
  const trialSubscriptions = schools.filter(s => s.subscription_status === 'Trial').length;
  const avgHealthScore = totalSchools > 0
    ? Math.round(schools.reduce((sum, s) => sum + s.health.totalScore, 0) / totalSchools)
    : 0;
  const totalSubmittedScores = schools.reduce((sum, s) => sum + (s.submitted_scores_count || 0), 0);
  const totalScores = schools.reduce((sum, s) => sum + (s.total_scores_count || 0), 0);
  const overallScoreCompletionPct = totalScores > 0 ? Math.round((totalSubmittedScores / totalScores) * 100) : 0;
  const totalReportsGenerated = schools.reduce((sum, s) => sum + (s.reports_count || 0), 0);

  // Open support tickets
  const { count: openTickets } = await supabase
    .from('platform_support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Open');

  return {
    totalSchools,
    totalLearners,
    totalStaff,
    healthyCount,
    warningCount,
    criticalCount,
    activeSubscriptions,
    trialSubscriptions,
    avgHealthScore,
    overallScoreCompletionPct,
    totalReportsGenerated,
    openTickets: openTickets || 0,
  };
};

// ─── SCHOOL SUBSCRIPTION DETAILS ─────────────────────────────────────────────

export const getSchoolSubscription = async (schoolId) => {
  const { data, error } = await supabase
    .from('platform_school_subscriptions')
    .select('*')
    .eq('school_id', schoolId)
    .single();

  if (!error && data) return data;

  // Fallback: read from report_schools columns
  const { data: school } = await supabase
    .from('report_schools')
    .select('subscription_tier, subscription_status')
    .eq('id', schoolId)
    .single();

  return {
    school_id: schoolId,
    tier: school?.subscription_tier || 'Standard',
    status: school?.subscription_status || 'Active',
    renewal_date: null,
    price_ghs: 2500,
  };
};
