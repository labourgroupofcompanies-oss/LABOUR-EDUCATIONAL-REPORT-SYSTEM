import { supabase } from '../lib/supabase';

const NOTIFICATIONS_STORAGE_KEY = 'platform_super_admin_notifications';
const READ_IDS_STORAGE_KEY = 'platform_super_admin_read_notification_ids';

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

  saveNotifications() {
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(this.notifications.slice(0, 100)));
      localStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify(Array.from(this.readIds)));
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
    const list = this.notifications.map(n => ({
      ...n,
      isRead: this.readIds.has(n.id)
    }));

    const unread = list.filter(n => !n.isRead);

    const categoryCounts = {
      all: unread.length,
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

  addNotification(item, triggerChime = true) {
    const id = item.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const notification = {
      id,
      title: item.title || 'Platform Notification',
      message: item.message || '',
      category: item.category || 'dashboard', // 'schools' | 'support' | 'billing' | 'dashboard'
      timestamp: item.timestamp || new Date().toISOString(),
      actionUrl: item.actionUrl || null,
      actionLabel: item.actionLabel || 'View Details',
      meta: item.meta || {},
      severity: item.severity || 'info' // 'info' | 'success' | 'warning' | 'urgent'
    };

    // Avoid duplicate notifications with same title/school within 10 seconds
    const isDuplicate = this.notifications.some(
      n => n.title === notification.title && Math.abs(new Date(n.timestamp) - new Date(notification.timestamp)) < 10000
    );
    if (isDuplicate) return;

    this.notifications = [notification, ...this.notifications.filter(n => n.id !== id)].slice(0, 100);
    
    if (triggerChime) {
      playNotificationChime();
    }

    this.notifyListeners(notification);
    return notification;
  }

  markAsRead(id) {
    this.readIds.add(id);
    this.notifyListeners();
  }

  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.readIds.delete(id);
    this.notifyListeners();
  }

  removeCategoryNotifications(category) {
    if (!category || category === 'all') {
      this.notifications = [];
      this.readIds.clear();
    } else {
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
   * Seed initial recent notifications from Supabase on start
   */
  async fetchInitialData() {
    try {
      // 1. Fetch recent new schools
      const { data: recentSchools } = await supabase
        .from('report_schools')
        .select('id, name, district, region, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (Array.isArray(recentSchools)) {
        recentSchools.forEach(s => {
          const id = `school_${s.id}`;
          if (!this.notifications.some(n => n.id === id)) {
            this.notifications.push({
              id,
              title: '🏫 New School Registered',
              message: `${s.name || 'New School'} has joined the platform (${s.district || s.region || 'Ghana'}).`,
              category: 'schools',
              timestamp: s.created_at || new Date().toISOString(),
              actionUrl: `/platform/operations/schools/${s.id}`,
              actionLabel: 'Inspect School',
              severity: 'success'
            });
          }
        });
      }

      // 2. Fetch recent support tickets
      const { data: recentTickets } = await supabase
        .from('platform_support_tickets')
        .select('id, school_name, title, priority, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (Array.isArray(recentTickets)) {
        recentTickets.forEach(t => {
          const id = `ticket_${t.id}`;
          if (!this.notifications.some(n => n.id === id)) {
            this.notifications.push({
              id,
              title: `🎧 Support Ticket: ${t.title || 'Inquiry'}`,
              message: `${t.school_name ? `From ${t.school_name}: ` : ''}Priority: ${t.priority.toUpperCase()} · Status: ${t.status}`,
              category: 'support',
              timestamp: t.created_at || new Date().toISOString(),
              actionUrl: '/platform/operations/support',
              actionLabel: 'Open Support',
              severity: t.priority === 'urgent' || t.priority === 'high' ? 'urgent' : 'info'
            });
          }
        });
      }

      // 3. Fetch recent payments & wallet transactions
      const { data: recentTx } = await supabase
        .from('wallet_transactions')
        .select('id, school_id, amount, description, type, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (Array.isArray(recentTx)) {
        recentTx.forEach(tx => {
          const id = `tx_${tx.id}`;
          if (!this.notifications.some(n => n.id === id)) {
            this.notifications.push({
              id,
              title: `💳 New Transaction: GHS ${(Number(tx.amount) || 0).toFixed(2)}`,
              message: `${tx.description || tx.type || 'Wallet Deposit'} recorded for school.`,
              category: 'billing',
              timestamp: tx.created_at || new Date().toISOString(),
              actionUrl: '/platform/operations/subscriptions',
              actionLabel: 'View Billing',
              severity: 'success'
            });
          }
        });
      }

      // 4. Fetch recent timeline events
      const { data: recentEvents } = await supabase
        .from('platform_school_timeline_events')
        .select('id, school_id, title, description, event_type, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (Array.isArray(recentEvents)) {
        recentEvents.forEach(ev => {
          const id = `event_${ev.id}`;
          if (!this.notifications.some(n => n.id === id)) {
            this.notifications.push({
              id,
              title: `⚡ System Change: ${ev.title}`,
              message: ev.description || `Event logged in operations audit.`,
              category: 'dashboard',
              timestamp: ev.created_at || new Date().toISOString(),
              actionUrl: '/platform/operations',
              actionLabel: 'View Dashboard',
              severity: 'info'
            });
          }
        });
      }

      // Sort all descending by timestamp
      this.notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      this.notifyListeners();
    } catch (err) {
      console.warn('[PlatformNotificationService] Error fetching initial data:', err);
    }
  }

  /**
   * Initialize Supabase Realtime Channels
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
              title: '🏫 New School Joined!',
              message: `${s.name || 'New School'} has just registered on the platform.`,
              category: 'schools',
              actionUrl: `/platform/operations/schools/${s.id}`,
              actionLabel: 'Inspect School',
              severity: 'success'
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'report_schools' },
          (payload) => {
            const s = payload.new;
            this.addNotification({
              title: '🏫 School Profile Updated',
              message: `Configuration or term status changed for ${s.name || 'a school'}.`,
              category: 'schools',
              actionUrl: `/platform/operations/schools/${s.id}`,
              actionLabel: 'View School',
              severity: 'info'
            });
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
              title: '🎧 New Support Ticket Submitted',
              message: `${t.school_name ? `[${t.school_name}] ` : ''}${t.title || 'New inquiry'}. Priority: ${(t.priority || 'Medium').toUpperCase()}`,
              category: 'support',
              actionUrl: '/platform/operations/support',
              actionLabel: 'Respond to Ticket',
              severity: t.priority === 'urgent' || t.priority === 'high' ? 'urgent' : 'warning'
            });
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
              title: '💳 New Payment / Top-up Received',
              message: `Amount: GHS ${(Number(tx.amount) || 0).toFixed(2)} (${tx.type || 'Deposit'})`,
              category: 'billing',
              actionUrl: '/platform/operations/subscriptions',
              actionLabel: 'Review Transactions',
              severity: 'success'
            });
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
              title: `⚡ Dashboard Update: ${ev.title}`,
              message: ev.description || 'A critical platform event or intervention was recorded.',
              category: 'dashboard',
              actionUrl: '/platform/operations',
              actionLabel: 'View Dashboard',
              severity: 'info'
            });
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
