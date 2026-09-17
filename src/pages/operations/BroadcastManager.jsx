import React, { useState, useEffect } from 'react';
import broadcastService from '../../services/broadcastService';
import blogService from '../../services/blogService';
import schoolNotificationService from '../../services/schoolNotificationService';

const PRESET_TEMPLATES = [
  {
    name: '🎒 Welcome Back From Vacation',
    title: '🎉 Welcome Back to a Productive New Term!',
    targetAudience: 'all',
    severity: 'success',
    bannerEnabled: true,
    modalEnabled: true,
    blogUrl: '',
    blogTitle: '',
    content: 'Dear School Leaders, Teachers, and Parents, welcome back from the vacation! We hope you had a refreshing break. Labour Edu is fully prepared to support your school with seamless terminal reporting and academic operations this term.',
    actionUrl: '/',
    actionLabel: 'Open Dashboard'
  },
  {
    name: '🇬🇭 GES Curriculum & Assessment Directive',
    title: '🇬🇭 Official GES Continuous Assessment & Terminal Grading Window',
    targetAudience: 'all',
    severity: 'warning',
    bannerEnabled: true,
    modalEnabled: false,
    blogUrl: '/blog/ges-continuous-assessment-policy-guide',
    blogTitle: 'GES Continuous Assessment Policy Guide',
    content: 'All Basic Schools are instructed to complete class assessment entries (30%) and end-of-term examinations (70%) in alignment with the standard Ministry of Education / GES guidelines.',
    actionUrl: '/scores',
    actionLabel: 'Check Scores Status'
  },
  {
    name: '⚡ Scheduled Platform Upgrade Window',
    title: '⚡ Scheduled Maintenance & BroadSheet Cloud Sync Optimization',
    targetAudience: 'headteacher',
    severity: 'info',
    bannerEnabled: true,
    modalEnabled: false,
    blogUrl: '/manuals',
    blogTitle: 'System Updates & Maintenance Guide',
    content: 'The platform cloud database will undergo routine sync optimization this Sunday from 10:00 PM to 11:30 PM GMT. Offline marks entry will remain fully operational on local devices.',
    actionUrl: '/',
    actionLabel: 'View Dashboard'
  },
  {
    name: '📅 Teacher Score Entry Deadline Notice',
    title: '⏰ Urgent: Continuous Assessment & Exam Marks Submission Deadline',
    targetAudience: 'teacher',
    severity: 'urgent',
    bannerEnabled: true,
    modalEnabled: true,
    blogUrl: '/guides',
    blogTitle: 'Teacher Marks Entry & Submission Guide',
    content: 'Teaching staff are reminded that broadsheet marks entry closes this Friday at 5:00 PM. Please ensure all student assessment marks are entered and synchronized.',
    actionUrl: '/scores',
    actionLabel: 'Enter Marks Now'
  },
  {
    name: '🎉 Terminal Report Cards Release Announcement',
    title: '🎓 Term Report Cards Now Officially Available on Parent Portal',
    targetAudience: 'parent',
    severity: 'success',
    bannerEnabled: true,
    modalEnabled: true,
    blogUrl: '/blog/accessing-terminal-reports-parent-guide',
    blogTitle: 'Accessing Terminal Reports Parent Guide',
    content: 'Official terminal report cards, conduct remarks, and attendance summaries have been published and signed by the Headteacher. Parents can view and download report summaries.',
    actionUrl: '/parent/dashboard',
    actionLabel: 'View Child Report'
  }
];

