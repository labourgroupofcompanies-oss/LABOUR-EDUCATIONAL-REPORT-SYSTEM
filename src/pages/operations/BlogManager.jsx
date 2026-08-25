import React, { useState, useEffect, useMemo } from 'react';
import blogService from '../../services/blogService';
import { useAuth } from '../../store/AuthContext';
import LogoPreloader from '../../components/common/LogoPreloader';

const CATEGORIES = [
  'Administration',
  'Academics',
  'Billing & Subscriptions',
  'User Guides',
  'Platform Updates',
  'Training & Tutorials',
  'Security & Compliance'
];

const TARGET_ROLES = ['All Users', 'Headteacher', 'Teacher', 'Parent', 'Super Admin'];
const BADGES = ['User Guide', 'Admin Guide', 'Teacher Guide', 'Billing Guide', 'Release Note', 'Important Notice', 'Tutorial'];

const BlogManager = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPost, setPreviewPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'preview'

  // Form State
  const initialFormState = {
    title: '',
    slug: '',
    category: 'Administration',
    target_role: 'All Users',
    featured_badge: 'User Guide',
    read_time: '5 min read',
    author: user?.fullName || 'Labour Edu Support Team',
    summary: '',
    content: '',
    cover_image: '',
    is_published: true
  };
  const [formData, setFormData] = useState(initialFormState);

  // Fetch posts
  const fetchPosts = async () => {
    setLoading(true);
    try {
      const data = await blogService.getAllPosts();
      setPosts(data || []);
    } catch (err) {
      console.error('Error fetching posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesSearch = 
        !searchQuery || 
        post.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.category?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === 'ALL' || post.category?.toLowerCase() === selectedCategory.toLowerCase();
      const matchesRole = selectedRole === 'ALL' || post.target_role?.toLowerCase() === selectedRole.toLowerCase();
      const matchesStatus = 
        statusFilter === 'ALL' || 
        (statusFilter === 'PUBLISHED' && post.is_published !== false) ||
        (statusFilter === 'DRAFT' && post.is_published === false);

      return matchesSearch && matchesCat && matchesRole && matchesStatus;
    });
  }, [posts, searchQuery, selectedCategory, selectedRole, statusFilter]);

  // Grouped posts by category for section view
  const groupedSections = useMemo(() => {
    const map = {};
    filteredPosts.forEach(post => {
      const cat = post.category || 'General';
      if (!map[cat]) map[cat] = [];
      map[cat].push(post);
    });
    return map;
  }, [filteredPosts]);

  const [viewMode, setViewMode] = useState('sections'); // 'sections' | 'grid'

  // Handle open create
  const handleOpenCreate = () => {
    setEditingPost(null);
    setFormData({
      ...initialFormState,
      author: user?.fullName || 'Labour Edu Support Team',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    });
    setActiveTab('write');
    setIsEditorOpen(true);
  };

  // Handle open edit
  const handleOpenEdit = (post) => {
    setEditingPost(post);
    setFormData({
      title: post.title || '',
      slug: post.slug || '',
      category: post.category || 'Administration',
      target_role: post.target_role || 'All Users',
      featured_badge: post.featured_badge || 'User Guide',
      read_time: post.read_time || '5 min read',
      author: post.author || user?.fullName || 'Labour Edu Support Team',
      summary: post.summary || '',
      content: post.content || '',
      cover_image: post.cover_image || '',
      is_published: post.is_published !== false,
      date: post.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    });
    setActiveTab('write');
    setIsEditorOpen(true);
  };

  // Auto-generate slug from title
  const handleTitleChange = (e) => {
    const val = e.target.value;
    setFormData(prev => ({
      ...prev,
      title: val,
      slug: !editingPost ? val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : prev.slug
    }));
  };

  // Insert formatting markdown
  const insertFormatting = (prefix, suffix = '') => {
    const textarea = document.getElementById('content-textarea');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = formData.content;
    const selected = currentText.substring(start, end);
    const replacement = prefix + selected + suffix;

    const newContent = currentText.substring(0, start) + replacement + currentText.substring(end);
    setFormData(prev => ({ ...prev, content: newContent }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 50);
  };

  // Insert step template
  const insertStepTemplate = () => {
    const stepTemplate = `\n### Step Title\n1. First action step here...\n2. Second action step here...\n3. Third action step here...\n`;
    setFormData(prev => ({ ...prev, content: prev.content + stepTemplate }));
  };

  // Save post
  const handleSavePost = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Please provide a post title.');
      return;
    }
    if (!formData.content.trim()) {
      alert('Please enter the content for this post/manual.');
      return;
    }

    setSaving(true);
    try {
      if (editingPost) {
        await blogService.updatePost(editingPost.id, formData);
        alert('Post / Manual updated successfully!');
      } else {
        await blogService.createPost(formData);
        alert('New Post / Manual published successfully!');
      }
      setIsEditorOpen(false);
      await fetchPosts();
    } catch (err) {
      alert(`Error saving post: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Toggle publish
  const handleTogglePublish = async (post) => {
    try {
      await blogService.togglePublishStatus(post.id, post.is_published !== false);
      await fetchPosts();
    } catch (err) {
      alert(`Error updating publish state: ${err.message}`);
    }
  };

  // Delete post
  const handleDeletePost = async (post) => {
    if (!window.confirm(`Are you sure you want to delete "${post.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await blogService.deletePost(post.id);
      await fetchPosts();
    } catch (err) {
      alert(`Error deleting post: ${err.message}`);
    }
  };

  // Live markdown renderer helper
  const renderMarkdown = (text) => {
    if (!text) return <p style={{ color: '#71717a' }}>No content yet...</p>;
    
    const lines = text.split('\n');
    return (
      <div style={{ lineHeight: '1.7', color: '#18181b', fontSize: '0.95rem' }}>
        {lines.map((line, idx) => {
          if (line.startsWith('## ')) {
            return <h2 key={idx} style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '1.25rem', marginBottom: '0.5rem', color: '#09090b', borderBottom: '1px solid #E4E4E7', paddingBottom: '0.3rem' }}>{line.replace('## ', '')}</h2>;
          }
          if (line.startsWith('### ')) {
            return <h3 key={idx} style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '1rem', marginBottom: '0.4rem', color: '#18181b' }}>{line.replace('### ', '')}</h3>;
          }
          if (line.startsWith('#### ')) {
            return <h4 key={idx} style={{ fontSize: '1rem', fontWeight: 700, marginTop: '0.8rem', marginBottom: '0.3rem', color: '#27272a' }}>{line.replace('#### ', '')}</h4>;
          }
          if (line.startsWith('---')) {
            return <hr key={idx} style={{ border: 'none', borderTop: '1px solid #E4E4E7', margin: '1rem 0' }} />;
          }
          if (/^\d+\.\s/.test(line)) {
            return (
              <div key={idx} style={{ paddingLeft: '1.25rem', marginBottom: '0.35rem', position: 'relative' }}>
                <span style={{ fontWeight: 700, color: '#2563eb', marginRight: '6px' }}>{line.match(/^\d+\./)[0]}</span>
                <span>{line.replace(/^\d+\.\s*/, '')}</span>
              </div>
            );
          }
          if (line.startsWith('* ') || line.startsWith('- ')) {
            return (
              <div key={idx} style={{ paddingLeft: '1.25rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ color: '#2563eb', fontSize: '0.8rem' }}>●</span>
                <span>{line.replace(/^(\*|-)\s*/, '')}</span>
              </div>
            );
          }
          if (!line.trim()) {
            return <div key={idx} style={{ height: '0.6rem' }} />;
          }
          return <p key={idx} style={{ margin: '0 0 0.5rem 0' }}>{line}</p>;
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
      {/* Top Banner & Header */}
      <div style={{
        background: 'linear-gradient(135deg, #09090b 0%, #1e1b4b 100%)',
        borderRadius: '20px',
        padding: '2rem 2.25rem',
        color: '#FFFFFF',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
            <span style={{
              background: 'rgba(37, 99, 235, 0.25)',
              color: '#60a5fa',
              padding: '0.3rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              border: '1px solid rgba(96, 165, 250, 0.3)'
            }}>
              <i className="fas fa-newspaper" style={{ marginRight: '6px' }}></i>
              KNOWLEDGE BASE &amp; CMS
            </span>
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 800, margin: '0 0 0.4rem 0', letterSpacing: '-0.02em' }}>
            Blog, Guides &amp; Manuals Manager
          </h1>
          <p style={{ margin: 0, color: '#A1A1AA', fontSize: '0.88rem', maxWidth: '650px', lineHeight: 1.5 }}>
            Publish and manage interactive training manuals, feature walkthroughs, headteacher instructions, and platform release announcements.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: '#2563eb',
            color: '#FFFFFF',
            border: 'none',
            padding: '0.85rem 1.5rem',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <i className="fas fa-plus"></i>
          <span>Write New Post / Manual</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Articles / Manuals', value: posts.length, icon: 'fa-book-bookmark', color: '#2563eb', bg: '#EFF6FF' },
          { label: 'Published & Live', value: posts.filter(p => p.is_published !== false).length, icon: 'fa-globe', color: '#10B981', bg: '#ECFDF5' },
          { label: 'Drafts in Progress', value: posts.filter(p => p.is_published === false).length, icon: 'fa-file-pen', color: '#F59E0B', bg: '#FFFBEB' },
          { label: 'Categories Active', value: new Set(posts.map(p => p.category)).size, icon: 'fa-tags', color: '#8B5CF6', bg: '#F5F3FF' },
        ].map((stat, idx) => (
          <div key={idx} style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '1.25rem',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: stat.bg,
              color: stat.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem'
            }}>
              <i className={`fas ${stat.icon}`}></i>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>{stat.label}</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 800, color: '#09090b', marginTop: '2px' }}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Category Quick Filter Pills & View Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', flex: 1 }}>
          <button
            onClick={() => setSelectedCategory('ALL')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              border: selectedCategory === 'ALL' ? '2px solid #2563eb' : '1px solid #E4E4E7',
              background: selectedCategory === 'ALL' ? '#EFF6FF' : '#FFFFFF',
              color: selectedCategory === 'ALL' ? '#2563eb' : '#71717a',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            All Categories ({posts.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = posts.filter(p => p.category?.toLowerCase() === cat.toLowerCase()).length;
            const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat)}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '9999px',
                  border: isSelected ? '2px solid #2563eb' : '1px solid #E4E4E7',
                  background: isSelected ? '#EFF6FF' : '#FFFFFF',
                  color: isSelected ? '#2563eb' : '#71717a',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', background: '#F4F4F5', padding: '3px', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
          <button
            type="button"
            onClick={() => setViewMode('sections')}
            style={{
              padding: '0.35rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: viewMode === 'sections' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'sections' ? '#09090b' : '#71717a',
              boxShadow: viewMode === 'sections' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fas fa-layer-group"></i>
            <span>Group by Sections</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            style={{
              padding: '0.35rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'grid' ? '#09090b' : '#71717a',
              boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fas fa-grip"></i>
            <span>Flat Grid</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E4E4E7',
        padding: '1.25rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 280px', minWidth: '240px', background: '#F4F4F5', padding: '0.6rem 0.9rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
          <i className="fas fa-search" style={{ color: '#A1A1AA' }}></i>
          <input
            type="text"
            placeholder="Search by title, keywords, category, or author..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.85rem', color: '#09090b', fontWeight: 500 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'transparent', color: '#A1A1AA', cursor: 'pointer' }}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            style={{ padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', background: '#FFFFFF', fontSize: '0.82rem', fontWeight: 600, color: '#18181b', cursor: 'pointer' }}
          >
            <option value="ALL">👤 All Target Roles</option>
            {TARGET_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', background: '#FFFFFF', fontSize: '0.82rem', fontWeight: 600, color: '#18181b', cursor: 'pointer' }}
          >
            <option value="ALL">Status: All</option>
            <option value="PUBLISHED">🟢 Published Only</option>
            <option value="DRAFT">🟡 Drafts Only</option>
          </select>
        </div>
      </div>

      {/* Posts List / Sections Render */}
      {loading ? (
        <div style={{ padding: '2rem 0', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
          <LogoPreloader fullScreen={false} size="sm" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
          <i className="fas fa-newspaper" style={{ fontSize: '3rem', color: '#D4D4D8', marginBottom: '1rem', display: 'block' }}></i>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#09090b' }}>No Posts or Manuals Found</h3>
          <p style={{ color: '#71717a', fontSize: '0.88rem', margin: '0 0 1.25rem 0' }}>
            {searchQuery || selectedCategory !== 'ALL' ? 'Try adjusting your search criteria or filters.' : 'Click below to write your first operational guide or blog post.'}
          </p>
          <button
            onClick={handleOpenCreate}
            style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#2563eb', color: '#FFFFFF', border: 'none', fontWeight: 700, cursor: 'pointer' }}
          >
            + Create First Manual / Post
          </button>
        </div>
      ) : viewMode === 'sections' ? (
        /* Section by Section Categorized View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {Object.keys(groupedSections).map(catName => {
            const catPosts = groupedSections[catName];
            return (
              <div key={catName} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Section Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '0.65rem',
                  borderBottom: '2px solid #E4E4E7'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: '#EFF6FF',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem'
                    }}>
                      <i className="fas fa-folder-open"></i>
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#09090b', fontFamily: 'Outfit, sans-serif' }}>
                        {catName}
                      </h2>
                      <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600 }}>{catPosts.length} Publication{catPosts.length > 1 ? 's' : ''} in this section</span>
                    </div>
                  </div>
                </div>

                {/* Cards for this section */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
                  {catPosts.map(post => {
                    const isLive = post.is_published !== false;
                    return (
                      <div
                        key={post.id}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: '16px',
                          border: '1px solid #E4E4E7',
                          padding: '1.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                          transition: 'all 0.2s ease',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {post.cover_image && (
                          <div style={{ margin: '-1.5rem -1.5rem 1rem -1.5rem', height: '160px', overflow: 'hidden' }}>
                            <img src={post.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.parentElement.style.display = 'none'; }} />
                          </div>
                        )}
                        <div>
                          {/* Category & Badge Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{
                                padding: '0.2rem 0.55rem',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                background: '#EFF6FF',
                                color: '#2563eb',
                                border: '1px solid #DBEAFE'
                              }}>
                                {post.category || 'General'}
                              </span>
                              {post.featured_badge && (
                                <span style={{
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  background: '#F5F3FF',
                                  color: '#7C3AED',
                                  border: '1px solid #EDE9FE'
                                }}>
                                  {post.featured_badge}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => handleTogglePublish(post)}
                              title={isLive ? 'Click to set as Draft' : 'Click to Publish'}
                              style={{
                                padding: '0.2rem 0.55rem',
                                borderRadius: '9999px',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                border: 'none',
                                cursor: 'pointer',
                                background: isLive ? '#ECFDF5' : '#FFFBEB',
                                color: isLive ? '#10B981' : '#F59E0B',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <span style={{ fontSize: '0.6rem' }}>●</span>
                              {isLive ? 'Published' : 'Draft'}
                            </button>
                          </div>

                          {/* Title */}
                          <h3 style={{
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            color: '#09090b',
                            margin: '0 0 0.5rem 0',
                            lineHeight: 1.4,
                            fontFamily: 'Outfit, sans-serif'
                          }}>
                            {post.title}
                          </h3>

                          {/* Summary */}
                          <p style={{
                            fontSize: '0.82rem',
                            color: '#71717a',
                            lineHeight: 1.5,
                            margin: '0 0 1rem 0',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {post.summary || 'No summary available.'}
                          </p>
                        </div>

                        {/* Footer Metadata & Actions */}
                        <div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.75rem',
                            color: '#A1A1AA',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #F4F4F5',
                            marginBottom: '0.85rem'
                          }}>
                            <div>
                              <i className="fas fa-user-circle" style={{ marginRight: '4px' }}></i>
                              {post.author || 'Admin'}
                            </div>
                            <div>
                              <i className="fas fa-clock" style={{ marginRight: '4px' }}></i>
                              {post.read_time || '5 min read'}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                setPreviewPost(post);
                                setIsPreviewOpen(true);
                              }}
                              style={{
                                flex: 1,
                                padding: '0.45rem',
                                borderRadius: '8px',
                                background: '#F4F4F5',
                                border: '1px solid #E4E4E7',
                                color: '#18181b',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <i className="fas fa-eye" style={{ color: '#71717a' }}></i>
                              Preview
                            </button>

                            <button
                              onClick={() => handleOpenEdit(post)}
                              style={{
                                flex: 1,
                                padding: '0.45rem',
                                borderRadius: '8px',
                                background: '#EFF6FF',
                                border: '1px solid #DBEAFE',
                                color: '#2563eb',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <i className="fas fa-pen-to-square"></i>
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeletePost(post)}
                              title="Delete Post"
                              style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: '8px',
                                background: '#FEF2F2',
                                border: '1px solid #FEE2E2',
                                color: '#EF4444',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              <i className="fas fa-trash-can"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Flat Grid View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredPosts.map(post => {
            const isLive = post.is_published !== false;
            return (
              <div
                key={post.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E4E4E7',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {post.cover_image && (
                  <div style={{ margin: '-1.5rem -1.5rem 1rem -1.5rem', height: '160px', overflow: 'hidden' }}>
                    <img src={post.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.parentElement.style.display = 'none'; }} />
                  </div>
                )}
                <div>
                  {/* Category & Badge Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: '#EFF6FF',
                        color: '#2563eb',
                        border: '1px solid #DBEAFE'
                      }}>
                        {post.category || 'General'}
                      </span>
                      {post.featured_badge && (
                        <span style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          background: '#F5F3FF',
                          color: '#7C3AED',
                          border: '1px solid #EDE9FE'
                        }}>
                          {post.featured_badge}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleTogglePublish(post)}
                      title={isLive ? 'Click to set as Draft' : 'Click to Publish'}
                      style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        border: 'none',
                        cursor: 'pointer',
                        background: isLive ? '#ECFDF5' : '#FFFBEB',
                        color: isLive ? '#10B981' : '#F59E0B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '0.6rem' }}>●</span>
                      {isLive ? 'Published' : 'Draft'}
                    </button>
                  </div>

                  {/* Title */}
                  <h3 style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    color: '#09090b',
                    margin: '0 0 0.5rem 0',
                    lineHeight: 1.4,
                    fontFamily: 'Outfit, sans-serif'
                  }}>
                    {post.title}
                  </h3>

                  {/* Summary */}
                  <p style={{
                    fontSize: '0.82rem',
                    color: '#71717a',
                    lineHeight: 1.5,
                    margin: '0 0 1rem 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {post.summary || 'No summary available.'}
                  </p>
                </div>

                {/* Footer Metadata & Actions */}
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: '#A1A1AA',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #F4F4F5',
                    marginBottom: '0.85rem'
                  }}>
                    <div>
                      <i className="fas fa-user-circle" style={{ marginRight: '4px' }}></i>
                      {post.author || 'Admin'}
                    </div>
                    <div>
                      <i className="fas fa-clock" style={{ marginRight: '4px' }}></i>
                      {post.read_time || '5 min read'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setPreviewPost(post);
                        setIsPreviewOpen(true);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '8px',
                        background: '#F4F4F5',
                        border: '1px solid #E4E4E7',
                        color: '#18181b',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <i className="fas fa-eye" style={{ color: '#71717a' }}></i>
                      Preview
                    </button>

                    <button
                      onClick={() => handleOpenEdit(post)}
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '8px',
                        background: '#EFF6FF',
                        border: '1px solid #DBEAFE',
                        color: '#2563eb',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <i className="fas fa-pen-to-square"></i>
                      Edit
                    </button>

                    <button
                      onClick={() => handleDeletePost(post)}
                      title="Delete Post"
                      style={{
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        background: '#FEF2F2',
                        border: '1px solid #FEE2E2',
                        color: '#EF4444',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <i className="fas fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE / EDIT MODAL ── */}
      {isEditorOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(9, 9, 11, 0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid #E4E4E7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#FAFAFA'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                  <i className={editingPost ? 'fas fa-pen-to-square' : 'fas fa-plus'}></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#09090b' }}>
                    {editingPost ? 'Edit Blog / Manual' : 'Create New Blog Post or User Manual'}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#71717a' }}>
                    {editingPost ? `Editing ID: ${editingPost.id}` : 'Drafting a new knowledge base publication'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsEditorOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#71717a', fontSize: '1.2rem', cursor: 'pointer', padding: '0.4rem' }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSavePost} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Title */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                    Article / Manual Title <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Headteacher Portal: How to Set Up Classes and Generate Terminal Report Cards"
                    value={formData.title}
                    onChange={handleTitleChange}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.95rem', fontWeight: 600, outline: 'none' }}
                  />
                </div>

                {/* Slug & Category Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                      URL Slug
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. headteacher-portal-guide"
                      value={formData.slug}
                      onChange={e => setFormData({ ...formData, slug: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                      Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', fontWeight: 600, outline: 'none', background: '#FFFFFF' }}
                    >
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                      Target Role Audience
                    </label>
                    <select
                      value={formData.target_role}
                      onChange={e => setFormData({ ...formData, target_role: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', fontWeight: 600, outline: 'none', background: '#FFFFFF' }}
                    >
                      {TARGET_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </div>
                </div>

                {/* Badge, Author & Read Time */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                      Featured Badge Label
                    </label>
                    <select
                      value={formData.featured_badge}
                      onChange={e => setFormData({ ...formData, featured_badge: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', fontWeight: 600, outline: 'none', background: '#FFFFFF' }}
                    >
                      {BADGES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                      Author Byline
                    </label>
                    <input
                      type="text"
                      value={formData.author}
                      onChange={e => setFormData({ ...formData, author: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                      Estimated Read Time
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 6 min read"
                      value={formData.read_time}
                      onChange={e => setFormData({ ...formData, read_time: e.target.value })}
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>
                </div>

                {/* Cover Image URL */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                    Cover Image URL (paste a direct link to an image)
                  </label>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      placeholder="https://example.com/image.jpg"
                      value={formData.cover_image}
                      onChange={e => setFormData({ ...formData, cover_image: e.target.value })}
                      style={{ flex: 1, padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none' }}
                    />
                    {formData.cover_image && (
                      <div style={{
                        width: '80px',
                        height: '56px',
                        borderRadius: '8px',
                        border: '1px solid #E4E4E7',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        <img
                          src={formData.cover_image}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#09090b', marginBottom: '0.35rem' }}>
                    Summary / Excerpt (displayed in previews and search listings)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Short summary highlighting the core takeaways..."
                    value={formData.summary}
                    onChange={e => setFormData({ ...formData, summary: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #E4E4E7', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
                  />
                </div>

                {/* Content Editor with Toolbar & Preview Tab */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#09090b' }}>
                      Full Content (Markdown Supported) <span style={{ color: '#EF4444' }}>*</span>
                    </label>

                    <div style={{ display: 'flex', gap: '4px', background: '#F4F4F5', padding: '3px', borderRadius: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setActiveTab('write')}
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: activeTab === 'write' ? '#FFFFFF' : 'transparent',
                          color: activeTab === 'write' ? '#09090b' : '#71717a',
                          boxShadow: activeTab === 'write' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                        }}
                      >
                        <i className="fas fa-pen" style={{ marginRight: '4px' }}></i> Write
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('preview')}
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: activeTab === 'preview' ? '#FFFFFF' : 'transparent',
                          color: activeTab === 'preview' ? '#09090b' : '#71717a',
                          boxShadow: activeTab === 'preview' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                        }}
                      >
                        <i className="fas fa-eye" style={{ marginRight: '4px' }}></i> Live Preview
                      </button>
                    </div>
                  </div>

                  {activeTab === 'write' ? (
                    <div>
                      {/* Markdown Toolbar */}
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px',
                        padding: '0.4rem 0.6rem',
                        background: '#F4F4F5',
                        borderTopLeftRadius: '10px',
                        borderTopRightRadius: '10px',
                        border: '1px solid #E4E4E7',
                        borderBottom: 'none'
                      }}>
                        <button type="button" onClick={() => insertFormatting('### ')} title="Heading 3" style={{ padding: '0.25rem 0.5rem', background: '#FFFFFF', border: '1px solid #D4D4D8', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}>H3</button>
                        <button type="button" onClick={() => insertFormatting('**', '**')} title="Bold" style={{ padding: '0.25rem 0.5rem', background: '#FFFFFF', border: '1px solid #D4D4D8', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}><i className="fas fa-bold"></i></button>
                        <button type="button" onClick={() => insertFormatting('*', '*')} title="Italic" style={{ padding: '0.25rem 0.5rem', background: '#FFFFFF', border: '1px solid #D4D4D8', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}><i className="fas fa-italic"></i></button>
                        <button type="button" onClick={() => insertFormatting('\n1. ')} title="Numbered List" style={{ padding: '0.25rem 0.5rem', background: '#FFFFFF', border: '1px solid #D4D4D8', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}><i className="fas fa-list-ol"></i></button>
                        <button type="button" onClick={() => insertFormatting('\n* ')} title="Bullet List" style={{ padding: '0.25rem 0.5rem', background: '#FFFFFF', border: '1px solid #D4D4D8', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}><i className="fas fa-list-ul"></i></button>
                        <button type="button" onClick={() => insertFormatting('\n---\n')} title="Divider" style={{ padding: '0.25rem 0.5rem', background: '#FFFFFF', border: '1px solid #D4D4D8', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}><i className="fas fa-minus"></i></button>
                        <button type="button" onClick={insertStepTemplate} title="Insert Step Template" style={{ padding: '0.25rem 0.6rem', background: '#EFF6FF', color: '#2563eb', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}>+ Insert Steps</button>
                      </div>

                      <textarea
                        id="content-textarea"
                        rows={12}
                        required
                        placeholder="Write your step-by-step manual or blog content using standard markdown..."
                        value={formData.content}
                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '1rem',
                          borderBottomLeftRadius: '10px',
                          borderBottomRightRadius: '10px',
                          border: '1px solid #E4E4E7',
                          fontSize: '0.9rem',
                          fontFamily: 'monospace',
                          lineHeight: '1.6',
                          outline: 'none',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      minHeight: '280px',
                      maxHeight: '380px',
                      overflowY: 'auto',
                      padding: '1.25rem',
                      background: '#FAFAFA',
                      borderRadius: '10px',
                      border: '1px solid #E4E4E7'
                    }}>
                      {renderMarkdown(formData.content)}
                    </div>
                  )}
                </div>

                {/* Published Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0' }}>
                  <input
                    type="checkbox"
                    id="is_published_checkbox"
                    checked={formData.is_published}
                    onChange={e => setFormData({ ...formData, is_published: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                  <label htmlFor="is_published_checkbox" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#09090b', cursor: 'pointer' }}>
                    Publish Immediately (Visible to users in knowledge base)
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '1.25rem 1.75rem',
                borderTop: '1px solid #E4E4E7',
                background: '#FAFAFA',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  style={{ padding: '0.7rem 1.25rem', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #D4D4D8', color: '#18181b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.7rem 1.75rem',
                    borderRadius: '10px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? 'Saving...' : editingPost ? 'Update Publication' : 'Publish Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PREVIEW READER MODAL ── */}
      {isPreviewOpen && previewPost && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(9, 9, 11, 0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: '#EFF6FF', color: '#2563eb' }}>
                  {previewPost.category}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#71717a' }}>• {previewPost.read_time}</span>
              </div>

              <button
                onClick={() => setIsPreviewOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#71717a', fontSize: '1.2rem', cursor: 'pointer', padding: '0.4rem' }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '2rem', overflowY: 'auto' }}>
              {previewPost.cover_image && (
                <div style={{ margin: '-2rem -2rem 1.5rem -2rem', height: '200px', overflow: 'hidden' }}>
                  <img src={previewPost.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.parentElement.style.display = 'none'; }} />
                </div>
              )}

              <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#09090b', margin: '0 0 0.5rem 0' }}>
                {previewPost.title}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#71717a', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #F4F4F5' }}>
                <span>✍️ {previewPost.author || 'Labour Edu Team'}</span>
                <span>📅 {previewPost.date}</span>
                <span>🎯 Target: {previewPost.target_role || 'All'}</span>
              </div>

              {previewPost.summary && (
                <div style={{ background: '#F4F4F5', padding: '1rem 1.25rem', borderRadius: '12px', borderLeft: '4px solid #2563eb', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#3f3f46', fontStyle: 'italic' }}>
                  {previewPost.summary}
                </div>
              )}

              <div>
                {renderMarkdown(previewPost.content)}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid #E4E4E7', background: '#FAFAFA', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsPreviewOpen(false)}
                style={{ padding: '0.6rem 1.5rem', borderRadius: '10px', background: '#09090b', color: '#FFFFFF', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogManager;
