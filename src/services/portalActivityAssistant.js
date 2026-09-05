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
 * Natural-language description phrases users might say for each activity.
 * Used for fuzzy "did you mean?" matching when no keyword matches.
 * Each phrase is a real-world paraphrase of the activity, written the way
 * a non-technical school user would describe it.
 */
const ACTIVITY_DESCRIPTIONS = {
  enter_scores: [
    'put marks for students', 'record exam results', 'type in student grades',
    'fill in test scores', 'add marks for my class', 'write marks for students',
    'input assessment results', 'put in scores', 'record student performance',
    'type grades', 'fill marks', 'grade my students', 'enter results',
    'put exam marks', 'where to put exam marks', 'where to enter marks', 'where to record marks'
  ],
  submit_scores: [
    'send marks to headteacher', 'finalize student marks', 'send results',
    'finish entering marks', 'complete score entry', 'forward marks to administration',
    'confirm marks', 'lock in grades', 'done entering scores'
  ],
  release_reports: [
    'let parents see results', 'send results to parents', 'make report cards available',
    'share reports with parents', 'open reports for parents', 'parents view results',
    'publish end of term results', 'give parents access to results', 'send cards to parents'
  ],
  print_reports: [
    'print student results', 'get report card', 'download results', 'produce report card',
    'print end of term card', 'generate terminal report', 'get pdf of results',
    'print broadsheet', 'generate certificates', 'print class result'
  ],
  register_student: [
    'put new student in the system', 'add a child to school', 'register a pupil',
    'add new pupil', 'enter student details', 'add child to class', 'sign up a student',
    'put student name in the portal', 'new admission', 'admit a new pupil', 'add a kid'
  ],
  excel_upload: [
    'add many students at once', 'register all students at once', 'upload student list',
    'upload student list from computer', 'upload student list from laptop', 'upload excel of students',
    'import from spreadsheet', 'add students from file', 'upload names from excel',
    'bulk student entry', 'paste students from excel', 'upload student data'
  ],
  add_teacher: [
    'bring a new teacher on board', 'create login for teacher', 'add staff member',
    'give teacher access to portal', 'register a new teacher', 'set up teacher account',
    'create teacher login', 'add new staff', 'add teacher to the system'
  ],
  assign_teacher: [
    'give teacher a class', 'put teacher in charge of class', 'allocate class to teacher',
    'set class for teacher', 'assign form master', 'who teaches which class',
    'link teacher to subject', 'give teacher subjects to teach', 'set teaching load'
  ],
  enter_remarks: [
    'write comments for students', 'add conduct for students', 'enter behavior notes',
    'write student comment', 'fill attendance', 'put days present', 'write end of term comment',
    'student behaviour', 'class teacher comment', 'add attendance days'
  ],
  top_up_wallet: [
    'add money to account', 'pay for reports', 'recharge school account',
    'use mobile money for school', 'add funds', 'credit school wallet',
    'top up momo', 'buy report credits', 'pay subscription', 'load wallet'
  ],
  promote_students: [
    'move students to next class', 'end of year transition', 'graduate students',
    'move pupils up a level', 'send students to higher class', 'class progression',
    'move kids to next grade', 'advance students', 'advance pupils to next grade level',
    'advance students to next grade', 'end of term promotion'
  ],
  school_profile: [
    'upload school badge', 'add headmaster signature', 'put school logo on reports',
    'brand report card', 'sign reports officially', 'add stamp to report card',
    'put emblem on report', 'set school name and details', 'configure school profile'
  ],
  offline_sync: [
    'work without internet', 'use portal with no network', 'enter marks without wifi',
    'save data offline', 'backup my work', 'upload saved records', 'internet not working',
    'poor network', 'synchronize saved work', 'send saved data'
  ],
  create_class: [
    'organize students into groups', 'put students into groups', 'put students in classes',
    'put students into classes', 'divide school into levels', 'set up class levels',
    'group students by year', 'create basic 1 to 6', 'add kg class', 'put students in sections',
    'set up school structure', 'make a new class level', 'divide pupils into classes',
    'create jhs class', 'school classes setup', 'organize into year groups'
  ],
  create_subject: [
    'add courses to school', 'set up school timetable subjects', 'put mathematics on the system',
    'add english to subjects', 'configure what students learn', 'add school curriculum',
    'put subjects for teachers', 'add lessons', 'add courses', 'setup what is taught'
  ],
  configure_grading: [
    'change how marks are calculated', 'set pass mark', 'adjust grade boundaries',
    'change ca and exam ratio', 'set grading rules', 'how scores are graded',
    'change marking scheme', 'customize score calculation', 'set minimum pass score'
  ]
};

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
    keywords: ['offline', 'no internet', 'work offline', 'sync data', 'save without internet', 'how does offline work', 'upload saved work', 'synchronize work'],
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
  },
  {
    id: 'create_class',
    roles: ['headteacher'],
    keywords: [
      'create class', 'create classes', 'add class', 'add classes', 'new class',
      'new classes', 'setup class', 'setup classes', 'configure class', 'configure classes',
      'how to create classes', 'how to add classes', 'make class', 'open class'
    ],
    title: 'How to Create & Set Up Classes',
    route: '/setup',
    generateGuide: (context) => {
      return `### 🏫 How to Create & Set Up Classes
Follow these simple steps to add or configure classes for **${context.schoolName || 'Your School'}**:

1. Open **[School Setup](/setup)** from your sidebar menu under **Management**.
2. Under the **"Classes"** tab, you have two quick options:
   - **Option A (Instant GES Standards Wizard)**: Tap the blue **"Apply Ghanaian Standards"** button to automatically create all standard classes (**KG 1 through JHS 3 / Basic 9**) with one click.
   - **Option B (Custom Class)**: Click **"+ Add New Class"**, type your class name (e.g. *Creche*, *Nursery 1*, *Basic 4 A*), choose the category (*Early Grade*, *Basic 1-3*, *Basic 4-6*, *Basic 7-9*), and choose the teaching mode (*Class Teacher* for primary or *Subject Teacher* for JHS).
3. Click **"Save Class"**.

✅ Once saved, that class immediately appears in student registration, terminal broadsheets, and teacher assignments!`;
    }
  },
  {
    id: 'create_subject',
    roles: ['headteacher'],
    keywords: [
      'create subject', 'create subjects', 'add subject', 'add subjects', 'new subject',
      'new subjects', 'setup subject', 'configure subject', 'curriculum', 'how to add subjects',
      'assign subject'
    ],
    title: 'How to Add & Manage Subjects',
    route: '/setup',
    generateGuide: (context) => {
      return `### 📖 How to Add & Manage Subjects
Follow these steps to set up your curriculum subjects:

1. Open **[School Setup](/setup)** from your sidebar menu.
2. Click the **"Subjects"** tab at the top.
3. Choose how to set them up:
   - **One-Click Standard Subjects**: Click **"Apply GES Standard Subjects"** to automatically add standard subjects (*Mathematics, English Language, Science, Social Studies, Computing, R.M.E, Creative Arts, Career Tech, French, etc.*).
   - **Custom Subject**: Click **"+ Add Subject"**, enter the subject name, and click **"Save"**.
4. Link subjects to each class by clicking **"Manage Class Subjects"**.

✅ Once configured, teachers can immediately start recording test and exam marks for those subjects!`;
    }
  },
  {
    id: 'configure_grading',
    roles: ['headteacher'],
    keywords: [
      'grading scale', 'grade scale', 'change grading', 'pass mark', 'assessment settings',
      'ca weight', 'exam weight', 'grading system', 'how does grading work', 'configure grading'
    ],
    title: 'How to Configure Grading Scales & Assessment Weights',
    route: '/settings',
    generateGuide: (context) => {
      return `### ⚙️ How to Configure Grading Scales & Assessment Weights
Customize your school's assessment policy in 3 steps:

1. Open **[Settings](/settings)** from your sidebar menu.
2. Click the **"Assessment Settings"** tab.
3. Configure your school rules:
   - **Assessment Weight Ratio**: Set your Class Assessment (CA) vs Exam weighting (e.g. *50% CA / 50% Exam*, *30% CA / 70% Exam*, or *40% CA / 60% Exam*).
   - **Grading Scheme**: Customize the 9-point GES standard scale (1 = Highest / Grade 9) or set custom letter boundaries (A+, A, B, C, D, F).
   - **Pass Mark Threshold**: Set the minimum mark required for passing.
4. Click **"Save Assessment Settings"**.

✅ All terminal student marks and report cards will automatically compute based on these rules!`;
    }
  }
];

