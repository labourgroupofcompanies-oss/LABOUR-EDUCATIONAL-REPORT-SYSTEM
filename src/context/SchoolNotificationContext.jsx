import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../store/AuthContext';
import authService from '../services/authService';
import schoolNotificationService from '../services/schoolNotificationService';
import { playNotificationChime } from '../services/platformNotificationService';

const SchoolNotificationContext = createContext(null);

export const SchoolNotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const parent = authService.getCurrentParent();

  const [state, setState] = useState(() => schoolNotificationService.getState());
  const [toasts, setToasts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('school_notif_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('school_notif_sound_enabled', String(next));
      if (next) playNotificationChime();
      return next;
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Determine current role and context identifier
  useEffect(() => {
    let role = 'guest';
    let contextId = null;
    let userId = null;

    if (user?.role === 'super_admin') {
      role = 'headteacher';
      contextId = user.schoolId;
      userId = user.id;
    } else if (user?.role === 'teacher') {
      role = 'teacher';
      contextId = user.schoolId;
      userId = user.id;
    } else if (parent?.phone_number) {
      role = 'parent';
      contextId = parent.phone_number;
    }

    if (contextId) {
      schoolNotificationService.init(role, contextId, userId);
    }

    const unsubscribe = schoolNotificationService.subscribe((newState, newNotification) => {
      setState(newState);

      if (newNotification) {
        setToasts(prev => [newNotification, ...prev.slice(0, 2)]);
        setTimeout(() => {
          dismissToast(newNotification.id);
        }, 6500);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user?.role, user?.schoolId, user?.id, parent?.phone_number, dismissToast]);

  const markAsRead = useCallback((id) => schoolNotificationService.markAsRead(id), []);
  const removeNotification = useCallback((id) => schoolNotificationService.removeNotification(id), []);
  const markAllAsRead = useCallback(() => schoolNotificationService.markAllAsRead(), []);
  const clearAll = useCallback(() => schoolNotificationService.clearAll(), []);
  const addNotification = useCallback((item) => schoolNotificationService.addNotification(item, soundEnabled), [soundEnabled]);

  const value = useMemo(() => ({
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    unreadNotifications: state.unreadNotifications,
    markAsRead,
    removeNotification,
    markAllAsRead,
    clearAll,
    addNotification,
    toasts,
    dismissToast,
    soundEnabled,
    toggleSound
  }), [
    state.notifications,
    state.unreadCount,
    state.unreadNotifications,
    markAsRead,
    removeNotification,
    markAllAsRead,
    clearAll,
    addNotification,
    toasts,
    dismissToast,
    soundEnabled,
    toggleSound
  ]);

  return (
    <SchoolNotificationContext.Provider value={value}>
      {children}
    </SchoolNotificationContext.Provider>
  );
};

export const useSchoolNotifications = () => {
  const context = useContext(SchoolNotificationContext);
  if (!context) {
    throw new Error('useSchoolNotifications must be used within a SchoolNotificationProvider');
  }
  return context;
};

export default SchoolNotificationContext;
