/**
 * Centralized Guide Steps Configuration for Labour Edu App
 * Portals: Headteacher/Admin (7 steps), Teacher (5 steps), Parent (4 steps)
 */

export const PORTAL_GUIDES = {
  headteacher: [
    {
      id: 1,
      target: '[data-tour="sidebar-setup"], [data-tour="mobile-nav-setup"], [data-tour="nav-setup"]',
      fallback: '.sidebar, .app-header',
      title: '1. School Setup & Term Dates',
      description: 'Set your school name, current academic year, active term (Term 1, 2, or 3), and vacation dates. Do this first before anything else.',
      route: '/setup',
      icon: 'fa-school',
      color: '#38bdf8'
    },
    {
      id: 2,
      target: '[data-tour="sidebar-setup"], [data-tour="mobile-nav-setup"], [data-tour="nav-setup"]',
      fallback: '.sidebar, .app-header',
      title: '2. Classes & Subjects',
      description: 'Create your classes (e.g. Basic 1 to JHS 3) and choose the subjects that each class learns.',
      route: '/setup',
      icon: 'fa-layer-group',
      color: '#a78bfa'
    },
    {
      id: 3,
      target: '[data-tour="sidebar-teachers"], [data-tour="mobile-nav-teachers"], [data-tour="nav-teachers"]',
      fallback: '.sidebar, .app-header',
      title: '3. Teachers & Staff',
      description: 'Add your teachers, give them login passwords, and assign which classes and subjects each teacher will teach.',
      route: '/teachers',
      icon: 'fa-chalkboard-teacher',
      color: '#2dd4bf'
    },
    {
      id: 4,
      target: '[data-tour="sidebar-learners"], [data-tour="mobile-nav-learners"], [data-tour="nav-learners"]',
      fallback: '.sidebar, .app-header',
      title: '4. Register Students',
      description: 'Add student names and details into their classes, or upload the whole class list at once from an Excel file.',
      route: '/learners',
      icon: 'fa-user-graduate',
      color: '#34d399'
    },
    {
      id: 5,
      target: '[data-tour="sidebar-scores"], [data-tour="sidebar-all-scores"], [data-tour="mobile-nav-scores"]',
      fallback: '.sidebar, .app-header',
      title: '5. Scores & Mark Sheets',
      description: 'Teachers enter class test and exam marks. You can check the master broadsheet to see all student scores, averages, and positions.',
      route: '/all-scores',
      icon: 'fa-chart-line',
      color: '#fbbf24'
    },
    {
      id: 6,
      target: '[data-tour="sidebar-financials"], [data-tour="mobile-nav-financials"], [data-tour="nav-financials"]',
      fallback: '.sidebar, .app-header',
      title: '6. School Wallet & Payments',
      description: 'Check your balance, enjoy your Free First Term, or top up your school wallet using Mobile Money (MoMo) to print report cards.',
      route: '/financials',
      icon: 'fa-wallet',
      color: '#ec4899'
    },
    {
      id: 7,
      target: '[data-tour="sidebar-reports"], [data-tour="mobile-nav-reports"], [data-tour="nav-reports"]',
      fallback: '.sidebar, .app-header',
      title: '7. Print Reports & Send to Parents',
      description: 'Print official student report cards, write headteacher remarks, and click Release Reports so parents can check results on their phones.',
      route: '/reports',
      icon: 'fa-file-invoice',
      color: '#06b6d4'
    }
  ],

  teacher: [
    {
      id: 1,
      target: '[data-tour="sidebar-dashboard"], [data-tour="mobile-nav-dashboard"], [data-tour="nav-dashboard"]',
      fallback: '.sidebar, .app-header',
      title: '1. Teacher Home',
      description: 'See your class announcements, total student count, and scores you still need to enter.',
      route: '/',
      icon: 'fa-house',
      color: '#38bdf8'
    },
    {
      id: 2,
      target: '[data-tour="sidebar-scores"], [data-tour="mobile-nav-scores"], [data-tour="nav-scores"]',
      fallback: '.sidebar, .app-header',
      title: '2. My Classes & Subjects',
      description: 'Choose the class and subject you teach to view your list of students.',
      route: '/scores',
      icon: 'fa-chalkboard-user',
      color: '#2dd4bf'
    },
    {
      id: 3,
      target: '[data-tour="sidebar-class-remarks"], [data-tour="nav-class-remarks"]',
      fallback: '.sidebar, .app-header',
      title: '3. Attendance & Remarks',
      description: 'Record days present for each student and write comments on student character and conduct.',
      route: '/class-remarks',
      icon: 'fa-clipboard-user',
      color: '#a78bfa'
    },
    {
      id: 4,
      target: '[data-tour="sidebar-scores"], [data-tour="mobile-nav-scores"], [data-tour="nav-scores"]',
      fallback: '.sidebar, .app-header',
      title: '4. Enter Student Marks',
      description: 'Type in class test marks (CA) and exam marks. Grades and total scores calculate automatically.',
      route: '/scores',
      icon: 'fa-pen-to-square',
      color: '#fbbf24'
    },
    {
      id: 5,
      target: '[data-tour="sidebar-settings"], [data-tour="mobile-nav-settings"], [data-tour="nav-settings"]',
      fallback: '.sidebar, .app-header',
      title: '5. Save & Sync Work',
      description: 'Make sure your marks are saved and sent to the cloud so the headteacher can prepare report cards.',
      route: '/settings',
      icon: 'fa-cloud-arrow-up',
      color: '#6366f1'
    }
  ],

  parent: [
    {
      id: 1,
      target: '[data-tour="parent-dashboard"], .welcome-title, .dashboard-header',
      fallback: '.dashboard-header',
      title: "1. Child's Overview",
      description: "See your child's student profile, class, attendance, and latest school announcements in real-time.",
      route: '/parent/dashboard',
      icon: 'fa-id-card',
      color: '#0ea5e9'
    },
    {
      id: 2,
      target: '[data-tour="parent-children"], .sibling-grid, .selector-landing-card',
      fallback: '.dashboard-header',
      title: '2. Switch Children',
      description: 'If you have more than one child in this school, switch between them easily with one click.',
      route: '/parent/dashboard',
      icon: 'fa-users',
      color: '#2dd4bf'
    },
    {
      id: 3,
      target: '[data-tour="parent-results"], .qa-btn-report',
      fallback: '.dashboard-header',
      title: '3. View & Download Report Cards',
      description: "Check your child's subject marks, class position, and teacher remarks, and download the official PDF report card.",
      route: '/parent/dashboard',
      icon: 'fa-file-pdf',
      color: '#10b981'
    },
    {
      id: 4,
      target: '[data-tour="parent-notices"], .btn-notif-bell',
      fallback: '.dashboard-header',
      title: '4. School Notices & Messages',
      description: 'Read important messages from the headteacher, fee payment updates, and school reopening dates.',
      route: '/parent/dashboard',
      icon: 'fa-bullhorn',
      color: '#f43f5e'
    }
  ]
};

/**
 * Explicitly determines the active portal type based on pathname and user role.
 * Does NOT fallback to parent on missing role.
 */
export const getPortalForUser = (user, locationPathname = '') => {
  if (locationPathname && locationPathname.startsWith('/parent')) {
    return 'parent';
  }
  if (user?.role === 'teacher') {
    return 'teacher';
  }
  if (user?.role === 'super_admin' || user?.role === 'headteacher' || user?.role === 'admin') {
    return 'headteacher';
  }
  // Safe fallback for unauthenticated or default views
  if (locationPathname.includes('/parent')) return 'parent';
  return 'headteacher';
};