const BroadcastManager = () => {
  const [broadcasts, setBroadcasts] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'compose'
  const [successMessage, setSuccessMessage] = useState('');

  // Composer Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [severity, setSeverity] = useState('info');
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [modalEnabled, setModalEnabled] = useState(false);
  const [blogUrl, setBlogUrl] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [actionLabel, setActionLabel] = useState('View Details');
  const [submitting, setSubmitting] = useState(false);

  const loadBroadcasts = async () => {
    setLoading(true);
    const data = await broadcastService.getAllBroadcasts();
    setBroadcasts(data);
    setLoading(false);
  };

  const loadBlogPosts = async () => {
    try {
      const posts = await blogService.getAllPosts();
      setBlogPosts(posts || []);
    } catch (e) {
      console.warn('Could not load blog posts for selector:', e);
    }
  };

  useEffect(() => {
    loadBroadcasts();
    loadBlogPosts();
  }, []);

  const handleApplyTemplate = (tpl) => {
    setTitle(tpl.title);
    setContent(tpl.content);
    setTargetAudience(tpl.targetAudience);
    setSeverity(tpl.severity);
    setBannerEnabled(tpl.bannerEnabled);
    setModalEnabled(tpl.modalEnabled);
    setBlogUrl(tpl.blogUrl || '');
    setActionUrl(tpl.actionUrl || '');
    setActionLabel(tpl.actionLabel || 'View Details');
  };

  const handleSelectBlogPost = (postSlug) => {
    if (!postSlug) return;
    const post = blogPosts.find(p => p.slug === postSlug || String(p.id) === postSlug);
    if (post) {
      const targetSlug = post.slug || `manual-${post.id}`;
      setBlogUrl(`/blog/${targetSlug}`);
      if (!title) setTitle(post.title);
      if (!content && post.summary) setContent(post.summary);
    }
  };

  const handleCreateBroadcast = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    try {
      const newBroadcast = await broadcastService.createBroadcast({
        title,
        content,
        targetAudience,
        severity,
        bannerEnabled,
        modalEnabled,
        blogUrl: blogUrl.trim() || null,
        actionUrl: actionUrl.trim() || null,
        actionLabel: actionLabel.trim() || 'View Details'
      });

      // Also trigger instant notification into notification bell
      try {
        schoolNotificationService.addNotification({
          id: `broadcast_${newBroadcast.id}`,
          title: `📢 ${newBroadcast.title}`,
          message: newBroadcast.content,
          category: 'broadcast',
          timestamp: newBroadcast.createdAt,
          actionUrl: newBroadcast.actionUrl,
          actionLabel: newBroadcast.actionLabel,
          severity: newBroadcast.severity
        }, true, true);
      } catch (notifErr) {}

      setSuccessMessage('Broadcast announcement successfully dispatched across target portals!');
      setTitle('');
      setContent('');
      setBlogUrl('');
      setActionUrl('');
      loadBroadcasts();
      setActiveTab('list');

      setTimeout(() => {
        setSuccessMessage('');
      }, 5000);
    } catch (err) {
      console.error('Error creating broadcast:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    await broadcastService.toggleBroadcastStatus(id, !currentStatus);
    loadBroadcasts();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this broadcast announcement?')) {
      await broadcastService.deleteBroadcast(id);
      loadBroadcasts();
    }
  };

  const getSeverityStyle = (s) => {
    switch (s) {
      case 'urgent': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '#EF4444', label: 'Urgent' };
      case 'warning': return { bg: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '#F59E0B', label: 'Warning / Caution' };
      case 'success': return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '#10B981', label: 'Success / Milestone' };
      case 'info': default: return { bg: 'rgba(37, 99, 235, 0.15)', color: '#3B82F6', border: '#3B82F6', label: 'Information' };
    }
  };

  const getAudienceLabel = (aud) => {
    switch (aud) {
      case 'headteacher': return '🏫 Headteachers Only';
      case 'teacher': return '👨‍🏫 Teachers Only';
      case 'parent': return '👨‍👩‍👧 Parents Portal';
      case 'all': default: return '🌐 All Portals & Schools';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', color: '#18181b' }}>
      
      {/* Header Banner */}
      <div style={{
        padding: '2rem 2.25rem',
        borderRadius: '20px',
        background: '#09090b',
        border: '1px solid #27272a',
        boxShadow: '0 8px 30px rgba(9, 9, 11, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.25rem',
        color: '#FFFFFF'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.4)', padding: '0.25rem 0.75rem', borderRadius: '999px', color: '#60a5fa', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
            <i className="fas fa-bullhorn"></i> Nationwide Circulars &amp; Alerts
          </div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 900, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            Platform Broadcast Dispatcher
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#A1A1AA', fontSize: '0.9rem', maxWidth: '650px', lineHeight: 1.5 }}>
            Publish urgent directives, GES announcements, and term notices instantly to Headteachers, Teachers, and Parents across all registered schools.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setActiveTab('list')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '10px',
              border: activeTab === 'list' ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.15)',
              background: activeTab === 'list' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fas fa-list-ul"></i> Active Broadcasts ({broadcasts.length})
          </button>

          <button
            onClick={() => setActiveTab('compose')}
            style={{
              padding: '0.6rem 1.3rem',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'compose' ? '#10B981' : '#2563eb',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
            }}
          >
            <i className="fas fa-plus"></i> + Compose Dispatch
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div style={{
          background: '#ECFDF5',
          border: '1px solid #A7F3D0',
          color: '#065F46',
          padding: '1rem 1.25rem',
          borderRadius: '14px',
          fontWeight: 700,
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <i className="fas fa-check-circle" style={{ fontSize: '1.1rem', color: '#10B981' }}></i>
          <span>{successMessage}</span>
        </div>
      )}

      {/* TAB 1: LIST ACTIVE BROADCASTS */}
      {activeTab === 'list' && (
        <div style={{ background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E4E4E7', padding: '1.6rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', color: '#09090b', fontWeight: 800 }}>
              Broadcast Announcements Ledger
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#71717a', fontWeight: 600 }}>
              Showing {broadcasts.length} system announcements
            </span>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a' }}>Loading broadcasts...</div>
          ) : broadcasts.length === 0 ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: '#71717a' }}>
              <i className="fas fa-bullhorn" style={{ fontSize: '2.5rem', color: '#D4D4D8', marginBottom: '0.75rem', display: 'block' }}></i>
              <div style={{ fontWeight: 800, color: '#09090b' }}>No Broadcasts Dispatched Yet</div>
              <p style={{ fontSize: '0.85rem', margin: '0.4rem 0 1rem 0' }}>Click "Compose Dispatch" to publish your first school-wide circular or GES directive.</p>
              <button
                onClick={() => setActiveTab('compose')}
                style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                + Compose First Broadcast
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {broadcasts.map((b) => {
                const sev = getSeverityStyle(b.severity);
                return (
                  <div
                    key={b.id}
                    style={{
                      background: '#FAFAFA',
                      border: `1.5px solid ${b.isActive ? '#E4E4E7' : '#F4F4F5'}`,
                      borderLeft: `5px solid ${b.isActive ? sev.border : '#A1A1AA'}`,
                      borderRadius: '14px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      opacity: b.isActive ? 1 : 0.65
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', background: sev.bg, color: sev.color }}>
                          {sev.label}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', background: '#E2E8F0', color: '#334155' }}>
                          {getAudienceLabel(b.targetAudience)}
                        </span>
                        {b.bannerEnabled && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2563eb' }}>
                            <i className="fas fa-flag"></i> Top Banner
                          </span>
                        )}
                        {b.modalEnabled && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed' }}>
                            <i className="fas fa-window-maximize"></i> Login Modal
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleToggleActive(b.id, b.isActive)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '7px',
                            background: b.isActive ? '#DCFCE7' : '#F4F4F5',
                            border: `1px solid ${b.isActive ? '#86EFAC' : '#E4E4E7'}`,
                            color: b.isActive ? '#15803D' : '#71717a',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          {b.isActive ? 'Active (Live)' : 'Paused (Hidden)'}
                        </button>

                        <button
                          onClick={() => handleDelete(b.id)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '7px',
                            background: '#FEE2E2',
                            border: '1px solid #FECACA',
                            color: '#DC2626',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                          title="Delete announcement"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#09090b' }}>
                      {b.title}
                    </div>

                    <div style={{ fontSize: '0.86rem', color: '#4B5563', lineHeight: 1.5 }}>
                      {b.content}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '0.74rem', color: '#71717a', borderTop: '1px solid #E4E4E7', paddingTop: '0.6rem' }}>
                      <div>Dispatched by: <strong>{b.author || 'Platform Super Admin'}</strong> · {new Date(b.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {b.blogUrl && (
                          <span style={{ color: '#2563eb', fontWeight: 800, background: '#EFF6FF', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                            <i className="fas fa-book-open"></i> Read More Link: {b.blogUrl}
                          </span>
                        )}
                        {b.actionUrl && (
                          <span style={{ color: '#059669', fontWeight: 700 }}>
                            Action Link: {b.actionLabel} ({b.actionUrl})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPOSE NEW BROADCAST */}
      {activeTab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
          
          {/* Left Column: Form & Presets */}
          <div style={{ background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E4E4E7', padding: '1.75rem', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)' }}>
            
            {/* Template Presets */}
            <div style={{ marginBottom: '1.5rem', background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#334155', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-wand-magic-sparkles" style={{ color: '#2563eb' }}></i>
                Quick Template Presets (1-Click Fill)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {PRESET_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '8px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: '#0F172A',
                      cursor: 'pointer'
                    }}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.84rem', color: '#09090b', marginBottom: '0.4rem' }}>
                  Broadcast Announcement Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., 🇬🇭 GES Academic Term 3 Score Entry Directive"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.9rem',
                    borderRadius: '10px',
                    border: '1.5px solid #D4D4D8',
                    fontSize: '0.88rem',
                    fontWeight: 600
                  }}
                />
              </div>

              {/* Target Audience & Severity in 2 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.84rem', color: '#09090b', marginBottom: '0.4rem' }}>
                    Target Audience
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '10px',
                      border: '1.5px solid #D4D4D8',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="all">🌐 All Schools &amp; Portals</option>
                    <option value="headteacher">🏫 Headteachers Only</option>
                    <option value="teacher">👨‍🏫 Teachers Only</option>
                    <option value="parent">👨‍👩‍👧 Parents Only</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: '0.84rem', color: '#09090b', marginBottom: '0.4rem' }}>
                    Urgency &amp; Color Style
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '10px',
                      border: '1.5px solid #D4D4D8',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="info">🔵 Information (Blue)</option>
                    <option value="warning">🟠 GES / Important Notice (Amber)</option>
                    <option value="urgent">🔴 Urgent Action Required (Red)</option>
                    <option value="success">🟢 Milestone / Celebration (Green)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.84rem', color: '#09090b', marginBottom: '0.4rem' }}>
                  Announcement Message Body *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter the official circular message, guidelines, or instructions here..."
                  rows={5}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.9rem',
                    borderRadius: '10px',
                    border: '1.5px solid #D4D4D8',
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Blog Article Link (Read More Destination) */}
              <div style={{ background: '#F0F9FF', border: '1.5px solid #BAE6FD', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <label style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0369A1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fas fa-book-open" style={{ color: '#0284C7' }}></i>
                    <span>Blog Guide Link (Attached to "Read More" Button)</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#0284C7', fontWeight: 600 }}>
                    When clicked, users go straight to this blog guide
                  </span>
                </div>

                {blogPosts.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#0369A1', marginBottom: '0.25rem' }}>
                      ⚡ Quick Attach from Published Blog Articles &amp; Manuals:
                    </label>
                    <select
                      onChange={(e) => handleSelectBlogPost(e.target.value)}
                      defaultValue=""
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #7DD3FC',
                        background: '#FFFFFF',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: '#0F172A'
                      }}
                    >
                      <option value="">-- Choose a published blog post to link --</option>
                      {blogPosts.map((post) => (
                        <option key={post.id || post.slug} value={post.slug || post.id}>
                          📖 {post.title} ({post.category || 'Guide'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#0369A1', marginBottom: '0.25rem' }}>
                    Or Custom Blog URL / Slug:
                  </label>
                  <input
                    type="text"
                    value={blogUrl}
                    onChange={(e) => setBlogUrl(e.target.value)}
                    placeholder="e.g., /blog/ges-continuous-assessment-policy-guide or https://..."
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #7DD3FC',
                      background: '#FFFFFF',
                      fontSize: '0.84rem',
                      fontWeight: 600
                    }}
                  />
                </div>
              </div>

              {/* Action Button Link (Optional) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: '#09090b', marginBottom: '0.3rem' }}>
                    Secondary Module Route (Optional)
                  </label>
                  <input
                    type="text"
                    value={actionUrl}
                    onChange={(e) => setActionUrl(e.target.value)}
                    placeholder="e.g., /scores, /reports, /financials"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.84rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: '#09090b', marginBottom: '0.3rem' }}>
                    Secondary Button Label
                  </label>
                  <input
                    type="text"
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    placeholder="View Details"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #D4D4D8', fontSize: '0.84rem' }}
                  />
                </div>
              </div>

              {/* Delivery Display Checkboxes */}
              <div style={{ display: 'flex', gap: '1.5rem', background: '#FAFAFA', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700, color: '#09090b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bannerEnabled}
                    onChange={(e) => setBannerEnabled(e.target.checked)}
                  />
                  <span>Show Top Pinned Banner</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700, color: '#09090b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={modalEnabled}
                    onChange={(e) => setModalEnabled(e.target.checked)}
                  />
                  <span>Pop-up Modal on Login</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || !title.trim() || !content.trim()}
                style={{
                  padding: '0.85rem',
                  borderRadius: '10px',
                  background: '#2563eb',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(37, 99, 235, 0.35)',
                  marginTop: '0.5rem'
                }}
              >
                <i className="fas fa-paper-plane"></i>
                {submitting ? 'Dispatching...' : 'Dispatch Broadcast to Schools Now'}
              </button>
            </form>
          </div>

          {/* Right Column: Live Recipient Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: '#09090b', borderRadius: '18px', border: '1px solid #27272a', padding: '1.5rem', color: '#FFFFFF' }}>
              <div style={{ fontSize: '0.75rem', color: '#60A5FA', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                <i className="fas fa-eye"></i> Live Recipient Preview
              </div>
              <div style={{ fontSize: '0.84rem', color: '#A1A1AA', marginBottom: '1.25rem' }}>
                This is how the broadcast announcement banner will render at the top of <strong>{getAudienceLabel(targetAudience)}</strong> dashboards:
              </div>

              {/* Preview Banner Box - iPhone iOS Translucent Glass Push Notification Style */}
              {(() => {
                const getPreviewTheme = (sev) => {
                  switch (sev) {
                    case 'urgent': return { accent: '#FF3B30', accentGradient: 'linear-gradient(135deg, #FF3B30 0%, #FF6259 100%)', iconGlow: 'rgba(255, 59, 48, 0.4)', tagBg: 'rgba(255, 59, 48, 0.12)', tagText: '#FF3B30', border: 'rgba(255, 59, 48, 0.25)', icon: 'fa-circle-exclamation', tag: 'Urgent Alert' };
                    case 'warning': return { accent: '#FF9500', accentGradient: 'linear-gradient(135deg, #FF9500 0%, #FFB340 100%)', iconGlow: 'rgba(255, 149, 0, 0.4)', tagBg: 'rgba(255, 149, 0, 0.14)', tagText: '#D97706', border: 'rgba(255, 149, 0, 0.25)', icon: 'fa-triangle-exclamation', tag: 'Official Notice' };
                    case 'success': return { accent: '#34C759', accentGradient: 'linear-gradient(135deg, #34C759 0%, #30D158 100%)', iconGlow: 'rgba(52, 199, 89, 0.4)', tagBg: 'rgba(52, 199, 89, 0.14)', tagText: '#15803D', border: 'rgba(52, 199, 89, 0.25)', icon: 'fa-circle-check', tag: 'System Update' };
                    case 'info':
                    default: return { accent: '#007AFF', accentGradient: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)', iconGlow: 'rgba(0, 122, 255, 0.4)', tagBg: 'rgba(0, 122, 255, 0.12)', tagText: '#007AFF', border: 'rgba(0, 122, 255, 0.22)', icon: 'fa-bolt-lightning', tag: 'Developer Broadcast' };
                  }
                };
                const theme = getPreviewTheme(severity);
                return (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.82)',
                    border: `1px solid rgba(255, 255, 255, 0.85)`,
                    borderRadius: '22px',
                    padding: '0.9rem 1.15rem 0.95rem 1.15rem',
                    color: '#0F172A',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backdropFilter: 'blur(32px) saturate(210%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(210%)',
                    boxShadow: '0 16px 36px -8px rgba(0, 0, 0, 0.35), inset 0 1px 1.5px rgba(255, 255, 255, 0.95)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Header Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '7px',
                          background: theme.accentGradient,
                          boxShadow: `0 3px 8px ${theme.iconGlow}`,
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.72rem'
                        }}>
                          <i className={`fas ${theme.icon}`}></i>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
                            LABOUR EDU
                          </span>
                          <span style={{
                            fontSize: '0.64rem',
                            fontWeight: 800,
                            color: theme.tagText,
                            background: theme.tagBg,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '5px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}>
                            {theme.tag}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>• Just now</span>
                      </div>

                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.65rem',
                        color: '#64748B'
                      }}>
                        ✕
                      </div>
                    </div>

                    {/* Title & Preview Content (Strictly what was typed) */}
                    <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#09090B', lineHeight: 1.35, marginTop: '2px' }}>
                      {title || 'Announcement Title'}
                    </div>

                    <div style={{
                      fontSize: '0.83rem',
                      color: '#334155',
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {content || 'Your announcement message content will appear here...'}
                    </div>

                    {/* Footer Tap Hint */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fas fa-fingerprint" style={{ color: theme.accent, fontSize: '0.7rem' }}></i>
                        Tap to view full message
                      </span>
                      <i className="fas fa-chevron-right" style={{ fontSize: '0.65rem', color: theme.accent }}></i>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* Helpful Developer Guide Card */}
            <div style={{ background: '#18181b', borderRadius: '18px', border: '1px solid #27272a', padding: '1.25rem', color: '#FFFFFF' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-info-circle" style={{ color: '#38BDF8' }}></i>
                Broadcast Delivery Highlights
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#D4D4D8', lineHeight: 1.6 }}>
                <li><strong>Floating 7s Notification:</strong> Appears gracefully over Headteacher &amp; Teacher portals and disappears after 7s without shifting the layout.</li>
                <li><strong>Bell Archival:</strong> Permanently recorded into their top-right Notification Bell for later reading.</li>
                <li><strong>Multi-Targeting:</strong> Send to All Users, Headteachers Only, Teachers Only, or Parents.</li>
              </ul>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

export default BroadcastManager;
