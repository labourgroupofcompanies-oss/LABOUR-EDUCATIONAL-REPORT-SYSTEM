/**
 * portalActivityAssistant.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive Portal Activity & How-To Guide Engine (Zero API Cost)
 *
 * Provides simple, numbered, step-by-step instructions for performing key
 * activities in the Headteacher and Teacher portals, integrated with live data.
 *
 * Capabilities:
 *  - Flexible natural language intent matching for diverse question phrasing.
 *  - Live context injection (e.g. actual unreleased reports, draft marks, student counts).
 *  - Direct navigation guidance with clean markdown links.
 *  - 100% plain, human, everyday school language (zero programming jargon).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Keywords and semantic intent patterns for portal activities
 */
const ACTIVITY_INTENTS = [
  {
    id: 'enter_scores',
    roles: ['teacher', 'headteacher'],
    keywords: ['enter score', 'enter mark', 'input grade', 'type marks', 'how to grade', 'add score', 'record marks', 'score entry', 'grading student', 'enter ca', 'enter exam'],
    title: 'How to Enter Student Assessment Marks',
    route: '/scores',
    generateGuide: (context) => {
      const isTeacher = context.role === 'teacher';
      const classInfo = context.assignedClassesText ? ` for your assigned class (${context.assignedClassesText})` : '';

      return `### 📝 How to Enter Student Marks Step-by-Step
Here is how to enter and record student marks${classInfo}:

1. **Open Score Entry**: Tap **[Score Entry](/scores)** from your sidebar menu (or bottom navigation on mobile).
2. **Select Class & Subject**: Pick the **Academic Year**, **Term**, **Class**, and the **Subject** you want to grade.
3. **Type in the Marks**:
   - Enter the **Class Assessment (CA)** marks (homework, class tests, projects).
   - Enter the **Exam Mark** (e.g. out of 50 or 100).
   - *The total score, grade (1-9), and remarks calculate automatically in real time!*
4. **Save Draft**: Tap the **"Save Draft"** button as you work. All marks are saved safely on your device immediately, even without internet.
5. **Final Submission**: Once all students in the class are graded, click **"Submit Scores"** so they can appear on terminal report cards.

💡 *Tip: You can use the TAB key on your keyboard to quickly jump from one student to the next!*`;
    }
  },
  {
    id: 'submit_scores',
    roles: ['teacher', 'headteacher'],
    keywords: ['submit score', 'submit mark', 'finalize score', 'send scores to headteacher', 'lock scores', 'submission', 'submit assessment'],
    title: 'How to Submit Scores to the Headteacher',
    route: '/scores',
    generateGuide: (context) => {
      const draftNotice = context.draftScoresCount > 0
        ? `You currently have **${context.draftScoresCount} draft mark(s)** saved on this device awaiting submission.`
        : `All entered marks are currently up to date.`;

      return `### 📤 How to Submit Marks to the Headteacher
${draftNotice}

Follow these simple steps:
1. Go to **[Score Entry](/scores)** from your menu.
2. Select the **Class** and **Subject** where you have saved draft marks.
3. Review your entered scores to ensure all student marks are accurate.
4. Click the blue **"Submit Scores"** button at the top right of the score table.
5. Confirm the submission prompt.

✅ Once submitted, your marks are verified and sent to the Headteacher so they can compile master broadsheets and terminal report cards.`;
    }
  },
  {
    id: 'release_reports',
    roles: ['headteacher'],
    keywords: ['release report', 'send to parent', 'parent see report', 'publish report', 'make report available', 'parent access', 'release to parents', 'unreleased'],
    title: 'How to Release Report Cards to Parents',
    route: '/reports',
    generateGuide: (context) => {
      const unreleasedCount = context.unreleasedReportsCount || 0;
      const countText = unreleasedCount > 0 ? `You currently have **${unreleasedCount} report card(s)** waiting to be released.` : `All generated report cards are currently released.`;

      return `### 🚀 How to Release Report Cards to Parents
${countText}

Follow these 3 easy steps to send report cards to parents' phones:
1. Open **[Terminal Reports](/reports)** from your sidebar menu.
2. Select your **Academic Year**, **Term**, and **Class**.
3. Review the student broadsheet and verify that headteacher remarks are in order.
4. Click the green **"Release Reports to Parents"** button at the top right.

📱 **What happens next?**
Parents can immediately log into the **Parent Portal** on their smartphones using their child's ID to view, download, or print the official terminal report card with zero paper delays!`;
    }
  },
  {
    id: 'print_reports',
    roles: ['headteacher', 'teacher'],
    keywords: ['print report', 'download report', 'generate report', 'terminal report', 'pdf report', 'print card', 'report card print', 'produce report'],
    title: 'How to Generate and Print Terminal Report Cards',
    route: '/reports',
    generateGuide: (context) => {
      return `### 🖨️ How to Generate and Print Student Report Cards
Follow these straightforward steps:

1. Navigate to **[Terminal Reports](/reports)** from your sidebar.
2. Choose the **Academic Year**, **Term**, and the **Class** you want to print.
3. **Inspect the Broadsheet**: Make sure all subject teachers have submitted their marks and class positions are calculated.
4. **Choose Print Format**:
   - Click **"Print Single Report"** to print or preview an individual student's card.
   - Click **"Print Entire Class"** or **"Download All as PDF"** to bundle the whole class into one printable document.
5. In your browser's print window, set destination to your printer or choose **"Save as PDF"**.

💡 *Tip: Make sure you have uploaded your school crest and headteacher digital signature in [Settings](/settings) so they appear automatically on every printed report card!*`;
    }
  },
  {
    id: 'register_student',
    roles: ['headteacher'],
    keywords: ['add student', 'register student', 'new learner', 'add learner', 'enroll student', 'admit student', 'student registration', 'enrollment'],
    title: 'How to Register a New Student',
    route: '/learners',
    generateGuide: (context) => {
      return `### 👤 How to Register a New Student
Follow these simple steps:

1. Open **[Student Registry](/learners)** from your menu.
2. Click the blue **"+ Add New Student"** button.
3. Fill in the student's details:
   - **Full Legal Name**
   - **Assigned Class** (e.g. Basic 4, JHS 1)
   - **Gender & Date of Birth**
   - **Student ID Number** (or generate an automatic ID)
   - **Parent / Guardian Phone Number** (for SMS notifications & portal login)
4. *(Optional)* Upload a passport photo of the student.
5. Click **"Save Student"**.

✅ The student will immediately appear in their class roster and on subject teachers' score sheets!`;
    }
  },
  {
    id: 'excel_upload',
    roles: ['headteacher'],
    keywords: ['excel', 'csv', 'bulk upload', 'import student', 'upload roster', 'spreadsheet', 'import from excel', 'bulk import'],
    title: 'How to Bulk Upload Students with Excel',
    route: '/learners',
    generateGuide: (context) => {
      return `### 📊 How to Bulk Upload Students from an Excel File
You can register an entire class or the whole school at once using Excel:

1. Go to **[Student Registry](/learners)**.
2. Click the **"Import from Excel / CSV"** button.
3. Tap **"Download Sample Template"** to get the correctly formatted Excel spreadsheet.
4. Open the template on your computer, paste your student names, classes, genders, and parent phone numbers, then save the file.
5. Return to the portal and click **"Choose File"** to upload your saved Excel file.
6. Preview the list to ensure all columns match, then click **"Confirm & Import"**.

🎉 All students will be registered in their respective classes instantly!`;
    }
  },
  {
    id: 'add_teacher',
    roles: ['headteacher'],
    keywords: ['add teacher', 'new teacher', 'register teacher', 'create teacher account', 'staff registration', 'add staff', 'teacher password'],
    title: 'How to Add a Teacher & Staff Account',
    route: '/teachers',
    generateGuide: (context) => {
      return `### 👩‍🏫 How to Add a Teacher & Set Up Their Login
Follow these 4 simple steps:

1. Go to **[Teachers & Staff](/teachers)** in your menu.
2. Click the **"+ Add New Teacher"** button.
3. Enter the teacher's details:
   - **Full Name**
   - **Email Address or Phone Number**
   - **Create a Temporary Password** (which they can change later)
4. Click **"Save Teacher"**.
5. Give the teacher their email and password so they can log into the Teacher Portal on their phone or laptop.

👉 *Next step*: Be sure to assign the classes and subjects they teach so their score sheets are ready!`;
    }
  },
  {
    id: 'assign_teacher',
    roles: ['headteacher'],
    keywords: ['assign teacher', 'assign class', 'assign subject', 'give class to teacher', 'class teacher assignment', 'form master'],
    title: 'How to Assign Teachers to Classes & Subjects',
    route: '/teachers',
    generateGuide: (context) => {
      return `### 📋 How to Assign Classes & Subjects to Teachers
Follow these steps to set up each teacher's teaching load:

1. Go to **[Teachers & Staff](/teachers)**.
2. Find the teacher in the staff list and click **"Manage Assignments"**.
3. Choose the **Class** (e.g. Basic 4).
4. Choose their role:
   - Select a specific **Subject** (e.g. Mathematics) if they teach that subject.
   - Select **"Class Teacher / Form Master"** if they are in charge of attendance and terminal remarks for the whole class.
5. Click **"Add Assignment"**.

✅ As soon as you save, that class and subject will automatically appear in the teacher's portal when they log in!`;
    }
  },
  {
    id: 'enter_remarks',
    roles: ['teacher', 'headteacher'],
    keywords: ['remark', 'conduct', 'attendance', 'attitude', 'interest', 'teacher remark', 'headteacher remark', 'form master comment'],
    title: 'How to Enter Student Remarks & Attendance',
    route: '/class-remarks',
    generateGuide: (context) => {
      const isClassTeacher = context.role === 'teacher';
      return `### ✍️ How to Enter Attendance & Remarks for Report Cards
Follow these steps:

1. Open **[Attendance & Remarks](/class-remarks)** from your menu.
2. Select your **Class**, **Academic Year**, and **Term**.
3. For each student, enter:
   - **Days Present** (out of total school attendance days).
   - **Conduct** (e.g. Respectful, Well-behaved, Obedient).
   - **Attitude & Interest** (e.g. Hardworking, Shows keen interest in Science).
   - **Overall Teacher Comment**: A personalized summary of the student's progress.
4. Click **"Save Remarks"** at the bottom.

${!isClassTeacher ? `💡 *Headteachers can also write official Headteacher Remarks and affix their digital signature directly on the [Terminal Reports](/reports) page before releasing cards.*` : `✅ Your remarks will automatically appear on the student's official report card!`}`;
    }
  },
  {
    id: 'top_up_wallet',
    roles: ['headteacher'],
    keywords: ['wallet', 'top up', 'momo', 'mobile money', 'pay', 'buy credit', 'payment', 'recharge', 'subscription'],
    title: 'How to Top Up Your School Wallet with Mobile Money',
    route: '/financials',
    generateGuide: (context) => {
      const balance = context.walletBalance ? `Your current wallet balance is **${context.walletBalance}**.` : '';
      return `### 💳 How to Top Up Your School Wallet
${balance}

You can instantly top up your wallet using MTN Mobile Money, Telecel Cash, AirtelTigo Money, or Bank Card:

1. Click your **Wallet Balance Badge** at the top right of your header, or go to **[School Wallet & Payments](/financials)**.
2. Tap the green **"Top Up Wallet"** button.
3. Enter the amount you want to top up (in Ghana Cedis).
4. Choose your payment method (**Mobile Money** or **Card**).
5. Enter your phone number or card details, then click **"Proceed to Pay"**.
6. **Approve Prompt**: Check your phone and approve the MoMo prompt with your PIN.

✅ Your wallet balance updates immediately, ready for processing and printing report cards!`;
    }
  },
  {
    id: 'promote_students',
    roles: ['headteacher'],
    keywords: ['promote', 'promotion', 'move to next class', 'end of year', 'new academic year', 'transition student'],
    title: 'How to Promote Students to the Next Class',
    route: '/promotions',
    generateGuide: (context) => {
      return `### 🎓 How to Promote Students at the End of the Academic Year
At the end of the 3rd Term, promote your learners into their next class:

1. Open **[Student Promotions](/promotions)** from your sidebar menu.
2. Select the **Current Class** (e.g. Basic 3) and the **Target Next Class** (e.g. Basic 4).
3. The system will display the student list with their annual average and promotion recommendation.
4. Check the boxes for the students who qualify to move up (or click **"Select All"**).
5. Tap **"Promote Selected Students"**.

🎓 The students will automatically be transferred to their new class for the upcoming academic year without needing to re-register them!`;
    }
  },
  {
    id: 'school_profile',
    roles: ['headteacher'],
    keywords: ['signature', 'crest', 'logo', 'digital signature', 'sign report', 'headteacher signature', 'upload logo', 'school details'],
    title: 'How to Upload School Crest & Digital Signature',
    route: '/settings',
    generateGuide: (context) => {
      return `### 🖋️ How to Add Your School Crest & Digital Signature
Make your report cards official and tamper-proof:

1. Open **[Settings & Profile](/settings)**.
2. **School Crest / Logo**: Tap **"Upload Crest"** and choose your school's logo image (PNG or JPG).
3. **Headteacher Digital Signature**:
   - You can draw your signature directly on your phone or laptop screen using the digital signature pad, OR
   - Upload a scanned photo of your official signature.
4. Click **"Save Settings"**.

✅ Once saved, your official crest and signature will automatically be stamped onto every student report card!`;
    }
  },
  {
    id: 'offline_sync',
    roles: ['teacher', 'headteacher'],
    keywords: ['offline', 'no internet', 'work offline', 'sync', 'upload', 'save without internet', 'how does offline work'],
    title: 'How to Work Offline & Sync Work Later',
    route: '/',
    generateGuide: (context) => {
      return `### 🌐 How to Work Offline with Zero Internet
The Labour Educational Report System is built to work seamlessly in areas with poor or no internet connectivity:

1. **Enter Data Normally**: You can open the website, enter marks, write remarks, and view student lists even when completely offline.
2. **Automatic Local Protection**: Every change you make is saved securely on your phone or computer first.
3. **Sync Indicator**: Notice the status circle in your top header:
   - 🟢 **Online**: Connected and syncing.
   - 🔴 **Offline**: Working safely on this device.
4. **Syncing When Reconnected**: As soon as your device connects to Wi-Fi or mobile data, your saved records will automatically upload to the school cloud. You can also tap the **Sync indicator** at the top anytime to upload immediately.

🛡️ *You never have to worry about power cuts or lost internet — your records are always safe!*`;
    }
  }
];

