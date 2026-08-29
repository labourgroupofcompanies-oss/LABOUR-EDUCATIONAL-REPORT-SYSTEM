import { supabase } from '../lib/supabase';

const NOTIFICATIONS_STORAGE_KEY = 'platform_super_admin_notifications';
const READ_IDS_STORAGE_KEY = 'platform_super_admin_read_notification_ids';
const DISMISSED_IDS_STORAGE_KEY = 'platform_super_admin_dismissed_notification_ids';

// Web Audio synthesizer for pleasant notification chime
export const playNotificationChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch (e) {
    // Audio context may be restricted by browser gesture policies
  }
};

/**
 * Service to manage real-time Super Admin platform notifications
 */
class PlatformNotificationService {
  constructor() {
    this.listeners = new Set();
    this.notifications = this.loadStoredNotifications();
    this.readIds = this.loadReadIds();
    this.dismissedIds = this.loadDismissedIds();
    this.realtimeChannels = [];
    this.isInitialized = false;
  }

  loadStoredNotifications() {
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  loadReadIds() {
    try {
      const stored = localStorage.getItem(READ_IDS_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  loadDismissedIds() {
    try {
      const stored = localStorage.getItem(DISMISSED_IDS_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  saveNotifications() {
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(this.notifications.slice(0, 100)));
      localStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify(Array.from(this.readIds)));
      localStorage.setItem(DISMISSED_IDS_STORAGE_KEY, JSON.stringify(Array.from(this.dismissedIds)));
    } catch (e) {}
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getNotificationsState());
    return () => this.listeners.delete(listener);
  }

  notifyListeners(newNotification = null) {
    this.saveNotifications();
    const state = this.getNotificationsState();
    this.listeners.forEach(fn => fn(state, newNotification));
  }

  getNotificationsState() {
    const list = this.notifications
      .filter(n => !this.dismissedIds.has(n.id))
      .map(n => ({
        ...n,
        isRead: this.readIds.has(n.id)
      }));

    const unread = list.filter(n => !n.isRead);

    const categoryCounts = {
      all: unread.length,
      radar: unread.filter(n => n.category === 'radar').length,
      schools: unread.filter(n => n.category === 'schools').length,
      support: unread.filter(n => n.category === 'support').length,
      billing: unread.filter(n => n.category === 'billing').length,
      dashboard: unread.filter(n => n.category === 'dashboard').length
    };

    return {
      notifications: list,
      unreadCount: unread.length,
      categoryCounts
    };
  }

  addNotification(item, triggerChime = true, isNewLiveEvent = true) {
    const id = item.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // If the user already dismissed this notification, ignore it
    if (this.dismissedIds.has(id)) return null;

    const notification = {
      id,
      title: item.title || 'Platform Notification',
      message: item.message || '',
      category: item.category || 'dashboard', // 'schools' | 'support' | 'billing' | 'dashboard'
      timestamp: item.timestamp || new Date().toISOString(),
      actionUrl: item.actionUrl || null,
      actionLabel: item.actionLabel || 'View Details',
      meta: item.meta || {},
      severity: item.severity || 'info'
    };

    // If it's a historical past record loaded on refresh, mark it as read so it doesn't alert as new
    if (!isNewLiveEvent && !this.readIds.has(id)) {
      this.readIds.add(id);
    }

    // Avoid duplicate notifications with same title/school within 15 seconds
    const isDuplicate = this.notifications.some(
      n => n.title === notification.title && Math.abs(new Date(n.timestamp) - new Date(notification.timestamp)) < 15000
    );
    if (isDuplicate) return null;

    this.notifications = [notification, ...this.notifications.filter(n => n.id !== id)].slice(0, 100);
    
    if (triggerChime && isNewLiveEvent) {
      playNotificationChime();
    }

    this.notifyListeners(isNewLiveEvent ? notification : null);
    return notification;
  }

  markAsRead(id) {
    this.readIds.add(id);
    this.notifyListeners();
  }

  removeNotification(id) {
    this.dismissedIds.add(id);
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.readIds.delete(id);
    this.notifyListeners();
  }

  removeCategoryNotifications(category) {
    if (!category || category === 'all') {
      this.notifications.forEach(n => this.dismissedIds.add(n.id));
      this.notifications = [];
      this.readIds.clear();
    } else {
      this.notifications
        .filter(n => n.category === category)
        .forEach(n => this.dismissedIds.add(n.id));
      this.notifications = this.notifications.filter(n => n.category !== category);
    }
    this.notifyListeners();
  }

  markAllAsRead(category = null) {
    this.notifications.forEach(n => {
      if (!category || n.category === category) {
        this.readIds.add(n.id);
      }
    });
    this.notifyListeners();
  }

  clearAll(category = null) {
    this.removeCategoryNotifications(category);
  }

  /**
   * Fetch initial recent notifications from Supabase on first run, marked as read history
   */
  async fetchInitialData() {
    try {
      // If we already have stored notifications in localStorage, don't re-seed
      const alreadySeeded = localStorage.getItem('platform_initial_seed_completed');

      if (!alreadySeeded) {
        // 1. Fetch recent new schools
        const { data: recentSchools } = await supabase
          .from('report_schools')
          .select('id, name, district, region, created_at')
          .order('created_at', { ascending: false })
          .limit(3);

        if (Array.isArray(recentSchools)) {
          recentSchools.forEach(s => {
            const id = `school_${s.id}`;
            if (!this.dismissedIds.has(id)) {
              this.readIds.add(id); // Mark as read historical record
              this.notifications.push({
                id,
                title: '🏫 Registered School Profile',
                message: `${s.name || 'School'} on platform (${s.district || s.region || 'Ghana'}).`,
                category: 'schools',
                timestamp: s.created_at || new Date().toISOString(),
                actionUrl: `/platform/operations/schools/${s.id}`,
                actionLabel: 'Inspect School',
                severity: 'info'
              });
            }
          });
        }

        localStorage.setItem('platform_initial_seed_completed', 'true');
      }

      this.saveNotifications();
      this.notifyListeners();
    } catch (err) {
      console.warn('[PlatformNotificationService] Error fetching initial data:', err);
    }
  }

  /**
   * Initialize Supabase Realtime Channels for Live Events Only
   */
  initRealtime() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.fetchInitialData();

    try {
      // 1. Channel for Schools table
      const schoolsChannel = supabase
        .channel('platform_notifications_schools')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'report_schools' },
          (payload) => {
            const s = payload.new;
            this.addNotification({
              id: `school_live_${s.id}_${Date.now()}`,
              title: '🏫 New School Joined!',
              message: `${s.name || 'New School'} has just registered on the platform.`,
              category: 'schools',
              actionUrl: `/platform/operations/schools/${s.id}`,
              actionLabel: 'Inspect School',
              severity: 'success'
            }, true, true);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'report_schools' },
          (payload) => {
            const s = payload.new;
            this.addNotification({
              id: `school_update_${s.id}_${Date.now()}`,
              title: '🏫 School Profile Updated',
              message: `Configuration or term status changed for ${s.name || 'a school'}.`,
              category: 'schools',
              actionUrl: `/platform/operations/schools/${s.id}`,
              actionLabel: 'View School',
              severity: 'info'
            }, true, true);
          }
        )
        .subscribe();

      // 2. Channel for Support Tickets
      const supportChannel = supabase
        .channel('platform_notifications_support')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'platform_support_tickets' },
          (payload) => {
            const t = payload.new;
            this.addNotification({
              id: `ticket_live_${t.id}`,
              title: '🎧 New Support Ticket Submitted',
              message: `${t.school_name ? `[${t.school_name}] ` : ''}${t.title || 'New inquiry'}. Priority: ${(t.priority || 'Medium').toUpperCase()}`,
              category: 'support',
              actionUrl: '/platform/operations/support',
              actionLabel: 'Respond to Ticket',
              severity: t.priority === 'urgent' || t.priority === 'high' ? 'urgent' : 'warning'
            }, true, true);
          }
        )
        .subscribe();

