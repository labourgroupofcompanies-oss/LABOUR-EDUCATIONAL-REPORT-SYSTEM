import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../lib/db';
import { supabase } from '../../lib/supabase';
import authService from '../../services/authService';

const ParentDashboard = () => {
  const navigate = useNavigate();
  const parent = authService.getCurrentParent();
  
  // Sibling selection
  const [siblings, setSiblings] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);

  // Change password states
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    
    if (pwdNew !== pwdConfirm) {
      setPwdError('New passwords do not match.');
      return;
    }
    if (pwdNew.length < 6) {
      setPwdError('Password must be at least 6 characters.');
      return;
    }
    if (pwdCurrent === pwdNew) {
      setPwdError('New password cannot be the same as current password.');
      return;
    }
    
    setPwdLoading(true);
    try {
      await authService.changeParentPassword(parent.phone_number, pwdCurrent, pwdNew);
      setPwdSuccess('Your password has been successfully updated!');
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
    } catch (err) {
      setPwdError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setPwdLoading(false);
    }
  };
  
  useEffect(() => {
    // Load siblings list saved during login
    const cachedSiblings = JSON.parse(localStorage.getItem('labour_edu_parent_siblings') || '[]');
    if (cachedSiblings.length > 0) {
      setSiblings(cachedSiblings);
    } else {
      // Fallback: lookup in local db if cache is cleared
      const lookupSiblings = async () => {
        if (parent?.phone_number) {
          const clean = parent.phone_number.replace(/[\s\-\+\(\)]/g, '').slice(-9);
          // Use filter() to avoid loading all learners into memory
          const matched = await db.learners
            .filter(l => {
              const c1 = l.guardianContact1 ? l.guardianContact1.replace(/[\s\-\+\(\)]/g, '').slice(-9) : '';
              const c2 = l.guardianContact2 ? l.guardianContact2.replace(/[\s\-\+\(\)]/g, '').slice(-9) : '';
              return c1 === clean || c2 === clean;
            })
            .toArray();
          setSiblings(matched);
          localStorage.setItem('labour_edu_parent_siblings', JSON.stringify(matched));
        }
      };
      lookupSiblings();
    }
  }, [parent?.phone_number]);

  useEffect(() => {
    const syncSiblingSchools = async () => {
      if (!navigator.onLine || !siblings || siblings.length === 0) return;
      try {
        const uniqueSchoolIds = [...new Set(siblings.map(s => s.schoolId).filter(Boolean))];
        for (const sId of uniqueSchoolIds) {
          const { data: remoteSchool, error: schoolError } = await supabase
            .from('report_schools')
            .select('*')
            .eq('id', sId)
            .maybeSingle();

          if (remoteSchool && !schoolError) {
            await db.schools.put({
              id: sId,
              name: remoteSchool.name || '',
              location: remoteSchool.location || '',
              district: remoteSchool.district || '',
              region: remoteSchool.region || '',
              circuit: remoteSchool.circuit || '',
              motto: remoteSchool.motto || '',
              logoUrl: remoteSchool.logo_url || '',
              currentAcademicYear: remoteSchool.current_academic_year || '',
              currentTerm: remoteSchool.current_term || 'Term 1',
              vacationDate: remoteSchool.vacation_date || '',
              nextTermBegins: remoteSchool.next_term_begins || '',
              phone: remoteSchool.phone || '',
              email: remoteSchool.email || ''
            });
          }
        }
      } catch (err) {
        console.warn('Failed to pre-sync sibling schools:', err);
      }
    };
    syncSiblingSchools();
  }, [siblings]);

  const activeSibling = selectedIdx !== null ? siblings[selectedIdx] : null;
  const schoolId = activeSibling?.schoolId;

  // School metadata query
  const schoolInfo = useLiveQuery(
    () => schoolId ? db.schools.get(schoolId) : null,
    [schoolId]
  );

  // Retrieve all schools to display names in sibling cards
  const allSchools = useLiveQuery(() => db.schools.toArray(), []);

  const getSchoolName = (schoolId) => {
    return allSchools?.find(s => s.id === schoolId || String(s.id) === String(schoolId))?.name || 'Labour Basic School';
  };

  const getSchoolLogo = (schoolId) => {
    return allSchools?.find(s => s.id === schoolId || String(s.id) === String(schoolId))?.logoUrl || '';
  };

  // Retrieve current academic classes scoped to active school
  const classes = useLiveQuery(
    () => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );
  
  // Reactive query for local announcements
  const announcements = useLiveQuery(
    () => schoolId ? db.announcements.where('schoolId').equals(schoolId).reverse().sortBy('created_at') : [],
    [schoolId]
  );

  // Sibling's average grade reactively from db.scores
  const gradeAverage = useLiveQuery(async () => {
    if (!activeSibling || !schoolInfo) return null;
    const year = schoolInfo.currentAcademicYear || '';
    const term = schoolInfo.currentTerm || 'Term 1';
    
    const termScores = await db.scores
      .filter(s =>
        (s.learnerId === activeSibling.id || s.learnerId === String(activeSibling.id) || (activeSibling.supabaseId && s.learnerId === activeSibling.supabaseId)) &&
        s.term === term &&
        s.academicYear === year
      )
      .toArray();
      
    if (!termScores || termScores.length === 0) return null;
    
    const validScores = termScores.filter(s => s.totalScore !== undefined && s.totalScore !== null && !isNaN(s.totalScore) && s.totalScore !== '');
    if (validScores.length === 0) return null;
    
    const sum = validScores.reduce((acc, s) => acc + Number(s.totalScore), 0);
    return (sum / validScores.length).toFixed(1);
  }, [activeSibling, schoolInfo]);

  // Comprehensive multi-school database background synchronizer
  useEffect(() => {
    const syncParentPortalData = async () => {
      if (!navigator.onLine || !parent?.phone_number || !schoolId || !activeSibling) return;
      try {
        console.log('[ParentDashboard] Syncing multi-school sibling data for school ID:', schoolId);

        // 1. Sync report_schools for the active sibling's school
        const { data: remoteSchool, error: schoolError } = await supabase
          .from('report_schools')
          .select('*')
          .eq('id', schoolId)
          .maybeSingle();

        if (remoteSchool && !schoolError) {
          await db.schools.put({
            id: schoolId,
            name: remoteSchool.name || '',
            location: remoteSchool.location || '',
            district: remoteSchool.district || '',
            region: remoteSchool.region || '',
            circuit: remoteSchool.circuit || '',
            motto: remoteSchool.motto || '',
            logoUrl: remoteSchool.logo_url || '',
            currentAcademicYear: remoteSchool.current_academic_year || '',
            currentTerm: remoteSchool.current_term || 'Term 1',
            vacationDate: remoteSchool.vacation_date || '',
            nextTermBegins: remoteSchool.next_term_begins || '',
            phone: remoteSchool.phone || '',
            email: remoteSchool.email || ''
          });
        }

        // 2. Sync report_settings for this school
        const { data: settingsData, error: settingsError } = await supabase
          .from('report_settings')
          .select('*')
          .eq('id', schoolId)
          .maybeSingle();

        if (settingsData && !settingsError) {
          await db.settings.put({
            id: schoolId,
            caWeight: settingsData.ca_weight,
            examWeight: settingsData.exam_weight,
            caModel: settingsData.ca_model,
            caBestNCount: settingsData.ca_best_n || '',
            caBreakdown: settingsData.ca_breakdown || [],
            gradingScale: settingsData.grading_scale || []
          });
        }

        // 3. Sync report_classes for this school
        const { data: remoteClasses, error: classErr } = await supabase
          .from('report_classes')
          .select('*')
          .eq('school_id', schoolId);

        if (remoteClasses && !classErr) {
          await db.classes.where('schoolId').equals(schoolId).delete();
          for (const rc of remoteClasses) {
            await db.classes.put({
              id: rc.id,
              schoolId: rc.school_id,
              name: rc.name,
              teachingMode: rc.teaching_mode,
              createdAt: rc.created_at
            });
          }
        }

        // 4. Sync report_subjects for this school
        const { data: remoteSubjects, error: subErr } = await supabase
          .from('report_subjects')
          .select('*')
          .eq('school_id', schoolId);

        if (remoteSubjects && !subErr) {
          for (const rs of remoteSubjects) {
            await db.subjects.put({
              id: rs.id,
              name: rs.name,
              createdAt: rs.created_at
            });
          }
        }

        // 5. Sync Class-Subject Mappings for this school
        const { data: classSubsData, error: classSubsErr } = await supabase
          .from('report_class_subjects')
          .select('*')
          .eq('school_id', schoolId);

        if (classSubsData && !classSubsErr) {
          await db.classSubjects.where('schoolId').equals(schoolId).delete();
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

        // 6. Sync report_summaries via secure RPC
        const { data: remoteSummaries, error: summaryErr } = await supabase
          .rpc('get_summaries_by_guardian_contact', { p_contact: parent.phone_number });

        if (remoteSummaries && !summaryErr) {
          for (const rs of remoteSummaries) {
            const existing = await db.reportSummaries
              .where('learnerId').equals(rs.learner_id)
              .filter(s => s.academicYear === rs.academic_year && s.term === rs.term)
              .first();

            const entry = {
              schoolId: rs.school_id,
              learnerId: rs.learner_id,
              classId: rs.class_id,
              academicYear: rs.academic_year,
              term: rs.term,
              attendancePresent: rs.attendance_present,
              attendanceTotal: rs.attendance_total,
              conduct: rs.conduct,
              attitude: rs.attitude,
              teacherRemark: rs.teacher_remark,
              headteacherRemark: rs.headteacher_remark,
              promotedTo: rs.promoted_to,
              nextTermBegins: rs.next_term_begins,
              feesOwed: rs.fees_owed,
              nextTermBill: rs.next_term_bill,
              isReleased: rs.is_released || false,
              synced: true,
              supabaseId: rs.id
            };

            if (existing) {
              await db.reportSummaries.update(existing.id, entry);
            } else {
              await db.reportSummaries.add(entry);
            }
          }
        }

        // 7. Sync report_scores via secure RPC
        const { data: remoteScores, error: scoresErr } = await supabase
          .rpc('get_scores_by_guardian_contact', { p_contact: parent.phone_number });

        if (remoteScores && !scoresErr) {
          for (const cs of remoteScores) {
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
              updatedAt: cs.updated_at
            };

            if (existing) {
              await db.scores.update(existing.id, entry);
            } else {
              await db.scores.add(entry);
            }
          }
        }

        // 8. Sync Announcements for this school
        const { data: annData, error: annErr } = await supabase
          .from('report_announcements')
          .select('*')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false });

        if (!annErr && annData) {
          await db.announcements.where('schoolId').equals(schoolId).delete();
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
        console.warn('Failed to run parent portal secure sync:', err);
      }
    };

    syncParentPortalData();
  }, [schoolId, activeSibling, parent?.phone_number]);

  // Sibling stats / academic reports
  const siblingSummary = useLiveQuery(async () => {
    if (!activeSibling || !schoolInfo) return null;
    const year = schoolInfo.currentAcademicYear || '';
    const term = schoolInfo.currentTerm || 'Term 1';
    
    return await db.reportSummaries
      .filter(s =>
        (s.learnerId === activeSibling.id || s.learnerId === String(activeSibling.id) || (activeSibling.supabaseId && s.learnerId === activeSibling.supabaseId)) &&
        s.academicYear === year &&
        s.term === term
      )
      .first();
  }, [activeSibling, schoolInfo]);

  const isReportReleased = siblingSummary && (siblingSummary.isReleased || siblingSummary.is_released);

  const attendanceRate = React.useMemo(() => {
    if (!siblingSummary?.attendanceTotal || siblingSummary.attendanceTotal <= 0) return '—';
    const present = Number(siblingSummary.attendancePresent || 0);
    const total = Number(siblingSummary.attendanceTotal || 0);
    return `${Math.round((present / total) * 100)}%`;
  }, [siblingSummary]);

  const handleLogout = () => {
    authService.clearParentSession();
    localStorage.removeItem('labour_edu_parent_siblings');
    navigate('/parent/login');
  };

  const getClassName = (classId) => {
    return classes?.find(c => c.id === classId || String(c.id) === String(classId))?.name || 'Grade';
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const parentName = siblings[0]?.guardianName || (parent?.phone_number ? `Parent (${parent.phone_number})` : 'Parent');

  // ── Communication Center State ────────────────────────────────
  const [notifOpen, setNotifOpen]   = useState(false);
  const [chatOpen, setChatOpen]     = useState(false);
  const [chatInput, setChatInput]   = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatBottomRef               = useRef(null);
  const notifPanelRef               = useRef(null);
  const prevMsgCountRef             = useRef(0);
  const [newReplyNotif, setNewReplyNotif] = useState(null);
  // Guard Set to prevent race conditions between syncComms and real-time listener
  const processingMsgIds            = useRef(new Set());
  const processingNotifIds          = useRef(new Set());

  // Live Dexie queries — messages
  const localMessages = useLiveQuery(
    () => {
      if (!schoolId || !parent?.phone_number) return Promise.resolve([]);
      const clean = (p) => (p || '').replace(/[\s\-\+\(\)]/g, '').slice(-9);
      return db.messages
        .where('schoolId').equals(schoolId)
        .filter(m => clean(m.parentPhone) === clean(parent.phone_number))
        .sortBy('created_at');
    },
    [schoolId, parent?.phone_number]
  );

  // Live Dexie queries — notifications
  const localNotifications = useLiveQuery(
    () => {
      if (!schoolId || !parent?.phone_number) return Promise.resolve([]);
      const clean = (p) => (p || '').replace(/[\s\-\+\(\)]/g, '').slice(-9);
      return db.notifications
        .where('schoolId').equals(schoolId)
        .filter(n => {
          if (!n.parentPhone) return true; // broadcast to all
          return clean(n.parentPhone) === clean(parent.phone_number);
        })
        .reverse().sortBy('created_at');
    },
    [schoolId, parent?.phone_number]
  );

  const unreadNotifCount = localNotifications?.filter(n => !n.isRead).length || 0;
  const unreadChatCount = localMessages?.filter(m => m.senderRole === 'head_teacher' && !m.isRead).length || 0;

  // Watch localMessages to trigger in-chat notifications
  useEffect(() => {
    if (!localMessages) return;
    if (localMessages.length > prevMsgCountRef.current) {
      const lastMsg = localMessages[localMessages.length - 1];
      if (chatOpen && lastMsg && lastMsg.senderRole === 'head_teacher') {
        setNewReplyNotif(lastMsg);
        const t = setTimeout(() => {
          setNewReplyNotif(null);
        }, 4000);
        return () => clearTimeout(t);
      }
    }
    prevMsgCountRef.current = localMessages.length;
  }, [localMessages, chatOpen]);

  // Clear toast banner when chat drawer closes
  useEffect(() => {
    if (!chatOpen) {
      setNewReplyNotif(null);
    }
  }, [chatOpen]);

  // Mark head teacher messages as read when chat is open
  useEffect(() => {
    const markAsRead = async () => {
      if (chatOpen && localMessages && localMessages.length > 0) {
        const unreadMsgs = localMessages.filter(m => m.senderRole === 'head_teacher' && !m.isRead);
        if (unreadMsgs.length > 0) {
          for (const msg of unreadMsgs) {
            await db.messages.update(msg.id, { isRead: true });
            if (navigator.onLine && msg.supabaseId) {
              try {
                await supabase
                  .from('report_messages')
                  .update({ is_read: true })
                  .eq('id', msg.supabaseId);
              } catch (e) {
                console.warn('Failed to mark read in Supabase:', e);
              }
            }
          }
        }
      }
    };
    markAsRead();
  }, [chatOpen, localMessages]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatOpen && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [localMessages, chatOpen]);

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync messages & notifications from Supabase
  // NOTE: chatOpen intentionally excluded from deps — we only sync once on mount,
  // then rely on real-time channels. Including chatOpen caused re-runs that
  // duplicated messages already written by the real-time listener.
  useEffect(() => {
    if (!schoolId || !parent?.phone_number) return;

    const syncComms = async () => {
      if (!navigator.onLine) return;
      try {
        // 1. Pull notifications
        const { data: remoteNotifs } = await supabase
          .rpc('get_notifications_by_guardian_contact', {
            p_contact: parent.phone_number,
            p_school_id: schoolId
          });
        if (remoteNotifs) {
          for (const n of remoteNotifs) {
            // Skip if real-time listener is already writing this record
            if (processingNotifIds.current.has(n.id)) continue;
            const existing = await db.notifications
              .filter(x => x.supabaseId === n.id).first();
            if (!existing) {
              await db.notifications.add({
                schoolId: n.school_id,
                parentPhone: n.parent_phone || null,
                title: n.title,
                content: n.content,
                created_at: n.created_at,
                isRead: false,
                supabaseId: n.id
              });
            }
          }
        }

        // 2. Pull messages
        const { data: remoteMsgs } = await supabase
          .rpc('get_messages_by_guardian_contact', {
            p_contact: parent.phone_number,
            p_school_id: schoolId
          });
        if (remoteMsgs) {
          for (const m of remoteMsgs) {
            // Skip if real-time listener is already writing this record
            if (processingMsgIds.current.has(m.id)) continue;
            const existing = await db.messages
              .filter(x => x.supabaseId === m.id).first();
            if (!existing) {
              // Resolve race condition: Check if there's an unsynced local optimistic copy
              const clean = (p) => (p || '').replace(/[\s\-\+\(\)]/g, '').slice(-9);
              const cleanPhoneVal = clean(m.parent_phone);
              const localMatch = await db.messages
                .filter(x => 
                  !x.supabaseId && 
                  x.senderRole === m.sender_role && 
                  clean(x.parentPhone) === cleanPhoneVal && 
                  x.content === m.content
                )
                .first();

              if (localMatch) {
                await db.messages.update(localMatch.id, {
                  supabaseId: m.id,
                  synced: true,
                  created_at: m.created_at
                });
              } else {
                await db.messages.add({
                  schoolId: m.school_id,
                  parentPhone: m.parent_phone,
                  senderRole: m.sender_role,
                  content: m.content,
                  created_at: m.created_at,
                  isRead: m.is_read,
                  supabaseId: m.id,
                  synced: true
                });
              }
            }
          }
        }

        // 3. Upload any locally-queued offline parent messages
        const unsynced = await db.messages
          .filter(m => !m.synced && m.senderRole === 'parent').toArray();
        for (const m of unsynced) {
          const { data, error } = await supabase
            .rpc('send_parent_message', {
              p_contact: m.parentPhone,
              p_school_id: m.schoolId,
              p_content: m.content
            });
          if (!error && data) {
            await db.messages.update(m.id, { synced: true, supabaseId: data });
          }
        }
      } catch (err) {
        console.warn('[ParentDashboard] Comms sync error:', err);
      }
    };

    syncComms();

    // 4. Real-time channels for incoming replies
    const messagesChannel = supabase
      .channel('parent-messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'report_messages', filter: `school_id=eq.${schoolId}` },
        async (payload) => {
          const record = payload.new;
          const clean = (p) => (p || '').replace(/[\s\-\+\(\)]/g, '').slice(-9);
          if (clean(record.parent_phone) === clean(parent.phone_number)) {
            // Mark in-flight so syncComms skips this record if it runs concurrently
            processingMsgIds.current.add(record.id);
            try {
              const existing = await db.messages.filter(x => x.supabaseId === record.id).first();
              if (!existing) {
                // Resolve race condition: Check if there's an unsynced local optimistic copy
                const cleanPhoneVal = clean(record.parent_phone);
                const localMatch = await db.messages
                  .filter(x => 
                    !x.supabaseId && 
                    x.senderRole === record.sender_role && 
                    clean(x.parentPhone) === cleanPhoneVal && 
                    x.content === record.content
                  )
                  .first();

                if (localMatch) {
                  await db.messages.update(localMatch.id, {
                    supabaseId: record.id,
                    synced: true,
                    created_at: record.created_at
                  });
                } else {
                  await db.messages.add({
                    schoolId: record.school_id,
                    parentPhone: record.parent_phone,
                    senderRole: record.sender_role,
                    content: record.content,
                    created_at: record.created_at,
                    isRead: record.is_read,
                    supabaseId: record.id,
                    synced: true
                  });
                }
              }
            } finally {
              // Keep the ID in the set permanently so syncComms never re-inserts
              // (the set is small — only grows within this session)
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'report_messages', filter: `school_id=eq.${schoolId}` },
        async (payload) => {
          const record = payload.new;
          const clean = (p) => (p || '').replace(/[\s\-\+\(\)]/g, '').slice(-9);
          if (clean(record.parent_phone) === clean(parent.phone_number)) {
            const existing = await db.messages.filter(x => x.supabaseId === record.id).first();
            if (existing) {
              await db.messages.update(existing.id, { isRead: record.is_read });
            }
          }
        }
      )
      .subscribe();

    const notificationsChannel = supabase
      .channel('parent-notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'report_notifications', filter: `school_id=eq.${schoolId}` },
        async (payload) => {
          const record = payload.new;
          const clean = (p) => (p || '').replace(/[\s\-\+\(\)]/g, '').slice(-9);
          if (!record.parent_phone || clean(record.parent_phone) === clean(parent.phone_number)) {
            processingNotifIds.current.add(record.id);
            const existing = await db.notifications.filter(x => x.supabaseId === record.id).first();
            if (!existing) {
              await db.notifications.add({
                schoolId: record.school_id,
                parentPhone: record.parent_phone || null,
                title: record.title,
                content: record.content,
                created_at: record.created_at,
                isRead: false,
                supabaseId: record.id
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(notificationsChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, parent?.phone_number]);

  const handleSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !schoolId || !parent?.phone_number) return;
    setSendingMsg(true);
    const now = new Date().toISOString();
    const localId = await db.messages.add({
      schoolId,
      parentPhone: parent.phone_number,
      senderRole: 'parent',
      content: text,
      created_at: now,
      isRead: false,
      synced: false
    });
    setChatInput('');
    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .rpc('send_parent_message', {
            p_contact: parent.phone_number,
            p_school_id: schoolId,
            p_content: text
          });
        if (!error && data) {
          await db.messages.update(localId, { synced: true, supabaseId: data });
        }
      } catch (e) { console.warn('send msg err', e); }
    }
    setSendingMsg(false);
  };

  const handleMarkAllNotifsRead = async () => {
    const unread = localNotifications?.filter(n => !n.isRead) || [];
    for (const n of unread) {
      await db.notifications.update(n.id, { isRead: true });
    }
  };

  return (
    <div className="parent-dashboard-container">
      <style>{`
        .parent-dashboard-container {
          min-height: 100vh;
          background: #f8fafc;
          font-family: 'Outfit', 'Inter', system-ui, sans-serif;
          color: #0f172a;
          padding-bottom: 4rem;
        }

        .dashboard-header {
          background: #0f172a;
          color: #fff;
          padding: 1.15rem 1.5rem;
          position: sticky;
          top: 0;
          z-index: 100;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .header-content {
          max-width: 1360px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1.5rem;
        }

        .welcome-title {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .welcome-title h2 {
          font-size: 1.25rem;
          font-weight: 800;
          margin: 0;
          background: linear-gradient(135deg, #fff 50%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.01em;
        }

        .welcome-title p {
          color: #94a3b8;
          font-size: 0.8rem;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }

        .header-school-logo {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          object-fit: cover;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: #fff;
          display: inline-block;
        }

        .btn-logout {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #fff;
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .btn-logout:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.3);
          color: #fca5a5;
        }

        /* ── Header Right Actions ── */
        .header-right-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          position: relative;
        }

        /* ── Notification Bell ── */
        .btn-notif-bell {
          position: relative;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.95rem;
          flex-shrink: 0;
        }
        .btn-notif-bell:hover {
          background: rgba(13,148,136,0.2);
          border-color: rgba(13,148,136,0.4);
          color: #2dd4bf;
        }
        .btn-notif-bell.has-unread {
          border-color: rgba(239,68,68,0.5);
          color: #fca5a5;
          animation: bell-glow 2s infinite;
        }
        @keyframes bell-glow {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0.15); }
        }
        .notif-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background: #ef4444;
          color: #fff;
          font-size: 0.55rem;
          font-weight: 800;
          min-width: 16px;
          height: 16px;
          border-radius: 99px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 3px;
          border: 2px solid #0f172a;
          animation: pulse-badge 1.8s infinite;
        }
        @keyframes pulse-badge {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.2); }
        }

        /* ── Notification Dropdown ── */
        .notif-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: 360px;
          max-width: calc(100vw - 2rem);
          background: rgba(10,18,36,0.98);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          box-shadow: 0 28px 70px rgba(0,0,0,0.5);
          z-index: 200;
          overflow: hidden;
          animation: dropIn 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes dropIn {
          from { opacity:0; transform:translateY(-8px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .notif-drop-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .notif-drop-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .notif-drop-title i { color: #0d9488; }
        .btn-mark-read {
          font-size: 0.7rem;
          color: #64748b;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
          transition: color 0.2s;
          padding: 0;
        }
        .btn-mark-read:hover { color: #2dd4bf; }
        .notif-list {
          max-height: 380px;
          overflow-y: auto;
          padding: 0.35rem 0;
        }
        .notif-list::-webkit-scrollbar { width: 3px; }
        .notif-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .notif-item {
          padding: 0.8rem 1.25rem;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          cursor: pointer;
          transition: background 0.15s;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item:hover { background: rgba(255,255,255,0.03); }
        .notif-item.unread { background: rgba(13,148,136,0.06); }
        .notif-type-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.82rem;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .notif-icon-broadcast { background: rgba(13,148,136,0.15); color: #2dd4bf; }
        .notif-icon-direct    { background: rgba(59,130,246,0.15);  color: #60a5fa; }
        .notif-text-block { flex: 1; min-width: 0; }
        .notif-item-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: #f1f5f9;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .notif-item-body {
          font-size: 0.75rem;
          color: #64748b;
          line-height: 1.45;
          word-wrap: break-word;
          white-space: pre-wrap;
        }
        .notif-item-time {
          font-size: 0.65rem;
          color: #334155;
          margin-top: 4px;
          font-weight: 600;
        }
        .notif-unread-dot {
          width: 7px;
          height: 7px;
          background: #0d9488;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 6px;
        }
        .notif-empty {
          padding: 2.5rem 1.25rem;
          text-align: center;
          color: #334155;
        }
        .notif-empty i { font-size: 2rem; display: block; margin-bottom: 0.5rem; }
        .notif-empty p { font-size: 0.82rem; margin: 0; }

        /* ── Chat Overlay & Drawer ── */
        .chat-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 300;
          animation: fadeInOv 0.25s ease;
        }
        @keyframes fadeInOv {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .chat-drawer {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: 420px;
          max-width: 100vw;
          background: linear-gradient(180deg, #0c1628 0%, #080f1d 100%);
          border-left: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          z-index: 301;
          animation: drawerSlideIn 0.3s cubic-bezier(0.16,1,0.3,1);
          box-shadow: -24px 0 60px rgba(0,0,0,0.5);
        }
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .chat-drawer-header {
          padding: 1.2rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
          background: rgba(255,255,255,0.02);
        }
        .chat-drawer-avatar {
          width: 44px;
          height: 44px;
          border-radius: 13px;
          background: rgba(13,148,136,0.15);
          border: 1px solid rgba(13,148,136,0.3);
          color: #2dd4bf;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          flex-shrink: 0;
        }
        .chat-drawer-info { flex: 1; min-width: 0; }
        .chat-drawer-name {
          font-size: 0.95rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .chat-drawer-sub {
          font-size: 0.72rem;
          color: #475569;
          margin: 2px 0 0;
          font-weight: 500;
        }
        .btn-close-drawer {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          color: #64748b;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.85rem;
          flex-shrink: 0;
        }
        .btn-close-drawer:hover {
          background: rgba(239,68,68,0.15);
          border-color: rgba(239,68,68,0.3);
          color: #fca5a5;
        }

        /* Chat message area */
        .chat-messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }
        .chat-messages-area::-webkit-scrollbar { width: 4px; }
        .chat-messages-area::-webkit-scrollbar-track { background: transparent; }
        .chat-messages-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .chat-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.85rem;
          color: #1e293b;
          text-align: center;
          padding: 2rem;
        }
        .chat-empty i { font-size: 2.8rem; }
        .chat-empty p { font-size: 0.85rem; line-height: 1.55; margin: 0; color: #334155; }

        /* Message bubbles */
        .msg-row {
          display: flex;
          flex-direction: column;
          max-width: 82%;
        }
        .msg-row.from-parent { align-self: flex-end; align-items: flex-end; }
        .msg-row.from-school  { align-self: flex-start; align-items: flex-start; }
        .msg-bubble {
          padding: 0.72rem 1rem;
          border-radius: 18px;
          font-size: 0.88rem;
          line-height: 1.5;
          word-break: break-word;
        }
        .msg-row.from-parent .msg-bubble {
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          color: #fff;
          border-bottom-right-radius: 5px;
          box-shadow: 0 4px 18px rgba(13,148,136,0.32);
        }
        .msg-row.from-school .msg-bubble {
          background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
          color: #e2e8f0;
          border-bottom-left-radius: 5px;
          border: 1px solid rgba(255,255,255,0.07);
        }
        .msg-meta {
          font-size: 0.64rem;
          color: #334155;
          margin-top: 3px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .msg-pending { color: #f59e0b; }

        /* Chat input */
        .chat-input-area {
          padding: 1rem 1.5rem 1.35rem;
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .chat-input-row {
          display: flex;
          gap: 0.65rem;
          align-items: flex-end;
        }
        .chat-textarea {
          flex: 1;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 14px;
          padding: 0.75rem 1rem;
          color: #f1f5f9;
          font-family: inherit;
          font-size: 0.88rem;
          resize: none;
          outline: none;
          min-height: 46px;
          max-height: 120px;
          transition: border-color 0.2s;
          line-height: 1.45;
        }
        .chat-textarea::placeholder { color: #334155; }
        .chat-textarea:focus { border-color: rgba(13,148,136,0.45); }
        .btn-send-msg {
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          border: none;
          color: #fff;
          width: 44px;
          height: 44px;
          border-radius: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.22s;
          box-shadow: 0 4px 16px rgba(13,148,136,0.32);
          flex-shrink: 0;
        }
        .btn-send-msg:hover:not(:disabled) {
          transform: scale(1.06);
          box-shadow: 0 6px 22px rgba(13,148,136,0.48);
        }
        .btn-send-msg:disabled { opacity: 0.45; cursor: not-allowed; }

        .chat-toast-banner {
          background: rgba(13, 148, 136, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
          padding: 0.65rem 1rem;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          animation: toastSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 10;
          flex-shrink: 0;
        }
        @keyframes toastSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .chat-toast-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.18);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          flex-shrink: 0;
        }
        .chat-toast-text {
          flex: 1;
          min-width: 0;
          text-align: left;
        }
        .chat-toast-title {
          font-size: 0.78rem;
          font-weight: 800;
          color: #fff;
        }
        .chat-toast-body {
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.85);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }
        .btn-close-toast {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          font-size: 0.75rem;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }
        .btn-close-toast:hover {
          color: #fff;
        }

        .dashboard-body {
          max-width: 1360px;
          margin: 2rem auto 0;
          padding: 0 1.5rem;
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
        }

        @media (min-width: 992px) {
          .dashboard-body {
            grid-template-columns: 360px 1fr;
            gap: 2.25rem;
            margin-top: 2.5rem;
          }
          .selector-landing-container {
            margin-top: 2.5rem !important;
          }
        }

        @media (min-width: 1200px) {
          .dashboard-body {
            grid-template-columns: 400px 1fr;
            gap: 2.5rem;
            margin-top: 3rem;
          }
          .selector-landing-container {
            margin-top: 3rem !important;
          }
        }

        /* Learner Selection Landing Styles */
        .selector-landing-container {
          max-width: 1360px;
          margin: 2rem auto 0;
          padding: 0 1.5rem;
          position: relative;
          z-index: 10;
        }

        .selector-landing-card {
          background: transparent;
          border-radius: 0;
          padding: 1.5rem 0;
          box-shadow: none;
          border: none;
          text-align: center;
        }

        .landing-title {
          font-size: 2.15rem;
          font-weight: 900;
          background: linear-gradient(135deg, #0f172a 40%, #0d9488 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0 0 0.5rem;
          letter-spacing: -0.03em;
        }

        .landing-subtitle {
          font-size: 0.95rem;
          color: #475569;
          max-width: 540px;
          margin: 0 auto 3rem;
          line-height: 1.65;
          font-weight: 500;
        }

        .sibling-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 2.5rem;
          justify-content: center;
          margin-top: 1rem;
        }
        
        @media (min-width: 992px) {
          .sibling-grid {
            grid-template-columns: repeat(auto-fit, minmax(280px, 320px));
          }
        }

        .sibling-card {
          background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 1.75rem 1.5rem;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          text-align: left;
          position: relative;
          box-shadow: 0 12px 30px -10px rgba(15, 23, 42, 0.25);
          overflow: hidden;
        }

        .sibling-card::before {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.03) 0%, transparent 70%);
          transform: translate(30%, -30%);
          transition: all 0.4s ease;
          pointer-events: none;
          z-index: 1;
        }

        .sibling-card.card-female:hover {
          transform: translateY(-8px) scale(1.02);
          border-color: rgba(236, 72, 153, 0.5);
          box-shadow: 0 20px 40px -10px rgba(236, 72, 153, 0.3), 0 0 20px rgba(236, 72, 153, 0.15);
        }

        .sibling-card.card-male:hover {
          transform: translateY(-8px) scale(1.02);
          border-color: rgba(59, 130, 246, 0.5);
          box-shadow: 0 20px 40px -10px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.15);
        }

        .sibling-card:hover {
          transform: translateY(-8px) scale(1.02);
          border-color: rgba(13, 148, 136, 0.5);
          box-shadow: 0 20px 40px -10px rgba(13, 148, 136, 0.3), 0 0 20px rgba(13, 148, 136, 0.15);
        }

        .sib-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          position: relative;
          z-index: 2;
        }

        .sib-avatar-wrapper {
          position: relative;
          z-index: 2;
        }

        .sib-avatar {
          width: 64px;
          height: 64px;
          border-radius: 18px;
          object-fit: cover;
          border: 3px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .sibling-card:hover .sib-avatar {
          border-color: rgba(255, 255, 255, 0.3);
          transform: scale(1.08) rotate(2deg);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
        }

        .sib-avatar-ph {
          width: 64px;
          height: 64px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
          border: 3px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .sibling-card:hover .sib-avatar-ph {
          border-color: rgba(255, 255, 255, 0.3);
          transform: scale(1.08) rotate(2deg);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
        }

        .sib-badge {
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          font-size: 0.62rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 0.3rem 0.65rem;
          border-radius: 99px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          transition: all 0.3s ease;
        }

        .sibling-card.card-female:hover .sib-badge {
          background: rgba(236, 72, 153, 0.15);
          color: #f472b6;
          border-color: rgba(236, 72, 153, 0.3);
        }

        .sibling-card.card-male:hover .sib-badge {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border-color: rgba(59, 130, 246, 0.3);
        }

        .sib-card-body {
          flex: 1;
          margin-bottom: 1.25rem;
          position: relative;
          z-index: 2;
        }

        .sib-fullname {
          font-size: 1.25rem;
          font-weight: 800;
          color: #ffffff;
          margin: 0.5rem 0 1rem;
          letter-spacing: -0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sib-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.04);
          padding: 0.55rem 0.85rem;
          border-radius: 12px;
          margin-bottom: 0.5rem;
          transition: all 0.3s ease;
        }

        .sibling-card:hover .sib-meta-row {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.08);
        }

        .sib-meta-lbl {
          color: #94a3b8;
          font-weight: 600;
        }

        .sib-meta-val {
          color: #f1f5f9;
          font-weight: 700;
        }

        .sib-school-info {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.8rem;
          color: #cbd5e1;
          font-weight: 600;
          margin-top: 1.15rem;
          background: rgba(255, 255, 255, 0.04);
          padding: 0.55rem 0.85rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
        }

        .sibling-card:hover .sib-school-info {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
          color: #fff;
        }

        .sib-school-logo {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          object-fit: cover;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        .sib-school-logo-ph {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .sib-card-footer {
          margin-top: auto;
          position: relative;
          z-index: 2;
        }

        .btn-sib-enter {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.75rem;
          border-radius: 14px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .sibling-card.card-female:hover .btn-sib-enter {
          background: linear-gradient(135deg, #ec4899 0%, #be185d 100%);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 8px 20px rgba(236, 72, 153, 0.3);
        }

        .sibling-card.card-male:hover .btn-sib-enter {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: #fff;
          border-color: transparent;
          box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
        }

        .btn-sib-enter i {
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .sibling-card:hover .btn-sib-enter i {
          transform: translateX(6px);
        }

        /* Dashboard navigation switch back button */
        .btn-back-selection {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #fff;
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 1.25rem;
        }

        .btn-back-selection:hover {
          background: rgba(13, 148, 136, 0.2);
          border-color: rgba(13, 148, 136, 0.3);
          color: #2dd4bf;
        }

        /* Sub-grid system in right column */
        .dashboard-sub-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
          margin-top: 1.5rem;
        }

        @media (min-width: 1200px) {
          .dashboard-sub-grid {
            grid-template-columns: 1fr 1.25fr;
            gap: 2.25rem;
            align-items: start;
          }
          
          .portals-sub-column .section-title {
            margin-top: 0;
          }
        }


        /* Sibling selector row */
        .sibling-selector-card {
          background: #fff;
          border-radius: 20px;
          padding: 1.25rem;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
          border: 1px solid #e2e8f0;
          margin-bottom: 1.5rem;
        }

        .selector-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.75rem;
        }

        .sibling-pills {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding-bottom: 0.25rem;
        }

        .sibling-pill {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.6rem 1.1rem;
          border-radius: 12px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #475569;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .sibling-pill:hover {
          background: #e2e8f0;
        }

        .sibling-pill.active {
          background: #0d9488;
          border-color: #0d9488;
          color: #fff;
          box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
        }

        /* Virtual Student ID Card */
        .id-card {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          border-radius: 24px;
          padding: 1.75rem;
          color: #fff;
          position: relative;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 1.5rem;
        }

        .id-card::before {
          content: '';
          position: absolute;
          width: 250px;
          height: 250px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(13, 148, 136, 0.15) 0%, transparent 70%);
          top: -100px;
          right: -80px;
          pointer-events: none;
        }

        .id-card::after {
          content: '';
          position: absolute;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
          bottom: -50px;
          left: -40px;
          pointer-events: none;
        }

        .id-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 1rem;
          margin-bottom: 1.25rem;
        }

        .school-badge-info h3 {
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          margin: 0 0 0.15rem;
          text-transform: uppercase;
          background: linear-gradient(135deg, #fff 60%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .school-badge-info span {
          font-size: 0.68rem;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .id-chip {
          background: rgba(13, 148, 136, 0.2);
          border: 1px solid rgba(13, 148, 136, 0.3);
          color: #2dd4bf;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
        }

        .id-body {
          display: flex;
          gap: 1.25rem;
          align-items: center;
        }

        .id-photo-frame {
          width: 90px;
          height: 90px;
          border-radius: 18px;
          border: 2px solid rgba(255, 255, 255, 0.15);
          object-fit: cover;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
          background: rgba(255, 255, 255, 0.05);
        }

        .id-photo-placeholder {
          width: 90px;
          height: 90px;
          border-radius: 18px;
          border: 2px solid rgba(255, 255, 255, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.2rem;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
        }

        .id-details {
          flex: 1;
          min-width: 0;
        }

        .id-name {
          font-size: 1.2rem;
          font-weight: 800;
          margin: 0 0 0.35rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .id-row {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 0.5rem;
        }

        .id-lbl {
          font-size: 0.62rem;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }

        .id-val {
          font-size: 0.85rem;
          color: #e2e8f0;
          font-weight: 600;
        }

        .id-footer {
          margin-top: 1rem;
          padding-top: 0.85rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          justify-content: space-between;
          font-size: 0.72rem;
          color: #94a3b8;
        }

        /* Section Header Titles */
        .section-title {
          font-size: 0.78rem;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 0.75rem 0 0.25rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e2e8f0;
        }

        /* Metrics grid */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 1.25rem;
          margin-bottom: 0.5rem;
        }

        .metric-card {
          background: #fff;
          border-radius: 20px;
          padding: 1.5rem;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.02);
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
        }

        .metric-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.05);
        }

        .metric-icon {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.35rem;
          flex-shrink: 0;
        }

        .metric-grade .metric-icon {
          background: rgba(13, 148, 136, 0.1);
          color: #0d9488;
        }

        .metric-balance .metric-icon {
          background: rgba(239, 68, 68, 0.08);
          color: #ef4444;
        }

        .metric-attendance .metric-icon {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .metric-details {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .metric-lbl {
          font-size: 0.72rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .metric-val {
          font-size: 1.4rem;
          font-weight: 900;
          color: #0f172a;
          margin: 0.15rem 0;
          letter-spacing: -0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .metric-sub {
          font-size: 0.72rem;
          color: #94a3b8;
          font-weight: 600;
        }

        /* Quick actions grid */
        .quick-actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.25rem;
        }

        .qa-grid-btn {
          background: #fff;
          border-radius: 24px;
          padding: 1.75rem;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: left;
          gap: 1.5rem;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.02);
          width: 100%;
          font-family: inherit;
        }

        .qa-btn-report {
          background: linear-gradient(135deg, rgba(13, 148, 136, 0.04) 0%, rgba(13, 148, 136, 0.01) 100%);
          border-color: rgba(13, 148, 136, 0.15);
        }

        .qa-btn-report:hover {
          transform: translateY(-4px);
          background: #0d9488;
          border-color: #0d9488;
          box-shadow: 0 12px 30px rgba(13, 148, 136, 0.2);
        }

        .qa-btn-fees {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, rgba(59, 130, 246, 0.01) 100%);
          border-color: rgba(59, 130, 246, 0.15);
        }

        .qa-btn-fees:hover {
          transform: translateY(-4px);
          background: #3b82f6;
          border-color: #3b82f6;
          box-shadow: 0 12px 30px rgba(59, 130, 246, 0.2);
        }

        .qa-btn-main {
          display: flex;
          align-items: flex-start;
          gap: 1.1rem;
        }

        .qa-btn-icon {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.3rem;
          flex-shrink: 0;
          transition: all 0.2s;
        }

        .qa-btn-report .qa-btn-icon {
          background: rgba(13, 148, 136, 0.1);
          color: #0d9488;
        }

        .qa-btn-report:hover .qa-btn-icon {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .qa-btn-fees .qa-btn-icon {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .qa-btn-fees:hover .qa-btn-icon {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .qa-btn-text {
          flex: 1;
        }

        .qa-btn-title {
          font-weight: 850;
          font-size: 1.05rem;
          color: #0f172a;
          transition: color 0.2s;
        }

        .qa-grid-btn:hover .qa-btn-title {
          color: #fff;
        }

        .qa-btn-desc {
          font-size: 0.8rem;
          color: #64748b;
          line-height: 1.45;
          margin-top: 0.35rem;
          font-weight: 500;
          transition: color 0.2s;
        }

        .qa-grid-btn:hover .qa-btn-desc {
          color: rgba(255, 255, 255, 0.85);
        }

        .qa-btn-action-indicator {
          align-self: flex-end;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .qa-btn-report .qa-btn-action-indicator {
          color: #0d9488;
        }

        .qa-btn-fees .qa-btn-action-indicator {
          color: #3b82f6;
        }

        .qa-grid-btn:hover .qa-btn-action-indicator {
          color: #fff;
          transform: translateX(4px);
        }

        /* Principal Card */
        .contact-card {
          background: #fff;
          border-radius: 20px;
          padding: 1.25rem;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
          border: 1px solid #e2e8f0;
        }

        .contact-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .contact-avatar {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(13, 148, 136, 0.1);
          color: #0d9488;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
        }

        .contact-title {
          font-size: 0.85rem;
          font-weight: 700;
          color: #1e293b;
        }

        .contact-detail-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 0.6rem;
          font-size: 0.8rem;
          color: #475569;
        }

        .contact-detail-row i {
          color: #94a3b8;
          width: 14px;
        }

        /* Announcement feed */
        .feed-panel {
          background: #fff;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
          border: 1px solid #e2e8f0;
          height: fit-content;
        }

        .feed-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          border-bottom: 2.5px solid #f1f5f9;
          padding-bottom: 0.85rem;
        }

        .feed-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .feed-title i {
          color: #0d9488;
        }

        .feed-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 700;
        }

        .feed-status-online {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }

        .feed-status-offline {
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
        }

        .feed-items {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .announcement-item {
          padding-left: 1.25rem;
          position: relative;
          animation: slideUp 0.4s ease;
        }

        .announcement-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 4px;
          bottom: 4px;
          width: 3px;
          background: #0d9488;
          border-radius: 4px;
        }

        .announcement-date {
          font-size: 0.72rem;
          font-weight: 700;
          color: #94a3b8;
          margin-bottom: 0.35rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .announcement-headline {
          font-size: 0.98rem;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 0.5rem;
        }

        .announcement-body {
          font-size: 0.88rem;
          color: #475569;
          line-height: 1.5;
          margin: 0;
          white-space: pre-wrap;
        }

        .empty-feed {
          text-align: center;
          padding: 3rem 1.5rem;
          color: #94a3b8;
        }

        .empty-feed i {
          font-size: 2.5rem;
          color: #e2e8f0;
          margin-bottom: 1rem;
        }

        .empty-feed p {
          font-size: 0.9rem;
          margin: 0;
        }

        /* Term Countdown widget */
        .countdown-widget {
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          border-radius: 20px;
          padding: 1.25rem;
          color: #fff;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 8px 20px rgba(13, 148, 136, 0.15);
        }

        .countdown-info h4 {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.8;
          margin: 0 0 0.15rem;
        }

        .countdown-info span {
          font-size: 1.05rem;
          font-weight: 800;
        }

        .countdown-badge {
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(4px);
          padding: 0.35rem 0.75rem;
          border-radius: 10px;
          font-size: 0.78rem;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* ── Glassmorphic Modal & Change Password Styling ── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 400;
          animation: fadeInOv 0.25s ease;
        }

        .settings-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 440px;
          max-width: 90vw;
          background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
          z-index: 401;
          overflow: hidden;
          animation: dropIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
        }

        .modal-header h3 {
          font-size: 1.05rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .modal-header h3 i {
          color: #2dd4bf;
        }

        .btn-close-modal {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #94a3b8;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.8rem;
        }

        .btn-close-modal:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
          color: #fca5a5;
        }

        .modal-body-content {
          padding: 1.5rem;
        }

        .pwd-error-banner {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          font-size: 0.8rem;
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: shake 0.4s ease;
        }

        .pwd-success-banner {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #a7f3d0;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          font-size: 0.8rem;
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: fadeIn 0.4s ease;
        }

        .modal-form-group {
          margin-bottom: 1.25rem;
        }

        .modal-form-label {
          display: block;
          font-size: 0.72rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        .modal-input-wrapper {
          position: relative;
        }

        .modal-input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #475569;
          font-size: 0.95rem;
          transition: color 0.2s;
        }

        .modal-input {
          width: 100%;
          padding: 0.8rem 1rem 0.8rem 2.5rem;
          background: rgba(15, 23, 42, 0.6);
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #fff;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
        }

        .modal-input:focus {
          border-color: #0d9488;
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
          background: rgba(15, 23, 42, 0.8);
        }

        .modal-input:focus + .modal-input-icon {
          color: #2dd4bf;
        }

        .btn-modal-submit {
          width: 100%;
          padding: 0.85rem;
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(13, 148, 136, 0.25);
          margin-top: 1.5rem;
        }

        .btn-modal-submit:hover:not(:disabled) {
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(13, 148, 136, 0.35);
        }

        .btn-modal-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
      `}</style>

      {/* ── Change Password Modal ── */}
      {changePwdOpen && (
        <>
          <div className="modal-overlay" onClick={() => { if(!pwdLoading) setChangePwdOpen(false); }} />
          <div className="settings-modal">
            <div className="modal-header">
              <h3><i className="fas fa-shield-alt"></i> Change Password</h3>
              <button className="btn-close-modal" onClick={() => setChangePwdOpen(false)} disabled={pwdLoading}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-body-content">
              {pwdError && (
                <div className="pwd-error-banner">
                  <i className="fas fa-exclamation-circle"></i>
                  <span>{pwdError}</span>
                </div>
              )}
              
              {pwdSuccess && (
                <div className="pwd-success-banner">
                  <i className="fas fa-check-circle"></i>
                  <span>{pwdSuccess}</span>
                </div>
              )}

              {!pwdSuccess ? (
                <form onSubmit={handleChangePassword}>
                  <div className="modal-form-group">
                    <label className="modal-form-label">Current Password</label>
                    <div className="modal-input-wrapper">
                      <input
                        type="password"
                        className="modal-input"
                        placeholder="Enter current password"
                        value={pwdCurrent}
                        onChange={(e) => setPwdCurrent(e.target.value)}
                        required
                        disabled={pwdLoading}
                      />
                      <i className="fas fa-lock modal-input-icon"></i>
                    </div>
                  </div>

                  <div className="modal-form-group">
                    <label className="modal-form-label">New Password</label>
                    <div className="modal-input-wrapper">
                      <input
                        type="password"
                        className="modal-input"
                        placeholder="At least 6 characters"
                        value={pwdNew}
                        onChange={(e) => setPwdNew(e.target.value)}
                        required
                        minLength={6}
                        disabled={pwdLoading}
                      />
                      <i className="fas fa-key modal-input-icon"></i>
                    </div>
                  </div>

                  <div className="modal-form-group">
                    <label className="modal-form-label">Confirm New Password</label>
                    <div className="modal-input-wrapper">
                      <input
                        type="password"
                        className="modal-input"
                        placeholder="Repeat new password"
                        value={pwdConfirm}
                        onChange={(e) => setPwdConfirm(e.target.value)}
                        required
                        minLength={6}
                        disabled={pwdLoading}
                      />
                      <i className="fas fa-key modal-input-icon"></i>
                    </div>
                  </div>

                  <button type="submit" className="btn-modal-submit" disabled={pwdLoading}>
                    {pwdLoading ? (
                      <><i className="fas fa-spinner fa-spin"></i> Updating...</>
                    ) : (
                      <><i className="fas fa-save"></i> Update Password</>
                    )}
                  </button>
                </form>
              ) : (
                <div className="modal-success-state" style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                    Your password has been changed successfully. You can now use your new password for future logins.
                  </p>
                  <button className="btn-modal-submit" onClick={() => { setChangePwdOpen(false); setPwdSuccess(''); }}>
                    Got it, thanks!
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Report Card Pending Release Explanation Modal ── */}
      {releaseModalOpen && (
        <>
          <div className="modal-overlay" onClick={() => setReleaseModalOpen(false)} />
          <div className="settings-modal" style={{ maxWidth: '460px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', background: 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem' }}>
                  <i className="fas fa-lock"></i>
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', margin: 0 }}>Report Card Pending</h3>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500 }}>Academic Record Status</span>
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setReleaseModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-body-content" style={{ paddingTop: '0.5rem', textAlign: 'center' }}>
              <p style={{ color: '#cbd5e1', fontSize: '0.88rem', lineHeight: '1.6', margin: '0 0 1.5rem', textAlign: 'left' }}>
                Your child's terminal report card for **{schoolInfo?.currentTerm || 'Term 1'} ({schoolInfo?.currentAcademicYear || 'Current Year'})** is currently being compiled.
              </p>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '1.15rem', textAlign: 'left', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem' }}>
                  <i className="fas fa-check-circle" style={{ color: '#10b981', marginTop: '2px' }}></i>
                  <div>
                    <strong style={{ color: '#fff' }}>Teacher Compiling:</strong>
                    <p style={{ color: '#94a3b8', margin: '2px 0 0' }}>Subject scores and advisor remarks are being entered.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem' }}>
                  <i className="fas fa-clock" style={{ color: '#f59e0b', marginTop: '2px' }}></i>
                  <div>
                    <strong style={{ color: '#fff' }}>Headteacher Review:</strong>
                    <p style={{ color: '#94a3b8', margin: '2px 0 0' }}>The School Administration must review and officially endorse all report cards before release.</p>
                  </div>
                </div>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.78rem', fontStyle: 'italic', margin: '0 0 1.5rem', textAlign: 'left' }}>
                *Note: You will receive an alert announcement and the dashboard will unlock as soon as the Headteacher publishes the results.*
              </p>
              <button className="btn-modal-submit" onClick={() => setReleaseModalOpen(false)}>
                Understood, Thank You
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Glassmorphic Chat Drawer ── */}
      {chatOpen && (
        <>
          <div className="chat-overlay" onClick={() => setChatOpen(false)} />
          <div className="chat-drawer">
            <div className="chat-drawer-header">
              <div className="chat-drawer-avatar">
                <i className="fas fa-user-tie"></i>
              </div>
              <div className="chat-drawer-info">
                <p className="chat-drawer-name">Head Teacher</p>
                <p className="chat-drawer-sub">{schoolInfo?.name || 'School Administration'}</p>
              </div>
              <button className="btn-close-drawer" onClick={() => setChatOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            {newReplyNotif && (
              <div className="chat-toast-banner" onClick={() => setNewReplyNotif(null)}>
                <div className="chat-toast-icon">
                  <i className="fas fa-comment-dots"></i>
                </div>
                <div className="chat-toast-text">
                  <div className="chat-toast-title">New Reply from Head Teacher</div>
                  <div className="chat-toast-body">{newReplyNotif.content}</div>
                </div>
                <button className="btn-close-toast" onClick={(e) => { e.stopPropagation(); setNewReplyNotif(null); }}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}

            <div className="chat-messages-area">
              {(!localMessages || localMessages.length === 0) ? (
                <div className="chat-empty">
                  <i className="fas fa-comments"></i>
                  <p>No messages yet.<br />Send a message to start a conversation with the Head Teacher.</p>
                </div>
              ) : (
                localMessages.map((m) => (
                  <div key={m.id} className={`msg-row ${m.senderRole === 'parent' ? 'from-parent' : 'from-school'}`}>
                    <div className="msg-bubble">{m.content}</div>
                    <div className="msg-meta">
                      {formatTime(m.created_at)}
                      {m.senderRole === 'parent' && !m.synced && (
                        <i className="fas fa-clock msg-pending" title="Sending…"></i>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <div className="chat-input-area">
              <div className="chat-input-row">
                <textarea
                  className="chat-textarea"
                  rows={1}
                  placeholder="Type a message…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  className="btn-send-msg"
                  onClick={handleSendMessage}
                  disabled={sendingMsg || !chatInput.trim()}
                >
                  <i className="fas fa-paper-plane"></i>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Sticky Header ── */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="welcome-title" onClick={() => setSelectedIdx(null)} style={{ cursor: 'pointer' }} title="Go to Student Selection">
            <h2>Hello, {activeSibling ? activeSibling.guardianName : parentName}</h2>
            <p>
              {activeSibling ? (
                <>
                  {schoolInfo?.logoUrl ? (
                    <img src={schoolInfo.logoUrl} alt="School Logo" className="header-school-logo" />
                  ) : (
                    <i className="fas fa-school" style={{ color: '#2dd4bf' }}></i>
                  )}
                  {schoolInfo?.name || 'Labour Basic School'} Portal
                </>
              ) : (
                <>
                  <i className="fas fa-users" style={{ color: '#2dd4bf' }}></i>
                  Registered Family Dashboard
                </>
              )}
            </p>
          </div>

          <div className="header-right-actions" ref={notifPanelRef}>
            {/* Notification Bell — only shown when a sibling is selected */}
            {activeSibling && (
              <button
                className={`btn-notif-bell ${unreadNotifCount > 0 ? 'has-unread' : ''}`}
                onClick={() => setNotifOpen(v => !v)}
                title="Notifications"
              >
                <i className="fas fa-bell"></i>
                {unreadNotifCount > 0 && (
                  <span className="notif-badge">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>
                )}
              </button>
            )}

            {/* Notification Dropdown */}
            {notifOpen && (
              <div className="notif-dropdown">
                <div className="notif-drop-header">
                  <div className="notif-drop-title">
                    <i className="fas fa-bell"></i> Notifications
                  </div>
                  {unreadNotifCount > 0 && (
                    <button className="btn-mark-read" onClick={handleMarkAllNotifsRead}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="notif-list">
                  {(!localNotifications || localNotifications.length === 0) ? (
                    <div className="notif-empty">
                      <i className="fas fa-bell-slash"></i>
                      <p>No notifications yet</p>
                    </div>
                  ) : (
                    localNotifications.map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item ${!n.isRead ? 'unread' : ''}`}
                        onClick={async () => {
                          await db.notifications.update(n.id, { isRead: true });
                        }}
                      >
                        <div className={`notif-type-icon ${n.parentPhone ? 'notif-icon-direct' : 'notif-icon-broadcast'}`}>
                          <i className={`fas ${n.parentPhone ? 'fa-envelope-open-text' : 'fa-bullhorn'}`}></i>
                        </div>
                        <div className="notif-text-block">
                          <div className="notif-item-title">{n.title}</div>
                          <div className="notif-item-body">{n.content}</div>
                          <div className="notif-item-time">{formatDate(n.created_at)}</div>
                        </div>
                        {!n.isRead && <div className="notif-unread-dot"></div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <button className="btn-logout" onClick={() => setChangePwdOpen(true)} style={{ background: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.12)' }}>
              <i className="fas fa-key"></i> Change Password
            </button>

            <button className="btn-logout" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt"></i> Sign Out
            </button>
          </div>
        </div>
      </div>

      {selectedIdx === null ? (
        /* ── SIBLING CARDS GRID VIEW ── */
        <div className="selector-landing-container">
          <div className="selector-landing-card">
            <h3 className="landing-title">Registered Learners</h3>
            <p className="landing-subtitle">Please select a student below to access their academic performance profiles and financial ledger details.</p>
            <div className="sibling-grid">
              {siblings.map((sib, idx) => (
                <div key={sib.id} className={`sibling-card ${sib.gender === 'Female' ? 'card-female' : 'card-male'}`} onClick={() => setSelectedIdx(idx)}>
                  <div className="sib-card-header">
                    <div className="sib-avatar-wrapper">
                      {sib.photoUrl || sib.photo ? (
                        <img src={sib.photoUrl || sib.photo} alt={sib.fullName} className="sib-avatar" />
                      ) : (
                        <div 
                          className="sib-avatar-ph"
                          style={{ 
                            background: sib.gender === 'Female' ? 'rgba(236,72,153,0.12)' : 'rgba(59,130,246,0.12)',
                            color: sib.gender === 'Female' ? '#ec4899' : '#3b82f6',
                            borderColor: sib.gender === 'Female' ? 'rgba(236,72,153,0.2)' : 'rgba(59,130,246,0.2)'
                          }}
                        >
                          <i className="fas fa-user-graduate"></i>
                        </div>
                      )}
                    </div>
                    <span className="sib-badge">Student</span>
                  </div>
                  <div className="sib-card-body">
                    <h4 className="sib-fullname" title={sib.fullName}>{sib.fullName}</h4>
                    <div className="sib-meta-row">
                      <span className="sib-meta-lbl">Reg No:</span>
                      <span className="sib-meta-val">{sib.regNumber}</span>
                    </div>
                    <div className="sib-meta-row">
                      <span className="sib-meta-lbl">Current Grade:</span>
                      <span className="sib-meta-val">{getClassName(sib.currentClassId)}</span>
                    </div>
                    <div className="sib-school-info">
                      {getSchoolLogo(sib.schoolId) ? (
                        <img src={getSchoolLogo(sib.schoolId)} alt="School Logo" className="sib-school-logo" />
                      ) : (
                        <div className="sib-school-logo-ph">
                          <i className="fas fa-school"></i>
                        </div>
                      )}
                      <span>{getSchoolName(sib.schoolId)}</span>
                    </div>
                  </div>
                  <div className="sib-card-footer">
                    <button className="btn-sib-enter">
                      Access Dashboard <i className="fas fa-arrow-right"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── SELECTED SIBLING DETAILS DASHBOARD VIEW ── */
        <div className="dashboard-body">
          <div className="left-column">
            <button className="btn-back-selection" onClick={() => setSelectedIdx(null)}>
              <i className="fas fa-chevron-left"></i> Switch Learner
            </button>
            {siblings.length > 1 && (
              <div className="sibling-selector-card">
                <div className="selector-title">Select Sibling Account</div>
                <div className="sibling-pills">
                  {siblings.map((sib, idx) => (
                    <button
                      key={sib.id}
                      className={`sibling-pill ${idx === selectedIdx ? 'active' : ''}`}
                      onClick={() => setSelectedIdx(idx)}
                    >
                      <i className="fas fa-user-circle"></i>
                      {sib.fullName.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeSibling ? (
              <>
                <div className="id-card">
                  <div className="id-header">
                    <div className="school-badge-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {schoolInfo?.logoUrl && (
                        <img src={schoolInfo.logoUrl} alt="Logo" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} />
                      )}
                      <div>
                        <h3>{schoolInfo?.name || 'Labour Basic School'}</h3>
                        <span>Official ID Card</span>
                      </div>
                    </div>
                    <div className="id-chip">Student</div>
                  </div>
                  <div className="id-body">
                    {activeSibling.photoUrl || activeSibling.photo ? (
                      <img src={activeSibling.photoUrl || activeSibling.photo} alt={activeSibling.fullName} className="id-photo-frame" />
                    ) : (
                      <div 
                        className="id-photo-placeholder"
                        style={{ 
                          background: activeSibling.gender === 'Female' ? 'rgba(236,72,153,0.15)' : 'rgba(59,130,246,0.15)',
                          color: activeSibling.gender === 'Female' ? '#ec4899' : '#3b82f6',
                          borderColor: activeSibling.gender === 'Female' ? 'rgba(236,72,153,0.25)' : 'rgba(59,130,246,0.25)'
                        }}
                      >
                        <i className="fas fa-user-graduate"></i>
                      </div>
                    )}
                    <div className="id-details">
                      <div className="id-name" title={activeSibling.fullName}>{activeSibling.fullName}</div>
                      <div className="id-row">
                        <span className="id-lbl">Reg Number</span>
                        <span className="id-val">{activeSibling.regNumber}</span>
                      </div>
                      <div className="id-row">
                        <span className="id-lbl">Current Grade</span>
                        <span className="id-val">{getClassName(activeSibling.currentClassId)}</span>
                      </div>
                      <div className="id-row">
                        <span className="id-lbl">Grade Average</span>
                        <span className="id-val">{isReportReleased && gradeAverage !== null ? `${gradeAverage}%` : '—'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="id-footer">
                    <span>Issued: {schoolInfo?.currentAcademicYear || 'Current Year'}</span>
                    <span>Active</span>
                  </div>
                </div>
                <div className="contact-card">
                  <div className="contact-header">
                    <div className="contact-avatar"><i className="fas fa-user-tie"></i></div>
                    <div>
                      <div className="contact-title">Administrative Contacts</div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Labour Edu Support</span>
                    </div>
                  </div>
                  <div className="contact-detail-row">
                    <i className="fas fa-phone-alt"></i>
                    <span>Main Office: {schoolInfo?.phone || '054 220 2200'}</span>
                  </div>
                  <div className="contact-detail-row">
                    <i className="fas fa-envelope"></i>
                    <span>{schoolInfo?.email || 'support@laboureduc.org'}</span>
                  </div>
                  <div className="contact-detail-row">
                    <i className="fas fa-map-marker-alt"></i>
                    <span>{schoolInfo?.location || 'Accra, Ghana'}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}></i>
                <p>Loading sibling data...</p>
              </div>
            )}
          </div>

          <div className="right-column">
            {activeSibling && (
              <>
                <div className="metrics-grid">
                  <div className="metric-card metric-grade">
                    <div className="metric-icon"><i className="fas fa-graduation-cap"></i></div>
                    <div className="metric-details">
                      <span className="metric-lbl">Academic Average</span>
                      <h3 className="metric-val">{isReportReleased && gradeAverage !== null ? `${gradeAverage}%` : '—'}</h3>
                      <span className="metric-sub">{isReportReleased ? `${schoolInfo?.currentTerm || 'Term 1'} Performance` : 'Awaiting Official Release'}</span>
                    </div>
                  </div>
                  <div className="metric-card metric-balance">
                    <div className="metric-icon"><i className="fas fa-wallet"></i></div>
                    <div className="metric-details">
                      <span className="metric-lbl">Outstanding Balance</span>
                      <h3 className="metric-val" style={{ color: parseFloat(siblingSummary?.feesOwed) > 0 ? '#ef4444' : '#10b981' }}>
                        {siblingSummary?.feesOwed !== undefined && siblingSummary?.feesOwed !== null && !isNaN(parseFloat(siblingSummary.feesOwed))
                          ? `GH¢ ${parseFloat(siblingSummary.feesOwed).toFixed(2)}`
                          : 'GH¢ 0.00'}
                      </h3>
                      <span className="metric-sub">Sibling Account Ledger</span>
                    </div>
                  </div>
                  <div className="metric-card metric-attendance">
                    <div className="metric-icon"><i className="fas fa-calendar-check"></i></div>
                    <div className="metric-details">
                      <span className="metric-lbl">Term Attendance</span>
                      <h3 className="metric-val">{attendanceRate}</h3>
                      <span className="metric-sub">
                        {siblingSummary?.attendancePresent || 0} of {siblingSummary?.attendanceTotal || 0} Days
                      </span>
                    </div>
                  </div>
                </div>

                <div className="dashboard-sub-grid">
                  <div className="portals-sub-column">
                    <h3 className="section-title">
                      <i className="fas fa-link" style={{ color: '#0d9488', fontSize: '0.9rem' }}></i> Sibling Quick Portals
                    </h3>
                    <div className="quick-actions-grid">
                      <button 
                        className="qa-grid-btn qa-btn-report" 
                        onClick={() => {
                          if (isReportReleased) {
                            navigate(`/parent/report/${activeSibling.id}`);
                          } else {
                            setReleaseModalOpen(true);
                          }
                        }}
                        style={{
                          background: !isReportReleased ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.04) 0%, rgba(148, 163, 184, 0.01) 100%)' : undefined,
                          borderColor: !isReportReleased ? 'rgba(148, 163, 184, 0.15)' : undefined
                        }}
                      >
                        <div className="qa-btn-main">
                          <div className="qa-btn-icon" style={{ background: !isReportReleased ? 'rgba(148, 163, 184, 0.1)' : undefined, color: !isReportReleased ? '#64748b' : undefined }}>
                            <i className={`fas ${!isReportReleased ? 'fa-lock' : 'fa-file-invoice'}`}></i>
                          </div>
                          <div className="qa-btn-text">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="qa-btn-title">Academic Report Card</span>
                              {!isReportReleased && (
                                <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                  Pending
                                </span>
                              )}
                            </div>
                            <div className="qa-btn-desc">
                              {!isReportReleased 
                                ? 'Terminal report card is being finalized and reviewed.' 
                                : 'Check terminal marks, remarks, and endorsements.'}
                            </div>
                          </div>
                        </div>
                        <div className="qa-btn-action-indicator" style={{ color: !isReportReleased ? '#64748b' : undefined }}>
                          {!isReportReleased ? <>Locked <i className="fas fa-lock" /></> : <>Enter Portal <i className="fas fa-arrow-right" /></>}
                        </div>
                      </button>
                      <button className="qa-grid-btn qa-btn-fees" onClick={() => navigate(`/parent/fees/${activeSibling.id}`)}>
                        <div className="qa-btn-main">
                          <div className="qa-btn-icon"><i className="fas fa-wallet"></i></div>
                          <div className="qa-btn-text">
                            <div className="qa-btn-title">Financial Ledger</div>
                            <div className="qa-btn-desc">Review tuition bills, outstanding arrears, and bank guidelines.</div>
                          </div>
                        </div>
                        <div className="qa-btn-action-indicator">Enter Portal <i className="fas fa-arrow-right"></i></div>
                      </button>
                      {/* ── Chat with Head Teacher ── */}
                      <button
                        className="qa-grid-btn"
                        style={{
                          background: 'linear-gradient(135deg, rgba(139,92,246,0.07) 0%, rgba(139,92,246,0.02) 100%)',
                          borderColor: 'rgba(139,92,246,0.22)',
                          position: 'relative'
                        }}
                        onClick={() => { setChatOpen(true); setNotifOpen(false); }}
                      >
                        <div className="qa-btn-main">
                          <div className="qa-btn-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', position: 'relative' }}>
                            <i className="fas fa-comment-alt"></i>
                            {unreadChatCount > 0 && (
                              <span className="chat-badge" style={{
                                position: 'absolute',
                                top: '-6px',
                                right: '-6px',
                                background: '#ef4444',
                                color: '#fff',
                                fontSize: '0.62rem',
                                fontWeight: '800',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid #fff',
                                boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)'
                              }}>{unreadChatCount}</span>
                            )}
                          </div>
                          <div className="qa-btn-text">
                            <div className="qa-btn-title" style={{ color: '#0f172a' }}>Chat with Head Teacher</div>
                            <div className="qa-btn-desc">Send a private message directly to school administration.</div>
                          </div>
                        </div>
                        <div className="qa-btn-action-indicator" style={{ color: '#a78bfa' }}>
                          Open Chat <i className="fas fa-arrow-right"></i>
                        </div>
                      </button>
                    </div>
                  </div>


                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboard;


