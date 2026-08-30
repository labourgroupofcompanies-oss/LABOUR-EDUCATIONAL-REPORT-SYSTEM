import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import blogService from '../../services/blogService';
import { useAuth } from '../../store/AuthContext';
import LogoPreloader from '../../components/common/LogoPreloader';

const SECTION_CONFIG = [
  {
    id: 'Administration',
    label: 'Headteacher & Admin Guides',
    icon: 'fa-user-tie',
    color: '#2563eb',
    bg: '#EFF6FF',
    description: 'School setup, digital signatures, term configuration, grading scales, and report approvals.'
  },
  {
    id: 'Academics',
    label: 'Teacher Portal & Marks Entry',
    icon: 'fa-chalkboard-user',
    color: '#10B981',
    bg: '#ECFDF5',
    description: 'Continuous assessment scoring, exam entries, offline recording, attendance, and remarks.'
  },
  {
    id: 'Billing & Subscriptions',
    label: 'Wallet & Term Subscriptions',
    icon: 'fa-wallet',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    description: 'Free onboarding term policy, 16-week window, Mobile Money top-ups, and bill payments.'
  },
  {
    id: 'User Guides',
    label: 'Step-by-Step Manuals',
    icon: 'fa-book-open',
    color: '#F59E0B',
    bg: '#FFFBEB',
    description: 'Complete end-to-end action checklists and operational instructions for all user roles.'
  },
  {
    id: 'Platform Updates',
    label: 'Platform Releases & Notices',
    icon: 'fa-bullhorn',
    color: '#EC4899',
    bg: '#FDF2F8',
    description: 'Latest feature releases, enhancements, and system security announcements.'
  },
  {
    id: 'Training & Tutorials',
    label: 'Training & Tutorials',
    icon: 'fa-graduation-cap',
    color: '#0891B2',
    bg: '#ECFEFF',
    description: 'Video tutorials, training sessions, and learning resources for all platform users.'
  },
  {
    id: 'Security & Compliance',
    label: 'Security & Compliance',
    icon: 'fa-shield-halved',
    color: '#DC2626',
    bg: '#FEF2F2',
    description: 'Data security policies, compliance guidelines, and account protection best practices.'
  }
];

