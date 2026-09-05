import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../store/AuthContext';
import ReferralRewardsWidget from '../../components/subscription/ReferralRewardsWidget';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';

const ReferralPage = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;

  const schoolInfo = useLiveQuery(
    () => schoolId ? db.schools.get(schoolId) : null,
    [schoolId]
  );

  const isSuperAdmin = user?.role === 'super_admin' || user?.isPlatformDeveloper;

  return (
    <Layout title="Referral & Rewards">
      <div 
        className="fade-in" 
        style={{ 
          maxWidth: '1240px', 
          margin: '0 auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.5rem',
          paddingBottom: '2rem'
        }}
      >
        {/* Super Admin Direct Operations Navigation Banner */}
        {isSuperAdmin && (
          <div style={{
            background: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
            border: '1px solid #3f3f46',
            borderLeft: '4px solid #ef4444',
            borderRadius: '14px',
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '1.1rem' }}>
                <i className="fas fa-shield-halved" />
              </div>
              <div>
                <strong style={{ color: '#ffffff', fontSize: '0.92rem', display: 'block' }}>
                  Super Admin Controls Available
                </strong>
                <span style={{ color: '#a1a1aa', fontSize: '0.8rem' }}>
                  Deduct referral rewards, audit transactions, and manage global promoter settings in the Operations Center.
                </span>
              </div>
            </div>
            <Link
              to="/platform/operations/referrals"
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 800,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)'
              }}
            >
              <i className="fas fa-minus-circle" /> Deduct Referral Rewards &rarr;
            </Link>
          </div>
        )}

        {/* Core Referral Rewards Experience */}
        <ReferralRewardsWidget schoolId={schoolId} schoolName={schoolInfo?.name} />
      </div>
    </Layout>
  );
};

export default ReferralPage;
