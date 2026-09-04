import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { enqueueSync, retryFailed, forceDrain } from '../services/syncEngine';
import AdminAnalytics from '../components/analytics/AdminAnalytics';
import TeacherAnalytics from '../components/analytics/TeacherAnalytics';
import learnerRepository from '../repositories/learnerRepository';
import subscriptionService from '../services/subscriptionService';

// Premium Green-Themed Stat Card with Micro-Animations
const StatCard = ({ icon, iconColor, value, label, badge, badgeColor, onClick, isFeatured }) => (
  <div 
    className={`card stat-card-responsive ${isFeatured ? 'stat-card-featured' : ''}`}
    onClick={onClick}
    style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '0.65rem', 
      position: 'relative', 
      overflow: 'hidden',
      borderLeft: `4px solid ${iconColor || 'var(--accent)'}`,
      transition: 'var(--transition)',
      cursor: onClick ? 'pointer' : 'default',
      padding: '1.1rem 1.25rem',
      borderRadius: '16px'
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div 
        style={{ 
          width: '38px', 
          height: '38px', 
          borderRadius: '10px', 
          background: `${iconColor}15`, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <i className={`fas ${icon}`} style={{ color: iconColor, fontSize: '1rem' }}></i>
      </div>
      {badge && (
        <span 
          style={{ 
            fontSize: '0.68rem', 
            color: badgeColor || '#059669', 
            fontWeight: 800, 
            background: `${badgeColor ? badgeColor + '15' : 'rgba(16, 185, 129, 0.1)'}`, 
            padding: '0.2rem 0.55rem', 
            borderRadius: '999px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em'
          }}
        >
          {badge}
        </span>
      )}
    </div>
    <div>
      <div 
        className="stat-card-value"
        style={{ 
          fontSize: 'clamp(1.2rem, 3.5vw, 1.75rem)', 
          fontWeight: 900, 
          fontFamily: 'Outfit, sans-serif', 
          color: 'var(--primary)', 
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600 }}>
        {label}
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'super_admin';

  const formatDateSafe = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Reactive query for local announcements (Admin view)
  const adminAnnouncements = useLiveQuery(
    () => user?.schoolId ? db.announcements.where('schoolId').equals(user.schoolId).reverse().sortBy('created_at') : [],
    [user?.schoolId]
  );

  // Reactive queries for sync outbox monitoring
  const pendingCount = useLiveQuery(() => db.outbox.where('status').equals('pending').count()) || 0;
  const failedCount = useLiveQuery(() => db.outbox.where('status').equals('failed').count()) || 0;
  const processingCount = useLiveQuery(() => db.outbox.where('status').equals('processing').count()) || 0;
  const failedItems = useLiveQuery(() => db.outbox.where('status').equals('failed').toArray()) || [];

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleSubmitAnnouncement = async (e) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) return;
    if (!user?.schoolId) return;

    setIsSubmitting(true);
    const newAnnouncement = {
      title: annTitle.trim(),
      content: annContent.trim(),
      schoolId: user.schoolId,
      created_at: new Date().toISOString(),
      synced: false
    };

    try {
      // 1. Save locally in Dexie first for offline compatibility
      const localId = await db.announcements.add(newAnnouncement);

      // 2. Enqueue cloud sync via outbox (works online & offline)
      await enqueueSync(
        'insert',
        'report_announcements',
        {
          school_id: user.schoolId,
          title: newAnnouncement.title,
          content: newAnnouncement.content,
          created_at: newAnnouncement.created_at
        },
        user.schoolId
      );

      // Mark local record as queued for sync
      await db.announcements.update(localId, { synced: true });

      // Reset form and close modal
      setAnnTitle('');
      setAnnContent('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error creating announcement:', err);
      alert('Error creating announcement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (ann) => {
    if (!await window.confirm(`Are you sure you want to delete the bulletin "${ann.title}"?`)) return;

    try {
      // Always delete locally first
      if (ann.id) {
        await db.announcements.delete(ann.id);
      }

      // Enqueue remote delete via outbox (works online & offline)
      if (ann.supabaseId) {
        await enqueueSync(
          'delete',
          'report_announcements',
          { filter: { id: ann.supabaseId } },
          user.schoolId
        );
      }
    } catch (err) {
      console.error('Error deleting announcement:', err);
      alert('An error occurred: ' + err.message);
    }
  };

  const [copied, setCopied] = useState(false);

  const handleShareInvite = () => {
    const portalUrl = `${window.location.origin}/parent/login`;
    const schoolName = currentSchool?.name || 'Our School';
    const inviteText = `ðŸ“ *${schoolName.toUpperCase()} - PARENT PORTAL*\n\nDear Parent/Guardian,\n\nOur school's online Parent Portal is now active! You can register and log in to:\nâœ… View your child's terminal report cards.\nâœ… Check outstanding fees and school bills.\nâœ… Read PTA announcements and school bulletins.\n\nðŸ‘‰ *Click here to access your portal:*\n${portalUrl}\n\n*Note:* Use your registered primary phone number to claim and set up your account.`;

    navigator.clipboard.writeText(inviteText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };

  const schoolId = user?.schoolId;
  const currentSchool = useLiveQuery(() => schoolId ? db.schools.get(schoolId) : null, [schoolId]);

  // Reset logo error when logoUrl changes
  useEffect(() => { setLogoError(false); }, [currentSchool?.logoUrl]);

  const [subStatus, setSubStatus] = useState(null);

  const loadSubStatus = React.useCallback(async () => {
    if (schoolId) {
      const res = await subscriptionService.getSchoolSubscriptionStatus(schoolId);
      setSubStatus(res);
    }
  }, [schoolId]);

  useEffect(() => {
    loadSubStatus();
  }, [loadSubStatus]);

  // School-wide stats (Admins)
  const totalLearnerCount = useLiveQuery(() => schoolId ? learnerRepository.getActiveLearnerCount(schoolId) : Promise.resolve(0), [schoolId]);
  const teacherCount = useLiveQuery(() => schoolId ? db.profiles.where('schoolId').equals(schoolId).and(p => p.role?.toLowerCase().trim() === 'teacher').count() : Promise.resolve(0), [schoolId]);
  const classCount = useLiveQuery(() => schoolId ? db.classes.where('schoolId').equals(schoolId).count() : Promise.resolve(0), [schoolId]);
  const subjectCount = useLiveQuery(() => schoolId ? db.subjects.where('schoolId').equals(schoolId).count() : Promise.resolve(0), [schoolId]);
  const pendingScores = useLiveQuery(() => schoolId ? db.scores.where('schoolId').equals(schoolId).and(s => !s.isSubmitted).count() : Promise.resolve(0), [schoolId]);

  // Teacher-specific local tables (scoped to current school to avoid cross-school data)
  const allClasses = useLiveQuery(
    () => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : Promise.resolve([]),
    [schoolId]
  );
  const allSubjects = useLiveQuery(
    () => schoolId ? db.subjects.where('schoolId').equals(schoolId).toArray() : Promise.resolve([]),
    [schoolId]
  );
  const classSubjects = useLiveQuery(
    () => schoolId ? db.classSubjects.where('schoolId').equals(schoolId).toArray() : Promise.resolve([]),
    [schoolId]
  );
  const allLearners = useLiveQuery(
    () => schoolId ? db.learners.filter(l => String(l.schoolId) === String(schoolId) || String(l.school_id || '') === String(schoolId)).toArray() : Promise.resolve([]),
    [schoolId]
  );
  const allScores = useLiveQuery(
    () => schoolId ? db.scores.where('schoolId').equals(schoolId).toArray() : Promise.resolve([]),
    [schoolId]
  );
  const assignments = useLiveQuery(
    () => user && user.role === 'teacher' ? db.teacherAssignments.where('teacherId').equals(user.id).toArray() : Promise.resolve([]),
    [user]
  );
  // Settings needed for analytics (grading scale thresholds)
  const settings = useLiveQuery(() => db.settings.get('global'), []);


  // Background pull sync is managed globally by SyncEngineProvider for all routes.

  // â”€â”€ Computing Teacher Portal Dashboard Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  
  // 1. My Classes
  const teacherClasses = React.useMemo(() => {
    if (!assignments || !allClasses) return [];
    const assignedClassIds = new Set(assignments.map(a => Number(a.classId)));
    return allClasses.filter(c => assignedClassIds.has(Number(c.id)));
  }, [allClasses, assignments]);

  // 2. My Class-Subject combinations (handles Class Teacher Mode as well)
  const teacherClassSubjects = React.useMemo(() => {
    if (!assignments || !allClasses || !classSubjects) return [];
    
    const list = [];
    const seen = new Set();
    
    assignments.forEach(assign => {
      const classId = Number(assign.classId);
      const classObj = allClasses.find(c => Number(c.id) === classId);
      if (!classObj) return;
      
      const isClassTeacher = assign.subjectId === null;
      const mode = classObj.teachingMode || 'class_teacher';
      
      if (isClassTeacher && mode === 'class_teacher') {
        // Class Teacher Mode: teaches all subjects assigned to this class
        const subjectsForClass = classSubjects.filter(cs => Number(cs.classId) === classId);
        subjectsForClass.forEach(cs => {
          const key = `${classId}-${cs.subjectId}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({ classId, subjectId: Number(cs.subjectId) });
          }
        });
      } else if (assign.subjectId !== null) {
        // Subject Teacher Mode: teaches a specific assigned subject
        const key = `${classId}-${assign.subjectId}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ classId, subjectId: Number(assign.subjectId) });
        }
      }
    });
    
    return list;
  }, [assignments, allClasses, classSubjects]);

  // 3. My Students (unique learners in classes assigned to me)
  const teacherStudentsCount = React.useMemo(() => {
    if (teacherClasses.length === 0 || !allLearners) return 0;
    const assignedClassIds = new Set(teacherClasses.map(c => Number(c.id)));
    const myStudents = allLearners.filter(l => assignedClassIds.has(Number(l.currentClassId)));
    return myStudents.length;
  }, [teacherClasses, allLearners]);

  // 4. Unique subjects taught
  const teacherSubjectsCount = React.useMemo(() => {
    const subjectIds = new Set(teacherClassSubjects.map(tcs => tcs.subjectId));
    return subjectIds.size;
  }, [teacherClassSubjects]);

  // 5. Score completion progress calculations per Class-Subject
  const { progressList, overallCompletion } = React.useMemo(() => {
    if (teacherClassSubjects.length === 0) {
      return { progressList: [], overallCompletion: 0 };
    }

    let totalRequired = 0;
    let totalRecorded = 0;

    const list = teacherClassSubjects.map(({ classId, subjectId }) => {
      const classObj = allClasses?.find(c => Number(c.id) === classId);
      const subjectObj = allSubjects?.find(s => Number(s.id) === subjectId);
      
      const classLearners = allLearners ? allLearners.filter(l => Number(l.currentClassId) === classId) : [];
      const learnersCount = classLearners.length;

      // Map score records for this class-subject to find completed ones
      const scoreMap = new Map();
      if (allScores) {
        allScores
          .filter(s => 
            Number(s.classId) === classId && 
            Number(s.subjectId) === subjectId &&
            s.term === currentSchool?.currentTerm &&
            s.academicYear === currentSchool?.currentAcademicYear
          )
          .forEach(s => {
            const hasCa = Array.isArray(s.caScores) && s.caScores.some(score => score !== undefined && score !== null && score !== '');
            const hasExam = s.examScore !== undefined && s.examScore !== null && s.examScore !== '';
            if (hasCa || hasExam) {
              scoreMap.set(s.learnerId, true);
            }
          });
      }

      // We match students in this class who have filled score entries
      const recordedCount = classLearners.filter(l => scoreMap.has(l.supabaseId || l.id)).length;

      totalRequired += learnersCount;
      totalRecorded += recordedCount;

      return {
        classId,
        subjectId,
        className: classObj?.name || `Class #${classId}`,
        subjectName: subjectObj?.name || `Subject #${subjectId}`,
        learnersCount,
        recordedCount,
        progressPercent: learnersCount > 0 ? Math.round((recordedCount / learnersCount) * 100) : 0
      };
    });

    const overall = totalRequired > 0 ? Math.round((totalRecorded / totalRequired) * 100) : 0;

    return { progressList: list, overallCompletion: overall };
  }, [teacherClassSubjects, allClasses, allSubjects, allLearners, allScores, currentSchool]);

   // Theme Color Palette Elements
  const systemPalette = {
    primary: '#09090b',
    accent: '#2563eb',
    accentHover: '#1d4ed8',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    bgLight: '#FAFAFA',
    borderLight: '#E4E4E7',
    borderDark: '#27272a',
    text: '#18181b',
    textMuted: '#71717a'
  };

  return (
    <Layout title="Dashboard">
      <div className="fade-in">
        {/* Welcome Banner */}
        <div className="welcome-banner">
          <div className="welcome-banner-left">
            {/* School Logo in banner */}
            <div className="welcome-banner-logo">
              {currentSchool?.logoUrl && !logoError && !currentSchool.logoUrl.startsWith('blob:')
                ? <img
                    src={currentSchool.logoUrl}
                    alt="School Logo"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => setLogoError(true)}
                  />
                : <i className="fas fa-school" style={{ fontSize: '1.6rem', color: 'rgba(255,255,255,0.7)' }} />
              }
            </div>
            <div className="welcome-banner-text">
              <h1>
                Welcome back, {user?.fullName?.split(' ')[0]}
              </h1>
              <p>
                {isAdmin ? `Headteacher Portal` : `Teacher Portal`}
                {currentSchool?.name && <span style={{ opacity: 0.7 }}> &bull; {currentSchool.name}</span>}
                {currentSchool?.motto && <span style={{ display: 'block', fontStyle: 'italic', fontSize: '0.75rem', opacity: 0.65, marginTop: '2px' }}>&ldquo;{currentSchool.motto}&rdquo;</span>}
              </p>
            </div>
          </div>
          <div className="welcome-banner-right">
            <i className="fas fa-calendar-day"></i>
            <span>{new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        {/* Dynamic Portal Dashboards */}
        {isAdmin ? (
          /* ==========================================
             SUPER ADMIN DASHBOARD VIEW
             ========================================== */
          <>
            {/* Quick Start Onboarding (Auto-hides or minimizes when setup is 100%) */}
            {((classCount || 0) === 0 || (subjectCount || 0) === 0 || (teacherCount || 0) === 0 || (totalLearnerCount || 0) === 0) && (
              <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#EFF6FF', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
                      <i className="fas fa-flag-checkered"></i>
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#09090b' }}>Quick Setup</span>
                    <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600 }}>
                      ({[classCount > 0, subjectCount > 0, teacherCount > 0, totalLearnerCount > 0].filter(Boolean).length}/4 Done)
                    </span>
                  </div>
                  <button 
                    onClick={() => navigate('/setup')} 
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.78rem', color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Open Setup Wizard &rarr;
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {[
                    { step: '1. Classes', done: (classCount || 0) > 0, link: '/setup', icon: 'fa-school' },
                    { step: '2. Subjects', done: (subjectCount || 0) > 0, link: '/setup', icon: 'fa-book' },
                    { step: '3. Teachers', done: (teacherCount || 0) > 0, link: '/teachers', icon: 'fa-chalkboard-user' },
                    { step: '4. Learners', done: (totalLearnerCount || 0) > 0, link: '/learners', icon: 'fa-user-graduate' }
                  ].map(s => (
                    <div
                      key={s.step}
                      onClick={() => navigate(s.link)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.85rem',
                        borderRadius: '10px',
                        background: s.done ? '#F0FDF4' : '#FAFAFA',
                        border: `1px solid ${s.done ? '#BBF7D0' : '#E4E4E7'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className={`fas ${s.icon}`} style={{ fontSize: '0.8rem', color: s.done ? '#16A34A' : '#A1A1AA' }}></i>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: s.done ? '#15803D' : '#18181B' }}>{s.step}</span>
                      </div>
                      <i className={`fas ${s.done ? 'fa-check-circle' : 'fa-circle-plus'}`} style={{ fontSize: '0.85rem', color: s.done ? '#16A34A' : '#2563eb' }}></i>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="stats-grid">
              <StatCard icon="fa-user-graduate" iconColor="#2563eb" value={totalLearnerCount ?? '—'} label="Total Learners" badge="Active" onClick={() => navigate('/learners')} />
              <StatCard icon="fa-chalkboard-teacher" iconColor="#10B981" value={teacherCount ?? '—'} label="Active Teachers" badge="Staff" badgeColor="#10B981" onClick={() => navigate('/teachers')} />
              <StatCard icon="fa-book" iconColor="#F59E0B" value={subjectCount ?? '—'} label="Subjects Registered" onClick={() => navigate('/setup')} />
              <StatCard icon="fa-school" iconColor="#09090b" value={classCount ?? '—'} label="School Classes" onClick={() => navigate('/setup')} />
            </div>

            {/* Quick Actions (Admin) */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#09090b' }}>Quick Actions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                {[
                  { icon: 'fa-user-plus', label: 'Register Learner', sub: 'Add a new learner to the system', link: '/learners', color: '#2563eb' },
                  { icon: 'fa-chalkboard-user', label: 'Assign Teacher', sub: 'Set subject & class assignments', link: '/setup', color: '#10B981' },
                  { icon: 'fa-stethoscope', label: 'Score Sync Diagnostic', sub: 'Check which teacher scores reached the cloud', link: '/score-diagnostic', color: '#F59E0B' },
                  { icon: 'fa-cog', label: 'School Settings', sub: 'Configure CA weightage and grading scale', link: '/settings', color: '#09090b' },
                  { icon: 'fa-share-nodes', label: copied ? 'Link Copied!' : 'Share Portal Link', sub: 'Copy WhatsApp invitation text for parents', onClick: handleShareInvite, color: '#2563eb' },
                  { icon: 'fa-file-invoice-dollar', label: 'School Financials', sub: 'Manage learner fee payments & billings', link: '/financials', color: '#2563eb' }
                ].map((action) => (
                  <div key={action.label} 
                    onClick={() => action.link ? navigate(action.link) : action.onClick && action.onClick()}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', transition: 'var(--transition)', background: 'var(--surface)', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}08`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
                  >
                    <div style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: 'var(--radius-md)', background: `${action.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`fas ${copied && !action.link ? 'fa-check' : action.icon}`} style={{ color: copied && !action.link ? '#10B981' : action.color }}></i>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{action.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{action.sub}</div>
                    </div>
                    <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}></i>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Analytics System for Super Admins */}
            <AdminAnalytics
              scores={allScores}
              learners={allLearners}
              classes={allClasses}
              subjects={allSubjects}
              settings={settings}
              currentTerm={currentSchool?.currentTerm}
              currentAcademicYear={currentSchool?.currentAcademicYear}
            />
          </>
        ) : (
          /* ==========================================
             TEACHER PORTAL DASHBOARD VIEW
             ========================================== */
          <>
            {/* Stat Cards tailored to the active teacher */}
            <div className="stats-grid">
              <StatCard icon="fa-chalkboard-user" iconColor="#2563eb" value={teacherClasses.length} label="My Assigned Classes" badge="Active" />
              <StatCard icon="fa-book-open" iconColor="#10B981" value={teacherSubjectsCount} label="Assigned Subjects" />
              <StatCard icon="fa-user-graduate" iconColor="#09090b" value={teacherStudentsCount} label="My Total Learners" />
              <StatCard 
                icon="fa-chart-pie" 
                iconColor="#10B981" 
                value={`${overallCompletion}%`} 
                label="Overall Record Progress" 
                badge={overallCompletion === 100 ? "Completed" : "In Progress"} 
                badgeColor={overallCompletion === 100 ? "#10B981" : "#F59E0B"}
              />
            </div>

            {/* Teacher Dashboard Workspaces */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem', flexWrap: 'wrap' }} className="two-col-grid">
              
              {/* Assigned Subjects with Completion Progress */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>
                    My Assigned Classes & Subjects
                  </h2>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                    {progressList.length} Total Assignments
                  </span>
                </div>

                {progressList.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                    {progressList.map((item) => (
                      <div 
                        key={`${item.classId}-${item.subjectId}`}
                        className="card" 
                        style={{ 
                          borderRadius: 'var(--radius-xl)', 
                          border: '1px solid var(--border)', 
                          background: 'var(--surface)', 
                          padding: '1.25rem', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between', 
                          gap: '1.2rem',
                          position: 'relative',
                          overflow: 'hidden',
                          boxShadow: 'var(--shadow-sm)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {/* Status Accent Bar at top */}
                        <div 
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '4px',
                            background: item.progressPercent === 100 
                              ? '#10B981' 
                              : '#2563eb'
                          }} 
                        />
                        
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary)', fontWeight: 800 }}>
                                {item.className}
                              </h4>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px', fontWeight: 500 }}>
                                {item.subjectName}
                              </span>
                            </div>
                            <div 
                              style={{ 
                                width: '38px', 
                                height: '38px', 
                                borderRadius: 'var(--radius-md)', 
                                background: 'rgba(37, 99, 235, 0.08)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                              }}
                            >
                              <i className="fas fa-book-reader" style={{ color: '#2563eb', fontSize: '1rem' }} />
                            </div>
                          </div>
                          
                          {/* Progress Section */}
                          <div style={{ marginTop: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                              <span>Score Entry Status</span>
                              <span style={{ color: item.progressPercent === 100 ? '#10B981' : '#2563eb' }}>
                                {item.recordedCount} / {item.learnersCount} Students ({item.progressPercent}%)
                              </span>
                            </div>
                            
                            {/* Progress bar track */}
                            <div style={{ width: '100%', height: '8px', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '999px', overflow: 'hidden' }}>
                              <div 
                                style={{ 
                                  width: `${item.progressPercent}%`, 
                                  height: '100%', 
                                  borderRadius: '999px',
                                  background: item.progressPercent === 100 
                                    ? '#10B981' 
                                    : '#2563eb',
                                  transition: 'width 0.4s ease-out'
                                }} 
                              />
                            </div>
                          </div>
                        </div>

                        {/* Interactive Deep Link Button */}
                        <div 
                          onClick={() => navigate(`/scores?classId=${item.classId}&subjectId=${item.subjectId}`)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.625rem',
                            borderRadius: 'var(--radius-md)',
                            background: item.progressPercent === 100 ? '#ECFDF5' : '#FAFAFA',
                            border: `1px solid ${item.progressPercent === 100 ? '#A7F3D0' : '#E4E4E7'}`,
                            color: item.progressPercent === 100 ? '#10B981' : '#2563eb',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            transition: 'var(--transition)'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = item.progressPercent === 100 ? '#D1FAE5' : 'rgba(37, 99, 235, 0.08)';
                            e.currentTarget.style.borderColor = '#2563eb';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = item.progressPercent === 100 ? '#ECFDF5' : '#FAFAFA';
                            e.currentTarget.style.borderColor = item.progressPercent === 100 ? '#A7F3D0' : '#E4E4E7';
                          }}
                        >
                          <i className="fas fa-edit" />
                          <span>{item.progressPercent === 100 ? 'Edit Scores' : 'Enter Scores'}</span>
                          <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', fontSize: '0.7rem' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Empty state for assignments */
                  <div 
                    className="card" 
                    style={{ 
                      textAlign: 'center', 
                      padding: '3.5rem 1.5rem', 
                      background: '#FAFAFA', 
                      border: '1px dashed #E4E4E7',
                      borderRadius: 'var(--radius-xl)' 
                    }}
                  >
                    <i className="fas fa-chalkboard-user" style={{ fontSize: '2.5rem', color: '#2563eb', marginBottom: '1rem', opacity: 0.5 }}></i>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#09090b', margin: '0 0 0.5rem 0' }}>
                      No Class Assignments Set
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto' }}>
                      You haven't been assigned to any class or subject yet. Please contact the Headteacher or School Administrator to configure your subject teaching assignments.
                    </p>
                  </div>
                )}
              </div>

              {/* Sidebar Quick Console */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Academic Calendar dates card */}
                {currentSchool && (currentSchool.vacationDate || currentSchool.nextTermBegins) && (
                  <div className="card">
                    <h3 style={{ marginBottom: '1.25rem', fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                      <i className="fas fa-calendar-alt" style={{ color: 'var(--accent)' }}></i>
                      Academic Calendar
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {currentSchool.vacationDate && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>Vacation Date:</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>
                            {formatDateSafe(currentSchool.vacationDate)}
                          </span>
                        </div>
                      )}
                      {currentSchool.nextTermBegins && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>Next Term Begins:</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2563eb' }}>
                            {formatDateSafe(currentSchool.nextTermBegins)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Console card */}
                <div className="card">
                  <h3 style={{ marginBottom: '1.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#09090b' }}>Portal Dashboard Quick Links</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {[
                      { icon: 'fa-keyboard', label: 'Score Recording Terminal', sub: 'Input test, assignments, projects & exam scores', link: '/scores', color: '#2563eb' }
                    ].map((action) => (
                      <div key={action.label} 
                        onClick={() => navigate(action.link)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', transition: 'var(--transition)', background: 'var(--surface)', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}08`; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
                      >
                        <div style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: 'var(--radius-md)', background: `${action.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className={`fas ${action.icon}`} style={{ color: action.color }}></i>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{action.label}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{action.sub}</div>
                        </div>
                        <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}></i>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Local Sync Monitor Card */}
                <div className="card" style={{ padding: '1.25rem', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: 'var(--radius-lg)' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#09090b' }}>
                    <i className="fas fa-sync" style={{ color: '#2563eb', fontSize: '0.85rem' }}></i>
                    <span>Offline Sync Engine</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Network Connection State:</span>
                      <strong style={{ color: navigator.onLine ? '#10B981' : '#F59E0B' }}>
                        {navigator.onLine ? "Online (Cloud Sync Active)" : "Offline (Local Draft Mode)"}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Local Databases:</span>
                      <strong style={{ color: '#2563eb' }}>Dexie (Healthy)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E4E4E7', paddingTop: '8px' }}>
                      <span>Pending Sync Items:</span>
                      <strong style={{ color: pendingCount > 0 ? '#2563eb' : '#71717a' }}>{pendingCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Processing Sync Items:</span>
                      <strong style={{ color: processingCount > 0 ? '#2563eb' : '#71717a' }}>{processingCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Failed Sync Items:</span>
                      <strong style={{ color: failedCount > 0 ? '#EF4444' : '#71717a' }}>{failedCount}</strong>
                    </div>

                    {(pendingCount > 0 || failedCount > 0 || processingCount > 0) && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button 
                          onClick={async () => {
                            if (window.confirm('Force re-sync of all pending and failed items?')) {
                              await forceDrain();
                              alert('Sync started!');
                            }
                          }}
                          className="btn" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, flex: 1, background: '#EFF6FF', color: '#2563eb', border: '1px solid rgba(37, 99, 235, 0.25)' }}
                        >
                          <i className="fas fa-play" style={{ marginRight: '4px' }}></i> Force Sync
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('Clear all pending changes? WARNING: This will discard all unsynced local drafts!')) {
                              await db.outbox.clear();
                              alert('Sync queue cleared.');
                            }
                          }}
                          className="btn" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, flex: 1, background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}
                        >
                          <i className="fas fa-trash-can" style={{ marginRight: '4px' }}></i> Clear Queue
                        </button>
                      </div>
                    )}

                    {failedItems.length > 0 && (
                      <div style={{ marginTop: '8px', borderTop: '1px solid #E4E4E7', paddingTop: '8px' }}>
                        <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: '4px' }}>Recent Sync Errors:</div>
                        <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {failedItems.slice(0, 5).map((item) => (
                            <div key={item.id} style={{ background: '#FEF2F2', padding: '6px', borderRadius: '4px', border: '1px solid #FECACA', fontSize: '0.65rem', color: '#EF4444', lineHeight: 1.3 }}>
                              <strong>{item.operation} {item.table}</strong>: {item.errorMessage || 'Unknown error'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <TeacherAnalytics
                progressList={progressList}
                allScores={allScores}
                allLearners={allLearners}
                settings={settings}
                currentTerm={currentSchool?.currentTerm}
                currentAcademicYear={currentSchool?.currentAcademicYear}
              />
            </div>
          </>
        )}
        {/* Publish Announcement Modal */}
        {isModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(9, 9, 11, 0.55)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              background: '#FFFFFF',
              borderRadius: 'var(--radius-xl)',
              width: '100%',
              maxWidth: '500px',
              padding: '2rem',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border)',
              margin: '1.5rem',
              animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-bullhorn" style={{ color: '#2563eb' }}></i>
                  <span>Publish Announcement</span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' }}
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmitAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="ann-title" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>Bulletin Title</label>
                  <input
                    id="ann-title"
                    type="text"
                    placeholder="e.g. PTA Meeting Notice / Term 2 Resumption"
                    value={annTitle}
                    onChange={e => setAnnTitle(e.target.value)}
                    required
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--border)',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'var(--transition)'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="ann-content" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>Bulletin Message</label>
                  <textarea
                    id="ann-content"
                    rows="6"
                    placeholder="Write the message or details here..."
                    value={annContent}
                    onChange={e => setAnnContent(e.target.value)}
                    required
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--border)',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'none',
                      lineHeight: '1.5',
                      transition: 'var(--transition)'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="btn"
                    style={{
                      padding: '0.625rem 1.25rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--border)',
                      background: 'white',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn btn-primary"
                    style={{
                      padding: '0.625rem 1.25rem',
                      borderRadius: 'var(--radius-md)',
                      background: '#09090b',
                      color: 'white',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane"></i>
                        <span>Publish Bulletin</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
