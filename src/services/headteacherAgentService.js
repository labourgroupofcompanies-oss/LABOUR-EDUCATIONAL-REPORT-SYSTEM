/**
 * headteacherAgentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Headteacher Portal Intelligence Agent (Zero-API-Cost Internal Query Engine)
 *
 * Strictly scoped to the authenticated headteacher's school context (schoolId).
 * Enforces enterprise tenant isolation via tenantGuard.
 * Queries local Dexie IndexedDB stores with real-time accuracy and zero latency.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import db from '../lib/db';
import { assertSchoolContext } from '../repositories/tenantGuard';
import { handleHeadteacherErrorQuery } from './errorIntelligence';
import { findBestActivityGuide, isDataOrCensusQuery } from './portalActivityAssistant';

/**
 * Format currency in Ghana Cedis
 */
const formatCurrency = (amount) => {
  const num = Number(amount || 0);
  return 'GH₵ ' + num.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Normalize input query
 */
const normalize = (text) => (text || '').toLowerCase().trim();

/**
 * Safe Dexie query helpers scoped to a school
 */
const getSchoolRecords = async (tableName, schoolId) => {
  try {
    const sId = String(schoolId);
    if (!db[tableName]) return [];
    return await db[tableName].filter(r => String(r.schoolId || r.school_id) === sId).toArray();
  } catch (err) {
    console.warn(`[HeadteacherAgent] Error reading ${tableName}:`, err);
    return [];
  }
};

/**
 * Core Headteacher Query Engine
 * @param {string} userQuery - The natural language question
 * @param {string|number} schoolId - The authenticated headteacher's schoolId (mandatory tenant context)
 */
export const askHeadteacherAgent = async (userQuery, schoolId) => {
  const startTime = performance.now();

  // 1. Strict Tenant Isolation Guard
  let cleanSchoolId;
  try {
    cleanSchoolId = assertSchoolContext(schoolId, 'askHeadteacherAgent');
  } catch (guardErr) {
    return {
      text: '### 🔒 Security Notice\nUnable to verify your school context. Please ensure you are logged into your school account.',
      suggestions: ['Dashboard overview'],
      queryTimeMs: 0
    };
  }

  const q = normalize(userQuery);

  if (!q) {
    return {
      text: 'Please ask a question regarding your school learners, teacher submissions, report cards, wallet balance, or class breakdown.',
      suggestions: [
        'Score submission status',
        'Are report cards released?',
        'Class enrollment breakdown',
        'Teacher assignments',
        'School wallet balance'
      ],
      queryTimeMs: 0
    };
  }

  try {
    // Pre-load school profile for name and context
    let schoolInfo = await db.schools.get(cleanSchoolId);
    if (!schoolInfo) {
      // Sometimes schoolId is numeric in local db
      const numId = Number(cleanSchoolId);
      if (!isNaN(numId)) {
        schoolInfo = await db.schools.get(numId);
      }
    }
    const schoolName = schoolInfo?.name || 'Your School';

    // ── 1. GREETINGS & CAPABILITIES ──
    if (
      q === 'hi' || q === 'hello' || q === 'hey' ||
      q.includes('who are you') || q.includes('what can you do') || q.includes('help')
    ) {
      return {
        text: `### 👋 Hello Headteacher! Welcome to your School Copilot
Ask me anything you want from your portal and I will help you do it! I analyze your school records in real time to give you instant answers and step-by-step guidance for **${schoolName}**.

**Here is what you can ask me anytime:**
- 📝 **Assessment Progress**: *"Score submission status"*, *"Which teachers haven't submitted scores?"*
- 📄 **Terminal Reports**: *"Are all report cards released?"*, *"How many reports generated?"*
- 👥 **Learner Census**: *"How many learners do we have?"*, *"Class enrollment breakdown"*
- 🔍 **Student Search**: *"Find student [Name or Reg Number]"*
- 👩‍🏫 **Staff & Teaching Load**: *"Show teacher assignments"*, *"Who teaches Primary 4?"*
- 💳 **Finances & Wallet**: *"School wallet balance"*, *"Total fee collection"*
- 🔄 **Offline Sync**: *"Are there unsynced records?"*, *"Sync status"*
- 🩺 **Error & Sync Diagnostics**: *"Are there any errors?"*, *"Why did submission fail?"*`,
        suggestions: [
          'Score submission status',
          'Are there any errors?',
          'Are report cards released?',
          'Class enrollment breakdown',
          'School wallet balance'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 2. ERROR, EXCEPTION & DIAGNOSTIC INTELLIGENCE ──
    if (
      q.includes('error') || q.includes('fail') || q.includes('issue') ||
      q.includes('problem') || q.includes('bug') || q.includes('why did') ||
      q.includes('lost data') || q.includes('is data safe') || q.includes('how to fix')
    ) {
      return await handleHeadteacherErrorQuery(userQuery, cleanSchoolId, schoolName, startTime);
    }

    // ── 3. HOW-TO ACTIVITY GUIDES & STEP-BY-STEP WORKFLOWS ──
    const isDataQuery = isDataOrCensusQuery(userQuery);
    const activityGuide = !isDataQuery ? findBestActivityGuide(userQuery, 'headteacher') : null;
    if (activityGuide && (
      q.includes('how to') || q.includes('how do i') || q.includes('how can i') ||
      q.includes('how do we') || q.includes('how does') || q.includes('steps') ||
      q.includes('guide') || q.includes('where do i') || q.includes('where can i') ||
      q.includes('what should i do') || q.includes('way to') || q.includes('procedure') ||
      q.includes('walkthrough')
    )) {
      const unreleasedCount = db.reportSummaries
        ? await db.reportSummaries.filter(r => String(r.schoolId || r.school_id) === String(cleanSchoolId) && (r.isReleased === 0 || r.isReleased === false)).count()
        : 0;

      const walletBal = Number(schoolInfo?.wallet_balance || schoolInfo?.walletBalance || 0);

      const guideText = activityGuide.generateGuide({
        role: 'headteacher',
        schoolName,
        unreleasedReportsCount: unreleasedCount,
        walletBalance: formatCurrency(walletBal)
      });

      return {
        text: guideText,
        suggestions: [
          'Score submission status',
          'Are report cards released?',
          'How to bulk upload students with Excel',
          'School wallet balance'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 4. SCORE ENTRY & ASSESSMENT SUBMISSION STATUS ──
    if (
      q.includes('score') || q.includes('grade') || q.includes('assessment') ||
      q.includes('exam') || q.includes('submission') || q.includes('submit') ||
      q.includes('mark')
    ) {
      const [scores, classes, subjects, teacherAssignments, profiles] = await Promise.all([
        getSchoolRecords('scores', cleanSchoolId),
        getSchoolRecords('classes', cleanSchoolId),
        getSchoolRecords('subjects', cleanSchoolId),
        getSchoolRecords('teacherAssignments', cleanSchoolId),
        getSchoolRecords('profiles', cleanSchoolId)
      ]);

      const totalScores = scores.length;
      const submittedScores = scores.filter(s => s.isSubmitted === 1 || s.isSubmitted === true).length;
      const draftScores = totalScores - submittedScores;
      const completionRate = totalScores > 0 ? Math.round((submittedScores / totalScores) * 100) : 0;

      // Class map & Teacher map
      const classMap = {};
      classes.forEach(c => { classMap[String(c.id)] = c.name; });

      const teacherMap = {};
      profiles.forEach(p => { teacherMap[String(p.id)] = p.fullName || p.email || 'Teacher'; });

      // Build breakdown per class
      const classScoreCounts = {};
      classes.forEach(c => {
        classScoreCounts[String(c.id)] = { name: c.name, total: 0, submitted: 0 };
      });

      scores.forEach(s => {
        const cid = String(s.classId);
        if (!classScoreCounts[cid]) {
          classScoreCounts[cid] = { name: classMap[cid] || `Class ${cid}`, total: 0, submitted: 0 };
        }
        classScoreCounts[cid].total++;
        if (s.isSubmitted === 1 || s.isSubmitted === true) {
          classScoreCounts[cid].submitted++;
        }
      });

      let text = `### 📊 Score Submission & Assessment Status
Overview for **${schoolName}** across configured classes:

| Metric | Count | Status |
| :--- | :--- | :--- |
| **Total Recorded Marks** | **${totalScores.toLocaleString()}** | Overall records |
| **Submitted (Finalized)** | **${submittedScores.toLocaleString()}** | **${completionRate}% Completed** |
| **Draft (Pending Submission)** | **${draftScores.toLocaleString()}** | ${100 - completionRate}% Remaining |

`;

      // Class-by-class breakdown
      const classList = Object.values(classScoreCounts).filter(c => c.total > 0);
      if (classList.length > 0) {
        text += `#### 🏫 Class Submission Progress\n`;
        text += `| Class | Total Marks | Submitted | Completion |\n| :--- | :--- | :--- | :--- |\n`;
        classList.forEach(c => {
          const rate = c.total > 0 ? Math.round((c.submitted / c.total) * 100) : 0;
          const statusIcon = rate === 100 ? '✅ 100%' : (rate > 50 ? `⏳ ${rate}%` : `⚠️ ${rate}%`);
          text += `| **${c.name}** | ${c.total} | ${c.submitted} | ${statusIcon} |\n`;
        });
      } else {
        text += `*No assessment scores recorded yet for this term. Teachers can begin entering marks under [Score Entry](/scores).*\n`;
      }

      if (draftScores > 0) {
        text += `\n👉 **Action**: Teachers can finalize their submissions from [Score Entry](/scores), or you can review all class scores from the [Master Score Audit](/all-scores).`;
      }

      return {
        text,
        suggestions: [
          'Are report cards released?',
          'Teacher assignments',
          'Class enrollment breakdown'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 3. TERMINAL REPORT CARDS & RELEASE STATUS ──
    if (
      q.includes('report') || q.includes('card') || q.includes('release') ||
      q.includes('parent see') || q.includes('publish')
    ) {
      const [reports, learners, classes] = await Promise.all([
        getSchoolRecords('reportSummaries', cleanSchoolId),
        getSchoolRecords('learners', cleanSchoolId),
        getSchoolRecords('classes', cleanSchoolId)
      ]);

      const activeLearners = learners.filter(l => (l.status || 'Active').toLowerCase() === 'active');
      const totalReports = reports.length;
      const releasedReports = reports.filter(r => r.isReleased === 1 || r.isReleased === true).length;
      const pendingRelease = totalReports - releasedReports;
      const coverageRate = activeLearners.length > 0 ? Math.min(100, Math.round((totalReports / activeLearners.length) * 100)) : 0;

      let text = `### 📄 Terminal Report Card Status
Current report production and release metrics for **${schoolName}**:

| Parameter | Count | Status |
| :--- | :--- | :--- |
| **Active Enrolled Learners** | **${activeLearners.length.toLocaleString()}** | Target headcount |
| **Reports Generated** | **${totalReports.toLocaleString()}** | **${coverageRate}% Coverage** |
| **Released to Parents** | **${releasedReports.toLocaleString()}** | ${releasedReports > 0 ? '✅ Visible on Parent Portal' : '🔒 Not yet released'} |
| **Awaiting Release** | **${pendingRelease.toLocaleString()}** | ${pendingRelease > 0 ? '⏳ Pending Headteacher approval' : '✅ None pending'} |

`;

      if (pendingRelease > 0) {
        text += `⚠️ You have **${pendingRelease} report card(s)** ready but not yet released to parents.\n\n👉 **[Click here to open Reports Management](/reports)** to review and publish them to parents with a single click.`;
      } else if (totalReports === 0) {
        text += `*No report cards generated yet for this term. Once teachers submit assessment scores, you can generate reports under [Reports Management](/reports).*`;
      } else {
        text += `✅ **All generated report cards are currently released and accessible by parents via the Parent Portal.**`;
      }

      return {
        text,
        suggestions: [
          'Score submission status',
          'Class enrollment breakdown',
          'School wallet balance'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 4. LEARNER CENSUS & CLASS ENROLLMENT BREAKDOWN ──
    if (
      q.includes('learner') || q.includes('student') || q.includes('pupil') ||
      q.includes('census') || q.includes('enrollment') || q.includes('population') ||
      q.includes('how many in each') || q.includes('class list') || q.includes('breakdown') ||
      q.includes('headcount') || q.includes('alumni') || q.includes('how many classes') ||
      q.includes('number of classes') || q.includes('total classes')
    ) {
      const [learners, classes, teacherAssignments, profiles] = await Promise.all([
        getSchoolRecords('learners', cleanSchoolId),
        getSchoolRecords('classes', cleanSchoolId),
        getSchoolRecords('teacherAssignments', cleanSchoolId),
        getSchoolRecords('profiles', cleanSchoolId)
      ]);

      const active = learners.filter(l => (l.status || 'Active').toLowerCase() === 'active');
      const alumni = learners.filter(l => (l.status || '').toLowerCase() === 'alumni');
      const total = learners.length;

      // Class teacher map
      const teacherMap = {};
      profiles.forEach(p => { teacherMap[String(p.id)] = p.fullName || p.email; });

      const classTeacherMap = {};
      teacherAssignments.forEach(a => {
        if (!classTeacherMap[String(a.classId)]) {
          classTeacherMap[String(a.classId)] = teacherMap[String(a.teacherId)] || 'Assigned';
        }
      });

      // Count per class
      const learnersPerClass = {};
      classes.forEach(c => {
        learnersPerClass[String(c.id)] = {
          name: c.name,
          category: c.category || 'Primary',
          active: 0,
          alumni: 0,
          total: 0,
          teacher: classTeacherMap[String(c.id)] || 'Unassigned'
        };
      });

      learners.forEach(l => {
        const cid = String(l.currentClassId || 'unassigned');
        if (!learnersPerClass[cid]) {
          learnersPerClass[cid] = {
            name: 'Unassigned',
            category: '—',
            active: 0,
            alumni: 0,
            total: 0,
            teacher: '—'
          };
        }
        learnersPerClass[cid].total++;
        if ((l.status || 'Active').toLowerCase() === 'active') {
          learnersPerClass[cid].active++;
        } else if ((l.status || '').toLowerCase() === 'alumni') {
          learnersPerClass[cid].alumni++;
        }
      });

      let text = `### 👥 Learner Census & Enrollment Breakdown
School enrollment overview for **${schoolName}**:

| Category | Headcount | Notes |
| :--- | :--- | :--- |
| **Active Learners** | **${active.length.toLocaleString()}** | Currently in school |
| **Alumni / Graduated** | **${alumni.length.toLocaleString()}** | Former students |
| **Total Registered** | **${total.toLocaleString()}** | All records on file |
| **Configured Classes** | **${classes.length}** | Active classes |

`;

      const classRows = Object.values(learnersPerClass).sort((a, b) => b.active - a.active);
      if (classRows.length > 0) {
        text += `#### 🏫 Enrollment by Class\n`;
        text += `| Class | Category | Active | Total | Class Teacher |\n| :--- | :--- | :--- | :--- | :--- |\n`;
        classRows.forEach(c => {
          text += `| **${c.name}** | ${c.category} | **${c.active}** | ${c.total} | ${c.teacher} |\n`;
        });
      }

      text += `\n👉 Manage learner registrations, status, or details in **[Learners Directory](/learners)**.`;

      return {
        text,
        suggestions: [
          'Score submission status',
          'Teacher assignments',
          'Are report cards released?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 5. SEARCH SPECIFIC LEARNER BY NAME OR REG NUMBER ──
    const searchMatch = q.match(/(?:find|search|who is|look up|locate|check|show)\s+(?:student|learner|pupil)?\s*(.+)/i);
    if (
      searchMatch ||
      q.includes('find student') || q.includes('search learner') ||
      q.includes('find learner') || q.includes('find pupil')
    ) {
      const term = searchMatch
        ? searchMatch[1].trim().toLowerCase()
        : q.replace(/^(find|search|who is|locate|look up|check|show)\s*/i, '').trim().toLowerCase();

      if (!term || term.length < 2) {
        return {
          text: '### 🔍 Learner Search\nPlease provide a student name or registration number. Example: *"Find student Kofi Mensah"* or *"Search learner REG-002"*.',
          suggestions: ['Class enrollment breakdown', 'Score submission status'],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      const [learners, classes, reports] = await Promise.all([
        getSchoolRecords('learners', cleanSchoolId),
        getSchoolRecords('classes', cleanSchoolId),
        getSchoolRecords('reportSummaries', cleanSchoolId)
      ]);

      const classMap = {};
      classes.forEach(c => { classMap[String(c.id)] = c.name; });

      const reportCountMap = {};
      reports.forEach(r => {
        const lid = String(r.learnerId || r.learner_id || '');
        if (lid) reportCountMap[lid] = (reportCountMap[lid] || 0) + 1;
      });

      const matches = learners.filter(l => {
        const fullName = (l.fullName || `${l.firstName || ''} ${l.lastName || ''}`).toLowerCase();
        const reg = (l.regNumber || l.learnerId || '').toLowerCase();
        const cls = (classMap[String(l.currentClassId || '')] || '').toLowerCase();
        return fullName.includes(term) || reg.includes(term) || cls.includes(term);
      });

      if (matches.length === 0) {
        return {
          text: `### 🔍 Learner Search — No Results\nNo learner matching **"${term}"** was found in **${schoolName}**'s records. Check the spelling or try their registration number.`,
          suggestions: ['Class enrollment breakdown', 'Score submission status'],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let text = `### 🔍 Search Results for "${term}"\nFound **${matches.length}** matching student(s) in **${schoolName}**:\n\n`;
      text += `| Name | Reg # | Class | Status | Reports | Synced |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      matches.slice(0, 15).forEach(m => {
        const sName = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim();
        const reg = m.regNumber || m.learnerId || 'N/A';
        const cls = classMap[String(m.currentClassId)] || 'Unassigned';
        const repCount = reportCountMap[String(m.id)] || 0;
        text += `| **${sName}** | \`${reg}\` | ${cls} | ${m.status || 'Active'} | ${repCount} | ${m.synced ? '✅' : '⏳'} |\n`;
      });

      text += `\n👉 View all details in **[Learners Directory](/learners)**.`;

      return {
        text,
        suggestions: [
          'Score submission status',
          'Class enrollment breakdown',
          'Are report cards released?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 6. TEACHER & STAFF ASSIGNMENT MATRIX ──
    if (
      q.includes('teacher') || q.includes('staff') || q.includes('who teaches') ||
      q.includes('assignment') || q.includes('teaching load') || q.includes('subject teacher') ||
      q.includes('unassigned') || q.includes('faculty')
    ) {
      const [profiles, assignments, classes, subjects] = await Promise.all([
        getSchoolRecords('profiles', cleanSchoolId),
        getSchoolRecords('teacherAssignments', cleanSchoolId),
        getSchoolRecords('classes', cleanSchoolId),
        getSchoolRecords('subjects', cleanSchoolId)
      ]);

      const staffList = profiles.filter(p => ['teacher', 'class_teacher', 'head_teacher'].includes(p.role));

      const classMap = {};
      classes.forEach(c => { classMap[String(c.id)] = c.name; });

      const subjectMap = {};
      subjects.forEach(s => { subjectMap[String(s.id)] = s.name; });

      // Build assignments map: teacherId -> list of {className, subjectName}
      const assignMap = {};
      const assignedClassIds = new Set();
      assignments.forEach(a => {
        const tid = String(a.teacherId);
        if (!assignMap[tid]) assignMap[tid] = [];
        assignMap[tid].push({
          className: classMap[String(a.classId)] || 'Unknown Class',
          subjectName: subjectMap[String(a.subjectId)] || 'Subject'
        });
        assignedClassIds.add(String(a.classId));
      });

      const unassignedClasses = classes.filter(c => !assignedClassIds.has(String(c.id)));

      const teacherCount = staffList.length;
      const teacherCountLead = teacherCount === 1
        ? `There is **1 registered teacher**`
        : `There are **${teacherCount} registered teachers**`;

      let text = `### 👩‍🏫 Teaching Staff (${teacherCount} Registered)
${teacherCountLead} at **${schoolName}**.\n\n` +
`| Metric | Count | Status |
| :--- | :--- | :--- |
| **Registered Teaching Staff** | **${staffList.length}** | Active teachers & staff |
| **Configured Classes** | **${classes.length}** | Total classes |
| **Subjects Offered** | **${subjects.length}** | Curriculum subjects |
| **Classes with Assigned Teachers** | **${assignedClassIds.size}** of ${classes.length} | ${unassignedClasses.length > 0 ? `⚠️ ${unassignedClasses.length} unassigned` : '✅ All assigned'} |

`;

      if (staffList.length === 0) {
        text += `👉 *No teachers are currently registered.* Go to **[Teachers & Staff](/teachers)** to add teachers and set up their logins.\n\n`;
      }

      if (unassignedClasses.length > 0) {
        text += `#### ⚠️ Classes Needing a Teacher\n`;
        unassignedClasses.forEach(c => {
          text += `- **${c.name}** (${c.category || 'Primary'})\n`;
        });
        text += '\n';
      }

      if (staffList.length > 0) {
        text += `#### 👨‍🏫 Staff Teaching Allocations\n`;
        text += `| Teacher | Role | Total Assignments | Classes / Subjects |\n| :--- | :--- | :--- | :--- |\n`;
        staffList.forEach(t => {
          const allocs = assignMap[String(t.id)] || [];
          const allocSummary = allocs.length > 0
            ? allocs.slice(0, 3).map(a => `${a.className}: ${a.subjectName}`).join(', ') + (allocs.length > 3 ? ` (+${allocs.length - 3} more)` : '')
            : 'No classes assigned';
          text += `| **${t.fullName || t.email}** | ${t.role === 'head_teacher' ? 'Headteacher' : 'Teacher'} | **${allocs.length}** | ${allocSummary} |\n`;
        });
      }

      text += `\n👉 You can allocate staff or adjust subjects anytime in **[Teacher Management](/teachers)**.`;

      return {
        text,
        suggestions: [
          'Score submission status',
          'Class enrollment breakdown',
          'Are report cards released?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 7. WALLET BALANCE, BILLING & SUBSCRIPTION ──
    if (
      q.includes('wallet') || q.includes('balance') || q.includes('subscription') ||
      q.includes('billing') || q.includes('pay') || q.includes('top up') ||
      q.includes('fee') || q.includes('arrears') || q.includes('money')
    ) {
      const [payments, feeTransactions] = await Promise.all([
        getSchoolRecords('payments', cleanSchoolId),
        getSchoolRecords('feeTransactions', cleanSchoolId)
      ]);

      const walletBal = Number(schoolInfo?.wallet_balance || schoolInfo?.walletBalance || 0);
      const subTier = schoolInfo?.subscription_tier || 'Standard';
      const subStatus = schoolInfo?.subscription_status || 'Active';
      const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      let text = `### 💳 School Wallet & Subscription Standing
Financial overview for **${schoolName}**:

| Parameter | Standing | Details |
| :--- | :--- | :--- |
| **Available Wallet Balance** | **${formatCurrency(walletBal)}** | Instant credit for term billing |
| **Subscription Tier** | **${subTier}** | Status: **${subStatus}** |
| **Fee Payments Collected** | **${formatCurrency(totalCollected)}** | ${payments.length} recorded payments |
| **Fee Transactions** | **${feeTransactions.length}** | Receipts & billing ledger |

`;

      if (walletBal < 20) {
        text += `⚠️ **Low Balance Notice**: Your wallet balance is currently **${formatCurrency(walletBal)}**. To prevent service interruption during report card processing, top up your wallet via Mobile Money or Card.\n\n`;
      } else {
        text += `✅ **Wallet Standing Healthy**: Sufficient balance for current operational processing.\n\n`;
      }

      text += `👉 **[Click here to Top Up Wallet or View Invoices](/financials)**`;

      return {
        text,
        suggestions: [
          'Score submission status',
          'Are report cards released?',
          'Class enrollment breakdown'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 8. OFFLINE QUEUE & SYNC ENGINE STATUS ──
    if (
      q.includes('sync') || q.includes('offline') || q.includes('outbox') ||
      q.includes('unsynced') || q.includes('queue') || q.includes('pending') ||
      q.includes('internet')
    ) {
      const [outbox, learners, scores] = await Promise.all([
        getSchoolRecords('outbox', cleanSchoolId),
        getSchoolRecords('learners', cleanSchoolId),
        getSchoolRecords('scores', cleanSchoolId)
      ]);

      const pendingQueue = outbox.filter(o => !o.status || o.status === 'pending');
      const failedQueue = outbox.filter(o => o.status === 'failed');
      const unsyncedLearners = learners.filter(l => l.synced === 0 || l.synced === false);
      const draftScores = scores.filter(s => s.isSubmitted === 0 || s.isSubmitted === false);

      let text = `### 🔄 Internet & Saved Work Status
Connection and saved work for **${schoolName}**:

| Status Check | Standing | Meaning |
| :--- | :--- | :--- |
| **Internet Connection** | **${navigator.onLine ? '🟢 Online' : '🔴 Working Offline'}** | ${navigator.onLine ? 'Connected to school cloud' : 'Working offline — records are saved safely on this device'} |
| **Saved Work Waiting to Upload** | **${pendingQueue.length} item(s)** | ${pendingQueue.length > 0 ? '⏳ Will upload automatically when connected' : '✅ All work uploaded'} |
| **New Learner Profiles** | **${unsyncedLearners.length} profile(s)** | ${unsyncedLearners.length > 0 ? '⏳ Saved on this computer' : '✅ Synchronized with school cloud'} |
| **Teacher Draft Marks** | **${draftScores.length} score(s)** | Teachers have entered marks that await final submission |

`;

      if (pendingQueue.length > 0 && navigator.onLine) {
        text += `*The system is currently saving your work to the school cloud. You can also tap the Sync button at the top of your screen to upload immediately.*`;
      } else if (!navigator.onLine) {
        text += `*You are currently working offline. All grades entered, student updates, and report edits are safely saved on this computer and will upload as soon as you reconnect.*`;
      } else {
        text += `✅ **All school records are up to date and saved in the school cloud.**`;
      }

      return {
        text,
        suggestions: [
          'Score submission status',
          'Are report cards released?',
          'School wallet balance'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 9. SMART SCHOOL FALLBACK ──
    return {
      text: `### 🤔 Headteacher Copilot
I could not find an exact match for **"${userQuery}"** in your school's current database.

**Here are some operational queries I can answer immediately:**
- 📝 *"Score submission status"* — class-by-class completion rate
- 📄 *"Are report cards released?"* — parent release and publication status
- 👥 *"Class enrollment breakdown"* — active learners per class
- 🔍 *"Find student [Name or Reg #]"* — lookup student status and reports
- 👩‍🏫 *"Teacher assignments"* — staff matrix and unassigned classes
- 💳 *"School wallet balance"* — available credit and subscription tier
- 🔄 *"Sync status"* — saved offline records and connection`,
      suggestions: [
        'Score submission status',
        'Are report cards released?',
        'Class enrollment breakdown',
        'Teacher assignments',
        'School wallet balance'
      ],
      queryTimeMs: Math.round(performance.now() - startTime)
    };
  } catch (err) {
    console.error('[HeadteacherAgent] Error processing query:', err);
    return {
      text: `### ⚠️ Query Notice\nAn unexpected error occurred while analyzing school data: **${err.message || 'Unknown error'}**. Please try again.`,
      suggestions: ['Score submission status', 'Class enrollment breakdown'],
      queryTimeMs: Math.round(performance.now() - startTime)
    };
  }
};
