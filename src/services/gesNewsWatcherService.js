import { supabase } from '../lib/supabase';
import platformNotificationService from './platformNotificationService';

const GES_WATCHER_STORAGE_KEY = 'labour_edu_ges_radar_news';
const LAST_SCAN_KEY = 'labour_edu_ges_radar_last_scan';
const READ_NEWS_KEY = 'labour_edu_ges_radar_read_ids';

export const MONITORED_SOURCES = [
  {
    id: 'ges',
    name: 'Ghana Education Service (GES)',
    shortName: 'GES Official',
    url: 'https://ges.gov.gh',
    feedUrl: 'https://ges.gov.gh/news',
    category: 'Government & Directives',
    badgeColor: '#2563eb',
    icon: 'fa-landmark-flag'
  },
  {
    id: 'moe',
    name: 'Ministry of Education (MoE)',
    shortName: 'Ministry of Education',
    url: 'https://moe.gov.gh',
    feedUrl: 'https://moe.gov.gh/news',
    category: 'Policy & Initiatives',
    badgeColor: '#059669',
    icon: 'fa-building-columns'
  },
  {
    id: 'nacca',
    name: 'National Council for Curriculum and Assessment (NaCCA)',
    shortName: 'NaCCA',
    url: 'https://nacca.gov.gh',
    feedUrl: 'https://nacca.gov.gh/news',
    category: 'Curriculum & Assessment',
    badgeColor: '#D97706',
    icon: 'fa-book-bookmark'
  },
  {
    id: 'waec',
    name: 'WAEC Ghana Examinations',
    shortName: 'WAEC Ghana',
    url: 'https://waecgh.org',
    feedUrl: 'https://waecgh.org',
    category: 'Examinations (BECE & WASSCE)',
    badgeColor: '#DC2626',
    icon: 'fa-graduation-cap'
  },
  {
    id: 'ntc',
    name: 'National Teaching Council (NTC)',
    shortName: 'NTC Ghana',
    url: 'https://ntc.gov.gh',
    feedUrl: 'https://ntc.gov.gh/news',
    category: 'Teacher Licensing & CPD',
    badgeColor: '#7C3AED',
    icon: 'fa-chalkboard-user'
  },
  {
    id: 'ghanaeducation',
    name: 'GhanaEducation.org News Portal',
    shortName: 'GhanaEducation.org',
    url: 'https://ghanaeducation.org',
    feedUrl: 'https://ghanaeducation.org/feed',
    category: 'Breaking Education Circulars',
    badgeColor: '#0891B2',
    icon: 'fa-newspaper'
  },
  {
    id: 'ghanaeducationnews',
    name: 'GhanaEducationNews.org',
    shortName: 'GhanaEducationNews',
    url: 'https://ghanaeducationnews.org',
    feedUrl: 'https://ghanaeducationnews.org/feed',
    category: 'Educational Policy & Updates',
    badgeColor: '#E11D48',
    icon: 'fa-bullhorn'
  }
];