      // 3. Channel for Billing / Transactions
      const billingChannel = supabase
        .channel('platform_notifications_billing')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'wallet_transactions' },
          (payload) => {
            const tx = payload.new;
            this.addNotification({
              id: `tx_live_${tx.id}`,
              title: '💳 New Payment / Top-up Received',
              message: `Amount: GHS ${(Number(tx.amount) || 0).toFixed(2)} (${tx.type || 'Deposit'})`,
              category: 'billing',
              actionUrl: '/platform/operations/subscriptions',
              actionLabel: 'Review Transactions',
              severity: 'success'
            }, true, true);
          }
        )
        .subscribe();

      // 4. Channel for Timeline / Interventions / Dashboard changes
      const timelineChannel = supabase
        .channel('platform_notifications_timeline')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'platform_school_timeline_events' },
          (payload) => {
            const ev = payload.new;
            this.addNotification({
              id: `event_live_${ev.id}`,
              title: `⚡ Dashboard Update: ${ev.title}`,
              message: ev.description || 'A critical platform event or intervention was recorded.',
              category: 'dashboard',
              actionUrl: '/platform/operations',
              actionLabel: 'View Dashboard',
              severity: 'info'
            }, true, true);
          }
        )
        .subscribe();

      this.realtimeChannels = [schoolsChannel, supportChannel, billingChannel, timelineChannel];
    } catch (err) {
      console.warn('[PlatformNotificationService] Realtime subscription error:', err);
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

export const platformNotificationService = new PlatformNotificationService();
export default platformNotificationService;
