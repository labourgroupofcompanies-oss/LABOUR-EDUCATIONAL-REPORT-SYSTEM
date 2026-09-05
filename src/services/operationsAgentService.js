/**
 * operationsAgentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Operations Platform Intelligent Agent (Zero-API-Cost Internal Query Engine)
 * Parses natural language operational inquiries, queries live Supabase/Dexie data,
 * and formats structured, insightful responses with actionable navigation links.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getSchoolsDirectory,
  getOperationsAnalyticsMetrics,
  getSupportTickets,
  getInterventionsAuditLog
} from './operationsService';
import { referralAnalyticsService } from './referralAnalyticsService';
import { systemErrorTracker } from './systemErrorTracker';
import {
  collectTableCensus,
  collectClassRosters,
  searchLearners,
  collectAcademicAnalytics,
  collectTeacherMatrix,
  collectFinancialData,
  collectCommunicationsAudit
} from './systemDataCollector';

/**
 * Clean and normalize text query
 */
const normalize = (text) => (text || '').toLowerCase().trim();

/**
 * Format currency in Ghana Cedis
 */
const formatCurrency = (val) => {
  const num = Number(val || 0);
  return 'GH₵ ' + num.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format human-friendly relative time
 */
const formatTimeAgo = (ts) => {
  if (!ts) return 'Just now';
  const seconds = Math.floor((Date.now() - Number(ts)) / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

/**
 * Get error type friendly label and icon
 */
const getErrorIcon = (type) => {
  switch (type) {
    case 'supabase': return '⚡ Supabase API Failure';
    case 'network': return '🌐 Network Disconnect';
    case 'sync': return '🔄 Outbox Sync Error';
    case 'unhandled_rejection': return '⚠️ Unhandled Promise Rejection';
    case 'runtime':
    default: return '🐞 Runtime JavaScript Error';
  }
};

/**
 * Core query processor
 */
export const askOperationsAgent = async (userQuery) => {
  const q = normalize(userQuery);
  const startTime = performance.now();

  if (!q) {
    return {
      text: "Please ask a question about schools, learners, subscriptions, support tickets, or platform operations.",
      suggestions: [
        "Platform overview & statistics",
        "Which schools are in critical health?",
        "Show total learners and staff",
        "Subscription and billing status"
      ],
      queryTimeMs: 0
    };
  }

  try {
    // ── 1. GREETINGS & CAPABILITIES ──
    if (
      q === 'hi' || q === 'hello' || q === 'hey' ||
      q.includes('who are you') || q.includes('what can you do') || q.includes('help')
    ) {
      return {
        text: `### 👋 Hello! I am your Operations Copilot.
I am an internal intelligent agent designed to give you real-time information about your schools, subscriptions, learners, support tickets, and **live system error detection**—**with zero latency and zero API cost**.

**Here are some things you can ask me:**
- 🩺 **System Diagnostics & Errors**: *"Are there any system errors?"*, *"Run 5-pillar diagnostics"*, *"Why did it fail?"*
- 🏫 **School Intel**: *"How many schools are on the platform?"*, *"Search for St. Peter's"*, *"Which schools have critical health?"*
- 🎓 **Learners & Staff**: *"Total learners and staff count"*, *"Top 5 schools by population"*
- 💳 **Billing & Wallets**: *"Which schools have expired subscriptions?"*, *"Show wallet balances"*, *"Referral rewards summary"*
- 🎫 **Support & Radar**: *"How many open support tickets?"*, *"Show recent admin interventions"*
- 🧭 **Navigation**: *"Where do I publish broadcasts?"*, *"How to monitor GES updates?"*`,
        suggestions: [
          "Run system diagnostics",
          "Show recent system errors",
          "Platform overview & statistics",
          "Which schools are in critical health?"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 2. SYSTEM DIAGNOSTICS (5-PILLAR ACTIVE INSPECTION) ──
    if (
      q.includes('diagnostic') || q.includes('system health') || q.includes('check system') ||
      q.includes('diagnose') || q.includes('is everything ok') || q.includes('health check') ||
      q.includes('system status')
    ) {
      const diag = await systemErrorTracker.runSystemDiagnostics();
      const p = diag.pillars;

      const getPillarBadge = (status) => {
        if (status === 'healthy') return '🟢 Healthy';
        if (status === 'warning') return '🟡 Warning';
        return '🔴 Critical';
      };

      let overallTitle = '🟢 System Status: 100% Operational';
      if (diag.overallStatus === 'critical') {
        overallTitle = '🔴 System Status: Critical Attention Needed';
      } else if (diag.overallStatus === 'warning') {
        overallTitle = '🟡 System Status: Degraded / Warning';
      }

      const text = `### ${overallTitle}
*Completed 5-pillar live system inspection in ${diag.executionMs}ms.*

| Pillar | Status | Live Telemetry Findings |
| :--- | :--- | :--- |
| **🌐 Network & Latency** | ${getPillarBadge(p.network.status)} | ${p.network.details} |
| **⚡ Supabase API & Auth** | ${getPillarBadge(p.supabase.status)} | ${p.supabase.details} |
| **💾 Dexie Storage** | ${getPillarBadge(p.database.status)} | ${p.database.details} |
| **🔄 Offline Sync Queue** | ${getPillarBadge(p.outbox.status)} | ${p.outbox.details} |
| **🩺 Runtime Exceptions** | ${getPillarBadge(p.telemetry.status)} | ${p.telemetry.details} |

${diag.overallStatus !== 'healthy' ? `#### 🛠️ Recommended Operator Action:
${p.telemetry.unresolvedCount > 0 ? `- Investigate the **${p.telemetry.unresolvedCount}** unresolved runtime exception(s) by asking *"Show system errors"*.\n` : ''}${p.outbox.failed > 0 ? `- Review the **${p.outbox.failed}** failed outbox sync items in local database.\n` : ''}${p.network.status !== 'healthy' ? `- Verify network connection stability.\n` : ''}` : `✅ All system components, database tables, and sync pipelines are running within optimal parameters.`}`;

      return {
        text,
        suggestions: [
          "Show recent system errors",
          "Platform overview & statistics",
          "Which schools are in critical health?",
          "Clear resolved errors"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 3. CLEAR / RESOLVE ERRORS ──
    if (q.includes('clear error') || q.includes('resolve error') || q.includes('reset error') || q.includes('clean error')) {
      systemErrorTracker.clearAllErrors();
      return {
        text: `### 🧹 Error Telemetry Cleared
All recorded system runtime errors and network exception logs have been **cleared and marked resolved**.

The active background error listener continues monitoring for any new events.`,
        suggestions: [
          "Run system diagnostics",
          "Platform overview & statistics"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 4. SYSTEM ERRORS & EXCEPTION TELEMETRY ──
    if (
      q.includes('system error') || q.includes('detect error') || q.includes('recent error') ||
      q.includes('any error') || q.includes('error log') || q.includes('what error') ||
      q.includes('why did it fail') || q.includes('exceptions') || q.includes('crashes') ||
      q === 'errors' || q === 'error' || (q.includes('error') && !q.includes('school'))
    ) {
      const unresolved = systemErrorTracker.getUnresolvedErrors();
      const recent = systemErrorTracker.getRecentErrors(8);

      if (recent.length === 0) {
        return {
          text: `### 🎉 0 System Errors Detected!
The system error telemetry engine is actively monitoring in the background. **No runtime JavaScript exceptions, unhandled promise rejections, or Supabase network errors** have occurred during your current session.`,
          suggestions: [
            "Run system diagnostics",
            "Platform overview & statistics",
            "Which schools are in critical health?"
          ],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let response = `### 🩺 System Error Telemetry Report
Found **${unresolved.length}** unresolved issue(s) (${recent.length} total logged events):

`;

      recent.forEach((err, idx) => {
        const timeAgo = formatTimeAgo(err.timestamp);
        const icon = getErrorIcon(err.type);
        const statusBadge = err.resolved ? '*(Resolved)*' : '**[UNRESOLVED]**';
        response += `#### ${idx + 1}. ${icon} ${statusBadge}
- **Message**: \`${err.message}\`
- **Source**: \`${err.source || 'runtime'}\` ${err.endpoint ? `• **Endpoint**: \`${err.endpoint}\`` : ''}
- **Occurrences**: ${err.occurrences || 1}x • **First Seen**: ${timeAgo}
${err.details ? `- **Details**: \`${typeof err.details === 'object' ? JSON.stringify(err.details) : err.details}\`` : ''}
`;
      });

      response += `\n💡 *Tip: Ask *"Clear resolved errors"* to reset the telemetry log once resolved.*`;

      return {
        text: response,
        suggestions: [
          "Run system diagnostics",
          "Clear resolved errors",
          "Platform overview & statistics"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 2. PLATFORM OVERVIEW / SUMMARY ──
    if (
      q.includes('overview') || q.includes('summary') || q.includes('platform health') ||
      q.includes('how is the platform') || q.includes('dashboard') || q.includes('general stats')
    ) {
      const [schools, metrics, tickets] = await Promise.all([
        getSchoolsDirectory(false),
        getOperationsAnalyticsMetrics(),
        getSupportTickets()
      ]);

      const totalSchools = schools.length;
      const totalLearners = schools.reduce((acc, s) => acc + (s.learners_count || 0), 0);
      const totalStaff = schools.reduce((acc, s) => acc + (s.staff_count || 0), 0);
      const totalBalance = schools.reduce((acc, s) => acc + (Number(s.wallet_balance) || 0), 0);
      const criticalSchools = schools.filter(s => s.healthStatus === 'Critical').length;
      const openTickets = (tickets || []).filter(t => t.status === 'open' || t.status === 'in_progress').length;

      return {
        text: `### 📊 Platform Operations Overview

| Metric | Current Count | Status / Notes |
| :--- | :--- | :--- |
| **Registered Schools** | **${totalSchools}** | Active nationwide |
| **Total Learners** | **${totalLearners.toLocaleString()}** | Enrolled in system |
| **Total Staff / Teachers** | **${totalStaff.toLocaleString()}** | Assigned across schools |
| **Platform Wallet Float** | **${formatCurrency(totalBalance)}** | Total balance across school wallets |
| **Schools in Critical Health** | **${criticalSchools}** | ${criticalSchools > 0 ? '⚠️ Attention needed' : '✅ All healthy'} |
| **Open Support Tickets** | **${openTickets}** | ${openTickets > 0 ? 'Pending operator response' : '✅ Inbox clear'} |

💡 *Tip: You can ask me to dive deeper into any specific school, health alerts, or financial transactions.*`,
        suggestions: [
          "Show schools with critical health",
          "Which schools have expired subscriptions?",
          "Show open support tickets",
          "Top 5 schools by population"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 3. HEALTH & RISK / CRITICAL SCHOOLS ──
    if (
      q.includes('health') || q.includes('critical') || q.includes('warning') ||
      q.includes('risk') || q.includes('unhealthy') || q.includes('issues')
    ) {
      const schools = await getSchoolsDirectory(false);
      const critical = schools.filter(s => s.healthStatus === 'Critical');
      const warning = schools.filter(s => s.healthStatus === 'Warning');

      if (critical.length === 0 && warning.length === 0) {
        return {
          text: `### ✅ Excellent Platform Health!
All **${schools.length}** registered schools are currently operating in **Healthy** standing with normal submission rates and active usage.`,
          suggestions: ["Platform overview & statistics", "Show total learners and staff"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let response = `### ⚠️ Schools Requiring Operator Attention\n\n`;

      if (critical.length > 0) {
        response += `#### 🚨 Critical Health (${critical.length})\n`;
        critical.forEach(s => {
          response += `- **[${s.name}](/platform/operations/schools/${s.id})** — Health Score: **${s.healthScore}%**
  • *Issues*: Score completion ${s.score_completion_score || 0}% • Sub: ${s.subscription_status || 'Trial'} • Balance: ${formatCurrency(s.wallet_balance)}\n`;
        });
      }

      if (warning.length > 0) {
        response += `\n#### 🟡 Moderate Warning (${warning.length})\n`;
        warning.forEach(s => {
          response += `- **[${s.name}](/platform/operations/schools/${s.id})** — Health Score: **${s.healthScore}%** (${s.location || 'Location unset'})\n`;
        });
      }

      response += `\n👉 *Click on any school name above to inspect their live records or execute an intervention.*`;

      return {
        text: response,
        suggestions: [
          "Which schools have expired subscriptions?",
          "Show open support tickets",
          "Show recent admin interventions"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 4. POPULATION / LEARNERS & STAFF ──
    if (
      q.includes('learner') || q.includes('student') || q.includes('population') ||
      q.includes('staff') || q.includes('teacher') || q.includes('largest') || q.includes('top school')
    ) {
      const schools = await getSchoolsDirectory(false);
      const sortedByLearners = [...schools].sort((a, b) => (b.learners_count || 0) - (a.learners_count || 0));
      const totalLearners = schools.reduce((sum, s) => sum + (s.learners_count || 0), 0);
      const totalStaff = schools.reduce((sum, s) => sum + (s.staff_count || 0), 0);

      const top5 = sortedByLearners.slice(0, 5);

      let response = `### 🎓 Platform Population & Enrollment Metrics
- **Total Learners Nationwide**: **${totalLearners.toLocaleString()}**
- **Total Registered Teachers/Staff**: **${totalStaff.toLocaleString()}**
- **Average Enrollment per School**: **${schools.length ? Math.round(totalLearners / schools.length) : 0} learners**

#### 🏆 Top 5 Schools by Student Population:
`;
      top5.forEach((s, idx) => {
        response += `${idx + 1}. **[${s.name}](/platform/operations/schools/${s.id})** — **${(s.learners_count || 0).toLocaleString()}** learners (${s.staff_count || 0} teachers) • *${s.location || 'Location unset'}*\n`;
      });

      return {
        text: response,
        suggestions: [
          "Which schools have critical health?",
          "Subscription and billing status",
          "Show all schools"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 5. BILLING, WALLET & SUBSCRIPTION ──
    if (
      q.includes('subscript') || q.includes('bill') || q.includes('wallet') ||
      q.includes('pay') || q.includes('revenue') || q.includes('owe') || q.includes('expired')
    ) {
      const schools = await getSchoolsDirectory(false);
      const activeSubs = schools.filter(s => s.subscription_status === 'Active');
      const trialSubs = schools.filter(s => s.subscription_status === 'Trial');
      const expiredSubs = schools.filter(s => s.subscription_status === 'Expired' || s.subscription_status === 'Suspended');
      const lowBalance = schools.filter(s => Number(s.wallet_balance || 0) < 50);

      const totalBalance = schools.reduce((sum, s) => sum + Number(s.wallet_balance || 0), 0);

      let response = `### 💳 Subscription & Wallet Financial Standing

- **Total School Wallet Float**: **${formatCurrency(totalBalance)}**
- **Active Subscriptions**: **${activeSubs.length}**
- **Trial Accounts**: **${trialSubs.length}**
- **Expired / Suspended Accounts**: **${expiredSubs.length}**
- **Low Balance Accounts (< GH₵ 50)**: **${lowBalance.length}**
`;

      if (expiredSubs.length > 0) {
        response += `\n#### ⚠️ Expired / Suspended Schools:\n`;
        expiredSubs.forEach(s => {
          response += `- **[${s.name}](/platform/operations/schools/${s.id})** — Status: **${s.subscription_status}** • Wallet: **${formatCurrency(s.wallet_balance)}**\n`;
        });
      }

      if (lowBalance.length > 0) {
        response += `\n#### 📉 Low Wallet Balance Warnings:\n`;
        lowBalance.slice(0, 5).forEach(s => {
          response += `- **[${s.name}](/platform/operations/schools/${s.id})** — Balance: **${formatCurrency(s.wallet_balance)}**\n`;
        });
      }

      return {
        text: response,
        suggestions: [
          "Show referral rewards summary",
          "Which schools are in critical health?",
          "Platform overview & statistics"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 6. REFERRAL REWARDS & DEDUCTIONS ──
    if (
      q.includes('referral') || q.includes('reward') || q.includes('bonus') ||
      q.includes('deduct') || q.includes('referrer')
    ) {
      const summary = await referralAnalyticsService.getSuperAdminAnalytics().catch(() => null);

      if (!summary) {
        return {
          text: `### 🎁 Referral Program Analytics
Unable to load referral metrics at this time. You can visit the [Referral Management Dashboard](/platform/operations/referrals) to inspect live reward logs.`,
          suggestions: ["Platform overview & statistics"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      return {
        text: `### 🎁 Referral Program & Reward Analytics

- **Total Referral Submissions**: **${summary.totalReferrals || 0}**
- **Successfully Rewarded**: **${summary.rewardedCount || 0}**
- **Under Verification / Review**: **${(summary.pendingCount || 0) + (summary.underReviewCount || 0)}**
- **Deducted / Revoked Rewards**: **${summary.revokedCount || 0}**
- **Total Referral Credits Issued**: **${formatCurrency(summary.totalCreditsIssued || 0)}**
- **Active Promoters in Leaderboard**: **${(summary.leaderboard || []).length} schools**

👉 *Visit the [Referral Management Portal](/platform/operations/referrals) to manage and deduct school referral rewards.*`,
        suggestions: [
          "Subscription and billing status",
          "Platform overview & statistics"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 7. SUPPORT TICKETS ──
    if (
      q.includes('ticket') || q.includes('support') || q.includes('complaint') ||
      q.includes('issue') || q.includes('help desk')
    ) {
      const tickets = await getSupportTickets();
      const open = (tickets || []).filter(t => t.status === 'open' || t.status === 'in_progress');
      const urgent = open.filter(t => t.priority === 'urgent' || t.priority === 'high');

      let response = `### 🎫 Support Center Status
- **Total Tickets**: **${(tickets || []).length}**
- **Open / In-Progress Tickets**: **${open.length}**
- **High / Urgent Priority**: **${urgent.length}**\n\n`;

      if (open.length === 0) {
        response += `✅ **No open support tickets!** All inquiries have been resolved.`;
      } else {
        response += `#### Active Tickets Requiring Attention:\n`;
        open.slice(0, 5).forEach(t => {
          response += `- **${t.title}** (${t.school_name || 'School'}) — Priority: **${t.priority?.toUpperCase()}** • Category: *${t.category}*\n`;
        });
        response += `\n👉 *Manage all support conversations in the [Operations Support Center](/platform/operations/support).*`;
      }

      return {
        text: response,
        suggestions: [
          "Show schools with critical health",
          "Platform overview & statistics"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 8. INTERVENTIONS / AUDIT LOG ──
    if (
      q.includes('intervention') || q.includes('override') || q.includes('audit') ||
      q.includes('action') || q.includes('timeline')
    ) {
      const audits = await getInterventionsAuditLog();

      let response = `### 🛡️ Administrative Interventions & Audit Trail\n`;
      if (!audits || audits.length === 0) {
        response += `No recent platform interventions or manual overrides recorded.`;
      } else {
        response += `Found **${audits.length}** recent intervention events:\n\n`;
        audits.slice(0, 6).forEach(a => {
          const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('en-GH') : 'Recent';
          response += `- **${a.action_type || 'Action'}** on **[${a.school_name}](/platform/operations/schools/${a.school_id})** by *${a.admin_name}* (${dateStr})\n  • *Detail*: ${a.description || 'No description'}\n`;
        });
        response += `\n👉 *View complete audit trails in the [Interventions Audit Center](/platform/operations/interventions).*`;
      }

      return {
        text: response,
        suggestions: [
          "Platform overview & statistics",
          "Which schools are in critical health?"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 9. SEARCH SPECIFIC SCHOOL BY NAME OR ID ──
    const searchMatches = q.match(/(?:find|search|show|tell me about|info on|school)\s+([a-zA-Z0-9\s\.\'\-]+)/i);
    const schools = await getSchoolsDirectory(false);

    // Try finding direct name match
    let matchedSchool = null;
    const queryTerm = searchMatches ? searchMatches[1].trim().toLowerCase() : q;

    if (queryTerm.length >= 2) {
      matchedSchool = schools.find(s =>
        (s.name && s.name.toLowerCase().includes(queryTerm)) ||
        (s.id && String(s.id).toLowerCase() === queryTerm) ||
        (s.location && s.location.toLowerCase().includes(queryTerm))
      );
    }

    if (matchedSchool) {
      return {
        text: `### 🏫 School Profile: [${matchedSchool.name}](/platform/operations/schools/${matchedSchool.id})

| Parameter | Details |
| :--- | :--- |
| **School ID** | \`${matchedSchool.id}\` |
| **Location** | ${matchedSchool.location || '—'} (${matchedSchool.district || 'District unset'}, ${matchedSchool.region || 'Region unset'}) |
| **Health Standing** | **${matchedSchool.healthScore}% (${matchedSchool.healthStatus})** |
| **Enrolled Learners** | **${(matchedSchool.learners_count || 0).toLocaleString()}** learners |
| **Teachers / Staff** | **${matchedSchool.staff_count || 0}** registered staff |
| **Classes Configured** | **${matchedSchool.classes_count || 0}** active classes |
| **Subscription Tier** | **${matchedSchool.subscription_tier || 'Standard'} (${matchedSchool.subscription_status || 'Active'})** |
| **Wallet Balance** | **${formatCurrency(matchedSchool.wallet_balance)}** |
| **Read-Only Lock** | ${matchedSchool.is_read_only ? '🔒 Yes (Locked)' : '🔓 No (Active)'} |

👉 **[Click here to open Full School Operations Profile](/platform/operations/schools/${matchedSchool.id})**`,
        suggestions: [
          "Show schools with critical health",
          "Subscription and billing status",
          "Platform overview & statistics"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 10. LIST ALL SCHOOLS ──
    if (q.includes('list') || q.includes('all school') || q.includes('directory') || q.includes('how many school')) {
      let response = `### 🏫 Registered Schools Directory (${schools.length})\n\n`;
      schools.slice(0, 15).forEach((s, i) => {
        response += `${i + 1}. **[${s.name}](/platform/operations/schools/${s.id})** — ${s.learners_count || 0} students • Score: ${s.healthScore}% • *${s.subscription_status || 'Active'}*\n`;
      });
      if (schools.length > 15) {
        response += `\n*...and ${schools.length - 15} more schools.*`;
      }
      response += `\n\n👉 *View the complete directory in [Schools Directory](/platform/operations/schools).*`;

      return {
        text: response,
        suggestions: [
          "Which schools are in critical health?",
          "Top 5 schools by population",
          "Platform overview & statistics"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }


    // ── 11. NAVIGATION & GENERAL SYSTEM HELP ──
    if (q.includes('broadcast') || q.includes('message all')) {
      return {
        text: `### 📢 Platform Broadcasts\nYou can dispatch system announcements, SMS notifications, and circulars directly from the **[Broadcast Manager](/platform/operations/broadcasts)**.`,
        suggestions: ["Platform overview & statistics"],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    if (q.includes('radar') || q.includes('ges') || q.includes('news') || q.includes('circular')) {
      return {
        text: `### 📡 GES Radar & National Educational Watcher\nTrack official circulars, examination updates, and academic policy releases from the **[GES Radar Console](/platform/operations/ges-radar)**.`,
        suggestions: ["Platform overview & statistics"],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    if (q.includes('blog') || q.includes('doc') || q.includes('article')) {
      return {
        text: `### ✍️ Blog & Documentation Publishing\nManage public guides, product manuals, and tutorial updates in the **[Blog & Docs Manager](/platform/operations/blog)**.`,
        suggestions: ["Platform overview & statistics"],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 12. DATABASE CENSUS & FULL AUDIT ──
    if (
      q.includes('census') || q.includes('database audit') || q.includes('collect all') ||
      q.includes('data audit') || q.includes('table records') || q.includes('all data') ||
      q.includes('system data') || q.includes('record count') || q.includes('database stats') ||
      q.includes('sync audit') || q.includes('db stats')
    ) {
      const census = await collectTableCensus();
      const c = census.counts;
      const fmt = (n) => n != null ? Number(n).toLocaleString() : '—';

      const text = `### 📦 Live Database Census & Sync Audit
*All data queried directly from your local IndexedDB (Dexie). Zero external API calls.*

| Store / Table | Records | Notes |
| :--- | :--- | :--- |
| **Schools** | **${fmt(c.schools)}** | Registered institutions |
| **Learners** | **${fmt(c.learners)}** | All enrolled students |
| **Profiles (Staff)** | **${fmt(c.profiles)}** | Teachers & admin accounts |
| **Classes** | **${fmt(c.classes)}** | Configured class groups |
| **Subjects** | **${fmt(c.subjects)}** | Registered subject entries |
| **Scores** | **${fmt(c.scores)}** | Total score records |
| **Report Summaries** | **${fmt(c.reportSummaries)}** | Term report cards |
| **Teacher Assignments** | **${fmt(c.teacherAssignments)}** | Staff-class-subject links |
| **Academic Years** | **${fmt(c.academicYears)}** | Configured years |
| **Terms** | **${fmt(c.terms)}** | Configured terms |
| **Payments** | **${fmt(c.payments)}** | Learner fee records |
| **Fee Transactions** | **${fmt(c.feeTransactions)}** | Receipt & ledger entries |
| **Wallet Ledger** | **${fmt(c.walletLedger)}** | Wallet credit/debit history |
| **Announcements** | **${fmt(c.announcements)}** | School notices |
| **Messages** | **${fmt(c.messages)}** | Parent ↔ Teacher chats |
| **Notifications** | **${fmt(c.notifications)}** | Parent alerts |
| **Parent Accounts** | **${fmt(c.parentAccounts)}** | Registered portal users |
| **Referrals** | **${fmt(c.referrals)}** | Referral chain records |
| **Audit Logs** | **${fmt(c.auditLogs)}** | System activity trail |
| **Recycle Bin** | **${fmt(c.recycleBin)}** | Soft-deleted items |

#### 🔄 Outbox Sync Queue
| Metric | Count |
| :--- | :--- |
| **Total queued items** | **${census.outbox.total}** |
| **Pending retry** | **${census.outbox.pending}** |
| **Failed (need attention)** | **${census.outbox.failed > 0 ? `⚠️ ${census.outbox.failed}` : '✅ 0'}** |

#### ⚡ Unsynced Records
- **Learners not yet pushed**: **${census.unsynced.learners}**
- **Score drafts (not submitted)**: **${census.unsynced.scores}**`;

      return {
        text,
        suggestions: [
          "Show class breakdown",
          "Show score statistics",
          "Show teacher assignments",
          "Show payment ledger"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 13. CLASS ROSTER & ENROLLMENT BREAKDOWN ──
    if (
      q.includes('class breakdown') || q.includes('class list') || q.includes('class roster') ||
      q.includes('per class') || q.includes('each class') || q.includes('class enrollment') ||
      q.includes('how many in each') || q.includes('learners per class') || q.includes('class size')
    ) {
      const rosters = await collectClassRosters();
      if (!rosters.length) {
        return {
          text: `### 🏫 Class Roster\nNo class data found in local database. Classes are created per school within each school's settings.`,
          suggestions: ["Database census & audit", "Platform overview & statistics"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      // Group by school
      const bySchool = {};
      rosters.forEach(r => {
        if (!bySchool[r.schoolName]) bySchool[r.schoolName] = [];
        bySchool[r.schoolName].push(r);
      });

      let text = `### 🏫 Class-by-Class Enrollment Breakdown\n*${rosters.length} classes across ${Object.keys(bySchool).length} school(s) — live from local database.*\n\n`;

      const totalLearners = rosters.reduce((s, r) => s + r.totalLearners, 0);
      text += `**Total Learners (all classes):** ${totalLearners.toLocaleString()}\n\n`;

      Object.entries(bySchool).slice(0, 8).forEach(([school, classes]) => {
        text += `#### 🏫 ${school}\n`;
        text += `| Class | Category | Active | Alumni | Total | Class Teacher |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
        classes.forEach(c => {
          text += `| **${c.name}** | ${c.category} | ${c.activeLearners} | ${c.alumni} | **${c.totalLearners}** | ${c.classTeacher} |\n`;
        });
        text += '\n';
      });

      if (Object.keys(bySchool).length > 8) {
        text += `*...and ${Object.keys(bySchool).length - 8} more schools. Ask "Database census" for full counts.*`;
      }

      return {
        text,
        suggestions: [
          "Search learner by name",
          "Show score statistics",
          "Show teacher assignments",
          "Database census & audit"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 14. DEEP LEARNER SEARCH ──
    const learnerSearchMatch = q.match(/(?:find|search|who is|look up|locate|check|get)\s+(?:learner|student|pupil)?\s*(.+)/i);
    if (
      learnerSearchMatch ||
      q.includes('find student') || q.includes('search learner') ||
      q.includes('find learner') || q.includes('search student') ||
      q.includes('find pupil') || q.includes('who is student')
    ) {
      const searchTerm = learnerSearchMatch ? learnerSearchMatch[1].trim() : q.replace(/^(find|search|who is|locate|look up)\s*/i, '').trim();
      if (!searchTerm || searchTerm.length < 2) {
        return {
          text: `### 🔍 Learner Search\nPlease provide a name or registration number. Example: *"Find student Kwame Mensah"* or *"Search learner REG-001"*`,
          suggestions: ["Show class breakdown", "Database census & audit"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      const results = await searchLearners(searchTerm);

      if (!results.length) {
        return {
          text: `### 🔍 Learner Search — No Results\nNo learner matching **"${searchTerm}"** found in the local database. Check spelling or try a registration number.`,
          suggestions: ["Show class breakdown", "Database census & audit"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let text = `### 🔍 Learner Search Results for "${searchTerm}"\nFound **${results.length}** matching student(s) from local database:\n\n`;
      text += `| Name | Reg # | Class | School | Status | Reports | Synced |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      results.forEach(r => {
        text += `| **${r.fullName}** | \`${r.regNumber}\` | ${r.className} | ${r.schoolName} | ${r.status} | ${r.reportsGenerated} | ${r.synced ? '✅' : '⏳'} |\n`;
      });

      return {
        text,
        suggestions: ["Show class breakdown", "Show score statistics", "Database census & audit"],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 15. ACADEMIC SCORE ANALYTICS ──
    if (
      q.includes('score stat') || q.includes('score progress') || q.includes('exam progress') ||
      q.includes('score analytics') || q.includes('report card') || q.includes('score completion') ||
      q.includes('submission rate') || q.includes('academic progress') || q.includes('academic stat') ||
      q.includes('report generat') || q.includes('how many reports') || q.includes('score data')
    ) {
      const analytics = await collectAcademicAnalytics();
      if (!analytics) {
        return {
          text: `### 📝 Academic Analytics\nUnable to retrieve score data right now. Ensure the app has synced data from the server.`,
          suggestions: ["Database census & audit", "Platform overview & statistics"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      const { scores, reports, byTerm, topSchoolsByScores, totalSubjects, totalClasses } = analytics;

      let text = `### 📊 Academic Score & Report Card Analytics
*Live data from local database — ${totalClasses} classes • ${totalSubjects} subjects.*

#### 📝 Score Entry Status
| Metric | Count | Rate |
| :--- | :--- | :--- |
| **Total Score Records** | **${scores.total.toLocaleString()}** | — |
| **Submitted (Final)** | **${scores.submitted.toLocaleString()}** | **${scores.completionRate}%** ✅ |
| **Draft (Pending)** | **${scores.draft.toLocaleString()}** | ${100 - scores.completionRate}% ⏳ |

#### 📄 Report Cards
| Metric | Count |
| :--- | :--- |
| **Total Reports Generated** | **${reports.total.toLocaleString()}** |
| **Released to Parents** | **${reports.released.toLocaleString()}** ✅ |
| **Pending Release** | **${reports.pending.toLocaleString()}** ⏳ |

`;

      if (Object.keys(byTerm).length > 0) {
        text += `#### 📅 Score Completion by Term\n| Term | Total | Submitted | Rate |\n| :--- | :--- | :--- | :--- |\n`;
        Object.entries(byTerm).forEach(([term, d]) => {
          const rate = d.total > 0 ? Math.round((d.submitted / d.total) * 100) : 0;
          text += `| **${term}** | ${d.total} | ${d.submitted} | **${rate}%** |\n`;
        });
        text += '\n';
      }

      if (topSchoolsByScores.length > 0) {
        text += `#### 🏆 Top Schools by Score Volume\n`;
        topSchoolsByScores.forEach(([school, d], i) => {
          const rate = d.total > 0 ? Math.round((d.submitted / d.total) * 100) : 0;
          text += `${i + 1}. **${school}** — ${d.total} scores (${rate}% submitted)\n`;
        });
      }

      return {
        text,
        suggestions: [
          "Show class breakdown",
          "Show teacher assignments",
          "Show report card status",
          "Database census & audit"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 16. TEACHER & SUBJECT MATRIX ──
    if (
      q.includes('teacher assign') || q.includes('staff matrix') || q.includes('who teaches') ||
      q.includes('teacher list') || q.includes('subject assign') || q.includes('teaching load') ||
      q.includes('unassigned class') || q.includes('staff assign') || q.includes('teacher subject')
    ) {
      const matrix = await collectTeacherMatrix();
      if (!matrix) {
        return {
          text: `### 👩‍🏫 Teacher Matrix\nUnable to retrieve teacher assignment data.`,
          suggestions: ["Database census & audit"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let text = `### 👩‍🏫 Teacher & Subject Assignment Matrix
*Live from local database — ${matrix.totalTeachers} teachers across ${matrix.totalClasses} classes.*

| Metric | Count |
| :--- | :--- |
| **Registered Teachers/Staff** | **${matrix.totalTeachers}** |
| **Total Classes** | **${matrix.totalClasses}** |
| **Total Subjects** | **${matrix.totalSubjects}** |
| **Classes with No Teacher** | **${matrix.unassignedClasses.length > 0 ? `⚠️ ${matrix.unassignedClasses.length}` : '✅ All assigned'}** |

`;

      if (matrix.unassignedClasses.length > 0) {
        text += `#### ⚠️ Unassigned Classes (Need a Teacher)\n`;
        matrix.unassignedClasses.slice(0, 10).forEach(c => {
          text += `- **${c.name}** — ${c.schoolName}\n`;
        });
        text += '\n';
      }

      if (matrix.teacherList.length > 0) {
        text += `#### 👨‍🏫 Teaching Staff Load (Top ${Math.min(10, matrix.teacherList.length)})\n`;
        text += `| Teacher | Role | School | Assignments |\n| :--- | :--- | :--- | :--- |\n`;
        matrix.teacherList.slice(0, 10).forEach(t => {
          text += `| **${t.name}** | ${t.role} | ${t.schoolName} | ${t.assignedCount} class-subject(s) |\n`;
        });
      }

      return {
        text,
        suggestions: [
          "Show class breakdown",
          "Show score statistics",
          "Database census & audit"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 17. FINANCIAL & PAYMENT LEDGER ──
    if (
      q.includes('payment log') || q.includes('payment ledger') || q.includes('fee collection') ||
      q.includes('fee transaction') || q.includes('show payment') || q.includes('financial data') ||
      q.includes('wallet transaction') || q.includes('wallet ledger') || q.includes('fee record') ||
      q.includes('money collect') || q.includes('cash collect')
    ) {
      const fin = await collectFinancialData();
      if (!fin) {
        return {
          text: `### 💳 Financial Ledger\nNo financial records found in the local database. Ensure payment data has been synced.`,
          suggestions: ["Database census & audit", "Subscription and billing status"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      const ghc = (v) => 'GH₵ ' + Number(v || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      let text = `### 💳 Financial & Payment Ledger
*Live from local database — all currency in Ghana Cedis (GH₵).*

#### 📥 Learner Fee Payments
| Metric | Value |
| :--- | :--- |
| **Total Payment Records** | **${fin.payments.total.toLocaleString()}** |
| **Total Amount Collected** | **${ghc(fin.payments.totalAmount)}** |
| **Awaiting Sync** | ${fin.payments.pendingSync > 0 ? `⏳ ${fin.payments.pendingSync}` : '✅ All synced'} |

#### 🧾 Fee Transactions
| Metric | Value |
| :--- | :--- |
| **Total Transactions** | **${fin.feeTransactions.total.toLocaleString()}** |
| **Total Transaction Value** | **${ghc(fin.feeTransactions.totalAmount)}** |
| **Paid Receipts** | **${fin.feeTransactions.paid}** |
| **Credits / Waivers** | **${fin.feeTransactions.credit}** |

#### 💰 Wallet Ledger Activity
| Metric | Value |
| :--- | :--- |
| **Total Credit Entries** | **${fin.walletLedger.credits}** (${ghc(fin.walletLedger.totalCredits)}) |
| **Total Debit Entries** | **${fin.walletLedger.debits}** (${ghc(fin.walletLedger.totalDebits)}) |

`;

      if (fin.topByPayment.length > 0) {
        text += `#### 🏆 Top Schools by Fee Collection\n`;
        fin.topByPayment.forEach(([school, amount], i) => {
          text += `${i + 1}. **${school}** — ${ghc(amount)}\n`;
        });
        text += '\n';
      }

      if (fin.recentPayments.length > 0) {
        text += `#### 🕒 10 Most Recent Payments\n| School | Amount | Method | Date | Synced |\n| :--- | :--- | :--- | :--- | :--- |\n`;
        fin.recentPayments.forEach(p => {
          const dateStr = p.date !== 'N/A' ? new Date(p.date).toLocaleDateString('en-GH') : 'N/A';
          text += `| ${p.school} | **${ghc(p.amount)}** | ${p.method} | ${dateStr} | ${p.synced ? '✅' : '⏳'} |\n`;
        });
      }

      return {
        text,
        suggestions: [
          "Subscription and billing status",
          "Referral rewards and deductions",
          "Database census & audit"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 18. PARENT PORTAL & COMMUNICATIONS AUDIT ──
    if (
      q.includes('parent account') || q.includes('parent portal') || q.includes('parent message') ||
      q.includes('communication') || q.includes('announcement') || q.includes('notification') ||
      q.includes('parent engagement') || q.includes('parent stat') || q.includes('message stat') ||
      q.includes('chat stat') || q.includes('how many parents')
    ) {
      const comms = await collectCommunicationsAudit();
      if (!comms) {
        return {
          text: `### 📱 Parent Portal & Communications\nUnable to retrieve communication data from local database.`,
          suggestions: ["Database census & audit"],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let text = `### 📱 Parent Portal & Communications Audit
*Live from local database.*

| Metric | Count |
| :--- | :--- |
| **Registered Parent Accounts** | **${comms.parentAccounts.toLocaleString()}** |
| **Total Messages (All)** | **${comms.messages.total.toLocaleString()}** |
| **Messages from Parents** | **${comms.messages.fromParents}** |
| **Messages from Teachers** | **${comms.messages.fromTeachers}** |
| **Unread Messages** | **${comms.messages.unread > 0 ? `⚠️ ${comms.messages.unread}` : '✅ 0'}** |
| **Announcements Published** | **${comms.announcements.total}** (${comms.announcements.synced} synced / ${comms.announcements.pending} pending) |
| **Notifications Sent** | **${comms.notifications.total}** (${comms.notifications.unread} unread) |

`;

      if (comms.topEngagedSchools.length > 0) {
        text += `#### 💬 Most Engaged Schools (by Message Volume)\n`;
        comms.topEngagedSchools.forEach(([school, count], i) => {
          text += `${i + 1}. **${school}** — ${count} messages\n`;
        });
      }

      return {
        text,
        suggestions: [
          "Platform overview & statistics",
          "Database census & audit",
          "Show open support tickets"
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 19. SMART FALLBACK WITH HELPFUL PROMPTS ──
    return {
      text: `### 🤔 Operations Copilot
I couldn't find an exact match for **"${userQuery}"**.

**Here are some queries I can answer immediately:**
- 📦 *"Database census & audit"* — full record counts across all tables
- 🏫 *"Show class breakdown"* — learner counts per class per school
- 🔍 *"Find student [name]"* — deep learner search by name or reg number
- 📊 *"Show score statistics"* — submission rates and report card progress
- 👩‍🏫 *"Show teacher assignments"* — staff-class-subject matrix
- 💳 *"Show payment ledger"* — fee collection and wallet transactions
- 📱 *"Parent portal stats"* — parent accounts and messages
- 📊 *"Platform overview & statistics"* — school health summary
- ⚠️ *"Which schools are in critical health?"*
- 🎁 *"Referral rewards and deductions"*
- 🩺 *"Run system diagnostics"*`,
      suggestions: [
        "Database census & audit",
        "Show class breakdown",
        "Show score statistics",
        "Platform overview & statistics"
      ],
      queryTimeMs: Math.round(performance.now() - startTime)
    };
  } catch (err) {
    console.error('[OperationsAgent] Query failed:', err);
    return {
      text: `### ⚠️ Query Processing Notice\nAn error occurred while analyzing the database: **${err.message || 'Unknown error'}**. Please try again.`,
      suggestions: ["Platform overview & statistics"],
      queryTimeMs: Math.round(performance.now() - startTime)
    };
  }
};

