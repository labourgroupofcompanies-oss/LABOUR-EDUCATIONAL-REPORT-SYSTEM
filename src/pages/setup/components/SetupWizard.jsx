import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

const SetupWizard = ({
  classes = [],
  subjects = [],
  classSubjects = [],
  teachers = [],
  allAssignments = [],
  onApplyClassPreset,
  onApplySubjectPreset,
  onOpenClassDrawer,
  handleSelectAllSubjects,
  onExitWizard
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loadingPreset, setLoadingPreset] = useState(false);
  const navigate = useNavigate();

  const totalClasses = classes.length;
  const totalSubjects = subjects.length;
  const classesWithSubjects = new Set(classSubjects.map(cs => cs.classId)).size;
  const classesWithAdvisors = new Set(allAssignments.filter(a => a.subjectId === null).map(a => a.classId)).size;

  const handleRunClassesPreset = async () => {
    if (!onApplyClassPreset) return;
    setLoadingPreset(true);
    try {
      const count = await onApplyClassPreset(STANDARD_CLASSES);
      alert(`Successfully added ${count} standard Ghanaian class stream(s)!`);
    } catch (e) {
      alert('Error importing classes: ' + e.message);
    } finally {
      setLoadingPreset(false);
    }
  };

  const handleRunSubjectsPreset = async () => {
    if (!onApplySubjectPreset) return;
    setLoadingPreset(true);
    try {
      const count = await onApplySubjectPreset(STANDARD_GES_SUBJECTS);
      alert(`Successfully added ${count} standard GES curriculum subject(s)!`);
    } catch (e) {
      alert('Error importing subjects: ' + e.message);
    } finally {
      setLoadingPreset(false);
    }
  };

  const handleLinkAllSubjectsToAllClasses = async () => {
    if (classes.length === 0 || subjects.length === 0) {
      alert('Please ensure you have classes and subjects added first.');
      return;
    }
    setLoadingPreset(true);
    try {
      for (const c of classes) {
        await handleSelectAllSubjects(Number(c.id), true);
      }
      alert('Successfully enabled all curriculum subjects across all classes!');
    } catch (e) {
      alert('Error linking subjects: ' + e.message);
    } finally {
      setLoadingPreset(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
      <style>{`
        .wizard-step-bubble {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.9rem;
          transition: all 0.2s;
        }
        .wizard-step-bubble.active {
          background: #2563EB;
          color: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2);
        }
        .wizard-step-bubble.completed {
          background: #10B981;
          color: #FFFFFF;
        }
        .wizard-step-bubble.upcoming {
          background: #E4E4E7;
          color: #71717A;
        }
        @media (max-width: 640px) {
          .wizard-steps-header {
            gap: 8px !important;
          }
          .wizard-step-label {
            display: none !important;
          }
        }
      `}</style>

      {/* Wizard Progress Stepper */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        padding: '1.25rem 1.5rem',
        border: '1px solid #E4E4E7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Guided Setup Wizard
            </span>
            <h2 style={{ margin: '2px 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#09090B' }}>
              Step {currentStep} of 4: {
                currentStep === 1 ? 'Academic Classes' :
                currentStep === 2 ? 'Subjects Catalog' :
                currentStep === 3 ? 'Class Teachers & Allocations' : 'Review & Finish'
              }
            </h2>
          </div>
          <button
            type="button"
            onClick={onExitWizard}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: '#F4F4F5',
              border: 'none',
              color: '#71717A',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Switch to Standard View
          </button>
        </div>

        {/* Stepper Dots & Line */}
        <div className="wizard-steps-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          {[
            { num: 1, label: 'Classes', done: totalClasses > 0 },
            { num: 2, label: 'Subjects', done: totalSubjects > 0 },
            { num: 3, label: 'Allocations', done: classesWithSubjects > 0 && classesWithAdvisors > 0 },
            { num: 4, label: 'Ready', done: totalClasses > 0 && classesWithSubjects === totalClasses }
          ].map((s, idx) => {
            const isCurrent = currentStep === s.num;
            const isCompleted = currentStep > s.num || (s.done && currentStep !== s.num);
            return (
              <React.Fragment key={s.num}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  onClick={() => setCurrentStep(s.num)}
                >
                  <div className={`wizard-step-bubble ${isCurrent ? 'active' : isCompleted ? 'completed' : 'upcoming'}`}>
                    {isCompleted ? <i className="fas fa-check"></i> : s.num}
                  </div>
                  <span className="wizard-step-label" style={{
                    fontSize: '0.85rem',
                    fontWeight: isCurrent ? 800 : 600,
                    color: isCurrent ? '#09090B' : '#71717A'
                  }}>
                    {s.label}
                  </span>
                </div>
                {idx < 3 && (
                  <div style={{
                    flex: 1,
                    height: '2px',
                    margin: '0 8px',
                    background: currentStep > s.num ? '#10B981' : '#E4E4E7'
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Content Container */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        padding: '1.75rem',
        border: '1px solid #E4E4E7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
      }}>

        {/* ── STEP 1: CLASSES ── */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
                <i className="fas fa-school"></i>
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800, color: '#09090B' }}>
                  Set up your School's Classes &amp; Streams
                </h3>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#71717A', lineHeight: 1.5 }}>
                  Add your school levels (KG 1 to JHS 3). You can load the official Ghanaian standard levels in 1 click or customize streams.
                </p>
              </div>
            </div>

            {/* Fast Action Card */}
            <div style={{
              background: '#F0F9FF',
              borderRadius: '14px',
              border: '1px solid #BAE6FD',
              padding: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0369A1', fontSize: '0.95rem', marginBottom: '2px' }}>
                  ⚡ 1-Click Ghana Standard Basic School Setup
                </div>
                <div style={{ fontSize: '0.82rem', color: '#0284C7' }}>
                  Automatically adds KG 1, KG 2, Basic 1–6, and JHS 1–3 with correct billing tiers and teaching modes.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunClassesPreset}
                disabled={loadingPreset}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: '10px',
                  background: '#0284C7',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <i className="fas fa-magic"></i>
                {loadingPreset ? 'Loading...' : 'Load Standard Classes'}
              </button>
            </div>

            {/* Current Classes Preview Chips */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#09090B', marginBottom: '8px' }}>
                Your Registered Classes ({totalClasses}):
              </div>
              {totalClasses === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1', color: '#71717A' }}>
                  No classes added yet. Click <strong>"Load Standard Classes"</strong> above to get started instantly.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {classes.map(c => (
                    <div
                      key={c.id}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#0F172A',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <i className="fas fa-check-circle" style={{ color: '#10B981', fontSize: '0.75rem' }}></i>
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: SUBJECTS ── */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FAF5FF', color: '#9333EA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
                <i className="fas fa-book-open"></i>
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800, color: '#09090B' }}>
                  Curriculum Subjects Catalog
                </h3>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#71717A', lineHeight: 1.5 }}>
                  Define which academic subjects are taught in your school. Load all official GES curriculum subjects in 1 click.
                </p>
              </div>
            </div>

            {/* Fast Action Card */}
            <div style={{
              background: '#FAF5FF',
              borderRadius: '14px',
              border: '1px solid #E9D5FF',
              padding: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <div style={{ fontWeight: 800, color: '#7E22CE', fontSize: '0.95rem', marginBottom: '2px' }}>
                  📚 1-Click Official GES Subjects Import
                </div>
                <div style={{ fontSize: '0.82rem', color: '#9333EA' }}>
                  Imports Mathematics, English, Science, Social Studies, Computing, RME, Creative Arts, French, and more.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunSubjectsPreset}
                disabled={loadingPreset}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: '10px',
                  background: '#9333EA',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <i className="fas fa-download"></i>
                {loadingPreset ? 'Importing...' : 'Load GES Subjects'}
              </button>
            </div>

            {/* Current Subjects Preview Chips */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#09090B', marginBottom: '8px' }}>
                Catalog Subjects ({totalSubjects}):
              </div>
              {totalSubjects === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1', color: '#71717A' }}>
                  No subjects registered yet. Click <strong>"Load GES Subjects"</strong> above to populate your catalog.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {subjects.map(s => (
                    <div
                      key={s.id}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: '#FAF5FF',
                        border: '1px solid #E9D5FF',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#6B21A8',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <i className="fas fa-book" style={{ fontSize: '0.75rem' }}></i>
                      {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: ALLOCATIONS & FORM MASTERS ── */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
                <i className="fas fa-layer-group"></i>
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800, color: '#09090B' }}>
                  Assign Subjects &amp; Class Form Masters
                </h3>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#71717A', lineHeight: 1.5 }}>
                  Link subjects to each class and designate Form Masters for report remarks.
                </p>
              </div>
            </div>

            {/* Quick Bulk Link Action */}
            <div style={{
              background: '#F0FDF4',
              borderRadius: '14px',
              border: '1px solid #BBF7D0',
              padding: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <div style={{ fontWeight: 800, color: '#15803D', fontSize: '0.95rem', marginBottom: '2px' }}>
                  ⚡ Fast-Track: Enable All Subjects on All Classes
                </div>
                <div style={{ fontSize: '0.82rem', color: '#166534' }}>
                  Instantly activates all catalog subjects across all registered class streams.
                </div>
              </div>
              <button
                type="button"
                onClick={handleLinkAllSubjectsToAllClasses}
                disabled={loadingPreset}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: '10px',
                  background: '#16A34A',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                <i className="fas fa-check-double" style={{ marginRight: '6px' }}></i>
                Enable All Subjects
              </button>
            </div>

            {/* Class Stream List to Configure */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#09090B', marginBottom: '8px' }}>
                Click any class below to assign its Form Master &amp; fine-tune subjects:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {classes.map(c => {
                  const subCount = classSubjects.filter(cs => Number(cs.classId) === Number(c.id)).length;
                  const advisor = allAssignments.find(a => Number(a.classId) === Number(c.id) && a.subjectId === null);
                  const teacherName = advisor ? teachers.find(t => t.id === advisor.teacherId)?.fullName : null;

                  return (
                    <div
                      key={c.id}
                      onClick={() => onOpenClassDrawer && onOpenClassDrawer(c)}
                      style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        background: '#FFFFFF',
                        border: '1px solid #E4E4E7',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#09090B' }}>{c.name}</span>
                        <i className="fas fa-sliders" style={{ color: '#2563EB', fontSize: '0.85rem' }}></i>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#71717A' }}>
                        {subCount} Subjects • {teacherName ? `Master: ${teacherName}` : <span style={{ color: '#D97706', fontWeight: 700 }}>⚠️ No Form Master</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: REVIEW & FINISH ── */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', margin: '0 auto' }}>
              <i className="fas fa-circle-check"></i>
            </div>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 800, color: '#09090B' }}>
                🎉 School Setup Completed!
              </h3>
              <p style={{ margin: '0 auto', maxWidth: '480px', fontSize: '0.9rem', color: '#71717A', lineHeight: 1.5 }}>
                Your academic structure is now ready. You have configured <strong>{totalClasses} classes</strong>, <strong>{totalSubjects} subjects</strong>, and linked teacher allocations.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', textAlign: 'left', marginTop: '0.5rem' }}>
              <div
                onClick={() => navigate('/learners')}
                style={{
                  padding: '1.25rem',
                  borderRadius: '14px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <i className="fas fa-user-graduate" style={{ color: '#2563EB', fontSize: '1.1rem' }}></i>
                  <span style={{ fontWeight: 800, color: '#1D4ED8', fontSize: '0.95rem' }}>Add Learners Roster</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#1E40AF' }}>
                  Enroll learners and assign them to your configured class streams.
                </p>
              </div>

              <div
                onClick={() => navigate('/scores')}
                style={{
                  padding: '1.25rem',
                  borderRadius: '14px',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <i className="fas fa-pen-to-square" style={{ color: '#16A34A', fontSize: '1.1rem' }}></i>
                  <span style={{ fontWeight: 800, color: '#15803D', fontSize: '0.95rem' }}>Terminal Score Entry</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534' }}>
                  Enter class assessment and exam scores for terminal report cards.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Navigation Action Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #E4E4E7',
          paddingTop: '1.25rem',
          marginTop: '1.5rem'
        }}>
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(prev => prev - 1)}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                background: '#F4F4F5',
                border: '1px solid #E4E4E7',
                color: '#09090B',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <i className="fas fa-arrow-left"></i>
              Back
            </button>
          ) : (
            <div />
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(prev => prev + 1)}
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '10px',
                background: '#2563EB',
                border: 'none',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Next Step: {
                currentStep === 1 ? 'Subjects' :
                currentStep === 2 ? 'Allocations' : 'Finish'
              }
              <i className="fas fa-arrow-right"></i>
            </button>
          ) : (
            <button
              type="button"
              onClick={onExitWizard}
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '10px',
                background: '#09090B',
                border: 'none',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              Return to Setup Dashboard
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default SetupWizard;
