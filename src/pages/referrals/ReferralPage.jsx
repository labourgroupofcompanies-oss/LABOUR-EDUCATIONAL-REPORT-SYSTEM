import React from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../store/AuthContext';
import ReferralRewardsWidget from '../../components/subscription/ReferralRewardsWidget';
import TeacherReferralCard from '../../components/referrals/TeacherReferralCard';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';

const ReferralPage = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;

  const schoolInfo = useLiveQuery(
    () => schoolId ? db.schools.get(schoolId) : null,
    [schoolId]
  );

  const isTeacher = user?.role === 'teacher';
  const isSuperAdmin = user?.role === 'super_admin' || user?.isPlatformDeveloper;

  return (
    <Layout title={isTeacher ? "Refer Other Schools" : "Referral & Rewards"}>
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
        {/* For teachers: clean referral link sharing without any financial/balance information */}
        {isTeacher ? (
          <TeacherReferralCard schoolId={schoolId} schoolName={schoolInfo?.name} />
        ) : (
          /* For school admins: full referral rewards & pipeline widget */
          <ReferralRewardsWidget schoolId={schoolId} schoolName={schoolInfo?.name} isSuperAdmin={isSuperAdmin} />
        )}
      </div>
    </Layout>
  );
};

export default ReferralPage;
