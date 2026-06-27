import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { enqueueSync } from '../../services/syncEngine';
import LearnerPhoto from '../../components/common/LearnerPhoto';

import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { calculateCaTotal, calculateExamTotal, calculateTotal } from '../../lib/grading';

// ─── Pure helpers ─────────────────────────────────────────────────────────────
const DEFAULT_GRADING_SCALE = [
  { min: 90, max: 100, grade: 'A1', remark: 'Excellent' },
  { min: 80, max: 89,  grade: 'B2', remark: 'Very Good' },
  { min: 70, max: 79,  grade: 'B3', remark: 'Good' },
  { min: 60, max: 69,  grade: 'C4', remark: 'Credit' },
  { min: 55, max: 59,  grade: 'C5', remark: 'Credit' },
  { min: 50, max: 54,  grade: 'C6', remark: 'Credit' },
  { min: 45, max: 49,  grade: 'D7', remark: 'Pass' },
  { min: 40, max: 44,  grade: 'E8', remark: 'Pass' },
  { min: 0,  max: 39,  grade: 'F9', remark: 'Fail' },
];

function getGrade(total, scale) {
  if (total === null || total === undefined || isNaN(total)) return { grade: '—', remark: '—' };
  const n = Number(total);
  return scale.find(g => n >= g.min && n <= g.max) || { grade: 'F9', remark: 'Fail' };
}

