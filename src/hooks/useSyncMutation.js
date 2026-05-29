// src/hooks/useSyncMutation.js
import { enqueueSync } from '../services/syncEngine';

/**
 * Hook to wrap syncEngine.enqueueSync for UI components.
 *
 * @param {string} operation - One of: 'insert', 'update', 'delete', 'upsert'.
 * @param {string} table - Supabase table name.
 * @returns {Function} - A function that takes (payload, schoolId) and queues the sync.
 */
export const useSyncMutation = (operation, table) => {
  return async (payload, schoolId = null) => {
    await enqueueSync(operation, table, payload, schoolId);
  };
};
