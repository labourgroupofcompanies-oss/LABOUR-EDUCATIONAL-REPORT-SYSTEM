import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { drainOutbox, retryFailed, getIsSyncing } from '../services/syncEngine';

const SyncEngineContext = createContext({
  pendingCount: 0,
  failedCount: 0,
  isSyncing: false,
  retryFailed: async () => {}
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

  // Drain outbox on mount if online
  useEffect(() => {
    if (navigator.onLine) {
      setIsSyncing(true);
      drainOutbox().finally(() => setIsSyncing(false));
    }
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

  return (
    <SyncEngineContext.Provider value={{
      pendingCount,
      failedCount,
      isSyncing,
      retryFailed: handleRetryFailed
    }}>
      {children}
    </SyncEngineContext.Provider>
  );
};

export default SyncEngineProvider;
