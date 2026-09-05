/**
 * teacherAgentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teacher Portal Intelligence Agent (Zero-API-Cost Internal Query Engine)
 *
 * Strictly scoped to the authenticated teacher's assigned classes and subjects.
 * Enforces strict pedagogical role boundaries:
 *   - No access to school-wide financials or wallet ledger.
 *   - No access to classes or subjects not assigned to this teacher.
 *   - Plain-English, educational terminology with zero technical jargon.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import db from '../lib/db';
import { assertSchoolContext } from '../repositories/tenantGuard';
import { findBestActivityGuide, isDataOrCensusQuery } from './portalActivityAssistant';

/**
 * Normalize input query
 */
const normalize = (text) => (text || '').toLowerCase().trim();

/**
 * Core Teacher Query Engine
 * @param {string} userQuery - The natural language question
 * @param {object} user - The authenticated user object ({ id, schoolId, role, fullName })
 */
export const askTeacherAgent = async (userQuery, user) => {
  const startTime = performance.now();

  // 1. Strict Tenant & Role Isolation Guard
  if (!user || user.role !== 'teacher') {
    return {
      text: `### 🔒 Teacher Access Only\nThis assistant is specifically designed for classroom and subject teachers.`,
      suggestions: ['Dashboard overview'],
      queryTimeMs: 0
    };
  }

  let cleanSchoolId;
  try {
    cleanSchoolId = assertSchoolContext(user.schoolId, 'askTeacherAgent');
  } catch (guardErr) {
    return {
      text: '### 🔒 Security Notice\nUnable to verify your school context. Please log in again to access your teaching records.',
      suggestions: ['Dashboard overview'],
      queryTimeMs: 0
    };
  }

  const q = normalize(userQuery);

  if (!q) {
    return {
      text: 'Please ask a question regarding your assigned classes, student marks, score submission progress, or missing grades.',
      suggestions: [
        'What is my score entry progress?',
        'Which students are missing scores?',
        'Show my assigned classes',
        'Are my marks safely saved on this device?'
      ],
      queryTimeMs: 0
    };
  }

  try {
    // 2. Fetch Teacher's Profile & Assignments
    const sId = String(cleanSchoolId);
    const userId = user.id;

    const [allAssignments, allClasses, allSubjects, allScores, allLearners, allSummaries, schoolInfo] = await Promise.all([
      db.teacherAssignments ? db.teacherAssignments.filter(a => String(a.schoolId || a.school_id) === sId).toArray() : [],
      db.classes ? db.classes.filter(c => String(c.schoolId || c.school_id) === sId).toArray() : [],
      db.subjects ? db.subjects.filter(s => String(s.schoolId || s.school_id) === sId).toArray() : [],
      db.scores ? db.scores.filter(s => String(s.schoolId || s.school_id) === sId).toArray() : [],
      db.learners ? db.learners.filter(l => String(l.schoolId || l.school_id) === sId).toArray() : [],
      db.reportSummaries ? db.reportSummaries.filter(r => String(r.schoolId || r.school_id) === sId).toArray() : [],
      db.schools ? db.schools.get(cleanSchoolId) : null
    ]);

    const schoolName = schoolInfo?.name || 'Your School';
    const currentYear = schoolInfo?.currentAcademicYear || '';
    const currentTerm = schoolInfo?.currentTerm || 'Term 1';

    // Filter assignments for this specific teacher
    const myAssignments = allAssignments.filter(a =>
      a.teacherId === userId || String(a.teacherId) === String(userId)
    );

    // Build Maps for fast lookup
    const classMap = new Map();
    allClasses.forEach(c => classMap.set(Number(c.id), c));
    allClasses.forEach(c => classMap.set(String(c.id), c));

    const subjectMap = new Map();
    allSubjects.forEach(s => subjectMap.set(Number(s.id), s));
    allSubjects.forEach(s => subjectMap.set(String(s.id), s));

    // Determine assigned class IDs and subject combinations
    const assignedClassIds = new Set();
    const assignedSubjectIds = new Set();
    const classTeacherClassIds = new Set(); // classes where this teacher is Form Master / Class Teacher

    myAssignments.forEach(a => {
      const cId = Number(a.classId);
      assignedClassIds.add(cId);
      if (a.subjectId === null || a.subjectId === undefined) {
        classTeacherClassIds.add(cId);
      } else {
        assignedSubjectIds.add(Number(a.subjectId));
      }
    });

    // Also check if class teachingMode is 'class_teacher'
    myAssignments.forEach(a => {
      const cls = classMap.get(Number(a.classId));
      if (cls?.teachingMode === 'class_teacher') {
        classTeacherClassIds.add(Number(a.classId));
      }
    });

    // Learners enrolled in teacher's assigned classes
    const myLearners = allLearners.filter(l =>
      assignedClassIds.has(Number(l.currentClassId))
    );

    // Scores belonging to this teacher's assigned classes & subjects
    const myScores = allScores.filter(s => {
      const cId = Number(s.classId);
      const subId = Number(s.subjectId);
      if (!assignedClassIds.has(cId)) return false;
      // If teacher is class teacher for this class, they have visibility over all subjects in their class
      if (classTeacherClassIds.has(cId)) return true;
      // Otherwise, only their assigned subject
      return assignedSubjectIds.has(subId);
    });

    // ── 3. STRICT ROLE & PERMISSION RESTRICTIONS ──

    // Financial inquiries blocked
    if (
      q.includes('wallet') || q.includes('fee') || q.includes('balance') ||
      q.includes('revenue') || q.includes('billing') || q.includes('subscription') ||
      q.includes('money') || q.includes('arrears') || q.includes('payment')
    ) {
      return {
        text: `### 🔒 School Financial Records Restricted
As a classroom educator, access to school financial accounts, fee collections, and wallet balances is restricted to the **Headteacher and School Administrator**.

**Here are some things I can assist you with:**
- 📝 Checking student score submission progress
- ⚠️ Finding learners with missing marks or tests
- 🏆 Viewing top academic performers in your subjects
- 🔄 Verifying that your marks are saved safely on this device`,
        suggestions: [
          'What is my score entry progress?',
          'Which students are missing scores?',
          'Show my assigned classes'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // Unassigned class inquiries blocked
    if (q.includes('other class') || q.includes('all school scores') || q.includes('all teachers')) {
      return {
        text: `### 🔒 Scope Notice
Your teaching permissions are restricted to your **assigned classes and subjects**. You cannot view or modify grades for classes assigned to other teachers.

Ask me about your assigned classes: **${Array.from(assignedClassIds).map(id => classMap.get(id)?.name || `Class ${id}`).join(', ') || 'No active assignments'}**.`,
        suggestions: [
          'Show my assigned classes',
          'What is my score entry progress?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 4. GREETINGS & CAPABILITIES ──
    if (
      q === 'hi' || q === 'hello' || q === 'hey' ||
      q.includes('who are you') || q.includes('what can you do') || q.includes('help')
    ) {
      const classNames = Array.from(assignedClassIds)
        .map(id => classMap.get(id)?.name)
        .filter(Boolean);

      return {
        text: `### 👋 Hello Teacher ${user.fullName || ''}!
Welcome to your **Teacher Grading & Class Copilot** for **${schoolName}**. I am here to help you manage your student scores, track grading completion, and verify your offline work.

**Your Current Teaching Assignments:**
${classNames.length > 0 ? classNames.map(name => `- 📚 **${name}**`).join('\n') : '- *No classes assigned yet. Please contact your Headteacher to set up your class assignments.*'}

**What you can ask me anytime:**
- 📝 *"What is my score entry progress?"*
- ⚠️ *"Which students are missing scores?"*
- 🏆 *"Who are the top students in my class?"*
- 👥 *"Show my student list"*
- ✍️ *"Are teacher remarks completed?"* *(for Class Teachers)*
- 🔄 *"Are my marks safely saved on this device?"*`,
        suggestions: [
          'What is my score entry progress?',
          'Which students are missing scores?',
          'Show my assigned classes',
          'Are my marks safely saved on this device?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 5. HOW-TO ACTIVITY GUIDES & STEP-BY-STEP WORKFLOWS ──
    const isDataQuery = isDataOrCensusQuery(userQuery);
    const activityGuide = !isDataQuery ? findBestActivityGuide(userQuery, 'teacher') : null;
    if (activityGuide && (
      q.includes('how to') || q.includes('how do i') || q.includes('how can i') ||
      q.includes('how do we') || q.includes('how does') || q.includes('steps') ||
      q.includes('guide') || q.includes('where do i') || q.includes('where can i') ||
      q.includes('what should i do') || q.includes('way to') || q.includes('teach me') ||
      q.includes('walkthrough')
    )) {
      const draftCount = myScores.filter(s => s.isSubmitted === 0 || s.isSubmitted === false).length;
      const classNames = Array.from(assignedClassIds)
        .map(id => classMap.get(id)?.name)
        .filter(Boolean)
        .join(', ');

      const guideText = activityGuide.generateGuide({
        role: 'teacher',
        assignedClassesText: classNames,
        draftScoresCount: draftCount
      });

      return {
        text: guideText,
        suggestions: [
          'What is my score entry progress?',
          'Which students are missing scores?',
          'Show my assigned classes',
          'Are my marks safely saved on this device?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 6. ASSIGNED CLASSES & TEACHING LOAD ──
    if (
      q.includes('assigned') || q.includes('my class') || q.includes('teaching load') ||
      q.includes('classes do i teach') || q.includes('subjects do i teach') ||
      q.includes('how many classes')
    ) {
      if (myAssignments.length === 0) {
        return {
          text: `### 📚 Your Teaching Assignments
You currently do not have any active class or subject assignments recorded for **${schoolName}**.

👉 Please ask your **Headteacher** or School Administrator to assign your classes and subjects in the **Teachers & Staff** section.`,
          suggestions: ['Dashboard overview'],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let text = `### 📚 Your Assigned Classes & Subjects
Teaching schedule for **${user.fullName || 'Teacher'}**:

| Class | Role / Subject | Total Students |
| :--- | :--- | :--- |
`;

      myAssignments.forEach(a => {
        const cls = classMap.get(Number(a.classId));
        const sub = a.subjectId ? subjectMap.get(Number(a.subjectId)) : null;
        const className = cls?.name || `Class #${a.classId}`;
        const count = allLearners.filter(l => Number(l.currentClassId) === Number(a.classId)).length;
        const role = sub ? `📖 ${sub.name}` : `🌟 Class Teacher / Advisor`;

        text += `| **${className}** | ${role} | **${count} learners** |\n`;
      });

      text += `\n*You have access to enter marks and view progress for each of these classes.*`;

      return {
        text,
        suggestions: [
          'What is my score entry progress?',
          'Which students are missing scores?',
          'Show my student list',
          'Are my marks safely saved on this device?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 6b. MY STUDENTS & CLASS ROSTER ──
    if (
      q.includes('student') || q.includes('learner') || q.includes('pupil') ||
      q.includes('class list') || q.includes('roll') || q.includes('enrollment') ||
      q.includes('headcount') || q.includes('who are in my class')
    ) {
      if (myAssignments.length === 0) {
        return {
          text: `### 👥 Your Students
You have no assigned classes yet. Contact your Headteacher to assign your classes so you can view your students.`,
          suggestions: ['Show my assigned classes'],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      const classLearnerMap = {};
      assignedClassIds.forEach(cid => {
        const cls = classMap.get(cid);
        classLearnerMap[cid] = {
          name: cls?.name || `Class #${cid}`,
          learners: []
        };
      });

      myLearners.forEach(l => {
        const cid = Number(l.currentClassId);
        if (classLearnerMap[cid]) {
          classLearnerMap[cid].learners.push(l);
        }
      });

      const totalStudents = myLearners.length;
      const countLead = totalStudents === 1
        ? `You have **1 registered student** across your assigned classes.`
        : `You have **${totalStudents} registered students** across your assigned classes.`;

      let text = `### 👥 Your Students (${totalStudents} Total)\n${countLead}\n\n`;
      text += `| Class | Students Enrolled | Your Teaching Role |\n| :--- | :--- | :--- |\n`;

      assignedClassIds.forEach(cid => {
        const info = classLearnerMap[cid];
        const count = info?.learners?.length || 0;
        const isClassTeacher = classTeacherClassIds.has(cid);
        const subNames = myAssignments
          .filter(a => Number(a.classId) === cid && a.subjectId)
          .map(a => subjectMap.get(Number(a.subjectId))?.name)
          .filter(Boolean);

        const roleDesc = isClassTeacher
          ? `🌟 Class Teacher / Advisor`
          : (subNames.length > 0 ? `📖 ${subNames.join(', ')}` : 'Subject Teacher');

        text += `| **${info?.name || 'Class'}** | **${count}** student(s) | ${roleDesc} |\n`;
      });

      if (totalStudents > 0 && totalStudents <= 25) {
        text += `\n#### 📋 Quick Student Roster Preview\n`;
        text += `| # | Student Name | ID / Reg No | Class | Gender |\n| :--- | :--- | :--- | :--- | :--- |\n`;
        myLearners.forEach((l, idx) => {
          const cls = classMap.get(Number(l.currentClassId))?.name || 'Class';
          text += `| ${idx + 1} | **${l.fullName || 'Unnamed'}** | ${l.idNumber || l.studentId || '—'} | ${cls} | ${l.gender || '—'} |\n`;
        });
      } else if (totalStudents > 25) {
        text += `\n👉 *Open **[Score Entry](/scores)** to see full student lists and enter grades for each class.*`;
      }

      return {
        text,
        suggestions: [
          'What is my score entry progress?',
          'Which students are missing scores?',
          'Show my assigned classes'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 6. SCORE ENTRY PROGRESS & COMPLETION ──
    if (
      q.includes('progress') || q.includes('completion') || q.includes('status') ||
      q.includes('how many marks') || q.includes('entered') || q.includes('graded')
    ) {
      if (myAssignments.length === 0) {
        return {
          text: `### 📝 Score Entry Progress\nYou have no assigned classes yet. Contact your Headteacher to assign your classes.`,
          suggestions: ['Show my assigned classes'],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      const totalExpectedScores = myLearners.length * (assignedSubjectIds.size || 1);
      const submittedCount = myScores.filter(s => s.isSubmitted === 1 || s.isSubmitted === true).length;
      const draftCount = myScores.filter(s => s.isSubmitted === 0 || s.isSubmitted === false).length;
      const totalEntered = myScores.length;

      const completionPct = totalExpectedScores > 0 ? Math.round((totalEntered / totalExpectedScores) * 100) : 0;

      let text = `### 📝 Your Score Entry Progress
Grading progress for **${currentTerm} (${currentYear || 'Current Year'})**:

| Metric | Status | Details |
| :--- | :--- | :--- |
| **Total Students in Your Classes** | **${myLearners.length}** | Active registered learners |
| **Marks Entered** | **${totalEntered}** | Overall progress: **${Math.min(100, completionPct)}%** |
| **Finalized & Submitted to Headteacher** | **${submittedCount}** | Ready for terminal report cards |
| **Draft Marks Saved on Device** | **${draftCount}** | Saved safely; awaiting submission |

`;

      if (draftCount > 0) {
        text += `💡 **Reminder**: You have **${draftCount} draft mark(s)** saved on this device. Once you are finished entering marks, open **Score Entry** and tap **"Submit Scores"** so the Headteacher can include them on report cards.\n\n`;
      } else if (totalEntered === 0) {
        text += `👉 You have not entered marks for this term yet. Go to **Score Entry** from your sidebar to start grading.\n\n`;
      } else {
        text += `✅ **Great job! All your entered marks have been submitted to the Headteacher.**\n\n`;
      }

      return {
        text,
        suggestions: [
          'Which students are missing scores?',
          'Who are the top students in my class?',
          'Are my marks safely saved on this device?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 7. MISSING SCORES & UNGRADED STUDENTS ──
    if (
      q.includes('missing') || q.includes('ungraded') || q.includes('not graded') ||
      q.includes('who has not') || q.includes('incomplete') || q.includes('remaining')
    ) {
      // Find learners in assigned classes who have no score record in myScores
      const scoredLearnerIds = new Set(myScores.map(s => Number(s.learnerId)));
      const missingLearners = myLearners.filter(l => !scoredLearnerIds.has(Number(l.id)));

      if (missingLearners.length === 0) {
        return {
          text: `### 🎉 No Missing Scores!
Every student in your assigned classes has marks recorded for **${currentTerm}**.

- **Total Students Graded**: ${myLearners.length}
- **Missing Students**: 0

All student grades are accounted for!`,
          suggestions: [
            'What is my score entry progress?',
            'Who are the top students in my class?'
          ],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      let text = `### ⚠️ Students Missing Marks (${missingLearners.length})
The following students in your assigned classes do not have marks recorded for **${currentTerm}**:

| Student Name | Class | ID Number |
| :--- | :--- | :--- |
`;

      missingLearners.slice(0, 10).forEach(l => {
        const clsName = classMap.get(Number(l.currentClassId))?.name || 'Class';
        text += `| **${l.fullName}** | ${clsName} | \`${l.idNumber || l.studentId || '-'}\` |\n`;
      });

      if (missingLearners.length > 10) {
        text += `\n*...and ${missingLearners.length - 10} more students.*`;
      }

      text += `\n👉 **To enter marks**: Go to **Score Entry** in your menu, select your class, and fill in their test scores.`;

      return {
        text,
        suggestions: [
          'What is my score entry progress?',
          'Are my marks safely saved on this device?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 8. TOP PERFORMERS & ACADEMIC RANKING ──
    if (
      q.includes('top') || q.includes('best') || q.includes('highest') ||
      q.includes('performance') || q.includes('rank') || q.includes('leader')
    ) {
      if (myScores.length === 0) {
        return {
          text: `### 🏆 Class Performance
No scores have been entered for your assigned subjects yet. Once you enter and save marks in **Score Entry**, I will calculate the top performers for you.`,
          suggestions: ['What is my score entry progress?'],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      // Calculate total score for each learner in teacher's subject
      const learnerScores = [];
      const learnerMap = new Map();
      myLearners.forEach(l => learnerMap.set(Number(l.id), l));

      myScores.forEach(s => {
        const learner = learnerMap.get(Number(s.learnerId));
        if (!learner) return;

        let total = 0;
        if (Array.isArray(s.caScores)) {
          total += s.caScores.reduce((sum, val) => sum + (Number(val) || 0), 0);
        }
        total += Number(s.examScore || 0);

        learnerScores.push({
          learnerName: learner.fullName,
          classId: s.classId,
          subjectId: s.subjectId,
          totalScore: Math.round(total)
        });
      });

      learnerScores.sort((a, b) => b.totalScore - a.totalScore);
      const top5 = learnerScores.slice(0, 5);

      let text = `### 🏆 Top Performing Students
Highest scoring learners in your assigned subjects:

| Rank | Student Name | Class | Subject | Total Mark |
| :--- | :--- | :--- | :--- | :--- |
`;

      top5.forEach((item, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
        const clsName = classMap.get(Number(item.classId))?.name || 'Class';
        const subName = subjectMap.get(Number(item.subjectId))?.name || 'Subject';
        text += `| ${medal} | **${item.learnerName}** | ${clsName} | ${subName} | **${item.totalScore}** |\n`;
      });

      return {
        text,
        suggestions: [
          'What is my score entry progress?',
          'Which students are missing scores?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 9. CLASS TEACHER REMARKS & ATTENDANCE ──
    if (
      q.includes('remark') || q.includes('conduct') || q.includes('attendance') ||
      q.includes('attitude') || q.includes('interest')
    ) {
      if (classTeacherClassIds.size === 0) {
        return {
          text: `### ✍️ Class Teacher Remarks Notice
You are currently assigned as a **Subject Teacher**. Entering term remarks, student conduct, and attendance is handled by the designated **Class Teacher / Form Master**.

You can enter academic marks for your assigned subjects anytime in **Score Entry**.`,
          suggestions: [
            'What is my score entry progress?',
            'Show my assigned classes'
          ],
          queryTimeMs: Math.round(performance.now() - startTime)
        };
      }

      // Check remarks completion for class teacher classes
      let text = `### ✍️ Class Teacher Remarks Status
You are the designated Class Teacher for: **${Array.from(classTeacherClassIds).map(id => classMap.get(id)?.name).filter(Boolean).join(', ')}**:

| Class | Total Learners | Remarks Completed | Awaiting Remarks |
| :--- | :--- | :--- | :--- |
`;

      classTeacherClassIds.forEach(cId => {
        const cls = classMap.get(cId);
        const learnersInClass = allLearners.filter(l => Number(l.currentClassId) === cId);
        const completedRemarks = allSummaries.filter(s =>
          Number(s.classId) === cId && (s.teacherRemarks || s.conduct)
        ).length;
        const pending = Math.max(0, learnersInClass.length - completedRemarks);

        text += `| **${cls?.name || 'Class'}** | **${learnersInClass.length}** | ✅ ${completedRemarks} | ${pending > 0 ? `⏳ ${pending} pending` : '✅ All Done'} |\n`;
      });

      text += `\n👉 **To enter remarks**: Go to **Class Teacher Entry** in your menu to enter terminal remarks and attendance before report cards are generated.`;

      return {
        text,
        suggestions: [
          'What is my score entry progress?',
          'Are my marks safely saved on this device?'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 10. OFFLINE STORAGE & DATA SAFETY ──
    if (
      q.includes('offline') || q.includes('safe') || q.includes('saved') ||
      q.includes('internet') || q.includes('lost') || q.includes('sync')
    ) {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const draftCount = myScores.filter(s => s.isSubmitted === 0 || s.isSubmitted === false).length;

      return {
        text: `### 🛡️ Your Marks Are 100% Safe on This Device
Here is the status of your connection and grading records:

| Check | Status | Meaning |
| :--- | :--- | :--- |
| **Internet Connection** | **${isOnline ? '🟢 Connected' : '🔴 Working Offline'}** | ${isOnline ? 'Connected to school cloud' : 'Offline mode active — records save to your device'} |
| **Draft Marks on Device** | **${draftCount} mark(s)** | Saved safely in your browser storage |
| **Data Protection** | **100% Protected** | No marks will be lost if power or internet drops |

${!isOnline ? `⚠️ **Working Offline**: You can continue entering marks and grading students freely without internet. Everything will upload automatically as soon as your device reconnects.\n` : `✅ **Your device is connected and all entered marks are protected.**\n`}`,
        suggestions: [
          'What is my score entry progress?',
          'Which students are missing scores?',
          'Show my assigned classes'
        ],
        queryTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // ── 11. GENERAL SMART FALLBACK ──
    return {
      text: `### 🤔 Teacher Copilot
I could not find an exact match for **"${userQuery}"** in your assigned classes.

**Here are some questions I can answer right now:**
- 📝 *"What is my score entry progress?"*
- ⚠️ *"Which students are missing scores?"*
- 🏆 *"Who are the top students in my class?"*
- 📚 *"Show my assigned classes"*
- ✍️ *"Are teacher remarks completed?"*
- 🔄 *"Are my marks safely saved on this device?"*`,
      suggestions: [
        'What is my score entry progress?',
        'Which students are missing scores?',
        'Show my assigned classes',
        'Are my marks safely saved on this device?'
      ],
      queryTimeMs: Math.round(performance.now() - startTime)
    };
  } catch (err) {
    console.error('[TeacherAgent] Error processing query:', err);
    return {
      text: `### ⚠️ Could Not Retrieve Information\nWe were unable to load your class records right now. Your grades remain completely safe on this device. Please try asking again.`,
      suggestions: [
        'What is my score entry progress?',
        'Show my assigned classes'
      ],
      queryTimeMs: Math.round(performance.now() - startTime)
    };
  }
};
