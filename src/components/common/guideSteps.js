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
      title: '1. School Setup & Academic Calendar',
      description: 'Configure your active Academic Year & Term, create school classes (Basic 1 to JHS 3), and assign subjects.',
      route: '/setup',
      icon: 'fa-school',
      color: '#38bdf8'
    },
    {
      id: 2,
      target: '[data-tour="sidebar-teachers"], [data-tour="mobile-nav-teachers"], [data-tour="nav-teachers"]',
      fallback: '.sidebar, .app-header',
      title: '2. Staff & Teacher Roster',
      description: 'Register teachers, generate staff IDs, and assign them as Subject Teachers or Class Teachers.',
      route: '/teachers',
      icon: 'fa-chalkboard-teacher',
      color: '#2dd4bf'
    },
    {
      id: 3,
      target: '[data-tour="sidebar-setup"], [data-tour="mobile-nav-setup"], [data-tour="nav-setup"]',
      fallback: '.sidebar, .app-header',
      title: '3. Classes & Subject Allocation',
      description: 'Review and manage your class structures, stream allocations, and subject configurations.',
      route: '/setup',
      icon: 'fa-layer-group',
      color: '#a78bfa'
    },
    {
      id: 4,
      target: '[data-tour="sidebar-learners"], [data-tour="mobile-nav-learners"], [data-tour="nav-learners"]',
      fallback: '.sidebar, .app-header',
      title: '4. Learner Registration & Enrollment',
      description: 'Enroll student details individually or bulk-import learners using CSV templates into designated classes.',
      route: '/learners',
      icon: 'fa-user-graduate',
      color: '#34d399'
    },
    {
      id: 5,
      target: '[data-tour="sidebar-financials"], [data-tour="mobile-nav-financials"], [data-tour="nav-financials"]',
      fallback: '.sidebar, .app-header',
      title: '5. School Wallet & License',
      description: 'Check wallet balance, manage First Term Free status, and top up balance for official report downloads.',
      route: '/financials',
      icon: 'fa-wallet',
      color: '#ec4899'
    },
    {
      id: 6,
      target: '[data-tour="sidebar-scores"], [data-tour="sidebar-all-scores"], [data-tour="mobile-nav-scores"]',
      fallback: '.sidebar, .app-header',
      title: '6. Master Broadsheet & Score Audit',
      description: 'Audit overall class performance, subject positions, and total student averages across the entire school.',
      route: '/all-scores',
      icon: 'fa-chart-line',
      color: '#fbbf24'
    },
    {
      id: 7,
      target: '[data-tour="sidebar-reports"], [data-tour="mobile-nav-reports"], [data-tour="nav-reports"]',
      fallback: '.sidebar, .app-header',
      title: '7. Reports & Parent Release',
      description: 'Compile official termly report cards, add Headteacher remarks, and release reports for parent portal access.',
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
      title: '1. Teacher Command Center',
      description: 'View assigned class announcements, pending score submissions, and key classroom statistics.',
      route: '/',
      icon: 'fa-house',
      color: '#38bdf8'
    },
    {
      id: 2,
      target: '[data-tour="sidebar-scores"], [data-tour="mobile-nav-scores"], [data-tour="nav-scores"]',
      fallback: '.sidebar, .app-header',
      title: '2. Assigned Classes & Subjects',
      description: 'Select your designated class and subject to view the student class roster.',
      route: '/scores',
      icon: 'fa-chalkboard-user',
      color: '#2dd4bf'
    },
    {
      id: 3,
      target: '[data-tour="sidebar-class-remarks"], [data-tour="nav-class-remarks"]',
      fallback: '.sidebar, .app-header',
      title: '3. Attendance & Remarks Entry',
      description: 'Record class attendance statistics and enter individual student behavioral remarks.',
      route: '/class-remarks',
      icon: 'fa-clipboard-user',
      color: '#a78bfa'
    },
    {
      id: 4,
      target: '[data-tour="sidebar-scores"], [data-tour="mobile-nav-scores"], [data-tour="nav-scores"]',
      fallback: '.sidebar, .app-header',
      title: '4. Score Entry & Broadsheet Audit',
      description: 'Enter Continuous Assessment (CA) and Exams marks offline or online with instant grade calculation.',
      route: '/scores',
      icon: 'fa-pen-to-square',
      color: '#fbbf24'
    },
    {
      id: 5,
      target: '[data-tour="sidebar-settings"], [data-tour="mobile-nav-settings"], [data-tour="nav-settings"]',
      fallback: '.sidebar, .app-header',
      title: '5. Offline Sync & Cloud Status',
      description: 'Verify background cloud sync status and sync entries to ensure score availability for report generation.',
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
      title: '1. Student Dashboard Overview',
      description: 'View your student profile, active class, academic average, and school notices in real-time.',
      route: '/parent/dashboard',
      icon: 'fa-id-card',
      color: '#0ea5e9'
    },
    {
      id: 2,
      target: '[data-tour="parent-children"], .sibling-grid, .selector-landing-card',
      fallback: '.dashboard-header',
      title: '2. Child & Sibling Selection',
      description: 'Switch between registered children to view individual student profiles and academic records.',
      route: '/parent/dashboard',
      icon: 'fa-users',
      color: '#2dd4bf'
    },
    {
      id: 3,
      target: '[data-tour="parent-results"], .qa-btn-report',
      fallback: '.dashboard-header',
      title: '3. Terminal Report Cards & Results',
      description: 'View and download official PDF report cards featuring subject marks, class positions, and remarks.',
      route: '/parent/dashboard',
      icon: 'fa-file-pdf',
      color: '#10b981'
    },
    {
      id: 4,
      target: '[data-tour="parent-notices"], .btn-notif-bell',
      fallback: '.dashboard-header',
      title: '4. School Notices & Messages',
      description: 'Receive official school announcements, fee updates, reopening dates, and direct headteacher messages.',
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
