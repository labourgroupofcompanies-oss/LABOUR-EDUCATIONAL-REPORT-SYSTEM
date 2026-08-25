import React from 'react';
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
        {/* Core Referral Rewards Experience */}
        <ReferralRewardsWidget schoolId={schoolId} schoolName={schoolInfo?.name} />
      </div>
    </Layout>
  );
};

export default ReferralPage;
