import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import platformNotificationService, { playNotificationChime } from '../services/platformNotificationService';

const PlatformNotificationContext = createContext(null);

export const PlatformNotificationProvider = ({ children }) => {
  const [state, setState] = useState(() => platformNotificationService.getNotificationsState());
  const [toasts, setToasts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('platform_notif_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('platform_notif_sound_enabled', String(next));
      if (next) playNotificationChime();
      return next;
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    platformNotificationService.initRealtime();

    const unsubscribe = platformNotificationService.subscribe((newState, newNotification) => {
      setState(newState);

      // If a new live notification arrived, display a transient toast
      if (newNotification) {
        setToasts(prev => [newNotification, ...prev.slice(0, 3)]);
        // Auto-dismiss toast after 6.5 seconds
        setTimeout(() => {
          dismissToast(newNotification.id);
        }, 6500);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [dismissToast]);

  const markAsRead = useCallback((id) => {
    platformNotificationService.markAsRead(id);
  }, []);

  const removeNotification = useCallback((id) => {
    platformNotificationService.removeNotification(id);
  }, []);

  const removeCategoryNotifications = useCallback((category) => {
    platformNotificationService.removeCategoryNotifications(category);
  }, []);

  const markAllAsRead = useCallback((category) => {
    platformNotificationService.markAllAsRead(category);
  }, []);

  const clearAll = useCallback((category) => {
    platformNotificationService.clearAll(category);
  }, []);

  const addNotification = useCallback((item) => {
    return platformNotificationService.addNotification(item, soundEnabled);
  }, [soundEnabled]);

  // Quick helper to simulate a notification for testing / demonstration
  const simulateNotification = useCallback((type = 'school') => {
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (type === 'school') {
      const mockSchools = ['St. Augustine Basic School', 'Achimota Preparatory Academy', 'Presby Model JHS', 'Crown International School', 'Tema Community Model Basic'];
      const randomSchool = mockSchools[Math.floor(Math.random() * mockSchools.length)];
      addNotification({
        title: '🏫 New School Joined!',
        message: `${randomSchool} has just registered on the platform at ${timeString}.`,
        category: 'schools',
        actionUrl: '/platform/operations/schools',
        actionLabel: 'Inspect School',
        severity: 'success'
      });
    } else if (type === 'support') {
      addNotification({
        title: '🎧 Urgent Support Ticket Received',
        message: `Headteacher reported continuous assessment marks sync query at ${timeString}.`,
        category: 'support',
        actionUrl: '/platform/operations/support',
        actionLabel: 'Open Ticket',
        severity: 'urgent'
      });
    } else if (type === 'billing') {
      const amount = (Math.floor(Math.random() * 15) + 1) * 100;
      addNotification({
        title: `💳 Wallet Deposit: GHS ${amount}.00 Received`,
        message: `MTN Mobile Money top-up confirmed via Paystack at ${timeString}.`,
        category: 'billing',
        actionUrl: '/platform/operations/subscriptions',
        actionLabel: 'View Transactions',
        severity: 'success'
      });
    } else {
      addNotification({
        title: '⚡ Dashboard Telemetry Updated',
        message: `Academic term statistics and broadsheet sync metrics recalculated at ${timeString}.`,
        category: 'dashboard',
        actionUrl: '/platform/operations',
        actionLabel: 'View Dashboard',
        severity: 'info'
      });
    }
  }, [addNotification]);

  const value = useMemo(() => ({
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    categoryCounts: state.categoryCounts,
    markAsRead,
    removeNotification,
    removeCategoryNotifications,
    markAllAsRead,
    clearAll,
    addNotification,
    simulateNotification,
    toasts,
    dismissToast,
    soundEnabled,
    toggleSound
  }), [
    state.notifications,
    state.unreadCount,
    state.categoryCounts,
    markAsRead,
    removeNotification,
    removeCategoryNotifications,
    markAllAsRead,
    clearAll,
    addNotification,
    simulateNotification,
    toasts,
    dismissToast,
    soundEnabled,
    toggleSound
  ]);

  return (
    <PlatformNotificationContext.Provider value={value}>
      {children}
    </PlatformNotificationContext.Provider>
  );
};

export const usePlatformNotifications = () => {
  const context = useContext(PlatformNotificationContext);
  if (!context) {
    throw new Error('usePlatformNotifications must be used within a PlatformNotificationProvider');
  }
  return context;
};

export default PlatformNotificationContext;
