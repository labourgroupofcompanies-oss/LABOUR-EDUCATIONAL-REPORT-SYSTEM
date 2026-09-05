/**
 * systemDataCollector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-Time System Data Collector Engine (Zero API Cost)
 *
 * Provides deep, live data collection across all Dexie IndexedDB stores and
 * Supabase tables. Used by the Operations Copilot to answer detailed queries
 * about learners, classes, scores, teachers, finances, and communications.
 *
 * All queries run locally or against the authenticated Supabase client.
 * No external API calls, no LLM tokens, 100% private.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../lib/db';

/* ─── helpers ──────────────────────────────────────────────────────────────── */

const safeCount = async (table) => {
  try { return await db[table].count(); } catch { return 0; }
};

const safeToArray = async (table) => {
  try { return await db[table].toArray(); } catch { return []; }
};

/**
 * 1. TABLE CENSUS & SYNC AUDIT
 * Returns record counts for every Dexie store and identifies outbox queue state.
 */
export const collectTableCensus = async () => {
  const stores = [
    'schools', 'settings', 'academicYears', 'terms', 'classes', 'subjects',
    'profiles', 'learners', 'teacherAssignments', 'scores', 'classSubjects',
    'reportSummaries', 'parentAccounts', 'announcements', 'messages',
    'notifications', 'outbox', 'payments', 'feeStructure', 'feeTransactions',
    'paymentAllocations', 'cashbookClosings', 'walletLedger', 'referrals',
    'recycleBin', 'auditLogs', 'financialAuditLogs', 'systemEvents'
  ];

  const counts = {};
  await Promise.all(stores.map(async (s) => {
    counts[s] = db[s] ? await safeCount(s) : null;
  }));

  // Outbox breakdown
  let outboxPending = 0, outboxFailed = 0, outboxTotal = 0;
  try {
    const outbox = await db.outbox.toArray();
    outboxTotal = outbox.length;
    outboxPending = outbox.filter(o => !o.status || o.status === 'pending').length;
    outboxFailed  = outbox.filter(o => o.status === 'failed').length;
  } catch { /* skip */ }

  // Unsynced learners
  let unsyncedLearners = 0;
  try { unsyncedLearners = await db.learners.where('synced').equals(0).count(); } catch { /* skip */ }

  // Unsynced scores
  let unsyncedScores = 0;
  try { unsyncedScores = await db.scores.where('isSubmitted').equals(0).count(); } catch { /* skip */ }

  return {
    counts,
    outbox: { total: outboxTotal, pending: outboxPending, failed: outboxFailed },
    unsynced: { learners: unsyncedLearners, scores: unsyncedScores }
  };
};


/**
 * 2. CLASS ROSTER & ENROLLMENT BREAKDOWN
 * Returns every class across all schools with learner headcount, teacher, and category.
 */
export const collectClassRosters = async (filterSchoolId = null) => {
  try {
    let classes = await safeToArray('classes');
    let learners = await safeToArray('learners');
    let profiles = await safeToArray('profiles');
    let schools  = await safeToArray('schools');
    let teacherAssignments = await safeToArray('teacherAssignments');

    if (filterSchoolId) {
      const sid = String(filterSchoolId);
      classes  = classes.filter(c => String(c.schoolId) === sid);
      learners = learners.filter(l => String(l.schoolId) === sid);
    }

    // Build school lookup
    const schoolMap = {};
    schools.forEach(s => { schoolMap[String(s.id)] = s.name; });

    // Build teacher (profile) lookup
    const teacherMap = {};
    profiles.filter(p => p.role === 'class_teacher' || p.role === 'teacher').forEach(p => {
      teacherMap[String(p.id)] = p.fullName || p.email || 'Unknown';
    });

    // Build class-teacher mapping from assignments
    const classTeacherMap = {};
    teacherAssignments.forEach(a => {
      if (!classTeacherMap[String(a.classId)]) {
        classTeacherMap[String(a.classId)] = a.teacherId;
      }
    });

    // Count learners per class
    const learnersByClass = {};
    learners.forEach(l => {
      const cid = String(l.currentClassId || 'unassigned');
      if (!learnersByClass[cid]) learnersByClass[cid] = { total: 0, active: 0, alumni: 0 };
      learnersByClass[cid].total++;
      const status = (l.status || 'Active').toLowerCase();
      if (status === 'active') learnersByClass[cid].active++;
      else if (status === 'alumni') learnersByClass[cid].alumni++;
    });

    const rows = classes.map(c => {
      const cid = String(c.id);
      const counts = learnersByClass[cid] || { total: 0, active: 0, alumni: 0 };
      const teacherId = classTeacherMap[cid];
      const teacherName = teacherId ? (teacherMap[String(teacherId)] || 'Unassigned') : 'Unassigned';
      return {
        id: c.id,
        schoolId: c.schoolId,
        schoolName: schoolMap[String(c.schoolId)] || 'Unknown School',
        name: c.name,
        category: c.category || 'Primary',
        totalLearners: counts.total,
        activeLearners: counts.active,
        alumni: counts.alumni,
        classTeacher: teacherName
      };
    });

    rows.sort((a, b) => b.totalLearners - a.totalLearners);
    return rows;
  } catch (e) {
    console.error('[DataCollector] collectClassRosters failed:', e);
    return [];
  }
};


