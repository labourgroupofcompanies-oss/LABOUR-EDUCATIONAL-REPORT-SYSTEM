import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import { PORTAL_GUIDES, getPortalForUser } from './guideSteps';
import InteractiveSpotlightTour from './InteractiveSpotlightTour';

const PortalGuide = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Listen to guide trigger events
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setCurrentStepIndex(0);
    };

    window.addEventListener('open-portal-guide', handleOpen);
    window.addEventListener('open-headteacher-guide', handleOpen);
    window.addEventListener('open-teacher-guide', handleOpen);
    window.addEventListener('open-parent-guide', handleOpen);
    window.addEventListener('start-interactive-tour', handleOpen);

    return () => {
      window.removeEventListener('open-portal-guide', handleOpen);
      window.removeEventListener('open-headteacher-guide', handleOpen);
      window.removeEventListener('open-teacher-guide', handleOpen);
      window.removeEventListener('open-parent-guide', handleOpen);
      window.removeEventListener('start-interactive-tour', handleOpen);
    };
  }, []);

  // Determine portal steps explicitly based on pathname & user role
  const portalKey = getPortalForUser(user, location.pathname);
  const steps = PORTAL_GUIDES[portalKey] || PORTAL_GUIDES.headteacher;
  const currentStep = steps[currentStepIndex] || steps[0];

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Finish action on last step
      setIsOpen(false);
      if (window.innerWidth <= 768) {
        document.querySelector('.sidebar')?.classList.remove('open');
      }
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    setIsOpen(false);
    if (window.innerWidth <= 768) {
      document.querySelector('.sidebar')?.classList.remove('open');
    }
  };

  const handleGo = () => {
    setIsOpen(false);
    if (window.innerWidth <= 768) {
      document.querySelector('.sidebar')?.classList.remove('open');
    }
    if (currentStep?.route) {
      navigate(currentStep.route);
    }
  };

  return (
    <InteractiveSpotlightTour
      isActive={isOpen}
      currentStep={currentStep}
      currentStepIndex={currentStepIndex}
      totalSteps={steps.length}
      onNext={handleNext}
      onPrev={handlePrev}
      onSkip={handleSkip}
      onGo={handleGo}
    />
  );
};

export default PortalGuide;
