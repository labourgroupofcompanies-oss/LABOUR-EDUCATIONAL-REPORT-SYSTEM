import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { useAuth } from '../../store/AuthContext';

const HeadteacherGuideWidget = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeStepTab, setActiveStepTab] = useState(null);

  // Live queries to auto-detect step completion from local database
  const academicYearsCount = useLiveQuery(() => db.academicYears.count()) || 0;
  const classesCount = useLiveQuery(() => user?.schoolId ? db.classes.filter(c => String(c.schoolId) === String(user.schoolId) || String(c.school_id || '') === String(user.schoolId)).count() : db.classes.count()) || 0;
  const teachersCount = useLiveQuery(
    () => user?.schoolId ? db.profiles.filter(p => (String(p.schoolId) === String(user.schoolId) || String(p.school_id || '') === String(user.schoolId)) && p.role !== 'super_admin').count() : 0,
    [user?.schoolId]
  ) || 0;
  const learnersCount = useLiveQuery(
    () => user?.schoolId ? db.learners.filter(l => String(l.schoolId) === String(user.schoolId) || String(l.school_id || '') === String(user.schoolId)).count() : 0,
    [user?.schoolId]
  ) || 0;
  const scoresCount = useLiveQuery(
    () => user?.schoolId ? db.scores.filter(s => String(s.schoolId) === String(user.schoolId) || String(s.school_id || '') === String(user.schoolId)).count() : 0,
    [user?.schoolId]
  ) || 0;
  const schoolRecord = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null,
    [user?.schoolId]
  );
  const reportsReleasedCount = useLiveQuery(
    () => user?.schoolId ? db.reportSummaries.filter(r => (String(r.schoolId) === String(user.schoolId) || String(r.school_id || '') === String(user.schoolId)) && r.isReleased).count() : 0,
    [user?.schoolId]
  ) || 0;

  // Evaluate Step States
  const step1Complete = classesCount > 0 || academicYearsCount > 0;
  const step2Complete = step1Complete && Boolean(schoolRecord?.name || schoolRecord?.logo_url || schoolRecord?.logoUrl || schoolRecord?.headteacher_signature || schoolRecord?.signatureUrl);
  const step3Complete = step1Complete && teachersCount > 0;
  const step4Complete = step1Complete && learnersCount > 0;
  const step5Complete = step3Complete && step4Complete && scoresCount > 0;
  const step6Complete = step4Complete && ((schoolRecord?.wallet_balance || 0) >= 0 || schoolRecord?.is_first_term_free !== false);
  const step7Complete = step5Complete && (reportsReleasedCount > 0 || schoolRecord?.reports_released === true);

  const steps = [
    {
      id: 1,
      title: '1. School Setup & Classes',
      route: '/setup',
      isComplete: step1Complete,
      isUnlocked: true,
      prerequisites: 'None',
      shortDesc: 'Add your classes, streams, and curriculum subjects.',
      details: 'Configure your school classes (e.g. Basic 1 to JHS 3), academic streams, and assign curriculum subjects taught at your school.',
      icon: 'fa-school',
      color: '#38bdf8',
    },
    {
      id: 2,
      title: '2. Settings & School Profile',
      route: '/settings',
      isComplete: step2Complete,
      isUnlocked: true,
      prerequisites: 'None',
      shortDesc: 'Set logo, signature, grading scale, and term dates.',
      details: 'Upload your school crest/logo, set the active academic year and term dates, configure grading scales, and draw the headteacher digital signature.',
      icon: 'fa-sliders-h',
      color: '#818cf8',
    },
    {
      id: 3,
      title: '3. Teachers & Staff',
      route: '/teachers',
      isComplete: step3Complete,
      isUnlocked: step1Complete,
      prerequisites: 'Step 1 (Classes & Subjects)',
      shortDesc: 'Add teachers and assign them to classes and subjects.',
      details: 'Add your teachers, create passwords for them, and choose the classes and subjects each teacher will handle.',
      icon: 'fa-chalkboard-teacher',
      color: '#2dd4bf',
    },
    {
      id: 4,
      title: '4. Register Students',
      route: '/learners',
      isComplete: step4Complete,
      isUnlocked: step1Complete,
      prerequisites: 'Step 1 (Classes)',
      shortDesc: 'Add students, photos, or upload class lists from Excel.',
      details: 'Add student names and details into their classes, capture passport photos, or upload the whole class roster at once from an Excel sheet.',
      icon: 'fa-user-graduate',
      color: '#34d399',
    },
    {
      id: 5,
      title: '5. Audit & Master Broadsheets',
      route: '/all-scores',
      isComplete: step5Complete,
      isUnlocked: step3Complete && step4Complete,
      prerequisites: 'Step 3 (Teachers) & Step 4 (Students)',
      shortDesc: 'Audit terminal scores, broadsheets, and class rankings.',
      details: 'Audit terminal score entries, inspect master broadsheets, verify missing marks, and review automated class rankings and averages.',
      icon: 'fa-list-check',
      color: '#fbbf24',
    },
    {
      id: 6,
      title: '6. School Wallet & Payments',
      route: '/financials',
      isComplete: step6Complete,
      isUnlocked: step4Complete,
      prerequisites: 'Step 4 (Registered Students)',
      shortDesc: 'Check balance, enjoy Free First Term, or top up via MoMo.',
      details: 'Check your balance, enjoy your Free First Term, or top up your school wallet using Mobile Money (MoMo) to print report cards.',
      icon: 'fa-wallet',
      color: '#ec4899',
    },
    {
      id: 7,
      title: '7. Print Reports & Send to Parents',
      route: '/reports',
      isComplete: step7Complete,
      isUnlocked: step5Complete && step6Complete,
      prerequisites: 'Step 5 (Audit Done) & Step 6 (Active Wallet)',
      shortDesc: 'Print report cards and send results to parents’ phones.',
      details: 'Print official student report cards, write headteacher remarks, and click Release Reports so parents can check results on their phones.',
      icon: 'fa-file-invoice',
      color: '#06b6d4',
    },
  ];

  const completedCount = steps.filter(s => s.isComplete).length;
  const currentStep = steps.find(s => !s.isComplete && s.isUnlocked) || steps[steps.length - 1];

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderRadius: '20px',
      padding: '1.25rem 1.5rem',
      color: 'white',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
      marginBottom: '1.5rem',
      position: 'relative',
    }}>
      {/* Top Header & Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8',
            fontSize: '1.2rem',
          }}>
            <i className="fas fa-route"></i>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'white' }}>
                Headteacher Sequential Step Guide
              </h3>
              <span style={{
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontSize: '0.7rem',
                fontWeight: 900,
                padding: '0.15rem 0.55rem',
                borderRadius: '20px',
                border: '1px solid rgba(56, 189, 248, 0.3)'
              }}>
                Step {completedCount === 7 ? 7 : currentStep.id} of 7
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Follow this step-by-step order for smooth school management. Prerequisites are auto-checked.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className={`fas ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
            {isCollapsed ? 'Show Guide Steps' : 'Collapse'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 700 }}>
          <span>Overall Workflow Progress ({Math.round((completedCount / 7) * 100)}%)</span>
          <span>{completedCount} / 7 Steps Completed</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{
            width: `${(completedCount / 7) * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #38bdf8 0%, #34d399 100%)',
            borderRadius: '10px',
            transition: 'width 0.4s ease'
          }} />
        </div>
      </div>

      {/* Steps List */}
      {!isCollapsed && (
        <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
          {steps.map((step) => {
            const isCurrent = currentStep.id === step.id && !step.isComplete;
            return (
              <div
                key={step.id}
                onClick={() => setActiveStepTab(activeStepTab === step.id ? null : step.id)}
                style={{
                  background: step.isComplete
                    ? 'rgba(52, 211, 153, 0.06)'
                    : isCurrent
                    ? 'rgba(56, 189, 248, 0.12)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: step.isComplete
                    ? '1px solid rgba(52, 211, 153, 0.3)'
                    : isCurrent
                    ? '1px solid rgba(56, 189, 248, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '0.9rem 1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={`fas ${step.icon}`} style={{ color: step.color, fontSize: '0.95rem' }}></i>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: step.isComplete ? '#34d399' : 'white' }}>
                      {step.title}
                    </span>
                  </div>
                  {step.isComplete ? (
                    <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 900 }}>
                      <i className="fas fa-check-circle"></i> Done
                    </span>
                  ) : isCurrent ? (
                    <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 900, background: 'rgba(56, 189, 248, 0.2)', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                      ⚡ NEXT ACTION
                    </span>
                  ) : !step.isUnlocked ? (
                    <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 800 }}>
                      <i className="fas fa-lock"></i> Locked
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      Pending
                    </span>
                  )}
                </div>

                <p style={{ margin: 0, fontSize: '0.76rem', color: '#cbd5e1', lineHeight: '1.35' }}>
                  {step.shortDesc}
                </p>

                {/* Prerequisite warning banner if locked */}
                {!step.isUnlocked && (
                  <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                    <i className="fas fa-exclamation-circle"></i> Requires: {step.prerequisites}
                  </div>
                )}

                {/* Direct Action Button */}
                <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    Prereq: {step.prerequisites}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(step.route);
                    }}
                    disabled={!step.isUnlocked}
                    style={{
                      background: step.isUnlocked ? step.color : 'rgba(255,255,255,0.08)',
                      color: step.isUnlocked ? '#0f172a' : '#64748b',
                      border: 'none',
                      padding: '0.3rem 0.7rem',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      cursor: step.isUnlocked ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    Go to Step →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HeadteacherGuideWidget;