/**
 * Check if a query is asking for quantitative data, records, or counts
 * rather than a step-by-step instructional how-to guide.
 */
export const isDataOrCensusQuery = (userQuery) => {
  const q = (userQuery || '').toLowerCase().trim();
  if (!q) return false;

  // Quantitative / Census / Count questions
  if (
    q.includes('how many') ||
    q.includes('how much') ||
    q.includes('number of') ||
    q.includes('count of') ||
    q.includes('total number') ||
    q.includes('total count') ||
    q.includes('total of') ||
    q.includes('headcount') ||
    q.includes('census') ||
    q.includes('population')
  ) {
    return true;
  }

  // Data status / lookup questions (excluding instructional 'show me how/where/steps')
  const isInstructionalShow =
    q.startsWith('show me how') ||
    q.startsWith('show me where') ||
    q.startsWith('show me the steps') ||
    q.startsWith('show me what to do') ||
    q.includes('how to') ||
    q.includes('where to') ||
    q.includes('how do i') ||
    q.includes('how can i');

  if (!isInstructionalShow) {
    if (
      q.startsWith('who is') ||
      q.startsWith('who are') ||
      q.startsWith('who teaches') ||
      q.startsWith('which student') ||
      q.startsWith('which teacher') ||
      q.startsWith('which class') ||
      q.startsWith('which subject') ||
      q.startsWith('list ') ||
      q.startsWith('show ') ||
      q.startsWith('find ') ||
      q.startsWith('search ')
    ) {
      return true;
    }
  }

  // Balance or census data inquiry without instructional intent
  if (
    (q.includes('balance') || q.includes('teachers') || q.includes('students') || q.includes('classes') || q.includes('scores')) &&
    !q.includes('how to') && !q.includes('how do i') && !q.includes('how can i') && !q.includes('how do we') &&
    !q.includes('steps') && !q.includes('guide') && !q.includes('create') && !q.includes('add') &&
    !q.includes('setup') && !q.includes('configure') && !q.includes('make')
  ) {
    if (q.includes('how many') || q.includes('count') || q.includes('list') || q.includes('show') || q.includes('total') || q.includes('summary')) {
      return true;
    }
  }

  return false;
};

