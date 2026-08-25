import React, { useState } from 'react';

const STANDARD_GES_SUBJECTS = [
  'Mathematics',
  'English Language',
  'Ghanaian Language & Culture',
  'Integrated Science',
  'Social Studies',
  'Computing',
  'Religious & Moral Education (RME)',
  'Creative Arts & Design',
  'Career Technology',
  'French',
  'Physical & Health Education'
];

const SubjectManager = ({
  subjects = [],
  subjectName,
  setSubjectName,
  addSubject,
  deleteSubject,
  classSubjects = [],
  onApplySubjectPreset
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [addingPreset, setAddingPreset] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const filteredSubjects = (subjects || []).filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRunPreset = async () => {
    if (!onApplySubjectPreset) return;
    setAddingPreset(true);
    try {
      const added = await onApplySubjectPreset(STANDARD_GES_SUBJECTS);
      setShowPresetModal(false);
      if (added > 0) {
        alert(`Imported ${added} standard GES subject(s)!`);
      } else {
        alert('All standard GES subjects are already present in your catalog.');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setAddingPreset(false);
    }
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!subjectName?.trim()) return;
    try {
      await addSubject(e);
      setSubjectName('');
      setIsAddingNew(false);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`
        .subject-card {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          border-radius: 16px;
          padding: 1.1rem 1.25rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 0.75rem;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .subject-card:hover {
          border-color: #CBD5E1;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        @media (max-width: 640px) {
          .subject-top-bar {
            flex-direction: column !important;
            align-items: stretch !important;
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
        <div className="subject-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#09090B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-book-open" style={{ color: '#9333EA', fontSize: '1rem' }}></i>
              Subjects Catalog
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                background: '#FAF5FF',
                border: '1px solid #E9D5FF',
                color: '#7E22CE',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <i className="fas fa-download"></i>
              <span>Load GES Subjects</span>
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
              <span>{isAddingNew ? 'Close' : 'Add Subject'}</span>
            </button>
          </div>
        </div>

        {/* Inline Add Subject Form */}
        {isAddingNew && (
          <form
            onSubmit={handleQuickAdd}
            style={{
              background: '#FAF5FF',
              borderRadius: '12px',
              padding: '0.9rem',
              border: '1px solid #E9D5FF',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem'
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Subject name (e.g. Arabic, Music, French)..."
                value={subjectName}
                onChange={e => setSubjectName(e.target.value)}
                required
                autoFocus
                style={{
                  flex: '1 1 220px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #D8B4FE',
                  fontSize: '0.82rem',
                  outline: 'none',
                  background: '#FFFFFF'
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  background: '#9333EA',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.8rem' }}></i>
          <input
            type="text"
            placeholder="Search subjects..."
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
      </div>

      {/* Subjects Grid */}
      {filteredSubjects.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2.5rem 1.5rem',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E4E4E7',
          color: '#71717A'
        }}>
          <i className="fas fa-book-open" style={{ fontSize: '2rem', color: '#D4D4D8', marginBottom: '10px' }}></i>
          <h3 style={{ margin: '0 0 4px', fontWeight: 800, color: '#09090B' }}>No subjects found</h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#A1A1AA' }}>
            {searchTerm ? `No subjects match "${searchTerm}"` : 'Populate catalog with official GES subjects.'}
          </p>
          <button
            type="button"
            onClick={() => setShowPresetModal(true)}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              background: '#9333EA',
              border: 'none',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            📚 Load GES Subjects
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))',
          gap: '0.85rem'
        }}>
          {filteredSubjects.map(sub => {
            const subIdNum = Number(sub.id);
            const classesOffering = classSubjects.filter(cs => Number(cs.subjectId) === subIdNum).length;

            return (
              <div key={sub.id} className="subject-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      background: '#FAF5FF',
                      color: '#9333EA',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem'
                    }}>
                      <i className="fas fa-book"></i>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (classesOffering > 0) {
                          if (!window.confirm(`"${sub.name}" is assigned to ${classesOffering} class stream(s). Delete anyway?`)) {
                            return;
                          }
                        } else {
                          if (!window.confirm(`Delete "${sub.name}"?`)) {
                            return;
                          }
                        }
                        await deleteSubject(sub.id);
                      }}
                      title="Delete Subject"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        padding: '3px 5px',
                        borderRadius: '5px',
                        fontSize: '0.8rem'
                      }}
                    >
                      <i className="fas fa-trash-can"></i>
                    </button>
                  </div>

                  <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 800, color: '#09090B' }}>
                    {sub.name}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#71717A' }}>
                    {classesOffering > 0 ? (
                      <span style={{ color: '#16A34A', fontWeight: 700 }}>
                        <i className="fas fa-check" style={{ marginRight: '3px' }}></i>
                        {classesOffering} class{classesOffering === 1 ? '' : 'es'}
                      </span>
                    ) : (
                      <span style={{ color: '#A1A1AA' }}>
                        Not linked yet
                      </span>
                    )}
                  </div>
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
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#FAF5FF', color: '#9333EA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                <i className="fas fa-download"></i>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#09090B' }}>
                  Load GES Subjects
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#71717A' }}>
                  National Curriculum Catalog
                </p>
              </div>
            </div>

            <div style={{
              background: '#FAF5FF',
              borderRadius: '10px',
              padding: '0.75rem',
              border: '1px solid #E9D5FF',
              maxHeight: '140px',
              overflowY: 'auto',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {STANDARD_GES_SUBJECTS.map(sn => (
                  <span key={sn} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#FFFFFF', border: '1px solid #D8B4FE', color: '#6B21A8' }}>
                    {sn}
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
                  background: '#9333EA',
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

export default SubjectManager;
