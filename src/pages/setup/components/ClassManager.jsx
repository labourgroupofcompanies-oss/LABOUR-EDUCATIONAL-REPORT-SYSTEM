import React, { useState } from 'react';

const STANDARD_CLASSES = [
  { name: 'KG 1', category: 'early grade', teachingMode: 'class_teacher' },
  { name: 'KG 2', category: 'early grade', teachingMode: 'class_teacher' },
  { name: 'Basic 1', category: 'basic 1-3', teachingMode: 'class_teacher' },
  { name: 'Basic 2', category: 'basic 1-3', teachingMode: 'class_teacher' },
  { name: 'Basic 3', category: 'basic 1-3', teachingMode: 'class_teacher' },
  { name: 'Basic 4', category: 'basic 4-6', teachingMode: 'class_teacher' },
  { name: 'Basic 5', category: 'basic 4-6', teachingMode: 'class_teacher' },
  { name: 'Basic 6', category: 'basic 4-6', teachingMode: 'class_teacher' },
  { name: 'JHS 1 (Basic 7)', category: 'basic 7-9', teachingMode: 'subject_teacher' },
  { name: 'JHS 2 (Basic 8)', category: 'basic 7-9', teachingMode: 'subject_teacher' },
  { name: 'JHS 3 (Basic 9)', category: 'basic 7-9', teachingMode: 'subject_teacher' }
];

