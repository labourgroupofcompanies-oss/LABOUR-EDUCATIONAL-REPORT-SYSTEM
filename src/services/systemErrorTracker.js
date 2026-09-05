/**
 * systemErrorTracker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-Time System Error Tracker & 5-Pillar Diagnostics Engine (Zero API Cost)
 *
 * Capabilities:
 *  1. In-memory circular buffer (max 50 events) persisted to localStorage.
 *  2. Pub/sub observer pattern for live UI updates (floating button turns amber/red).
 *  3. Automatic capture hooks for uncaught exceptions, promise rejections, and network errors.
 *  4. 5-Pillar Live System Diagnostic runner inspecting:
 *     - Network Connectivity & Latency
 *     - Supabase API & Auth Health
 *     - IndexedDB / Dexie Storage Health
 *     - Offline Outbox Sync Queue Status
 *     - Runtime Exception Log
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../lib/db';

const STORAGE_KEY = 'labour_system_errors';
const MAX_ERRORS = 50;

class SystemErrorTracker {
  constructor() {
    this.errors = this.loadFromStorage();
    this.listeners = new Set();
  }

  /**
   * Load errors from localStorage safely
   */
  loadFromStorage() {
    try {
      if (typeof window === 'undefined') return [];
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[ErrorTracker] Failed to load cached errors:', e);
      return [];
    }
  }

  /**
   * Save errors to localStorage safely
   */
  saveToStorage() {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.errors));
    } catch (e) {
      console.warn('[ErrorTracker] Failed to persist errors:', e);
    }
  }

  /**
   * Subscribe to error updates (used by Copilot Drawer and floating badge)
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all registered listeners
   */
  notify() {
    try {
      const state = {
        total: this.errors.length,
        unresolved: this.getUnresolvedErrors().length,
        recent: this.getRecentErrors(5)
      };
      this.listeners.forEach((listener) => {
        try {
          listener(state);
        } catch (err) {
          console.error('[ErrorTracker] Listener error:', err);
        }
      });
    } catch (err) {
      console.error('[ErrorTracker] Notify error:', err);
    }
  }

  /**
   * Record a new error into the circular buffer
   */
  recordError({ type = 'runtime', message, source = 'app', stack = null, details = null, endpoint = null, status = null }) {
    try {
      if (!message) return;

      // Ignore noise (browser extensions, Vite HMR noise, chrome devtools)
      const msgStr = String(message);
      if (
        msgStr.includes("Cannot read properties of undefined (reading 'startTime')") ||
        msgStr.includes('reportAllChanges') ||
        msgStr.includes('ResizeObserver loop limit exceeded') ||
        msgStr.includes('ResizeObserver loop completed with undelivered notifications')
      ) {
        return;
      }

      // Check if duplicate of last recorded error within last 2 seconds
      const now = Date.now();
      const lastError = this.errors[0];
      if (lastError && lastError.message === msgStr && (now - lastError.timestamp) < 2000) {
        lastError.occurrences = (lastError.occurrences || 1) + 1;
        lastError.lastSeen = now;
        this.saveToStorage();
        this.notify();
        return;
      }

      const errorEntry = {
        id: 'err_' + now + '_' + Math.random().toString(36).substring(2, 7),
        type, // 'runtime' | 'unhandled_rejection' | 'network' | 'sync' | 'supabase'
        message: msgStr.slice(0, 500),
        source: String(source || 'app'),
        stack: stack ? String(stack).slice(0, 1000) : null,
        details: details || null,
        endpoint: endpoint || null,
        status: status || null,
        timestamp: now,
        lastSeen: now,
        occurrences: 1,
        resolved: false
      };

      // Prepend to array and trim to max
      this.errors.unshift(errorEntry);
      if (this.errors.length > MAX_ERRORS) {
        this.errors = this.errors.slice(0, MAX_ERRORS);
      }

      this.saveToStorage();
      this.notify();
    } catch (err) {
      console.warn('[ErrorTracker] recordError failed:', err);
    }
  }

  /**
   * Convenience: Record runtime JS error
   */
  recordRuntimeError(errorObj) {
    this.recordError({
      type: 'runtime',
      message: errorObj?.message || errorObj?.name || 'Unknown JavaScript Error',
      source: errorObj?.filename || 'client_runtime',
      stack: errorObj?.stack || (errorObj?.error ? errorObj.error.stack : null),
      details: {
        lineno: errorObj?.lineno,
        colno: errorObj?.colno
      }
    });
  }

  /**
   * Convenience: Record unhandled promise rejection
   */
  recordUnhandledRejection(rejectionObj) {
    const reason = rejectionObj?.reason;
    let message = 'Unhandled Promise Rejection';
    let stack = null;

    if (reason instanceof Error) {
      message = reason.message;
      stack = reason.stack;
    } else if (typeof reason === 'string') {
      message = reason;
    } else if (reason && typeof reason === 'object') {
      message = reason.message || reason.error_description || JSON.stringify(reason);
      stack = reason.stack || null;
    }

    this.recordError({
      type: 'unhandled_rejection',
      message,
      source: 'promise_rejection',
      stack
    });
  }

  /**
   * Convenience: Record network / Supabase fetch failure
   */
  recordNetworkError({ url, status, statusText, body }) {
    let cleanUrl = url;
    try {
      if (typeof url === 'string' && url.startsWith('http')) {
        const parsed = new URL(url);
        cleanUrl = parsed.pathname + parsed.search;
      }
    } catch (_) {}

    const message = `HTTP ${status || 0} (${statusText || 'Error'}): ${cleanUrl}`;

    this.recordError({
      type: status ? 'supabase' : 'network',
      message,
      source: 'network_fetch',
      endpoint: cleanUrl,
      status,
      details: body ? String(body).slice(0, 300) : null
    });
  }

  /**
   * Convenience: Record sync queue failure
   */
  recordSyncError({ table, operation, schoolId, error }) {
    this.recordError({
      type: 'sync',
      message: `Outbox Sync Failed on [${table}]: ${error?.message || error || 'Unknown sync error'}`,
      source: 'sync_engine',
      details: { table, operation, schoolId }
    });
  }

  /**
   * Get all unresolved errors
   */
  getUnresolvedErrors() {
    return this.errors.filter((e) => !e.resolved);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errors.slice(0, limit);
  }

  /**
   * Mark all or specific error as resolved
   */
  resolveError(errorId = null) {
    try {
      if (errorId) {
        const item = this.errors.find((e) => e.id === errorId);
        if (item) item.resolved = true;
      } else {
        this.errors.forEach((e) => {
          e.resolved = true;
        });
      }
      this.saveToStorage();
      this.notify();
    } catch (err) {
      console.warn('[ErrorTracker] resolveError failed:', err);
    }
  }

  /**
   * Clear error history completely
   */
  clearAllErrors() {
    try {
      this.errors = [];
      this.saveToStorage();
      this.notify();
    } catch (err) {
      console.warn('[ErrorTracker] clearAllErrors failed:', err);
    }
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────────
   * 5-PILLAR ACTIVE DIAGNOSTIC RUNNER
   * Runs live system inspection across network, Supabase, Dexie, Outbox, and runtime.
   * ─────────────────────────────────────────────────────────────────────────────
   */
  async runSystemDiagnostics() {
    const startTime = performance.now();

    const diagnostics = {
      timestamp: new Date().toISOString(),
      overallStatus: 'healthy', // 'healthy' | 'warning' | 'critical'
      pillars: {
        network: { name: 'Network & Connectivity', status: 'healthy', latencyMs: null, details: '' },
        supabase: { name: 'Supabase API & Auth', status: 'healthy', userRole: null, details: '' },
        database: { name: 'Dexie Local Storage', status: 'healthy', tableCount: null, details: '' },
        outbox: { name: 'Offline Sync Queue', status: 'healthy', pending: 0, failed: 0, details: '' },
        telemetry: { name: 'Runtime Exceptions', status: 'healthy', unresolvedCount: 0, recent: [] }
      },
      executionMs: 0
    };

    // ── PILLAR 1: Network & Connectivity ──
    try {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (!isOnline) {
        diagnostics.pillars.network.status = 'critical';
        diagnostics.pillars.network.details = 'Browser reports offline mode. No active internet connection.';
      } else {
        const pingStart = performance.now();
        // Lightweight HEAD or GET to Supabase URL with 4s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          if (supabaseUrl) {
            await fetch(`${supabaseUrl}/rest/v1/`, {
              method: 'HEAD',
              signal: controller.signal,
              headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '' }
            });
          }
          clearTimeout(timeoutId);
          const latency = Math.round(performance.now() - pingStart);
          diagnostics.pillars.network.latencyMs = latency;
          if (latency > 1500) {
            diagnostics.pillars.network.status = 'warning';
            diagnostics.pillars.network.details = `Connected, high latency (${latency}ms). Possible network throttling.`;
          } else {
            diagnostics.pillars.network.status = 'healthy';
            diagnostics.pillars.network.details = `Optimal connection (${latency}ms roundtrip).`;
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            diagnostics.pillars.network.status = 'warning';
            diagnostics.pillars.network.details = 'Network ping timed out (>4000ms). Connection is slow.';
          } else {
            diagnostics.pillars.network.status = 'warning';
            diagnostics.pillars.network.details = `Online, but Supabase ping failed: ${fetchErr.message}`;
          }
        }
      }
    } catch (netErr) {
      diagnostics.pillars.network.status = 'warning';
      diagnostics.pillars.network.details = `Could not verify network: ${netErr.message}`;
    }

    // ── PILLAR 2: Supabase API & Auth ──
    try {
      const { supabase } = await import('../lib/supabase');
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        diagnostics.pillars.supabase.status = 'warning';
        diagnostics.pillars.supabase.details = `Auth session error: ${sessionErr.message}`;
      } else {
        const user = sessionData?.session?.user;
        diagnostics.pillars.supabase.userRole = user?.email || 'Anonymous / Platform Key';

        // Test lightweight query to verify API table permissions
        const { error: queryErr } = await supabase.from('schools').select('id').limit(1);
        if (queryErr) {
          diagnostics.pillars.supabase.status = 'warning';
          diagnostics.pillars.supabase.details = `API accessible, query notice: ${queryErr.message}`;
        } else {
          diagnostics.pillars.supabase.status = 'healthy';
          diagnostics.pillars.supabase.details = `Authenticated as ${user ? user.email : 'Public/Platform'} • Read access verified.`;
        }
      }
    } catch (supaErr) {
      diagnostics.pillars.supabase.status = 'critical';
      diagnostics.pillars.supabase.details = `Supabase client failure: ${supaErr.message}`;
    }

    // ── PILLAR 3: Dexie Local Storage ──
    try {
      if (!db.isOpen()) {
        await db.open();
      }
      const schoolCount = await db.schools.count();
      const tables = db.tables ? db.tables.length : 0;
      diagnostics.pillars.database.tableCount = tables;
      diagnostics.pillars.database.status = 'healthy';
      diagnostics.pillars.database.details = `Dexie IndexedDB active • ${tables} tables mounted (${schoolCount} local schools cached).`;
    } catch (dbErr) {
      diagnostics.pillars.database.status = 'critical';
      diagnostics.pillars.database.details = `Local storage inaccessible: ${dbErr.message}`;
    }

    // ── PILLAR 4: Offline Outbox Sync Queue ──
    try {
      if (db.outbox) {
        const allOutbox = await db.outbox.toArray();
        const pending = allOutbox.filter((item) => item.status === 'pending' || !item.status).length;
        const failed = allOutbox.filter((item) => item.status === 'failed').length;

        diagnostics.pillars.outbox.pending = pending;
        diagnostics.pillars.outbox.failed = failed;

        if (failed > 0) {
          diagnostics.pillars.outbox.status = 'critical';
          diagnostics.pillars.outbox.details = `⚠️ ${failed} queued operations failed sync! (${pending} pending retry)`;
        } else if (pending > 10) {
          diagnostics.pillars.outbox.status = 'warning';
          diagnostics.pillars.outbox.details = `${pending} operations queued waiting for network sync.`;
        } else {
          diagnostics.pillars.outbox.status = 'healthy';
          diagnostics.pillars.outbox.details = `Queue clean • ${pending} pending items. All synced.`;
        }
      } else {
        diagnostics.pillars.outbox.status = 'healthy';
        diagnostics.pillars.outbox.details = 'Outbox table not initialized (direct mode).';
      }
    } catch (syncErr) {
      diagnostics.pillars.outbox.status = 'warning';
      diagnostics.pillars.outbox.details = `Outbox query notice: ${syncErr.message}`;
    }

    // ── PILLAR 5: Runtime Telemetry & Exceptions ──
    try {
      const unresolved = this.getUnresolvedErrors();
      const recent = this.getRecentErrors(5);
      diagnostics.pillars.telemetry.unresolvedCount = unresolved.length;
      diagnostics.pillars.telemetry.recent = recent;

      if (unresolved.length > 5) {
        diagnostics.pillars.telemetry.status = 'critical';
        diagnostics.pillars.telemetry.details = `🚨 ${unresolved.length} unresolved system exceptions recorded!`;
      } else if (unresolved.length > 0) {
        diagnostics.pillars.telemetry.status = 'warning';
        diagnostics.pillars.telemetry.details = `⚠️ ${unresolved.length} unresolved error(s) logged recently.`;
      } else {
        diagnostics.pillars.telemetry.status = 'healthy';
        diagnostics.pillars.telemetry.details = '0 unresolved errors. System runtime is clean.';
      }
    } catch (errLogErr) {
      diagnostics.pillars.telemetry.details = `Error checking logs: ${errLogErr.message}`;
    }

    // ── Calculate Overall Health Status ──
    const pillarStatuses = Object.values(diagnostics.pillars).map((p) => p.status);
    if (pillarStatuses.includes('critical')) {
      diagnostics.overallStatus = 'critical';
    } else if (pillarStatuses.includes('warning')) {
      diagnostics.overallStatus = 'warning';
    } else {
      diagnostics.overallStatus = 'healthy';
    }

    diagnostics.executionMs = Math.round(performance.now() - startTime);
    return diagnostics;
  }
}

// Export singleton instance
export const systemErrorTracker = new SystemErrorTracker();
export default systemErrorTracker;