function ordinal(n) {
  if (!n) return '—';
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

function gradeColor(grade) {
  if (!grade || grade === '—') return { bg: 'rgba(100,116,139,0.08)', text: '#64748b' };
  if (grade === 'F9') return { bg: 'rgba(239,68,68,0.10)', text: '#dc2626' };
  if (grade.startsWith('A') || grade.startsWith('B')) return { bg: 'rgba(16,185,129,0.10)', text: '#047857' };
  return { bg: 'rgba(245,158,11,0.10)', text: '#b45309' };
}

// ─── Inline CSS ───────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800;900&display=swap');

  .rc-page { display: flex; flex-direction: column; gap: 0; }

  /* ── Page header ── */
  .rc-page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.75rem;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .rc-page-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 4px;
    font-size: 1.45rem;
    font-weight: 900;
    color: var(--primary);
    font-family: 'Outfit', 'Inter', sans-serif;
  }
  .rc-page-title-icon {
    width: 36px; height: 36px;
    background: #eff6ff;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #3b82f6;
    font-size: 1rem;
    flex-shrink: 0;
  }
  .rc-page-subtitle {
    font-size: 0.83rem;
    color: var(--text-muted);
    margin: 0;
    font-weight: 500;
  }
  .rc-term-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #eff6ff;
    color: #3b82f6;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 0.4rem 0.85rem;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
  }

  /* ── Config card ── */
  .rc-config-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: var(--shadow-sm);
    margin-bottom: 1.25rem;
  }

  /* Filter row */
  .rc-filter-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1.25rem;
  }
  .rc-filter-field { display: flex; flex-direction: column; gap: 6px; }
  .rc-filter-label {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* Generate-for toggle */
  .rc-gen-section { margin-top: 1.5rem; }
  .rc-gen-label {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }
  .rc-gen-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
  }
  .rc-gen-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0.9rem 1rem;
    border-radius: 10px;
    border: 2px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-muted);
    transition: all 0.18s ease;
    font-family: 'Inter', sans-serif;
  }
  .rc-gen-btn.active {
    border-color: #3b82f6;
    background: #eff6ff;
    color: #2563eb;
  }
  .rc-gen-btn:hover:not(.active) {
    border-color: #93c5fd;
    background: #f0f9ff;
    color: #3b82f6;
  }

  /* Individual picker */
  .rc-individual-row {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Preview button */
  .rc-preview-btn {
    width: 100%;
    padding: 1rem;
    margin-top: 1.5rem;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #a78bfa 100%);
    color: white;
    font-size: 0.88rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 15px rgba(99,102,241,0.3);
    font-family: 'Inter', sans-serif;
  }
  .rc-preview-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(99,102,241,0.4);
  }
  .rc-preview-btn:active { transform: translateY(0); }
  .rc-preview-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* ── Preview section ── */
  .rc-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .rc-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.18s;
    font-family: 'Inter', sans-serif;
  }
  .rc-back-btn:hover { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }

  .rc-action-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  /* Individual student tabs (for All Learners view) */
  .rc-student-tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.5rem;
    margin-bottom: 1.25rem;
    box-shadow: var(--shadow-sm);
    max-height: 130px;
    overflow-y: auto;
  }
  .rc-stab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Inter', sans-serif;
    white-space: nowrap;
  }
  .rc-stab.active {
    background: #2563eb;
    border-color: #2563eb;
    color: white;
  }
  .rc-stab:hover:not(.active) { background: var(--background); border-color: #93c5fd; color: #2563eb; }

  /* ── Report card canvas ── */
  .rc-canvas {
    background: white;
    border: 3px double #b45309;
    border-radius: 18px;
    padding: 2rem;
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    font-family: 'Outfit', 'Inter', sans-serif;
    color: #0f172a;
    position: relative;
  }

  .rc-canvas-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    border-bottom: 2px double #b45309;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .rc-school-logo {
    width: 68px; height: 68px;
    border-radius: 50%;
    border: 2px solid #b45309;
    object-fit: cover;
    flex-shrink: 0;
  }
  .rc-school-logo-ph {
    width: 68px; height: 68px;
    border-radius: 50%;
    border: 2px solid #b45309;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #b45309;
    font-size: 1.75rem;
    flex-shrink: 0;
  }
  .rc-student-photo {
    width: 72px; height: 84px;
    border-radius: 8px;
    border: 2px solid #e2e8f0;
    object-fit: cover;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .rc-student-photo-ph {
    width: 72px; height: 84px;
    border-radius: 8px;
    border: 2px dashed #e2e8f0;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-size: 0.5rem;
    font-weight: 700;
    text-transform: uppercase;
    gap: 4px;
    flex-shrink: 0;
  }

  .rc-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .rc-doc-badge {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #f8fafc;
    padding: 0.4rem 1.1rem;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
    color: #0f172a;
  }
  .rc-kpis { display: flex; gap: 0.6rem; }
  .rc-kpi {
    width: 58px; height: 58px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
  }
  .rc-kpi-lbl { font-size: 0.44rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
  .rc-kpi-val { font-size: 0.88rem; font-weight: 900; line-height: 1; color: #0f172a; }

  .rc-bio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    background: #f8fafc;
    padding: 0.85rem 1rem;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    margin-bottom: 1.5rem;
    font-size: 0.78rem;
  }
  .rc-bio-item strong { color: #64748b; font-weight: 600; margin-right: 4px; }

  /* Grades table */
  .rc-table-wrap { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 1.25rem; }
  .rc-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .rc-table thead tr { background: #0f172a; color: white; }
  .rc-table th { padding: 0.6rem 0.8rem; font-weight: 700; text-align: left; }
  .rc-table th.c, .rc-table td.c { text-align: center; }
  .rc-table tbody tr { border-bottom: 1px solid #e2e8f0; }
  .rc-table tbody tr:last-child { border-bottom: none; }
  .rc-table tbody tr:nth-child(even) { background: #f8fafc; }
  .rc-table td { padding: 0.55rem 0.8rem; }
  .rc-gbadge { display: inline-block; padding: 2px 10px; border-radius: 6px; font-weight: 800; font-size: 0.72rem; }

  /* ── Bottom Grid for Grading, Conduct, Next Term, Remarks ── */
  .rc-bottom-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .rc-sbox {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 0.85rem 1rem; font-size: 0.78rem;
  }
  .rc-sbox h4 {
    margin: 0 0 6px; font-size: 0.8rem; font-weight: 800;
    color: #0f172a; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px;
  }
  .rc-sbox p { margin: 3px 0; line-height: 1.45; }
  .rc-sbox p strong { color: #64748b; font-weight: 600; }
  .rc-legend-content {
    display: flex; gap: 5px; flex-wrap: wrap;
    font-size: 0.67rem; color: #64748b; align-items: center;
  }

  .rc-sig-strip { display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 1rem; gap: 1rem; }
  .rc-sig-block { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 120px; font-size: 0.7rem; font-weight: 700; text-align: center; color: #0f172a; }
  .rc-sig-line { width: 100%; height: 1px; background: #94a3b8; margin-bottom: 5px; margin-top: 28px; }

  /* ── Remark editor ── */
  .rc-editor {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: var(--shadow-sm);
    margin-top: 1.25rem;
  }
  .rc-editor-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 1.25rem; padding-bottom: 0.85rem;
    border-bottom: 1px solid var(--border); gap: 10px; flex-wrap: wrap;
  }
  .rc-section-title {
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--primary);
    border-bottom: 2px solid var(--border);
    padding-bottom: 0.4rem;
    margin-top: 1.25rem;
    margin-bottom: 1rem;
  }
  .rc-section-title:first-of-type { margin-top: 0; }
  .rc-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
  .rc-form-group { display: flex; flex-direction: column; gap: 4px; }
  .rc-form-group label { font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }

  /* ── Print ── */
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; }
    body * { visibility: hidden !important; }
    .rc-print-container, .rc-print-container * { visibility: visible !important; }
    .rc-print-container {
      position: absolute !important; left: 0 !important; top: 0 !important;
      width: 100% !important;
      display: block !important;
      margin: 0 !important; padding: 0 !important;
    }
    .rc-all-learners-container {
      display: block !important;
      gap: 0 !important;
      margin: 0 !important; padding: 0 !important;
    }
    .rc-learner-block {
      page-break-after: always !important;
      break-after: page !important;
      margin: 0 !important; padding: 0 !important;
    }
    .rc-learner-block:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .rc-print-zone {
      width: 210mm !important; 
      height: 99vh !important;
      max-height: 296mm !important;
      padding: 10mm !important;
      box-sizing: border-box !important; background: white !important;
      page-break-inside: avoid !important;
      position: relative !important;
      margin: 0 auto !important;
      overflow: hidden !important;
    }
    
    /* ── Compact layout for print to fit more subjects ── */
    .rc-print-zone .rc-canvas {
      box-shadow: none !important; border-radius: 0 !important; background: white !important;
      padding: 0.5rem !important;
      height: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      border: 2px double #b45309 !important;
    }
    .rc-print-zone .rc-canvas-header { padding-bottom: 0.5rem !important; margin-bottom: 0.5rem !important; }
    .rc-print-zone .rc-title-row { margin-bottom: 0.5rem !important; }
    .rc-print-zone .rc-bio-grid { padding: 0.4rem 0.5rem !important; margin-bottom: 0.5rem !important; gap: 4px !important; font-size: 0.7rem !important; }
    .rc-print-zone .rc-table th, .rc-print-zone .rc-table td { padding: 0.25rem 0.4rem !important; font-size: 0.7rem !important; }
    .rc-print-zone .rc-table-wrap { margin-bottom: 0.5rem !important; }
    
    .rc-print-zone .rc-bottom-grid { margin-bottom: 0.5rem !important; gap: 0.5rem !important; }
    .rc-print-zone .rc-sbox { padding: 0.4rem 0.5rem !important; font-size: 0.7rem !important; }
    .rc-print-zone .rc-legend-content { font-size: 0.6rem !important; }
    
    .rc-print-zone .rc-sig-strip { padding-top: 0.5rem !important; margin-top: auto !important; }
    .rc-print-zone .rc-sig-line { margin-top: 15px !important; }

    .no-print { display: none !important; }
    @page { margin: 0; size: A4 portrait; }
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .rc-filter-row { grid-template-columns: 1fr; gap: 0.85rem; }
    .rc-gen-row { grid-template-columns: 1fr 1fr; }
    .rc-summary-grid { grid-template-columns: 1fr; }
    .rc-canvas { padding: 1.25rem; }
    .rc-bio-grid { grid-template-columns: 1fr 1fr; }
    .rc-sig-strip { flex-wrap: wrap; gap: 1.5rem; }
    .rc-kpi { width: 50px; height: 50px; }
    .rc-kpi-val { font-size: 0.78rem; }
  }
  @media (max-width: 480px) {
    .rc-gen-row { grid-template-columns: 1fr; }
    .rc-filter-row { grid-template-columns: 1fr; }
    .rc-canvas { padding: 1rem 0.85rem; }
    .rc-table th, .rc-table td { padding: 0.4rem 0.5rem; font-size: 0.7rem; }
    .rc-bio-grid { grid-template-columns: 1fr; }
    .rc-page-title { font-size: 1.15rem; }
  }

  /* ── Parents Distribution Portal styles ── */
  .rc-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1.5px solid var(--border);
    padding-bottom: 0px;
  }
  .rc-tab-btn {
    background: none;
    border: none;
    padding: 0.75rem 1.25rem;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    color: var(--text-muted);
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    font-family: 'Outfit', sans-serif;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rc-tab-btn:hover {
    color: var(--primary);
  }
  .rc-tab-btn.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .rc-dist-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.25rem;
    margin-bottom: 1.5rem;
  }
  .rc-dist-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: var(--shadow-sm);
  }
  .rc-dist-card-icon {
    width: 48px; height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .rc-dist-card-details h4 {
    margin: 0 0 2px;
    font-size: 0.72rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
  }
  .rc-dist-card-details p {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 900;
    color: var(--primary);
    font-family: 'Outfit', sans-serif;
  }

  .rc-dist-actions-panel {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-radius: 18px;
    padding: 1.5rem;
    color: white;
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1.5rem;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  }
  .rc-dist-actions-info h3 {
    margin: 0 0 4px;
    font-size: 1.1rem;
    font-weight: 800;
    font-family: 'Outfit', sans-serif;
    color: #fff;
  }
  .rc-dist-actions-info p {
    margin: 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }
  .rc-dist-btns {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .btn-dispatch {
    background: #0d9488;
    color: white !important;
    border: none;
    border-radius: 12px;
    padding: 0.75rem 1.5rem;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.3);
    transition: all 0.2s;
  }
  .btn-dispatch:hover {
    background: #0f766e;
    transform: translateY(-1px);
    opacity: 0.95;
  }
  .btn-revoke-dispatch {
    background: #dc2626;
    color: white !important;
    border: none;
    border-radius: 12px;
    padding: 0.75rem 1.5rem;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 14px rgba(220, 38, 38, 0.2);
    transition: all 0.2s;
  }
  .btn-revoke-dispatch:hover {
    background: #b91c1c;
    transform: translateY(-1px);
    opacity: 0.95;
  }

  .rc-quality-checklist {
    background: #fffbeb;
    border: 1px solid #fef3c7;
    border-radius: 14px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    color: #b45309;
    font-size: 0.8rem;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .rc-quality-checklist i {
    font-size: 1.2rem;
    color: #d97706;
    margin-top: 2px;
  }
  .rc-quality-checklist h4 {
    margin: 0 0 4px;
    font-weight: 800;
    font-size: 0.85rem;
  }
  .rc-quality-checklist p {
    margin: 0;
    line-height: 1.5;
  }

  .rc-dist-table-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .rc-dist-table-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .rc-dist-table-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: var(--primary);
    font-family: 'Outfit', sans-serif;
  }
  .rc-dist-table-wrap {
    overflow-x: auto;
  }
  .rc-dist-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }
  .rc-dist-table th {
    background: var(--background);
    padding: 0.85rem 1.25rem;
    font-weight: 700;
    color: var(--text-muted);
    border-bottom: 1.5px solid var(--border);
    text-transform: uppercase;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
  }
  .rc-dist-table td {
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .rc-dist-table tbody tr:last-child td {
    border-bottom: none;
  }
  .rc-dist-table tbody tr:hover {
    background: rgba(0,0,0,0.01);
  }
  .rc-student-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .rc-student-cell-photo {
    width: 38px; height: 38px;
    border-radius: 8px;
    object-fit: cover;
    border: 1.5px solid var(--border);
    background: var(--background);
  }
  .rc-student-cell-photo-ph {
    width: 38px; height: 38px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background);
    color: var(--text-muted);
    font-size: 0.95rem;
    border: 1.5px dashed var(--border);
  }
  .rc-student-name {
    font-weight: 700;
    color: var(--primary);
    font-size: 0.85rem;
  }
  .rc-student-reg {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .rc-badge-draft {
    background: rgba(245, 158, 11, 0.08);
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.2);
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.7rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .rc-badge-published {
    background: rgba(13, 148, 136, 0.08);
    color: #0d9488;
    border: 1px solid rgba(13, 148, 136, 0.2);
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.7rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .rc-viewed-badge {
    background: rgba(16, 185, 129, 0.08);
    color: #047857;
    border: 1px solid rgba(16, 185, 129, 0.2);
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.7rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .rc-unread-badge {
    background: rgba(100, 116, 139, 0.06);
    color: #64748b;
    border: 1px solid rgba(100, 116, 139, 0.15);
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.7rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .btn-save-remark-inline {
    background: var(--accent);
    color: white !important;
    border: none;
    border-radius: 8px;
    width: 28px; height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.75rem;
    box-shadow: 0 2px 8px rgba(13, 148, 136, 0.25);
    transition: all 0.2s;
  }
  .btn-save-remark-inline:hover {
    opacity: 0.9;
    transform: scale(1.05);
  }
`;

// ─── Main Component ───────────────────────────────────────────────────────────
const Reports = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  // Live queries — all scoped to current school to prevent cross-school data loading
  const schoolId = user?.schoolId;
  const classes            = useLiveQuery(
    () => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );
  const subjects           = useLiveQuery(
    () => schoolId ? db.subjects.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );
  const classSubjects      = useLiveQuery(
    () => schoolId ? db.classSubjects.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );
  const learners           = useLiveQuery(
    () => schoolId ? db.learners.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );

  const reportSummaries    = useLiveQuery(
    () => schoolId ? db.reportSummaries.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );
  const teacherAssignments = useLiveQuery(
    () => schoolId ? db.teacherAssignments.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );
  const globalSettings     = useLiveQuery(() => db.settings.get('global'), []);
  const schoolInfo         = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]
  );

  // ── Configuration state ───────────────────────────────────────────────────
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm,  setSelectedTerm]  = useState('Term 1');
  const [academicYear,  setAcademicYear]  = useState('');
  const [generateMode,  setGenerateMode]  = useState('all'); // 'all' | 'individual'
  const [selectedIndividualId, setSelectedIndividualId] = useState('');

  const localScores = useLiveQuery(
    () => schoolId ? db.scores.where('schoolId').equals(schoolId).toArray() : [],
    [schoolId]
  );
  const [cloudScores, setCloudScores] = useState([]);

  // Fetch directly from cloud to ensure Reports always use the latest teacher inputs
  useEffect(() => {
    if (!navigator.onLine || !user?.schoolId || !selectedClass || !academicYear || !selectedTerm) return;
    (async () => {
      const { data } = await supabase
        .from('report_scores')
        .select('*')
        .eq('school_id', user.schoolId)
        .eq('class_id', Number(selectedClass))
        .eq('academic_year', academicYear)
        .eq('term', selectedTerm);
      
      if (data) {
        const formatted = data.map(cs => ({
          learnerId: cs.learner_id,
          classId: cs.class_id,
          subjectId: cs.subject_id,
          caScores: cs.ca_scores || [],
          examScore: cs.exam_score !== null ? cs.exam_score : '',
          classScore: cs.class_score || 0,
          totalScore: cs.total_score || 0,
          grade: cs.grade || '',
          remark: cs.remark || '',
          termId: cs.term_id || null,
          term: cs.term || '',
          academicYear: cs.academic_year || '',
          updatedAt: cs.updated_at
        }));
        setCloudScores(formatted);
      }
    })();
  }, [user, selectedClass, academicYear, selectedTerm]);

  // Use cloud scores if available, fallback to local Dexie for offline support
  const scores = cloudScores.length > 0 ? cloudScores : (localScores || []);

  // ── View state: 'config' | 'preview' ─────────────────────────────────────
  const [view, setView] = useState('config');
  const [activeTab, setActiveTab] = useState('compiler'); // 'compiler' | 'distribution'
  const [isDispatching, setIsDispatching] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState(null);
  const [inlineHeadteacherRemark, setInlineHeadteacherRemark] = useState('');
  const [isSavingRemark, setIsSavingRemark] = useState(false);

  // ── Preview state ─────────────────────────────────────────────────────────
  const [activeLearnerId, setActiveLearnerId] = useState(null);

  // ── Remark form ───────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    attendancePresent: '', attendanceTotal: '',
    conduct: '',           attitude: '',
    teacherRemark: '',     headteacherRemark: '',
    promotedTo: '',        vacationDate: '',
    nextTermBegins: '',    feesOwed: '',
    nextTermBill: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Sync school settings
  useEffect(() => {
    if (schoolInfo) {
      if (schoolInfo.currentAcademicYear) setAcademicYear(schoolInfo.currentAcademicYear);
      if (schoolInfo.currentTerm)         setSelectedTerm(schoolInfo.currentTerm);
      setForm(f => ({
        ...f,
        vacationDate:   schoolInfo.vacationDate   || '',
        nextTermBegins: schoolInfo.nextTermBegins  || '',
      }));
    }
  }, [schoolInfo]);

  // Cloud sync summaries
  useEffect(() => {
    if (!navigator.onLine || !user?.schoolId) return;
    (async () => {
      try {
        const { data, error } = await supabase.from('report_summaries').select('*').eq('school_id', user.schoolId);
        if (data && !error) {
          for (const s of data) {
            const existing = await db.reportSummaries.where('supabaseId').equals(s.id).first();
            await db.reportSummaries.put({
              id: existing?.id,
              schoolId: s.school_id, learnerId: s.learner_id, classId: s.class_id,
              academicYear: s.academic_year, term: s.term,
              attendancePresent: s.attendance_present, attendanceTotal: s.attendance_total,
              conduct: s.conduct, attitude: s.attitude,
              teacherRemark: s.teacher_remark, headteacherRemark: s.headteacher_remark,
              promotedTo: s.promoted_to, nextTermBegins: s.next_term_begins,
              feesOwed: s.fees_owed, nextTermBill: s.next_term_bill, isReleased: s.is_released || false, synced: true, supabaseId: s.id,
            });
          }
        }
      } catch (err) { console.error('Cloud sync error:', err); }
    })();
  }, [user]);

  // Cloud sync scores for selected class
  useEffect(() => {
    if (!navigator.onLine || !user?.schoolId || !selectedClass || !academicYear || !selectedTerm) return;
    (async () => {
      try {
        const { data: cloudScores, error } = await supabase
          .from('report_scores')
          .select('*')
          .eq('school_id', user.schoolId)
          .eq('class_id', Number(selectedClass))
          .eq('academic_year', academicYear)
          .eq('term', selectedTerm);
        
        if (cloudScores && !error) {
          for (const cs of cloudScores) {
            const existing = await db.scores
              .where('learnerId').equals(cs.learner_id)
              .filter(s => s.classId === cs.class_id && s.subjectId === cs.subject_id && s.term === cs.term && s.academicYear === cs.academic_year)
              .first();
            
            const entry = {
              learnerId: cs.learner_id,
              classId: cs.class_id,
              subjectId: cs.subject_id,
              caScores: cs.ca_scores || [],
              examScore: cs.exam_score || '',
              classScore: cs.class_score || 0,
              totalScore: cs.total_score || 0,
              grade: cs.grade || '',
              remark: cs.remark || '',
              isSubmitted: cs.is_submitted || false,
              termId: null,
              term: cs.term || '',
              academicYear: cs.academic_year || '',
              updatedAt: cs.updated_at
            };

            if (existing) {
              // Basic check to update only if necessary or just overwrite to stay in sync
              if (existing.updatedAt !== cs.updated_at || existing.totalScore !== cs.total_score) {
                await db.scores.update(existing.id, entry);
              }
            } else {
              await db.scores.add(entry);
            }
          }
        }
      } catch (err) { console.error('Cloud sync scores error:', err); }
    })();
  }, [user, selectedClass, academicYear, selectedTerm]);

  // Background unsynced report summaries synchronizer & self-healing mapping
  const syncUnsyncedReportSummaries = React.useCallback(async () => {
    if (!navigator.onLine || !user?.schoolId) return;
    try {
      const unsynced = await db.reportSummaries.filter(s => !s.synced).toArray();
      if (unsynced.length === 0) return;

      console.log(`[Summary Sync] Found ${unsynced.length} unsynced report summaries. Syncing...`);

      for (const s of unsynced) {
        // Resolve student UUID if it was stored as local ID
        let resolvedLearnerId = s.learnerId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.learnerId);
        
        if (!isUuid) {
          const matchedLearner = await db.learners.get(Number(s.learnerId));
          if (matchedLearner && matchedLearner.supabaseId) {
            resolvedLearnerId = matchedLearner.supabaseId;
            // Update local summary record with the UUID
            await db.reportSummaries.update(s.id, { learnerId: resolvedLearnerId });
          } else {
            console.log(`[Summary Sync] Learner ${s.learnerId} not synced yet. Skipping summary sync.`);
            continue;
          }
        }

        const cloud = {
          school_id: user.schoolId,
          learner_id: resolvedLearnerId,
          class_id: Number(s.classId),
          academic_year: s.academicYear,
          term: s.term,
          attendance_present: Number(s.attendancePresent) || 0,
          attendance_total: Number(s.attendanceTotal) || 0,
          conduct: s.conduct || '—',
          attitude: s.attitude || '—',
          teacher_remark: s.teacherRemark || '—',
          headteacher_remark: s.headteacherRemark || '—',
          promoted_to: s.promotedTo || '—',
          next_term_begins: s.nextTermBegins || '',
          fees_owed: s.feesOwed || '',
          next_term_bill: s.nextTermBill || '',
          is_released: s.isReleased || s.is_released || false,
          class_average: s.classAverage !== undefined ? s.classAverage : null,
          class_rank: s.classRank !== undefined ? s.classRank : null,
          total_graded: s.totalGraded !== undefined ? s.totalGraded : 0,
          updated_at: new Date().toISOString(),
          promotion_status: s.promotionStatus || 'pending'
        };

        if (s.supabaseId) {
          await enqueueSync('update', 'report_summaries', { filter: { id: s.supabaseId }, data: cloud }, user.schoolId);
        } else {
          await enqueueSync('insert', 'report_summaries', cloud, user.schoolId);
        }

        await db.reportSummaries.update(s.id, { synced: true });
      }
    } catch (err) {
      console.warn('Failed to sync unsynced summaries:', err);
    }
  }, [user]);

  // Run on mount, user online, or background intervals
  useEffect(() => {
    if (user?.schoolId) {
      syncUnsyncedReportSummaries();
      
      const handleOnline = () => {
        syncUnsyncedReportSummaries();
      };
      
      window.addEventListener('online', handleOnline);
      return () => {
        window.removeEventListener('online', handleOnline);
      };
    }
  }, [user, syncUnsyncedReportSummaries]);

  // Grading scale
  const gradingScale = useMemo(() => {
    if (globalSettings?.gradingScale?.length > 0) return globalSettings.gradingScale;
    return DEFAULT_GRADING_SCALE;
  }, [globalSettings]);

  // Advised classes
  const advisedClasses = useMemo(() => {
    if (isAdmin) return classes || [];
    if (!classes || !teacherAssignments || !user) return [];
    const ids = new Set(teacherAssignments.filter(a => a.teacherId === user.id && a.subjectId === null).map(a => a.classId));
    return classes.filter(c => ids.has(c.id));
  }, [classes, teacherAssignments, user, isAdmin]);

  useEffect(() => {
    if (advisedClasses.length > 0 && !selectedClass) setSelectedClass(advisedClasses[0].id.toString());
  }, [advisedClasses, selectedClass]);

  const selectedClassInfo = useMemo(() => classes?.find(c => c.id === Number(selectedClass)), [classes, selectedClass]);

  // Learners in class
  const classLearners = useMemo(() => {
    if (!selectedClass || !learners) return [];
    
    const targetClassId = Number(selectedClass);
    
    // Create a Set of learner IDs who have historical summaries or scores in this class/term/year
    const historicalLearnerIds = new Set();
    
    if (reportSummaries && academicYear && selectedTerm) {
      reportSummaries.forEach(s => {
        if (Number(s.classId) === targetClassId && 
            s.academicYear === academicYear && 
            s.term === selectedTerm) {
          historicalLearnerIds.add(String(s.learnerId));
        }
      });
    }
    
    if (scores && academicYear && selectedTerm) {
      scores.forEach(s => {
        const sClassId = s.classId || s.class_id;
        const sLearnerId = s.learnerId || s.learner_id;
        const sYear = s.academicYear || s.academic_year;
        const sTerm = s.term;
        
        if (Number(sClassId) === targetClassId && 
            sYear === academicYear && 
            sTerm === selectedTerm) {
          historicalLearnerIds.add(String(sLearnerId));
        }
      });
    }

    return learners.filter(l => {
      // Condition 1: Currently active in this class
      if (l.currentClassId === targetClassId && l.status !== 'Alumni' && l.status !== 'Graduated') {
        return true;
      }
      // Condition 2: Has historical records for this class/term/year
      const lId = String(l.id);
      const lSupId = l.supabaseId ? String(l.supabaseId) : null;
      return historicalLearnerIds.has(lId) || (lSupId && historicalLearnerIds.has(lSupId));
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [learners, selectedClass, reportSummaries, scores, academicYear, selectedTerm]);

  // Subjects for class
  const classSubjectList = useMemo(() => {
    if (!selectedClass || !classSubjects || !subjects) return [];
    const ids = new Set(classSubjects.filter(cs => cs.classId === Number(selectedClass)).map(cs => cs.subjectId));
    return subjects.filter(s => ids.has(s.id));
  }, [classSubjects, subjects, selectedClass]);

  // Per-learner averages
  const learnerAverages = useMemo(() => {
    if (!classLearners.length || !scores) return {};
    const map = {};
    classLearners.forEach(l => {
      const ls = scores.filter(s => 
        (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId)) && 
        s.classId === Number(selectedClass) && 
        s.term === selectedTerm && 
        s.academicYear === academicYear
      );
      if (!ls.length) { map[l.id] = null; return; }
      map[l.id] = parseFloat((ls.reduce((a, s) => a + (Number(s.totalScore) || 0), 0) / ls.length).toFixed(2));
    });
    return map;
  }, [classLearners, scores, selectedClass, selectedTerm, academicYear]);

  const learnerRankings = useMemo(() => {
    const valid = Object.entries(learnerAverages).filter(([, v]) => v !== null).sort(([, a], [, b]) => b - a);
    const r = {};
    valid.forEach(([id], i) => { r[id] = i + 1; });
    return r;
  }, [learnerAverages]);

  const gradedCount = useMemo(() => Object.values(learnerAverages).filter(v => v !== null).length, [learnerAverages]);

  // Learners to show in preview (all or individual)
  const previewLearners = useMemo(() => {
    if (generateMode === 'individual') {
      const found = classLearners.find(l => l.id === Number(selectedIndividualId));
      return found ? [found] : [];
    }
    return classLearners;
  }, [generateMode, classLearners, selectedIndividualId]);

  // Active learner in preview (defaults to first)
  useEffect(() => {
    if (previewLearners.length > 0) setActiveLearnerId(previewLearners[0].id);
    else setActiveLearnerId(null);
  }, [previewLearners]);

  const activeLearner = useMemo(() => classLearners.find(l => l.id === activeLearnerId), [classLearners, activeLearnerId]);

  // Summary for active learner
  const activeSummary = useMemo(() => {
    if (!activeLearnerId || !activeLearner || !reportSummaries || !academicYear || !selectedTerm) return null;
    return reportSummaries.find(s =>
      (s.learnerId === activeLearnerId || s.learnerId === String(activeLearnerId) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) && s.academicYear === academicYear && s.term === selectedTerm
    );
  }, [activeLearnerId, activeLearner, reportSummaries, academicYear, selectedTerm]);

  // Populate form when learner/summary changes
  useEffect(() => {
    if (activeSummary) {
      setForm({
        attendancePresent: activeSummary.attendancePresent ?? '',
        attendanceTotal:   activeSummary.attendanceTotal   ?? '',
        conduct:           activeSummary.conduct            || '',
        attitude:          activeSummary.attitude           || '',
        teacherRemark:     activeSummary.teacherRemark      || '',
        headteacherRemark: activeSummary.headteacherRemark  || '',
        promotedTo:        activeSummary.promotedTo         || '',
        vacationDate:      schoolInfo?.vacationDate         || '',
        nextTermBegins:    activeSummary.nextTermBegins      || schoolInfo?.nextTermBegins || '',
        feesOwed:          activeSummary.feesOwed           || '',
        nextTermBill:      activeSummary.nextTermBill       || '',
      });
    } else {
      setForm(f => ({
        ...f,
        attendancePresent: '', attendanceTotal: '',
        conduct: '',           attitude: '',
        teacherRemark: '',     headteacherRemark: '',
        promotedTo: '',        feesOwed: '', nextTermBill: '',
        vacationDate:    schoolInfo?.vacationDate   || f.vacationDate,
        nextTermBegins:  schoolInfo?.nextTermBegins  || f.nextTermBegins,
      }));
    }
  }, [activeSummary, activeLearnerId, selectedTerm, schoolInfo]);

  // Active grades
  const activeGrades = useMemo(() => {
    if (!activeLearnerId || !activeLearner || !classSubjectList.length || !scores) return [];
    const ls = scores.filter(s => 
      (s.learnerId === activeLearnerId || s.learnerId === String(activeLearnerId) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) && 
      s.classId === Number(selectedClass) && 
      s.term === selectedTerm && 
      s.academicYear === academicYear
    );
    return classSubjectList.map(subj => {
      const rec  = ls.find(s => s.subjectId === subj.id);
      const hasCa = rec?.caScores && Array.isArray(rec.caScores) && rec.caScores.some(score => score !== undefined && score !== null && score !== '');
      const hasExam = rec?.examScore !== undefined && rec.examScore !== null && rec.examScore !== '';
      const ca = hasCa ? calculateCaTotal(rec.caScores, globalSettings) : null;
      const exam = hasExam ? calculateExamTotal(rec.examScore, globalSettings) : null;
      const total = (hasCa || hasExam) ? calculateTotal(ca || 0, exam || 0) : null;
      const { grade, remark } = getGrade(total, gradingScale);
      return { subjectName: subj.name, ca, exam, total, grade, remark };
    });
  }, [activeLearnerId, classSubjectList, scores, selectedClass, selectedTerm, academicYear, gradingScale, globalSettings]);

  // Can preview
  const canPreview = selectedClass && academicYear && selectedTerm && (generateMode === 'all' || selectedIndividualId);

  // Preview handler
  const handlePreview = () => {
    if (!canPreview) { alert('Please select a Class, Academic Year, and Term before previewing.'); return; }
    if (generateMode === 'all' && classLearners.length === 0) { alert('No students found in this class.'); return; }
    if (generateMode === 'individual' && !selectedIndividualId) { alert('Please select a student.'); return; }
    setView('preview');
  };

  // Auto-remark
  const handleAutoRemark = () => {
    const avg = learnerAverages[activeLearnerId];
    if (avg === null || avg === undefined) { alert('Please enter academic scores for this student first.'); return; }
    let t = '', h = '';
    if (avg >= 85)      { t = 'An exceptionally brilliant student with superb work ethics and high intellectual standards.'; h = 'Outstanding academic result. Keep up this excellent standard!'; }
    else if (avg >= 70) { t = 'A reliable and hardworking student who consistently delivers very good academic output.';        h = 'Very good performance. Keep focused and push for even greater heights.'; }
    else if (avg >= 55) { t = 'A satisfactory performance. Good comprehension shown but potential for much better results.';   h = 'Good result. Focus more on revision and practice to excel next term.'; }
    else if (avg >= 45) { t = 'Average effort. Frequently distracted. Needs to dedicate more time to academic work.';          h = 'Average result. Reduce distractions and put in stronger effort next term.'; }
    else               { t = 'Weak academic performance. Requires intensive support and remedial assistance.';                h = 'Poor result. Sit up, study daily, and seek help in challenging subjects.'; }
    setForm(f => ({ ...f, conduct: 'Excellent and respectful.', attitude: 'Attentive, diligent, and participative.', teacherRemark: t, headteacherRemark: h }));
  };

  // Save
  const handleSave = async (e) => {
    e?.preventDefault();
    if (isAdmin) { alert('Headteachers have view-only access.'); return; }
    if (!activeLearnerId || !selectedClass || !academicYear || !selectedTerm) { alert('Missing required fields.'); return; }
    setIsSaving(true);
    const resolvedLearnerId = activeLearner?.supabaseId || activeLearnerId;
    const avg = learnerAverages[activeLearnerId];
    const rank = learnerRankings[activeLearnerId];
    const record = {
      schoolId: user.schoolId, learnerId: resolvedLearnerId,
      classId: Number(selectedClass), academicYear, term: selectedTerm,
      attendancePresent: Number(form.attendancePresent) || 0,
      attendanceTotal:   Number(form.attendanceTotal)   || 0,
      conduct: form.conduct, attitude: form.attitude,
      teacherRemark: form.teacherRemark, headteacherRemark: form.headteacherRemark,
      promotedTo: form.promotedTo, nextTermBegins: form.nextTermBegins,
      feesOwed: form.feesOwed, nextTermBill: form.nextTermBill,
      isReleased: activeSummary?.isReleased || activeSummary?.is_released || false,
      classAverage: (avg !== undefined && avg !== null) ? Number(avg) : null,
      classRank: (rank !== undefined && rank !== null) ? Number(rank) : null,
      totalGraded: (gradedCount !== undefined && gradedCount !== null) ? Number(gradedCount) : 0,
      synced: false,
    };
    if (activeSummary) { record.id = activeSummary.id; record.supabaseId = activeSummary.supabaseId; }
    try {
      const savedId = await db.reportSummaries.put(record);
      
      // Mark as pending promotion locally
      await db.reportSummaries.update(savedId, { promotionStatus: 'pending' });

      // Run background sync loop which will automatically resolve UUIDs and enqueue the sync
      syncUnsyncedReportSummaries().catch(err => console.warn('Failed to sync after save:', err));

      alert('Report card saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Error saving. Please try again.');
    } finally { setIsSaving(false); }
  };

  // Execute Bulk Promotion (Admin only)
  const [isPromoting, setIsPromoting] = useState(false);
  const handleExecutePromotions = async () => {
    if (!isAdmin) return alert('Only headteachers can approve and execute promotions.');
    if (!navigator.onLine) return alert('You must be online to execute bulk promotions.');
    if (!selectedClass || !academicYear || selectedTerm !== 'Term 3') return alert('Invalid criteria for promotion.');
    
    if (!await window.confirm('Are you sure you want to approve and execute all pending promotions for this class? This will move students to their new classes or mark them as Alumni.')) return;
    
    setIsPromoting(true);
    try {
      const { error } = await supabase.rpc('execute_class_promotions', {
        p_school_id: user.schoolId,
        p_class_id: Number(selectedClass),
        p_academic_year: academicYear,
        p_term: selectedTerm
      });
      if (error) throw error;
      
      // Update local db report summaries status
      const localSummaries = await db.reportSummaries
        .filter(s => s.classId === Number(selectedClass) && s.academicYear === academicYear && s.term === selectedTerm)
        .toArray();
        
      for (const s of localSummaries) {
        if (s.promotedTo) {
          await db.reportSummaries.update(s.id, { promotionStatus: 'approved' });
          
          // Move local learner
          if (s.promotedTo === 'Alumni') {
            await db.learners.where('supabaseId').equals(s.learnerId).modify({ status: 'Alumni' });
          } else {
            await db.learners.where('supabaseId').equals(s.learnerId).modify({ currentClassId: Number(s.promotedTo) });
          }
        }
      }
      
      alert('Promotions approved and executed successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to execute promotions: ' + err.message);
    } finally {
      setIsPromoting(false);
    }
  };

  const [isReleasing, setIsReleasing] = useState(false);
  const handleReleaseClassReports = async (releaseStatus) => {
    if (!isAdmin) return alert('Only headteachers can release report cards.');
    if (!selectedClass || !academicYear || !selectedTerm) { alert('Missing class, term, or academic year settings.'); return; }

    const verb = releaseStatus ? 'release' : 'revoke release of';
    if (!await window.confirm(`Are you sure you want to ${verb} report cards for all students in this class?`)) return;

    setIsReleasing(true);
    try {
      const localSummaries = await db.reportSummaries
        .filter(s => s.classId === Number(selectedClass) && s.academicYear === academicYear && s.term === selectedTerm)
        .toArray();

      // Enqueue the bulk update in the sync engine outbox (resilient for online & offline)
      await enqueueSync('update', 'report_summaries', {
        filter: {
          school_id: user.schoolId,
          class_id: Number(selectedClass),
          academic_year: academicYear,
          term: selectedTerm
        },
        data: {
          is_released: releaseStatus,
          updated_at: new Date().toISOString()
        }
      }, user.schoolId);

      // Proactively update local db records to match
      for (const s of localSummaries) {
        await db.reportSummaries.update(s.id, { isReleased: releaseStatus, synced: false });
      }

      // Also trigger a background sync run to ensure any previously unsynced local summaries are created
      syncUnsyncedReportSummaries().catch(err => console.warn('Failed to run summary sync:', err));

      alert(`Report cards successfully ${releaseStatus ? 'released' : 'revoked'} for all students in this class!`);
    } catch (err) {
      console.error(err);
      alert(`Failed to update release status: ` + err.message);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleReleaseIndividualReport = async (releaseStatus) => {
    if (!isAdmin) return alert('Only headteachers can release report cards.');
    if (!activeLearnerId) { alert('No student selected.'); return; }

    setIsReleasing(true);
    try {
      const resolvedLearnerId = activeLearner?.supabaseId || activeLearnerId;
      
      let summary = await db.reportSummaries
        .filter(s =>
          (s.learnerId === activeLearnerId || s.learnerId === String(activeLearnerId) || (activeLearner.supabaseId && s.learnerId === activeLearner.supabaseId)) &&
          s.academicYear === academicYear &&
          s.term === selectedTerm
        )
        .first();

      const avg = learnerAverages[activeLearnerId];
      const rank = learnerRankings[activeLearnerId];

      if (!summary) {
        summary = {
          schoolId: user.schoolId,
          learnerId: resolvedLearnerId,
          classId: Number(selectedClass),
          academicYear,
          term: selectedTerm,
          attendancePresent: 0,
          attendanceTotal: 0,
          conduct: '—',
          attitude: '—',
          teacherRemark: '—',
          headteacherRemark: '—',
          isReleased: releaseStatus,
          classAverage: (avg !== undefined && avg !== null) ? Number(avg) : null,
          classRank: (rank !== undefined && rank !== null) ? Number(rank) : null,
          totalGraded: (gradedCount !== undefined && gradedCount !== null) ? Number(gradedCount) : 0,
          synced: false
        };
        const newId = await db.reportSummaries.add(summary);
        summary.id = newId;
      } else {
        await db.reportSummaries.update(summary.id, { 
          isReleased: releaseStatus, 
          classAverage: (avg !== undefined && avg !== null) ? Number(avg) : (summary.classAverage || null),
          classRank: (rank !== undefined && rank !== null) ? Number(rank) : (summary.classRank || null),
          totalGraded: (gradedCount !== undefined && gradedCount !== null) ? Number(gradedCount) : (summary.totalGraded || 0),
          synced: false 
        });
      }

      // Run background sync loop which will automatically resolve UUIDs and enqueue the sync
      syncUnsyncedReportSummaries().catch(err => console.warn('Failed to sync after release:', err));

      alert(`Report card successfully ${releaseStatus ? 'released' : 'revoked'} for ${activeLearner.fullName}!`);
    } catch (err) {
      console.error(err);
      alert(`Failed to update release status: ` + err.message);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleBulkDispatch = async (releaseStatus) => {
    if (!isAdmin) return alert('Only headteachers can dispatch report cards.');
    if (!selectedClass || !academicYear || !selectedTerm) {
      alert('Please select a Class, Term, and Academic Year first.');
      return;
    }

    const verb = releaseStatus ? 'dispatch' : 'revoke dispatch of';
    if (!await window.confirm(`Are you sure you want to ${verb} report cards for all students in this class?`)) return;

    setIsDispatching(true);
    try {
      let dispatchedCount = 0;
      let notificationCount = 0;

      for (const l of classLearners) {
        const resolvedLearnerId = l.supabaseId || l.id;
        const avg = learnerAverages[l.id];
        const rank = learnerRankings[l.id];

        // Find existing summary
        let summary = await db.reportSummaries
          .filter(s =>
            (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId)) &&
            s.academicYear === academicYear &&
            s.term === selectedTerm
          )
          .first();

        const record = {
          schoolId: user.schoolId,
          learnerId: resolvedLearnerId,
          classId: Number(selectedClass),
          academicYear,
          term: selectedTerm,
          isReleased: releaseStatus,
          classAverage: (avg !== undefined && avg !== null) ? Number(avg) : null,
          classRank: (rank !== undefined && rank !== null) ? Number(rank) : null,
          totalGraded: (gradedCount !== undefined && gradedCount !== null) ? Number(gradedCount) : 0,
          synced: false
        };

        if (!summary) {
          // Create new base summary record
          record.attendancePresent = 0;
          record.attendanceTotal = 0;
          record.conduct = '—';
          record.attitude = '—';
          record.teacherRemark = '—';
          record.headteacherRemark = '—';
          await db.reportSummaries.add(record);
        } else {
          // Update existing summary
          await db.reportSummaries.update(summary.id, {
            isReleased: releaseStatus,
            classAverage: (avg !== undefined && avg !== null) ? Number(avg) : (summary.classAverage || null),
            classRank: (rank !== undefined && rank !== null) ? Number(rank) : (summary.classRank || null),
            totalGraded: (gradedCount !== undefined && gradedCount !== null) ? Number(gradedCount) : (summary.totalGraded || 0),
            synced: false
          });
        }
        dispatchedCount++;

        // Send parent notification only if dispatching (releaseStatus = true)
        if (releaseStatus) {
          const parentPhone = l.guardianContact1 || l.guardianContact2;
          if (parentPhone) {
            const cleanPhoneVal = parentPhone.replace(/[\s\-\+\(\)]/g, '');
            const now = new Date().toISOString();
            
            // Add notification locally
            await db.notifications.add({
              schoolId: user.schoolId,
              parentPhone: cleanPhoneVal,
              title: "Academic Report Dispatched",
              content: `The terminal report card for ${l.fullName} for ${selectedTerm} (${academicYear}) has been dispatched and is now available in your portal.`,
              created_at: now,
              isRead: false
            });

            // Sync notification to Supabase if online
            if (navigator.onLine) {
              try {
                await supabase.from('report_notifications').insert({
                  school_id: user.schoolId,
                  parent_phone: cleanPhoneVal,
                  title: "Academic Report Dispatched",
                  content: `The terminal report card for ${l.fullName} for ${selectedTerm} (${academicYear}) has been dispatched and is now available in your portal.`,
                  created_at: now,
                  is_read: false
                });
              } catch (err) {
                console.warn('Failed to sync direct notification to Supabase:', err);
              }
            }
            notificationCount++;
          }
        }
      }

      // Proactively trigger a sync run
      syncUnsyncedReportSummaries().catch(err => console.warn('Failed to run summary sync after bulk dispatch:', err));

      alert(`Successfully ${releaseStatus ? 'dispatched' : 'revoked'} ${dispatchedCount} report cards! ${releaseStatus ? `Sent ${notificationCount} parent alerts.` : ''}`);
    } catch (err) {
      console.error(err);
      alert('Error updating report cards distribution: ' + err.message);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleSaveInlineHeadteacherRemark = async (learnerId, summary) => {
    setIsSavingRemark(true);
    try {
      const resolvedLearnerId = classLearners.find(l => l.id === learnerId)?.supabaseId || learnerId;
      const avg = learnerAverages[learnerId];
      const rank = learnerRankings[learnerId];

      const record = {
        schoolId: user.schoolId,
        learnerId: resolvedLearnerId,
        classId: Number(selectedClass),
        academicYear,
        term: selectedTerm,
        headteacherRemark: inlineHeadteacherRemark,
        synced: false
      };

      if (!summary) {
        record.attendancePresent = 0;
        record.attendanceTotal = 0;
        record.conduct = '—';
        record.attitude = '—';
        record.teacherRemark = '—';
        record.isReleased = false;
        record.classAverage = (avg !== undefined && avg !== null) ? Number(avg) : null;
        record.classRank = (rank !== undefined && rank !== null) ? Number(rank) : null;
        record.totalGraded = (gradedCount !== undefined && gradedCount !== null) ? Number(gradedCount) : 0;
        await db.reportSummaries.add(record);
      } else {
        await db.reportSummaries.update(summary.id, {
          headteacherRemark: inlineHeadteacherRemark,
          synced: false
        });
      }

      syncUnsyncedReportSummaries().catch(err => console.warn('Sync warning:', err));
      setEditingRemarkId(null);
      alert('Headteacher remark updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update remark: ' + err.message);
    } finally {
      setIsSavingRemark(false);
    }
  };


  // ── Render report card ─────────────────────────────────────────────────────
  const renderCard = (learner) => {
    const lId     = learner.id;
    const summary = reportSummaries?.find(s => 
      (s.learnerId === lId || s.learnerId === String(lId) || (learner.supabaseId && s.learnerId === learner.supabaseId)) && 
      s.academicYear === academicYear && 
      s.term === selectedTerm
    );
    const isActive = lId === activeLearnerId;
    const avg     = learnerAverages[lId];
    const rank    = learnerRankings[lId];

    const grades = (() => {
      if (!scores || !classSubjectList.length) return [];
      const ls = scores.filter(s => 
        (s.learnerId === lId || s.learnerId === String(lId) || (learner.supabaseId && s.learnerId === learner.supabaseId)) && 
        s.classId === Number(selectedClass) && 
        s.term === selectedTerm && 
        s.academicYear === academicYear
      );
      return classSubjectList.map(subj => {
        const rec   = ls.find(s => s.subjectId === subj.id);
        const hasCa = rec?.caScores && Array.isArray(rec.caScores) && rec.caScores.some(score => score !== undefined && score !== null && score !== '');
        const hasExam = rec?.examScore !== undefined && rec.examScore !== null && rec.examScore !== '';
        const ca = hasCa ? calculateCaTotal(rec.caScores, globalSettings) : null;
        const exam = hasExam ? calculateExamTotal(rec.examScore, globalSettings) : null;
        const total = (hasCa || hasExam) ? calculateTotal(ca || 0, exam || 0) : null;
        const { grade, remark } = getGrade(total, gradingScale);
        return { subjectName: subj.name, ca, exam, total, grade, remark };
      });
    })();

    // Use form values only for the actively-selected learner; else use saved summary
    const conduct   = isActive ? (form.conduct           || summary?.conduct           || '—') : (summary?.conduct           || '—');
    const attitude  = isActive ? (form.attitude          || summary?.attitude          || '—') : (summary?.attitude          || '—');
    const tRemark   = isActive ? (form.teacherRemark     || summary?.teacherRemark     || '—') : (summary?.teacherRemark     || '—');
    const hRemark   = isActive ? (form.headteacherRemark || summary?.headteacherRemark || '—') : (summary?.headteacherRemark || '—');
    const attP      = isActive ? (form.attendancePresent ?? summary?.attendancePresent ?? '—') : (summary?.attendancePresent ?? '—');
    const attT      = isActive ? (form.attendanceTotal   ?? summary?.attendanceTotal   ?? '—') : (summary?.attendanceTotal   ?? '—');
    const vDate     = form.vacationDate   || schoolInfo?.vacationDate || '—';
    const nDate     = (isActive ? form.nextTermBegins : null) || summary?.nextTermBegins || form.nextTermBegins || schoolInfo?.nextTermBegins || '—';
    const promoted  = isActive ? (form.promotedTo || summary?.promotedTo || '') : (summary?.promotedTo || '');
    const fees      = isActive ? (form.feesOwed || summary?.feesOwed || '') : (summary?.feesOwed || '');
    const bill      = (isActive ? form.nextTermBill : null) || summary?.nextTermBill || form.nextTermBill || '';

    const getPromotedClassName = (promVal) => {
      if (!promVal) return '';
      if (promVal === 'Alumni') return 'Alumni (Graduated)';
      const cls = classes?.find(c => c.id === Number(promVal));
      return cls ? cls.name : `Class ${promVal}`;
    };

    const isReleased = summary && (summary.isReleased || summary.is_released);

    return (
      <div className="rc-canvas" style={{ paddingTop: isAdmin ? '3.5rem' : undefined }}>
        {isAdmin && (
          <div className="no-print" style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            background: isReleased ? '#0d9488' : '#f59e0b',
            color: '#fff',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '0.45rem 1rem',
            borderTopLeftRadius: '14px',
            borderTopRightRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>
              <i className={`fas ${isReleased ? 'fa-check-circle' : 'fa-info-circle'}`} style={{ marginRight: '6px' }} />
              {isReleased ? 'Released to Sibling Parent Portal' : 'Draft - Pending Headteacher Release'}
            </span>
            <span style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
              {isReleased ? 'Published' : 'Hidden'}
            </span>
          </div>
        )}
        {/* Header */}
        <div className="rc-canvas-header">
          {schoolInfo?.logoUrl
            ? <img src={schoolInfo.logoUrl} alt="logo" className="rc-school-logo" />
            : <div className="rc-school-logo-ph"><i className="fas fa-school" /></div>}
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.4px' }}>
              {schoolInfo?.name || 'Labour Edu Academy'}
            </h1>
            {schoolInfo?.motto && (
              <p style={{ margin: '2px 0 0', fontStyle: 'italic', fontSize: '0.7rem', color: '#b45309', fontWeight: 600 }}>
                &ldquo;{schoolInfo.motto}&rdquo;
              </p>
            )}
            <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#64748b' }}>
              {[schoolInfo?.location, schoolInfo?.district, schoolInfo?.region].filter(Boolean).join(' • ')}
            </p>
          </div>
          <LearnerPhoto
            photo={learner.photo || learner.photoUrl || null}
            alt={learner.fullName}
            gender={learner.gender}
            className="rc-student-photo"
          />
        </div>

        {/* Title row + KPIs */}
        <div className="rc-title-row">
          <span className="rc-doc-badge">Terminal Report Card</span>
          <div className="rc-kpis">
            <div className="rc-kpi" style={{ background: '#f0fdfa', border: '2px solid #0d9488' }}>
              <span className="rc-kpi-lbl" style={{ color: '#0d9488' }}>Avg</span>
              <span className="rc-kpi-val">{avg !== null && avg !== undefined ? `${avg}%` : '—'}</span>
            </div>
            <div className="rc-kpi" style={{ background: '#fdf2f8', border: '2px solid #db2777' }}>
              <span className="rc-kpi-lbl" style={{ color: '#db2777' }}>Rank</span>
              <span className="rc-kpi-val">{ordinal(rank)}</span>
            </div>
            <div className="rc-kpi" style={{ background: '#fefce8', border: '2px solid #ca8a04' }}>
              <span className="rc-kpi-lbl" style={{ color: '#ca8a04' }}>Of</span>
              <span className="rc-kpi-val">{gradedCount}</span>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="rc-bio-grid">
          <div className="rc-bio-item"><strong>Name:</strong>{learner.fullName}</div>
          <div className="rc-bio-item"><strong>Reg No:</strong>{learner.regNumber || '—'}</div>
          <div className="rc-bio-item"><strong>Gender:</strong>{learner.gender || '—'}</div>
          <div className="rc-bio-item"><strong>Class:</strong>{selectedClassInfo?.name || '—'}</div>
          <div className="rc-bio-item"><strong>Academic Year:</strong>{academicYear || '—'}</div>
          <div className="rc-bio-item"><strong>Term:</strong>{selectedTerm}</div>
        </div>

        {/* Grades table */}
        {grades.length > 0 ? (
          <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th className="c">CA</th>
                  <th className="c">Exam</th>
                  <th className="c">Total</th>
                  <th className="c">Grade</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g, i) => {
                  const gc = gradeColor(g.grade);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{g.subjectName}</td>
                      <td className="c">{g.ca !== null ? Number(g.ca).toFixed(1) : '—'}</td>
                      <td className="c">{g.exam !== null ? Number(g.exam).toFixed(1) : '—'}</td>
                      <td className="c" style={{ fontWeight: 700, color: '#0f172a' }}>{g.total !== null ? Number(g.total).toFixed(1) : '—'}</td>
                      <td className="c"><span className="rc-gbadge" style={{ background: gc.bg, color: gc.text }}>{g.grade}</span></td>
                      <td style={{ color: gc.text, fontWeight: 600 }}>{g.remark}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed #e2e8f0', borderRadius: '10px', color: '#94a3b8', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
            No subjects linked to this class yet.
          </div>
        )}

        {/* ── Compact Bottom Grid ── */}
        <div className="rc-bottom-grid">
          {/* Legend */}
          <div className="rc-sbox rc-legend-sbox">
            <h4>Grading Scale</h4>
            <div className="rc-legend-content">
              {gradingScale.map((s, i) => (
                <span key={i} className="rc-legend-item">
                  <strong>{s.grade}</strong> ({s.min}–{s.max}%)
                </span>
              ))}
            </div>
          </div>

          {/* Conduct + Next term */}
          <div className="rc-sbox">
            <h4>Conduct &amp; Attendance</h4>
            <p><strong>Attendance:</strong> {attP} of {attT} days</p>
            <p><strong>Conduct:</strong> {conduct}</p>
            <p><strong>Attitude:</strong> {attitude}</p>
          </div>

          <div className="rc-sbox">
            <h4>Next Term &amp; Financials</h4>
            <p><strong>Vacation Date:</strong> {vDate}</p>
            <p><strong>Resumes:</strong> {nDate}</p>
            {promoted && (
              <p style={{ color: '#0d9488', fontWeight: 'bold', marginTop: '4px' }}>
                <i className="fas fa-trophy" style={{ marginRight: '4px' }}></i>
                Decision: Promoted to {getPromotedClassName(promoted)}
              </p>
            )}
            {(fees || bill) && (
              <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
                {bill && <p><strong>Next Term Bill:</strong> {bill}</p>}
                {fees && <p><strong>Previous Arrears:</strong> {fees}</p>}
              </div>
            )}
          </div>

          {/* Remarks */}
          <div className="rc-sbox rc-remarks-box">
            <h4>Advisory Remarks</h4>
            <p><strong>Class Advisor:</strong> {tRemark}</p>
            {hRemark && hRemark !== '—' && hRemark.trim() !== '' && (
              <p><strong>Headteacher:</strong> {hRemark}</p>
            )}
          </div>
        </div>

        {/* Signatures */}
        <div className="rc-sig-strip">
          <div className="rc-sig-block"><div className="rc-sig-line" />Class Advisor's Signature</div>
          <div className="rc-sig-block"><div className="rc-sig-line" />School Stamp &amp; Date</div>
          <div className="rc-sig-block"><div className="rc-sig-line" />Headteacher's Signature</div>
        </div>
      </div>
    );
  };

  // ── Access guard ──────────────────────────────────────────────────────────
  if (advisedClasses.length === 0 && classes !== undefined) {
    return (
      <Layout title="Report Cards">
        <div style={{ textAlign: 'center', padding: '5rem 2rem', background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', maxWidth: '580px', margin: '2rem auto', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ width: '76px', height: '76px', borderRadius: '50%', background: 'rgba(239,68,68,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', marginBottom: '1.5rem' }}>
            <i className="fas fa-file-shield" style={{ fontSize: '2.25rem' }} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: '0 0 0.5rem' }}>No Class Assigned</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            You haven't been assigned as a Class Advisor. Only class advisors can compile and print terminal reports.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.7rem 1.25rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-info-circle" style={{ color: 'var(--accent)' }} />
            Contact the Headteacher to get assigned in School Setup.
          </div>
        </div>
      </Layout>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <Layout title="Report Cards">
      <style>{STYLES}</style>

      <div className="rc-page">

        {/* ── Page Header ── */}
        <div className="rc-page-header no-print">
          <div>
            <h1 className="rc-page-title">
              <span className="rc-page-title-icon"><i className="fas fa-id-card-alt" /></span>
              Report Cards
            </h1>
            <p className="rc-page-subtitle">Generate printable academic report cards for learners.</p>
          </div>
          {academicYear && selectedTerm && (
            <span className="rc-term-badge">
              <i className="fas fa-calendar-alt" />
              {academicYear} &bull; {selectedTerm}
            </span>
          )}
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/*  CONFIG SCREEN                                 */}
        {/* ══════════════════════════════════════════════ */}
        {view === 'config' && (
          <div>
            {/* Tabs Selector for Admins */}
            {isAdmin && (
              <div className="rc-tabs no-print">
                <button
                  type="button"
                  className={`rc-tab-btn ${activeTab === 'compiler' ? 'active' : ''}`}
                  onClick={() => setActiveTab('compiler')}
                >
                  <i className="fas fa-edit" /> Report Compiler & Preview
                </button>
                <button
                  type="button"
                  className={`rc-tab-btn ${activeTab === 'distribution' ? 'active' : ''}`}
                  onClick={() => setActiveTab('distribution')}
                >
                  <i className="fas fa-paper-plane" /> Parents Distribution Center
                </button>
              </div>
            )}

            {(!isAdmin || activeTab === 'compiler') ? (
              <div className="rc-config-card no-print">
                {/* Filter row */}
                <div className="rc-filter-row">
                  {/* CLASS */}
                  <div className="rc-filter-field">
                    <span className="rc-filter-label">Class</span>
                    <select
                      className="form-input"
                      value={selectedClass}
                      onChange={e => { setSelectedClass(e.target.value); setSelectedIndividualId(''); }}
                    >
                      <option value="">Select Class</option>
                      {advisedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* TERM */}
                  <div className="rc-filter-field">
                    <span className="rc-filter-label">Term</span>
                    <select className="form-input" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                      <option value="Term 1">Term 1</option>
                      <option value="Term 2">Term 2</option>
                      <option value="Term 3">Term 3</option>
                    </select>
                  </div>

                  {/* YEAR */}
                  <div className="rc-filter-field">
                    <span className="rc-filter-label">Year</span>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 2025/2026"
                      value={academicYear}
                      onChange={e => setAcademicYear(e.target.value)}
                    />
                  </div>
                </div>

                {/* Generate For */}
                <div className="rc-gen-section">
                  <div className="rc-gen-label">Generate For</div>
                  <div className="rc-gen-row">
                    <button
                      type="button"
                      className={`rc-gen-btn ${generateMode === 'all' ? 'active' : ''}`}
                      onClick={() => { setGenerateMode('all'); setSelectedIndividualId(''); }}
                    >
                      <i className="fas fa-users" /> All Learners
                    </button>
                    <button
                      type="button"
                      className={`rc-gen-btn ${generateMode === 'individual' ? 'active' : ''}`}
                      onClick={() => setGenerateMode('individual')}
                    >
                      <i className="fas fa-user" /> Individual
                    </button>
                  </div>

                  {/* Individual picker */}
                  {generateMode === 'individual' && (
                    <div className="rc-individual-row">
                      <span className="rc-filter-label">Select Student</span>
                      <select
                        className="form-input"
                        value={selectedIndividualId}
                        onChange={e => setSelectedIndividualId(e.target.value)}
                      >
                        <option value="">— Choose Student —</option>
                        {classLearners.map(l => <option key={l.id} value={l.id}>{l.fullName}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Preview button */}
                <button
                  type="button"
                  className="rc-preview-btn"
                  onClick={handlePreview}
                  disabled={!canPreview}
                >
                  <i className="fas fa-eye" />
                  Preview Report Cards
                </button>

                {/* Promotions logic moved to Promotions page */}
              </div>
            ) : (
              <div className="no-print">
                {/* Filter row inside Distribution Card */}
                <div className="rc-config-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                  <div className="rc-filter-row" style={{ marginBottom: 0 }}>
                    {/* CLASS */}
                    <div className="rc-filter-field">
                      <span className="rc-filter-label">Select Class to Distribute</span>
                      <select
                        className="form-input"
                        value={selectedClass}
                        onChange={e => { setSelectedClass(e.target.value); setSelectedIndividualId(''); }}
                      >
                        <option value="">Select Class</option>
                        {advisedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {/* TERM */}
                    <div className="rc-filter-field">
                      <span className="rc-filter-label">Term</span>
                      <select className="form-input" value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                        <option value="Term 1">Term 1</option>
                        <option value="Term 2">Term 2</option>
                        <option value="Term 3">Term 3</option>
                      </select>
                    </div>

                    {/* YEAR */}
                    <div className="rc-filter-field">
                      <span className="rc-filter-label">Year</span>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 2025/2026"
                        value={academicYear}
                        onChange={e => setAcademicYear(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {(!selectedClass || !academicYear || !selectedTerm) ? (
                  <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                    <i className="fas fa-paper-plane" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', marginBottom: '1rem' }} />
                    <h3 style={{ color: 'var(--primary)', margin: '0 0 0.5rem' }}>Select Class Parameters</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', margin: 0 }}>
                      Please select a Class, Term, and Academic Year above to access the distribution logs and tools.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Metrics Grid */}
                    {(() => {
                      const summariesInClass = reportSummaries?.filter(s =>
                        Number(s.classId) === Number(selectedClass) &&
                        s.academicYear === academicYear &&
                        s.term === selectedTerm
                      ) || [];
                      const releasedCount = summariesInClass.filter(s => s.isReleased || s.is_released).length;
                      const draftCount = classLearners.length - releasedCount;
                      const parentViewedCount = summariesInClass.filter(s => (s.isReleased || s.is_released) && s.parentViewedAt).length;
                      const parentReadRate = releasedCount > 0 ? Math.round((parentViewedCount / releasedCount) * 100) : 0;

                      // Quality audit counts
                      let missingScoresCount = 0;
                      let missingTeacherRemarksCount = 0;
                      let missingHeadteacherRemarksCount = 0;

                      classLearners.forEach(l => {
                        const hasScore = learnerAverages[l.id] !== null && learnerAverages[l.id] !== undefined;
                        if (!hasScore) missingScoresCount++;

                        const summary = summariesInClass.find(s =>
                          (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId))
                        );
                        if (!summary || !summary.teacherRemark || summary.teacherRemark === '—' || summary.teacherRemark.trim() === '') {
                          missingTeacherRemarksCount++;
                        }
                        if (!summary || !summary.headteacherRemark || summary.headteacherRemark === '—' || summary.headteacherRemark.trim() === '') {
                          missingHeadteacherRemarksCount++;
                        }
                      });

                      const hasQualityWarning = missingScoresCount > 0 || missingTeacherRemarksCount > 0 || missingHeadteacherRemarksCount > 0;

                      return (
                        <>
                          <div className="rc-dist-metrics">
                            <div className="rc-dist-card">
                              <div className="rc-dist-card-icon" style={{ background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' }}>
                                <i className="fas fa-users" />
                              </div>
                              <div className="rc-dist-card-details">
                                <h4>Class Enrollment</h4>
                                <p>{classLearners.length} Students</p>
                              </div>
                            </div>
                            <div className="rc-dist-card">
                              <div className="rc-dist-card-icon" style={{ background: 'rgba(13, 148, 136, 0.08)', color: '#0d9488' }}>
                                <i className="fas fa-check-circle" />
                              </div>
                              <div className="rc-dist-card-details">
                                <h4>Dispatched Portals</h4>
                                <p>{releasedCount} Dispatched</p>
                              </div>
                            </div>
                            <div className="rc-dist-card">
                              <div className="rc-dist-card-icon" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b' }}>
                                <i className="fas fa-file-signature" />
                              </div>
                              <div className="rc-dist-card-details">
                                <h4>Drafts Remaining</h4>
                                <p>{draftCount} Pending</p>
                              </div>
                            </div>
                            <div className="rc-dist-card">
                              <div className="rc-dist-card-icon" style={{ background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6' }}>
                                <i className="fas fa-eye" />
                              </div>
                              <div className="rc-dist-card-details">
                                <h4>Parent Open Rate</h4>
                                <p>{parentReadRate}% Opened</p>
                              </div>
                            </div>
                          </div>

                          {/* Quality audit warning banner */}
                          {hasQualityWarning && (
                            <div className="rc-quality-checklist">
                              <i className="fas fa-exclamation-triangle" />
                              <div>
                                <h4>Pre-dispatch Quality Audit Warning</h4>
                                <p>
                                  We detected some incomplete records:
                                  {missingScoresCount > 0 && <span> • <strong>{missingScoresCount} students</strong> have no scores recorded yet.</span>}
                                  {missingTeacherRemarksCount > 0 && <span> • <strong>{missingTeacherRemarksCount} reports</strong> have missing class advisor remarks.</span>}
                                  {missingHeadteacherRemarksCount > 0 && <span> • <strong>{missingHeadteacherRemarksCount} reports</strong> are missing headteacher endorsements.</span>}
                                </p>
                                <p style={{ marginTop: '4px', fontSize: '0.75rem', opacity: 0.9 }}>
                                  Review these records below or compile them in the Report Compiler tab before dispatching to parents portal.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Bulk Actions Panel */}
                          <div className="rc-dist-actions-panel">
                            <div className="rc-dist-actions-info">
                              <h3>Dispatch Control Panel</h3>
                              <p>Publish report cards for the entire class to parents portals instantly.</p>
                            </div>
                            <div className="rc-dist-btns">
                              <button
                                type="button"
                                className="btn-dispatch"
                                onClick={() => handleBulkDispatch(true)}
                                disabled={isDispatching}
                              >
                                {isDispatching ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-share-square" />}
                                Dispatch All to Parent Portals
                              </button>
                              <button
                                type="button"
                                className="btn-revoke-dispatch"
                                onClick={() => handleBulkDispatch(false)}
                                disabled={isDispatching}
                              >
                                {isDispatching ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-undo-alt" />}
                                Revoke Class Dispatch
                              </button>
                            </div>
                          </div>

                          {/* Student Audit List Table */}
                          <div className="rc-dist-table-card">
                            <div className="rc-dist-table-header">
                              <h3>Class Portal Audit Logs</h3>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                Academic Year: {academicYear} &bull; {selectedTerm}
                              </span>
                            </div>
                            <div className="rc-dist-table-wrap">
                              <table className="rc-dist-table">
                                <thead>
                                  <tr>
                                    <th>Student</th>
                                    <th>Grading Status</th>
                                    <th>Remarks Audit</th>
                                    <th>Headteacher Remark (Inline Edit)</th>
                                    <th>Portal Status</th>
                                    <th>Parent Activity</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {classLearners.map(l => {
                                    const summary = summariesInClass.find(s =>
                                      (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId))
                                    );
                                    const isReleased = summary && (summary.isReleased || summary.is_released);

                                    // Grading progress
                                    const studentScores = scores.filter(s =>
                                      (s.learnerId === l.id || s.learnerId === String(l.id) || (l.supabaseId && s.learnerId === l.supabaseId)) &&
                                      s.classId === Number(selectedClass) &&
                                      s.term === selectedTerm &&
                                      s.academicYear === academicYear
                                    );
                                    const subjectsGraded = studentScores.length;
                                    const totalClassSubjects = classSubjectList.length;
                                    const isFullyGraded = totalClassSubjects > 0 && subjectsGraded === totalClassSubjects;

                                    // Remarks status
                                    const hasTeacherRemark = summary && summary.teacherRemark && summary.teacherRemark !== '—' && summary.teacherRemark.trim() !== '';
                                    const hasHeadteacherRemark = summary && summary.headteacherRemark && summary.headteacherRemark !== '—' && summary.headteacherRemark.trim() !== '';

                                    return (
                                      <tr key={l.id}>
                                        <td>
                                          <div className="rc-student-cell">
                                            <LearnerPhoto
                                              photo={l.photo || l.photoUrl || null}
                                              alt={l.fullName}
                                              gender={l.gender}
                                              className="rc-student-cell-photo"
                                            />
                                            <div>
                                              <div className="rc-student-name">{l.fullName}</div>
                                              <div className="rc-student-reg">{l.regNumber || 'No Reg No'}</div>
                                            </div>
                                          </div>
                                        </td>
                                        <td>
                                          <span style={{
                                            fontWeight: 700,
                                            color: isFullyGraded ? '#0d9488' : '#e11d48'
                                          }}>
                                            {subjectsGraded}/{totalClassSubjects} Graded
                                          </span>
                                        </td>
                                        <td>
                                          <div style={{ display: 'flex', gap: '8px', fontSize: '0.85rem' }}>
                                            <span title="Advisor Remark" style={{ color: hasTeacherRemark ? '#0d9488' : '#94a3b8' }}>
                                              <i className={`fas ${hasTeacherRemark ? 'fa-user-tie' : 'fa-user-tie'}`} /> {hasTeacherRemark ? '✓' : '✗'}
                                            </span>
                                            <span title="Headteacher Remark" style={{ color: hasHeadteacherRemark ? '#8b5cf6' : '#94a3b8' }}>
                                              <i className={`fas ${hasHeadteacherRemark ? 'fa-user-graduate' : 'fa-user-graduate'}`} /> {hasHeadteacherRemark ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        </td>
                                        <td>
                                          {editingRemarkId === l.id ? (
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                              <textarea
                                                className="form-input"
                                                rows={1}
                                                style={{ fontSize: '0.78rem', padding: '4px 8px', resize: 'none', flex: 1, minWidth: '180px' }}
                                                value={inlineHeadteacherRemark}
                                                onChange={e => setInlineHeadteacherRemark(e.target.value)}
                                              />
                                              <button
                                                type="button"
                                                className="btn-save-remark-inline"
                                                onClick={() => handleSaveInlineHeadteacherRemark(l.id, summary)}
                                                disabled={isSavingRemark}
                                                title="Save Remark"
                                              >
                                                {isSavingRemark ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
                                              </button>
                                              <button
                                                type="button"
                                                className="btn-save-remark-inline"
                                                style={{ background: '#64748b' }}
                                                onClick={() => setEditingRemarkId(null)}
                                                title="Cancel"
                                              >
                                                <i className="fas fa-times" />
                                              </button>
                                            </div>
                                          ) : (
                                            <div
                                              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: hasHeadteacherRemark ? 'var(--text)' : 'var(--text-muted)' }}
                                              onClick={() => {
                                                setEditingRemarkId(l.id);
                                                setInlineHeadteacherRemark(summary?.headteacherRemark || '');
                                              }}
                                              title="Click to Edit Inline"
                                            >
                                              <span style={{ fontSize: '0.78rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                {summary?.headteacherRemark || 'No Headteacher Remark. Click to add.'}
                                              </span>
                                              <i className="fas fa-pen" style={{ fontSize: '0.65rem', color: 'var(--accent)' }} />
                                            </div>
                                          )}
                                        </td>
                                        <td>
                                          <span className={isReleased ? 'rc-badge-published' : 'rc-badge-draft'}>
                                            <i className={`fas ${isReleased ? 'fa-paper-plane' : 'fa-file'}`} />
                                            {isReleased ? 'Published' : 'Draft'}
                                          </span>
                                        </td>
                                        <td>
                                          {summary && summary.parentViewedAt ? (
                                            <span className="rc-viewed-badge" title={`Opened at ${new Date(summary.parentViewedAt).toLocaleString()}`}>
                                              <i className="fas fa-eye" />
                                              Viewed
                                            </span>
                                          ) : (
                                            <span className="rc-unread-badge">
                                              <i className="fas fa-eye-slash" />
                                              Unopened
                                            </span>
                                          )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                                            <button
                                              type="button"
                                              className="btn"
                                              style={{
                                                padding: '4px 8px', fontSize: '0.72rem', background: isReleased ? '#dc2626' : '#0d9488', color: 'white', fontWeight: 'bold'
                                              }}
                                              onClick={async () => {
                                                setIsReleasing(true);
                                                try {
                                                  const resolvedLearnerId = l.supabaseId || l.id;
                                                  const isRel = !isReleased;

                                                  if (!summary) {
                                                    await db.reportSummaries.add({
                                                      schoolId: user.schoolId,
                                                      learnerId: resolvedLearnerId,
                                                      classId: Number(selectedClass),
                                                      academicYear,
                                                      term: selectedTerm,
                                                      attendancePresent: 0,
                                                      attendanceTotal: 0,
                                                      conduct: '—',
                                                      attitude: '—',
                                                      teacherRemark: '—',
                                                      headteacherRemark: '—',
                                                      isReleased: isRel,
                                                      classAverage: (learnerAverages[l.id] !== undefined && learnerAverages[l.id] !== null) ? Number(learnerAverages[l.id]) : null,
                                                      classRank: (learnerRankings[l.id] !== undefined && learnerRankings[l.id] !== null) ? Number(learnerRankings[l.id]) : null,
                                                      totalGraded: (gradedCount !== undefined && gradedCount !== null) ? Number(gradedCount) : 0,
                                                      synced: false
                                                    });
                                                  } else {
                                                    await db.reportSummaries.update(summary.id, {
                                                      isReleased: isRel,
                                                      synced: false
                                                    });
                                                  }

                                                  // Send direct parent notification if publishing
                                                  if (isRel) {
                                                    const parentPhone = l.guardianContact1 || l.guardianContact2;
                                                    if (parentPhone) {
                                                      const cleanPhoneVal = parentPhone.replace(/[\s\-\+\(\)]/g, '');
                                                      const now = new Date().toISOString();
                                                      await db.notifications.add({
                                                        schoolId: user.schoolId,
                                                        parentPhone: cleanPhoneVal,
                                                        title: "Academic Report Dispatched",
                                                        content: `The terminal report card for ${l.fullName} for ${selectedTerm} (${academicYear}) has been dispatched and is now available in your portal.`,
                                                        created_at: now,
                                                        isRead: false
                                                      });

                                                      if (navigator.onLine) {
                                                        try {
                                                          await supabase.from('report_notifications').insert({
                                                            school_id: user.schoolId,
                                                            parent_phone: cleanPhoneVal,
                                                            title: "Academic Report Dispatched",
                                                            content: `The terminal report card for ${l.fullName} for ${selectedTerm} (${academicYear}) has been dispatched and is now available in your portal.`,
                                                            created_at: now,
                                                            is_read: false
                                                          });
                                                        } catch (e) {
                                                          console.warn(e);
                                                        }
                                                      }
                                                    }
                                                  }

                                                  syncUnsyncedReportSummaries().catch(err => console.warn(err));
                                                  alert(`Report card successfully ${isRel ? 'dispatched' : 'revoked'}!`);
                                                } catch (err) {
                                                  alert(err.message);
                                                } finally {
                                                  setIsReleasing(false);
                                                }
                                              }}
                                            >
                                              {isReleased ? 'Revoke' : 'Dispatch'}
                                            </button>
                                            <button
                                              type="button"
                                              className="btn"
                                              style={{ padding: '4px 8px', fontSize: '0.72rem', background: 'var(--accent)', color: 'white' }}
                                              onClick={() => {
                                                setActiveLearnerId(l.id);
                                                setView('preview');
                                              }}
                                            >
                                              Preview
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/*  PREVIEW SCREEN                                */}
        {/* ══════════════════════════════════════════════ */}
        {view === 'preview' && (
          <div className="rc-print-container">
            {/* Preview header */}
            <div className="rc-preview-header no-print">
              <button type="button" className="rc-back-btn" onClick={() => setView('config')}>
                <i className="fas fa-arrow-left" /> Back to Configuration
              </button>
              <div className="rc-action-row">
                {generateMode === 'all' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8rem' }}
                    onClick={() => window.print()}
                  >
                    <i className="fas fa-print" /> Print All ({previewLearners.length})
                  </button>
                )}
                {generateMode === 'all' && isAdmin && (
                  <button
                    type="button"
                    className="btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8rem', background: '#0d9488' }}
                    onClick={() => handleReleaseClassReports(true)}
                    disabled={isReleasing}
                  >
                    <i className="fas fa-paper-plane" /> Release Class Reports
                  </button>
                )}
                {generateMode === 'all' && isAdmin && (
                  <button
                    type="button"
                    className="btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8rem', background: '#dc2626' }}
                    onClick={() => handleReleaseClassReports(false)}
                    disabled={isReleasing}
                  >
                    <i className="fas fa-ban" /> Revoke Release
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8rem', background: 'var(--accent)' }}
                  onClick={() => window.print()}
                >
                  <i className="fas fa-print" /> Print This Card
                </button>
                {generateMode === 'individual' && isAdmin && (
                  (() => {
                    const activeReleased = activeSummary && (activeSummary.isReleased || activeSummary.is_released);
                    return (
                      <button
                        type="button"
                        className="btn"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8rem', background: activeReleased ? '#dc2626' : '#0d9488' }}
                        onClick={() => handleReleaseIndividualReport(!activeReleased)}
                        disabled={isReleasing}
                      >
                        {activeReleased ? (
                          <><i className="fas fa-ban" /> Revoke Release</>
                        ) : (
                          <><i className="fas fa-paper-plane" /> Release Report Card</>
                        )}
                      </button>
                    );
                  })()
                )}
              </div>
            </div>

            {/* ── ALL LEARNERS: stack every card vertically ── */}
            {generateMode === 'all' && (
              <div className="rc-all-learners-container" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                {previewLearners.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                    No learners found in this class.
                  </p>
                )}
                {previewLearners.map((l, idx) => (
                  <div key={l.id} className="rc-learner-block">
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '0.75rem',
                    }} className="no-print">
                      <span style={{
                        background: '#2563eb', color: 'white',
                        borderRadius: '50%', width: '24px', height: '24px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.72rem', fontWeight: 800, flexShrink: 0,
                      }}>{idx + 1}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)' }}>
                        {l.fullName}
                      </span>
                    </div>
                    <div className="rc-print-zone">
                      {renderCard(l)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── INDIVIDUAL: single card + editor ── */}
            {generateMode === 'individual' && (
              <>
                {activeLearner && (
                  <div className="rc-print-zone">
                    {renderCard(activeLearner)}
                  </div>
                )}

                {/* Editor (advisor only) */}
                {activeLearner && !isAdmin && (
                  <div className="rc-editor no-print">
                    <div className="rc-editor-head">
                      <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-pen" style={{ color: 'var(--accent)' }} />
                        Compile Remarks — {activeLearner.fullName}
                      </h3>
                      <button
                        type="button"
                        className="btn"
                        onClick={handleAutoRemark}
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', background: 'rgba(13,148,136,0.08)', color: 'var(--accent-dark)', border: '1px solid rgba(13,148,136,0.2)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i className="fas fa-magic" /> Auto Remarks
                      </button>
                    </div>
                    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className="rc-section-title">Attendance &amp; Conduct</div>
                      <div className="rc-form-grid">
                        {[
                          { key: 'attendancePresent', label: 'Days Present',    type: 'number', ph: 'e.g. 74' },
                          { key: 'attendanceTotal',   label: 'Total Term Days', type: 'number', ph: 'e.g. 80' },
                          { key: 'conduct',           label: 'Conduct',         type: 'text',   ph: 'e.g. Excellent' },
                          { key: 'attitude',          label: 'Attitude',        type: 'text',   ph: 'e.g. Hardworking' },
                        ].map(({ key, label, type, ph }) => (
                          <div className="rc-form-group" key={key}>
                            <label>{label}</label>
                            <input type={type} className="form-input" placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                          </div>
                        ))}
                      </div>

                      <div className="rc-section-title">Advisory Remarks</div>
                      <div className="rc-form-group" style={{ marginBottom: '1rem' }}>
                        <label>Class Advisor's Remark</label>
                        <textarea className="form-input" rows={2} placeholder="Enter advisory feedback..." value={form.teacherRemark} onChange={e => setForm(f => ({ ...f, teacherRemark: e.target.value }))} style={{ resize: 'vertical', fontSize: '0.85rem' }} />
                      </div>
                      <div className="rc-form-group" style={{ marginBottom: '1rem' }}>
                        <label>Headteacher's Remark</label>
                        <textarea className="form-input" rows={2} placeholder="Enter headteacher remark..." value={form.headteacherRemark} onChange={e => setForm(f => ({ ...f, headteacherRemark: e.target.value }))} style={{ resize: 'vertical', fontSize: '0.85rem' }} />
                      </div>

                      <div className="rc-section-title">Term Information</div>
                      <div className="rc-form-grid">
                        {[
                          { key: 'vacationDate',   label: 'Vacation Date',     type: 'date', ph: '' },
                          { key: 'nextTermBegins', label: 'Next Term Resumes', type: 'date', ph: '' },
                          { key: 'nextTermBill',   label: 'Next Term Bill',    type: 'text', ph: 'e.g. GHC 450' },
                          { key: 'feesOwed',       label: 'Previous Arrears',  type: 'text', ph: 'e.g. GHC 150' },
                        ].map(({ key, label, type, ph }) => (
                          <div className="rc-form-group" key={key}>
                            <label>{label}</label>
                            <input type={type} className="form-input" placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <button type="submit" className="btn" disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.7rem 1.75rem', fontWeight: 700, background: 'var(--accent)' }}>
                          {isSaving ? <><i className="fas fa-spinner fa-spin" /> Saving...</> : <><i className="fas fa-save" /> Save &amp; Sync</>}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {activeLearner && isAdmin && (
                  <div className="no-print" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'var(--accent-light)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: '12px', padding: '1rem 1.25rem', marginTop: '1.25rem' }}>
                    <i className="fas fa-info-circle" style={{ color: 'var(--accent)', fontSize: '1.2rem', marginTop: '2px' }} />
                    <div style={{ fontSize: '0.82rem', color: 'var(--accent-dark)', fontWeight: 600, lineHeight: 1.55 }}>
                      <strong>Headteacher View-Only Mode.</strong> Only the assigned Class Advisor can edit remarks and attendance.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Reports;
