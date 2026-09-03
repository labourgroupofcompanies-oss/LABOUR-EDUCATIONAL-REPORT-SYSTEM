import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import subscriptionService from '../../services/subscriptionService';
import SchoolWalletWidget from '../../components/subscription/SchoolWalletWidget';

const Financials = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;

  const [subStatus, setSubStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const schoolInfo = useLiveQuery(
    () => schoolId ? db.schools.get(schoolId) : null,
    [schoolId]
  );

  const loadSubscriptionInfo = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const info = await subscriptionService.getSubscriptionStatus(schoolId);
      setSubStatus(info);
    } catch (err) {
      console.warn('[Financials] Error loading subscription info:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadSubscriptionInfo();
  }, [loadSubscriptionInfo]);

  return (
    <Layout title="School Wallet & Subscriptions">
      <div className="fade-in" style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.25rem 0' }}>
        <style>{`
          @media (max-width: 640px) {
            .financials-header-title {
              font-size: 1.35rem !important;
            }
            .financials-header-desc {
              font-size: 0.8rem !important;
            }
            .financials-header-wrap {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 0.75rem !important;
            }
            .financials-refresh-btn {
              width: 100% !important;
              justify-content: center !important;
              padding: 0.65rem !important;
            }
          }
        `}</style>
        
        {/* Minimalist Page Header */}
        <div className="financials-header-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="financials-header-title" style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.6rem', fontWeight: 800, color: '#09090b', margin: 0 }}>
              School Wallet &amp; Subscriptions
            </h1>
            <p className="financials-header-desc" style={{ color: '#71717a', fontSize: '0.88rem', margin: '3px 0 0' }}>
              Manage wallet balance, term licensing, and referral rewards for {schoolInfo?.name || 'your school'}.
            </p>
          </div>

          <button
            className="financials-refresh-btn"
            onClick={loadSubscriptionInfo}
            disabled={loading}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '10px',
              background: '#FFFFFF',
              border: '1.5px solid #E4E4E7',
              color: '#18181b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} style={{ fontSize: '0.8rem', color: '#2563eb' }} />
            <span>{loading ? 'Refreshing…' : 'Refresh Balance'}</span>
          </button>
        </div>

        {/* Primary Unified Wallet & Referral Hub */}
        <div data-tour="financials-wallet">
          <SchoolWalletWidget
            statusInfo={subStatus}
            schoolId={schoolId}
            onRefresh={loadSubscriptionInfo}
          />
        </div>

      </div>
    </Layout>
  );
};

export default Financials;
