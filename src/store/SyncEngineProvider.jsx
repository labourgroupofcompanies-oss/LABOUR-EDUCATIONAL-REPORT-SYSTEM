import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { drainOutbox, retryFailed, forceDrain, clearOutbox, clearLocalBase, getIsSyncing } from '../services/syncEngine';

const SyncEngineContext = createContext({
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  retryFailed: async () => {},
  forceDrain: async () => {},
  clearOutbox: async () => {},
  clearLocalBase: async () => {}
});

export const useSyncEngine = () => useContext(SyncEngineContext);

export const SyncEngineProvider = ({ children }) => {
  const [isSyncing, setIsSyncing] = useState(false);

  // Live reactive count of pending + processing outbox items
  const outboxPendingCount = useLiveQuery(
    () => db.outbox.where('status').anyOf(['pending', 'processing']).count(),
    [],
    0
  );

  // Live count of failed outbox items
  const outboxFailedCount = useLiveQuery(
    () => db.outbox.where('status').equals('failed').count(),
    [],
    0
  );

  // Live count of unsynced learners (saved offline, or with offline photo pending upload)
  const unsyncedLearnersCount = useLiveQuery(
    () => db.learners.filter(l => l.synced === false && (!l.supabaseId || (l.photo instanceof Blob && !l.photoUrl))).count(),
    [],
    0
  );

  // Total pending = outbox items + unsynced learners
  const pendingCount = (outboxPendingCount || 0) + (unsyncedLearnersCount || 0);
  const failedCount = outboxFailedCount || 0;

  // On startup: reset stuck items and reconcile learners that already exist in cloud
  useEffect(() => {
    const resetStuck = async () => {
      try {
        const stuckCount = await db.outbox
          .where('status').equals('processing')
          .count();
        if (stuckCount > 0) {
          console.log(`[SyncEngineProvider] Resetting ${stuckCount} stuck 'processing' item(s) to pending...`);
          await db.outbox
            .where('status').equals('processing')
            .modify({ status: 'pending' });
        }

        // Reconcile local learners that already have a cloud supabaseId AND no pending local photo blob
        const unsyncedWithCloudId = await db.learners
          .filter(l => l.synced === false && !!l.supabaseId && !(l.photo instanceof Blob && !l.photoUrl))
          .toArray();
        if (unsyncedWithCloudId.length > 0) {
          for (const l of unsyncedWithCloudId) {
            const hasPendingOutbox = await db.outbox
              .filter(o => o.table === 'report_learners' && o.payload.includes(l.supabaseId))
              .first();
            if (!hasPendingOutbox) {
              await db.learners.update(l.id, { synced: true });
            }
          }
        }
      } catch (err) {
        console.warn('[SyncEngineProvider] Failed to reset stuck items:', err);
      }
    };
    resetStuck();
  }, []);

  // Update isSyncing based on sync engine state
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSyncing(getIsSyncing());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleRetryFailed = useCallback(async () => {
    setIsSyncing(true);
    await retryFailed();
    setIsSyncing(false);
  }, []);

  const handleForceDrain = useCallback(async () => {
    setIsSyncing(true);
    await forceDrain();
    setIsSyncing(false);
  }, []);

  const handleClearOutbox = useCallback(async () => {
    await clearOutbox();
  }, []);

  const handleClearLocalBase = useCallback(async () => {
    await clearLocalBase();
  }, []);

  return (
    <SyncEngineContext.Provider value={{
      pendingCount,
      failedCount,
      isSyncing,
      retryFailed: handleRetryFailed,
      forceDrain: handleForceDrain,
      clearOutbox: handleClearOutbox,
      clearLocalBase: handleClearLocalBase
    }}>
      {children}
    </SyncEngineContext.Provider>
  );
};

export default SyncEngineProvider;
