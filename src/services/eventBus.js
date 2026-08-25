import { db } from '../lib/db';

/**
 * EventBus - Production-Ready Event Publisher/Subscriber for Labour Edu App
 * Enables complete decoupling between Subscription, Registration, Wallet, and Referral modules.
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to a domain event
   * @param {string} eventName 
   * @param {Function} callback 
   */
  subscribe(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(eventName) || [];
      this.listeners.set(eventName, callbacks.filter(cb => cb !== callback));
    };
  }

  /**
   * Publish a domain event asynchronously with persistence audit
   * @param {string} eventName 
   * @param {Object} payload 
   */
  async publish(eventName, payload) {
    const eventRecord = {
      eventName,
      payload,
      processed: false,
      createdAt: new Date().toISOString()
    };

    // 1. Audit log event in Dexie IndexedDB
    try {
      if (db.systemEvents) {
        await db.systemEvents.add(eventRecord);
      }
    } catch (err) {
      console.warn('[EventBus] Failed to persist system event record:', err);
    }

    // 2. Notify subscribers
    const callbacks = this.listeners.get(eventName) || [];
    for (const callback of callbacks) {
      try {
        await callback(payload);
      } catch (err) {
        console.error(`[EventBus] Error handling event ${eventName}:`, err);
      }
    }
  }
}

export const eventBus = new EventBus();
export default eventBus;
