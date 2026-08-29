/**
 * Built-in Offline User Manuals & Operational Guides
 * Available 100% offline without requiring internet connection.
 * Clean, human-written guide posts with zero AI markdown artifacts.
 */
export const DEFAULT_OFFLINE_MANUALS = [
  {
    "id": "offline-manual-1",
    "title": "Complete School Setup and Initialization Guide",
    "slug": "complete-school-setup-guide",
    "category": "Administration",
    "target_role": "Headteacher",
    "featured_badge": "Admin Guide",
    "read_time": "5 min read",
    "author": "Labour Edu Support Team",
    "summary": "Step-by-step instructions for configuring school branding, classes, subjects, academic calendar, and headteacher signature.",
    "content": "Overview and First Steps\nWelcome to the Labour Educational Report System. Setting up your school correctly ensures accurate continuous assessment recording, smooth grading calculations, and professional terminal report card generation.\n\n1. Configure School Profile and Branding\nOpen Settings from the main navigation menu.\nUnder School Details, enter your official School Name, Motto, Address, Circuit, District, Region, and Help Contact numbers.\nUnder School Crest or Logo, click Upload Logo to attach your official school emblem.\nClick Save Settings.\n\n2. Set Active Academic Year and Term\nIn Settings, navigate to the Academic Session tab.\nSelect your Active Academic Year (for example, 2025/2026).\nChoose the Current Term (Term 1, Term 2, or Term 3).\nEnter the Vacation Date and Next Term Resumption Date so they print automatically on all student report cards.\nClick Save Changes.\n\n3. Configure Classes and Subjects\nOpen School Setup from the navigation sidebar.\nAdd Classes: Click Add Class to create your school streams, such as Basic 7A, Basic 8, or Primary 4.\nAdd Subjects: Click Import Standard GES Curriculum to populate standard Ghanaian basic school subjects, including English Language, Mathematics, Integrated Science, Social Studies, Ghanaian Language, RME, Computing, Creative Arts and Design, and Career Technology.\nAssign Subjects: Open each class card and verify that all necessary subjects are activated for that level.\n\n4. Upload Headteacher Digital Signature\nGo to Settings and select Headteacher Signature.\nChoose Draw Signature to draw your signature directly on screen using a mouse or touch device, or choose Upload Signature File to upload a clear scanned signature image.\nClick Save Signature. Your signature will now be stamped automatically onto all generated report cards and master broadsheets.\n\nNote: You can complete this entire setup without an active internet connection. All changes save directly to your local database and sync automatically once online.",
    "is_published": true
  },
  {
    "id": "offline-manual-2",
    "title": "Teacher Portal: Continuous Assessment and Exam Marks Recording",
    "slug": "teacher-portal-marks-recording-guide",
    "category": "Academics",
    "target_role": "Teacher",
    "featured_badge": "Teacher Guide",
    "read_time": "5 min read",
    "author": "Labour Edu Academic Directorate",
    "summary": "How subject teachers record class assessment scores, exam marks, student remarks, and attendance offline.",
    "content": "Accessing Your Class Score Sheet\nTeachers can enter and manage assessment scores directly on any computer, tablet, or smartphone without requiring continuous internet access.\n\n1. Step-by-Step Marks Entry\nOpen Scores / Continuous Assessment from the main navigation menu.\nSelect your assigned Class, Subject, and Academic Term.\nThe class score grid will load with all registered learners.\nEnter the Class Assessment score (class exercises, group tasks, homework, and projects).\nEnter the Terminal Examination score.\nThe system automatically computes the Total Score (100%), GES Letter Grade (A, B, C, D, E, F), Performance Remarks, and Class Position.\n\n2. Recording Attendance and Teacher Remarks\nSwitch to the Remarks and Attendance section on the score sheet.\nInput the student Total Attendance out of the total term days.\nChoose or type appropriate Conduct, Attitude, and Form Master remarks.\nClick Save Changes.\n\nNote: All recorded marks are saved instantly to your device local storage. When internet connectivity is available, the system will sync your records to the central cloud automatically.",
    "is_published": true
  },
  {
    "id": "offline-manual-3",
    "title": "Learner Registration, Excel Batch Import and Student Management",
    "slug": "learner-registration-import-guide",
    "category": "Administration",
    "target_role": "Headteacher",
    "featured_badge": "Admin Guide",
    "read_time": "5 min read",
    "author": "Labour Edu Support Team",
    "summary": "How to register individual learners, import whole classes from Excel spreadsheets, upload passport pictures, and manage student promotions.",
    "content": "Registering Individual Learners\nOpen the Learners section from the sidebar menu.\nClick Register New Student.\nFill in the learner information: Full Name, Student ID number, Gender, Class Assignment, Ghanaian Language studied (such as Asante Twi, Fante, Ga, Ewe, Akuapem Twi, or Dagbani), and Guardian Contact Details.\nOptionally, upload a passport-sized photograph.\nClick Save Student to complete the registration.\n\nBulk Excel Upload for Entire Classes\nNavigate to Learners and click Import from Excel.\nDownload the sample Excel template or prepare your spreadsheet with the columns: Full Name, Gender, Class, and Guardian Phone Number.\nSelect your completed Excel file (.xlsx or .csv).\nReview the preview table to confirm student names and class assignments.\nClick Confirm Import. Multiple classes can be registered in seconds.\n\nManaging Promotions and Safe Recovery\nTo move a learner to another class or promote them at the end of the year, open the student profile and select the new class assignment.\nIf a student is removed accidentally, you can restore their profile and past marks from the Recycle Bin within 30 days.",
    "is_published": true
  },
  {
    "id": "offline-manual-4",
    "title": "Generating Terminal Report Cards and Broadsheets",
    "slug": "generating-terminal-reports-broadsheets",
    "category": "User Guides",
    "target_role": "All Users",
    "featured_badge": "User Guide",
    "read_time": "4 min read",
    "author": "Labour Edu Support Team",
    "summary": "How to preview, print, and download bulk PDF report cards with QR codes and consolidated master broadsheets.",
    "content": "Generating the Master Class Broadsheet\nGo to Report Cards and click Master Broadsheet.\nSelect the Class, Academic Year, and Term.\nThe broadsheet compiles all subject scores, class totals, averages, positions, and pass percentages on a single consolidated table.\nClick Print Broadsheet or Export to Excel for staff assessment meetings and official school archives.\n\nGenerating and Printing Terminal Report Cards\nSelect the Terminal Reports tab in the Report Cards section.\nChoose your class to preview individual student report cards.\nVerify that the report card includes the School Crest, Student Photo, Subject Marks, Grades, Positions, Form Master Remarks, Headteacher Signature, and Verification QR Code.\nClick Print All Class Reports to generate a clean, print-ready PDF document containing all student reports with automatic page breaks.",
    "is_published": true
  },
  {
    "id": "offline-manual-5",
    "title": "School Wallet Top-ups, Mobile Money Payments and Subscriptions",
    "slug": "wallet-topup-momo-subscriptions",
    "category": "Billing & Subscriptions",
    "target_role": "Headteacher",
    "featured_badge": "Billing Guide",
    "read_time": "4 min read",
    "author": "Labour Edu Finance Directorate",
    "summary": "Guide on how school wallet billing works, making Mobile Money deposits via MTN, Telecel, and AirtelTigo, and term renewals.",
    "content": "Billing and Subscription Policy\nFirst Term Free: All new schools enjoy full unlocked access to report generation and features during their onboarding term.\nAffordable Rate: Subsequent terms are billed at an affordable flat rate per active student.\n\nTopping Up School Wallet via Mobile Money\nGo to Billing and Subscriptions or click your Wallet Balance in the top bar.\nEnter the top-up amount in Ghana Cedis (GHS).\nSelect your preferred payment network: MTN Mobile Money, Telecel Cash, or AirtelTigo Money.\nEnter your mobile money phone number and click Proceed to Pay.\nAuthorize the transaction prompt on your mobile phone by entering your PIN.\nYour school wallet balance will update immediately upon approval.\n\nReferral Rewards Program\nEach school has a unique Referral Code in the billing section.\nShare your referral code with fellow headteachers and school administrators.\nWhen a new school registers and activates their account with your code, your school wallet receives instant bonus credits.",
    "is_published": true
  },
  {
    "id": "offline-manual-6",
    "title": "Offline Mode Engine, Data Safety and Technical Support",
    "slug": "offline-first-data-security-troubleshooting",
    "category": "Security & Compliance",
    "target_role": "All Users",
    "featured_badge": "Security Notice",
    "read_time": "4 min read",
    "author": "Labour Edu Engineering Team",
    "summary": "Understanding how offline mode functions, data safety guarantees, and how to reach the technical support team.",
    "content": "How Offline-First Mode Works\nThe Labour Educational Report System is built on Progressive Web App technology with an offline database.\nYou do not need an uninterrupted internet connection to use the software.\nTeachers and administrators can record marks, manage learners, and print report cards completely offline in areas without reliable network access.\nWhen internet access is restored, the software synchronizes all local changes with the cloud database seamlessly.\n\nData Security and Automatic Backups\nAll records are stored securely on your local device and replicated to encrypted cloud servers during sync.\nMarks and report records are protected against unexpected power outages or connection drops.\n\nTechnical Support and Help Desk Contacts\nIf you need guidance, have technical questions, or require assistance:\nWhatsApp Support: Send a message to our 24/7 Support Desk on 0541829724.\nVoice Call: Call our direct customer line on 0541829724.\nOfficial Website: Visit labouredu.com for product news and documentation.",
    "is_published": true
  }
];
