import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gesNewsWatcherService, { MONITORED_SOURCES } from '../../services/gesNewsWatcherService';
import broadcastService from '../../services/broadcastService';
import blogService from '../../services/blogService';

const GesNewsWatcher = () => {
  const navigate = useNavigate();
  const [newsList, setNewsList] = useState([]);
  const [selectedSource, setSelectedSource] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState('');
  const [blogModalItem, setBlogModalItem] = useState(null);
  const [broadcastModalItem, setBroadcastModalItem] = useState(null);
  const [dispatchSuccess, setDispatchSuccess] = useState('');
  const [publishingBlog, setPublishingBlog] = useState(false);

  const loadNews = () => {
    const list = gesNewsWatcherService.getNews();
    setNewsList(list);
    setLastScanned(gesNewsWatcherService.getLastScanTime());
  };

  useEffect(() => {
    loadNews();
  }, []);

  const handleScanNow = async () => {
    setScanning(true);
    try {
      await new Promise(r => setTimeout(r, 1200)); // smooth scanning UX
      const result = await gesNewsWatcherService.scanAllSources();
      setNewsList(result.items);
      setLastScanned(result.scannedAt);
    } finally {
      setScanning(false);
    }
  };

  const handleMarkRead = (id) => {
    gesNewsWatcherService.markAsRead(id);
    loadNews();
  };

  const handleConvertToBroadcast = (item) => {
    const cleanTitle = item.title.replace(/^[^\w\s]+/, '').trim();
    const blogSlug = `ges-${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 45)}`;

    setBroadcastModalItem({
      title: item.title,
      content: `${item.summary}\n\nRead the simplified 2-minute breakdown on the Labour Edu Blog.`,
      targetAudience: item.targetAudience || 'all',
      severity: item.urgency === 'urgent' ? 'urgent' : item.urgency === 'high' ? 'warning' : 'info',
      blogUrl: `/blog/${blogSlug}`,
      actionUrl: `/blog/${blogSlug}`,
      actionLabel: 'Read Blog Guide',
      officialSourceUrl: item.sourceUrl
    });
  };

  const handleOpenConvertToBlogModal = (item) => {
    const cleanTitle = item.title.replace(/^[^\w\s]+/, '').trim();
    const blogSlug = `ges-${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 45)}-${Date.now().toString().slice(-4)}`;

    const generatedMarkdown = `# ${cleanTitle}

## Executive Summary
${item.summary}

## Key Takeaways for Ghanaian Basic Schools
- **For Headteachers:** Verify class assessment records and broadsheets in your school dashboard to ensure compliance with this directive.
- **For Subject Teachers:** Ensure all continuous assessment scores and terminal exam marks are recorded and synchronized before deadlines.
- **For Parents & Guardians:** You can view terminal report cards, continuous assessment updates, and fee summaries directly on the Labour Edu Parent Portal.

---

## 🏛️ Official Verification & Reference Document
This simplified breakdown is prepared by the **Labour Edu Editorial Team** to assist schools in understanding national educational directives.

For the complete official document, statutory tables, and signed government notices, please inspect the original official page:

👉 **[View Original Directive on ${item.sourceName} (Direct Information Page)](${item.sourceUrl})**
`;

    setBlogModalItem({
      title: cleanTitle,
      slug: blogSlug,
      category: 'GES Directives & Policy',
      targetRole: item.targetAudience === 'teacher' ? 'Teachers' : item.targetAudience === 'headteacher' ? 'Headteachers' : 'All Schools & Parents',
      featuredBadge: 'Official Policy Guide',
      readTime: '2 min read',
      author: 'Labour Edu Editorial Desk',
      summary: item.summary,
      content: generatedMarkdown,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      dispatchAsBroadcast: true
    });
  };

  const handlePublishBlogPost = async (e) => {
    e.preventDefault();
    if (!blogModalItem) return;

    setPublishingBlog(true);
    try {
      // 1. Create and publish the blog post
      const newPost = await blogService.createPost({
        title: blogModalItem.title,
        slug: blogModalItem.slug,
        category: blogModalItem.category || 'GES Directives & Policy',
        target_role: blogModalItem.targetRole || 'All Schools & Parents',
        featured_badge: blogModalItem.featuredBadge || 'Official Policy Guide',
        read_time: blogModalItem.readTime || '2 min read',
        author: blogModalItem.author || 'Labour Edu Editorial Desk',
        summary: blogModalItem.summary,
        content: blogModalItem.content,
        is_published: true
      });

      // 2. Optionally dispatch as a top announcement banner across the app
      if (blogModalItem.dispatchAsBroadcast) {
        try {
          await broadcastService.createBroadcast({
            title: `🇬🇭 ${blogModalItem.title}`,
            content: blogModalItem.summary,
            targetAudience: 'all',
            severity: 'warning',
            bannerEnabled: true,
            modalEnabled: false,
            blogUrl: `/blog/${newPost.slug || blogModalItem.slug}`,
            actionUrl: `/blog/${newPost.slug || blogModalItem.slug}`,
            actionLabel: 'Read Blog Guide'
          });
        } catch (bErr) {
          console.warn('[GesNewsWatcher] Broadcast creation note:', bErr);
        }
      }

      setDispatchSuccess(`Blog post published to Blog & Manuals! Accessible at /blog/${newPost.slug || blogModalItem.slug}`);
      setBlogModalItem(null);
      setTimeout(() => setDispatchSuccess(''), 6000);
    } catch (err) {
      console.error('Error publishing blog post:', err);
      alert('Could not publish blog post. Please check console.');
    } finally {
      setPublishingBlog(false);
    }
  };

  const handleDispatchPreparedBroadcast = async () => {
    if (!broadcastModalItem) return;
    try {
      await broadcastService.createBroadcast({
        title: broadcastModalItem.title,
        content: broadcastModalItem.content,
        targetAudience: broadcastModalItem.targetAudience,
        severity: broadcastModalItem.severity,
        bannerEnabled: true,
        modalEnabled: false,
        blogUrl: broadcastModalItem.blogUrl || broadcastModalItem.actionUrl,
        actionUrl: broadcastModalItem.actionUrl,
        actionLabel: broadcastModalItem.actionLabel
      });

      setDispatchSuccess(`Broadcast dispatched to all ${broadcastModalItem.targetAudience === 'all' ? 'schools & portals' : broadcastModalItem.targetAudience + 's'}!`);
      setBroadcastModalItem(null);
      setTimeout(() => setDispatchSuccess(''), 5000);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredNews = newsList.filter(item => {
    const matchesSource = selectedSource === 'all' || item.sourceId === selectedSource;
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesSearch;
  });

  const getUrgencyBadge = (urgency) => {
    switch (urgency) {
      case 'urgent': return { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA', label: 'Urgent' };
      case 'high': return { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A', label: 'Important' };
      case 'medium': return { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', label: 'Policy Update' };
      case 'low': default: return { bg: '#F3F4F6', color: '#4B5563', border: '#E5E7EB', label: 'Information' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', color: '#09090b' }}>
      
      {/* Top Header Card */}
      <div style={{
        padding: '2rem 2.25rem',
        borderRadius: '20px',
        background: '#09090b',
        border: '1px solid #27272a',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.25rem',
        color: '#FFFFFF'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.4)', padding: '0.25rem 0.75rem', borderRadius: '999px', color: '#60a5fa', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
            <i className="fas fa-satellite-dish"></i> Real-Time Ghanaian Education Radar
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            GES &amp; National Education Watcher
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#A1A1AA', fontSize: '0.9rem', maxWidth: '650px', lineHeight: 1.5 }}>
            Automated intelligence watcher monitoring official releases, curriculum directives, and exam guidelines across Ghana Education Service, Ministry of Education, NaCCA, WAEC, and NTC.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <button
            onClick={handleScanNow}
            disabled={scanning}
            style={{
              padding: '0.75rem 1.4rem',
              borderRadius: '12px',
              border: 'none',
              background: scanning ? '#4B5563' : '#2563eb',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: scanning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.2s ease'
            }}
          >
            <i className={`fas fa-arrows-rotate ${scanning ? 'fa-spin' : ''}`}></i>
            {scanning ? 'Scanning 6 Official Portals...' : 'Scan All Portals Now'}
          </button>
          
          <div style={{ fontSize: '0.74rem', color: '#71717a' }}>
            Last Scanned: <strong>{lastScanned.includes('T') ? new Date(lastScanned).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : lastScanned}</strong>
          </div>
        </div>
      </div>

      {/* Success Notification Alert with Direct Link to Blog */}
      {dispatchSuccess && (
        <div style={{
          background: '#ECFDF5',
          border: '1px solid #A7F3D0',
          color: '#065F46',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          fontWeight: 700,
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-check-circle" style={{ fontSize: '1.2rem', color: '#10B981' }}></i>
            <span>{dispatchSuccess}</span>
          </div>

          <button
            onClick={() => navigate('/platform/operations/blog')}
            style={{
              background: '#065F46',
              color: '#FFFFFF',
              border: 'none',
              padding: '0.35rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Open Blog &amp; Manuals CMS</span>
            <i className="fas fa-arrow-right" style={{ fontSize: '0.7rem' }}></i>
          </button>
        </div>
      )}

      {/* Monitored Portals Directory Pills */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', padding: '1.25rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)' }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          Monitored Government &amp; News Portals ({MONITORED_SOURCES.length})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {MONITORED_SOURCES.map(source => (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '0.65rem 0.85rem',
                borderRadius: '10px',
                background: '#FAFAFA',
                border: '1px solid #E4E4E7',
                textDecoration: 'none',
                color: '#09090b',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = source.badgeColor}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#E4E4E7'}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: source.badgeColor, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>
                <i className={`fas ${source.icon}`}></i>
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: 800, fontSize: '0.8rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {source.shortName}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#71717a' }}>
                  Live Endpoint <i className="fas fa-arrow-up-right-from-square" style={{ fontSize: '0.6rem' }}></i>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Main Feed Container */}
      <div style={{ background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E4E4E7', padding: '1.6rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
        
        {/* Filter and Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #F4F4F5', paddingBottom: '1rem' }}>
          
          {/* Source Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => setSelectedSource('all')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: selectedSource === 'all' ? '#09090b' : '#F4F4F5',
                color: selectedSource === 'all' ? '#FFFFFF' : '#71717a',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              All Sources ({newsList.length})
            </button>

            {MONITORED_SOURCES.map(s => {
              const count = newsList.filter(n => n.sourceId === s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSource(s.id)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedSource === s.id ? s.badgeColor : '#F4F4F5',
                    color: selectedSource === s.id ? '#FFFFFF' : '#71717a',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {s.shortName} ({count})
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '240px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA', fontSize: '0.8rem' }}></i>
              <input
                type="text"
                placeholder="Search circulars, BECE, marks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem 0.45rem 2rem',
                  borderRadius: '8px',
                  border: '1px solid #D4D4D8',
                  fontSize: '0.82rem'
                }}
              />
            </div>
          </div>
        </div>

        {/* Circulars List */}
        {filteredNews.length === 0 ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: '#71717a' }}>
            <i className="fas fa-radar" style={{ fontSize: '2.5rem', color: '#D4D4D8', marginBottom: '0.75rem', display: 'block' }}></i>
            <div style={{ fontWeight: 800, color: '#09090b' }}>No Matching Directives Found</div>
            <p style={{ fontSize: '0.85rem', margin: '0.4rem 0 0 0' }}>Try changing the source filter or search query.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {filteredNews.map(item => {
              const urgency = getUrgencyBadge(item.urgency);
              const source = MONITORED_SOURCES.find(s => s.id === item.sourceId) || {};

              return (
                <div
                  key={item.id}
                  style={{
                    background: item.isRead ? '#FAFAFA' : '#FFFFFF',
                    border: `1.5px solid ${item.isBreaking ? '#F59E0B' : '#E4E4E7'}`,
                    borderLeft: `5px solid ${source.badgeColor || '#2563eb'}`,
                    borderRadius: '14px',
                    padding: '1.35rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                    boxShadow: item.isBreaking ? '0 4px 14px rgba(245, 158, 11, 0.12)' : 'none'
                  }}
                >
                  {/* Top Metadata */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '999px', background: `${source.badgeColor}15`, color: source.badgeColor }}>
                        {item.sourceName}
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', background: urgency.bg, color: urgency.color, border: `1px solid ${urgency.border}` }}>
                        {urgency.label}
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#71717a' }}>
                        {item.category}
                      </span>
                      {item.isBreaking && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 900, background: '#FEF3C7', color: '#B45309', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                          ⚡ BREAKING DIRECTIVE
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600 }}>
                      {new Date(item.publishedDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>

                  {/* Title & Summary */}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#09090b', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#374151', lineHeight: 1.55 }}>
                      {item.summary}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F4F4F5', paddingTop: '0.85rem', flexWrap: 'wrap', gap: '8px' }}>
                    
                    {/* Official Portal Source Link (Direct Page) */}
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleMarkRead(item.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: source.badgeColor || '#2563eb',
                        textDecoration: 'none'
                      }}
                    >
                      <i className="fas fa-arrow-up-right-from-square"></i>
                      <span>Read Original Notice on {source.shortName || 'Official Website'}</span>
                    </a>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      
                      {/* Convert to Blog Button */}
                      <button
                        onClick={() => handleOpenConvertToBlogModal(item)}
                        style={{
                          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '0.45rem 0.95rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 10px rgba(37, 99, 235, 0.25)'
                        }}
                        title="Generate a simple blog post on Labour Edu Blog and Manuals"
                      >
                        <i className="fas fa-pen-nib"></i>
                        <span>+ Convert to Blog</span>
                      </button>

                      {/* Quick Broadcast Button */}
                      <button
                        onClick={() => handleConvertToBroadcast(item)}
                        style={{
                          background: '#18181b',
                          color: '#FFFFFF',
                          border: '1px solid #27272a',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        title="Broadcast notice with direct official link"
                      >
                        <i className="fas fa-bullhorn" style={{ color: '#F59E0B' }}></i>
                        <span>Quick Broadcast</span>
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CONVERT TO BLOG POST MODAL */}
      {blogModalItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.85rem',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.2rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E4E4E7', paddingBottom: '1rem' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-newspaper" style={{ color: '#2563eb' }}></i>
                  Create Blog Post from GES Directive
                </div>
                <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '2px' }}>
                  This will generate a clean blog post in <strong>Blog &amp; Manuals</strong> with the official deep-link verification box.
                </div>
              </div>
              <button
                onClick={() => setBlogModalItem(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#71717a' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePublishBlogPost} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: '#09090b', marginBottom: '0.35rem' }}>
                  Blog Post Title *
                </label>
                <input
                  type="text"
                  value={blogModalItem.title}
                  onChange={(e) => setBlogModalItem({ ...blogModalItem, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.88rem', fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: '#09090b', marginBottom: '0.35rem' }}>
                    Category
                  </label>
                  <input
                    type="text"
                    value={blogModalItem.category}
                    onChange={(e) => setBlogModalItem({ ...blogModalItem, category: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.84rem', fontWeight: 600 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: '#09090b', marginBottom: '0.35rem' }}>
                    Target Audience / Role
                  </label>
                  <input
                    type="text"
                    value={blogModalItem.targetRole}
                    onChange={(e) => setBlogModalItem({ ...blogModalItem, targetRole: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.84rem', fontWeight: 600 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.82rem', color: '#09090b', marginBottom: '0.35rem' }}>
                  Executive Summary (2-Minute Overview)
                </label>
                <textarea
                  value={blogModalItem.summary}
                  onChange={(e) => setBlogModalItem({ ...blogModalItem, summary: e.target.value })}
                  rows={2}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.85rem', lineHeight: 1.4, fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontWeight: 800, fontSize: '0.82rem', color: '#09090b' }}>
                    Full Blog Article Content (Markdown)
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const imgUrl = prompt('Enter Image URL (or Unsplash link):', 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800');
                        if (imgUrl) {
                          const caption = prompt('Enter Caption (e.g. Official Directive Seal):', 'Ghana Education Service Policy Guide');
                          setBlogModalItem(prev => ({
                            ...prev,
                            content: `${prev.content}\n\n![${caption || 'Article illustration'} | center | 80%](${imgUrl})\n`
                          }));
                        }
                      }}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        color: '#1D4ED8',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <i className="fas fa-image"></i>
                      <span>+ Insert Image</span>
                    </button>
                  </div>
                </div>
                <textarea
                  value={blogModalItem.content}
                  onChange={(e) => setBlogModalItem({ ...blogModalItem, content: e.target.value })}
                  rows={7}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.84rem', lineHeight: 1.45, fontFamily: 'monospace' }}
                />
              </div>

              {/* Direct Official Link Citation Box */}
              <div style={{ background: '#F8FAFC', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '3px' }}>
                  Direct Official Deep-Link Citation:
                </div>
                <div style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 700, wordBreak: 'break-all' }}>
                  {blogModalItem.sourceUrl}
                </div>
              </div>

              {/* Optional Broadcast Checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: 700, color: '#09090b', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={blogModalItem.dispatchAsBroadcast}
                  onChange={(e) => setBlogModalItem({ ...blogModalItem, dispatchAsBroadcast: e.target.checked })}
                />
                <span>Also dispatch top notification banner across school portals with "Read Blog Guide" link</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setBlogModalItem(null)}
                  style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', background: '#F4F4F5', border: '1px solid #E4E4E7', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishingBlog}
                  style={{
                    padding: '0.65rem 1.5rem',
                    borderRadius: '8px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 900,
                    cursor: publishingBlog ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  <i className="fas fa-check"></i>
                  <span>{publishingBlog ? 'Publishing...' : 'Publish to Blog & Manuals'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK DIRECT BROADCAST MODAL */}
      {broadcastModalItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '600px',
            padding: '1.75rem',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.2rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-bullhorn" style={{ color: '#2563eb' }}></i>
                Quick Direct Broadcast
              </div>
              <button
                onClick={() => setBroadcastModalItem(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#71717a' }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 800, fontSize: '0.8rem', color: '#09090b', marginBottom: '0.3rem' }}>
                Broadcast Title
              </label>
              <input
                type="text"
                value={broadcastModalItem.title}
                onChange={(e) => setBroadcastModalItem({ ...broadcastModalItem, title: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.88rem', fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 800, fontSize: '0.8rem', color: '#09090b', marginBottom: '0.3rem' }}>
                Target Portals
              </label>
              <select
                value={broadcastModalItem.targetAudience}
                onChange={(e) => setBroadcastModalItem({ ...broadcastModalItem, targetAudience: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.85rem', fontWeight: 700 }}
              >
                <option value="all">🌐 All Schools &amp; Portals</option>
                <option value="headteacher">🏫 Headteachers Only</option>
                <option value="teacher">👨‍🏫 Teachers Only</option>
                <option value="parent">👨‍👩‍👧 Parents Only</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.8rem', color: '#09090b', marginBottom: '0.3rem' }}>
                  Button Action Text
                </label>
                <input
                  type="text"
                  value={broadcastModalItem.actionLabel}
                  onChange={(e) => setBroadcastModalItem({ ...broadcastModalItem, actionLabel: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.84rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.8rem', color: '#09090b', marginBottom: '0.3rem' }}>
                  Destination Link (URL)
                </label>
                <input
                  type="text"
                  value={broadcastModalItem.actionUrl}
                  onChange={(e) => setBroadcastModalItem({ ...broadcastModalItem, actionUrl: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.84rem', fontWeight: 700 }}
                />
              </div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.76rem', color: '#475569' }}>
              <i className="fas fa-circle-info" style={{ color: '#2563eb', marginRight: '5px' }}></i>
              When readers click <strong>"{broadcastModalItem.actionLabel || 'Read'}"</strong> in their dashboard, they will be taken to read the full guide on your website at <code>{broadcastModalItem.actionUrl}</code>.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
              <button
                onClick={() => setBroadcastModalItem(null)}
                style={{ padding: '0.65rem 1.2rem', borderRadius: '8px', background: '#F4F4F5', border: '1px solid #E4E4E7', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDispatchPreparedBroadcast}
                style={{ padding: '0.65rem 1.4rem', borderRadius: '8px', background: '#2563eb', border: 'none', color: '#FFFFFF', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="fas fa-paper-plane"></i>
                <span>Dispatch Broadcast Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default GesNewsWatcher;