/**
 * Score how well a user query matches a guide intent
 */
export const findBestActivityGuide = (userQuery, role = 'headteacher') => {
  const q = (userQuery || '').toLowerCase().trim();
  if (!q) return null;

  // Check if query sounds like a "how-to" or instructional question
  const isHowToPattern =
    q.includes('how to') ||
    q.includes('how do i') ||
    q.includes('how can i') ||
    q.includes('how do we') ||
    q.includes('how does') ||
    q.includes('steps to') ||
    q.includes('show me how') ||
    q.includes('guide me') ||
    q.includes('where do i') ||
    q.includes('where can i') ||
    q.includes('can i') ||
    q.includes('what should i do') ||
    q.includes('explain how');

  let bestMatch = null;
  let highestScore = 0;

  ACTIVITY_INTENTS.forEach(intent => {
    // Check role applicability
    if (!intent.roles.includes(role)) return;

    let score = 0;

    // Check keyword matches
    intent.keywords.forEach(kw => {
      if (q.includes(kw)) {
        score += 10;
      } else {
        // Partial word match
        const words = kw.split(' ');
        const matchedWords = words.filter(w => q.includes(w));
        if (matchedWords.length === words.length) {
          score += 8;
        } else if (matchedWords.length > 0) {
          score += 2 * matchedWords.length;
        }
      }
    });

    // Boost if query is an explicit "how-to" question
    if (isHowToPattern && score > 0) {
      score += 5;
    }

    if (score > highestScore && score >= 6) {
      highestScore = score;
      bestMatch = intent;
    }
  });

  return bestMatch;
};
