/**
 * Built-in Offline User Manuals & Operational Guides
 * Available 100% offline without requiring internet connection.
 */
export const DEFAULT_OFFLINE_MANUALS = [
  {
    "id": "offline-manual-1",
    "title": "Complete School Setup & Initialization Guide",
    "slug": "complete-school-setup-guide",
    "category": "Administration",
    "target_role": "Headteacher",
    "featured_badge": "Essential Guide",
    "read_time": "6 min read",
    "author": "Labour Edu Support Team",
    "summary": "Step-by-step guide for configuring classes, subjects, academic calendar, grading matrix, and uploading headteacher signature.",
    "content": "## 1. Overview & First Steps\nWelcome to the **Labour Educational Report System**. Setting up your school correctly is crucial for smooth marks entry and automatic report card generation.\n\n---\n\n## 2. Setting Up Academic Year & Current Term\n1. Go to **Settings** from the main menu.\n2. Under the **School & Term** tab, enter your **Active Academic Year** (e.g. 2025/2026).\n3. Select your **Current Term** (e.g. Term 1, Term 2, or Term 3).\n4. Set the **Next Term Resumption Date** and **School Reopening Details** which will appear automatically on all terminal report cards.\n5. Click **Save Settings**.\n\n---\n\n## 3. Configuring Classes & Subjects\n1. Navigate to **School Setup** in the sidebar.\n2. **Add Classes**: Click Add New Class and enter the class names (e.g. Basic 7A, Basic 8, Primary 4).\n3. **Add Subjects**: Under the Subjects tab, you can click **Import Standard GES Curriculum** to automatically add standard Ghanaian basic school subjects (English Language, Mathematics, Science, Social Studies, Ghanaian Language, RME, Computing, Creative Arts & Design, Career Technology).\n4. **Assign Subjects to Classes**: Open each class card and verify that all necessary subjects are activated.\n\n---\n\n## 4. Digital Signature & School Crest Upload\n1. Go to **Settings** -> **School Details & Signature**.\n2. Click **Upload School Logo** to select your official school crest.\n3. Draw or upload the **Headteacher Digital Signature**. This will be embossed on all generated PDF report cards and terminal broadsheets.\n\n> **Tip:** You can complete the entire setup even without an active internet connection. All changes are stored locally in the offline database and sync when online.",
    "is_published": true
  },
  {
    "id": "offline-manual-2",
    "title": "Teacher Portal: Continuous Assessment (CA) & Exam Marks Recording",
    "slug": "teacher-portal-marks-recording-guide",
    "category": "Academics",
    "target_role": "Teacher",
    "featured_badge": "Teacher Guide",
    "read_time": "5 min read",
    "author": "Labour Edu Academic Directorate",
    "summary": "How teachers enter class assessment scores (30%/50%), exam scores (70%/50%), student remarks, and attendance offline.",
    "content": "## 1. Accessing Your Class Score Sheet\nTeachers can record marks directly inside the system from any laptop, tablet, or smartphone — even with **zero internet connection**.\n\n---\n\n## 2. Step-by-Step Marks Entry\n1. Open **Scores / Continuous Assessment** from the navigation bar.\n2. Select your **Class**, **Subject**, and **Academic Term**.\n3. The interactive score grid will display all registered learners in the class.\n4. Enter marks for:\n   * **Class Assessment (CA)** (e.g., Class exercises, projects, and group work).\n   * **Terminal Examination Score**.\n5. The system **automatically calculates**:\n   * Total Score (100%)\n   * Letter Grade (A, B, C, D, E, F)\n   * GES Performance Remarks (e.g., Proficient, Highly Proficient, Developing)\n   * Automatic Class Ranking & Subject Positions.\n\n---\n\n## 3. Recording Conduct, Attendance & Remarks\n1. Switch to the **Remarks & Attendance** tab or open the Learner Profile.\n2. Input the student's **Total Attendance** (e.g. 58 out of 60 days).\n3. Select or type **Conduct**, **Attitude**, and **Form Master Remarks**.\n4. Click **Save Changes** or allow Auto-Save to preserve the entries.\n\n> **Offline Guarantee:** All entered marks are immediately committed to your device's secure offline storage. When you connect to Wi-Fi or mobile data, background sync will automatically update the school cloud.",
    "is_published": true
  },
  {
    "id": "offline-manual-3",
    "title": "Learner Registration, Excel Import & Class Transfers",
    "slug": "learner-registration-import-guide",
    "category": "Administration",
    "target_role": "Headteacher",
    "featured_badge": "Admin Guide",
    "read_time": "5 min read",
    "author": "Labour Edu Support Team",
    "summary": "How to register individual students, perform bulk Excel batch imports, upload passport photos, and transfer students between classes.",
    "content": "## 1. Registering Individual Students\n1. Navigate to **Learners** from the sidebar.\n2. Click **Register New Student**.\n3. Fill in student details:\n   * **Full Name** (e.g. Kwame Mensah)\n   * **Registration / Student ID** (e.g. STU/2026/001)\n   * **Gender** (Male / Female)\n   * **Class Assignment**\n   * **Ghanaian Language Studied** (e.g. Asante Twi, Fante, Ga, Ewe, Akuapem Twi, Dagbani)\n   * **Guardian Name & Phone Number**\n4. Optional: Take a snapshot or upload a passport-sized photograph.\n5. Click **Save Student**.\n\n---\n\n## 2. Bulk Excel Upload (Importing Entire Class)\n1. In the **Learners** screen, click **Import from Excel**.\n2. Download the sample template or use your own spreadsheet with columns: Full Name, Gender, Class, Guardian Phone.\n3. Select your Excel .xlsx or .csv file.\n4. Review the preview table and verify student assignments.\n5. Click **Confirm Import**. Hundreds of students can be registered in seconds.\n\n---\n\n## 3. Managing Student Status & Safe Deletion\n* **Promoting/Moving Students**: Open student profile and select the new class.\n* **Deleted Students Recovery**: If a student is deleted by mistake, you can instantly recover them and all their past marks from the **Recycle Bin** within 30 days.",
    "is_published": true
  },
  {
    "id": "offline-manual-4",
    "title": "Generating Terminal Report Cards & Broadsheets",
    "slug": "generating-terminal-reports-broadsheets",
    "category": "User Guides",
    "target_role": "All Users",
    "featured_badge": "User Guide",
    "read_time": "4 min read",
    "author": "Labour Edu Support Team",
    "summary": "How to preview, print, download bulk PDF report cards with QR codes and terminal master broadsheets.",
    "content": "## 1. Generating Class Broadsheet\n1. Go to **Report Cards** -> **Master Broadsheet**.\n2. Select your Class, Year, and Term.\n3. The broadsheet compiles all subjects, totals, averages, positions, and pass rates on a single consolidated master sheet.\n4. Click **Print Broadsheet** or **Export to Excel** for staff meetings.\n\n---\n\n## 2. Generating & Printing Terminal Report Cards\n1. Select the **Terminal Reports** tab.\n2. Select your class to preview individual student report cards.\n3. **Check Report Card Features**:\n   * Official School Crest & Name\n   * Student Photo & ID\n   * Subject marks, Grades, Positions, Class Average\n   * Form Master & Headteacher Remarks\n   * Headteacher Signature Stamp\n   * Instant Verification QR Code\n4. Click **Print All Class Reports** to generate a single print-ready PDF bundle with page breaks for each student.",
    "is_published": true
  },
  {
    "id": "offline-manual-5",
    "title": "Wallet Top-ups, MoMo Payments & Term Subscription",
    "slug": "wallet-topup-momo-subscriptions",
    "category": "Billing & Subscriptions",
    "target_role": "Headteacher",
    "featured_badge": "Billing Guide",
    "read_time": "4 min read",
    "author": "Labour Edu Finance Directorate",
    "summary": "How school wallet billing works, MTN/Telecel/AirtelTigo Mobile Money top-ups, referral credits, and term activations.",
    "content": "## 1. Free Trial & Term Billing Overview\n* **First Term Free**: New schools enjoy full unlocked access to report generation and features for their initial onboarding term.\n* **Affordable Term Rate**: Subsequent terms are billed at an affordable flat rate per active student.\n\n---\n\n## 2. Topping Up School Wallet via Mobile Money\n1. Go to **Billing & Subscriptions** or click your **Wallet Balance** in the top bar.\n2. Enter the amount in **GHS** (Ghana Cedis).\n3. Select your Mobile Money network:\n   * **MTN Mobile Money**\n   * **Telecel Cash**\n   * **AT (AirtelTigo) Money**\n4. Enter your phone number and click **Proceed to Pay**.\n5. Approve the prompt on your phone by entering your Mobile Money PIN.\n6. Your wallet balance will update instantly.\n\n---\n\n## 3. Referral Rewards Program\n* Every school has a unique **Referral Code**.\n* Share your code with other headteachers and schools.\n* When they register and activate their account, your school receives instant cash bonuses directly credited to your wallet ledger!",
    "is_published": true
  },
  {
    "id": "offline-manual-6",
    "title": "Offline-First Engine, Data Security & Troubleshooting",
    "slug": "offline-first-data-security-troubleshooting",
    "category": "Security & Compliance",
    "target_role": "All Users",
    "featured_badge": "Security Notice",
    "read_time": "4 min read",
    "author": "Labour Edu Engineering Team",
    "summary": "How the offline database works, self-healing sync, data backup safety, and emergency technical support contacts.",
    "content": "## 1. How Offline Mode Works\nLabour Educational Report System is built on **Progressive Web App (PWA)** technology with an offline-first indexed database (Dexie).\n* You do **not** need continuous internet connection.\n* You can record marks, add students, and generate reports completely offline in remote areas.\n* When your device connects to the internet, all changes automatically synchronize with the cloud database.\n\n---\n\n## 2. Manual Backup & Data Safety\n* Your data is encrypted and backed up both locally on your computer/phone and in secure cloud servers.\n* No learner marks or terminal records are ever lost during network power outages.\n\n---\n\n## 3. Need Urgent Assistance or Custom Support?\nIf you ever encounter an issue or have questions:\n* **Official Website:** Visit [labouredu.com](https://labouredu.com) for extended resources and tutorials.\n* **WhatsApp Chat:** Message our 24/7 Support Desk at **0541829724** (or click the WhatsApp button).\n* **Direct Voice Call:** Call our help desk directly on **0541829724** for instant technical support.",
    "is_published": true
  }
];
