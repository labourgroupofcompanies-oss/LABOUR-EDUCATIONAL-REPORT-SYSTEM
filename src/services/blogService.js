import { supabase } from '../lib/supabase';
import { DEFAULT_OFFLINE_MANUALS } from '../data/defaultManuals';

const CACHE_KEY = 'cached_user_manuals';
const DELETED_OFFLINE_KEY = 'deleted_offline_manual_ids';

const getDeletedOfflineIds = () => {
  try {
    const raw = localStorage.getItem(DELETED_OFFLINE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
};

const markOfflineIdDeleted = (id) => {
  try {
    const deleted = getDeletedOfflineIds();
    deleted.add(String(id));
    localStorage.setItem(DELETED_OFFLINE_KEY, JSON.stringify(Array.from(deleted)));
  } catch (e) {
    console.warn('[blogService] Failed to mark offline manual as deleted:', e);
  }
};

const isOfflineId = (id) => {
  if (id === null || id === undefined) return false;
  const strId = String(id);
  return strId.startsWith('offline-') || isNaN(Number(strId));
};

const sanitizePayload = (postData) => {
  const slug = postData.slug?.trim() || postData.title
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || `post-${Date.now()}`;

  const payload = {
    title: postData.title ? postData.title.trim() : '',
    slug: slug,
    category: postData.category || 'Administration',
    target_role: postData.target_role || 'All Users',
    featured_badge: postData.featured_badge || 'User Guide',
    read_time: postData.read_time || '3 min read',
    author: postData.author || 'Labour Edu Editorial Desk',
    summary: postData.summary || '',
    content: postData.content || '',
    cover_image: postData.cover_image || null,
    date: postData.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    is_published: postData.is_published !== undefined ? Boolean(postData.is_published) : true,
  };

  // Optional extended blogger fields
  if (postData.tags) {
    if (Array.isArray(postData.tags)) {
      payload.tags = postData.tags;
    } else if (typeof postData.tags === 'string') {
      payload.tags = postData.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
  }
  if (postData.post_type) payload.post_type = postData.post_type;
  if (postData.official_source_url) payload.official_source_url = postData.official_source_url;
  if (postData.official_source_name) payload.official_source_name = postData.official_source_name;
  if (postData.meta_description) payload.meta_description = postData.meta_description;

  return payload;
};

/**
 * Service for managing blog posts, guides, and manuals in Supabase
 */
const blogService = {
  /**
   * Fetch all blog posts with full offline fallback guarantee
   */
  async getAllPosts() {
    const deletedIds = getDeletedOfflineIds();
    const activeOfflineManuals = DEFAULT_OFFLINE_MANUALS.filter(m => !deletedIds.has(String(m.id)));

    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .order('id', { ascending: false });

        if (!error && Array.isArray(data)) {
          // Merge custom online posts with default offline essentials
          const onlineSlugs = new Set(data.map(p => p.slug || p.title));
          const combined = [
            ...data,
            ...activeOfflineManuals.filter(m => !onlineSlugs.has(m.slug) && !onlineSlugs.has(m.title))
          ];
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(combined));
          } catch (e) {
            console.warn('[blogService] Failed to cache manuals:', e);
          }
          return combined;
        }
      }

      // Offline / fallback path: check localStorage cache
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const updated = parsed.map(item => {
              if (isOfflineId(item.id)) {
                const fresh = DEFAULT_OFFLINE_MANUALS.find(m => String(m.id) === String(item.id) || m.slug === item.slug);
                return fresh || item;
              }
              return item;
            });
            return updated.filter(m => !deletedIds.has(String(m.id)));
          }
        } catch (e) {
          console.warn('[blogService] Failed to parse cached manuals:', e);
        }
      }

      // Default offline manuals guarantee
      return activeOfflineManuals;
    } catch (err) {
      console.warn('[blogService] getAllPosts exception, using offline fallback:', err);
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const updated = parsed.map(item => {
              if (isOfflineId(item.id)) {
                const fresh = DEFAULT_OFFLINE_MANUALS.find(m => String(m.id) === String(item.id) || m.slug === item.slug);
                return fresh || item;
              }
              return item;
            });
            return updated.filter(m => !deletedIds.has(String(m.id)));
          }
        } catch (e) {}
      }
      return activeOfflineManuals;
    }
  },

  /**
   * Fetch single post by ID or slug
   */
  async getPostById(id) {
    if (!id) throw new Error('Post ID is required');

    // If ID is offline string or non-numeric, resolve from local cache/defaults first
    if (isOfflineId(id)) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const found = parsed.find(p => String(p.id) === String(id) || p.slug === String(id));
          if (found) return found;
        } catch (e) {}
      }
      const defaultFound = DEFAULT_OFFLINE_MANUALS.find(m => String(m.id) === String(id) || m.slug === String(id));
      if (defaultFound) return defaultFound;
    }

    try {
      const isNumeric = /^\d+$/.test(String(id));
      let query = supabase.from('blog_posts').select('*');

      if (isNumeric) {
        query = query.eq('id', Number(id));
      } else {
        query = query.eq('slug', String(id));
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      if (data) return data;

      // Check fallback cache
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const found = parsed.find(p => String(p.id) === String(id) || p.slug === String(id));
          if (found) return found;
        } catch (e) {}
      }
      return null;
    } catch (err) {
      console.error('[blogService] getPostById error:', err);
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const found = parsed.find(p => String(p.id) === String(id) || p.slug === String(id));
          if (found) return found;
        } catch (e) {}
      }
      throw err;
    }
  },

  /**
   * Create a new blog post
   */
  async createPost(postData) {
    try {
      const payload = sanitizePayload(postData);

      if (navigator.onLine) {
        let insertData = [payload];
        let { data, error } = await supabase
          .from('blog_posts')
          .insert(insertData)
          .select();

        // If error might be due to extended columns not yet added to SQL, retry with core columns only
        if (error && error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          const corePayload = {
            title: payload.title,
            slug: payload.slug,
            category: payload.category,
            target_role: payload.target_role,
            featured_badge: payload.featured_badge,
            read_time: payload.read_time,
            author: payload.author,
            summary: payload.summary,
            content: payload.content,
            cover_image: payload.cover_image,
            date: payload.date,
            is_published: payload.is_published
          };
          const retryRes = await supabase.from('blog_posts').insert([corePayload]).select();
          data = retryRes.data;
          error = retryRes.error;
        }

        if (error) throw error;
        const newPost = data?.[0] || { ...payload, id: Date.now() };

        // Update local cache
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          const list = cached ? JSON.parse(cached) : [];
          localStorage.setItem(CACHE_KEY, JSON.stringify([newPost, ...list]));
        } catch (e) {}

        return newPost;
      }

      // Offline creation fallback
      const offlinePost = {
        ...payload,
        id: `offline-manual-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        const list = cached ? JSON.parse(cached) : [];
        localStorage.setItem(CACHE_KEY, JSON.stringify([offlinePost, ...list]));
      } catch (e) {}

      return offlinePost;
    } catch (err) {
      console.error('[blogService] createPost error:', err);
      throw err;
    }
  },

  /**
   * Update an existing blog post
   */
  async updatePost(id, postData) {
    try {
      const payload = sanitizePayload(postData);

      if (isOfflineId(id)) {
        const updatedOffline = {
          ...payload,
          id: id,
          updated_at: new Date().toISOString()
        };
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const list = JSON.parse(cached);
            const idx = list.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) {
              list[idx] = updatedOffline;
            } else {
              list.unshift(updatedOffline);
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(list));
          } catch (e) {}
        }
        return updatedOffline;
      }

      if (navigator.onLine) {
        let { data, error } = await supabase
          .from('blog_posts')
          .update(payload)
          .eq('id', Number(id))
          .select();

        // Safe fallback for core columns
        if (error && error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          const corePayload = {
            title: payload.title,
            slug: payload.slug,
            category: payload.category,
            target_role: payload.target_role,
            featured_badge: payload.featured_badge,
            read_time: payload.read_time,
            author: payload.author,
            summary: payload.summary,
            content: payload.content,
            cover_image: payload.cover_image,
            date: payload.date,
            is_published: payload.is_published
          };
          const retryRes = await supabase.from('blog_posts').update(corePayload).eq('id', Number(id)).select();
          data = retryRes.data;
          error = retryRes.error;
        }

        if (error) throw error;
        const updated = data?.[0] || { ...payload, id };

        // Update local cache
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const list = JSON.parse(cached);
            const idx = list.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) {
              list[idx] = { ...list[idx], ...updated };
              localStorage.setItem(CACHE_KEY, JSON.stringify(list));
            }
          }
        } catch (e) {}

        return updated;
      }

      throw new Error('You are currently offline. Connect to the internet to update this manual.');
    } catch (err) {
      console.error('[blogService] updatePost error:', err);
      throw err;
    }
  },

  /**
   * Delete a blog post
   */
  async deletePost(id) {
    try {
      if (isOfflineId(id)) {
        markOfflineIdDeleted(id);
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const list = JSON.parse(cached);
            const filtered = list.filter(p => String(p.id) !== String(id));
            localStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
          } catch (e) {}
        }
        return true;
      }

      if (navigator.onLine) {
        const { error } = await supabase
          .from('blog_posts')
          .delete()
          .eq('id', Number(id));

        if (error) throw error;

        // Update cache
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const list = JSON.parse(cached);
            const filtered = list.filter(p => String(p.id) !== String(id));
            localStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
          }
        } catch (e) {}

        return true;
      }

      throw new Error('Cannot delete online manual while offline.');
    } catch (err) {
      console.error('[blogService] deletePost error:', err);
      throw err;
    }
  }
};

export default blogService;
