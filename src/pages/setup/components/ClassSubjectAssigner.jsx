import React from 'react';

const ClassSubjectAssigner = ({
  classes,
  subjects,
  classSubjects,
  teachers,
  allAssignments,
  selectedSetupClass,
  setSelectedSetupClass,
  handleToggleSubject,
  handleSelectAllSubjects,
  handleAssignTeacher
}) => {
  const assignedSubjectIds = React.useMemo(() => {
    if (!classSubjects || !selectedSetupClass) return new Set();
    return new Set(
      classSubjects
        .filter(cs => cs.classId === Number(selectedSetupClass))
        .map(cs => cs.subjectId)
    );
  }, [classSubjects, selectedSetupClass]);

  const selectedClassDetail = classes?.find(c => c.id === Number(selectedSetupClass));
  const isSelectedCT = (selectedClassDetail?.teachingMode || 'class_teacher') === 'class_teacher';

  return (
    <div className="card hover-card" style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
          <span style={{ 
            background: 'var(--accent-light)', 
            color: 'var(--accent)', 
            width: '36px', 
            height: '36px', 
            borderRadius: '8px', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <i className="fas fa-layer-group" style={{ fontSize: '1.1rem' }}></i>
          </span>
          Offered Subjects & Teacher Assignments
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Map the specific subjects taught in each class and assign their respective teachers in real-time.
        </p>
      </div>

      {/* Select Class & Batch Actions Row */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        flexWrap: 'wrap', 
        alignItems: 'center', 
        background: 'var(--background)',
        padding: '1rem',
        borderRadius: '10px',
        border: '1px solid var(--border)'
      }}>
        <div style={{ flex: '1 1 260px' }}>
          <select
            className="form-input"
            style={{ background: 'var(--surface)', cursor: 'pointer', fontSize: '0.875rem' }}
            value={selectedSetupClass}
            onChange={(e) => setSelectedSetupClass(e.target.value)}
          >
            <option value="">-- Choose Class to Configure --</option>
            {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedSetupClass && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              className="btn" 
              style={{ 
                padding: '0.45rem 1rem', 
                fontSize: '0.75rem', 
                background: 'var(--surface)', 
                border: '1px solid var(--border)',
                color: 'var(--accent)',
                fontWeight: 700
              }} 
              onClick={() => handleSelectAllSubjects(true)}
            >
              <i className="fas fa-check-double" style={{ marginRight: '5px' }}></i> Select All Subjects
            </button>
            <button 
              type="button" 
              className="btn" 
              style={{ 
                padding: '0.45rem 1rem', 
                fontSize: '0.75rem', 
                background: 'var(--surface)', 
                border: '1px solid var(--border)',
                color: '#ef4444',
                fontWeight: 700
              }} 
              onClick={() => handleSelectAllSubjects(false)}
            >
              <i className="fas fa-trash-can" style={{ marginRight: '5px' }}></i> Clear All
            </button>
          </div>
        )}
      </div>

      {selectedSetupClass ? (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Custom HSL Alert Banners */}
          <div style={{ 
            fontSize: '0.825rem', 
            padding: '1rem', 
            borderRadius: '10px', 
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            background: isSelectedCT ? 'rgba(245, 158, 11, 0.07)' : 'rgba(59, 130, 246, 0.07)',
            color: isSelectedCT ? '#b45309' : '#1d4ed8',
            border: isSelectedCT ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(59, 130, 246, 0.15)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <span style={{
              background: isSelectedCT ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <i className={`fas ${isSelectedCT ? 'fa-user-tie' : 'fa-people-group'}`} style={{ fontSize: '1rem' }}></i>
            </span>
            <div>
              <strong style={{ display: 'block', fontSize: '0.875rem', marginBottom: '2px' }}>
                {selectedClassDetail?.name} configuration active: {isSelectedCT ? 'Class Teacher Mode' : 'Subject Teacher Mode'}
              </strong>
              <span style={{ opacity: 0.9, lineHeight: 1.4 }}>
                {isSelectedCT 
                  ? 'In Class Teacher Mode, you assign a single Class Teacher who is automatically authorized to enter grades for all of this class\'s selected subjects, and manages overall reports.' 
                  : 'In Subject Teacher Mode, you assign specialized, subject-specific teachers below, but still designate a primary Class Teacher / Advisor above to manage overall reports and remarks.'
                }
              </span>
            </div>
          </div>

          {/* Single Class Teacher Selector card (Always visible as Class Advisor) */}
          <div 
            className="fade-in"
            style={{ 
              padding: '1.25rem', 
              background: 'rgba(13, 148, 136, 0.04)', 
              border: '1px solid rgba(13, 148, 136, 0.18)', 
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{ 
                  background: 'var(--accent)', 
                  color: 'white', 
                  width: '28px', 
                  height: '28px', 
                  borderRadius: '6px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <i className="fas fa-chalkboard-teacher" style={{ fontSize: '0.85rem' }}></i>
                </span>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--accent-dark)' }}>
                  Assign Class Teacher / Advisor:
                </span>
              </div>
              <div style={{ flex: '1 1 240px', maxWidth: '380px' }}>
                <select
                  className="form-input"
                  style={{ background: 'var(--surface)', cursor: 'pointer', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                  value={allAssignments?.find(a => a.classId === Number(selectedSetupClass) && a.subjectId === null)?.teacherId || ''}
                  onChange={(e) => handleAssignTeacher(selectedSetupClass, null, e.target.value)}
                >
                  <option value="">-- Choose Class Teacher / Advisor --</option>
                  {teachers?.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Grid of Subjects Checkboxes with Teacher selectors */}
          {subjects?.length > 0 ? (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', 
              gap: '16px',
              background: 'var(--background)',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm) inset'
            }}>
              {subjects.map(s => {
                const isAssigned = assignedSubjectIds.has(Number(s.id));
                
                const assignment = allAssignments?.find(
                  a => a.classId === Number(selectedSetupClass) && a.subjectId === Number(s.id)
                );
                const currentTeacherId = assignment?.teacherId || '';

                return (
                  <div 
                    key={s.id} 
                    className="subject-card"
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '12px', 
                      padding: '1.25rem', 
                      borderRadius: '12px',
                      background: isAssigned ? 'var(--accent-light)' : 'var(--surface)',
                      border: `1px solid ${isAssigned ? 'rgba(13, 148, 136, 0.4)' : 'var(--border)'}`,
                      boxShadow: isAssigned ? '0 4px 12px rgba(13, 148, 136, 0.05)' : 'var(--shadow-sm)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    <label 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px', 
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                        checked={isAssigned}
                        onChange={(e) => handleToggleSubject(s.id, e.target.checked)}
                      />
                      <span style={{ 
                        fontSize: '0.9rem', 
                        fontWeight: 700, 
                        color: isAssigned ? 'var(--accent-dark)' : 'var(--text)',
                        transition: 'var(--transition)'
                      }}>
                        {s.name}
                      </span>
                    </label>

                    {/* Direct Teacher Assigner Dropdown in Subject Teacher Mode */}
                    {!isSelectedCT && isAssigned && (
                      <div className="fade-in" style={{ marginTop: '2px', borderTop: '1px dashed rgba(13, 148, 136, 0.2)', paddingTop: '10px' }}>
                        <div style={{ 
                          fontSize: '0.65rem', 
                          color: 'var(--accent-dark)', 
                          marginBottom: '6px', 
                          fontWeight: 700, 
                          letterSpacing: '0.6px',
                          textTransform: 'uppercase',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <i className="fas fa-graduation-cap"></i> Specialized Teacher:
                        </div>
                        <select
                          className="form-input"
                          style={{ 
                            fontSize: '0.75rem', 
                            padding: '0.4rem 0.6rem', 
                            height: 'auto', 
                            minHeight: 'unset', 
                            background: 'var(--surface)',
                            border: '1px solid rgba(13, 148, 136, 0.2)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--text)'
                          }}
                          value={currentTeacherId}
                          onChange={(e) => handleAssignTeacher(selectedSetupClass, s.id, e.target.value)}
                        >
                          <option value="">-- Unassigned --</option>
                          {teachers?.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <i className="fas fa-book-open" style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.4 }}></i>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>No subjects registered yet.</h3>
              <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Please create standard subjects in the subjects catalog above first.</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '4rem 2rem', 
          color: 'var(--text-muted)', 
          background: 'var(--background)', 
          borderRadius: '12px', 
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm) inset'
        }}>
          <span style={{
            background: 'var(--surface)',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--text-muted)',
            marginBottom: '1rem'
          }}>
            <i className="fas fa-layer-group" style={{ fontSize: '1.75rem', opacity: 0.6 }}></i>
          </span>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Class offered subjects planner</h3>
          <p style={{ fontSize: '0.8rem', marginTop: '4px', maxWidth: '380px', margin: '4px auto 0 auto' }}>
            Choose a school grade group above to link their offered courses and assign teachers to those sections.
          </p>
        </div>
      )}
    </div>
  );
};

export default ClassSubjectAssigner;