const ClassManager = ({
  classes = [],
  className,
  setClassName,
  teachingMode,
  setTeachingMode,
  classCategory,
  setClassCategory,
  addClass,
  deleteClass,
  updateClassMode,
  updateClassCategory,
  classSubjects = [],
  teachers = [],
  allAssignments = [],
  onApplyClassPreset,
  onOpenClassDrawer
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [addingPreset, setAddingPreset] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const filteredClasses = (classes || []).filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategoryFilter === 'all' || (c.category || '').toLowerCase() === selectedCategoryFilter.toLowerCase();
    return matchesSearch && matchesCat;
  });

  const handleRunPreset = async () => {
    if (!onApplyClassPreset) return;
    setAddingPreset(true);
    try {
      const added = await onApplyClassPreset(STANDARD_CLASSES);
      setShowPresetModal(false);
      if (added > 0) {
        alert(`Added ${added} Ghanaian class stream(s)!`);
      } else {
        alert('All standard class streams are already present.');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setAddingPreset(false);
    }
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!className?.trim()) return;
    try {
      await addClass(e);
      setClassName('');
      setIsAddingNew(false);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`
        .class-card {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 0.85rem;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .class-card:hover {
          border-color: #CBD5E1;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        .filter-chip {
          padding: 0.4rem 0.85rem;
          border-radius: 999px;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          color: #71717A;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .filter-chip.active {
          background: #09090B;
          color: #FFFFFF;
          border-color: #09090B;
        }
        @media (max-width: 640px) {
          .class-top-bar {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .class-filter-scroll {
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: none;
          }
          .class-filter-scroll::-webkit-scrollbar {
            display: none;
          }
        }
      `}</style>

      {/* Clean Top Toolbar */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        padding: '1.1rem 1.25rem',
        border: '1px solid #E4E4E7',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div className="class-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-school" style={{ color: '#2563EB', fontSize: '1rem' }}></i>
              Class Streams
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#1D4ED8',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <i className="fas fa-magic"></i>
              <span>Standard Levels</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddingNew(prev => !prev)}
              style={{
                padding: '0.5rem 0.95rem',
                borderRadius: '8px',
                background: '#09090B',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <i className={`fas ${isAddingNew ? 'fa-xmark' : 'fa-plus'}`}></i>
              <span>{isAddingNew ? 'Close' : 'Add Class'}</span>
            </button>
          </div>
        </div>

        {/* Inline Add Class Form */}
        {isAddingNew && (
          <form
            onSubmit={handleQuickAdd}
            style={{
              background: '#F8FAFC',
              borderRadius: '12px',
              padding: '0.9rem',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                  Class Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Basic 4B"
                  value={className}
                  onChange={e => {
                    setClassName(e.target.value);
                    const val = e.target.value.toLowerCase();
                    if (val.includes('jhs') || val.includes('basic 7') || val.includes('basic 8') || val.includes('basic 9')) {
                      setClassCategory('basic 7-9');
                      setTeachingMode('subject_teacher');
                    }
                  }}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                  School Tier
                </label>
                <select
                  value={classCategory}
                  onChange={e => setClassCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: '#FFFFFF'
                  }}
                >
                  <option value="early grade">Early Grade (Nursery / KG)</option>
                  <option value="basic 1-3">Lower Primary (Basic 1 - 3)</option>
                  <option value="basic 4-6">Upper Primary (Basic 4 - 6)</option>
                  <option value="basic 7-9">Junior High (Basic 7 - 9)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                  Teaching Model
                </label>
                <select
                  value={teachingMode}
                  onChange={e => setTeachingMode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: '#FFFFFF'
                  }}
                >
                  <option value="class_teacher">Class Teacher Mode (Primary/KG)</option>
                  <option value="subject_teacher">Subject Specialist Mode (JHS)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: '8px',
                  background: '#E2E8F0',
                  border: 'none',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '8px',
                  background: '#2563EB',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Search & Category Filter Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.8rem' }}></i>
            <input
              type="text"
              placeholder="Search classes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.85rem 0.5rem 2.1rem',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                fontSize: '0.82rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div className="class-filter-scroll" style={{ display: 'flex', gap: '6px' }}>
            {[
              { id: 'all', label: 'All Levels' },
              { id: 'early grade', label: 'Early Grade' },
              { id: 'basic 1-3', label: 'Lower Primary' },
              { id: 'basic 4-6', label: 'Upper Primary' },
              { id: 'basic 7-9', label: 'JHS (7-9)' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                className={`filter-chip ${selectedCategoryFilter === f.id ? 'active' : ''}`}
                onClick={() => setSelectedCategoryFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Class Cards Grid */}
      {filteredClasses.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2.5rem 1.5rem',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E4E4E7',
          color: '#71717A'
        }}>
          <i className="fas fa-school" style={{ fontSize: '2rem', color: '#D4D4D8', marginBottom: '10px' }}></i>
          <h3 style={{ margin: '0 0 4px', fontWeight: 800, color: '#09090B' }}>No classes found</h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#A1A1AA' }}>
            {searchTerm ? `No classes match "${searchTerm}"` : 'Get started by loading standard Ghanaian levels.'}
          </p>
          <button
            type="button"
            onClick={() => setShowPresetModal(true)}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              background: '#2563EB',
              border: 'none',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            ⚡ Load Ghanaian Levels
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: '0.85rem'
        }}>
          {filteredClasses.map(c => {
            const classIdNum = Number(c.id);
            const activeSubs = classSubjects.filter(cs => Number(cs.classId) === classIdNum);
            const subCount = activeSubs.length;
            const advisorAssign = allAssignments.find(a => Number(a.classId) === classIdNum && a.subjectId === null);
            const advisorTeacher = advisorAssign ? teachers.find(t => t.id === advisorAssign.teacherId) : null;
            const isSpecialist = c.teachingMode === 'subject_teacher';
            const isFullyReady = subCount > 0 && advisorTeacher;

            return (
              <div key={c.id} className="class-card">
                <div>
                  {/* Card Header: Level & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '1px 6px',
                          borderRadius: '5px',
                          background: isSpecialist ? '#FAF5FF' : '#EFF6FF',
                          color: isSpecialist ? '#7E22CE' : '#1D4ED8',
                          border: isSpecialist ? '1px solid #E9D5FF' : '1px solid #BFDBFE'
                        }}>
                          {isSpecialist ? 'Specialist' : 'Class Teacher'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#A1A1AA', fontWeight: 600 }}>
                          {c.category || 'Basic'}
                        </span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#09090B' }}>
                        {c.name}
                      </h3>
                    </div>

                    {/* Status Pill */}
                    {isFullyReady ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: '#F0FDF4',
                        color: '#15803D',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        border: '1px solid #BBF7D0'
                      }}>
                        <i className="fas fa-circle-check"></i> Ready
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: '#FFFBEB',
                        color: '#B45309',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        border: '1px solid #FDE68A'
                      }}>
                        <i className="fas fa-exclamation-circle"></i> Incomplete
                      </span>
                    )}
                  </div>

                  {/* Summary Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '0.5rem' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.8rem',
                      color: advisorTeacher ? '#1F2937' : '#D97706',
                      background: advisorTeacher ? '#F9FAFB' : '#FFFBEB',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: advisorTeacher ? '1px solid #F3F4F6' : '1px solid #FEF3C7'
                    }}>
                      <i className={`fas ${advisorTeacher ? 'fa-user-tie' : 'fa-triangle-exclamation'}`} style={{ color: advisorTeacher ? '#2563EB' : '#D97706', fontSize: '0.75rem' }}></i>
                      <span>
                        Form Master: <strong>{advisorTeacher ? (advisorTeacher.fullName || advisorTeacher.name) : 'Not Assigned'}</strong>
                      </span>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.8rem',
                      color: subCount > 0 ? '#1F2937' : '#DC2626',
                      background: subCount > 0 ? '#F9FAFB' : '#FEF2F2',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: subCount > 0 ? '1px solid #F3F4F6' : '1px solid #FEE2E2'
                    }}>
                      <i className={`fas ${subCount > 0 ? 'fa-book-open' : 'fa-circle-xmark'}`} style={{ color: subCount > 0 ? '#059669' : '#DC2626', fontSize: '0.75rem' }}></i>
                      <span>
                        Subjects: <strong>{subCount > 0 ? `${subCount} active` : '0 linked'}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', borderTop: '1px solid #F4F4F5', paddingTop: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => onOpenClassDrawer && onOpenClassDrawer(c)}
                    style={{
                      flex: 1,
                      padding: '0.55rem 0.85rem',
                      borderRadius: '8px',
                      background: '#09090B',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <i className="fas fa-sliders"></i>
                    <span>Manage Subjects &amp; Teacher</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(`Delete "${c.name}" and its allocations?`)) {
                        await deleteClass(c.id);
                      }
                    }}
                    title="Delete Class"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: '#FEE2E2',
                      border: 'none',
                      color: '#DC2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    <i className="fas fa-trash-can"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preset Modal */}
      {showPresetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(9, 9, 11, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 10000
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                <i className="fas fa-magic"></i>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#09090B' }}>
                  Load Ghanaian Levels
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#71717A' }}>
                  KG 1 through JHS 3 (Basic 9)
                </p>
              </div>
            </div>

            <div style={{
              background: '#F8FAFC',
              borderRadius: '10px',
              padding: '0.75rem',
              border: '1px solid #E2E8F0',
              maxHeight: '140px',
              overflowY: 'auto',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {STANDARD_CLASSES.map(sc => (
                  <span key={sc.name} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#0F172A' }}>
                    {sc.name}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                disabled={addingPreset}
                style={{
                  padding: '0.55rem 0.95rem',
                  borderRadius: '8px',
                  background: '#F4F4F5',
                  border: 'none',
                  color: '#71717A',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRunPreset}
                disabled={addingPreset}
                style={{
                  padding: '0.55rem 1.15rem',
                  borderRadius: '8px',
                  background: '#2563EB',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: addingPreset ? 'not-allowed' : 'pointer'
                }}
              >
                {addingPreset ? 'Loading...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ClassManager;
