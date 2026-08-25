import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useSchoolSetup } from './hooks/useSchoolSetup';
import ClassManager from './components/ClassManager';
import SubjectManager from './components/SubjectManager';
import SetupMatrixAudit from './components/SetupMatrixAudit';
import ClassDetailDrawer from './components/ClassDetailDrawer';
import SetupWizard from './components/SetupWizard';

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

const SchoolSetup = () => {
  const [activeTab, setActiveTab] = useState('classes'); // 'classes' | 'subjects' | 'matrix' | 'wizard'
  const [selectedDrawerClass, setSelectedDrawerClass] = useState(null);
  const [runningFastSetup, setRunningFastSetup] = useState(false);
  const navigate = useNavigate();

  const {
    className,
    setClassName,
    teachingMode,
    setTeachingMode,
    classCategory,
    setClassCategory,
    subjectName,
    setSubjectName,
    classes = [],
    subjects = [],
    classSubjects = [],
    teachers = [],
    allAssignments = [],
    addClass,
    deleteClass,
    updateClassMode,
    updateClassCategory,
    addSubject,
    deleteSubject,
    handleToggleSubject,
    handleSelectAllSubjects,
    handleAssignTeacher,
    handleApplySubjectPreset,
    handleApplyClassPreset,
    handleCopyClassConfig
  } = useSchoolSetup();

  // Readiness Metrics
  const totalClasses = classes?.length || 0;
  const totalSubjects = subjects?.length || 0;
  const classesWithSubjects = new Set((classSubjects || []).map(cs => Number(cs.classId))).size;
  const classesWithAdvisors = new Set((allAssignments || []).filter(a => a.subjectId === null).map(a => Number(a.classId))).size;
  const readinessPercent = totalClasses > 0 
    ? Math.round(((classesWithSubjects + classesWithAdvisors) / (totalClasses * 2)) * 100)
    : 0;

  const handleOpenDrawer = (cls) => {
    setSelectedDrawerClass(cls);
  };

  const handleCloseDrawer = () => {
    setSelectedDrawerClass(null);
  };

  const handleNavigateClassInDrawer = (newClassId) => {
    const found = classes.find(c => Number(c.id) === Number(newClassId));
    if (found) {
      setSelectedDrawerClass(found);
    }
  };

  // 1-Click Fast Complete Ghanaian School Setup
  const handleRunFullFastSetup = async () => {
    if (!window.confirm('⚡ Auto-Setup Ghanaian School:\n\n1. Standard Levels (KG 1 – JHS 3)\n2. 11 GES Curriculum Subjects\n3. Enable all subjects across classes\n\nContinue?')) {
      return;
    }
    setRunningFastSetup(true);
    try {
      if (handleApplyClassPreset) {
        await handleApplyClassPreset(STANDARD_CLASSES);
      }
      if (handleApplySubjectPreset) {
        await handleApplySubjectPreset(STANDARD_GES_SUBJECTS);
      }
      alert('🎉 Ghanaian School Setup applied successfully!');
    } catch (err) {
      alert('Setup Notice: ' + err.message);
    } finally {
      setRunningFastSetup(false);
    }
  };

  const tabs = [
    { id: 'classes', label: 'Classes', icon: 'fa-school', count: `${classesWithSubjects}/${totalClasses}` },
    { id: 'subjects', label: 'Subjects', icon: 'fa-book-open', count: totalSubjects },
    { id: 'matrix', label: 'Overview & Audit', icon: 'fa-table-cells', count: readinessPercent >= 80 ? 'Ready' : 'Incomplete' }
  ];

  return (
    <Layout title="School Setup & Structure">
      <style>{`
        .setup-header-banner {
          background: #09090B;
          border-radius: 20px;
          padding: 1.5rem 1.75rem;
          color: #FFFFFF;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1.25rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .setup-metrics-grid {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .setup-tab-bar {
          display: flex;
          gap: 6px;
          background: #FFFFFF;
          padding: 5px;
          border-radius: 14px;
          border: 1px solid #E4E4E7;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .setup-tab-bar::-webkit-scrollbar {
          display: none;
        }
        @media (max-width: 768px) {
          .setup-header-banner {
            padding: 1.25rem 1rem;
            gap: 1rem;
            border-radius: 16px;
          }
          .setup-header-banner h1 {
            font-size: 1.35rem !important;
          }
          .setup-metrics-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .setup-metric-card {
            min-width: unset !important;
            padding: 0.65rem 0.85rem !important;
          }
          .setup-metric-card .metric-val {
            font-size: 1.25rem !important;
          }
          .setup-tab-button {
            padding: 0.55rem 0.95rem !important;
            font-size: 0.82rem !important;
          }
        }
      `}</style>

      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
        
        {/* Premium Dark Banner */}
        <div className="setup-header-banner">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 9px', borderRadius: '999px', background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.35)', color: '#60A5FA', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              <i className="fas fa-shield-halved"></i> Academic Architecture
            </div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.65rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              School Setup
            </h1>
            <p style={{ margin: 0, color: '#A1A1AA', fontSize: '0.84rem', maxWidth: '440px' }}>
              Configure classes, standard curriculum subjects, and teacher assignments.
            </p>

            {/* Quick Action Pills */}
            <div style={{ marginTop: '0.85rem', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleRunFullFastSetup}
                disabled={runningFastSetup}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.25)'
                }}
              >
                <i className="fas fa-bolt"></i>
                <span>{runningFastSetup ? 'Loading...' : '⚡ Auto-Setup GES'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('wizard')}
                style={{
                  padding: '0.5rem 0.95rem',
                  borderRadius: '10px',
                  background: activeTab === 'wizard' ? '#FFFFFF' : 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: activeTab === 'wizard' ? '#09090B' : '#E4E4E7',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <i className="fas fa-wand-magic-sparkles"></i>
                <span>Guided Wizard</span>
              </button>
            </div>
          </div>

          {/* Clean Glassmorphic KPI Cards */}
          <div className="setup-metrics-grid">
            <div className="setup-metric-card" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '95px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>Classes</div>
              <div className="metric-val" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '1px' }}>{totalClasses}</div>
            </div>

            <div className="setup-metric-card" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '95px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>Subjects</div>
              <div className="metric-val" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '1px' }}>{totalSubjects}</div>
            </div>

            <div className="setup-metric-card" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '95px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>Teachers</div>
              <div className="metric-val" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '1px' }}>{teachers?.length || 0}</div>
            </div>

            <div className="setup-metric-card" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '110px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>Readiness</div>
              <div className="metric-val" style={{ fontSize: '1.4rem', fontWeight: 800, color: readinessPercent >= 80 ? '#10B981' : '#F59E0B', marginTop: '1px' }}>
                {readinessPercent}%
              </div>
            </div>
          </div>
        </div>

        {/* Readiness Bridge (Minimalist) */}
        {readinessPercent >= 80 && totalClasses > 0 && activeTab !== 'wizard' && (
          <div style={{
            background: '#F0FDF4',
            borderRadius: '14px',
            border: '1px solid #BBF7D0',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-circle-check" style={{ color: '#16A34A', fontSize: '1.1rem' }}></i>
              <span style={{ fontWeight: 800, color: '#15803D', fontSize: '0.88rem' }}>
                Setup Ready ({readinessPercent}%) — You can now enroll learners or enter scores.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => navigate('/learners')}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  background: '#16A34A',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>+ Add Learners</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/scores')}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                  border: '1px solid #BBF7D0',
                  color: '#15803D',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Score Entry</span>
                <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation Switcher */}
        {activeTab !== 'wizard' && (
          <div className="setup-tab-bar">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className="setup-tab-button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '0.6rem 1.15rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: isActive ? '#09090B' : 'transparent',
                    color: isActive ? '#FFFFFF' : '#71717A',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s'
                  }}
                >
                  <i className={`fas ${tab.icon}`} style={{ color: isActive ? '#2563EB' : '#A1A1AA' }}></i>
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      background: isActive ? 'rgba(255,255,255,0.2)' : '#F4F4F5',
                      color: isActive ? '#FFFFFF' : '#71717A',
                      fontWeight: 800
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab Content Rendering */}
        <div className="fade-in">
          {activeTab === 'classes' && (
            <ClassManager 
              classes={classes}
              className={className}
              setClassName={setClassName}
              teachingMode={teachingMode}
              setTeachingMode={setTeachingMode}
              classCategory={classCategory}
              setClassCategory={setClassCategory}
              addClass={addClass}
              deleteClass={deleteClass}
              updateClassMode={updateClassMode}
              updateClassCategory={updateClassCategory}
              classSubjects={classSubjects}
              teachers={teachers}
              allAssignments={allAssignments}
              onApplyClassPreset={handleApplyClassPreset}
              onOpenClassDrawer={handleOpenDrawer}
            />
          )}

          {activeTab === 'subjects' && (
            <SubjectManager 
              subjects={subjects}
              subjectName={subjectName}
              setSubjectName={setSubjectName}
              addSubject={addSubject}
              deleteSubject={deleteSubject}
              classSubjects={classSubjects}
              onApplySubjectPreset={handleApplySubjectPreset}
            />
          )}

          {activeTab === 'matrix' && (
            <SetupMatrixAudit
              classes={classes}
              subjects={subjects}
              classSubjects={classSubjects}
              teachers={teachers}
              allAssignments={allAssignments}
              onSelectClassToEdit={handleOpenDrawer}
            />
          )}

          {activeTab === 'wizard' && (
            <SetupWizard
              classes={classes}
              subjects={subjects}
              classSubjects={classSubjects}
              teachers={teachers}
              allAssignments={allAssignments}
              onApplyClassPreset={handleApplyClassPreset}
              onApplySubjectPreset={handleApplySubjectPreset}
              onOpenClassDrawer={handleOpenDrawer}
              handleSelectAllSubjects={handleSelectAllSubjects}
              onExitWizard={() => setActiveTab('classes')}
            />
          )}
        </div>

        {/* Unified Class Detail Slide-Over Drawer */}
        <ClassDetailDrawer
          isOpen={Boolean(selectedDrawerClass)}
          onClose={handleCloseDrawer}
          targetClass={selectedDrawerClass}
          classes={classes}
          subjects={subjects}
          classSubjects={classSubjects}
          teachers={teachers}
          allAssignments={allAssignments}
          updateClassMode={updateClassMode}
          updateClassCategory={updateClassCategory}
          handleToggleSubject={handleToggleSubject}
          handleSelectAllSubjects={handleSelectAllSubjects}
          handleAssignTeacher={handleAssignTeacher}
          handleCopyClassConfig={handleCopyClassConfig}
          onNavigateClass={handleNavigateClassInDrawer}
        />

      </div>
    </Layout>
  );
};

export default SchoolSetup;