/**
 * 3. DEEP LEARNER SEARCH
 * Searches by full name, reg number, learnerId, or class name.
 */
export const searchLearners = async (query) => {
  try {
    const q = (query || '').toLowerCase().trim();
    if (!q || q.length < 2) return [];

    const learners = await safeToArray('learners');
    const classes  = await safeToArray('classes');
    const schools  = await safeToArray('schools');
    const reports  = await safeToArray('reportSummaries');

    const classMap  = {};
    classes.forEach(c => { classMap[String(c.id)] = c.name; });
    const schoolMap = {};
    schools.forEach(s => { schoolMap[String(s.id)] = s.name; });

    // Report summary lookup: learnerId → count
    const reportCountMap = {};
    reports.forEach(r => {
      const lid = String(r.learnerId || r.learner_id || '');
      if (lid) reportCountMap[lid] = (reportCountMap[lid] || 0) + 1;
    });

    const matches = learners.filter(l => {
      const name = (l.fullName || `${l.firstName || ''} ${l.lastName || ''}`).toLowerCase();
      const reg  = (l.regNumber || l.learnerId || '').toLowerCase();
      const cls  = classMap[String(l.currentClassId || '')] || '';
      return name.includes(q) || reg.includes(q) || cls.toLowerCase().includes(q);
    });

    return matches.slice(0, 20).map(l => ({
      id: l.id,
      fullName: l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
      regNumber: l.regNumber || l.learnerId || 'N/A',
      status: l.status || 'Active',
      className: classMap[String(l.currentClassId || '')] || 'Unassigned',
      schoolName: schoolMap[String(l.schoolId || '')] || 'Unknown',
      reportsGenerated: reportCountMap[String(l.id)] || 0,
      synced: !!l.synced
    }));
  } catch (e) {
    console.error('[DataCollector] searchLearners failed:', e);
    return [];
  }
};


/**
 * 4. ACADEMIC SCORE & REPORT ANALYTICS
 * Breaks down score entry status and report card generation across the system.
 */
export const collectAcademicAnalytics = async () => {
  try {
    const [scores, reports, terms, academicYears, subjects, classes, schools] = await Promise.all([
      safeToArray('scores'),
      safeToArray('reportSummaries'),
      safeToArray('terms'),
      safeToArray('academicYears'),
      safeToArray('subjects'),
      safeToArray('classes'),
      safeToArray('schools')
    ]);

    const totalScores     = scores.length;
    const submitted       = scores.filter(s => s.isSubmitted === 1 || s.isSubmitted === true).length;
    const draft           = totalScores - submitted;
    const completionRate  = totalScores > 0 ? Math.round((submitted / totalScores) * 100) : 0;

    const totalReports    = reports.length;
    const releasedReports = reports.filter(r => r.isReleased === 1 || r.isReleased === true).length;
    const pendingReports  = totalReports - releasedReports;

    // Group by term
    const termMap = {};
    terms.forEach(t => { termMap[String(t.id)] = t.name; });

    const scoresByTerm = {};
    scores.forEach(s => {
      const termName = s.term || termMap[String(s.termId)] || 'Unknown';
      if (!scoresByTerm[termName]) scoresByTerm[termName] = { total: 0, submitted: 0 };
      scoresByTerm[termName].total++;
      if (s.isSubmitted === 1 || s.isSubmitted === true) scoresByTerm[termName].submitted++;
    });

    // Per-school breakdown
    const schoolMap = {};
    schools.forEach(s => { schoolMap[String(s.id)] = s.name; });

    const scoresBySchool = {};
    scores.forEach(s => {
      const sname = schoolMap[String(s.schoolId)] || `School ${s.schoolId}`;
      if (!scoresBySchool[sname]) scoresBySchool[sname] = { total: 0, submitted: 0 };
      scoresBySchool[sname].total++;
      if (s.isSubmitted === 1 || s.isSubmitted === true) scoresBySchool[sname].submitted++;
    });

    const topSchoolsByScores = Object.entries(scoresBySchool)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);

    return {
      scores: { total: totalScores, submitted, draft, completionRate },
      reports: { total: totalReports, released: releasedReports, pending: pendingReports },
      byTerm: scoresByTerm,
      topSchoolsByScores,
      totalSubjects: subjects.length,
      totalClasses: classes.length
    };
  } catch (e) {
    console.error('[DataCollector] collectAcademicAnalytics failed:', e);
    return null;
  }
};


