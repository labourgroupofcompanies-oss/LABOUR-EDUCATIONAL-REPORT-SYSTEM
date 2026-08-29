import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { playNotificationChime } from './platformNotificationService';

const SCHOOL_NOTIF_STORAGE_PREFIX = 'labour_edu_notifications_';

/**
 * Service to manage real-time notifications for Headteachers, Teachers, and Parents
 */
class SchoolNotificationService {
  constructor() {
    this.listeners = new Set();
    this.currentRole = null; // 'headteacher' | 'teacher' | 'parent'
    this.currentContextId = null; // schoolId for staff, phoneNumber for parents
    this.notifications = [];
    this.realtimeChannels = [];
    this.isInitialized = false;
  }

  getStorageKey() {
    return `${SCHOOL_NOTIF_STORAGE_PREFIX}${this.currentRole || 'guest'}_${this.currentContextId || 'default'}`;
  }

  loadStoredNotifications() {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  saveNotifications() {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(this.notifications.slice(0, 50)));
    } catch (e) {}
  }

  init(role, contextId, userId = null) {
    if (this.currentRole === role && this.currentContextId === contextId && this.isInitialized) {
      return;
    }

    this.cleanup();
    this.currentRole = role;
    this.currentContextId = contextId;
    this.notifications = this.loadStoredNotifications();
    this.isInitialized = true;

    this.fetchInitialRoleData(role, contextId, userId);
    this.subscribeRealtime(role, contextId, userId);
    this.notifyListeners();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notifyListeners(newNotification = null) {
    this.saveNotifications();
    const state = this.getState();
    this.listeners.forEach(fn => fn(state, newNotification));
  }

  getState() {
    const unread = this.notifications.filter(n => !n.isRead);
    return {
      notifications: this.notifications,
      unreadCount: unread.length,
      unreadNotifications: unread
    };
  }

  addNotification(item, triggerChime = true) {
    const id = item.id || `s_notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const notification = {
      id,
      title: item.title || 'Notification',
      message: item.message || '',
      category: item.category || 'general', // 'scores' | 'admissions' | 'finance' | 'reports' | 'general'
      timestamp: item.timestamp || new Date().toISOString(),
      actionUrl: item.actionUrl || null,
      actionLabel: item.actionLabel || 'View',
      severity: item.severity || 'info', // 'info' | 'success' | 'warning' | 'urgent'
      isRead: false
    };

    // Avoid exact duplicate within 15 seconds
    const isDuplicate = this.notifications.some(
      n => n.title === notification.title && Math.abs(new Date(n.timestamp) - new Date(notification.timestamp)) < 15000
    );
    if (isDuplicate) return;

    this.notifications = [notification, ...this.notifications.filter(n => n.id !== id)].slice(0, 50);

    if (triggerChime) {
      playNotificationChime();
    }

    this.notifyListeners(notification);
    return notification;
  }

  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifyListeners();
  }

  markAsRead(id) {
    this.notifications = this.notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    this.notifyListeners();
  }

  markAllAsRead() {
    this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
    this.notifyListeners();
  }

  clearAll() {
    this.notifications = [];
    this.notifyListeners();
  }

  /**
   * Fetch initial notifications based on role
   */
  async fetchInitialRoleData(role, contextId, userId) {
    if (!contextId) return;

    try {
      if (role === 'headteacher') {
        // Fetch recent score submissions from teachers
        const recentScores = await db.scores
          .where('schoolId')
          .equals(contextId)
          .reverse()
          .limit(5)
          .toArray();

        if (recentScores && recentScores.length > 0) {
          const sample = recentScores[0];
          const id = `score_recent_${contextId}`;
          if (!this.notifications.some(n => n.id === id)) {
            this.notifications.push({
              id,
              title: '📝 Teacher Score Entry Active',
              message: `Class assessment & exam marks are being synchronized.`,
              category: 'scores',
              timestamp: new Date().toISOString(),
              actionUrl: '/score-entry',
              actionLabel: 'View Scores',
              severity: 'info',
              isRead: true
            });
          }
        }

        // Fetch recent learners registered
        const recentLearners = await db.learners
          .where('schoolId')
          .equals(contextId)
          .reverse()
          .limit(3)
          .toArray();

        if (recentLearners && recentLearners.length > 0) {
          const lastLearner = recentLearners[0];
          const id = `learner_${lastLearner.id || lastLearner.supabaseId}`;
          if (!this.notifications.some(n => n.id === id)) {
            this.notifications.push({
              id,
              title: '🎒 Active Class Roster',
              message: `Learners enrolled for the current academic term.`,
              category: 'admissions',
              timestamp: new Date().toISOString(),
              actionUrl: '/learners',
              actionLabel: 'View Learners',
              severity: 'success',
              isRead: true
            });
          }
        }
      } else if (role === 'teacher') {
        // Teacher assigned classes reminder
        const assignments = await db.teacherAssignments
          .where('teacherId')
          .equals(userId || contextId)
          .toArray();

        if (assignments && assignments.length > 0) {
          const id = `assignment_notice_${userId}`;
          if (!this.notifications.some(n => n.id === id)) {
            this.notifications.push({
              id,
              title: '📚 Assigned Classes & Subjects Ready',
              message: `You are assigned to ${assignments.length} class subject module(s).`,
              category: 'scores',
              timestamp: new Date().toISOString(),
              actionUrl: '/score-entry',
              actionLabel: 'Enter Scores',
              severity: 'info',
              isRead: true
            });
          }
        }
      } else if (role === 'parent') {
        // Parent terminal report notices
        const id = `parent_portal_ready_${contextId}`;
        if (!this.notifications.some(n => n.id === id)) {
          this.notifications.push({
            id,
            title: '🎓 Parent Portal Connected',
            message: `You can view terminal reports, attendance, and fee statements.`,
            category: 'reports',
            timestamp: new Date().toISOString(),
            actionUrl: '/parent/dashboard',
            actionLabel: 'View Child Report',
            severity: 'success',
            isRead: true
          });
        }
      }

      this.notifyListeners();
    } catch (e) {
      console.warn('[SchoolNotificationService] Error loading role data:', e);
    }
  }

  /**
   * Subscribe to live Supabase Postgres channels for School/Teacher/Parent events
   */
  subscribeRealtime(role, contextId, userId) {
    if (!navigator.onLine || !contextId) return;

    try {
      if (role === 'headteacher') {
        // 1. Listen for new score submissions by teachers
        const scoreChannel = supabase
          .channel(`school_scores_${contextId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'report_scores', filter: `school_id=eq.${contextId}` },
            (payload) => {
              this.addNotification({
                title: '📝 New Scores Submitted by Teacher',
                message: `Assessment records updated for student marks.`,
                category: 'scores',
                actionUrl: '/score-entry',
                actionLabel: 'Inspect Broadsheet',
                severity: 'info'
              });
            }
          )
          .subscribe();

        // 2. Listen for new wallet deposits & fee payments
        const walletChannel = supabase
          .channel(`school_wallet_${contextId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `school_id=eq.${contextId}` },
            (payload) => {
              const tx = payload.new;
              this.addNotification({
                title: '💳 Wallet Deposit Confirmed',
                message: `GHS ${(Number(tx?.amount) || 0).toFixed(2)} credited via Mobile Money / Paystack.`,
                category: 'finance',
                actionUrl: '/financials',
                actionLabel: 'View Wallet',
                severity: 'success'
              });
            }
          )
          .subscribe();

        this.realtimeChannels.push(scoreChannel, walletChannel);

      } else if (role === 'teacher') {
        // Listen for new assignments from Headteacher
        const assignChannel = supabase
          .channel(`teacher_assignments_${userId || contextId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'report_teacher_assignments', filter: `teacher_id=eq.${userId || contextId}` },
            (payload) => {
              this.addNotification({
                title: '🎯 New Class/Subject Assigned!',
                message: `The Headteacher has updated your teaching assignments.`,
                category: 'scores',
                actionUrl: '/score-entry',
                actionLabel: 'Open Score Entry',
                severity: 'success'
              });
            }
          )
          .subscribe();

        this.realtimeChannels.push(assignChannel);

      } else if (role === 'parent') {
        // Listen for report card releases
        const reportChannel = supabase
          .channel(`parent_reports_${contextId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'report_schools' },
            (payload) => {
              if (payload.new && payload.new.reports_released) {
                this.addNotification({
                  title: '🎉 Terminal Report Cards Released!',
                  message: `The Headteacher has released the official terminal report cards.`,
                  category: 'reports',
                  actionUrl: '/parent/dashboard',
                  actionLabel: 'View Report Card',
                  severity: 'success'
                });
              }
            }
          )
          .subscribe();

        this.realtimeChannels.push(reportChannel);
      }
    } catch (err) {
      console.warn('[SchoolNotificationService] Realtime subscription error:', err);
    }
  }

  cleanup() {
    this.realtimeChannels.forEach(ch => {
      try {
        supabase.removeChannel(ch);
      } catch (e) {}
    });
    this.realtimeChannels = [];
    this.isInitialized = false;
  }
}

export const schoolNotificationService = new SchoolNotificationService();
export default schoolNotificationService;
