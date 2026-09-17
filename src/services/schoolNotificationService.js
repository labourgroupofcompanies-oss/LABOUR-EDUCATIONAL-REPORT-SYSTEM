import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { playNotificationChime } from './platformNotificationService';
import { eventBus } from './eventBus';
import blogService from './blogService';
import broadcastService from './broadcastService';

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
    this.currentUserId = null;
    this.notifications = [];
    this.readIds = new Set();
    this.dismissedIds = new Set();
    this.realtimeChannels = [];
    this.eventUnsubscribers = [];
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
    if (this.currentRole === role && this.currentContextId === contextId && this.currentUserId === userId && this.isInitialized) {
      return;
    }

    this.cleanup();
    this.currentRole = role;
    this.currentContextId = contextId;
    this.currentUserId = userId;
    this.notifications = this.loadStoredNotifications();
    this.readIds = this.loadReadIds();
    this.dismissedIds = this.loadDismissedIds();
    this.isInitialized = true;

    this.setupLocalEventListeners(role, contextId, userId);
    this.fetchInitialRoleData(role, contextId, userId);
    this.subscribeRealtime(role, contextId, userId);

    // ✅ Reconnect realtime channels when browser comes back online
    const onOnline = () => {
      console.log('[SchoolNotificationService] Network restored — reconnecting realtime channels...');
      this.realtimeChannels.forEach(ch => {
        try { supabase.removeChannel(ch); } catch {}
      });
      this.realtimeChannels = [];
      this.subscribeRealtime(role, contextId, userId);
    };
    window.addEventListener('online', onOnline);
    this.eventUnsubscribers.push(() => window.removeEventListener('online', onOnline));

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
   * Set up local event bus and window event listeners for instantaneous notifications
   */
  setupLocalEventListeners(role, contextId, userId) {
    // 1. Score submission event listener (Teachers and Headteachers)
    const onScoreSubmitted = (e) => {
      const detail = e?.detail || {};
      const sameSchool = !detail.schoolId || String(detail.schoolId) === String(contextId);
      if (!sameSchool) return;

      if (role === 'headteacher') {
        this.addNotification({
          id: `score_sub_${Date.now()}`,
          title: `📝 Scores Submitted: ${detail.className || 'Class'} - ${detail.subjectName || 'Subject'}`,
          message: `${detail.teacherName || 'Teacher'} submitted terminal marks for ${detail.term || 'Term'}, ${detail.academicYear || ''}.`,
          category: 'scores',
          actionUrl: '/scores',
          actionLabel: 'Review Scores',
          severity: 'info'
        }, true, true);
      } else if (role === 'teacher') {
        const isSelf = String(detail.teacherId) === String(userId);
        this.addNotification({
          id: `score_sub_t_${Date.now()}`,
          title: `✅ Scores Submitted: ${detail.className || 'Class'} - ${detail.subjectName || 'Subject'}`,
          message: isSelf
            ? `Your terminal scores for ${detail.term || 'Term'}, ${detail.academicYear || ''} were successfully submitted.`
            : `${detail.teacherName || 'A teacher'} submitted marks for ${detail.className || 'class'}.`,
          category: 'scores',
          actionUrl: '/scores',
          actionLabel: 'View Scores',
          severity: 'success'
        }, true, true);
      }
    };

    // 2. Blog post publication event listener (Headteachers, Teachers, and Parents)
    const onBlogPublished = (e) => {
      const detail = e?.detail || {};
      if (!detail.title) return;

      this.addNotification({
        id: `blog_pub_${detail.id || Date.now()}`,
        title: `📰 New Blog Post: ${detail.title}`,
        message: detail.summary || 'A new educational policy guide & article has just been published on Labour Edu.',
        category: 'blog',
        actionUrl: `/blog/${detail.slug || detail.id || ''}`,
        actionLabel: 'Read Post',
        severity: 'info'
      }, true, true);
    };

    // 3. Referral event listener (Headteachers and Teachers)
    const onReferralEvent = (e) => {
      const detail = e?.detail || {};
      const isReferrer = !detail.referrerSchoolId || String(detail.referrerSchoolId) === String(contextId);
      const isReferred = detail.referredSchoolId && String(detail.referredSchoolId) === String(contextId);

      if (detail.type === 'ATTACHED' && isReferrer) {
        this.addNotification({
          id: `ref_attach_${Date.now()}`,
          title: '🤝 New Referral Registered!',
          message: `${detail.schoolName || 'A partner school'} just joined Labour Edu using your referral code!`,
          category: 'referrals',
          actionUrl: '/referrals',
          actionLabel: 'View Referrals',
          severity: 'success'
        }, true, true);
      } else if (detail.type === 'REWARD_ISSUED') {
        if (isReferrer) {
          const amt = Number(detail.amount) || 20;
          this.addNotification({
            id: `ref_reward_${Date.now()}`,
            title: '🎁 Referral Bonus Credited!',
            message: `GH₵ ${amt.toFixed(2)} referral reward has been credited to your school wallet.`,
            category: 'finance',
            actionUrl: '/referrals',
            actionLabel: 'View Wallet',
            severity: 'success'
          }, true, true);
        } else if (isReferred) {
          this.addNotification({
            id: `ref_welcome_${Date.now()}`,
            title: '🎉 Welcome Bonus Credited!',
            message: 'A welcome bonus has been credited to your school wallet for joining via referral.',
            category: 'finance',
            actionUrl: '/referrals',
            actionLabel: 'View Wallet',
            severity: 'success'
          }, true, true);
        }
      }
    };

    window.addEventListener('school-scores-submitted', onScoreSubmitted);
    window.addEventListener('school-blog-published', onBlogPublished);

    // 4. Developer Broadcast announcement event listener (Headteachers, Teachers, and Parents)
    const onBroadcastEvent = (e) => {
      const b = e?.detail;
      if (!b || !b.title) return;
      const userRole = role === 'super_admin' ? 'headteacher' : (role || 'all');
      if (b.targetAudience && b.targetAudience !== 'all' && b.targetAudience !== userRole) return;

      this.addNotification({
        id: `broadcast_${b.id || Date.now()}`,
        title: `📢 ${b.title}`,
        message: b.content || 'Official message from Platform Developer.',
        category: 'broadcast',
        timestamp: b.createdAt || new Date().toISOString(),
        actionUrl: b.actionUrl || null,
        actionLabel: b.actionLabel || 'View Notice',
        severity: b.severity || 'info'
      }, true, true);
    };
    window.addEventListener('platform-broadcast-updated', onBroadcastEvent);

    this.eventUnsubscribers.push(() => {
      window.removeEventListener('school-scores-submitted', onScoreSubmitted);
      window.removeEventListener('school-blog-published', onBlogPublished);
      window.removeEventListener('platform-broadcast-updated', onBroadcastEvent);
    });

    // EventBus domain events — single source of truth for referrals
    const unsubBusRefAttach = eventBus.subscribe('ReferralAttached', (record) => {
      if (record && (!record.referrerSchoolId || String(record.referrerSchoolId) === String(contextId))) {
        this.addNotification({
          id: `bus_ref_attach_${record.id || Date.now()}`,
          title: '🤝 New Referral Registered!',
          message: `A new school joined using your referral code (${record.referralCodeUsed || ''})!`,
          category: 'referrals',
          actionUrl: '/referrals',
          actionLabel: 'View Referrals',
          severity: 'success'
        }, true, true);
      }
    });

    const unsubBusRefReward = eventBus.subscribe('ReferralRewardIssued', (record) => {
      if (record && (!record.referrerSchoolId || String(record.referrerSchoolId) === String(contextId))) {
        const amt = Number(record.rewardAmount) || 20;
        this.addNotification({
          id: `bus_ref_reward_${record.id || Date.now()}`,
          title: '🎁 Referral Bonus Credited!',
          message: `GH₵ ${amt.toFixed(2)} referral reward has been credited to your school wallet!`,
          category: 'finance',
          actionUrl: '/referrals',
          actionLabel: 'View Wallet',
          severity: 'success'
        }, true, true);
      }
    });

    this.eventUnsubscribers.push(unsubBusRefAttach, unsubBusRefReward);
  }

  /**
   * Fetch initial notifications on first boot (marked as read historical baseline)
   */
  async fetchInitialRoleData(role, contextId, userId) {
    if (!contextId) return;

    try {
      const seedKey = `labour_edu_seed_done_${role}_${contextId}`;
      const alreadySeeded = localStorage.getItem(seedKey);

      // Check recent published blog posts (for all roles)
      try {
        const posts = await blogService.getAllPosts();
        if (Array.isArray(posts) && posts.length > 0) {
          const publishedPosts = posts.filter(p => p.is_published !== false);
          if (publishedPosts.length > 0) {
            const latest = publishedPosts[0];
            const blogNotifId = `blog_post_init_${latest.id || latest.slug}`;
            if (!this.dismissedIds.has(blogNotifId) && !this.notifications.some(n => n.id === blogNotifId)) {
              // Only trigger as unread if created recently and not already seeded
              const isRecent = latest.date && (new Date() - new Date(latest.date)) < (48 * 60 * 60 * 1000);
              const notif = {
                id: blogNotifId,
                title: `📰 ${latest.title}`,
                message: latest.summary || 'Official educational guide & policy update on Labour Edu.',
                category: 'blog',
                timestamp: latest.date ? new Date(latest.date).toISOString() : new Date().toISOString(),
                actionUrl: `/blog/${latest.slug || latest.id}`,
                actionLabel: 'Read Article',
                severity: 'info',
                isRead: alreadySeeded || !isRecent
              };
              if (notif.isRead) {
                this.readIds.add(blogNotifId);
              }
              this.notifications.push(notif);
            }
          }
        }
      } catch (blogErr) {
        console.warn('[SchoolNotificationService] Blog fetch error in baseline:', blogErr);
      }

      // Check active platform developer broadcasts (for all roles)
      try {
        const activeBroadcasts = broadcastService.getActiveBroadcastsForRole(role);
        if (Array.isArray(activeBroadcasts) && activeBroadcasts.length > 0) {
          activeBroadcasts.forEach(b => {
            const bNotifId = `broadcast_${b.id}`;
            if (!this.dismissedIds.has(bNotifId) && !this.notifications.some(n => n.id === bNotifId)) {
              this.notifications.push({
                id: bNotifId,
                title: `📢 ${b.title}`,
                message: b.content || 'Official announcement from Developer.',
                category: 'broadcast',
                timestamp: b.createdAt || new Date().toISOString(),
                actionUrl: b.actionUrl || null,
                actionLabel: b.actionLabel || 'View Notice',
                severity: b.severity || 'info',
                isRead: this.readIds.has(bNotifId)
              });
            }
          });
        }
      } catch (bErr) {
        console.warn('[SchoolNotificationService] Broadcast check error in baseline:', bErr);
      }

      // Check recent referrals for school staff (Headteachers & Teachers)
      if (role === 'headteacher' || role === 'teacher') {
        try {
          const recentReferrals = await db.referrals
            .where('referrerSchoolId')
            .equals(String(contextId))
            .toArray();

          if (recentReferrals && recentReferrals.length > 0) {
            const rewardedCount = recentReferrals.filter(r => r.status === 'REWARDED').length;
            const refId = `referral_summary_${contextId}`;
            if (!this.dismissedIds.has(refId) && !this.notifications.some(n => n.id === refId)) {
              this.readIds.add(refId);
              this.notifications.push({
                id: refId,
                title: '🤝 Referral Program Active',
                message: `Your school has ${recentReferrals.length} active referral(s) (${rewardedCount} bonus rewarded).`,
                category: 'referrals',
                timestamp: new Date().toISOString(),
                actionUrl: '/referrals',
                actionLabel: 'Referral Hub',
                severity: 'success',
                isRead: true
              });
            }
          }
        } catch (refErr) {
          console.warn('[SchoolNotificationService] Referral check error:', refErr);
        }
      }

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
          const id = `assignment_notice_${userId || contextId}`;
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
        // 1. Listen for score submissions by teachers (INSERT & UPDATE where is_submitted is true)
        const scoreChannel = supabase
          .channel(`school_scores_${contextId}_${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'report_scores', filter: `school_id=eq.${contextId}` },
            (payload) => {
              const rec = payload.new;
              if (rec && rec.is_submitted) {
                this.addNotification({
                  id: `score_live_${rec.id || Date.now()}`,
                  title: '📝 Scores Submitted by Teacher',
                  message: `Assessment records updated and submitted for marks review.`,
                  category: 'scores',
                  actionUrl: '/scores',
                  actionLabel: 'Inspect Broadsheet',
                  severity: 'info'
                }, true, true);
              }
            }
          )
          .subscribe();

        // 2. Listen for referrals & rewards
        const referralChannel = supabase
          .channel(`school_referrals_${contextId}_${Date.now()}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'report_referrals', filter: `referrer_school_id=eq.${contextId}` },
            () => {
              this.addNotification({
                id: `referral_live_${Date.now()}`,
                title: '🤝 New Referral Registered!',
                message: 'A new school has registered using your school referral code.',
                category: 'referrals',
                actionUrl: '/referrals',
                actionLabel: 'View Referrals',
                severity: 'success'
              }, true, true);
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'report_referrals', filter: `referrer_school_id=eq.${contextId}` },
            (payload) => {
              const rec = payload.new;
              if (rec && rec.status === 'REWARDED') {
                this.addNotification({
                  id: `referral_reward_${rec.id || Date.now()}`,
                  title: '🎁 Referral Bonus Credited!',
                  message: `Your referral reward has been approved and credited to your wallet!`,
                  category: 'finance',
                  actionUrl: '/referrals',
                  actionLabel: 'View Wallet',
                  severity: 'success'
                }, true, true);
              }
            }
          )
          .subscribe();

        // 3. Listen for new wallet deposits & fee payments
        const walletChannel = supabase
          .channel(`school_wallet_${contextId}_${Date.now()}`)
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

        this.realtimeChannels.push(scoreChannel, referralChannel, walletChannel);

      } else if (role === 'teacher') {
        const assignChannel = supabase
          .channel(`teacher_assignments_${userId || contextId}_${Date.now()}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'report_teacher_assignments', filter: `teacher_id=eq.${userId || contextId}` },
            () => {
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

        // Teachers also receive referral updates for their school
        const teacherReferralChannel = supabase
          .channel(`teacher_referrals_${contextId}_${Date.now()}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'report_referrals', filter: `referrer_school_id=eq.${contextId}` },
            () => {
              this.addNotification({
                id: `teacher_ref_live_${Date.now()}`,
                title: '🤝 New School Referral!',
                message: 'A new partner school joined using your school referral code.',
                category: 'referrals',
                actionUrl: '/referrals',
                actionLabel: 'View Referrals',
                severity: 'success'
              }, true, true);
            }
          )
          .subscribe();

        this.realtimeChannels.push(assignChannel, teacherReferralChannel);

      } else if (role === 'parent') {
        const reportChannel = supabase
          .channel(`parent_reports_${contextId}_${Date.now()}`)
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

      // Universal Blog Channel (for Headteachers, Teachers, and Parents)
      const blogChannel = supabase
        .channel(`school_notifications_blog_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'blog_posts' },
          (payload) => {
            const p = payload.new;
            if (p && p.is_published !== false) {
              this.addNotification({
                id: `blog_post_${p.id || Date.now()}`,
                title: `📰 New Blog Post: ${p.title}`,
                message: p.summary || 'A new educational policy guide & article has just been published on Labour Edu.',
                category: 'blog',
                actionUrl: `/blog/${p.slug || p.id}`,
                actionLabel: 'Read Article',
                severity: 'info'
              }, true, true);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'blog_posts' },
          (payload) => {
            const p = payload.new;
            if (p && p.is_published !== false) {
              this.addNotification({
                id: `blog_post_update_${p.id || Date.now()}`,
                title: `📰 Updated Blog Post: ${p.title}`,
                message: p.summary || 'An official educational guide or directive has been updated.',
                category: 'blog',
                actionUrl: `/blog/${p.slug || p.id}`,
                actionLabel: 'Read Article',
                severity: 'info'
              }, true, true);
            }
          }
        )
        .subscribe();

      // Platform Broadcast Announcements Channel (for Headteachers, Teachers, and Parents)
      const broadcastChannel = supabase
        .channel(`school_notifications_broadcast_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'platform_broadcast_announcements' },
          (payload) => {
            const b = payload.new;
            if (b && b.is_active !== false) {
              const userRole = role === 'super_admin' ? 'headteacher' : (role || 'all');
              if (b.target_audience && b.target_audience !== 'all' && b.target_audience !== userRole) return;
              this.addNotification({
                id: `broadcast_${b.id || Date.now()}`,
                title: `📢 ${b.title}`,
                message: b.content || 'Official message from Platform Developer.',
                category: 'broadcast',
                timestamp: b.created_at || new Date().toISOString(),
                actionUrl: b.action_url || null,
                actionLabel: b.action_label || 'View Notice',
                severity: b.severity || 'info'
              }, true, true);
            }
          }
        )
        .subscribe();

      this.realtimeChannels.push(blogChannel, broadcastChannel);
    } catch (err) {
      console.warn('[SchoolNotificationService] Realtime subscription error:', err);
    }
  }

  cleanup() {
    this.eventUnsubscribers.forEach(unsub => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch (e) {}
    });
    this.eventUnsubscribers = [];

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
