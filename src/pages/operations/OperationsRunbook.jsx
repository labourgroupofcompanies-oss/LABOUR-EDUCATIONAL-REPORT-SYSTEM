import React, { useState } from 'react';

const RUNBOOK_SECTIONS = [
  {
    id: 'architecture',
    title: '1. Architecture & Technology Stack',
    icon: 'fa-server',
    color: '#3B82F6',
    content: (
      <div>
        <p style={{ color: '#4B5563', lineHeight: '1.6', marginBottom: '1rem' }}>
          Labour Educational Report System is an <strong>offline-first, multi-tenant Progressive Web App (PWA)</strong> built for primary and junior high schools in Ghana to record scores, manage learners, generate GES-standard terminal reports, and send parent notifications.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1rem', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <strong style={{ color: '#111827' }}>Frontend / Client</strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6B7280' }}>React 18, Vite, Workbox PWA, Tailwind / CSS</p>
          </div>
          <div style={{ padding: '1rem', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <strong style={{ color: '#111827' }}>Local IndexedDB</strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6B7280' }}>Dexie.js (LabourEduReportSystem_v1)</p>
          </div>
          <div style={{ padding: '1rem', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <strong style={{ color: '#111827' }}>Cloud Database</strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6B7280' }}>Supabase (PostgreSQL 15 + RLS)</p>
          </div>
          <div style={{ padding: '1rem', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
            <strong style={{ color: '#111827' }}>Payments & Billing</strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6B7280' }}>Paystack Webhook & Inline Checkout</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'isolation',
    title: '2. Multi-Tenant School Isolation',
    icon: 'fa-shield-halved',
    color: '#10B981',
    content: (
      <div>
        <p style={{ color: '#4B5563', lineHeight: '1.6', marginBottom: '1rem' }}>
          All tables in Supabase and IndexedDB are shared across multiple schools on the same browser origin. <strong>Every record must carry a <code>schoolId</code> / <code>school_id</code> foreign key.</strong>
        </p>
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', color: '#065F46' }}>🛡️ The 3 Tenancy Isolation Rules</h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#047857', fontSize: '0.875rem', lineHeight: '1.6' }}>
            <li><strong>Supabase Row-Level Security:</strong> <code>WITH CHECK (school_id = public.jwt_school_id())</code> rejects foreign insertions with HTTP 403.</li>
            <li><strong>Frontend Scoping:</strong> All live Dexie queries must strictly filter by active <code>user.schoolId</code>.</li>
            <li><strong>Sync Firewall:</strong> <code>syncEngine.js</code> drops score rows or learners pointing outside the active tenant context.</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 'sync',
    title: '3. Offline Sync Engine & Outbox',
    icon: 'fa-arrows-rotate',
    color: '#F59E0B',
    content: (
      <div>
        <p style={{ color: '#4B5563', lineHeight: '1.6', marginBottom: '1rem' }}>
          The bidirectional sync engine ensures teachers can enter marks, take attendance, and register learners completely offline.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: '#FFFBEB', borderRadius: '8px', border: '1px solid #FDE68A' }}>
            <strong style={{ color: '#92400E' }}>Outbound Sync (Local → Supabase)</strong>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#B45309', lineHeight: '1.5' }}>
              Mutations are placed into <code>db.outbox</code>. When online, <code>drainOutbox()</code> resolves integer IDs to UUIDs and executes operations. Toxic 403 items are auto-discarded.
            </p>
          </div>
          <div style={{ padding: '1rem', background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
            <strong style={{ color: '#1E40AF' }}>Inbound Sync (Supabase → Local)</strong>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#1D4ED8', lineHeight: '1.5' }}>
              <code>syncDown.js</code> pulls updated cloud state. Learner reconciliation strictly matches within the active school and respects local offline dirty edits.
            </p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'troubleshooting',
    title: '4. Troubleshooting & Quick Playbooks',
    icon: 'fa-wrench',
    color: '#EF4444',
    content: (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA' }}>
            <strong style={{ color: '#991B1B' }}>Issue: 403 Forbidden / RLS Loop on Sync</strong>
            <p style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.875rem', color: '#B91C1C' }}>
              Occurs when an outbox item contains data from another school.
            </p>
            <span style={{ fontSize: '0.8rem', color: '#7F1D1D', background: '#FEE2E2', padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }}>
              Auto-purged on startup by SyncEngineProvider. Or run: await db.outbox.clear();
            </span>
          </div>

          <div style={{ padding: '1rem', background: '#F5F3FF', borderRadius: '8px', border: '1px solid #DDD6FE' }}>
            <strong style={{ color: '#5B21B6' }}>Issue: Stale Cache on Shared Machine</strong>
            <p style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.875rem', color: '#6D28D9' }}>
              Open DevTools (F12) → Application → Storage → Click <strong>"Clear site data"</strong> and refresh.
            </p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'schema',
    title: '5. Core Database Tables',
    icon: 'fa-table',
    color: '#8B5CF6',
    content: (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Local Store</th>
              <th style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Supabase Table</th>
              <th style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Primary Responsibility</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>schools</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>report_schools</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>School profile, active term/year, branding</td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>classes</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>report_classes</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Class levels (Basic 1 - JHS 3)</td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>subjects</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>report_subjects</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Curriculum subjects</td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>learners</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>report_learners</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Student biodata, guardian contacts, class assigned</td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>scores</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>report_scores</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Class assessment & exam marks</td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>reportSummaries</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}><code>report_summaries</code></td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #E5E7EB' }}>Computed aggregates, positions, remarks</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }
];

export default function OperationsRunbook() {
  const [activeTab, setActiveTab] = useState('architecture');

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#111827', margin: 0 }}>
            <i className="fa-solid fa-book-bookmark" style={{ color: '#3B82F6', marginRight: '0.75rem' }}></i>
            Operations Runbook & Architecture Guide
          </h1>
          <p style={{ color: '#6B7280', margin: '0.5rem 0 0', fontSize: '0.95rem' }}>
            System specifications, multi-tenant rules, offline sync engine, and incident resolution protocols.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ padding: '0.4rem 0.8rem', background: '#EFF6FF', color: '#1D4ED8', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: '600' }}>
            v0.1.1 Production
          </span>
          <span style={{ padding: '0.4rem 0.8rem', background: '#ECFDF5', color: '#047857', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: '600' }}>
            Offline-Ready PWA
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #E5E7EB', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {RUNBOOK_SECTIONS.map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveTab(sec.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === sec.id ? '700' : '500',
              color: activeTab === sec.id ? sec.color : '#6B7280',
              borderBottom: activeTab === sec.id ? `3px solid ${sec.color}` : '3px solid transparent',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            <i className={`fa-solid ${sec.icon}`}></i>
            {sec.title}
          </button>
        ))}
      </div>

      {/* Active Section Content */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '2rem', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {RUNBOOK_SECTIONS.find(s => s.id === activeTab)?.content}
      </div>

      {/* Quick Links Footer */}
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#6B7280' }}>
        <span>Local Markdown copy available at: <code>RUNBOOK.md</code> in project root</span>
        <a 
          href="https://supabase.com/dashboard/project/qyavwtumduldesrajvzm" 
          target="_blank" 
          rel="noreferrer" 
          style={{ color: '#3B82F6', textDecoration: 'none', fontWeight: '600' }}
        >
          Supabase Dashboard <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '0.75rem' }}></i>
        </a>
      </div>
    </div>
  );
}