/**
 * Score how well a user query matches a guide intent.
 * Strict scoring ensures quantitative/census questions NEVER trigger instructional how-to guides.
 *
 * Three-pass matching:
 *   Pass 1 — Exact keyword phrase match (highest confidence)
 *   Pass 2 — Multi-word keyword all-words-present match
 *   Pass 3 — Fuzzy description word-overlap match (catches vague natural-language descriptions)
 */
export const findBestActivityGuide = (userQuery, role = 'headteacher') => {
  const q = (userQuery || '').toLowerCase().trim();
  if (!q) return null;

  // Never match a how-to guide if the user is asking for quantitative data, counts, or roster lists
  if (isDataOrCensusQuery(q)) {
    return null;
  }

  // Check if query sounds like a "how-to" or instructional question
  const isHowToPattern =
    q.includes('how to') ||
    q.includes('how do i') ||
    q.includes('how can i') ||
    q.includes('how do we') ||
    q.includes('how can we') ||
    q.includes('how does') ||
    q.includes('steps to') ||
    q.includes('steps for') ||
    q.includes('step by step') ||
    q.includes('show me how') ||
    q.includes('show me where') ||
    q.includes('show me where to') ||
    q.includes('can you show') ||
    q.includes('guide me') ||
    q.includes('teach me') ||
    q.includes('where to') ||
    q.includes('where do i') ||
    q.includes('where can i') ||
    q.includes('where should i') ||
    q.includes('where do we') ||
    q.includes('where can we') ||
    q.includes('what are the steps') ||
    q.includes('what should i do') ||
    q.includes('procedure for') ||
    q.includes('walkthrough') ||
    q.includes('i want to') ||
    q.includes('we want to') ||
    q.includes('i need to') ||
    q.includes('we need to') ||
    q.includes('i would like to') ||
    q.includes('we would like to') ||
    q.includes('i wish to') ||
    q.includes('help me') ||
    q.includes('assist me') ||
    q.includes('tell me how') ||
    q.includes('can i') ||
    q.includes('can we') ||
    q.includes('is it possible');

  // Tokenize the query into meaningful words (ignore short grammatical particles)
  const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'or', 'is', 'it', 'do', 'i', 'me', 'my', 'we', 'be', 'as', 'up', 'if', 'so', 'no', 'can', 'and', 'how', 'what', 'where', 'who', 'with', 'from', 'into', 'than', 'are', 'that', 'this', 'his', 'her', 'they', 'them', 'their', 'will', 'was', 'has', 'had', 'not', 'but', 'all', 'any', 'out', 'now', 'put']);
  const qWords = q.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

  let bestMatch = null;
  let highestScore = 0;

  ACTIVITY_INTENTS.forEach(intent => {
    // Check role applicability
    if (!intent.roles.includes(role)) return;

    let bestKwScore = 0;

    // ── PASS 1 & 2: Keyword matching ──────────────────────────────────────────
    intent.keywords.forEach(kw => {
      // Exact phrase match (e.g. "add teacher", "top up")
      if (q.includes(kw)) {
        bestKwScore = Math.max(bestKwScore, 12);
        return;
      }

      // Multi-word keyword: all words present in query
      const words = kw.split(' ').filter(Boolean);
      if (words.length > 1) {
        const allWordsPresent = words.every(w => q.includes(w));
        if (allWordsPresent) {
          bestKwScore = Math.max(bestKwScore, 10);
          return;
        }
      }

      // Single-word keyword matching — only with how-to pattern
      if (words.length === 1 && q.includes(words[0])) {
        if (isHowToPattern) {
          bestKwScore = Math.max(bestKwScore, 8);
        }
      }
    });

    let totalScore = bestKwScore;
    if (isHowToPattern && bestKwScore > 0) {
      totalScore += 5;
    }

    // ── PASS 3: Fuzzy description word-overlap (catches vague descriptions) ───
    // Only run if keyword matching didn't already find a strong match
    if (bestKwScore < 10) {
      const descPhrases = ACTIVITY_DESCRIPTIONS[intent.id] || [];
      let bestDescScore = 0;

      descPhrases.forEach(phrase => {
        // Direct phrase containment (exact match with user's description)
        if (q.includes(phrase)) {
          bestDescScore = Math.max(bestDescScore, 12);
          return;
        }

        // Word-overlap scoring: count how many meaningful words in the phrase appear in the query
        const phraseWords = phrase.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
        if (phraseWords.length === 0) return;

        const matchedWords = phraseWords.filter(w => qWords.some(qw => qw.includes(w) || w.includes(qw)));
        const overlapRatio = matchedWords.length / phraseWords.length;

        // Require at least 50% word overlap and at least 2 matching words for multi-word phrases
        if (overlapRatio >= 0.5 && (matchedWords.length >= 2 || phraseWords.length === 1)) {
          const descScore = Math.round(overlapRatio * 8); // max 8 from description pass
          bestDescScore = Math.max(bestDescScore, descScore);
        }
      });

      if (bestDescScore > 0) {
        // Description matches only qualify if query is descriptive/instructional
        const descThreshold = isHowToPattern ? 5 : 7;
        if (bestDescScore >= descThreshold) {
          totalScore = Math.max(totalScore, bestDescScore);
          if (isHowToPattern) totalScore += 3; // slight boost for instructional phrasing
        }
      }
    }

    // Threshold: keyword match = 12+, description match = 7+ (or 8+ without how-to)
    const threshold = isHowToPattern ? 8 : 10;
    if (totalScore >= threshold && totalScore > highestScore) {
      highestScore = totalScore;
      bestMatch = intent;
    }
  });

  return bestMatch;
};