/**
 * 5. TEACHER & SUBJECT ASSIGNMENT MATRIX
 * Maps staff to classes/subjects, identifies gaps.
 */
export const collectTeacherMatrix = async (filterSchoolId = null) => {
  try {
    let profiles    = await safeToArray('profiles');
    let assignments = await safeToArray('teacherAssignments');
    let classes     = await safeToArray('classes');
    let subjects    = await safeToArray('subjects');
    let schools     = await safeToArray('schools');

    if (filterSchoolId) {
      const sid = String(filterSchoolId);
      profiles    = profiles.filter(p => String(p.schoolId) === sid);
      assignments = assignments.filter(a => String(a.schoolId) === sid);
      classes     = classes.filter(c => String(c.schoolId) === sid);
      subjects    = subjects.filter(s => String(s.schoolId) === sid);
    }

    const schoolMap  = {};
    schools.forEach(s => { schoolMap[String(s.id)] = s.name; });

    const classMap = {};
    classes.forEach(c => { classMap[String(c.id)] = c.name; });

    const subjectMap = {};
    subjects.forEach(s => { subjectMap[String(s.id)] = s.name; });

    const teachers = profiles.filter(p => ['teacher', 'class_teacher', 'head_teacher'].includes(p.role));

    // Build assignment map: teacherId -> [{class, subject}]
    const assignMap = {};
    assignments.forEach(a => {
      const tid = String(a.teacherId);
      if (!assignMap[tid]) assignMap[tid] = [];
      assignMap[tid].push({
        className: classMap[String(a.classId)] || 'Unknown',
        subjectName: subjectMap[String(a.subjectId)] || 'Unknown'
      });
    });

    // Classes with no teacher assigned
    const assignedClassIds = new Set(assignments.map(a => String(a.classId)));
    const unassignedClasses = classes.filter(c => !assignedClassIds.has(String(c.id)));

    return {
      totalTeachers: teachers.length,
      totalClasses: classes.length,
      totalSubjects: subjects.length,
      unassignedClasses: unassignedClasses.map(c => ({
        id: c.id,
        name: c.name,
        schoolName: schoolMap[String(c.schoolId)] || 'Unknown'
      })),
      teacherList: teachers.slice(0, 30).map(t => ({
        id: t.id,
        name: t.fullName || t.email,
        role: t.role,
        schoolName: schoolMap[String(t.schoolId)] || 'Unknown',
        assignedCount: (assignMap[String(t.id)] || []).length,
        assignments: (assignMap[String(t.id)] || []).slice(0, 5)
      }))
    };
  } catch (e) {
    console.error('[DataCollector] collectTeacherMatrix failed:', e);
    return null;
  }
};


/**
 * 6. FINANCIAL & PAYMENT LEDGER
 * Aggregates payments, fee transactions, and wallet ledger entries.
 */
