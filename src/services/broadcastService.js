import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

const BROADCASTS_LOCAL_KEY = 'labour_edu_platform_broadcasts';
const DISMISSED_BROADCASTS_KEY = 'labour_edu_dismissed_broadcasts';

/**
 * Service for Platform Super Admins to broadcast announcements to Schools, Teachers, and Parents
 */
class BroadcastService {
  constructor() {
    this.broadcasts = this.loadLocalBroadcasts();
    this.saveLocalBroadcasts();
  }

  loadLocalBroadcasts() {
    try {
      const stored = localStorage.getItem(BROADCASTS_LOCAL_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter(b => b && b.id !== 'b_ges_standard_1');
        }
      }
    } catch (e) {}
    return [];
  }

  saveLocalBroadcasts() {
    try {
      localStorage.setItem(BROADCASTS_LOCAL_KEY, JSON.stringify(this.broadcasts));
    } catch (e) {}
  }

  normalizeRole(role) {
    if (!role || role === 'all') return 'all';
    const r = String(role).toLowerCase().trim();
    if (['headteacher', 'super_admin', 'admin', 'school_admin', 'proprietor'].includes(r)) {
      return 'headteacher';
    }
    if (['teacher'].includes(r)) return 'teacher';
    if (['parent'].includes(r)) return 'parent';
    return r;
  }

  async getAllBroadcasts() {
    // 1. Attempt to pull remote broadcasts from Supabase if online
    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('platform_broadcast_announcements')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const formatted = data
            .filter(item => item && item.id !== 'b_ges_standard_1')
            .map(item => ({
              id: item.id,
              title: item.title,
              content: item.content,
              targetAudience: item.target_audience || 'all',
              severity: item.severity || 'info',
              bannerEnabled: item.banner_enabled ?? true,
              modalEnabled: item.modal_enabled ?? false,
              blogUrl: item.blog_url || item.blogUrl || null,
              blogTitle: item.blog_title || item.blogTitle || null,
              actionUrl: item.action_url || null,
              actionLabel: item.action_label || 'View Details',
              isActive: item.is_active ?? true,
              expiresAt: item.expires_at || null,
              createdAt: item.created_at,
              author: item.author || 'Platform Super Admin'
            }));

          // Merge local broadcasts with remote
          const localOnly = this.broadcasts.filter(l => !formatted.some(r => r.id === l.id));
          this.broadcasts = [...formatted, ...localOnly];
          this.saveLocalBroadcasts();
          return this.broadcasts;
        }
      } catch (err) {
        // Fallback to local storage
      }
    }
    return this.broadcasts;
  }

  async createBroadcast(payload) {
    const id = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newBroadcast = {
      id,
      title: payload.title || 'Platform Announcement',
      content: payload.content || '',
      targetAudience: payload.targetAudience || 'all',
      severity: payload.severity || 'info',
      bannerEnabled: payload.bannerEnabled ?? true,
      modalEnabled: payload.modalEnabled ?? false,
      blogUrl: payload.blogUrl || null,
      blogTitle: payload.blogTitle || null,
      actionUrl: payload.actionUrl || null,
      actionLabel: payload.actionLabel || 'View Details',
      isActive: true,
      expiresAt: payload.expiresAt || null,
      createdAt: new Date().toISOString(),
      author: payload.author || 'Platform Super Admin'
    };

    this.broadcasts = [newBroadcast, ...this.broadcasts.filter(b => b.id !== id)];
    this.saveLocalBroadcasts();

    // Push to Supabase if table exists
    if (navigator.onLine) {
      try {
        await supabase
          .from('platform_broadcast_announcements')
          .insert({
            id: newBroadcast.id,
            title: newBroadcast.title,
            content: newBroadcast.content,
            target_audience: newBroadcast.targetAudience,
            severity: newBroadcast.severity,
            banner_enabled: newBroadcast.bannerEnabled,
            modal_enabled: newBroadcast.modalEnabled,
            action_url: newBroadcast.actionUrl,
            action_label: newBroadcast.actionLabel,
            is_active: newBroadcast.isActive,
            expires_at: newBroadcast.expiresAt,
            created_at: newBroadcast.createdAt,
            author: newBroadcast.author
          });

        // Also broadcast as notification in report_notifications
        await supabase
          .from('report_notifications')
          .insert({
            title: newBroadcast.title,
            content: newBroadcast.content,
            created_at: newBroadcast.createdAt
          });
      } catch (e) {
        console.warn('[BroadcastService] Remote broadcast sync note:', e);
      }
    }

    // Trigger local Dexie notification update
    try {
      if (db.notifications) {
        await db.notifications.add({
          title: newBroadcast.title,
          content: newBroadcast.content,
          created_at: newBroadcast.createdAt,
          isRead: false
        });
      }
    } catch (e) {}

    // Dispatch global custom event for instant banner display
    window.dispatchEvent(new CustomEvent('platform-broadcast-updated', { detail: newBroadcast }));
    return newBroadcast;
  }

  async toggleBroadcastStatus(id, isActive) {
    this.broadcasts = this.broadcasts.map(b => b.id === id ? { ...b, isActive } : b);
    this.saveLocalBroadcasts();

    if (navigator.onLine) {
      try {
        await supabase
          .from('platform_broadcast_announcements')
          .update({ is_active: isActive })
          .eq('id', id);
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('platform-broadcast-updated'));
    return true;
  }

  async deleteBroadcast(id) {
    this.broadcasts = this.broadcasts.filter(b => b.id !== id);
    this.saveLocalBroadcasts();

    if (navigator.onLine) {
      try {
        await supabase
          .from('platform_broadcast_announcements')
          .delete()
          .eq('id', id);
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('platform-broadcast-updated'));
    return true;
  }

  getDismissedKey(role = null, userId = null) {
    if (userId) return `${DISMISSED_BROADCASTS_KEY}_${userId}`;
    if (role) return `${DISMISSED_BROADCASTS_KEY}_${this.normalizeRole(role)}`;
    return DISMISSED_BROADCASTS_KEY;
  }

  getDismissedBroadcastIds(role = null, userId = null) {
    try {
      const stored = localStorage.getItem(this.getDismissedKey(role, userId));
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  dismissBroadcast(id, role = null, userId = null) {
    const dismissed = this.getDismissedBroadcastIds(role, userId);
    if (!dismissed.includes(id)) {
      dismissed.push(id);
      try {
        localStorage.setItem(this.getDismissedKey(role, userId), JSON.stringify(dismissed));
      } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('platform-broadcast-updated'));
  }

  getActiveBroadcastsForRole(role, userId = null) {
    const userRole = this.normalizeRole(role);
    const dismissed = this.getDismissedBroadcastIds(userRole, userId);

    return this.broadcasts.filter(b => {
      if (!b || !b.isActive || b.id === 'b_ges_standard_1') return false;
      if (dismissed.includes(b.id)) return false;
      const target = this.normalizeRole(b.targetAudience);
      if (target === 'all') return true;
      if (target === userRole) return true;
      return false;
    });
  }
}

export const broadcastService = new BroadcastService();
export default broadcastService;
