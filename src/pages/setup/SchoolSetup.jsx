import React from 'react';
import Layout from '../../components/layout/Layout';
import { useSchoolSetup } from './hooks/useSchoolSetup';
import ClassManager from './components/ClassManager';
import SubjectManager from './components/SubjectManager';
import ClassSubjectAssigner from './components/ClassSubjectAssigner';

const SchoolSetup = () => {
  const {
    className,
    setClassName,
    teachingMode,
    setTeachingMode,
    subjectName,
    setSubjectName,
    selectedSetupClass,
    setSelectedSetupClass,
    classes,
    subjects,
    classSubjects,
    teachers,
    allAssignments,
    addClass,
    deleteClass,
    updateClassMode,
    addSubject,
    deleteSubject,
    handleToggleSubject,
    handleSelectAllSubjects,
    handleAssignTeacher
  } = useSchoolSetup();

  return (
    <Layout title="School Setup">
      {/* Inject custom micro-animations & transitions CSS block */}
      <style>{`
        .hover-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: 1px solid var(--border) !important;
        }
        .hover-card:hover {
          transform: translateY(-3px);
          box-shadow: var(--shadow-lg) !important;
          border-color: rgba(13, 148, 136, 0.3) !important;
        }
        .class-row {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .class-row:hover {
          border-color: rgba(13, 148, 136, 0.3) !important;
          background: rgba(13, 148, 136, 0.02) !important;
          transform: translateX(3px);
        }
        .subject-card {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .subject-card:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 24px rgba(13, 148, 136, 0.08) !important;
          border-color: rgba(13, 148, 136, 0.4) !important;
        }
        @media (max-width: 768px) {
          .two-col-grid {
            grid-template-columns: 1fr !important;
            gap: 1.5rem !important;
          }
        }
      `}</style>

      <div className="fade-in">
        {/* Double Column for Classes & Subjects Managers */}
        <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
          <ClassManager 
            classes={classes}
            className={className}
            setClassName={setClassName}
            teachingMode={teachingMode}
            setTeachingMode={setTeachingMode}
            addClass={addClass}
            deleteClass={deleteClass}
            updateClassMode={updateClassMode}
          />
          
          <SubjectManager 
            subjects={subjects}
            subjectName={subjectName}
            setSubjectName={setSubjectName}
            addSubject={addSubject}
            deleteSubject={deleteSubject}
          />
        </div>

        {/* Unified Subject & Teacher Assigner Dashboard */}
        <ClassSubjectAssigner 
          classes={classes}
          subjects={subjects}
          classSubjects={classSubjects}
          teachers={teachers}
          allAssignments={allAssignments}
          selectedSetupClass={selectedSetupClass}
          setSelectedSetupClass={setSelectedSetupClass}
          handleToggleSubject={handleToggleSubject}
          handleSelectAllSubjects={handleSelectAllSubjects}
          handleAssignTeacher={handleAssignTeacher}
        />
      </div>
    </Layout>
  );
};

export default SchoolSetup;
