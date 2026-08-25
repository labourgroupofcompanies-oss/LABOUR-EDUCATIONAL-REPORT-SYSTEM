import React, { useState, useMemo } from 'react';

const ClassDetailDrawer = ({
  isOpen,
  onClose,
  targetClass,
  classes = [],
  subjects = [],
  classSubjects = [],
  teachers = [],
  allAssignments = [],
  updateClassMode,
  updateClassCategory,
  handleToggleSubject,
  handleSelectAllSubjects,
  handleAssignTeacher,
  handleCopyClassConfig,
  onNavigateClass
}) => {
  const [activeSubTab, setActiveSubTab] = useState('subjects'); // 'subjects' | 'teacher' | 'settings'
  const [subjectSearch, setSubjectSearch] = useState('');
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [copying, setCopying] = useState(false);

  const classId = targetClass ? Number(targetClass.id) : null;
  const isSubjectTeacher = targetClass?.teachingMode === 'subject_teacher';

  // Active subjects
  const activeSubjectIds = useMemo(() => {
    if (!classId) return new Set();
    return new Set(
      classSubjects
        .filter(cs => Number(cs.classId) === classId)
        .map(cs => Number(cs.subjectId))
    );
  }, [classSubjects, classId]);

  // Assignments
  const currentAssignments = useMemo(() => {
    if (!classId) return [];
    return allAssignments.filter(a => Number(a.classId) === classId);
  }, [allAssignments, classId]);

  // Class Form Master
  const classAdvisorAssignment = currentAssignments.find(a => a.subjectId === null);
  const classAdvisorId = classAdvisorAssignment ? classAdvisorAssignment.teacherId : '';

  // Filtered subjects
  const filteredSubjects = useMemo(() => {
    return (subjects || []).filter(s =>
      s.name.toLowerCase().includes(subjectSearch.toLowerCase())
    );
  }, [subjects, subjectSearch]);

  const getSubjectTeacherId = (subId) => {
    const assign = currentAssignments.find(a => Number(a.subjectId) === Number(subId));
    return assign ? assign.teacherId : '';
  };

  const currentIndex = classes.findIndex(c => Number(c.id) === classId);
  const prevClass = currentIndex > 0 ? classes[currentIndex - 1] : null;
  const nextClass = currentIndex < classes.length - 1 ? classes[currentIndex + 1] : null;

  if (!isOpen || !targetClass) return null;

  const handleCopy = async () => {
    if (!copySourceId || !classId) return;
    setCopying(true);
    try {
      await handleCopyClassConfig(copySourceId, classId);
      setShowCopyModal(false);
      alert('Configuration copied successfully!');
    } catch (err) {
      alert('Failed to copy: ' + err.message);
    } finally {
      setCopying(false);
    }
  };

  const handleAssignAllToAdvisor = async () => {
    if (!classAdvisorId) {
      alert('Please assign a Form Master first.');
      return;
    }
    const activeSubs = subjects.filter(s => activeSubjectIds.has(Number(s.id)));
    for (const sub of activeSubs) {
      await handleAssignTeacher(classId, Number(sub.id), classAdvisorId);
    }
    alert('Assigned all subjects to Form Master!');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(9, 9, 11, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          height: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
          .drawer-sub-tab {
            padding: 0.6rem 0.85rem;
            font-size: 0.84rem;
            font-weight: 700;
            border: none;
            border-bottom: 2px solid transparent;
            background: transparent;
            color: #71717A;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
          }
          .drawer-sub-tab.active {
            color: #2563EB;
            border-bottom-color: #2563EB;
          }
          .subject-row-item {
            padding: 0.75rem 0.95rem;
            border-radius: 12px;
            border: 1px solid #E4E4E7;
            background: #FAFAFA;
            margin-bottom: 0.5rem;
            transition: all 0.15s ease;
          }
          .subject-row-item.active {
            border-color: #BFDBFE;
            background: #F8FAFC;
          }
        `}</style>

        {/* Drawer Header */}
        <div style={{
          padding: '1.1rem 1.25rem',
          borderBottom: '1px solid #E4E4E7',
          background: '#09090B',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.65rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '1px 6px',
                borderRadius: '5px',
                background: isSubjectTeacher ? 'rgba(147, 51, 234, 0.25)' : 'rgba(37, 99, 235, 0.25)',
                color: isSubjectTeacher ? '#C084FC' : '#93C5FD'
              }}>
                {isSubjectTeacher ? 'Specialist Mode' : 'Class Teacher Mode'}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#A1A1AA' }}>
                {targetClass.category || 'Basic'}
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
              {targetClass.name}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: '7px', padding: '2px' }}>
              <button
                type="button"
                disabled={!prevClass}
                onClick={() => onNavigateClass && onNavigateClass(prevClass.id)}
                title={prevClass ? `Previous: ${prevClass.name}` : 'None'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: prevClass ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  cursor: prevClass ? 'pointer' : 'default',
                  fontSize: '0.8rem'
                }}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              <button
                type="button"
                disabled={!nextClass}
                onClick={() => onNavigateClass && onNavigateClass(nextClass.id)}
                title={nextClass ? `Next: ${nextClass.name}` : 'None'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: nextClass ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  cursor: nextClass ? 'pointer' : 'default',
                  fontSize: '0.8rem'
                }}
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: '#FFFFFF',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              <i className="fas fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E4E4E7',
          background: '#FFFFFF',
          padding: '0 0.85rem',
          gap: '0.5rem',
          overflowX: 'auto'
        }}>
          <button
            type="button"
            className={`drawer-sub-tab ${activeSubTab === 'subjects' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('subjects')}
          >
            <i className="fas fa-book-open" style={{ fontSize: '0.8rem' }}></i>
            <span>Subjects</span>
            <span style={{
              fontSize: '0.68rem',
              padding: '1px 5px',
              borderRadius: '999px',
              background: activeSubjectIds.size > 0 ? '#DBEAFE' : '#F4F4F5',
              color: activeSubjectIds.size > 0 ? '#1E40AF' : '#71717A',
              fontWeight: 800
            }}>
              {activeSubjectIds.size}
            </span>
          </button>

          <button
            type="button"
            className={`drawer-sub-tab ${activeSubTab === 'teacher' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('teacher')}
          >
            <i className="fas fa-user-tie" style={{ fontSize: '0.8rem' }}></i>
            <span>Form Master</span>
            {classAdvisorId && (
              <i className="fas fa-check-circle" style={{ color: '#10B981', fontSize: '0.75rem' }}></i>
            )}
          </button>

          <button
            type="button"
            className={`drawer-sub-tab ${activeSubTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('settings')}
          >
            <i className="fas fa-sliders" style={{ fontSize: '0.8rem' }}></i>
            <span>Settings</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: '#F8FAFC' }}>
          
          {/* ════════ TAB 1: SUBJECTS ════════ */}
          {activeSubTab === 'subjects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                border: '1px solid #E4E4E7',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#09090B' }}>
                    Active Curriculum Subjects
                  </span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      type="button"
                      onClick={() => handleSelectAllSubjects(classId, true)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        color: '#1D4ED8',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAllSubjects(classId, false)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#F4F4F5',
                        border: '1px solid #E4E4E7',
                        color: '#71717A',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCopyModal(true)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        color: '#15803D',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Copy from Class
                    </button>
                  </div>
                </div>

                <div style={{ position: 'relative' }}>
                  <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.78rem' }}></i>
                  <input
                    type="text"
                    placeholder="Search subjects..."
                    value={subjectSearch}
                    onChange={e => setSubjectSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem 0.45rem 1.9rem',
                      borderRadius: '8px',
                      border: '1px solid #E4E4E7',
                      fontSize: '0.8rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {!isSubjectTeacher && classAdvisorId && (
                  <div style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '7px',
                    background: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    fontSize: '0.75rem',
                    color: '#0369A1',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>
                      Taught by Form Master: <strong>{teachers.find(t => t.id === classAdvisorId)?.fullName || 'Class Teacher'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleAssignAllToAdvisor}
                      style={{
                        padding: '2px 7px',
                        borderRadius: '5px',
                        background: '#0284C7',
                        border: 'none',
                        color: '#FFFFFF',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Sync All
                    </button>
                  </div>
                )}
              </div>

              <div>
                {filteredSubjects.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E4E4E7', color: '#71717A', fontSize: '0.82rem' }}>
                    No subjects match "{subjectSearch}"
                  </div>
                ) : (
                  filteredSubjects.map(sub => {
                    const isChecked = activeSubjectIds.has(Number(sub.id));
                    const assignedTeacherId = getSubjectTeacherId(sub.id);

                    return (
                      <div key={sub.id} className={`subject-row-item ${isChecked ? 'active' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: '1 1 180px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSubject(classId, Number(sub.id))}
                              style={{ width: '16px', height: '16px', accentColor: '#2563EB', cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 700, fontSize: '0.86rem', color: isChecked ? '#09090B' : '#71717A' }}>
                              {sub.name}
                            </span>
                          </label>

                          {isChecked && isSubjectTeacher && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '190px' }}>
                              <select
                                value={assignedTeacherId}
                                onChange={e => handleAssignTeacher(classId, Number(sub.id), e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: '0.35rem 0.55rem',
                                  borderRadius: '6px',
                                  border: assignedTeacherId ? '1px solid #A7F3D0' : '1px solid #FCD34D',
                                  background: assignedTeacherId ? '#F0FDF4' : '#FFFBEB',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  color: '#09090B',
                                  outline: 'none',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">Select Teacher...</option>
                                {teachers.map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.fullName || t.name || t.email}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ════════ TAB 2: FORM MASTER ════════ */}
          {activeSubTab === 'teacher' && (
            <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '1.25rem', border: '1px solid #E4E4E7' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#3F3F46', marginBottom: '4px' }}>
                  Assigned Form Master / Class Teacher
                </label>
                <select
                  value={classAdvisorId}
                  onChange={e => handleAssignTeacher(classId, null, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: classAdvisorId ? '1px solid #10B981' : '1px solid #F59E0B',
                    background: classAdvisorId ? '#F0FDF4' : '#FFFBEB',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    outline: 'none',
                    color: '#09090B'
                  }}
                >
                  <option value="">-- Unassigned --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.fullName || t.name || t.email}
                    </option>
                  ))}
                </select>
              </div>

              {classAdvisorId ? (
                <div style={{ padding: '0.75rem', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#15803D', fontWeight: 700 }}>
                  <i className="fas fa-check-circle"></i>
                  <span>Form Master assigned</span>
                </div>
              ) : (
                <div style={{ padding: '0.75rem', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#B45309', fontWeight: 700 }}>
                  <i className="fas fa-triangle-exclamation"></i>
                  <span>Please assign a Form Master</span>
                </div>
              )}
            </div>
          )}

          {/* ════════ TAB 3: SETTINGS ════════ */}
          {activeSubTab === 'settings' && (
            <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '1.25rem', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div
                  onClick={() => updateClassMode(classId, 'class_teacher')}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '10px',
                    border: !isSubjectTeacher ? '2px solid #2563EB' : '1px solid #E4E4E7',
                    background: !isSubjectTeacher ? '#EFF6FF' : '#FAFAFA',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: !isSubjectTeacher ? '#1D4ED8' : '#09090B', marginBottom: '2px' }}>
                    Class Teacher Mode
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#71717A' }}>
                    One teacher handles all subjects (Primary/KG)
                  </div>
                </div>

                <div
                  onClick={() => updateClassMode(classId, 'subject_teacher')}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '10px',
                    border: isSubjectTeacher ? '2px solid #9333EA' : '1px solid #E4E4E7',
                    background: isSubjectTeacher ? '#FAF5FF' : '#FAFAFA',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: isSubjectTeacher ? '#7E22CE' : '#09090B', marginBottom: '2px' }}>
                    Specialist Mode
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#71717A' }}>
                    Individual specialist teachers per subject (JHS)
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#3F3F46', marginBottom: '4px' }}>
                  School Tier
                </label>
                <select
                  value={targetClass.category || 'basic 1-3'}
                  onChange={e => updateClassCategory(classId, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #E4E4E7',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                >
                  <option value="early grade">Early Grade (Nursery / KG)</option>
                  <option value="basic 1-3">Lower Primary (Basic 1 - 3)</option>
                  <option value="basic 4-6">Upper Primary (Basic 4 - 6)</option>
                  <option value="basic 7-9">Junior High (Basic 7 - 9)</option>
                </select>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '0.85rem 1.25rem',
          borderTop: '1px solid #E4E4E7',
          background: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '0.78rem', color: '#71717A' }}>
            {activeSubjectIds.size} subjects • {classAdvisorId ? 'Master set' : 'No Master'}
          </span>

          <div style={{ display: 'flex', gap: '6px' }}>
            {nextClass && (
              <button
                type="button"
                onClick={() => onNavigateClass && onNavigateClass(nextClass.id)}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  background: '#F4F4F5',
                  border: '1px solid #E4E4E7',
                  color: '#09090B',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Next: {nextClass.name} <i className="fas fa-arrow-right" style={{ marginLeft: '3px', fontSize: '0.7rem' }}></i>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: '8px',
                background: '#09090B',
                border: 'none',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>

        {/* Copy Modal */}
        {showCopyModal && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(9,9,11,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', zIndex: 10000
          }}>
            <div style={{
              background: '#FFFFFF', borderRadius: '16px', padding: '1.25rem', width: '100%', maxWidth: '380px'
            }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: '#09090B' }}>
                Copy from Class
              </h3>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#71717A' }}>
                Clone subjects and teacher assignments into <strong>{targetClass.name}</strong>.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <select
                  value={copySourceId}
                  onChange={e => setCopySourceId(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #E4E4E7', fontSize: '0.82rem', fontWeight: 600, outline: 'none' }}
                >
                  <option value="">-- Select Source Class --</option>
                  {classes.filter(c => Number(c.id) !== classId).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowCopyModal(false)}
                  disabled={copying}
                  style={{ padding: '0.5rem 0.85rem', borderRadius: '8px', background: '#F4F4F5', border: 'none', color: '#71717A', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!copySourceId || copying}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: '#2563EB', border: 'none', color: '#FFFFFF', fontWeight: 700, fontSize: '0.8rem', cursor: (!copySourceId || copying) ? 'not-allowed' : 'pointer' }}
                >
                  {copying ? 'Copying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ClassDetailDrawer;
