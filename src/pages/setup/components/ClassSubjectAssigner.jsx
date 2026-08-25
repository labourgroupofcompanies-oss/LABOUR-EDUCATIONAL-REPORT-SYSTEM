import React, { useState } from 'react';

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
  handleAssignTeacher,
  handleCopyClassConfig,
  updateClassMode
}) => {
  const [subjectSearch, setSubjectSearch] = useState('');
  const [sourceClassToCopy, setSourceClassToCopy] = useState('');
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const assignedSubjectIds = React.useMemo(() => {
    if (!classSubjects || !selectedSetupClass) return new Set();
    return new Set(
      classSubjects
        .filter(cs => cs.classId === Number(selectedSetupClass))
        .map(cs => cs.subjectId)
    );
  }, [classSubjects, selectedSetupClass]);

  const selectedClassDetail = (classes || []).find(c => c.id === Number(selectedSetupClass));
  const isSelectedCT = (selectedClassDetail?.teachingMode || 'class_teacher') === 'class_teacher';

  const classAdvisorAssignment = (allAssignments || []).find(
    a => a.classId === Number(selectedSetupClass) && a.subjectId === null
  );

  const filteredSubjects = (subjects || []).filter(s =>
    s.name.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const handleRunCopy = async () => {
    if (!sourceClassToCopy || !selectedSetupClass || !handleCopyClassConfig) return;
    setIsCopying(true);
    try {
      await handleCopyClassConfig(sourceClassToCopy, selectedSetupClass);
      setShowCopyModal(false);
      alert('Successfully copied subjects and teacher assignments!');
    } catch (err) {
      alert('Failed to copy class configuration: ' + err.message);
    } finally {
      setIsCopying(false);
    }
  };

  const handleAssignAllToAdvisor = async () => {
    if (!classAdvisorAssignment?.teacherId) {
      alert('Please select a Class Teacher / Advisor first before auto-assigning.');
      return;
    }
    const teacherId = classAdvisorAssignment.teacherId;
    for (const subId of assignedSubjectIds) {
      await handleAssignTeacher(selectedSetupClass, subId, teacherId);
    }
    alert('Assigned all offered subjects to the Class Advisor!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`
        .assigner-header {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .assigner-subjects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
          gap: 1rem;
        }
        @media (max-width: 640px) {
          .assigner-header button {
            width: 100% !important;
            justify-content: center !important;
          }
          .assigner-advisor-select-wrap {
            max-width: 100% !important;
            width: 100% !important;
          }
          .mode-toggle-group {
            width: 100% !important;
          }
          .mode-toggle-btn {
            flex: 1 !important;
            text-align: center !important;
            justify-content: center !important;
          }
        }
      `}</style>
      {/* Top Banner */}
      <div className="assigner-header">
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#09090b', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-layer-group" style={{ color: '#2563eb' }}></i>
            Offered Subjects &amp; Teacher Allocations
          </h2>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#71717a' }}>
            Map curriculum subjects to each class and designate class advisors or subject specialists.
          </p>
        </div>

        {selectedSetupClass && (classes || []).length > 1 && (
          <button
            type="button"
            onClick={() => setShowCopyModal(true)}
            style={{
              padding: '0.6rem 1.15rem',
              background: '#FAFAFA',
              border: '1px solid #E4E4E7',
              borderRadius: '10px',
              color: '#09090b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E4E7'; e.currentTarget.style.color = '#09090b'; }}
          >
            <i className="fas fa-copy" style={{ color: '#2563eb' }}></i>
            Copy Config from Another Class
          </button>
        )}
      </div>

      {/* Class Selector Strip */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E4E4E7',
        borderRadius: '16px',
        padding: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
          Select Class to Configure
        </label>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(classes || []).map(c => {
            const isSelected = Number(selectedSetupClass) === c.id;
            const subCount = (classSubjects || []).filter(cs => cs.classId === c.id).length;
            const hasAdv = (allAssignments || []).some(a => a.classId === c.id && a.subjectId === null);
            const isCT = (c.teachingMode || 'class_teacher') === 'class_teacher';

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedSetupClass(c.id)}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid',
                  borderColor: isSelected ? '#09090b' : '#E4E4E7',
                  background: isSelected ? '#09090b' : '#FAFAFA',
                  color: isSelected ? '#FFFFFF' : '#18181b',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                  boxShadow: isSelected ? '0 4px 12px rgba(9,9,11,0.2)' : 'none'
                }}
              >
                <span>{c.name}</span>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  background: isSelected ? '#2563eb' : isCT ? '#EFF6FF' : '#F5F3FF',
                  color: isSelected ? '#FFFFFF' : isCT ? '#2563eb' : '#7c3aed',
                  fontWeight: 800
                }}>
                  {isCT ? 'Class Tchr' : 'Subject Spec'}
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: isSelected ? '#3b82f6' : subCount > 0 ? '#E4E4E7' : '#FEF2F2',
                  color: isSelected ? '#FFFFFF' : subCount > 0 ? '#18181b' : '#EF4444',
                  fontWeight: 800
                }}>
                  {subCount} Subj{hasAdv ? ' ✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedSetupClass ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Class Mode Switcher & Information Banner */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid',
            borderColor: isSelectedCT ? '#DBEAFE' : '#EDE9FE',
            borderRadius: '16px',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px', flex: 1 }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: isSelectedCT ? '#EFF6FF' : '#F5F3FF',
                color: isSelectedCT ? '#2563eb' : '#7c3aed',
                border: `1px solid ${isSelectedCT ? '#BFDBFE' : '#DDD6FE'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                flexShrink: 0
              }}>
                <i className={`fas ${isSelectedCT ? 'fa-user-tie' : 'fa-chalkboard-user'}`}></i>
              </div>
              <div>
                <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.98rem' }}>
                  {selectedClassDetail?.name} &bull; <span style={{ color: isSelectedCT ? '#2563eb' : '#7c3aed' }}>{isSelectedCT ? 'Class Teacher Mode' : 'Subject Specialist Mode'}</span>
                </div>
                <div style={{ color: '#71717a', fontSize: '0.8rem', marginTop: '2px' }}>
                  {isSelectedCT
                    ? 'The assigned Class Teacher enters marks for all subjects and writes term remarks.'
                    : 'Designate specialized teachers for each subject below. Class Advisor manages remarks.'
                  }
                </div>
              </div>
            </div>

            {/* Mode Switcher Buttons */}
            <div className="mode-toggle-group" style={{ display: 'inline-flex', background: '#F4F4F5', padding: '4px', borderRadius: '12px', gap: '4px' }}>
              <button
                type="button"
                className="mode-toggle-btn"
                onClick={() => updateClassMode && updateClassMode(selectedSetupClass, 'class_teacher')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '9px',
                  border: 'none',
                  background: isSelectedCT ? '#FFFFFF' : 'transparent',
                  color: isSelectedCT ? '#2563eb' : '#71717a',
                  fontWeight: isSelectedCT ? 800 : 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: isSelectedCT ? '0 2px 5px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <i className="fas fa-user-tie"></i> Class Teacher Mode
              </button>
              <button
                type="button"
                className="mode-toggle-btn"
                onClick={() => updateClassMode && updateClassMode(selectedSetupClass, 'subject_teacher')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '9px',
                  border: 'none',
                  background: !isSelectedCT ? '#FFFFFF' : 'transparent',
                  color: !isSelectedCT ? '#7c3aed' : '#71717a',
                  fontWeight: !isSelectedCT ? 800 : 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: !isSelectedCT ? '0 2px 5px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <i className="fas fa-chalkboard-user"></i> Subject Specialist Mode
              </button>
            </div>
          </div>

          {/* Primary Class Teacher / Advisor Card */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#09090b',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem'
              }}>
                <i className="fas fa-user-tie"></i>
              </div>
              <div>
                <div style={{ fontWeight: 800, color: '#09090b', fontSize: '0.95rem' }}>
                  Class Teacher / Advisor
                </div>
                <div style={{ fontSize: '0.78rem', color: '#71717a' }}>
                  Responsible for terminal conduct, attendance, and advisory endorsements.
                </div>
              </div>
            </div>

            <div className="assigner-advisor-select-wrap" style={{ minWidth: '240px', flex: '1 1 240px', maxWidth: '380px' }}>
              <select
                className="form-input"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.9rem',
                  borderRadius: '10px',
                  border: '1px solid #E4E4E7',
                  fontSize: '0.88rem',
                  background: '#FAFAFA',
                  cursor: 'pointer',
                  color: '#09090b',
                  fontWeight: 600
                }}
                value={classAdvisorAssignment?.teacherId || ''}
                onChange={(e) => handleAssignTeacher(selectedSetupClass, null, e.target.value)}
              >
                <option value="">-- Choose Class Advisor / Teacher --</option>
                {(teachers || []).map(t => (
                  <option key={t.id} value={t.id}>{t.fullName} ({t.staffId || 'Staff'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subjects Selection Toolbar */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.85rem' }}></i>
              <input
                type="text"
                placeholder="Filter subjects…"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.9rem 0.5rem 2.25rem',
                  borderRadius: '10px',
                  border: '1px solid #E4E4E7',
                  fontSize: '0.85rem',
                  outline: 'none',
                  background: '#FAFAFA'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#71717a', fontWeight: 600, marginRight: '6px' }}>
                <strong>{assignedSubjectIds.size}</strong> of {subjects?.length || 0} active
              </span>
              <button 
                type="button" 
                onClick={() => handleSelectAllSubjects(true)}
                style={{
                  padding: '0.45rem 0.9rem',
                  background: '#EFF6FF',
                  border: '1px solid #DBEAFE',
                  color: '#2563eb',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                <i className="fas fa-check-double" style={{ marginRight: '4px' }}></i> Select All
              </button>
              <button 
                type="button" 
                onClick={() => handleSelectAllSubjects(false)}
                style={{
                  padding: '0.45rem 0.9rem',
                  background: '#FEF2F2',
                  border: '1px solid #FEE2E2',
                  color: '#EF4444',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                <i className="fas fa-times" style={{ marginRight: '4px' }}></i> Clear All
              </button>

              {!isSelectedCT && classAdvisorAssignment?.teacherId && (
                <button 
                  type="button" 
                  onClick={handleAssignAllToAdvisor}
                  style={{
                    padding: '0.45rem 0.9rem',
                    background: '#F5F3FF',
                    border: '1px solid #DDD6FE',
                    color: '#7c3aed',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                  title="Assign all checked subjects to the Class Advisor"
                >
                  <i className="fas fa-wand-magic-sparkles" style={{ marginRight: '4px' }}></i> Assign All to Advisor
                </button>
              )}
            </div>
          </div>

          {/* Subjects Grid */}
          <div className="assigner-subjects-grid">
            {filteredSubjects.length > 0 ? (
              filteredSubjects.map(s => {
                const isAssigned = assignedSubjectIds.has(Number(s.id));
                const assignment = (allAssignments || []).find(
                  a => a.classId === Number(selectedSetupClass) && a.subjectId === Number(s.id)
                );
                const currentTeacherId = assignment?.teacherId || '';

                return (
                  <div 
                    key={s.id} 
                    style={{ 
                      padding: '1.25rem', 
                      borderRadius: '14px',
                      background: isAssigned ? '#FFFFFF' : '#FAFAFA',
                      border: `1.5px solid ${isAssigned ? '#2563eb' : '#E4E4E7'}`,
                      boxShadow: isAssigned ? '0 4px 14px rgba(37, 99, 235, 0.08)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <label 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        style={{ width: '18px', height: '18px', accentColor: '#2563eb', cursor: 'pointer' }}
                        checked={isAssigned}
                        onChange={(e) => handleToggleSubject(s.id, e.target.checked)}
                      />
                      <span style={{ 
                        fontSize: '0.92rem', 
                        fontWeight: isAssigned ? 800 : 600, 
                        color: isAssigned ? '#09090b' : '#71717a'
                      }}>
                        {s.name}
                      </span>
                    </label>

                    {/* Specialized Teacher Assigner Dropdown in Subject Teacher Mode */}
                    {!isSelectedCT && isAssigned && (
                      <div style={{ marginTop: '2px', borderTop: '1px dashed #E4E4E7', paddingTop: '10px' }}>
                        <div style={{ 
                          fontSize: '0.68rem', 
                          color: '#71717a', 
                          marginBottom: '4px', 
                          fontWeight: 700, 
                          textTransform: 'uppercase'
                        }}>
                          Subject Specialist:
                        </div>
                        <select
                          className="form-input"
                          style={{ 
                            width: '100%',
                            fontSize: '0.78rem', 
                            padding: '0.45rem 0.65rem', 
                            background: '#FAFAFA',
                            border: '1px solid #E4E4E7',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#09090b',
                            fontWeight: 600
                          }}
                          value={currentTeacherId}
                          onChange={(e) => handleAssignTeacher(selectedSetupClass, s.id, e.target.value)}
                        >
                          <option value="">-- Unassigned --</option>
                          {(teachers || []).map(t => (
                            <option key={t.id} value={t.id}>{t.fullName}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 1rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', color: '#71717a' }}>
                <i className="fas fa-book-open" style={{ fontSize: '2.5rem', color: '#A1A1AA', marginBottom: '0.75rem', display: 'block' }}></i>
                <h4 style={{ margin: '0 0 4px', color: '#09090b', fontSize: '1rem' }}>No Subjects Found</h4>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Create subjects in the Subjects Catalog tab to map them here.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '4rem 1.5rem',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E4E4E7',
          color: '#71717a'
        }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#EFF6FF', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', margin: '0 auto 1rem' }}>
            <i className="fas fa-layer-group"></i>
          </div>
          <h3 style={{ margin: '0 0 4px', color: '#09090b', fontSize: '1.1rem', fontWeight: 800 }}>Choose a Class Above</h3>
          <p style={{ margin: '0 auto', maxWidth: '400px', fontSize: '0.85rem' }}>
            Click on any class stream in the selector above to manage its active subjects and assign teachers.
          </p>
        </div>
      )}

      {/* Copy Config Modal */}
      {showCopyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '2rem', maxWidth: '480px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #E4E4E7' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EFF6FF', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', marginBottom: '1rem' }}>
              <i className="fas fa-copy"></i>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#09090b', fontSize: '1.2rem', fontWeight: 800 }}>
              Copy Configuration to {selectedClassDetail?.name}
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: '#71717a', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Choose an existing class to replicate all its assigned subjects and teacher allocations directly to <strong>{selectedClassDetail?.name}</strong>.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>
                Source Class
              </label>
              <select
                className="form-input"
                style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.9rem', background: '#FFFFFF', color: '#09090b' }}
                value={sourceClassToCopy}
                onChange={(e) => setSourceClassToCopy(e.target.value)}
              >
                <option value="">-- Select Source Class --</option>
                {(classes || []).filter(c => c.id !== Number(selectedSetupClass)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowCopyModal(false)}
                style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', background: '#FAFAFA', border: '1px solid #E4E4E7', color: '#71717a', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!sourceClassToCopy || isCopying}
                onClick={handleRunCopy}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', background: '#09090b', border: 'none', color: '#FFFFFF', fontWeight: 700, cursor: !sourceClassToCopy || isCopying ? 'not-allowed' : 'pointer' }}
              >
                {isCopying ? 'Cloning…' : 'Clone Allocation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassSubjectAssigner;
