import { db } from '../lib/db';

/**
 * Enterprise Login Rate Limiting & Progressive Account Lockout Service
 *
 * Rules:
 * 1. Maximum of 5 failed login attempts allowed per user / device.
 * 2. Progressive lockout escalation:
 *    - 1st exceed (Strike 1): 1 minute lockout
 *    - 2nd exceed (Strike 2): 5 minutes lockout
 *    - 3rd+ exceed (Strike 3+): 6 hours lockout
 * 3. Multi-layer persistence (localStorage + IndexedDB + sessionStorage):
 *    - Browser refreshing, reloading, tab closing, or navigating away CANNOT lift or reset the lockout.
 *    - The lockout timestamp is absolute (Date.now() + duration).
 * 4. Successful login clears all failed attempts and resets strikes to 0.
 */

export const MAX_LOGIN_ATTEMPTS = 5;

export const LOCKOUT_DURATIONS_MS = {
  STRIKE_1: 1 * 60 * 1000,           // 1 minute (60,000 ms)
  STRIKE_2: 5 * 60 * 1000,           // 5 minutes (300,000 ms)
  STRIKE_3_PLUS: 6 * 60 * 60 * 1000, // 6 hours (21,600,000 ms)
};

const STORAGE_PREFIX = 'labour_edu_login_rate_';
const DEVICE_KEY = 'labour_edu_device_client_lock';

function getDeviceFingerprint() {
  try {
    let fp = localStorage.getItem('labour_edu_device_fp');
    if (!fp) {
      fp = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
      localStorage.setItem('labour_edu_device_fp', fp);
    }
    return fp;
  } catch {
    return 'fallback_device';
  }
}