const KnowledgeBase = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState('ALL');
  const [selectedPost, setSelectedPost] = useState(null);
  const [mobileReadingMode, setMobileReadingMode] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Monitor network status for offline badge
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch published posts with offline guarantee
  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true);
      try {
        const data = await blogService.getAllPosts();
        const published = (data || []).filter(p => p.is_published !== false);
        setPosts(published);
        if (published.length > 0 && !selectedPost) {
          setSelectedPost(published[0]);
        }
      } catch (err) {
        console.error('[KnowledgeBase] Load error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, []);

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesSearch = 
        !searchQuery ||
        post.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.target_role?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = 
        activeCategoryTab === 'ALL' || 
        post.category?.toLowerCase() === activeCategoryTab.toLowerCase();

      return matchesSearch && matchesCat;
    });
  }, [posts, searchQuery, activeCategoryTab]);

  // Group posts by section
  const groupedSections = useMemo(() => {
    const map = {};
    filteredPosts.forEach(post => {
      const cat = post.category || 'General Guides';
      if (!map[cat]) map[cat] = [];
      map[cat].push(post);
    });
    return map;
  }, [filteredPosts]);

  const handleSelectPost = (post) => {
    setSelectedPost(post);
    setMobileReadingMode(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to format inline text cleanly without raw markdown symbols (*, **, #, etc.)
  const formatInlineText = (text) => {
    if (!text) return '';
    const clean = text
      .replace(/^#{1,6}\s*/, '')
      .replace(/^>\s*/, '');

    const parts = [];
    const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(clean)) !== null) {
      if (match.index > lastIndex) {
        parts.push(clean.substring(lastIndex, match.index).replace(/[*#]/g, ''));
      }
      if (match[2] !== undefined) {
        parts.push(
          <strong key={key++} style={{ fontWeight: 700, color: 'inherit' }}>
            {match[2].replace(/[*#_]/g, '')}
          </strong>
        );
      } else if (match[4] !== undefined) {
        parts.push(
          <span key={key++} style={{ fontStyle: 'italic' }}>
            {match[4].replace(/[*#_]/g, '')}
          </span>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < clean.length) {
      parts.push(clean.substring(lastIndex).replace(/[*#]/g, ''));
    }

    return parts.length > 0 ? parts : clean.replace(/[*#]/g, '');
  };

  // Helper to render formatted article and manual content
  const renderMarkdown = (text) => {
    if (!text) return <p style={{ color: '#71717a' }}>Select an article to view instructions...</p>;

    const lines = text.split('\n');
    return (
      <div className="kb-article-content">
        {lines.map((rawLine, idx) => {
          const line = rawLine.trim();

          // Headings with # or ## or ###
          if (/^#{1,2}\s+/.test(line)) {
            const headingText = line.replace(/^#{1,2}\s+/, '');
            return (
              <h2 key={idx} className="kb-h2">
                {formatInlineText(headingText)}
              </h2>
            );
          }
          if (/^#{3,6}\s+/.test(line)) {
            const headingText = line.replace(/^#{3,6}\s+/, '');
            return (
              <h3 key={idx} className="kb-h3">
                {formatInlineText(headingText)}
              </h3>
            );
          }

          // Horizontal divider
          if (line === '---' || line === '***' || line === '___') {
            return <hr key={idx} className="kb-divider" />;
          }

          // Numbered steps: e.g. "1. Open...", "Step 1: Open...", "Step 1. Open..."
          if (/^(?:Step\s+)?\d+[\.:\)]\s+/i.test(line)) {
            const match = line.match(/^(?:Step\s+)?(\d+)[\.:\)]\s*(.*)/i);
            const num = match ? match[1] : '1';
            const content = match ? match[2] : line;
            return (
              <div key={idx} className="kb-step-item">
                <span className="kb-step-badge">
                  {num}
                </span>
                <span className="kb-step-text">{formatInlineText(content)}</span>
              </div>
            );
          }

          // Bullet items: "- ", "* ", "• "
          if (/^(\*|-|•)\s+/.test(line)) {
            const content = line.replace(/^(\*|-|•)\s+/, '');
            return (
              <div key={idx} className="kb-bullet-item">
                <span className="kb-bullet-dot">●</span>
                <span className="kb-bullet-text">{formatInlineText(content)}</span>
              </div>
            );
          }

          // Callout boxes: "> ...", "Note: ...", "Tip: ...", "Important: ..."
          if (/^>\s+/.test(line) || /^(Note|Tip|Important|Warning):\s*/i.test(line)) {
            const content = line.replace(/^>\s*/, '');
            return (
              <div key={idx} className="kb-callout-box">
                <i className="fas fa-circle-info" style={{ color: '#2563eb', marginTop: '2px', flexShrink: 0 }}></i>
                <div>{formatInlineText(content)}</div>
              </div>
            );
          }

          // Empty line spacing
          if (!line) {
            return <div key={idx} style={{ height: '0.65rem' }} />;
          }

          // Standard paragraph
          return <p key={idx} className="kb-paragraph">{formatInlineText(line)}</p>;
        })}
      </div>
    );
  };

  // Dedicated Support & Help Desk Box component
  const HelpDeskSupportBox = ({ compact = false, highlight = false }) => (
    <div style={{
      background: highlight 
        ? 'linear-gradient(135deg, #09090b 0%, #1e1b4b 50%, #1e3a8a 100%)' 
        : '#F8FAFC',
      border: highlight ? '1px solid rgba(255,255,255,0.15)' : '1.5px solid #E2E8F0',
      borderRadius: '16px',
      padding: compact ? '1.25rem' : '1.75rem',
      color: highlight ? '#FFFFFF' : '#0f172a',
      boxShadow: highlight ? '0 10px 25px -5px rgba(30, 58, 138, 0.25)' : '0 2px 6px rgba(0,0,0,0.02)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: highlight ? 'rgba(255,255,255,0.15)' : '#EFF6FF',
          color: highlight ? '#93C5FD' : '#2563eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.1rem',
          flexShrink: 0
        }}>
          <i className="fas fa-headset"></i>
        </div>
        <div>
          <h3 style={{
            margin: '0 0 0.25rem 0',
            fontSize: compact ? '1rem' : '1.15rem',
            fontWeight: 800,
            color: highlight ? '#FFFFFF' : '#09090b',
            fontFamily: 'Outfit, sans-serif'
          }}>
            Can't find what you are looking for?
          </h3>
          <p style={{
            margin: 0,
            fontSize: '0.85rem',
            color: highlight ? '#CBD5E1' : '#64748b',
            lineHeight: 1.5
          }}>
            Visit our central website or connect with the Labour Edu technical support desk directly.
          </p>
        </div>
      </div>

      {/* Action Buttons Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.75rem'
      }}>
        {/* Website Link */}
        <a
          href="https://labouredu.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            background: highlight ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
            border: highlight ? '1px solid rgba(255,255,255,0.2)' : '1px solid #CBD5E1',
            color: highlight ? '#FFFFFF' : '#0f172a',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.86rem',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: highlight ? '#2563eb' : '#EFF6FF',
            color: highlight ? '#FFFFFF' : '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
            flexShrink: 0
          }}>
            <i className="fas fa-globe"></i>
          </div>
          <div>
            <div style={{ lineHeight: 1.2 }}>labouredu.com</div>
            <span style={{ fontSize: '0.72rem', color: highlight ? '#93C5FD' : '#64748b', fontWeight: 500 }}>
              Visit Official Website &rarr;
            </span>
          </div>
        </a>

        {/* WhatsApp Message */}
        <a
          href="https://wa.me/233541829724?text=Hello%20Labour%20Edu%20Support%2C%20I%20need%20assistance%20with%20the%20report%20system"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            background: '#25D366',
            border: 'none',
            color: '#FFFFFF',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.86rem',
            transition: 'all 0.15s ease',
            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.2)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            flexShrink: 0
          }}>
            <i className="fab fa-whatsapp"></i>
          </div>
          <div>
            <div style={{ lineHeight: 1.2 }}>WhatsApp: 0541829724</div>
            <span style={{ fontSize: '0.72rem', color: '#DCFCE7', fontWeight: 500 }}>
              Message / Voice Note &rarr;
            </span>
          </div>
        </a>

        {/* Direct Voice Call */}
        <a
          href="tel:0541829724"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            background: highlight ? '#2563eb' : '#09090b',
            border: 'none',
            color: '#FFFFFF',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.86rem',
            transition: 'all 0.15s ease',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.2)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
            flexShrink: 0
          }}>
            <i className="fas fa-phone-volume"></i>
          </div>
          <div>
            <div style={{ lineHeight: 1.2 }}>Call: 0541829724</div>
            <span style={{ fontSize: '0.72rem', color: '#BFDBFE', fontWeight: 500 }}>
              Direct Voice Call &rarr;
            </span>
          </div>
        </a>
      </div>
    </div>
  );

  return (
    <Layout title="Knowledge Base & User Manuals">
      <style>{`
        .kb-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        
        .kb-hero {
          background: linear-gradient(135deg, #09090b 0%, #1e1b4b 50%, #1e3a8a 100%);
          border-radius: 20px;
          padding: 2.25rem;
          color: #FFFFFF;
          box-shadow: 0 12px 30px -8px rgba(30, 58, 138, 0.25);
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          position: relative;
          overflow: hidden;
        }

        .kb-hero-title {
          font-family: 'Outfit', sans-serif;
          font-size: 2rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          letter-spacing: -0.02em;
          line-height: 1.25;
        }

        .kb-hero-desc {
          margin: 0;
          color: #CBD5E1;
          font-size: 0.95rem;
          max-width: 700px;
          line-height: 1.6;
        }

        .kb-search-bar {
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 14px;
          padding: 0.65rem 1rem;
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 650px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        .kb-main-layout {
          display: grid;
          grid-template-columns: minmax(320px, 380px) 1fr;
          gap: 1.75rem;
          align-items: start;
        }

        .kb-reader-card {
          background: #FFFFFF;
          border-radius: 20px;
          border: 1px solid #E2E8F0;
          padding: 2.25rem;
          box-shadow: 0 4px 15px rgba(0,0,0,0.03);
          position: sticky;
          top: 80px;
          max-height: calc(100vh - 100px);
          overflow-y: auto;
        }

        .kb-article-content {
          line-height: 1.8;
          color: #1e293b;
          font-size: 1rem;
        }

        .kb-h2 {
          font-size: 1.4rem;
          font-weight: 800;
          margin-top: 1.75rem;
          margin-bottom: 0.75rem;
          color: #09090b;
          font-family: 'Outfit', sans-serif;
          border-bottom: 2px solid #F1F5F9;
          padding-bottom: 0.4rem;
        }

        .kb-h3 {
          font-size: 1.18rem;
          font-weight: 800;
          margin-top: 1.35rem;
          margin-bottom: 0.5rem;
          color: #1e293b;
          font-family: 'Outfit', sans-serif;
        }

        .kb-h4 {
          font-size: 1.05rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.35rem;
          color: #334155;
        }

        .kb-paragraph {
          margin: 0 0 0.85rem 0;
          color: #334155;
          font-size: 0.96rem;
        }

        .kb-divider {
          border: none;
          border-top: 1px solid #E2E8F0;
          margin: 1.5rem 0;
        }

        .kb-step-item {
          padding-left: 0.5rem;
          margin-bottom: 0.75rem;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .kb-step-badge {
          min-width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #EFF6FF;
          color: #2563eb;
          font-size: 0.8rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
          border: 1px solid #BFDBFE;
        }

        .kb-step-text {
          font-size: 0.96rem;
          color: #18181b;
          line-height: 1.65;
          font-weight: 500;
        }

        .kb-bullet-item {
          padding-left: 0.5rem;
          margin-bottom: 0.55rem;
          display: flex;
          align-items: baseline;
          gap: 10px;
        }

        .kb-bullet-dot {
          color: #2563eb;
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        .kb-bullet-text {
          font-size: 0.95rem;
          color: #334155;
          line-height: 1.6;
        }

        .kb-callout-box {
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          border-left: 4px solid #2563eb;
          border-radius: 10px;
          padding: 0.85rem 1rem;
          margin: 1rem 0;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 0.92rem;
          color: #1e40af;
          line-height: 1.6;
        }

        .kb-mobile-back-btn {
          display: none;
        }

        /* ── MOBILE SCREEN RESPONSIVE STYLES ────────────────────────── */
        @media (max-width: 860px) {
          .kb-container {
            gap: 1rem;
          }

          .kb-hero {
            padding: 1.5rem 1.25rem;
            border-radius: 16px;
          }

          .kb-hero-title {
            font-size: 1.45rem;
          }

          .kb-hero-desc {
            font-size: 0.86rem;
            line-height: 1.5;
          }

          .kb-search-bar {
            padding: 0.5rem 0.85rem;
          }

          .kb-main-layout {
            display: block;
          }

          .kb-sidebar-col {
            display: ${mobileReadingMode ? 'none' : 'flex'} !important;
          }

          .kb-reader-card {
            display: ${mobileReadingMode ? 'block' : 'none'} !important;
            position: static !important;
            max-height: none !important;
            padding: 1.25rem !important;
            border-radius: 16px !important;
            box-shadow: none !important;
          }

          .kb-mobile-back-btn {
            display: flex !important;
            align-items: center;
            gap: 8px;
            padding: 0.6rem 1rem;
            background: #EFF6FF;
            color: #2563eb;
            border: 1.5px solid #BFDBFE;
            border-radius: 10px;
            font-weight: 800;
            font-size: 0.88rem;
            cursor: pointer;
            margin-bottom: 1.25rem;
            width: fit-content;
          }

          .kb-article-title-mobile {
            font-size: 1.4rem !important;
            line-height: 1.3 !important;
          }

          .kb-h2 {
            font-size: 1.22rem;
            margin-top: 1.35rem;
          }

          .kb-h3 {
            font-size: 1.08rem;
            margin-top: 1.15rem;
          }

          .kb-paragraph, .kb-step-text, .kb-bullet-text {
            font-size: 0.92rem;
            line-height: 1.65;
          }
        }
      `}</style>

      <div className="kb-container">
        
        {/* Hero Header Banner */}
        {(!mobileReadingMode) && (
          <div className="kb-hero fade-in">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{
                  background: 'rgba(37, 99, 235, 0.35)',
                  color: '#93c5fd',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  border: '1px solid rgba(147, 197, 253, 0.3)'
                }}>
                  <i className="fas fa-book-open" style={{ marginRight: '5px' }}></i>
                  OFFICIAL HELP CENTER
                </span>

                {/* 100% Offline Ready Badge */}
                <span style={{
                  background: isOnline ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                  color: isOnline ? '#6EE7B7' : '#FCD34D',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  border: `1px solid ${isOnline ? 'rgba(110, 231, 183, 0.35)' : 'rgba(252, 211, 77, 0.35)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isOnline ? '#10B981' : '#F59E0B'
                  }} />
                  {isOnline ? 'Offline-Ready Enabled' : 'Active in Offline Mode'}
                </span>
              </div>
              <h1 className="kb-hero-title">
                User Manuals &amp; Operational Guides
              </h1>
              <p className="kb-hero-desc">
                Complete offline-accessible manuals for school setup, mark entry, MoMo wallet subscriptions, and generating terminal report cards.
              </p>
            </div>

            {/* Search Bar inside Hero */}
            <div className="kb-search-bar">
              <i className="fas fa-search" style={{ color: '#94a3b8', fontSize: '0.95rem' }}></i>
              <input
                type="text"
                placeholder="Search topics (e.g. scores, wallet, signatures, broadsheet)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  outline: 'none',
                  width: '100%',
                  fontWeight: 500
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Category Section Quick-Jump Tabs */}
        {(!mobileReadingMode) && (
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none'
          }}>
            <button
              onClick={() => setActiveCategoryTab('ALL')}
              style={{
                padding: '0.55rem 1.1rem',
                borderRadius: '10px',
                border: activeCategoryTab === 'ALL' ? '2px solid #2563eb' : '1px solid #E2E8F0',
                background: activeCategoryTab === 'ALL' ? '#EFF6FF' : '#FFFFFF',
                color: activeCategoryTab === 'ALL' ? '#2563eb' : '#475569',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0
              }}
            >
              <i className="fas fa-layer-group"></i>
              <span>All ({posts.length})</span>
            </button>

            {SECTION_CONFIG.map(sec => {
              const count = posts.filter(p => p.category?.toLowerCase() === sec.id.toLowerCase()).length;
              const isActive = activeCategoryTab === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveCategoryTab(sec.id)}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '10px',
                    border: isActive ? `2px solid ${sec.color}` : '1px solid #E2E8F0',
                    background: isActive ? sec.bg : '#FFFFFF',
                    color: isActive ? sec.color : '#475569',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0
                  }}
                >
                  <i className={`fas ${sec.icon}`}></i>
                  <span>{sec.label} ({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Content Layout */}
        {loading ? (
          <div style={{ padding: '2.5rem 1rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', textAlign: 'center' }}>
            <LogoPreloader fullScreen={false} size="md" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
              <div>
                <i className="fas fa-search" style={{ fontSize: '2.25rem', color: '#CBD5E1', marginBottom: '0.75rem', display: 'block' }}></i>
                <h3 style={{ margin: '0 0 0.35rem 0', color: '#09090b', fontSize: '1.15rem', fontWeight: 800 }}>
                  No guide matched "{searchQuery}"
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0, maxWidth: '600px' }}>
                  If what you are searching for is not in the offline manuals, our support team is available to assist you right now:
                </p>
              </div>
              
              {/* Help & Direct Links Box inside Empty Search */}
              <div style={{ maxWidth: '750px', width: '100%' }}>
                <HelpDeskSupportBox highlight={true} title="Reach Support for Immediate Assistance" />
              </div>
            </div>
          </div>
        ) : (
          <div className="kb-main-layout">
            
            {/* Left Column: Categorized Sections & Article Cards */}
            <div className="kb-sidebar-col" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {Object.keys(groupedSections).map(catName => {
                const secMeta = SECTION_CONFIG.find(s => s.id.toLowerCase() === catName.toLowerCase()) || {
                  label: catName,
                  icon: 'fa-folder-open',
                  color: '#2563eb',
                  bg: '#EFF6FF'
                };
                const catPosts = groupedSections[catName];

                return (
                  <div key={catName} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {/* Section Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '0.35rem 0.25rem',
                      borderBottom: '2px solid #E2E8F0'
                    }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: secMeta.bg,
                        color: secMeta.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.82rem'
                      }}>
                        <i className={`fas ${secMeta.icon}`}></i>
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>
                          {secMeta.label}
                        </h3>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{catPosts.length} Guide{catPosts.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Article Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {catPosts.map(post => {
                        const isSelected = selectedPost?.id === post.id;
                        return (
                          <div
                            key={post.id}
                            onClick={() => handleSelectPost(post)}
                            style={{
                              background: isSelected ? '#EFF6FF' : '#FFFFFF',
                              border: isSelected ? '2px solid #2563eb' : '1px solid #E2E8F0',
                              borderRadius: '12px',
                              padding: '1rem 1.15rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                              <span style={{
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                background: isSelected ? '#DBEAFE' : '#F1F5F9',
                                color: isSelected ? '#1d4ed8' : '#475569'
                              }}>
                                {post.target_role || 'All'}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                <i className="fas fa-clock" style={{ marginRight: '4px' }}></i>
                                {post.read_time || '5 min'}
                              </span>
                            </div>

                            <h4 style={{
                              margin: '0 0 0.3rem 0',
                              fontSize: '0.92rem',
                              fontWeight: 800,
                              color: isSelected ? '#1e40af' : '#0f172a',
                              lineHeight: 1.35,
                              fontFamily: 'Outfit, sans-serif'
                            }}>
                              {post.title}
                            </h4>

                            <p style={{
                              margin: 0,
                              fontSize: '0.78rem',
                              color: '#64748b',
                              lineHeight: 1.45,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {post.summary}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Sidebar Support Box (Always accessible) */}
              <div style={{ marginTop: '0.75rem' }}>
                <HelpDeskSupportBox compact={true} />
              </div>
            </div>

            {/* Right Column / Mobile Full Article Reader */}
            {selectedPost ? (
              <div className="kb-reader-card fade-in">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  className="kb-mobile-back-btn"
                  onClick={() => setMobileReadingMode(false)}
                >
                  <i className="fas fa-arrow-left"></i>
                  <span>Back to Guides List</span>
                </button>

                {/* Article Header Metadata */}
                <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      background: '#EFF6FF',
                      color: '#2563eb',
                      border: '1px solid #DBEAFE'
                    }}>
                      📁 {selectedPost.category}
                    </span>
                    {selectedPost.featured_badge && (
                      <span style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: '#F5F3FF',
                        color: '#7C3AED',
                        border: '1px solid #EDE9FE'
                      }}>
                        🏷️ {selectedPost.featured_badge}
                      </span>
                    )}
                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      background: '#ECFDF5',
                      color: '#059669',
                      border: '1px solid #D1FAE5'
                    }}>
                      🎯 For: {selectedPost.target_role || 'All Staff'}
                    </span>
                  </div>

                  <h1 className="kb-article-title-mobile" style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    color: '#09090b',
                    margin: '0 0 0.75rem 0',
                    lineHeight: 1.3
                  }}>
                    {selectedPost.title}
                  </h1>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.8rem', color: '#64748b', flexWrap: 'wrap' }}>
                    <span><i className="fas fa-user-circle" style={{ marginRight: '5px', color: '#2563eb' }}></i>{selectedPost.author || 'Super Admin'}</span>
                    <span><i className="fas fa-clock" style={{ marginRight: '5px', color: '#2563eb' }}></i>{selectedPost.read_time || '5 min read'}</span>
                  </div>

                  {selectedPost.summary && (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.85rem 1rem',
                      background: '#F8FAFC',
                      borderRadius: '10px',
                      borderLeft: '4px solid #2563eb',
                      fontSize: '0.88rem',
                      color: '#334155',
                      lineHeight: 1.55,
                      fontStyle: 'italic'
                    }}>
                      {selectedPost.summary}
                    </div>
                  )}

                  {/* WhatsApp Headline Direct Share Bar */}
                  <div style={{
                    marginTop: '1.15rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0'
                  }}>
                    <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fas fa-share-nodes" style={{ color: '#2563eb' }}></i>
                      <span>Share Official Headline:</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${selectedPost.title}\n\n${window.location.origin}/blog/${selectedPost.slug || selectedPost.id}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#25D366',
                          color: '#FFFFFF',
                          padding: '0.4rem 0.85rem',
                          borderRadius: '8px',
                          textDecoration: 'none',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(37, 211, 102, 0.25)'
                        }}
                      >
                        <i className="fab fa-whatsapp" style={{ fontSize: '0.95rem' }}></i>
                        <span>Share on WhatsApp</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          const textToCopy = `${selectedPost.title}\n\n${window.location.origin}/blog/${selectedPost.slug || selectedPost.id}`;
                          navigator.clipboard.writeText(textToCopy);
                          alert('Headline & article link copied to clipboard!');
                        }}
                        style={{
                          background: '#FFFFFF',
                          color: '#0F172A',
                          border: '1px solid #CBD5E1',
                          padding: '0.4rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <i className="fas fa-copy"></i>
                        <span>Copy Link</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Article Body */}
                <div>
                  {renderMarkdown(selectedPost.content)}
                </div>

                {/* Article Tags */}
                {selectedPost.tags && (Array.isArray(selectedPost.tags) ? selectedPost.tags : selectedPost.tags.split(',')).filter(Boolean).length > 0 && (
                  <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Related Topics &amp; Tags:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(Array.isArray(selectedPost.tags) ? selectedPost.tags : selectedPost.tags.split(',')).filter(Boolean).map((tag, tIdx) => (
                        <span
                          key={tIdx}
                          onClick={() => {
                            setSearchQuery(tag.trim());
                            setMobileReadingMode(false);
                          }}
                          title={`Search all guides on #${tag.trim()}`}
                          style={{
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            color: '#2563EB',
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '999px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Article Help & Support Box */}
                <div style={{ marginTop: '2rem' }}>
                  <HelpDeskSupportBox compact={true} />
                </div>

                {/* Mobile Bottom Return Button */}
                <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileReadingMode(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{
                      padding: '0.65rem 1.25rem',
                      borderRadius: '10px',
                      background: '#09090b',
                      color: '#FFFFFF',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <i className="fas fa-arrow-left"></i>
                    <span>Back to Guides List</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: '10px',
                      background: '#F1F5F9',
                      color: '#475569',
                      border: '1px solid #CBD5E1',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <i className="fas fa-arrow-up"></i>
                    <span>Back to Top</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '3.5rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                <i className="fas fa-hand-pointer" style={{ fontSize: '1.75rem', color: '#94a3b8', marginBottom: '0.75rem', display: 'block' }}></i>
                Select any manual or guide to read the full instructions.
              </div>
            )}

          </div>
        )}

      </div>
    </Layout>
  );
};

export default KnowledgeBase;
