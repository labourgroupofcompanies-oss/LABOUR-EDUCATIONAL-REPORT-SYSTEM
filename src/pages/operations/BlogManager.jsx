import React, { useState, useEffect, useMemo, useRef } from 'react';
import blogService from '../../services/blogService';
import broadcastService from '../../services/broadcastService';
import { useAuth } from '../../store/AuthContext';
import LogoPreloader from '../../components/common/LogoPreloader';

const CATEGORIES = [
  'GES Directives & Policy',
  'Administration',
  'Academics',
  'Curriculum & Assessment',
  'Examinations (BECE & WASSCE)',
  'Billing & Subscriptions',
  'User Guides',
  'Platform Updates',
  'Training & Tutorials',
  'Security & Compliance'
];

const TARGET_ROLES = [
  'All Users',
  'All Schools & Parents',
  'Headteacher',
  'Teacher',
  'Parent',
  'Super Admin'
];

const BADGES = [
  'Official Policy Guide',
  'Breaking Circular',
  'User Guide',
  'Admin Guide',
  'Teacher Guide',
  'Billing Guide',
  'Release Note',
  'Important Notice',
  'Tutorial'
];

const PRESET_TEMPLATES = [
  {
    id: 'ges_circular',
    name: '🇬🇭 GES Official Circular Breakdown',
    desc: 'Executive summary, school action checklist, and direct official government link box.',
    title: '🇬🇭 GES Management Circular: [Topic Name Here]',
    category: 'GES Directives & Policy',
    featured_badge: 'Official Policy Guide',
    target_role: 'All Schools & Parents',
    summary: 'A 2-minute plain-English breakdown of the latest official directive from Ghana Education Service for Basic Schools.',
    content: `# [Official Directive Headline]

## Executive Summary
A concise, 2-minute explanation of the key directive issued by Ghana Education Service and what it means for basic schools nationwide.

## 🎯 Key Takeaways for Schools
- **For Headteachers:** Verify that all academic records and broadsheets comply with the updated assessment policies.
- **For Subject Teachers:** Ensure that continuous assessment marks (Class Exercises, Homework, Projects) are recorded promptly.
- **For Parents & Guardians:** Terminal report cards and attendance records can be monitored live via the Labour Edu Parent Portal.

---

> ℹ️ **Important Note:** District Education Directorates and Circuit Supervisors require all registered basic schools to finalize and lock terminal records before published deadlines.

---

## 🏛️ Official Verification & Reference Document
This simplified breakdown is prepared by the **Labour Edu Editorial Team** to assist schools in understanding national curriculum directives.

For the full official document, statutory tables, and signed government notices, please inspect the original official page:

👉 **[View Original Directive on Ghana Education Service (Direct Notice)](https://ges.gov.gh)**
`
  },
  {
    id: 'system_manual',
    name: '📘 Step-by-Step Software User Manual',
    desc: 'How-to operational instructions with step numbers and troubleshooting tips.',
    title: 'How to [Perform Action Name] in Labour Edu',
    category: 'User Guides',
    featured_badge: 'Step-by-Step Manual',
    target_role: 'Headteacher',
    summary: 'Complete guide with clear action steps on how to configure, enter scores, or approve reports.',
    content: `# How to [Action Name]

## Overview
Learn how to quickly execute this action in your Labour Edu portal with zero errors.

## 📋 Prerequisites
Before starting, ensure that:
- You are logged in with appropriate administrative permissions.
- Your internet connection is active (or offline mode is enabled).

---

## 🚀 Step-by-Step Action Guide

Step 1. Navigate to the desired module on your left navigation sidebar.

Step 2. Select the target Class, Term, and Academic Year.

Step 3. Fill in the required data fields or upload the approved digital signature file.

Step 4. Click **Save & Synchronize** to update records across the system.

---

> 💡 **Pro Tip:** You can use keyboard shortcuts (\`Tab\` and \`Enter\`) to rapidly move between score entry cells.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Can I edit marks after approving reports?**  
A: Yes, Headteachers can unlock reports from the **Reports & Broadsheet** panel at any time before publishing.
`
  },
  {
    id: 'curriculum_guide',
    name: '📊 Curriculum & Assessment Analysis',
    desc: 'Insightful pedagogical guide on SBC competencies, SBA weighting, and terminal grading.',
    title: 'Understanding the Standard-Based Curriculum Grading Policy',
    category: 'Curriculum & Assessment',
    featured_badge: 'Policy Breakdown',
    target_role: 'Teacher',
    summary: 'A practical analysis of the 30% School-Based Assessment and 70% Terminal Exam weighting for basic schools.',
    content: `# Understanding the Standard-Based Curriculum Grading Policy

## Background & Philosophy
The National Council for Curriculum and Assessment (NaCCA) Standard-Based Curriculum focuses on learner-centered competencies, continuous assessment, and remedial intervention.

## 📊 Assessment Weighting Breakdown

| Assessment Type | Weight (%) | Description |
| :--- | :---: | :--- |
| **Class Exercises & Homework** | 10% | Daily formative tasks |
| **Group Work & Projects** | 10% | Collaborative learning |
| **Mid-Term Test** | 10% | Summative progress check |
| **Terminal Examination** | 70% | End-of-term standardized test |
| **Total Score** | **100%** | Final composite grade |

---

## 🏆 Core Competencies Evaluated
1. **Critical Thinking & Problem Solving**
2. **Digital & Numerical Literacy**
3. **Collaboration & Leadership**
4. **Cultural Identity & Global Citizenship**

---

> ⚠️ **Compliance Advisory:** Never combine continuous assessment marks with exam marks on a single column. Labour Edu computes weighted scores automatically according to GES standards.
`
  },
  {
    id: 'announcement',
    name: '🚀 Platform Feature Release & Notice',
    desc: 'Product updates, improvements, and notifications for school administrators.',
    title: '🚀 New Update: [Feature Name] is Now Live',
    category: 'Platform Updates',
    featured_badge: 'Release Note',
    target_role: 'All Users',
    summary: 'Discover what is new in the latest release of Labour Edu Report System and how it benefits your school.',
    content: `# 🚀 New Feature Release: [Feature Name]

## What Is New?
We are excited to announce the release of our latest enhancement designed to make school report card management even faster and simpler.

## 🌟 Key Highlights
- **Faster Score Sync:** Offline recording speeds improved by 40%.
- **Automated Broadcasts:** Instant alerts for staff and parents.
- **Enhanced Mobile UI:** Cleaner experience on all smartphones.

---

## 🛠️ How to Start Using It Today
Simply refresh your app or log into your school dashboard. The new tools are immediately active for all registered basic schools.
`
  }
];

