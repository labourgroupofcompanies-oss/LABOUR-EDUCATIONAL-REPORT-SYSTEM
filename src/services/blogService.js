import { supabase } from '../lib/supabase';
import { DEFAULT_OFFLINE_MANUALS } from '../data/defaultManuals';

const CACHE_KEY = 'cached_user_manuals';

/**
 * Service for managing blog posts, guides, and manuals in Supabase
 */
const blogService = {
  /**
   * Fetch all blog posts with full offline fallback guarantee
   */
  async getAllPosts() {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .order('id', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          // Merge custom online posts with default offline essentials
          const onlineSlugs = new Set(data.map(p => p.slug || p.title));
          const combined = [
            ...data,
            ...DEFAULT_OFFLINE_MANUALS.filter(m => !onlineSlugs.has(m.slug) && !onlineSlugs.has(m.title))
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
            return parsed;
          }
        } catch (e) {
          console.warn('[blogService] Failed to parse cached manuals:', e);
        }
      }

      // Default offline manuals guarantee
      return DEFAULT_OFFLINE_MANUALS;
    } catch (err) {
      console.warn('[blogService] getAllPosts exception, using offline fallback:', err);
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (e) {}
      }
      return DEFAULT_OFFLINE_MANUALS;
    }
  },

  /**
   * Fetch single post by ID
   */
  async getPostById(id) {
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[blogService] getPostById error:', err);
      throw err;
    }
  },

  /**
   * Create a new blog post
   */
  async createPost(postData) {
    try {
      const slug = postData.slug?.trim() || postData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const payload = {
        title: postData.title.trim(),
        slug: slug,
        category: postData.category || 'Academia',
        target_role: postData.target_role || 'All Users',
        featured_badge: postData.featured_badge || 'User Guide',
        read_time: postData.read_time || '5 min read',
        author: postData.author || 'Labour Edu Editorial Team',
        summary: postData.summary || '',
        content: postData.content || '',
        cover_image: postData.cover_image || null,
        date: postData.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        is_published: postData.is_published !== undefined ? Boolean(postData.is_published) : true,
      };

      const { data, error } = await supabase
        .from('blog_posts')
        .insert([payload])
        .select();

      if (error) throw error;
      return data?.[0];
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
      const payload = { ...postData };
      delete payload.id;
      delete payload.created_at;

      const { data, error } = await supabase
        .from('blog_posts')
        .update(payload)
        .eq('id', id)
        .select();

      if (error) throw error;
      return data?.[0];
    } catch (err) {
      console.error('[blogService] updatePost error:', err);
      throw err;
    }
  },

  /**
   * Toggle published state
   */
  async togglePublishStatus(id, currentStatus) {
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .update({ is_published: !currentStatus })
        .eq('id', id)
        .select();

      if (error) throw error;
      return data?.[0];
    } catch (err) {
      console.error('[blogService] togglePublishStatus error:', err);
      throw err;
    }
  },

  /**
   * Delete a blog post
   */
  async deletePost(id) {
    try {
      const { error } = await supabase
        .from('blog_posts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[blogService] deletePost error:', err);
      throw err;
    }
  }
};

export default blogService;
