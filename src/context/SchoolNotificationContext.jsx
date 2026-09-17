import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../store/AuthContext';
import authService from '../services/authService';
import schoolNotificationService from '../services/schoolNotificationService';
import { playNotificationChime } from '../services/platformNotificationService';

const SchoolNotificationContext = createContext(null);

export const SchoolNotificationProvider = ({ children }) => {
  const { user } = useAuth();

  // ✅ Reactive parent auth — re-reads when user changes (not stale closure)
  const [parent, setParent] = useState(() => authService.getCurrentParent());

  const [state, setState] = useState(() => schoolNotificationService.getState());
  const [toasts, setToasts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('school_notif_sound_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch { return true; }
  });

  // Keep parent in sync whenever user changes (login/logout)
  useEffect(() => {
    setParent(authService.getCurrentParent());
  }, [user]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('school_notif_sound_enabled', String(next)); } catch {}
      if (next) playNotificationChime();
      return next;
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Init and subscribe to notification service
  useEffect(() => {
    let role = 'guest';
    let contextId = null;
    let userId = null;

    const isHeadteacherRole = ['super_admin', 'headteacher', 'admin', 'school_admin'].includes(user?.role);
    const isTeacherRole = user?.role === 'teacher';

    if (isHeadteacherRole) {
      role = 'headteacher';
      contextId = user?.schoolId || user?.school_id;
      userId = user?.id || user?.userId;
    } else if (isTeacherRole) {
      role = 'teacher';
      contextId = user?.schoolId || user?.school_id;
      userId = user?.id || user?.userId;
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
        // Respect sound preference before showing toast
        if (soundEnabled) {
          // Chime already fired inside service if soundEnabled was passed
        }
        setToasts(prev => [newNotification, ...prev.slice(0, 2)]);
        setTimeout(() => dismissToast(newNotification.id), 6500);
      }
    });

    // ✅ Full cleanup: unsubscribe listener AND close realtime channels on unmount
    return () => {
      unsubscribe();
      schoolNotificationService.cleanup();
    };
  }, [user?.role, user?.schoolId, user?.id, parent?.phone_number, soundEnabled, dismissToast]);

  const markAsRead = useCallback((id) => schoolNotificationService.markAsRead(id), []);
  const removeNotification = useCallback((id) => schoolNotificationService.removeNotification(id), []);
  const markAllAsRead = useCallback(() => schoolNotificationService.markAllAsRead(), []);
  const clearAll = useCallback(() => schoolNotificationService.clearAll(), []);

  // ✅ Sound-gated manual add — only chime if sound is on
  const addNotification = useCallback(
    (item) => schoolNotificationService.addNotification(item, soundEnabled),
    [soundEnabled]
  );

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