export const collectFinancialData = async () => {
  try {
    const [payments, feeTransactions, walletLedger, schools] = await Promise.all([
      safeToArray('payments'),
      safeToArray('feeTransactions'),
      safeToArray('walletLedger'),
      safeToArray('schools')
    ]);

    const schoolMap = {};
    schools.forEach(s => { schoolMap[String(s.id)] = s.name; });

    // Payment totals
    const totalPaymentAmount = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const pendingSync = payments.filter(p => !p.synced).length;

    // Fee transactions
    const totalFeeAmount = feeTransactions.reduce((sum, t) => sum + (Number(t.amount || t.totalAmount) || 0), 0);
    const paidTx   = feeTransactions.filter(t => t.receiptStatus === 'paid' || t.transactionType === 'payment').length;
    const creditTx = feeTransactions.filter(t => t.transactionType === 'credit' || t.transactionType === 'waiver').length;

    // Wallet ledger breakdown
    const credits  = walletLedger.filter(l => l.type === 'credit' || l.amount > 0);
    const debits   = walletLedger.filter(l => l.type === 'debit' || l.amount < 0);
    const totalCredits = credits.reduce((sum, l) => sum + Math.abs(Number(l.amount) || 0), 0);
    const totalDebits  = debits.reduce((sum, l)  => sum + Math.abs(Number(l.amount) || 0), 0);

    // Top 5 schools by payment volume
    const payBySchool = {};
    payments.forEach(p => {
      const sname = schoolMap[String(p.schoolId)] || `School ${p.schoolId}`;
      payBySchool[sname] = (payBySchool[sname] || 0) + (Number(p.amount) || 0);
    });
    const topByPayment = Object.entries(payBySchool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Recent 10 payments
    const recentPayments = [...payments]
      .sort((a, b) => new Date(b.paymentDate || b.created_at || 0) - new Date(a.paymentDate || a.created_at || 0))
      .slice(0, 10)
      .map(p => ({
        school: schoolMap[String(p.schoolId)] || 'Unknown',
        amount: Number(p.amount) || 0,
        method: p.paymentMethod || 'N/A',
        date: p.paymentDate || p.created_at || 'N/A',
        synced: !!p.synced
      }));

    return {
      payments: { total: payments.length, totalAmount: totalPaymentAmount, pendingSync },
      feeTransactions: { total: feeTransactions.length, totalAmount: totalFeeAmount, paid: paidTx, credit: creditTx },
      walletLedger: { credits: credits.length, debits: debits.length, totalCredits, totalDebits },
      topByPayment,
      recentPayments
    };
  } catch (e) {
    console.error('[DataCollector] collectFinancialData failed:', e);
    return null;
  }
};


/**
 * 7. PARENT PORTAL & COMMUNICATIONS AUDIT
 * Counts parent accounts, messages, announcements, notifications.
 */
export const collectCommunicationsAudit = async () => {
  try {
    const [parentAccounts, messages, announcements, notifications, schools] = await Promise.all([
      safeToArray('parentAccounts'),
      safeToArray('messages'),
      safeToArray('announcements'),
      safeToArray('notifications'),
      safeToArray('schools')
    ]);

    const schoolMap = {};
    schools.forEach(s => { schoolMap[String(s.id)] = s.name; });

    // Messages breakdown
    const parentMsgs     = messages.filter(m => m.senderRole === 'parent');
    const teacherMsgs    = messages.filter(m => m.senderRole === 'teacher' || m.senderRole === 'head_teacher');
    const unreadMessages = messages.filter(m => m.isRead === 0 || m.isRead === false);

    // Announcements
    const syncedAnn  = announcements.filter(a => a.synced);
    const pendingAnn = announcements.filter(a => !a.synced);

    // Unread notifications
    const unreadNotif = notifications.filter(n => n.isRead === 0 || n.isRead === false);

    // Schools with most engagement (by message count)
    const msgsBySchool = {};
    messages.forEach(m => {
      const sname = schoolMap[String(m.schoolId)] || `School ${m.schoolId}`;
      msgsBySchool[sname] = (msgsBySchool[sname] || 0) + 1;
    });
    const topEngaged = Object.entries(msgsBySchool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      parentAccounts: parentAccounts.length,
      messages: {
        total: messages.length,
        fromParents: parentMsgs.length,
        fromTeachers: teacherMsgs.length,
        unread: unreadMessages.length
      },
      announcements: {
        total: announcements.length,
        synced: syncedAnn.length,
        pending: pendingAnn.length
      },
      notifications: {
        total: notifications.length,
        unread: unreadNotif.length
      },
      topEngagedSchools: topEngaged
    };
  } catch (e) {
    console.error('[DataCollector] collectCommunicationsAudit failed:', e);
    return null;
  }
};
