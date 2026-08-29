import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { playNotificationChime } from './platformNotificationService';

const SCHOOL_NOTIF_STORAGE_PREFIX = 'labour_edu_notifications_';
const SCHOOL_NOTIF_READ_PREFIX = 'labour_edu_read_notifs_';
const SCHOOL_NOTIF_DISMISSED_PREFIX = 'labour_edu_dismissed_notifs_';

/**
 * Service to manage real-time notifications for Headteachers, Teachers, and Parents
 */
class SchoolNotificationService {
  constructor() {
    this.listeners = new Set();
    this.currentRole = null; // 'headteacher' | 'teacher' | 'parent'
    this.currentContextId = null; // schoolId for staff, phoneNumber for parents
    this.notifications = [];
    this.readIds = new Set();
    this.dismissedIds = new Set();
    this.realtimeChannels = [];
    this.isInitialized = false;
  }

  getStorageKey() {
    return `${SCHOOL_NOTIF_STORAGE_PREFIX}${this.currentRole || 'guest'}_${this.currentContextId || 'default'}`;
  }

  getReadKey() {
    return `${SCHOOL_NOTIF_READ_PREFIX}${this.currentRole || 'guest'}_${this.currentContextId || 'default'}`;
  }

  getDismissedKey() {
    return `${SCHOOL_NOTIF_DISMISSED_PREFIX}${this.currentRole || 'guest'}_${this.currentContextId || 'default'}`;
  }

