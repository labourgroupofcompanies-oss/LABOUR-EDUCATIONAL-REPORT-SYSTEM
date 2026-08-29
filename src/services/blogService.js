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
    .replace(/(^-|-$)+/g, '') || 'manual';

  return {
    title: postData.title ? postData.title.trim() : '',
    slug: slug,
    category: postData.category || 'Administration',
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
          const found = parsed.find(p => String(p.id) === String(id) || p.slug === id);
          if (found) return found;
        } catch (e) {}
      }
      const defaultFound = DEFAULT_OFFLINE_MANUALS.find(p => String(p.id) === String(id) || p.slug === id);
      if (defaultFound) return defaultFound;

      // Try looking up by slug in Supabase
      try {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('slug', id)
          .maybeSingle();
        if (!error && data) return data;
      } catch (e) {}

      throw new Error(`Post not found: ${id}`);
    }

    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', Number(id))
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[blogService] getPostById error:', err);
      // Try cached fallback
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const found = parsed.find(p => String(p.id) === String(id));
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
        const { data, error } = await supabase
          .from('blog_posts')
          .insert([payload])
          .select();

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
   * Update an existing blog post (safely handles offline IDs & online bigint IDs)
   */
  async updatePost(id, postData) {
    try {
      const payload = sanitizePayload(postData);

      // Case 1: The ID is an offline manual (non-numeric, e.g. "offline-manual-3")
      if (isOfflineId(id)) {
        let savedPost = null;

        if (navigator.onLine) {
          // Check if it already exists in Supabase by slug
          const targetSlug = payload.slug || postData.slug;
          const { data: existingPost } = await supabase
            .from('blog_posts')
            .select('id')
            .eq('slug', targetSlug)
            .maybeSingle();

          if (existingPost?.id) {
            // Update existing row in Supabase
            const { data, error } = await supabase
              .from('blog_posts')
              .update(payload)
              .eq('id', existingPost.id)
              .select();

            if (error) throw error;
            savedPost = data?.[0];
          } else {
            // Insert as new row in Supabase
            const { data, error } = await supabase
              .from('blog_posts')
              .insert([payload])
              .select();

            if (error) throw error;
            savedPost = data?.[0];
          }
        }

        if (!savedPost) {
          savedPost = { ...payload, id };
        }

        // Update local cache: replace the old offline item with savedPost
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const list = JSON.parse(cached);
            const updatedList = list.map(p => (String(p.id) === String(id) || p.slug === payload.slug) ? savedPost : p);
            localStorage.setItem(CACHE_KEY, JSON.stringify(updatedList));
          }
        } catch (e) {}

        return savedPost;
      }

      // Case 2: Standard online post with numeric bigint ID
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('blog_posts')
          .update(payload)
          .eq('id', Number(id))
          .select();

        if (error) throw error;
        const updated = data?.[0] || { ...payload, id };

        // Update local cache
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const list = JSON.parse(cached);
            const updatedList = list.map(p => String(p.id) === String(id) ? updated : p);
            localStorage.setItem(CACHE_KEY, JSON.stringify(updatedList));
          }
        } catch (e) {}

        return updated;
      }

      // Offline update fallback
      const updatedLocal = { ...payload, id };
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const list = JSON.parse(cached);
          const updatedList = list.map(p => String(p.id) === String(id) ? updatedLocal : p);
          localStorage.setItem(CACHE_KEY, JSON.stringify(updatedList));
        }
      } catch (e) {}
      return updatedLocal;
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
      const newStatus = !currentStatus;

      if (isOfflineId(id)) {
        // Look up item
        let post = null;
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            post = JSON.parse(cached).find(p => String(p.id) === String(id));
          }
        } catch (e) {}
        if (!post) {
          post = DEFAULT_OFFLINE_MANUALS.find(p => String(p.id) === String(id));
        }

        if (post) {
          return await this.updatePost(id, { ...post, is_published: newStatus });
        }
        return { id, is_published: newStatus };
      }

      // Numeric ID
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('blog_posts')
          .update({ is_published: newStatus })
          .eq('id', Number(id))
          .select();

        if (error) throw error;
        const updated = data?.[0];

        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const list = JSON.parse(cached);
            const updatedList = list.map(p => String(p.id) === String(id) ? { ...p, is_published: newStatus } : p);
            localStorage.setItem(CACHE_KEY, JSON.stringify(updatedList));
          }
        } catch (e) {}

        return updated;
      }

      // Offline fallback
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const list = JSON.parse(cached);
          const updatedList = list.map(p => String(p.id) === String(id) ? { ...p, is_published: newStatus } : p);
          localStorage.setItem(CACHE_KEY, JSON.stringify(updatedList));
        }
      } catch (e) {}

      return { id, is_published: newStatus };
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
      if (isOfflineId(id)) {
        markOfflineIdDeleted(id);

        // Remove from local cache
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const list = JSON.parse(cached).filter(p => String(p.id) !== String(id));
            localStorage.setItem(CACHE_KEY, JSON.stringify(list));
          }
        } catch (e) {}

        // If it was also pushed to Supabase by slug, try deleting
        if (navigator.onLine) {
          try {
            const cached = localStorage.getItem(CACHE_KEY);
            let post = null;
            if (cached) {
              post = JSON.parse(cached).find(p => String(p.id) === String(id));
            }
            if (!post) {
              post = DEFAULT_OFFLINE_MANUALS.find(p => String(p.id) === String(id));
            }
            if (post?.slug) {
              await supabase.from('blog_posts').delete().eq('slug', post.slug);
            }
          } catch (e) {}
        }

        return true;
      }

      // Numeric ID
      if (navigator.onLine) {
        const { error } = await supabase
          .from('blog_posts')
          .delete()
          .eq('id', Number(id));

        if (error) throw error;
      }

      // Remove from local cache
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const list = JSON.parse(cached).filter(p => String(p.id) !== String(id));
          localStorage.setItem(CACHE_KEY, JSON.stringify(list));
        }
      } catch (e) {}

      return true;
    } catch (err) {
      console.error('[blogService] deletePost error:', err);
      throw err;
    }
  }
};

export default blogService;
