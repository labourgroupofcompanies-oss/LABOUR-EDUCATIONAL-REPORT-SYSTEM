import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import { useAuth } from '../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { enqueueSync, retryFailed, forceDrain } from '../services/syncEngine';
import AdminAnalytics from '../components/analytics/AdminAnalytics';
import TeacherAnalytics from '../components/analytics/TeacherAnalytics';
import TeacherReferralCard from '../components/referrals/TeacherReferralCard';
import learnerRepository from '../repositories/learnerRepository';
import subscriptionService from '../services/subscriptionService';
import broadcastService from '../services/broadcastService';
import { getTeacherIdentifierSet, isAssignmentForTeacher } from '../utils/teacherUtils';

// Clean, Well-Proportioned Metric Stat Card
const StatCard = ({ icon, value, label, badge, badgeColor, onClick, isPrimary = false }) => (
  <div 
    onClick={onClick}
    style={{ 
      background: '#FFFFFF',
      border: isPrimary ? '1.5px solid #09090b' : '1px solid #E4E4E7',
      borderRadius: '14px',
      padding: isPrimary ? '1.25rem 1.4rem' : '0.95rem 1.15rem',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '0.65rem',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: isPrimary 
        ? '0 3px 12px -2px rgba(9, 9, 11, 0.06)' 
        : '0 1px 2px rgba(0, 0, 0, 0.02)',
      position: 'relative',
      height: '100%',
      boxSizing: 'border-box'
    }}
    onMouseEnter={e => {
      if (onClick) {
        e.currentTarget.style.borderColor = '#09090b';
        e.currentTarget.style.boxShadow = isPrimary
          ? '0 6px 18px -4px rgba(9, 9, 11, 0.1)'
          : '0 4px 12px -2px rgba(9, 9, 11, 0.05)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }
    }}
    onMouseLeave={e => {
      if (onClick) {
        e.currentTarget.style.borderColor = isPrimary ? '#09090b' : '#E4E4E7';
        e.currentTarget.style.boxShadow = isPrimary 
          ? '0 3px 12px -2px rgba(9, 9, 11, 0.06)' 
          : '0 1px 2px rgba(0, 0, 0, 0.02)';
        e.currentTarget.style.transform = 'translateY(0)';
      }
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        {icon && (
          <i 
            className={`fas ${icon}`} 
            style={{ 
              fontSize: isPrimary ? '0.95rem' : '0.8rem', 
              color: isPrimary ? '#09090b' : '#71717a' 
            }}
          />
        )}
        <span style={{ 
          fontSize: isPrimary ? '0.8rem' : '0.74rem', 
          fontWeight: 700, 
          color: isPrimary ? '#09090b' : '#71717a',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          {label}
        </span>
      </div>

      {badge && (
        <span 
          style={{ 
            fontSize: '0.65rem', 
            color: badgeColor || '#059669', 
            fontWeight: 800, 
            background: `${badgeColor ? badgeColor + '14' : 'rgba(16, 185, 129, 0.1)'}`, 
            border: `1px solid ${badgeColor ? badgeColor + '28' : 'rgba(16, 185, 129, 0.22)'}`,
            padding: '0.18rem 0.5rem', 
            borderRadius: '999px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}
        >
          {badge}
        </span>
      )}
    </div>

    <div>
      <div 
        style={{ 
          fontSize: isPrimary ? 'clamp(2.1rem, 3.8vw, 2.75rem)' : 'clamp(1.5rem, 2.4vw, 1.85rem)', 
          fontWeight: 900, 
          fontFamily: 'Outfit, sans-serif', 
          color: '#09090b', 
          lineHeight: 1,
          letterSpacing: '-0.03em'
        }}
      >
        {value}
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'super_admin' || user?.isImpersonating || user?.role === 'headteacher' || user?.role === 'admin';

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
  const [platformBroadcasts, setPlatformBroadcasts] = useState([]);

  // Reactive active platform announcements for this role
  useEffect(() => {
    const role = user?.role === 'super_admin' ? 'headteacher' : (user?.role || 'all');
    const updateBroadcasts = () => {
      const list = broadcastService.getBroadcastsForRole(role);
      setPlatformBroadcasts(list || []);
    };

    updateBroadcasts();
    window.addEventListener('platform-broadcast-updated', updateBroadcasts);
    return () => window.removeEventListener('platform-broadcast-updated', updateBroadcasts);
  }, [user?.role]);

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
  const teacherIdTokens = useLiveQuery(
    async () => {
      return await getTeacherIdentifierSet(user, db);
    },
    [user]
  );

  const assignments = useLiveQuery(
    async () => {
      if (!user || user.role !== 'teacher') return [];
      const idTokens = teacherIdTokens || await getTeacherIdentifierSet(user, db);
      const allSchoolAssigns = await db.teacherAssignments
        .filter(a => isAssignmentForTeacher(a, idTokens, user))
        .toArray();
      return allSchoolAssigns;
    },
    [user, teacherIdTokens]
  );
  // Settings needed for analytics (grading scale thresholds)
  const settings = useLiveQuery(() => db.settings.get('global'), []);


  // Background pull sync is managed globally by SyncEngineProvider for all routes.

  // ── Computing Teacher Portal Dashboard Data ────────────────────────
  
  // 1. My Classes
  const teacherClasses = React.useMemo(() => {
    if (!assignments || !allClasses) return [];
    const assignedClassIds = new Set(assignments.map(a => String(a.classId)));
    return allClasses.filter(c => 
      assignedClassIds.has(String(c.id)) || 
      (c.supabaseId && assignedClassIds.has(String(c.supabaseId))) ||
      (!isNaN(Number(c.id)) && assignments.some(a => Number(a.classId) === Number(c.id)))
    );
  }, [allClasses, assignments]);

  // 2. My Class-Subject combinations (handles Class Teacher Mode as well)
  const teacherClassSubjects = React.useMemo(() => {
    if (!assignments || !allClasses) return [];
    
    const list = [];
    const seen = new Set();
    
    assignments.forEach(assign => {
      const classIdStr = String(assign.classId);
      const classObj = allClasses.find(c => String(c.id) === classIdStr || (c.supabaseId && String(c.supabaseId) === classIdStr) || (!isNaN(Number(c.id)) && Number(c.id) === Number(assign.classId)));
      if (!classObj) return;
      const targetClassId = classObj.id;
      
      const isClassTeacher = assign.subjectId === null || assign.subjectId === undefined;
      const mode = classObj.teachingMode || 'class_teacher';
      
      if (isClassTeacher) {
        // Class Teacher Mode or Form Master: gets all subjects for this class
        let subjectsForClass = (classSubjects || []).filter(cs => String(cs.classId) === classIdStr || Number(cs.classId) === Number(targetClassId));
        if (subjectsForClass.length === 0 && allSubjects && allSubjects.length > 0) {
          subjectsForClass = allSubjects.map(s => ({ subjectId: s.id }));
        }
        subjectsForClass.forEach(cs => {
          const key = `${targetClassId}-${cs.subjectId}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({ classId: targetClassId, subjectId: Number(cs.subjectId) });
          }
        });
      } else {
        // Specific assigned subject
        const key = `${targetClassId}-${assign.subjectId}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ classId: targetClassId, subjectId: Number(assign.subjectId) });
        }
      }
    });
    
    return list;
  }, [assignments, allClasses, classSubjects, allSubjects]);

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
        {/* Academic Briefing Bar (Human & Editorial) */}
        <div 
          style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '220px' }}>
            {currentSchool?.logoUrl && !logoError && !currentSchool.logoUrl.startsWith('blob:') ? (
              <div 
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid #E4E4E7',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#FAFAFA'
                }}
              >
                <img
                  src={currentSchool.logoUrl}
                  alt="School Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : null}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: '#09090b', letterSpacing: '-0.02em' }}>
                  {isAdmin ? 'School Overview' : 'Teacher Workspace'}
                </h1>
                <span 
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.55rem',
                    borderRadius: '6px',
                    background: '#F4F4F5',
                    color: '#52525B',
                    border: '1px solid #E4E4E7'
                  }}
                >
                  {isAdmin ? 'Administration' : 'Faculty'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#71717a', fontWeight: 500, marginTop: '2px' }}>
                {currentSchool?.currentAcademicYear ? `${currentSchool.currentAcademicYear} Academic Year` : 'Current Session'}
                {currentSchool?.currentTerm && <span> &bull; {currentSchool.currentTerm}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#52525B',
                background: '#F8FAFC',
                padding: '0.5rem 0.85rem',
                borderRadius: '10px',
                border: '1px solid #E2E8F0'
              }}
            >
              <i className="far fa-calendar-alt" style={{ color: '#09090b' }}></i>
              <span>{new Date().toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Official Platform Announcements & Directives */}
        {platformBroadcasts && platformBroadcasts.length > 0 && (
          <div
            style={{
              marginBottom: '1.5rem',
              borderRadius: '14px',
              background: '#FFFFFF',
              color: '#09090b',
              padding: '1rem 1.25rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              flexWrap: 'wrap',
              border: '1px solid #E4E4E7'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#F4F4F5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <i className="fas fa-bullhorn" style={{ color: '#09090b', fontSize: '0.85rem' }}></i>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    padding: '0.12rem 0.45rem',
                    borderRadius: '4px'
                  }}>
                    Official Bulletin
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#71717A' }}>
                    {platformBroadcasts.length > 1 ? `${platformBroadcasts.length} Active Bulletins` : 'School Notice'}
                  </span>
                </div>
                <h4 style={{ margin: '0 0 2px 0', fontSize: '0.9rem', fontWeight: 800, color: '#09090b', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {platformBroadcasts[0].title}
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '0.78rem',
                  color: '#52525B',
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {platformBroadcasts[0].content}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-platform-broadcast-modal', { detail: platformBroadcasts[0] }));
                }}
                style={{
                  background: '#09090b',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Read Bulletin</span>
                <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
              </button>
            </div>
          </div>
        )}

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

            {/* Balanced Human Metric Cards Grid: Prominent Primary + 3 Compact Counterparts */}
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1.75rem',
                alignItems: 'stretch'
              }}
            >
              <StatCard 
                icon="fa-user-graduate" 
                value={totalLearnerCount ?? '—'} 
                label="Enrolled Learners" 
                onClick={() => navigate('/learners')} 
                isPrimary={true}
              />
              <StatCard 
                icon="fa-chalkboard-user" 
                value={teacherCount ?? '—'} 
                label="Teaching Staff" 
                onClick={() => navigate('/teachers')} 
              />
              <StatCard 
                icon="fa-book" 
                value={subjectCount ?? '—'} 
                label="Active Subjects" 
                onClick={() => navigate('/setup')} 
              />
              <StatCard 
                icon="fa-school" 
                value={classCount ?? '—'} 
                label="School Classes" 
                onClick={() => navigate('/setup')} 
              />
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
            {/* Balanced Human Metric Cards Grid for Teachers */}
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1.75rem',
                alignItems: 'stretch'
              }}
            >
              <StatCard 
                icon="fa-chart-pie" 
                value={`${overallCompletion}%`} 
                label="Scores Submitted" 
                isPrimary={true}
              />
              <StatCard 
                icon="fa-user-graduate" 
                value={teacherStudentsCount} 
                label="Assigned Students" 
              />
              <StatCard 
                icon="fa-chalkboard-user" 
                value={teacherClasses.length} 
                label="Classes Handled" 
              />
              <StatCard 
                icon="fa-book-open" 
                value={teacherSubjectsCount} 
                label="Subjects Taught" 
              />
            </div>

            {/* Teacher Dashboard Workspaces */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem', flexWrap: 'wrap' }} className="two-col-grid">
              
              {/* Assigned Subjects with Completion Progress */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#09090B', margin: 0 }}>
                    My Assigned Classes & Subjects
                  </h2>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#52525B', background: '#F4F4F5', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid #E4E4E7' }}>
                    {progressList.length} Total Assignments
                  </span>
                </div>

                {progressList.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    {progressList.map((item) => (
                      <div 
                        key={`${item.classId}-${item.subjectId}`}
                        className="card" 
                        style={{ 
                          borderRadius: '12px', 
                          border: '1px solid #E4E4E7', 
                          background: '#FFFFFF', 
                          padding: '1.15rem', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between', 
                          gap: '1rem',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#09090B', fontWeight: 700 }}>
                                {item.className}
                              </h4>
                              <span style={{ fontSize: '0.78rem', color: '#71717A', display: 'block', marginTop: '2px', fontWeight: 500 }}>
                                {item.subjectName}
                              </span>
                            </div>
                            <div 
                              style={{ 
                                width: '34px', 
                                height: '34px', 
                                borderRadius: '8px', 
                                background: '#F4F4F5', 
                                border: '1px solid #E4E4E7',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                              }}
                            >
                              <i className="fas fa-book-reader" style={{ color: '#09090B', fontSize: '0.85rem' }} />
                            </div>
                          </div>
                          
                          {/* Progress Section */}
                          <div style={{ marginTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700, color: '#71717A', marginBottom: '6px' }}>
                              <span>Score Entry Status</span>
                              <span style={{ color: '#09090B', fontWeight: 700 }}>
                                {item.recordedCount} / {item.learnersCount} Students ({item.progressPercent}%)
                              </span>
                            </div>
                            
                            {/* Progress bar track */}
                            <div style={{ width: '100%', height: '6px', background: '#F4F4F5', border: '1px solid #E4E4E7', borderRadius: '999px', overflow: 'hidden' }}>
                              <div 
                                style={{ 
                                  width: `${item.progressPercent}%`, 
                                  height: '100%', 
                                  borderRadius: '999px',
                                  background: '#09090B',
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
                            padding: '0.55rem',
                            borderRadius: '8px',
                            background: '#FFFFFF',
                            border: '1px solid #E4E4E7',
                            color: '#09090B',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#F4F4F5';
                            e.currentTarget.style.borderColor = '#09090B';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = '#FFFFFF';
                            e.currentTarget.style.borderColor = '#E4E4E7';
                          }}
                        >
                          <i className="fas fa-edit" style={{ fontSize: '0.75rem' }} />
                          <span>{item.progressPercent === 100 ? 'Edit Scores' : 'Enter Scores'}</span>
                          <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#71717A' }} />
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
                      padding: '3rem 1.5rem', 
                      background: '#FAFAFA', 
                      border: '1px dashed #E4E4E7',
                      borderRadius: '12px' 
                    }}
                  >
                    <i className="fas fa-chalkboard-user" style={{ fontSize: '2rem', color: '#A1A1AA', marginBottom: '0.75rem', display: 'block' }}></i>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#09090B', margin: '0 0 0.35rem 0' }}>
                      No Class Assignments Set
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: '#71717A', margin: 0, maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto' }}>
                      You haven't been assigned to any class or subject yet. Please contact the Headteacher or School Administrator to configure your subject teaching assignments.
                    </p>
                  </div>
                )}
              </div>

              {/* Sidebar Quick Console */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Academic Calendar dates card */}
                {currentSchool && (currentSchool.vacationDate || currentSchool.nextTermBegins) && (
                  <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '1.15rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#09090B' }}>
                      <i className="fas fa-calendar-alt" style={{ color: '#09090B' }}></i>
                      Academic Calendar
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {currentSchool.vacationDate && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F4F4F5', paddingBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.78rem', color: '#71717A', fontWeight: 500 }}>Vacation Date:</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#09090B' }}>
                            {formatDateSafe(currentSchool.vacationDate)}
                          </span>
                        </div>
                      )}
                      {currentSchool.nextTermBegins && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', color: '#71717A', fontWeight: 500 }}>Next Term Begins:</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#09090B' }}>
                            {formatDateSafe(currentSchool.nextTermBegins)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Console card */}
                <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '12px', padding: '1.15rem' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 700, color: '#09090B' }}>Portal Dashboard Quick Links</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {[
                      { icon: 'fa-keyboard', label: 'Score Recording Terminal', sub: 'Input test, assignments, projects & exam scores', link: '/scores' }
                    ].map((action) => (
                      <div key={action.label} 
                        onClick={() => navigate(action.link)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7', transition: 'all 0.15s ease', background: '#FFFFFF', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#09090B'; e.currentTarget.style.background = '#F4F4F5'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E4E7'; e.currentTarget.style.background = '#FFFFFF'; }}
                      >
                        <div style={{ width: '34px', height: '34px', minWidth: '34px', borderRadius: '8px', background: '#F4F4F5', border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className={`fas ${action.icon}`} style={{ color: '#09090B', fontSize: '0.85rem' }}></i>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#09090B' }}>{action.label}</div>
                          <div style={{ fontSize: '0.72rem', color: '#71717A' }}>{action.sub}</div>
                        </div>
                        <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', color: '#71717A', fontSize: '0.7rem' }}></i>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Local Sync Monitor Card */}
                <div className="card" style={{ padding: '1.15rem', background: '#FAFAFA', border: '1px solid #E4E4E7', borderRadius: '12px' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#09090B' }}>
                    <i className="fas fa-sync" style={{ color: '#09090B', fontSize: '0.8rem' }}></i>
                    <span>Offline &amp; Cloud Sync Status</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.74rem', color: '#71717A', fontWeight: 500 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Internet Connection:</span>
                      <strong style={{ color: '#09090B' }}>
                        {navigator.onLine ? "Connected to Cloud" : "Working Offline (Safe on Device)"}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Device Storage:</span>
                      <strong style={{ color: '#09090B' }}>Safe &amp; Active</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E4E4E7', paddingTop: '6px' }}>
                      <span>Saved Work Waiting to Upload:</span>
                      <strong style={{ color: '#09090B' }}>{pendingCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Items Currently Uploading:</span>
                      <strong style={{ color: '#09090B' }}>{processingCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Uploads to Retry:</span>
                      <strong style={{ color: '#09090B' }}>{failedCount}</strong>
                    </div>

                    {(pendingCount > 0 || failedCount > 0 || processingCount > 0) && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button 
                          onClick={async () => {
                            if (await window.confirm('Force re-sync of all pending and failed items?')) {
                              await forceDrain();
                              alert('Sync started!');
                            }
                          }}
                          className="btn" 
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, flex: 1, background: '#09090B', color: '#FFFFFF', border: '1px solid #09090B', borderRadius: '6px' }}
                        >
                          <i className="fas fa-play" style={{ marginRight: '4px', fontSize: '0.65rem' }}></i> Force Sync
                        </button>
                        <button 
                          onClick={async () => {
                            if (await window.confirm('Clear all pending changes? WARNING: This will discard all unsynced local drafts!')) {
                              await db.outbox.clear();
                              alert('Sync queue cleared.');
                            }
                          }}
                          className="btn" 
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, flex: 1, background: '#FFFFFF', color: '#09090B', border: '1px solid #E4E4E7', borderRadius: '6px' }}
                        >
                          <i className="fas fa-trash-can" style={{ marginRight: '4px', fontSize: '0.65rem' }}></i> Clear Queue
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

            <div style={{ marginTop: '1.5rem' }}>
              <TeacherReferralCard schoolId={user?.schoolId} schoolName={currentSchool?.name} />
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