  loadStoredNotifications() {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  loadReadIds() {
    try {
      const stored = localStorage.getItem(this.getReadKey());
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  loadDismissedIds() {
    try {
      const stored = localStorage.getItem(this.getDismissedKey());
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  saveNotifications() {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(this.notifications.slice(0, 50)));
      localStorage.setItem(this.getReadKey(), JSON.stringify(Array.from(this.readIds)));
      localStorage.setItem(this.getDismissedKey(), JSON.stringify(Array.from(this.dismissedIds)));
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
    this.readIds = this.loadReadIds();
    this.dismissedIds = this.loadDismissedIds();
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
    const list = this.notifications
      .filter(n => !this.dismissedIds.has(n.id))
      .map(n => ({
        ...n,
        isRead: this.readIds.has(n.id) || n.isRead
      }));

    const unread = list.filter(n => !n.isRead);

    return {
      notifications: list,
      unreadCount: unread.length,
      unreadNotifications: unread
    };
  }

  addNotification(item, triggerChime = true, isNewLiveEvent = true) {
    const id = item.id || `s_notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // Ignore dismissed items
    if (this.dismissedIds.has(id)) return null;

    const notification = {
      id,
      title: item.title || 'Notification',
      message: item.message || '',
      category: item.category || 'general',
      timestamp: item.timestamp || new Date().toISOString(),
      actionUrl: item.actionUrl || null,
      actionLabel: item.actionLabel || 'View',
      severity: item.severity || 'info',
      isRead: !isNewLiveEvent
    };

    // If historical, mark read
    if (!isNewLiveEvent && !this.readIds.has(id)) {
      this.readIds.add(id);
    }

    // Avoid duplicate within 15 seconds
    const isDuplicate = this.notifications.some(
      n => n.title === notification.title && Math.abs(new Date(n.timestamp) - new Date(notification.timestamp)) < 15000
    );
    if (isDuplicate) return null;

    this.notifications = [notification, ...this.notifications.filter(n => n.id !== id)].slice(0, 50);

    if (triggerChime && isNewLiveEvent) {
      playNotificationChime();
    }

    this.notifyListeners(isNewLiveEvent ? notification : null);
    return notification;
  }

  removeNotification(id) {
    this.dismissedIds.add(id);
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.readIds.delete(id);
    this.notifyListeners();
  }

  markAsRead(id) {
    this.readIds.add(id);
    this.notifications = this.notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    this.notifyListeners();
  }

  markAllAsRead() {
    this.notifications.forEach(n => this.readIds.add(n.id));
    this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
    this.notifyListeners();
  }

  clearAll() {
    this.notifications.forEach(n => this.dismissedIds.add(n.id));
    this.notifications = [];
    this.readIds.clear();
    this.notifyListeners();
  }

  /**
   * Fetch initial notifications on first boot (marked as read historical baseline)
   */
  async fetchInitialRoleData(role, contextId, userId) {
    if (!contextId) return;

    try {
      const seedKey = `labour_edu_seed_done_${role}_${contextId}`;
      const alreadySeeded = localStorage.getItem(seedKey);
      if (alreadySeeded) return;

      if (role === 'headteacher') {
        const recentScores = await db.scores
          .where('schoolId')
          .equals(contextId)
          .reverse()
          .limit(1)
          .toArray();

        if (recentScores && recentScores.length > 0) {
          const id = `score_recent_${contextId}`;
          if (!this.dismissedIds.has(id)) {
            this.readIds.add(id);
            this.notifications.push({
              id,
              title: '📝 Teacher Score Entry Active',
              message: `Class assessment & exam marks are being synchronized.`,
              category: 'scores',
              timestamp: new Date().toISOString(),
              actionUrl: '/scores',
              actionLabel: 'View Scores',
              severity: 'info',
              isRead: true
            });
          }
        }
      } else if (role === 'teacher') {
        const assignments = await db.teacherAssignments
          .where('teacherId')
          .equals(userId || contextId)
          .toArray();

        if (assignments && assignments.length > 0) {
          const id = `assignment_notice_${userId}`;
          if (!this.dismissedIds.has(id)) {
            this.readIds.add(id);
            this.notifications.push({
              id,
              title: '📚 Assigned Classes Ready',
              message: `You are assigned to ${assignments.length} class subject module(s).`,
              category: 'scores',
              timestamp: new Date().toISOString(),
              actionUrl: '/scores',
              actionLabel: 'Enter Scores',
              severity: 'info',
              isRead: true
            });
          }
        }
      } else if (role === 'parent') {
        const id = `parent_portal_ready_${contextId}`;
        if (!this.dismissedIds.has(id)) {
          this.readIds.add(id);
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

      localStorage.setItem(seedKey, 'true');
      this.saveNotifications();
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
                id: `score_live_${Date.now()}`,
                title: '📝 New Scores Submitted by Teacher',
                message: `Assessment records updated for student marks.`,
                category: 'scores',
                actionUrl: '/scores',
                actionLabel: 'Inspect Broadsheet',
                severity: 'info'
              }, true, true);
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
                id: `wallet_live_${tx?.id || Date.now()}`,
                title: '💳 Wallet Deposit Confirmed',
                message: `GHS ${(Number(tx?.amount) || 0).toFixed(2)} credited via Mobile Money / Paystack.`,
                category: 'finance',
                actionUrl: '/financials',
                actionLabel: 'View Wallet',
                severity: 'success'
              }, true, true);
            }
          )
          .subscribe();

        this.realtimeChannels.push(scoreChannel, walletChannel);

      } else if (role === 'teacher') {
        const assignChannel = supabase
          .channel(`teacher_assignments_${userId || contextId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'report_teacher_assignments', filter: `teacher_id=eq.${userId || contextId}` },
            (payload) => {
              this.addNotification({
                id: `assign_live_${Date.now()}`,
                title: '🎯 New Class/Subject Assigned!',
                message: `The Headteacher has updated your teaching assignments.`,
                category: 'scores',
                actionUrl: '/scores',
                actionLabel: 'Open Score Entry',
                severity: 'success'
              }, true, true);
            }
          )
          .subscribe();

        this.realtimeChannels.push(assignChannel);

      } else if (role === 'parent') {
        const reportChannel = supabase
          .channel(`parent_reports_${contextId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'report_schools' },
            (payload) => {
              if (payload.new && payload.new.reports_released) {
                this.addNotification({
                  id: `report_rel_${Date.now()}`,
                  title: '🎉 Terminal Report Cards Released!',
                  message: `The Headteacher has released the official terminal report cards.`,
                  category: 'reports',
                  actionUrl: '/parent/dashboard',
                  actionLabel: 'View Report Card',
                  severity: 'success'
                }, true, true);
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
