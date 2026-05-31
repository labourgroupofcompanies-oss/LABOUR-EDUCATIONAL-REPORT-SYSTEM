import React, { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { enqueueSync } from '../services/syncEngine';
import AdminAnalytics from '../components/analytics/AdminAnalytics';
import TeacherAnalytics from '../components/analytics/TeacherAnalytics';

// Premium Green-Themed Stat Card with Micro-Animations
const StatCard = ({ icon, iconColor, value, label, badge, badgeColor }) => (
  <div 
    className="card" 
    style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '0.75rem', 
      position: 'relative', 
      overflow: 'hidden',
      borderLeft: `4px solid ${iconColor || 'var(--accent)'}`,
      transition: 'var(--transition)'
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div 
        style={{ 
          width: '44px', 
          height: '44px', 
          borderRadius: 'var(--radius-lg)', 
          background: `${iconColor}15`, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        <i className={`fas ${icon}`} style={{ color: iconColor, fontSize: '1.1rem' }}></i>
      </div>
      {badge && (
        <span 
          style={{ 
            fontSize: '0.7rem', 
            color: badgeColor || '#059669', 
            fontWeight: 700, 
            background: `${badgeColor ? badgeColor + '15' : 'rgba(16, 185, 129, 0.1)'}`, 
            padding: '0.2rem 0.5rem', 
            borderRadius: '999px',
            textTransform: 'uppercase',
            letterSpacing: '0.02em'
          }}
        >
          {badge}
        </span>
      )}
    </div>
    <div>
      <div 
        style={{ 
          fontSize: '1.85rem', 
          fontWeight: 800, 
          fontFamily: 'Outfit, sans-serif', 
          color: 'var(--primary)', 
          lineHeight: 1 
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 500 }}>
        {label}
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reactive query for local announcements (Admin view)
  const adminAnnouncements = useLiveQuery(
    () => user?.schoolId ? db.announcements.where('schoolId').equals(user.schoolId).reverse().sortBy('created_at') : [],
    [user?.schoolId]
  );

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
    const inviteText = `📝 *${schoolName.toUpperCase()} - PARENT PORTAL*\n\nDear Parent/Guardian,\n\nOur school's online Parent Portal is now active! You can register and log in to:\n✅ View your child's terminal report cards.\n✅ Check outstanding fees and school bills.\n✅ Read PTA announcements and school bulletins.\n\n👉 *Click here to access your portal:*\n${portalUrl}\n\n*Note:* Use your registered primary phone number to claim and set up your account.`;

    navigator.clipboard.writeText(inviteText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };

  const schoolId = user?.schoolId;
  const currentSchool = useLiveQuery(() => schoolId ? db.schools.get(schoolId) : null, [schoolId]);

  // School-wide stats (Admins)
  const totalLearnerCount = useLiveQuery(() => schoolId ? db.learners.where('schoolId').equals(schoolId).count() : Promise.resolve(0), [schoolId]);
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
    () => schoolId ? db.learners.where('schoolId').equals(schoolId).toArray() : Promise.resolve([]),
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


  // ── Seeding & Sync (Self-Healing on Load) ────────────────────────────
  useEffect(() => {
    const pullAllSetupData = async () => {
      if (!navigator.onLine || !user?.schoolId) return;
      console.log('[Dashboard] Executing resilient self-healing sync...');
      
      // 0. Self-heal: Ensure auth user metadata contains school_id for RLS policies
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser && (!authUser.user_metadata?.school_id || authUser.user_metadata.school_id !== user.schoolId)) {
          console.log('[Dashboard Sync] Repairing missing or outdated school_id in auth user metadata...');
          await supabase.auth.updateUser({
            data: { school_id: user.schoolId }
          });
        }
      } catch (err) {
        console.warn('[Dashboard Sync] Auth metadata self-healing skipped:', err);
      }
      
      // 1. Sync & Reconcile Classes
      try {
        const { data: remoteClasses, error: classErr } = await supabase
          .from('report_classes')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!classErr && remoteClasses) {
          const localClasses = await db.classes.where('schoolId').equals(user.schoolId).toArray();
          
          for (const rc of remoteClasses) {
            // Find if there is a local class with the same name (case-insensitive, trimmed)
            const localByName = localClasses.find(c => c.name.toLowerCase().trim() === rc.name.toLowerCase().trim());
            
            if (localByName) {
              if (localByName.id !== rc.id) {
                const oldId = localByName.id;
                const newId = rc.id;
                console.log(`[Dashboard Sync] Reconciling duplicate Class name: "${rc.name}" (Old ID: ${oldId} -> New ID: ${newId})`);
                
                // Update related local records referencing the old class ID
                const relatedLearners = await db.learners.where('currentClassId').equals(oldId).toArray();
                for (const l of relatedLearners) {
                  await db.learners.update(l.id, { currentClassId: newId, synced: false });
                }

                const relatedScores = await db.scores.where('classId').equals(oldId).toArray();
                for (const s of relatedScores) {
                  await db.scores.update(s.id, { classId: newId });
                }

                const relatedAssigns = await db.teacherAssignments.where('classId').equals(oldId).toArray();
                for (const a of relatedAssigns) {
                  await db.teacherAssignments.update(a.id, { classId: newId });
                }

                // Delete old duplicate local record and put the correct one
                await db.classes.delete(oldId);
                await db.classes.put({
                  id: newId,
                  schoolId: rc.school_id,
                  name: rc.name,
                  teachingMode: rc.teaching_mode,
                  createdAt: rc.created_at
                });
              } else {
                if (localByName.name !== rc.name || localByName.teachingMode !== rc.teaching_mode) {
                  await db.classes.update(rc.id, { name: rc.name, teachingMode: rc.teaching_mode });
                }
              }
            } else {
              const localById = await db.classes.get(rc.id);
              if (!localById) {
                await db.classes.put({
                  id: rc.id,
                  schoolId: rc.school_id,
                  name: rc.name,
                  teachingMode: rc.teaching_mode,
                  createdAt: rc.created_at
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Classes sync failed:', err);
      }

      // 2. Sync & Reconcile Subjects
      try {
        const { data: remoteSubjects, error: subErr } = await supabase
          .from('report_subjects')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!subErr && remoteSubjects) {
          const localSubjects = await db.subjects.where('schoolId').equals(user.schoolId).toArray();
          
          for (const rs of remoteSubjects) {
            // Find if there is a local subject with the same name (case-insensitive, trimmed)
            const localByName = localSubjects.find(s => s.name.toLowerCase().trim() === rs.name.toLowerCase().trim());
            
            if (localByName) {
              if (localByName.id !== rs.id) {
                const oldId = localByName.id;
                const newId = rs.id;
                console.log(`[Dashboard Sync] Reconciling duplicate Subject name: "${rs.name}" (Old ID: ${oldId} -> New ID: ${newId})`);
                
                // Update related local records referencing the old subject ID
                const relatedScores = await db.scores.where('subjectId').equals(oldId).toArray();
                for (const s of relatedScores) {
                  await db.scores.update(s.id, { subjectId: newId });
                }

                const relatedAssigns = await db.teacherAssignments.where('subjectId').equals(oldId).toArray();
                for (const a of relatedAssigns) {
                  await db.teacherAssignments.update(a.id, { subjectId: newId });
                }

                // Delete old duplicate name subject and insert new correct one
                await db.subjects.delete(oldId);
                await db.subjects.put({
                  id: newId,
                  schoolId: rs.school_id,
                  name: rs.name,
                  createdAt: rs.created_at
                });
              } else {
                if (localByName.name !== rs.name) {
                  await db.subjects.update(rs.id, { name: rs.name });
                }
              }
            } else {
              const localById = await db.subjects.get(rs.id);
              if (!localById) {
                await db.subjects.put({
                  id: rs.id,
                  schoolId: rs.school_id,
                  name: rs.name,
                  createdAt: rs.created_at
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Subjects sync failed:', err);
      }

      // 3. Sync Class-Subject Mappings
      try {
        const { data: classSubsData, error: classSubsErr } = await supabase
          .from('report_class_subjects')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!classSubsErr && classSubsData) {
          await db.classSubjects.clear();
          for (const cs of classSubsData) {
            await db.classSubjects.put({
              supabaseId: cs.id,
              schoolId: cs.school_id,
              classId: Number(cs.class_id),
              subjectId: Number(cs.subject_id),
              synced: true
            });
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Class-Subject mappings sync failed:', err);
      }

      // 4a. Sync Teacher Profiles
      try {
        const { data: teachersData, error: teachErr } = await supabase
          .from('report_profiles')
          .select('*')
          .eq('school_id', user.schoolId)
          .ilike('role', 'teacher');
        if (teachErr) throw teachErr;
        if (teachersData) {
          const remoteIds = new Set(teachersData.map(p => p.id));
          
          // Get all local teachers for this school
          const localTeachers = await db.profiles
            .where('schoolId').equals(user.schoolId)
            .and(p => p.role?.toLowerCase().trim() === 'teacher')
            .toArray();
            
          // Delete any local teacher that is not in the remote list
          for (const lt of localTeachers) {
            if (!remoteIds.has(lt.id)) {
              await db.profiles.delete(lt.id);
            }
          }

          // Save/Update remote active profiles
          for (const p of teachersData) {
            await db.profiles.put({
              id: p.id,
              schoolId: p.school_id,
              fullName: p.full_name,
              role: p.role,
              staffId: p.staff_id,
              email: p.email
            });
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Teacher profiles sync failed:', err);
      }

      // 4b. Sync Teacher Assignments
      try {
        let query = supabase.from('report_teacher_assignments').select('*').eq('school_id', user.schoolId);
        if (user.role === 'teacher') {
          query = query.eq('teacher_id', user.id);
        }
        const { data: assignData, error: assignErr } = await query;
        if (!assignErr && assignData) {
          if (user.role === 'teacher') {
            const myLocalAssigns = await db.teacherAssignments.where('teacherId').equals(user.id).toArray();
            for (const la of myLocalAssigns) {
              await db.teacherAssignments.delete(la.id);
            }
          } else {
            await db.teacherAssignments.clear();
          }

          for (const a of assignData) {
            await db.teacherAssignments.put({
              supabaseId: a.id,
              schoolId: a.school_id,
              teacherId: a.teacher_id,
              classId: Number(a.class_id),
              subjectId: a.subject_id ? Number(a.subject_id) : null,
              termId: a.term_id ? Number(a.term_id) : null,
              synced: true
            });
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Teacher assignments sync failed:', err);
      }

      // 5. Sync Learners
      try {
        const { data: remoteLearners, error: learnErr } = await supabase
          .from('report_learners')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!learnErr && remoteLearners) {
          // Self-healing duplicate cleanup
          const allLocalLearners = await db.learners.where('schoolId').equals(user.schoolId).toArray();
          const seenSupabaseIds = new Set();
          const seenRegNumbers = new Set();
          
          // Sort so that learners with a supabaseId are processed first (ensures we keep the synced ones)
          const sortedLocal = [...allLocalLearners].sort((a, b) => {
            if (a.supabaseId && !b.supabaseId) return -1;
            if (!a.supabaseId && b.supabaseId) return 1;
            return 0;
          });

          for (const l of sortedLocal) {
            if (typeof l.id === 'string' || !l.id) {
              await db.learners.delete(l.id);
            } else {
              let isDuplicate = false;
              if (l.supabaseId) {
                if (seenSupabaseIds.has(l.supabaseId)) {
                  isDuplicate = true;
                } else {
                  seenSupabaseIds.add(l.supabaseId);
                }
              }
              if (l.regNumber) {
                if (seenRegNumbers.has(l.regNumber)) {
                  isDuplicate = true;
                } else {
                  seenRegNumbers.add(l.regNumber);
                }
              }

              if (isDuplicate) {
                console.log(`[Self-Healing] Deleting duplicate local learner: ${l.fullName} (${l.regNumber})`);
                await db.learners.delete(l.id);
              }
            }
          }

          for (const rl of remoteLearners) {
            // Resurrection prevention: if there is a pending delete in the outbox or local storage for this learner, skip recreating them!
            const isPendingDelete = await db.outbox
              .filter(o => o.table === 'report_learners' && o.operation === 'delete' && (o.payload.includes(rl.id) || (rl.reg_number && o.payload.includes(rl.reg_number))))
              .first();
            
            const inlineDeletedQueue = JSON.parse(localStorage.getItem('pending_deleted_learners') || '[]');
            const isInlineDeleted = inlineDeletedQueue.includes(rl.id);

            if (isPendingDelete || isInlineDeleted) {
              console.log(`[Dashboard Sync] Skipping resurrection of deleted learner: ${rl.full_name}`);
              continue;
            }

            // 1. Check if the learner exists by Supabase ID
            let local = await db.learners.where('supabaseId').equals(rl.id).first();
            
            // 2. Fallback: If not found, check by registration number (in case of a desynced offline upload)
            if (!local && rl.reg_number) {
              local = await db.learners.where('regNumber').equals(rl.reg_number).first();
            }

            if (!local) {
              await db.learners.add({
                schoolId: rl.school_id,
                regNumber: rl.reg_number,
                fullName: rl.full_name,
                gender: rl.gender,
                currentClassId: rl.class_id,
                photoUrl: rl.photo_url,
                synced: true,
                supabaseId: rl.id
              });
            } else {
              await db.learners.update(local.id, {
                regNumber: rl.reg_number,
                fullName: rl.full_name,
                gender: rl.gender,
                currentClassId: rl.class_id,
                photoUrl: rl.photo_url,
                synced: true,
                supabaseId: rl.id
              });
            }
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Learners sync failed:', err);
      }

      // 6. Sync Scores
      try {
        const { data: cloudScores, error: scoreErr } = await supabase
          .from('report_scores')
          .select('*')
          .eq('school_id', user.schoolId);
        if (cloudScores && !scoreErr) {
          for (const cs of cloudScores) {
            const existing = await db.scores
              .where('learnerId').equals(cs.learner_id)
              .filter(s => s.classId === cs.class_id && s.subjectId === cs.subject_id && s.term === cs.term && s.academicYear === cs.academic_year)
              .first();
            
            const entry = {
              learnerId: cs.learner_id,
              classId: cs.class_id,
              subjectId: cs.subject_id,
              caScores: cs.ca_scores || [],
              examScore: cs.exam_score || '',
              classScore: cs.class_score || 0,
              totalScore: cs.total_score || 0,
              grade: cs.grade || '',
              remark: cs.remark || '',
              isSubmitted: cs.is_submitted || false,
              termId: null,
              term: cs.term || '',
              academicYear: cs.academic_year || '',
              schoolId: cs.school_id,
              updatedAt: cs.updated_at
            };

            if (existing) {
              await db.scores.update(existing.id, entry);
            } else {
              await db.scores.add(entry);
            }
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Scores sync failed:', err);
      }

      // 7. Sync Global Settings
      try {
        const { data: settingsList, error: settingsErr } = await supabase
          .from('report_settings')
          .select('*')
          .eq('id', user.schoolId);
        const settingsData = settingsList?.[0];
        if (settingsData && !settingsErr) {
          await db.settings.put({
            id: 'global',
            caWeight: settingsData.ca_weight,
            examWeight: settingsData.exam_weight,
            caModel: settingsData.ca_model,
            caBestNCount: settingsData.ca_best_n || '',
            caBreakdown: settingsData.ca_breakdown || [],
            gradingScale: settingsData.grading_scale || []
          });
        }
      } catch (err) {
        console.error('[Dashboard Sync] Global Settings sync failed:', err);
      }

      // 8. Sync School Announcements & PTA Bulletins
      try {
        const { data: annData, error: annErr } = await supabase
          .from('report_announcements')
          .select('*')
          .eq('school_id', user.schoolId)
          .order('created_at', { ascending: false });
        if (!annErr && annData) {
          await db.announcements.where('schoolId').equals(user.schoolId).delete();
          for (const a of annData) {
            await db.announcements.add({
              title: a.title,
              content: a.content,
              schoolId: a.school_id,
              supabaseId: a.id,
              created_at: a.created_at,
              synced: true
            });
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync] Announcements sync failed:', err);
      }
    };

    pullAllSetupData();
  }, [user]);

  // ── Computing Teacher Portal Dashboard Data ──────────────────────────
  
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

  // Green Color Code Styling Elements
  const greenPalette = {
    forest: '#0f766e',
    emerald: '#10b981',
    emeraldDark: '#059669',
    mint: '#f0fdf4',
    mintBorder: '#bbf7d0',
    primaryGrad: 'linear-gradient(135deg, #115e59 0%, #0d9488 50%, #10b981 100%)',
    cyan: '#0891b2',
    accentText: '#134e4a'
  };

  return (
    <Layout title="Dashboard">
      <div className="fade-in">
        {/* Welcome Banner - Premium Teal-Emerald Green Gradient */}
        <div className="welcome-banner">
          <div className="welcome-banner-left">
            {/* School Logo in banner */}
            <div className="welcome-banner-logo">
              {currentSchool?.logoUrl
                ? <img src={currentSchool.logoUrl} alt="School Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <i className="fas fa-school" style={{ fontSize: '1.6rem', color: 'rgba(255,255,255,0.7)' }} />
              }
            </div>
            <div className="welcome-banner-text">
              <h1>
                Welcome back, {user?.fullName?.split(' ')[0]} 👋
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
            <div className="stats-grid">
              <StatCard icon="fa-user-graduate" iconColor="#0d9488" value={totalLearnerCount ?? '—'} label="Total Learners" badge="Active" />
              <StatCard icon="fa-chalkboard-teacher" iconColor="#059669" value={teacherCount ?? '—'} label="Active Teachers" badge="Staff" badgeColor="#059669" />
              <StatCard icon="fa-book" iconColor="#16a34a" value={subjectCount ?? '—'} label="Subjects Registered" />
              <StatCard icon="fa-school" iconColor="#0f766e" value={classCount ?? '—'} label="School Classes" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {/* Quick Actions (Admin) */}
              <div className="card">
                <h3 style={{ marginBottom: '1.25rem', fontSize: '1.05rem', fontWeight: 800 }}>Quick Actions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { icon: 'fa-user-plus', label: 'Register Learner', sub: 'Add a new learner to the system', link: '/learners', color: '#0d9488' },
                    { icon: 'fa-chalkboard-user', label: 'Assign Teacher', sub: 'Set subject & class assignments', link: '/setup', color: '#059669' },
                    { icon: 'fa-cog', label: 'School Settings', sub: 'Configure CA weightage and grading scale', link: '/settings', color: '#0f766e' },
                    { icon: 'fa-share-nodes', label: copied ? 'Link Copied!' : 'Share Portal Link', sub: 'Copy WhatsApp invitation text for parents', onClick: handleShareInvite, color: '#0ea5e9' }
                  ].map((action) => {
                    const isLink = !!action.link;
                    const Element = isLink ? 'a' : 'div';
                    return (
                      <Element key={action.label} 
                        href={isLink ? action.link : undefined}
                        onClick={!isLink ? action.onClick : undefined}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', textDecoration: 'none', transition: 'var(--transition)', background: 'var(--surface)', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}08`; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
                      >
                        <div style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: 'var(--radius-md)', background: `${action.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className={`fas ${copied && !isLink ? 'fa-check' : action.icon}`} style={{ color: copied && !isLink ? '#10b981' : action.color }}></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{action.label}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{action.sub}</div>
                        </div>
                        <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}></i>
                      </Element>
                    );
                  })}
                </div>
              </div>

            </div>

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
             TEACHER PORTAL DASHBOARD VIEW (GREEN CODED)
             ========================================== */
          <>
            {/* Stat Cards tailored to the active teacher */}
            <div className="stats-grid">
              <StatCard icon="fa-chalkboard-user" iconColor="#0d9488" value={teacherClasses.length} label="My Assigned Classes" badge="Active" />
              <StatCard icon="fa-book-open" iconColor="#10b981" value={teacherSubjectsCount} label="Assigned Subjects" />
              <StatCard icon="fa-user-graduate" iconColor="#0891b2" value={teacherStudentsCount} label="My Total Learners" />
              <StatCard 
                icon="fa-chart-pie" 
                iconColor="#16a34a" 
                value={`${overallCompletion}%`} 
                label="Overall Record Progress" 
                badge={overallCompletion === 100 ? "Completed" : "In Progress"} 
                badgeColor={overallCompletion === 100 ? "#059669" : "#d97706"}
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
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0d9488', background: 'rgba(13, 148, 136, 0.08)', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
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
                              ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' 
                              : 'linear-gradient(90deg, #0d9488 0%, #10b981 100%)'
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
                                background: 'rgba(13, 148, 136, 0.08)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                              }}
                            >
                              <i className="fas fa-book-reader" style={{ color: '#0d9488', fontSize: '1rem' }} />
                            </div>
                          </div>
                          
                          {/* Progress Section */}
                          <div style={{ marginTop: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                              <span>Score Entry Status</span>
                              <span style={{ color: item.progressPercent === 100 ? '#059669' : '#0d9488' }}>
                                {item.recordedCount} / {item.learnersCount} Students ({item.progressPercent}%)
                              </span>
                            </div>
                            
                            {/* Progress bar track */}
                            <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                              <div 
                                style={{ 
                                  width: `${item.progressPercent}%`, 
                                  height: '100%', 
                                  borderRadius: '999px',
                                  background: item.progressPercent === 100 
                                    ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' 
                                    : 'linear-gradient(90deg, #0d9488 0%, #10b981 100%)',
                                  transition: 'width 0.4s ease-out'
                                }} 
                              />
                            </div>
                          </div>
                        </div>

                        {/* Interactive Deep Link Button */}
                        <a 
                          href={`/scores?classId=${item.classId}&subjectId=${item.subjectId}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.625rem',
                            borderRadius: 'var(--radius-md)',
                            background: item.progressPercent === 100 ? greenPalette.mint : 'var(--background)',
                            border: `1px solid ${item.progressPercent === 100 ? greenPalette.mintBorder : 'var(--border)'}`,
                            color: item.progressPercent === 100 ? '#15803d' : '#0d9488',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            textDecoration: 'none',
                            transition: 'var(--transition)'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = item.progressPercent === 100 ? '#dcfce7' : 'rgba(13, 148, 136, 0.08)';
                            e.currentTarget.style.borderColor = '#0d9488';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = item.progressPercent === 100 ? greenPalette.mint : 'var(--background)';
                            e.currentTarget.style.borderColor = item.progressPercent === 100 ? greenPalette.mintBorder : 'var(--border)';
                          }}
                        >
                          <i className="fas fa-edit" />
                          <span>{item.progressPercent === 100 ? 'Edit Scores' : 'Enter Scores'}</span>
                          <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', fontSize: '0.7rem' }} />
                        </a>
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
                      background: greenPalette.mint, 
                      border: `1px dashed ${greenPalette.mintBorder}`,
                      borderRadius: 'var(--radius-xl)' 
                    }}
                  >
                    <i className="fas fa-chalkboard-user" style={{ fontSize: '2.5rem', color: '#0d9488', marginBottom: '1rem', opacity: 0.75 }}></i>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: greenPalette.accentText, margin: '0 0 0.5rem 0' }}>
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
                {/* Console card */}
                <div className="card">
                  <h3 style={{ marginBottom: '1.25rem', fontSize: '1.05rem', fontWeight: 800 }}>Portal Dashboard Quick Links</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {[
                      { icon: 'fa-keyboard', label: 'Score Recording Terminal', sub: 'Input test, assignments, projects & exam scores', link: '/scores', color: '#0d9488' }
                    ].map((action) => (
                      <a key={action.label} href={action.link}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', textDecoration: 'none', transition: 'var(--transition)', background: 'var(--surface)' }}
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
                      </a>
                    ))}
                  </div>
                </div>

                {/* Local Sync Monitor Card */}
                <div className="card" style={{ padding: '1.25rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-lg)' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-sync" style={{ color: '#0d9488', fontSize: '0.85rem' }}></i>
                    <span>Offline Sync Engine</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Network Connection State:</span>
                      <strong style={{ color: navigator.onLine ? '#059669' : '#d97706' }}>
                        {navigator.onLine ? "Online (Cloud Sync Active)" : "Offline (Local Draft Mode)"}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Local Databases:</span>
                      <strong style={{ color: '#0f766e' }}>Dexie (Healthy)</strong>
                    </div>
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
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              background: 'white',
              borderRadius: 'var(--radius-xl)',
              width: '100%',
              maxWidth: '500px',
              padding: '2rem',
              boxShadow: 'var(--shadow-2xl)',
              border: '1px solid var(--border)',
              margin: '1.5rem',
              animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-bullhorn" style={{ color: '#0d9488' }}></i>
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
                      border: '1px solid var(--border)',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      transition: 'var(--transition)'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0d9488'}
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
                      border: '1px solid var(--border)',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'none',
                      lineHeight: '1.5',
                      transition: 'var(--transition)'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0d9488'}
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
                      border: '1px solid var(--border)',
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
                      background: 'var(--primary)',
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