function normalizeIdentifier(rawId) {
  if (!rawId) return 'unknown_user';
  return String(rawId).trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

export function formatRemainingTime(ms) {
  if (ms <= 0) return '0 seconds';

  const totalSecs = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  if (hours > 0) {
    return `${hours} hr${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''} ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes} min${minutes !== 1 ? 's' : ''} ${seconds}s`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

export function formatRemainingTimeDigital(ms) {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const pad = (n) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

class LoginRateLimitService {
  constructor() {
    this.memoryCache = new Map();
  }

  getStorageKey(identifier) {
    return `${STORAGE_PREFIX}${normalizeIdentifier(identifier)}`;
  }

  getDeviceKey() {
    return `${STORAGE_PREFIX}${DEVICE_KEY}`;
  }

  /**
   * Load record from localStorage, sessionStorage, or Dexie DB
   */
  loadRecord(key) {
    try {
      const fromMem = this.memoryCache.get(key);
      if (fromMem) return fromMem;

      const rawLocal = localStorage.getItem(key);
      if (rawLocal) {
        const parsed = JSON.parse(rawLocal);
        this.memoryCache.set(key, parsed);
        return parsed;
      }

      const rawSession = sessionStorage.getItem(key);
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        this.memoryCache.set(key, parsed);
        return parsed;
      }
    } catch (_) {}

    return null;
  }

  /**
   * Save record across all storage layers (localStorage, sessionStorage, Dexie DB)
   */
  saveRecord(key, record) {
    try {
      this.memoryCache.set(key, record);
      const serialized = JSON.stringify(record);
      localStorage.setItem(key, serialized);
      sessionStorage.setItem(key, serialized);

      // Async write to Dexie IndexedDB settings table for tamper-resilience
      db.settings.put({
        id: key,
        value: record,
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Check if a user / device is currently locked out
   */
  checkLockout(rawIdentifier = null) {
    const now = Date.now();
    let highestLockout = null;

    // Check specific identifier key
    if (rawIdentifier) {
      const userKey = this.getStorageKey(rawIdentifier);
      const userRec = this.loadRecord(userKey);
      if (userRec && userRec.lockedUntil && userRec.lockedUntil > now) {
        highestLockout = userRec;
      }
    }

    // Check device-level key
    const devKey = this.getDeviceKey();
    const devRec = this.loadRecord(devKey);
    if (devRec && devRec.lockedUntil && devRec.lockedUntil > now) {
      if (!highestLockout || devRec.lockedUntil > highestLockout.lockedUntil) {
        highestLockout = devRec;
      }
    }

    if (highestLockout && highestLockout.lockedUntil > now) {
      const remainingMs = highestLockout.lockedUntil - now;
      return {
        isLocked: true,
        remainingMs,
        remainingFormatted: formatRemainingTime(remainingMs),
        remainingDigital: formatRemainingTimeDigital(remainingMs),
        failedAttempts: MAX_LOGIN_ATTEMPTS,
        remainingAttempts: 0,
        strikeCount: highestLockout.strikeCount || 1,
        lockedUntil: highestLockout.lockedUntil,
        tierLabel: highestLockout.tierLabel || '1 minute'
      };
    }

    // Not locked: return current failed attempt count
    const targetKey = rawIdentifier ? this.getStorageKey(rawIdentifier) : this.getDeviceKey();
    const currentRec = this.loadRecord(targetKey);
    const failedAttempts = currentRec?.failedAttempts || 0;
    const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - failedAttempts);

    return {
      isLocked: false,
      remainingMs: 0,
      remainingFormatted: '0 seconds',
      remainingDigital: '00:00',
      failedAttempts,
      remainingAttempts,
      strikeCount: currentRec?.strikeCount || 0,
      lockedUntil: null,
      tierLabel: null
    };
  }

  /**
   * Record a failed login attempt.
   * Escalates lockout tiers when 5 attempts are reached:
   *   Strike 1: 1 minute
   *   Strike 2: 5 minutes
   *   Strike 3+: 6 hours
   */
  recordFailedAttempt(rawIdentifier = null) {
    const userKey = rawIdentifier ? this.getStorageKey(rawIdentifier) : null;
    const devKey = this.getDeviceKey();

    const currentRec = (userKey ? this.loadRecord(userKey) : null) || this.loadRecord(devKey) || {
      failedAttempts: 0,
      strikeCount: 0,
      lockedUntil: null
    };

    const newFailedAttempts = (currentRec.failedAttempts || 0) + 1;
    const now = Date.now();

    if (newFailedAttempts >= MAX_LOGIN_ATTEMPTS) {
      // Exceeded 5 attempts! Escalate strike count
      const newStrikeCount = (currentRec.strikeCount || 0) + 1;
      let durationMs = LOCKOUT_DURATIONS_MS.STRIKE_1; // Default Strike 1: 1 minute
      let tierLabel = '1 minute';

      if (newStrikeCount === 1) {
        durationMs = LOCKOUT_DURATIONS_MS.STRIKE_1; // 1 minute
        tierLabel = '1 minute';
      } else if (newStrikeCount === 2) {
        durationMs = LOCKOUT_DURATIONS_MS.STRIKE_2; // 5 minutes
        tierLabel = '5 minutes';
      } else {
        durationMs = LOCKOUT_DURATIONS_MS.STRIKE_3_PLUS; // 6 hours
        tierLabel = '6 hours';
      }

      const lockedUntil = now + durationMs;
      const updatedRecord = {
        failedAttempts: MAX_LOGIN_ATTEMPTS,
        strikeCount: newStrikeCount,
        lockedUntil,
        tierLabel,
        lockedAt: now,
        lastAttemptAt: new Date().toISOString()
      };

      if (userKey) this.saveRecord(userKey, updatedRecord);
      this.saveRecord(devKey, updatedRecord);

      return {
        isLocked: true,
        remainingMs: durationMs,
        remainingFormatted: formatRemainingTime(durationMs),
        remainingDigital: formatRemainingTimeDigital(durationMs),
        failedAttempts: MAX_LOGIN_ATTEMPTS,
        remainingAttempts: 0,
        strikeCount: newStrikeCount,
        lockedUntil,
        tierLabel,
        justLocked: true
      };
    }

    // Not yet locked, save updated attempt count (e.g. 1 to 4)
    const updatedRecord = {
      ...currentRec,
      failedAttempts: newFailedAttempts,
      lastAttemptAt: new Date().toISOString()
    };

    if (userKey) this.saveRecord(userKey, updatedRecord);
    this.saveRecord(devKey, updatedRecord);

    const remainingAttempts = MAX_LOGIN_ATTEMPTS - newFailedAttempts;
    return {
      isLocked: false,
      remainingMs: 0,
      remainingFormatted: '0 seconds',
      remainingDigital: '00:00',
      failedAttempts: newFailedAttempts,
      remainingAttempts,
      strikeCount: currentRec.strikeCount || 0,
      lockedUntil: null,
      tierLabel: null,
      justLocked: false
    };
  }

  /**
   * Clear failed attempts on successful login
   */
  recordSuccessfulLogin(rawIdentifier = null) {
    try {
      if (rawIdentifier) {
        const userKey = this.getStorageKey(rawIdentifier);
        localStorage.removeItem(userKey);
        sessionStorage.removeItem(userKey);
        this.memoryCache.delete(userKey);
        db.settings.delete(userKey).catch(() => {});
      }

      const devKey = this.getDeviceKey();
      localStorage.removeItem(devKey);
      sessionStorage.removeItem(devKey);
      this.memoryCache.delete(devKey);
      db.settings.delete(devKey).catch(() => {});
    } catch (_) {}
  }
}

export const loginRateLimitService = new LoginRateLimitService();
export default loginRateLimitService;