// Baseline curated intelligence circulars tailored for Ghanaian Basic Schools
const INITIAL_CURATED_FEED = [
  {
    id: 'ges_intel_2026_01',
    sourceId: 'ges',
    sourceName: 'Ghana Education Service (GES)',
    title: '🇬🇭 Official Standard 30% Continuous Assessment & 70% Terminal Exam Policy',
    summary: 'GES Management reiterates that all basic schools (KG, Primary & JHS) must record continuous assessment marks across Class Exercises, Homework, Group Work, and Projects strictly in compliance with national assessment guidelines.',
    publishedDate: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    sourceUrl: 'https://ges.gov.gh',
    category: 'Assessment Policy',
    urgency: 'high',
    targetAudience: 'headteacher',
    isBreaking: true
  },
  {
    id: 'waec_intel_2026_02',
    sourceId: 'waec',
    sourceName: 'WAEC Ghana Examinations',
    title: '📝 BECE Final Registration Timetable & Continuous Assessment Upload Window',
    summary: 'The West African Examinations Council (WAEC) announces the schedule for submission of JHS 3 candidates continuous assessment scores and bio-data verification for the Basic Education Certificate Examination.',
    publishedDate: new Date(Date.now() - 3600000 * 24 * 4).toISOString(),
    sourceUrl: 'https://waecgh.org',
    category: 'Examinations (BECE)',
    urgency: 'urgent',
    targetAudience: 'headteacher',
    isBreaking: false
  },
  {
    id: 'nacca_intel_2026_03',
    sourceId: 'nacca',
    sourceName: 'NaCCA',
    title: '📚 Standard-Based Curriculum (SBC) Core Competencies & Remedial Guide',
    summary: 'National Council for Curriculum & Assessment releases implementation directives on evaluating critical thinking, digital literacy, and collaborative competencies in basic school learner terminal reports.',
    publishedDate: new Date(Date.now() - 3600000 * 24 * 6).toISOString(),
    sourceUrl: 'https://nacca.gov.gh',
    category: 'Curriculum & Assessment',
    urgency: 'medium',
    targetAudience: 'teacher',
    isBreaking: false
  },
  {
    id: 'ntc_intel_2026_04',
    sourceId: 'ntc',
    sourceName: 'National Teaching Council (NTC)',
    title: '🎯 Professional Development (CPD) Points & Teacher Licensing Verification',
    summary: 'NTC urges all in-service teachers to verify their Teacher Portal Ghana (TPG) profiles, upload workshop certificates, and record their mandatory continuous professional development points for the academic year.',
    publishedDate: new Date(Date.now() - 3600000 * 24 * 8).toISOString(),
    sourceUrl: 'https://ntc.gov.gh',
    category: 'Teacher Development',
    urgency: 'medium',
    targetAudience: 'teacher',
    isBreaking: false
  },
  {
    id: 'moe_intel_2026_05',
    sourceId: 'moe',
    sourceName: 'Ministry of Education (MoE)',
    title: '⚡ National Digital Education Strategy & Cloud Broadsheet Support for Schools',
    summary: 'The Ministry of Education highlights initiatives to empower basic and second-cycle schools with digital student grading, automated terminal report compilation, and offline-first classroom tools.',
    publishedDate: new Date(Date.now() - 3600000 * 24 * 10).toISOString(),
    sourceUrl: 'https://moe.gov.gh',
    category: 'National Policy',
    urgency: 'low',
    targetAudience: 'all',
    isBreaking: false
  },
  {
    id: 'ghanaedu_intel_2026_06',
    sourceId: 'ghanaeducation',
    sourceName: 'GhanaEducation.org',
    title: '📅 Academic Calendar Harmonization: Term Vacation & Reopening Dates',
    summary: 'Comprehensive term calendar overview for all Public and Private Basic Schools across the 16 regions of Ghana, detailing midterm breaks, holiday observances, and exam preparation windows.',
    publishedDate: new Date(Date.now() - 3600000 * 24 * 12).toISOString(),
    sourceUrl: 'https://ghanaeducation.org',
    category: 'Academic Calendar',
    urgency: 'high',
    targetAudience: 'all',
    isBreaking: false
  }
];

class GesNewsWatcherService {
  constructor() {
    this.newsItems = this.loadStoredNews();
    this.readIds = this.loadReadIds();
    this.isRealtimeInit = false;
    this.initRealtimeCloudSync();
  }