/**
 * Return the top N activity guides that best match a user's vague query.
 * Used by fallback handlers to surface "did you mean?" suggestions.
 * Unlike findBestActivityGuide, this never returns null — it always returns
 * the top candidates (even with low confidence) so the fallback can suggest them.
 *
 * @param {string} userQuery
 * @param {string} role  'headteacher' | 'teacher'
 * @param {number} topN  max results to return (default 3)
 * @returns {{ intent: object, score: number }[]}
 */
export const findTopActivitySuggestions = (userQuery, role = 'headteacher', topN = 3) => {
  const q = (userQuery || '').toLowerCase().trim();
  if (!q) return [];

  // Don't suggest activity guides for pure data/count queries
  if (isDataOrCensusQuery(q)) return [];

  const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'or', 'is', 'it', 'do', 'i', 'me', 'my', 'we', 'be', 'as', 'up', 'if', 'so', 'no', 'can', 'and', 'how', 'what', 'where', 'who', 'with', 'from', 'into', 'than', 'are', 'that', 'this', 'his', 'her', 'they', 'them', 'their', 'will', 'was', 'has', 'had', 'not', 'but', 'all', 'any', 'out', 'now', 'put']);
  const qWords = q.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const scored = [];

  ACTIVITY_INTENTS.forEach(intent => {
    if (!intent.roles.includes(role)) return;

    let score = 0;

    // Keyword partial overlap
    intent.keywords.forEach(kw => {
      if (q.includes(kw)) { score = Math.max(score, 10); return; }
      const kwWords = kw.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
      const matched = kwWords.filter(w => qWords.some(qw => qw.includes(w) || w.includes(qw)));
      if (matched.length > 0) score = Math.max(score, matched.length * 2);
    });

    // Description word overlap
    const descPhrases = ACTIVITY_DESCRIPTIONS[intent.id] || [];
    descPhrases.forEach(phrase => {
      if (q.includes(phrase)) { score = Math.max(score, 9); return; }
      const pWords = phrase.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
      const matched = pWords.filter(w => qWords.some(qw => qw.includes(w) || w.includes(qw)));
      if (matched.length >= 1) score = Math.max(score, matched.length * 2 + 1);
    });

    if (score > 0) scored.push({ intent, score });
  });

  // Sort by descending score, return top N
  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
};

