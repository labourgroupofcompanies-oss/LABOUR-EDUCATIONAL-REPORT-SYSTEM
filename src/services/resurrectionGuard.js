/**
 * resurrectionGuard.js — High-Performance Deletion Registry
 *
 * Prevents background sync passes (syncDown, polling, component mounts) from
 * resurrecting items that have been recently deleted locally or are awaiting cloud deletion.
 *
 * Provides O(1) in-memory Set lookups backed by localStorage with automatic 7-day TTL expiration.
 */

const STORAGE_KEY = 'edu_resurrection_registry_v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days retention

class ResurrectionGuard {
  constructor() {
    // In-memory lookup sets: entityType -> Set(String(entityId))
    this.memorySets = new Map();
    this.loaded = false;
    this._loadFromStorage();
  }

  _loadFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const records = JSON.parse(raw);
      const now = Date.now();
      const validRecords = [];

      this.memorySets.clear();

      for (const rec of records) {
        if (rec && rec.timestamp && now - rec.timestamp < TTL_MS) {
          validRecords.push(rec);
          const type = String(rec.type).toLowerCase();
          if (!this.memorySets.has(type)) {
            this.memorySets.set(type, new Set());
          }
          this.memorySets.get(type).add(String(rec.id));
          if (rec.altId) {
            this.memorySets.get(type).add(String(rec.altId));
          }
        }
      }

      // Prune expired entries
      if (validRecords.length !== records.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validRecords));
      }
      this.loaded = true;
    } catch (err) {
      console.warn('[ResurrectionGuard] Failed to load registry from storage:', err);
    }
  }

  _saveToStorage(records) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.warn('[ResurrectionGuard] Failed to save registry to storage:', err);
    }
  }

  _getAllRecords() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Mark an entity as deleted.
   * @param {'class'|'subject'|'teacher'|'profile'|'learner'|'assignment'|'class_subject'} type
   * @param {string|number} id
   * @param {string|number} [altId] - Optional secondary identifier (e.g. numeric ID vs UUID or reg_number)
   */
  markDeleted(type, id, altId = null) {
    if (!type || !id) return;
    const normType = String(type).toLowerCase();
    const strId = String(id);
    const strAltId = altId ? String(altId) : null;

    if (!this.memorySets.has(normType)) {
      this.memorySets.set(normType, new Set());
    }
    const set = this.memorySets.get(normType);
    set.add(strId);
    if (strAltId) set.add(strAltId);

    // Save to localStorage
    const records = this._getAllRecords();
    const existingIdx = records.findIndex(r => 
      String(r.type).toLowerCase() === normType && (String(r.id) === strId || (strAltId && String(r.id) === strAltId))
    );

    const newRecord = {
      type: normType,
      id: strId,
      altId: strAltId,
      timestamp: Date.now()
    };

    if (existingIdx >= 0) {
      records[existingIdx] = newRecord;
    } else {
      records.push(newRecord);
    }

    this._saveToStorage(records);
  }

  /**
   * Check if an entity is marked as deleted (O(1) lookup).
   * @param {'class'|'subject'|'teacher'|'profile'|'learner'|'assignment'|'class_subject'} type
   * @param {string|number} id
   * @param {string|number} [altId]
   * @returns {boolean}
   */
  isDeleted(type, id, altId = null) {
    if (!type || !id) return false;
    const normType = String(type).toLowerCase();
    const set = this.memorySets.get(normType);
    if (!set) return false;

    const strId = String(id);
    if (set.has(strId)) return true;
    if (altId && set.has(String(altId))) return true;

    return false;
  }

  /**
   * Remove an entity from the deletion registry (e.g., when restored from Recycle Bin).
   * @param {'class'|'subject'|'teacher'|'profile'|'learner'|'assignment'|'class_subject'} type
   * @param {string|number} id
   * @param {string|number} [altId]
   */
  unmarkDeleted(type, id, altId = null) {
    if (!type || !id) return;
    const normType = String(type).toLowerCase();
    const strId = String(id);
    const strAltId = altId ? String(altId) : null;

    const set = this.memorySets.get(normType);
    if (set) {
      set.delete(strId);
      if (strAltId) set.delete(strAltId);
    }

    const records = this._getAllRecords().filter(r => 
      !(String(r.type).toLowerCase() === normType && (String(r.id) === strId || (strAltId && String(r.id) === strAltId)))
    );
    this._saveToStorage(records);
  }

  /**
   * Clear all registry entries for a specific type or all types.
   */
  clear(type = null) {
    if (type) {
      const normType = String(type).toLowerCase();
      this.memorySets.delete(normType);
      const records = this._getAllRecords().filter(r => String(r.type).toLowerCase() !== normType);
      this._saveToStorage(records);
    } else {
      this.memorySets.clear();
      this._saveToStorage([]);
    }
  }
}

export const resurrectionGuard = new ResurrectionGuard();
export default resurrectionGuard;
