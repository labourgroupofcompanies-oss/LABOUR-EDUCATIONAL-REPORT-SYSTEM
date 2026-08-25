import React, { useState } from 'react';

const SetupMatrixAudit = ({
  classes = [],
  subjects = [],
  classSubjects = [],
  teachers = [],
  allAssignments = [],
  onSelectClassToEdit
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'needs_teacher' | 'needs_subjects' | 'ready'

  const filteredClasses = (classes || []).filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const classIdNum = Number(c.id);
    const subCount = classSubjects.filter(cs => Number(cs.classId) === classIdNum).length;
    const advisor = allAssignments.find(a => Number(a.classId) === classIdNum && a.subjectId === null);
    
    if (filterStatus === 'needs_teacher') {
      return matchesSearch && !advisor;
    }
    if (filterStatus === 'needs_subjects') {
      return matchesSearch && subCount === 0;
    }
    if (filterStatus === 'ready') {
      return matchesSearch && subCount > 0 && advisor;
    }
    return matchesSearch;
  });

  // KPI calculations
  const totalClasses = classes.length;
  const classesWithSubjects = new Set(classSubjects.map(cs => Number(cs.classId))).size;
  const classesWithAdvisors = new Set(allAssignments.filter(a => a.subjectId === null).map(a => Number(a.classId))).size;
  const missingAdvisorCount = Math.max(0, totalClasses - classesWithAdvisors);
  const missingSubjectsCount = Math.max(0, totalClasses - classesWithSubjects);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`
        .matrix-audit-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          text-align: left;
        }
        .matrix-audit-table th {
          background: #F8FAFC;
          padding: 0.85rem 1rem;
          font-size: 0.78rem;
          font-weight: 800;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #E2E8F0;
        }
        .matrix-audit-table td {
          padding: 1rem;
          font-size: 0.85rem;
          border-bottom: 1px solid #F1F5F9;
          vertical-align: middle;
        }
        .matrix-audit-table tr:hover td {
          background: #F8FAFC;
        }
        @media (max-width: 768px) {
          .matrix-desktop-view {
            display: none !important;
          }
          .matrix-mobile-view {
            display: flex !important;
          }
        }
        @media (min-width: 769px) {
          .matrix-mobile-view {
            display: none !important;
          }
        }
      `}</style>

      {/* Diagnostics Health Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '1rem 1.25rem',
          border: '1px solid #E4E4E7',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            <i className="fas fa-school"></i>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 700, textTransform: 'uppercase' }}>Total Classes</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#09090B' }}>{totalClasses}</div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '1rem 1.25rem',
          border: '1px solid #E4E4E7',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: missingAdvisorCount === 0 ? '#F0FDF4' : '#FFFBEB', color: missingAdvisorCount === 0 ? '#16A34A' : '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            <i className={`fas ${missingAdvisorCount === 0 ? 'fa-check' : 'fa-triangle-exclamation'}`}></i>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 700, textTransform: 'uppercase' }}>Missing Form Masters</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: missingAdvisorCount === 0 ? '#16A34A' : '#D97706' }}>
              {missingAdvisorCount}
            </div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '1rem 1.25rem',
          border: '1px solid #E4E4E7',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: missingSubjectsCount === 0 ? '#F0FDF4' : '#FEF2F2', color: missingSubjectsCount === 0 ? '#16A34A' : '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            <i className={`fas ${missingSubjectsCount === 0 ? 'fa-book-open' : 'fa-circle-xmark'}`}></i>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 700, textTransform: 'uppercase' }}>Classes with 0 Subjects</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: missingSubjectsCount === 0 ? '#16A34A' : '#DC2626' }}>
              {missingSubjectsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        padding: '1rem 1.25rem',
        border: '1px solid #E4E4E7',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.85rem' }}></i>
          <input
            type="text"
            placeholder="Search audit matrix..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 0.85rem 0.55rem 2.25rem',
              borderRadius: '10px',
              border: '1px solid #E4E4E7',
              fontSize: '0.85rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Classes' },
            { id: 'ready', label: '✅ Fully Ready' },
            { id: 'needs_teacher', label: '⚠️ Needs Form Master' },
            { id: 'needs_subjects', label: '🔴 No Subjects' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterStatus(f.id)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: filterStatus === f.id ? '1px solid #09090B' : '1px solid #E4E4E7',
                background: filterStatus === f.id ? '#09090B' : '#FFFFFF',
                color: filterStatus === f.id ? '#FFFFFF' : '#71717A',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Audit Table */}
      <div className="matrix-desktop-view" style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E4E4E7',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <table className="matrix-audit-table">
          <thead>
            <tr>
              <th>Class Stream</th>
              <th>Teaching Model</th>
              <th>Form Master / Class Teacher</th>
              <th>Active Subjects &amp; Allocation</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClasses.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2.5rem', color: '#71717A' }}>
                  No classes match current filter.
                </td>
              </tr>
            ) : (
              filteredClasses.map(c => {
                const classIdNum = Number(c.id);
                const isSpecialist = c.teachingMode === 'subject_teacher';
                const activeSubs = classSubjects.filter(cs => Number(cs.classId) === classIdNum);
                const advisor = allAssignments.find(a => Number(a.classId) === classIdNum && a.subjectId === null);
                const teacherObj = advisor ? teachers.find(t => t.id === advisor.teacherId) : null;

                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 800, color: '#09090B', fontSize: '0.95rem' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#71717A' }}>
                        {c.category || 'Basic'}
                      </div>
                    </td>

                    <td>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: isSpecialist ? '#FAF5FF' : '#EFF6FF',
                        color: isSpecialist ? '#7E22CE' : '#1D4ED8',
                        border: isSpecialist ? '1px solid #E9D5FF' : '1px solid #BFDBFE'
                      }}>
                        {isSpecialist ? 'Specialist Mode' : 'Class Teacher'}
                      </span>
                    </td>

                    <td>
                      {teacherObj ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803D', fontWeight: 700 }}>
                          <i className="fas fa-circle-check" style={{ fontSize: '0.85rem' }}></i>
                          <span>{teacherObj.fullName || teacherObj.name}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#D97706', fontWeight: 700 }}>
                          <i className="fas fa-triangle-exclamation" style={{ fontSize: '0.85rem' }}></i>
                          <span>Unassigned</span>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '380px' }}>
                        {activeSubs.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 700 }}>
                            ⚠️ No subjects linked
                          </span>
                        ) : (
                          activeSubs.map(cs => {
                            const subObj = subjects.find(s => Number(s.id) === Number(cs.subjectId));
                            if (!subObj) return null;
                            const specialistAssign = allAssignments.find(a => Number(a.classId) === classIdNum && Number(a.subjectId) === Number(cs.subjectId));
                            const specialistTeacher = specialistAssign ? teachers.find(t => t.id === specialistAssign.teacherId) : null;

                            return (
                              <span
                                key={cs.id || cs.subjectId}
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: '#F1F5F9',
                                  border: '1px solid #E2E8F0',
                                  color: '#0F172A',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <span>{subObj.name}</span>
                                {isSpecialist && (
                                  <span style={{ color: specialistTeacher ? '#15803D' : '#D97706', fontWeight: 700 }}>
                                    • {specialistTeacher ? specialistTeacher.fullName?.split(' ')[0] : 'None'}
                                  </span>
                                )}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => onSelectClassToEdit && onSelectClassToEdit(c)}
                        style={{
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          background: '#09090B',
                          border: 'none',
                          color: '#FFFFFF',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Manage Class
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Audit View */}
      <div className="matrix-mobile-view" style={{ flexDirection: 'column', gap: '0.85rem' }}>
        {filteredClasses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E4E4E7', color: '#71717A' }}>
            No classes found for selected filter.
          </div>
        ) : (
          filteredClasses.map(c => {
            const classIdNum = Number(c.id);
            const isSpecialist = c.teachingMode === 'subject_teacher';
            const activeSubs = classSubjects.filter(cs => Number(cs.classId) === classIdNum);
            const advisor = allAssignments.find(a => Number(a.classId) === classIdNum && a.subjectId === null);
            const teacherObj = advisor ? teachers.find(t => t.id === advisor.teacherId) : null;

            return (
              <div
                key={c.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  padding: '1.1rem',
                  border: '1px solid #E4E4E7',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 2px', fontSize: '1.05rem', fontWeight: 800, color: '#09090B' }}>
                      {c.name}
                    </h3>
                    <div style={{ fontSize: '0.75rem', color: '#71717A' }}>
                      {c.category || 'Basic'} • {isSpecialist ? 'Specialist Mode' : 'Class Teacher'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectClassToEdit && onSelectClassToEdit(c)}
                    style={{
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      background: '#09090B',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Manage Class
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                  <div>
                    Form Master: <strong>{teacherObj ? (teacherObj.fullName || teacherObj.name) : <span style={{ color: '#D97706' }}>⚠️ Unassigned</span>}</strong>
                  </div>
                  <div>
                    Subjects: <strong>{activeSubs.length > 0 ? `${activeSubs.length} active subjects` : <span style={{ color: '#DC2626' }}>⚠️ 0 linked</span>}</strong>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SetupMatrixAudit;
