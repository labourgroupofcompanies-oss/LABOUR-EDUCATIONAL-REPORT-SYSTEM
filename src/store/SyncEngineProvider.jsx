import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { drainOutbox, retryFailed, forceDrain, getIsSyncing } from '../services/syncEngine';

const SyncEngineContext = createContext({
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  retryFailed: async () => {},
  forceDrain: async () => {}
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

  // Live count of unsynced learners (saved offline, not yet pushed to Supabase)
  const unsyncedLearnersCount = useLiveQuery(
    () => db.learners.filter(l => l.synced === false).count(),
    [],
    0
  );

  // Total pending = outbox items + unsynced learners
  const pendingCount = (outboxPendingCount || 0) + (unsyncedLearnersCount || 0);
  const failedCount = outboxFailedCount || 0;

  // On startup: only reset items stuck as 'processing' from a previously crashed session.
  // NOTE: We do NOT call drainOutbox() here directly because the Supabase session may not
  // be restored yet (race condition — auth initialisation is async). The actual drain is
  // triggered safely by the INITIAL_SESSION event handler inside syncEngine.js, which
  // fires AFTER the Supabase client has fully restored the session. This guarantees that
  // getSession() will return a valid session when drainOutbox() checks for it.
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

  return (
    <SyncEngineContext.Provider value={{
      pendingCount,
      failedCount,
      isSyncing,
      retryFailed: handleRetryFailed,
      forceDrain: handleForceDrain
    }}>
      {children}
    </SyncEngineContext.Provider>
  );
};

export default SyncEngineProvider;
