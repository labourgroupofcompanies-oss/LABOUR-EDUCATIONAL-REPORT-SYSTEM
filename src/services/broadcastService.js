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
  }

  loadLocalBroadcasts() {
    try {
      const stored = localStorage.getItem(BROADCASTS_LOCAL_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}

    // Default seed templates
    return [
      {
        id: 'b_ges_standard_1',
        title: '🇬🇭 GES Academic Term 3 Score Entry Directive',
        content: 'All Basic Schools are reminded that terminal broadsheet submission and continuous assessment computation must follow the standard 30% CA and 70% Exam marks weighting.',
        targetAudience: 'all', // 'all' | 'headteacher' | 'teacher' | 'parent'
        severity: 'warning', // 'info' | 'warning' | 'urgent' | 'success'
        bannerEnabled: true,
        modalEnabled: false,
        blogUrl: '/blog/ges-continuous-assessment-policy-guide',
        blogTitle: 'GES Continuous Assessment & Grading Guide',
        actionUrl: '/scores',
        actionLabel: 'Check Scores Status',
        isActive: true,
        createdAt: new Date().toISOString(),
        author: 'Platform Super Admin'
      }
    ];
  }

  saveLocalBroadcasts() {
    try {
      localStorage.setItem(BROADCASTS_LOCAL_KEY, JSON.stringify(this.broadcasts));
    } catch (e) {}
  }

  async getAllBroadcasts() {
    // Attempt to pull remote broadcasts from Supabase if online
    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('platform_broadcast_announcements')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          const formatted = data.map(item => ({
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

          this.broadcasts = formatted;
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

    this.broadcasts = [newBroadcast, ...this.broadcasts];
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

        // Also broadcast as school notification in report_notifications
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
      await db.notifications.add({
        title: newBroadcast.title,
        content: newBroadcast.content,
        created_at: newBroadcast.createdAt,
        isRead: false
      });
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

  getActiveBroadcastsForRole(role) {
    const userRole = role === 'super_admin' ? 'headteacher' : (role || 'all');
    const dismissed = this.getDismissedBroadcastIds();

    return this.broadcasts.filter(b => {
      if (!b.isActive) return false;
      if (dismissed.includes(b.id)) return false;
      if (b.targetAudience === 'all') return true;
      if (b.targetAudience === userRole) return true;
      return false;
    });
  }

  getDismissedBroadcastIds() {
    try {
      const stored = localStorage.getItem(DISMISSED_BROADCASTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  dismissBroadcast(id) {
    const dismissed = this.getDismissedBroadcastIds();
    if (!dismissed.includes(id)) {
      dismissed.push(id);
      localStorage.setItem(DISMISSED_BROADCASTS_KEY, JSON.stringify(dismissed));
    }
    window.dispatchEvent(new CustomEvent('platform-broadcast-updated'));
  }
}

export const broadcastService = new BroadcastService();
export default broadcastService;