const BlogManager = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal and Editor states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editorMode, setEditorMode] = useState('split'); // 'write' | 'split' | 'preview'
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Form State
  const initialFormState = {
    title: '',
    slug: '',
    category: 'GES Directives & Policy',
    target_role: 'All Schools & Parents',
    featured_badge: 'Official Policy Guide',
    read_time: '3 min read',
    author: user?.fullName || 'Labour Edu Editorial Desk',
    summary: '',
    content: '',
    cover_image: '',
    is_published: true,
    tags: ['GES', 'Policy'],
    official_source_url: '',
    official_source_name: 'Ghana Education Service (GES)',
    dispatch_broadcast: false
  };
  const [formData, setFormData] = useState(initialFormState);
  const [tagInput, setTagInput] = useState('');

  const textareaRef = useRef(null);

  // Fetch all posts
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

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  // Auto-calculate word count and reading time
  const stats = useMemo(() => {
    const text = (formData.content || '').trim();
    if (!text) return { words: 0, readTime: '1 min read' };
    const words = text.split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return {
      words,
      readTime: `${minutes} min read`
    };
  }, [formData.content]);

  // Auto-generate slug from title
  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    const autoSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60);

    setFormData(prev => ({
      ...prev,
      title: newTitle,
      slug: prev.slug === '' || prev.slug.startsWith('post-') || !editingPost ? autoSlug : prev.slug
    }));
  };

  // Insert markdown tag helper at cursor position
  const insertMarkdown = (prefix, suffix = '', placeholder = 'text') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = formData.content || '';
    const selectedText = currentText.substring(start, end) || placeholder;

    const newText = currentText.substring(0, start) + prefix + selectedText + suffix + currentText.substring(end);
    setFormData(prev => ({ ...prev, content: newText }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 50);
  };

  // Apply a template
  const applyTemplate = (template) => {
    if (formData.content && !window.confirm('Apply this template? Your current editor text will be replaced.')) {
      return;
    }
    setFormData(prev => ({
      ...prev,
      title: template.title,
      slug: template.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 55),
      category: template.category,
      featured_badge: template.featured_badge,
      target_role: template.target_role,
      summary: template.summary,
      content: template.content,
      read_time: '3 min read'
    }));
    showToast(`Template "${template.name}" applied successfully!`);
  };

  // Tag manipulation functions
  const handleAddTag = (rawTag) => {
    const clean = (rawTag || '').trim().replace(/^#/, '');
    if (!clean) return;
    if (formData.tags && formData.tags.some(t => t.toLowerCase() === clean.toLowerCase())) {
      setTagInput('');
      return;
    }
    setFormData(prev => ({
      ...prev,
      tags: [...(prev.tags || []), clean]
    }));
    setTagInput('');
  };

  const handleRemoveTag = (indexToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: (prev.tags || []).filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  // Open modal for new post
  const handleOpenNew = () => {
    setEditingPost(null);
    setFormData(initialFormState);
    setTagInput('');
    setEditorMode('split');
    setIsEditorOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (post) => {
    setEditingPost(post);
    setTagInput('');
    setFormData({
      title: post.title || '',
      slug: post.slug || '',
      category: post.category || 'GES Directives & Policy',
      target_role: post.target_role || 'All Schools & Parents',
      featured_badge: post.featured_badge || 'Official Policy Guide',
      read_time: post.read_time || '3 min read',
      author: post.author || user?.fullName || 'Labour Edu Editorial Desk',
      summary: post.summary || '',
      content: post.content || '',
      cover_image: post.cover_image || '',
      is_published: post.is_published !== false,
      tags: Array.isArray(post.tags) ? post.tags : (typeof post.tags === 'string' && post.tags) ? post.tags.split(',').map(t => t.trim()).filter(Boolean) : ['GES', 'Education'],
      official_source_url: post.official_source_url || '',
      official_source_name: post.official_source_name || 'Ghana Education Service (GES)',
      dispatch_broadcast: false
    });
    setEditorMode('split');
    setIsEditorOpen(true);
  };

  // Save post handler
  const handleSavePost = async (e) => {
    if (e) e.preventDefault();
    if (!formData.title.trim()) {
      alert('Please provide a post title.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        read_time: stats.readTime
      };

      let savedPost;
      if (editingPost?.id) {
        savedPost = await blogService.updatePost(editingPost.id, payload);
        showToast('Blog post updated successfully!');
      } else {
        savedPost = await blogService.createPost(payload);
        showToast('New blog post published successfully!');
      }

      // Optional Broadcast Dispatch
      if (formData.dispatch_broadcast && savedPost) {
        try {
          await broadcastService.createBroadcast({
            title: `📢 ${savedPost.title}`,
            content: savedPost.summary || 'Read the latest educational update and guide on Labour Edu.',
            targetAudience: 'all',
            severity: 'info',
            bannerEnabled: true,
            modalEnabled: false,
            actionUrl: `/blog/${savedPost.slug || savedPost.id}`,
            actionLabel: 'Read Blog Guide'
          });
        } catch (bErr) {
          console.warn('Broadcast dispatch note:', bErr);
        }
      }

      setIsEditorOpen(false);
      fetchPosts();
    } catch (err) {
      console.error('Error saving post:', err);
      alert('Could not save post. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  // Delete post handler
  const handleDeletePost = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this post?')) return;
    try {
      await blogService.deletePost(id);
      showToast('Post removed successfully.');
      fetchPosts();
    } catch (err) {
      console.error('Error deleting post:', err);
      alert('Could not delete post.');
    }
  };

  // Copy public link
  const handleCopyLink = (post) => {
    const url = `${window.location.origin}/blog/${post.slug || post.id}`;
    navigator.clipboard.writeText(url);
    showToast(`Copied public URL: ${url}`);
  };

  // Format inline markdown (Bold, Italic, Code, Links)
  const formatInlineText = (text) => {
    if (!text) return null;
    const parts = [];
    const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      if (match[1]) {
        // Bold
        parts.push(<strong key={match.index} style={{ color: '#09090b', fontWeight: 800 }}>{match[2]}</strong>);
      } else if (match[3]) {
        // Italic
        parts.push(<em key={match.index}>{match[4]}</em>);
      } else if (match[5]) {
        // Inline code
        parts.push(
          <code key={match.index} style={{ background: '#F1F5F9', color: '#0F172A', padding: '0.15rem 0.35rem', borderRadius: '4px', fontSize: '0.85em', fontFamily: 'monospace' }}>
            {match[6]}
          </code>
        );
      } else if (match[7]) {
        // Link
        parts.push(
          <a key={match.index} href={match[9]} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}>
            {match[8]}
          </a>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    return parts.length > 0 ? parts : text;
  };

  // Complete Markdown Parser & Renderer
  const renderMarkdown = (text) => {
    if (!text) return <p style={{ color: '#94A3B8', fontStyle: 'italic' }}>Live preview will appear here as you type...</p>;

    const lines = text.split('\n');
    return (
      <div style={{ lineHeight: '1.75', color: '#1E293B', fontSize: '0.94rem' }}>
        {lines.map((rawLine, idx) => {
          const line = rawLine.trim();

          // H1 Title
          if (/^#\s+/.test(line)) {
            return (
              <h1 key={idx} style={{ fontSize: '1.65rem', fontWeight: 900, marginTop: '1.4rem', marginBottom: '0.6rem', color: '#09090B', fontFamily: 'Outfit, sans-serif', borderBottom: '2px solid #E2E8F0', paddingBottom: '0.4rem', letterSpacing: '-0.01em' }}>
                {formatInlineText(line.replace(/^#\s+/, ''))}
              </h1>
            );
          }

          // H2 Subheading
          if (/^##\s+/.test(line)) {
            return (
              <h2 key={idx} style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '1.2rem', marginBottom: '0.5rem', color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>
                {formatInlineText(line.replace(/^##\s+/, ''))}
              </h2>
            );
          }

          // H3 Subheading
          if (/^###\s+/.test(line)) {
            return (
              <h3 key={idx} style={{ fontSize: '1.08rem', fontWeight: 700, marginTop: '1rem', marginBottom: '0.4rem', color: '#1E293B' }}>
                {formatInlineText(line.replace(/^###\s+/, ''))}
              </h3>
            );
          }

          // Horizontal Divider
          if (line === '---' || line === '***') {
            return <hr key={idx} style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '1.25rem 0' }} />;
          }

          // Images: ![alt text](url) or ![alt | align | size](url)
          const imgMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
          if (imgMatch) {
            const rawAlt = imgMatch[1] || '';
            const src = imgMatch[2];
            const parts = rawAlt.split('|').map(p => p.trim());
            const caption = parts[0] || '';
            const align = parts.find(p => ['left', 'right', 'center', 'full'].includes(p.toLowerCase())) || 'center';
            const width = parts.find(p => /^\d+(%|px|rem|em|vw)$/.test(p) || ['small', 'medium', 'large', 'full'].includes(p.toLowerCase())) || (align === 'full' ? '100%' : '100%');

            const widthStyle = width === 'small' ? '320px' : width === 'medium' ? '540px' : width === 'large' ? '760px' : width === 'full' ? '100%' : width;

            return (
              <figure
                key={idx}
                style={{
                  margin: align === 'left' ? '1.25rem auto 1.25rem 0' : align === 'right' ? '1.25rem 0 1.25rem auto' : '1.5rem auto',
                  textAlign: align === 'left' ? 'left' : align === 'right' ? 'right' : 'center',
                  maxWidth: widthStyle,
                  width: '100%'
                }}
              >
                <img
                  src={src}
                  alt={caption || 'Article illustration'}
                  style={{
                    width: '100%',
                    maxHeight: '500px',
                    objectFit: 'contain',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 6px 22px rgba(0, 0, 0, 0.08)',
                    display: 'inline-block',
                    background: '#FAFAFA'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                {caption && (
                  <figcaption style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.45rem', textAlign: 'center', fontStyle: 'italic', fontWeight: 500 }}>
                    <i className="fas fa-camera" style={{ marginRight: '5px', fontSize: '0.74rem', opacity: 0.7 }}></i>
                    {caption}
                  </figcaption>
                )}
              </figure>
            );
          }

          // Official Verification Box
          if (line.includes('Official Verification & Reference Document') || line.includes('View Original Directive')) {
            return (
              <div key={idx} style={{ background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderLeft: '5px solid #2563EB', borderRadius: '12px', padding: '1rem 1.2rem', margin: '1rem 0' }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                  🏛️ Official Government Source Document
                </div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>
                  {formatInlineText(line)}
                </div>
              </div>
            );
          }

          // Callout Alert: Note, Tip, Warning, Info
          if (/^>\s*/.test(line)) {
            const clean = line.replace(/^>\s*/, '');
            let alertBg = '#EFF6FF', alertBorder = '#BFDBFE', alertColor = '#1E40AF', icon = 'fa-info-circle';

            if (clean.toLowerCase().includes('warning') || clean.toLowerCase().includes('advisory')) {
              alertBg = '#FEF2F2'; alertBorder = '#FECACA'; alertColor = '#991B1B'; icon = 'fa-triangle-exclamation';
            } else if (clean.toLowerCase().includes('tip') || clean.toLowerCase().includes('pro tip')) {
              alertBg = '#ECFDF5'; alertBorder = '#A7F3D0'; alertColor = '#065F46'; icon = 'fa-lightbulb';
            }

            return (
              <div key={idx} style={{ background: alertBg, border: `1px solid ${alertBorder}`, borderRadius: '10px', padding: '0.85rem 1.15rem', margin: '0.85rem 0', color: alertColor, fontSize: '0.88rem', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <i className={`fas ${icon}`} style={{ marginTop: '3px', flexShrink: 0, fontSize: '1rem' }}></i>
                <div style={{ flex: 1 }}>{formatInlineText(clean)}</div>
              </div>
            );
          }

          // Step items: e.g. "Step 1. ..."
          if (/^(?:Step\s+)?\d+[\.:\)]\s+/i.test(line)) {
            const match = line.match(/^(?:Step\s+)?(\d+)[\.:\)]\s*(.*)/i);
            const num = match ? match[1] : '1';
            const content = match ? match[2] : line;
            return (
              <div key={idx} style={{ paddingLeft: '0.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ fontWeight: 800, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', minWidth: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', flexShrink: 0, marginTop: '2px' }}>
                  {num}
                </span>
                <span style={{ flex: 1, color: '#334155' }}>{formatInlineText(content)}</span>
              </div>
            );
          }

          // Bullet list items
          if (/^[-*•]\s+/.test(line)) {
            return (
              <div key={idx} style={{ paddingLeft: '0.5rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ color: '#2563EB', fontSize: '0.85rem' }}>●</span>
                <span style={{ flex: 1, color: '#334155' }}>{formatInlineText(line.replace(/^[-*•]\s+/, ''))}</span>
              </div>
            );
          }

          // Table row: | Column 1 | Column 2 |
          if (line.startsWith('|') && line.endsWith('|')) {
            const cells = line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim());
            const isHeaderDivider = cells.every(c => /^:?-+:?$/.test(c));
            if (isHeaderDivider) return null;

            return (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.5rem 0.75rem', fontSize: '0.82rem', fontWeight: 600 }}>
                {cells.map((cell, cIdx) => (
                  <div key={cIdx}>{formatInlineText(cell)}</div>
                ))}
              </div>
            );
          }

          if (!line) return <div key={idx} style={{ height: '0.5rem' }} />;

          return <p key={idx} style={{ margin: '0 0 0.55rem 0', color: '#334155' }}>{formatInlineText(line)}</p>;
        })}
      </div>
    );
  };

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const tagStr = Array.isArray(post.tags) ? post.tags.join(' ') : (post.tags || '');
      const matchesSearch = 
        !searchQuery || 
        post.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tagStr.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === 'ALL' || post.category?.toLowerCase() === selectedCategory.toLowerCase();
      const matchesRole = selectedRole === 'ALL' || post.target_role?.toLowerCase() === selectedRole.toLowerCase();
      const matchesStatus = 
        statusFilter === 'ALL' || 
        (statusFilter === 'PUBLISHED' && post.is_published !== false) ||
        (statusFilter === 'DRAFT' && post.is_published === false);

      return matchesSearch && matchesCat && matchesRole && matchesStatus;
    });
  }, [posts, searchQuery, selectedCategory, selectedRole, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', color: '#09090B' }}>
      
      {/* Top Banner Header */}
      <div style={{
        padding: '2rem 2.25rem',
        borderRadius: '20px',
        background: '#09090B',
        border: '1px solid #27272A',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.25rem',
        color: '#FFFFFF'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.4)', padding: '0.25rem 0.75rem', borderRadius: '999px', color: '#60A5FA', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
            <i className="fas fa-feather-pointed"></i> Platform Editorial Studio
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.9rem', fontWeight: 900, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            Blog, Directives &amp; Manuals Studio
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#A1A1AA', fontSize: '0.9rem', maxWidth: '650px', lineHeight: 1.5 }}>
            Compose, format, preview, and publish plain-English educational articles, GES circular guides, and step-by-step user manuals with rich markdown tools.
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          style={{
            padding: '0.85rem 1.6rem',
            borderRadius: '12px',
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)'
          }}
        >
          <i className="fas fa-plus"></i>
          <span>Compose New Post</span>
        </button>
      </div>

      {/* Toast Alert Notification */}
      {toastMessage && (
        <div style={{
          background: '#ECFDF5',
          border: '1px solid #A7F3D0',
          color: '#065F46',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          fontWeight: 700,
          fontSize: '0.86rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)'
        }}>
          <i className="fas fa-check-circle" style={{ fontSize: '1.15rem', color: '#10B981' }}></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E4E4E7',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.85rem' }}></i>
            <input
              type="text"
              placeholder="Search posts by title, summary, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.85rem 0.55rem 2.25rem', borderRadius: '8px', border: '1px solid #D4D4D8', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid #D4D4D8', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <option value="ALL">📁 All Categories ({posts.length})</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid #D4D4D8', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <option value="ALL">All Status</option>
            <option value="PUBLISHED">🟢 Published Only</option>
            <option value="DRAFT">🟡 Drafts Only</option>
          </select>
        </div>
      </div>

      {/* Posts List / Grid */}
      {loading ? (
        <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
          <LogoPreloader text="Loading Blog &amp; Manuals..." />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7' }}>
          <i className="fas fa-file-lines" style={{ fontSize: '3rem', color: '#D4D4D8', marginBottom: '1rem', display: 'block' }}></i>
          <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 800, color: '#09090B' }}>No Blog Posts or Manuals Found</h3>
          <p style={{ color: '#71717A', fontSize: '0.88rem', margin: '0 0 1.25rem 0' }}>Start by composing a new article or converting a directive from the GES Radar.</p>
          <button
            onClick={handleOpenNew}
            style={{ padding: '0.65rem 1.4rem', borderRadius: '10px', background: '#2563EB', color: '#FFFFFF', border: 'none', fontWeight: 800, cursor: 'pointer' }}
          >
            + Compose First Post
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {filteredPosts.map(post => (
            <div
              key={post.id}
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E4E4E7',
                padding: '1.4rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '6px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #DBEAFE' }}>
                    📁 {post.category || 'General'}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: post.is_published !== false ? '#059669' : '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className={`fas fa-circle ${post.is_published !== false ? 'text-emerald-500' : 'text-amber-500'}`} style={{ fontSize: '0.5rem' }}></i>
                    {post.is_published !== false ? 'Published' : 'Draft'}
                  </span>
                </div>

                <h3 style={{ margin: '0 0 0.45rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#09090B', lineHeight: 1.35, fontFamily: 'Outfit, sans-serif' }}>
                  {post.title}
                </h3>

                <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748B', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {post.summary}
                </p>

                {/* Tag Pills */}
                {post.tags && (Array.isArray(post.tags) ? post.tags : post.tags.split(',')).filter(Boolean).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.65rem' }}>
                    {(Array.isArray(post.tags) ? post.tags : post.tags.split(',')).filter(Boolean).slice(0, 4).map((t, idx) => (
                      <span
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setSearchQuery(t.trim()); }}
                        title={`Filter by #${t.trim()}`}
                        style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '0.1rem 0.45rem', borderRadius: '4px', cursor: 'pointer', border: '1px solid #DBEAFE' }}
                      >
                        #{t.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #F4F4F5', paddingTop: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '0.74rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span><i className="fas fa-clock" style={{ marginRight: '4px' }}></i>{post.read_time || '3 min'}</span>
                  <span><i className="fas fa-user" style={{ marginRight: '4px' }}></i>{post.author || 'Admin'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => handleCopyLink(post)}
                    title="Copy Public Link to Article"
                    style={{ background: '#F4F4F5', border: '1px solid #E4E4E7', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', cursor: 'pointer' }}
                  >
                    <i className="fas fa-link" style={{ fontSize: '0.8rem' }}></i>
                  </button>

                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${post.title}\n\n${window.location.origin}/blog/${post.slug || post.id}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Share Official Headline on WhatsApp"
                    style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', textDecoration: 'none' }}
                  >
                    <i className="fab fa-whatsapp" style={{ fontSize: '0.9rem' }}></i>
                  </a>

                  <button
                    onClick={() => handleOpenEdit(post)}
                    title="Edit Post in Studio"
                    style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', cursor: 'pointer' }}
                  >
                    <i className="fas fa-pen-to-square" style={{ fontSize: '0.8rem' }}></i>
                  </button>

                  <button
                    onClick={() => handleDeletePost(post.id)}
                    title="Delete Post"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', cursor: 'pointer' }}
                  >
                    <i className="fas fa-trash-can" style={{ fontSize: '0.8rem' }}></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FULL-FEATURED BLOGGER COMPOSER & EDIT STUDIO MODAL */}
      {isEditorOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1.25rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '1200px',
            height: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)'
          }}>
            
            {/* Studio Top Header */}
            <div style={{
              padding: '1.15rem 1.75rem',
              background: '#09090B',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #27272A'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: '1rem' }}>
                  <i className="fas fa-feather-pointed"></i>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, fontFamily: 'Outfit, sans-serif' }}>
                    {editingPost ? 'Edit Blog Article / Manual' : 'Compose New Article & Manual'}
                  </h2>
                  <span style={{ fontSize: '0.74rem', color: '#A1A1AA' }}>
                    {stats.words} words • {stats.readTime}
                  </span>
                </div>
              </div>

              {/* View Mode Toggle & Close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', background: '#18181B', borderRadius: '8px', padding: '3px', border: '1px solid #27272A' }}>
                  <button
                    type="button"
                    onClick={() => setEditorMode('write')}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: editorMode === 'write' ? '#2563EB' : 'transparent', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <i className="fas fa-pen" style={{ marginRight: '4px' }}></i> Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('split')}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: editorMode === 'split' ? '#2563EB' : 'transparent', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <i className="fas fa-columns" style={{ marginRight: '4px' }}></i> Split View
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('preview')}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: editorMode === 'preview' ? '#2563EB' : 'transparent', color: '#FFFFFF', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <i className="fas fa-eye" style={{ marginRight: '4px' }}></i> Live Preview
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#A1A1AA', fontSize: '1.4rem', cursor: 'pointer', marginLeft: '6px' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Studio Body Scrollable */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
              
              {/* Left Column: Metadata & Write Area */}
              <div style={{
                flex: editorMode === 'preview' ? 0 : editorMode === 'write' ? 1 : 1,
                display: editorMode === 'preview' ? 'none' : 'flex',
                flexDirection: 'column',
                borderRight: editorMode === 'split' ? '1px solid #E2E8F0' : 'none',
                overflowY: 'auto',
                padding: '1.5rem',
                gap: '1.25rem'
              }}>
                
                {/* 1-Click Templates Bar */}
                <div style={{ background: '#F8FAFC', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                    ⚡ 1-Click Blogger Starter Templates:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {PRESET_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', color: '#1E293B' }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title & Slug */}
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: '#09090B', marginBottom: '0.35rem' }}>
                    Article Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 🇬🇭 GES Directive: 30% Continuous Assessment & 70% Terminal Exam Policy"
                    value={formData.title}
                    onChange={handleTitleChange}
                    style={{ width: '100%', padding: '0.75rem 0.85rem', borderRadius: '10px', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 800 }}
                  />
                </div>

                {/* Metadata Row: Category, Role, Badge */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.76rem', color: '#475569', marginBottom: '0.3rem' }}>
                      Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.76rem', color: '#475569', marginBottom: '0.3rem' }}>
                      Target Role
                    </label>
                    <select
                      value={formData.target_role}
                      onChange={(e) => setFormData({ ...formData, target_role: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      {TARGET_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.76rem', color: '#475569', marginBottom: '0.3rem' }}>
                      Pill Badge Tag
                    </label>
                    <select
                      value={formData.featured_badge}
                      onChange={(e) => setFormData({ ...formData, featured_badge: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      {BADGES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                {/* Summary / Excerpt */}
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.78rem', color: '#09090B', marginBottom: '0.3rem' }}>
                    Executive Summary / Excerpt (1-2 sentences for search &amp; previews)
                  </label>
                  <textarea
                    rows={2}
                    value={formData.summary}
                    onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                    placeholder="Short plain-English summary of what this directive or manual accomplishes..."
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', lineHeight: 1.45, fontFamily: 'inherit' }}
                  />
                </div>

                {/* Interactive Tags & Topic Classification */}
                <div style={{ background: '#F8FAFC', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.78rem', color: '#09090B', marginBottom: '0.35rem' }}>
                    🏷️ Tags &amp; Topic Classifications
                  </label>
                  
                  {/* Current Tags Pill List */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '0.5rem' }}>
                    {(formData.tags || []).map((tag, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: '#EFF6FF',
                          color: '#2563EB',
                          border: '1px solid #BFDBFE',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '999px',
                          fontSize: '0.76rem',
                          fontWeight: 800
                        }}
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(idx)}
                          style={{ background: 'transparent', border: 'none', color: '#2563EB', cursor: 'pointer', padding: 0, fontSize: '0.75rem', fontWeight: 900 }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Input Box for New Tag */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Type a tag (e.g. BECE, Continuous Assessment) and press Enter or comma..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      style={{ flex: 1, padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTag(tagInput)}
                      style={{ padding: '0.45rem 0.9rem', borderRadius: '6px', background: '#2563EB', color: '#FFFFFF', border: 'none', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                    >
                      + Add Tag
                    </button>
                  </div>

                  {/* Suggested Popular Tags */}
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>Popular:</span>
                    {['BECE', 'ContinuousAssessment', 'Curriculum', 'Timetable', 'GES', 'SchoolManagement', 'TeacherCPD', 'ReportCards'].map(pop => (
                      <button
                        key={pop}
                        type="button"
                        onClick={() => handleAddTag(pop)}
                        style={{ background: '#FFFFFF', border: '1px dashed #CBD5E1', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem', color: '#475569', cursor: 'pointer' }}
                      >
                        + #{pop}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rich Markdown Formatting Toolbar */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontWeight: 800, fontSize: '0.78rem', color: '#09090B' }}>
                      Article Body (Markdown Supported)
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Supports H1-H3, lists, tables, alerts, and official links
                    </span>
                  </div>

                  {/* The Toolbar */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                    padding: '0.5rem',
                    background: '#F1F5F9',
                    borderRadius: '10px 10px 0 0',
                    border: '1px solid #CBD5E1',
                    borderBottom: 'none'
                  }}>
                    <button type="button" title="Heading 1" onClick={() => insertMarkdown('# ', '', 'Main Heading')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>H1</button>
                    <button type="button" title="Heading 2" onClick={() => insertMarkdown('## ', '', 'Section Heading')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>H2</button>
                    <button type="button" title="Heading 3" onClick={() => insertMarkdown('### ', '', 'Subsection')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>H3</button>
                    
                    <div style={{ width: '1px', height: '20px', background: '#CBD5E1', margin: '0 3px' }} />

                    <button type="button" title="Bold Text" onClick={() => insertMarkdown('**', '**', 'bold text')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}><strong>B</strong></button>
                    <button type="button" title="Italic Text" onClick={() => insertMarkdown('*', '*', 'italic text')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontStyle: 'italic', fontSize: '0.75rem', cursor: 'pointer' }}><em>I</em></button>
                    <button type="button" title="Inline Code" onClick={() => insertMarkdown('`', '`', 'code')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'pointer' }}>&lt;/&gt;</button>

                    <div style={{ width: '1px', height: '20px', background: '#CBD5E1', margin: '0 3px' }} />

                    <button type="button" title="Numbered Step" onClick={() => insertMarkdown('Step 1. ', '', 'Action instruction')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>1. Step</button>
                    <button type="button" title="Bullet Point" onClick={() => insertMarkdown('- ', '', 'Bullet item')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>• List</button>

                    <div style={{ width: '1px', height: '20px', background: '#CBD5E1', margin: '0 3px' }} />

                    <button type="button" title="Info Alert Box" onClick={() => insertMarkdown('> ℹ️ **Important:** ', '', 'Alert message text here')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E40AF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>ℹ️ Info Box</button>
                    <button type="button" title="Warning Box" onClick={() => insertMarkdown('> ⚠️ **Warning:** ', '', 'Compliance warning text here')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>⚠️ Warning Box</button>
                    <button type="button" title="Tip Box" onClick={() => insertMarkdown('> 💡 **Pro Tip:** ', '', 'Helpful tip text here')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#065F46', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>💡 Tip Box</button>

                    <div style={{ width: '1px', height: '20px', background: '#CBD5E1', margin: '0 3px' }} />

                    <button type="button" title="Table Generator" onClick={() => insertMarkdown('\n| Item | Description | Weight |\n| :--- | :--- | :---: |\n| Class Exercise | Formative Assessment | 10% |\n| Mid-Term Exam | Continuous Check | 20% |\n| Terminal Exam | Final Exam Score | 70% |\n', '', '')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>📊 Table</button>
                    <button type="button" title="Insert Link" onClick={() => insertMarkdown('[', '](https://ges.gov.gh)', 'Read Official Notice')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>🔗 Link</button>
                    
                    <div style={{ width: '1px', height: '20px', background: '#CBD5E1', margin: '0 3px' }} />

                    {/* Image Insertion Helper Buttons */}
                    <button type="button" title="Insert Centered Image with Caption" onClick={() => insertMarkdown('\n![Caption Description | center | 80%](', ')\n', 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0369A1', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>📷 Centered Image</button>
                    <button type="button" title="Insert Float Left Image" onClick={() => insertMarkdown('\n![Figure Caption | left | 320px](', ')\n', 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>📷 Left Float</button>
                    <button type="button" title="Insert Float Right Image" onClick={() => insertMarkdown('\n![Figure Caption | right | 320px](', ')\n', 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>📷 Right Float</button>
                    
                    <button type="button" title="Official Source Box" onClick={() => insertMarkdown('\n---\n\n## 🏛️ Official Verification & Reference Document\n👉 **[View Original Directive on Ghana Education Service (Direct Page)](https://ges.gov.gh)**\n', '', '')} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>🏛️ Official Box</button>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={12}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Type or paste your article markdown here..."
                    style={{
                      width: '100%',
                      padding: '0.85rem',
                      borderRadius: '0 0 10px 10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.88rem',
                      lineHeight: 1.55,
                      fontFamily: 'monospace',
                      minHeight: '220px'
                    }}
                  />
                </div>

                {/* Additional Blogger Options (Cover Image, Broadcast Dispatch) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.76rem', color: '#09090B', marginBottom: '0.3rem' }}>
                      Cover Image URL (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/..."
                      value={formData.cover_image}
                      onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 800, fontSize: '0.76rem', color: '#09090B', marginBottom: '0.3rem' }}>
                      Public URL Slug
                    </label>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                {/* Broadcast Checkbox & Status Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 700, color: '#09090B', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.dispatch_broadcast}
                      onChange={(e) => setFormData({ ...formData, dispatch_broadcast: e.target.checked })}
                    />
                    <span>Also dispatch top notification banner across school dashboards pointing to this article</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 700, color: '#09090B', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_published}
                      onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                    />
                    <span>Publish Immediately (Make Live)</span>
                  </label>
                </div>

              </div>

              {/* Right Column: Live Reader Preview Pane */}
              <div style={{
                flex: editorMode === 'write' ? 0 : 1,
                display: editorMode === 'write' ? 'none' : 'flex',
                flexDirection: 'column',
                background: '#FAFAFA',
                overflowY: 'auto',
                padding: '2rem 2.25rem'
              }}>
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  padding: '2.25rem',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                  maxWidth: '750px',
                  margin: '0 auto',
                  width: '100%'
                }}>
                  {/* Preview Article Header */}
                  <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #DBEAFE' }}>
                        📁 {formData.category}
                      </span>
                      <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#F5F3FF', color: '#7C3AED', border: '1px solid #EDE9FE' }}>
                        🏷️ {formData.featured_badge}
                      </span>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B' }}>
                        🎯 For: {formData.target_role}
                      </span>
                    </div>

                    <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.8rem', fontWeight: 900, color: '#09090B', margin: '0 0 0.75rem 0', lineHeight: 1.3 }}>
                      {formData.title || 'Untitled Article'}
                    </h1>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.78rem', color: '#64748B' }}>
                      <span><i className="fas fa-user-circle" style={{ marginRight: '4px', color: '#2563EB' }}></i>{formData.author}</span>
                      <span><i className="fas fa-clock" style={{ marginRight: '4px', color: '#2563EB' }}></i>{stats.readTime}</span>
                      <span><i className="fas fa-calendar" style={{ marginRight: '4px', color: '#2563EB' }}></i>{new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>

                    {formData.summary && (
                      <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: '#F8FAFC', borderRadius: '10px', borderLeft: '4px solid #2563EB', fontSize: '0.88rem', color: '#334155', fontStyle: 'italic', lineHeight: 1.55 }}>
                        {formData.summary}
                      </div>
                    )}
                  </div>

                  {/* Preview Article Markdown Content */}
                  <div>
                    {renderMarkdown(formData.content)}
                  </div>

                  {/* Preview Tags */}
                  {formData.tags && formData.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
                      {formData.tags.map((t, idx) => (
                        <span key={idx} style={{ fontSize: '0.74rem', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #BFDBFE' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Preview WhatsApp Share Bar */}
                  <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                      <i className="fas fa-share-nodes" style={{ marginRight: '5px', color: '#2563EB' }}></i>
                      Headline WhatsApp Share Preview:
                    </div>
                    <div style={{ background: '#25D366', color: '#FFFFFF', padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fab fa-whatsapp"></i>
                      <span>Share on WhatsApp</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Studio Bottom Bar */}
            <div style={{
              padding: '1rem 1.75rem',
              background: '#FFFFFF',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Article destination: <code>/blog/{formData.slug || 'slug'}</code>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: '#F4F4F5', border: '1px solid #E4E4E7', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePost}
                  disabled={saving}
                  style={{
                    padding: '0.65rem 1.75rem',
                    borderRadius: '10px',
                    background: '#2563EB',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
                  }}
                >
                  <i className="fas fa-check"></i>
                  <span>{saving ? 'Publishing...' : editingPost ? 'Update Post' : 'Publish to Blog & Manuals'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default BlogManager;
