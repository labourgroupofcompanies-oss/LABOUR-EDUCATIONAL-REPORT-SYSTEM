import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../store/AuthContext';
import { enqueueSync } from '../../services/syncEngine';
import { ensureAuth } from '../../lib/authUtils';

const getNextStaffId = (teachersList) => {
  if (!teachersList || teachersList.length === 0) return 'TCH-001';

  let maxNum = -1;
  let matchingPrefix = 'TCH-';
  let paddingLength = 3;
  let foundMatch = false;

  teachersList.forEach(t => {
    const idStr = t.staffId || '';
    const match = idStr.match(/^(.*?)([0-9]+)([^0-9]*)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const parsed = parseInt(numStr, 10);
      if (parsed > maxNum) {
        maxNum = parsed;
        matchingPrefix = prefix;
        paddingLength = numStr.length;
        foundMatch = true;
      }
    }
  });

  if (!foundMatch) {
    return `TCH-${String(teachersList.length + 1).padStart(3, '0')}`;
  }

  const nextNum = maxNum + 1;
  const nextNumStr = String(nextNum).padStart(paddingLength, '0');
  return `${matchingPrefix}${nextNumStr}`;
};

const TeacherList = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  
  const [newTeacher, setNewTeacher] = useState({
    fullName: '',
    staffId: '',
    email: '',
    role: 'teacher'
  });

  const [assignClassId, setAssignClassId] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');

  const { user } = useAuth();

  const schoolId = user?.schoolId;
  const teachers = useLiveQuery(
    () => schoolId ? db.profiles.where('schoolId').equals(schoolId).and(p => p.role?.toLowerCase().trim() === 'teacher').toArray() : [], 
    [schoolId]
  );
  const classes = useLiveQuery(
    () => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );
  const subjects = useLiveQuery(
    () => schoolId ? db.subjects.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );
  const allAssignments = useLiveQuery(
    () => schoolId ? db.teacherAssignments.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );
  const classSubjects = useLiveQuery(
    () => schoolId ? db.classSubjects.where('schoolId').equals(schoolId).toArray() : [], 
    [schoolId]
  );

  // Filter allowed subjects based on selected class
  const allowedSubjects = React.useMemo(() => {
    if (!subjects || !assignClassId) return [];
    const assignedIds = new Set(
      classSubjects
        ?.filter(cs => cs.classId === Number(assignClassId))
        ?.map(cs => cs.subjectId)
    );
    return subjects.filter(s => assignedIds.has(Number(s.id)));
  }, [subjects, assignClassId, classSubjects]);

  // Auto-increment Staff ID when modal opens
  useEffect(() => {
    if (isModalOpen && teachers) {
      const nextId = getNextStaffId(teachers);
      setNewTeacher(prev => ({
        ...prev,
        staffId: nextId
      }));
    }
  }, [isModalOpen, teachers]);

  // ── Sync Engine for Teacher Profiles and Assignments ───────────────
  useEffect(() => {
    const pullTeachersAndAssignments = async () => {
      if (!navigator.onLine || !user?.schoolId) return;
      console.log('Pulling teachers, assignments, and class-subjects from Supabase with resilient sync...');
      
      // 1. Pull Teachers
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
            
          // Delete any local teacher not in the remote list,
          // BUT protect teachers with a pending insert in the outbox (registered offline)
          for (const lt of localTeachers) {
            if (!remoteIds.has(lt.id)) {
              const hasPendingInsert = await db.outbox
                .filter(o => o.table === 'report_profiles' && o.operation === 'insert' && o.payload.includes(lt.id))
                .first();
              if (!hasPendingInsert) {
                await db.profiles.delete(lt.id);
              } else {
                console.log(`[TeacherList Sync] Protecting unsynced local teacher ${lt.fullName} from deletion (pending insert in outbox).`);
              }
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
        console.error('[TeacherList Sync] Teachers sync failed:', err);
      }

      // 2. Pull Assignments
      try {
        const { data: assignData, error: assignErr } = await supabase
          .from('report_teacher_assignments')
          .select('*')
          .eq('school_id', user.schoolId);
        if (!assignErr && assignData) {
          await db.teacherAssignments.clear();
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
        console.error('[TeacherList Sync] Teacher assignments sync failed:', err);
      }

      // 3. Pull Class-Subject Assignments
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
        console.error('[TeacherList Sync] Class-Subject assignments sync failed:', err);
      }
    };

    const syncDeletedAssignments = async () => {
      if (navigator.onLine) {
        const queue = JSON.parse(localStorage.getItem('pending_deleted_assignments') || '[]');
        if (queue.length > 0) {
          try {
            const { error } = await supabase.from('report_teacher_assignments').delete().in('id', queue);
            if (!error) {
              localStorage.removeItem('pending_deleted_assignments');
              console.log('Offline deleted assignments synced!');
            }
          } catch (err) {
            console.error('Failed to sync offline deleted assignments:', err);
          }
        }
      }
    };

    pullTeachersAndAssignments();
    syncDeletedAssignments();
  }, [user]);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!user?.schoolId) return;

    const teacherId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const record = {
      id: teacherId,
      fullName: newTeacher.fullName,
      staffId: newTeacher.staffId,
      email: newTeacher.email,
      role: 'teacher',
      isClaimed: false,
      schoolId: user.schoolId,
      createdAt
    };

    try {
      // Self-heal: ensure the auth user's JWT metadata contains school_id.
      // This is required by the RLS INSERT policy on report_profiles.
      // If missing, Supabase will reject the insert with a policy violation.
      if (navigator.onLine) {
        try {
          const authUser = await ensureAuth();
          if (authUser && (!authUser.user_metadata?.school_id || authUser.user_metadata.school_id !== user.schoolId)) {
            console.log('[TeacherList] Self-healing auth metadata with school_id...');
            await supabase.auth.updateUser({ data: { school_id: user.schoolId } });
          }
        } catch (metaErr) {
          console.warn('[TeacherList] Auth metadata self-heal skipped:', metaErr);
        }
      }

      // Save profile locally first (always works offline)
      await db.profiles.add(record);

      // Enqueue sync for cloud insert (works online & offline via outbox)
      await enqueueSync('insert', 'report_profiles', {
        id: teacherId,
        school_id: user.schoolId,
        full_name: newTeacher.fullName,
        role: 'teacher',
        staff_id: newTeacher.staffId,
        email: newTeacher.email,
        is_claimed: false,
        created_at: createdAt
      }, user.schoolId);

      setIsModalOpen(false);
      setNewTeacher({ fullName: '', staffId: '', email: '', role: 'teacher' });
      alert('Teacher registered successfully! They can now claim their portal and create their secure login credentials.');
    } catch (err) {
      console.error('Failed to register teacher:', err);
      alert(err.message || 'Failed to register teacher. Please check if the email address is already in use.');
    }
  };


  const handleDeleteTeacher = async (id) => {
    if (!await window.confirm('Are you sure you want to delete this teacher? All assignments for this teacher will be removed.')) return;
    try {
      // Enqueue sync for delete
      await enqueueSync('delete', 'report_profiles', {
        filter: { id: id }
      }, user.schoolId);

      // Delete locally
      await db.profiles.delete(id);
      
      // Cascade delete local assignments
      const relatedAssigns = allAssignments?.filter(a => a.teacherId === id) || [];
      for (const a of relatedAssigns) {
        await db.teacherAssignments.delete(a.id);
      }
    } catch (err) {
      console.error('Failed to delete teacher:', err);
      alert('An error occurred: ' + err.message);
    }
  };

  // ── Assignment Functions ──────────────────────────────────────────
  const handleOpenAssignModal = (teacher) => {
    setSelectedTeacher(teacher);
    setIsAssignModalOpen(true);
    setAssignClassId('');
    setAssignSubjectId('');
  };

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    if (!selectedTeacher || !assignClassId || !user?.schoolId) return;

    const classObj = classes.find(c => c.id === Number(assignClassId));
    const mode = classObj?.teachingMode || 'class_teacher';
    
    let subjectIdVal = null;
    if (mode === 'class_teacher' || assignSubjectId === 'advisor') {
      subjectIdVal = null;
    } else {
      subjectIdVal = Number(assignSubjectId);
    }

    // 1. Prevent duplicate assignments for the SAME teacher
    const teacherAssignments = allAssignments?.filter(a => a.teacherId === selectedTeacher.id) || [];
    const isDuplicate = teacherAssignments.some(
      a => a.classId === Number(assignClassId) && a.subjectId === subjectIdVal
    );

    if (isDuplicate) {
      alert('This teacher is already assigned to this class/subject combination.');
      return;
    }

    // 2. Enforce that only ONE teacher can be assigned as the Class Advisor / Class Teacher
    if (subjectIdVal === null) {
      const existingClassTeacher = allAssignments?.find(
        a => a.classId === Number(assignClassId) && a.subjectId === null
      );
      if (existingClassTeacher) {
        const otherTeacher = await db.profiles.get(existingClassTeacher.teacherId);
        alert(`This class already has a Class Advisor/Teacher assigned: ${otherTeacher?.fullName || 'Another teacher'}. You must remove their assignment first.`);
        return;
      }
    }

    const newAssign = {
      schoolId: user.schoolId,
      teacherId: selectedTeacher.id,
      classId: Number(assignClassId),
      subjectId: subjectIdVal,
      termId: null,
      synced: false,
      supabaseId: null
    };

    await db.teacherAssignments.add(newAssign);
    await enqueueSync('insert', 'report_teacher_assignments', {
      school_id: user.schoolId,
      teacher_id: selectedTeacher.id,
      class_id: Number(assignClassId),
      subject_id: subjectIdVal
    }, user.schoolId);

    setAssignClassId('');
    setAssignSubjectId('');
  };

  const handleDeleteAssignment = async (assignment) => {
    try {
      await db.teacherAssignments.delete(assignment.id);
      if (assignment.supabaseId) {
        await enqueueSync('delete', 'report_teacher_assignments', {
          filter: { id: assignment.supabaseId }
        }, user.schoolId);
      }
    } catch (err) {
      console.error('Failed to delete assignment:', err);
    }
  };

  const activeTeacherAssignments = allAssignments?.filter(a => a.teacherId === selectedTeacher?.id) || [];
  const selectedClassObj = classes?.find(c => c.id === Number(assignClassId));
  const isSelectedClassTeacherMode = (selectedClassObj?.teachingMode || 'class_teacher') === 'class_teacher';

  return (
    <Layout title="Teacher Management">
      <div className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <i className="fas fa-plus"></i>
            <span>Register Teacher</span>
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
              <thead style={{ background: 'var(--background)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <tr>
                  <th style={{ padding: '1rem 1.5rem' }}>Staff ID</th>
                  <th style={{ padding: '1rem 1.5rem' }}>Full Name</th>
                  <th style={{ padding: '1rem 1.5rem' }} className="hide-mobile">Email</th>
                  <th style={{ padding: '1rem 1.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '0.875rem' }}>
                {teachers?.length > 0 ? teachers.map((teacher) => {
                  const teacherAssignCount = allAssignments?.filter(a => a.teacherId === teacher.id).length || 0;
                  return (
                    <tr key={teacher.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{teacher.staffId}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ fontWeight: 600 }}>{teacher.fullName}</div>
                        {teacherAssignCount > 0 && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent)', background: 'var(--accent-light)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                            {teacherAssignCount} {teacherAssignCount === 1 ? 'assignment' : 'assignments'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }} className="hide-mobile">{teacher.email}</td>
                      <td style={{ padding: '1rem 1.5rem', display: 'flex', gap: '10px' }}>
                        <button className="btn" style={{ padding: '0.4rem 0.8rem', background: 'var(--accent-light)', border: '1px solid rgba(13, 148, 136, 0.2)', cursor: 'pointer' }} onClick={() => handleOpenAssignModal(teacher)}>
                          <i className="fas fa-link" style={{ color: 'var(--accent)', marginRight: '5px' }}></i>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>Assign</span>
                        </button>
                        <button className="btn btn-danger" style={{ padding: '0.4rem' }} onClick={() => handleDeleteTeacher(teacher.id)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No teachers registered yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal for Registration */}
        {isModalOpen && (
          <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
            <div className="modal-box fade-in" style={{ maxWidth: '500px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h3>Register New Teacher</h3>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>&times;</button>
              </div>
              <form onSubmit={handleRegister}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    value={newTeacher.fullName}
                    onChange={(e) => setNewTeacher({...newTeacher, fullName: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Staff ID</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    value={newTeacher.staffId}
                    onChange={(e) => setNewTeacher({...newTeacher, staffId: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    required 
                    value={newTeacher.email}
                    onChange={(e) => setNewTeacher({...newTeacher, email: e.target.value})}
                  />
                </div>
                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                  <button type="button" className="btn" style={{ flex: 1, background: 'var(--background)', border: '1px solid var(--border)' }} onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Register</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal for Teacher Assignments */}
        {isAssignModalOpen && selectedTeacher && (
          <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setIsAssignModalOpen(false)}>
            <div className="modal-box fade-in" style={{ maxWidth: '650px', width: '90%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Manage Assignments</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Assigning subjects/classes to <strong>{selectedTeacher.fullName}</strong> ({selectedTeacher.staffId})
                  </p>
                </div>
                <button onClick={() => setIsAssignModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', height: 'fit-content' }}>&times;</button>
              </div>

              {/* Add Assignment Section */}
              <div className="card" style={{ background: 'var(--background)', marginBottom: '1.5rem', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text)' }}>
                  <i className="fas fa-plus-circle" style={{ color: 'var(--accent)', marginRight: '5px' }}></i> Add New Assignment
                </h4>
                <form onSubmit={handleAddAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <select 
                        className="form-input" 
                        required 
                        value={assignClassId} 
                        onChange={(e) => {
                          setAssignClassId(e.target.value);
                          setAssignSubjectId('');
                        }}
                      >
                        <option value="">-- Select Class --</option>
                        {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {!isSelectedClassTeacherMode && assignClassId && (
                      <div style={{ flex: '1 1 200px' }}>
                        <select 
                          className="form-input" 
                          required 
                          value={assignSubjectId} 
                          onChange={(e) => setAssignSubjectId(e.target.value)}
                        >
                          <option value="">-- Select Subject or Role --</option>
                          <option value="advisor" style={{ fontWeight: 'bold', color: 'var(--primary)' }}>★ Class Advisor (Compile Reports)</option>
                          {allowedSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {allowedSubjects.length === 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px', paddingLeft: '4px' }}>
                            <i className="fas fa-info-circle"></i> No subjects linked yet. You can only assign a Class Advisor.
                          </div>
                        )}
                      </div>
                    )}

                    <button type="submit" className="btn btn-primary" style={{ flex: '0 0 auto' }} disabled={!assignClassId || (!isSelectedClassTeacherMode && !assignSubjectId)}>
                      <i className="fas fa-plus"></i> Assign
                    </button>
                  </div>

                  {/* Mode Warning Banners */}
                  {assignClassId && (
                    <div style={{ 
                      fontSize: '0.75rem', 
                      padding: '0.5rem 0.75rem', 
                      borderRadius: '4px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      background: isSelectedClassTeacherMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      color: isSelectedClassTeacherMode ? '#d97706' : '#2563eb',
                      border: isSelectedClassTeacherMode ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(59, 130, 246, 0.2)'
                    }}>
                      <i className={`fas ${isSelectedClassTeacherMode ? 'fa-triangle-exclamation' : 'fa-circle-info'}`}></i>
                      <span>
                        {isSelectedClassTeacherMode 
                          ? `"${selectedClassObj?.name}" is in Class Teacher Mode. This teacher will automatically teach ALL subjects for this class.` 
                          : `"${selectedClassObj?.name}" is in Subject Teacher Mode. Please select the specific subject they teach.`
                        }
                      </span>
                    </div>
                  )}
                </form>
              </div>

              {/* Current Assignments List */}
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>Active Assignments ({activeTeacherAssignments.length})</h4>
              <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                {activeTeacherAssignments.length > 0 ? (
                  activeTeacherAssignments.map((a) => {
                    const classObj = classes?.find(c => c.id === a.classId);
                    const subjectObj = subjects?.find(s => s.id === a.subjectId);
                    const isCT = a.subjectId === null;
                    return (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{classObj?.name || 'Class ID: ' + a.classId}</span>
                          <span style={{ 
                            fontSize: '0.65rem', 
                            padding: '0.15rem 0.5rem', 
                            borderRadius: '4px',
                            fontWeight: 600,
                            background: isCT ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                            color: isCT ? '#d97706' : 'var(--text-muted)',
                            border: isCT ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid var(--border)'
                          }}>
                            {isCT 
                              ? (classObj?.teachingMode === 'subject_teacher' ? '★ Class Advisor (Reports)' : 'Class Teacher (All Subjects)') 
                              : `Subject: ${subjectObj?.name || 'Subject ID: ' + a.subjectId}`}
                          </span>
                        </div>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '0.25rem 0.4rem', background: 'none', border: 'none', cursor: 'pointer' }}
                          onClick={() => handleDeleteAssignment(a)}
                        >
                          <i className="fas fa-trash" style={{ color: '#ef4444' }}></i>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', margin: 0, fontSize: '0.85rem' }}>This teacher has no active assignments.</p>
                )}
              </div>
            </div>
          </div>
        )}
    </Layout>
  );
};

export default TeacherList;