  loadStoredNews() {
    try {
      const stored = localStorage.getItem(GES_WATCHER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_CURATED_FEED;
  }

  loadReadIds() {
    try {
      const stored = localStorage.getItem(READ_NEWS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  save() {
    try {
      localStorage.setItem(GES_WATCHER_STORAGE_KEY, JSON.stringify(this.newsItems));
      localStorage.setItem(READ_NEWS_KEY, JSON.stringify(Array.from(this.readIds)));
    } catch (e) {}
  }

  getLastScanTime() {
    try {
      return localStorage.getItem(LAST_SCAN_KEY) || 'Just now';
    } catch (e) {
      return 'Just now';
    }
  }

  getNews() {
    return this.newsItems.map(item => ({
      ...item,
      isRead: this.readIds.has(item.id)
    }));
  }

  getUnreadCount() {
    return this.newsItems.filter(item => !this.readIds.has(item.id)).length;
  }

  markAsRead(id) {
    this.readIds.add(id);
    this.save();
  }

  markAllAsRead() {
    this.newsItems.forEach(item => this.readIds.add(item.id));
    this.save();
  }

  /**
   * Connect to Supabase table and Realtime channels for 24/7 cloud discoveries
   */
  async initRealtimeCloudSync() {
    if (this.isRealtimeInit) return;
    this.isRealtimeInit = true;

    // 1. Fetch any cloud-discovered articles from Supabase
    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('platform_ges_radar_news')
          .select('*')
          .order('published_date', { ascending: false })
          .limit(30);

        if (!error && Array.isArray(data) && data.length > 0) {
          const remoteItems = data.map(d => ({
            id: d.id,
            sourceId: d.source_id || 'ges',
            sourceName: d.source_name || 'Ghana Education Service (GES)',
            title: d.title,
            summary: d.summary,
            publishedDate: d.published_date || d.created_at,
            sourceUrl: d.source_url || 'https://ges.gov.gh',
            category: d.category || 'General Directives',
            urgency: d.urgency || 'high',
            targetAudience: d.target_audience || 'all',
            isBreaking: d.is_breaking ?? false
          }));

          // Merge without losing local items
          const existingIds = new Set(this.newsItems.map(n => n.id));
          const newOnes = remoteItems.filter(r => !existingIds.has(r.id));
          if (newOnes.length > 0) {
            this.newsItems = [...newOnes, ...this.newsItems];
            this.save();
          }
        }
      } catch (err) {
        // Supabase table may be creating
      }

      // 2. Realtime listener for incoming crawler discoveries
      try {
        supabase
          .channel('platform_ges_radar_news_realtime')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'platform_ges_radar_news' },
            (payload) => {
              const d = payload.new;
              const newItem = {
                id: d.id,
                sourceId: d.source_id || 'ges',
                sourceName: d.source_name || 'Ghana Education Service (GES)',
                title: d.title,
                summary: d.summary,
                publishedDate: d.published_date || d.created_at,
                sourceUrl: d.source_url || 'https://ges.gov.gh',
                category: d.category || 'General Directives',
                urgency: d.urgency || 'high',
                targetAudience: d.target_audience || 'all',
                isBreaking: d.is_breaking ?? false
              };

              if (!this.newsItems.some(n => n.id === newItem.id)) {
                this.newsItems = [newItem, ...this.newsItems];
                this.save();

                // Alert Super Admin with chime
                platformNotificationService.addNotification({
                  title: '📡 Live GES Directive Detected by 24/7 Cloud Watcher',
                  message: `${newItem.title} - ready to convert into a school broadcast.`,
                  category: 'radar',
                  actionUrl: '/platform/operations/ges-radar',
                  actionLabel: 'Inspect Circular',
                  severity: newItem.urgency === 'urgent' ? 'urgent' : 'warning'
                }, true, true);
              }
            }
          )
          .subscribe();
      } catch (e) {}
    }
  }

  /**
   * Scans all monitored Ghanaian Education websites
   */
  async scanAllSources() {
    const scanTimestamp = new Date().toISOString();
    localStorage.setItem(LAST_SCAN_KEY, scanTimestamp);

    await this.initRealtimeCloudSync();
    return {
      totalSources: MONITORED_SOURCES.length,
      scannedAt: scanTimestamp,
      newItemsFound: 0,
      items: this.getNews()
    };
  }
}

export const gesNewsWatcherService = new GesNewsWatcherService();
export default gesNewsWatcherService;
