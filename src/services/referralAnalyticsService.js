import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { referralService } from './referralService';
import { walletLedgerService } from './walletLedgerService';
import { getEffectiveResetTimestamp } from './subscriptionService';

export const referralAnalyticsService = {
  /**
   * Get telemetry KPIs for Developer / Super Admin Dashboard directly from Supabase
   */
  async getSuperAdminAnalytics() {
    let allReferrals = [];
    let allSchools = [];

    // 1. Fetch live from Supabase (clean queries without brittle embedded resource syntax)
    if (navigator.onLine) {
      try {
        const [refRes, schoolsRes] = await Promise.all([
          supabase.from('report_referrals').select('*').order('created_at', { ascending: false }),
          supabase.from('report_schools').select('id, name')
        ]);

        if (schoolsRes?.data) {
          allSchools = schoolsRes.data;
        }

        if (refRes?.data && Array.isArray(refRes.data)) {
          const schoolMap = new Map(allSchools.map(s => [String(s.id).trim(), s.name]));

          allReferrals = refRes.data.map(r => ({
            id: r.id,
            referrerSchoolId: r.referrer_school_id,
            referredSchoolId: r.referred_school_id,
            referrerSchoolName: schoolMap.get(String(r.referrer_school_id).trim()) || `School #${r.referrer_school_id}`,
            referredSchoolName: schoolMap.get(String(r.referred_school_id).trim()) || `School #${r.referred_school_id}`,
            referralCodeUsed: r.referral_code_used,
            status: r.status,
            rewardAmount: Number(r.reward_amount) || 20.00,
            welcomeBonusAmount: Number(r.welcome_bonus_amount) || 10.00,
            fraudScore: Number(r.fraud_score) || 0,
            fraudFlag: Boolean(r.fraud_flag),
            rejectionReason: r.rejection_reason,
            verifiedBy: r.verified_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at
          }));
        }
      } catch (err) {
        console.warn('[referralAnalyticsService] Cloud analytics fetch notice:', err);
      }
    }

    // 2. Fallback to Dexie if empty or offline
    if (allReferrals.length === 0) {
      const localRefs = await db.referrals.toArray();
      const localSchools = await db.schools.toArray();
      allSchools = localSchools;
      allReferrals = localRefs.map(r => {
        const refSch = localSchools.find(s => String(s.id).trim() === String(r.referrerSchoolId).trim());
        const targetSch = localSchools.find(s => String(s.id).trim() === String(r.referredSchoolId).trim());
        return {
          ...r,
          referrerSchoolName: refSch?.name || `School #${r.referrerSchoolId}`,
          referredSchoolName: targetSch?.name || `School #${r.referredSchoolId}`
        };
      });
    }

    const total = allReferrals.length;
    const underVerification = allReferrals.filter(r => r.status === 'UNDER_VERIFICATION' || r.status === 'PENDING').length;
    const underReview = allReferrals.filter(r => r.status === 'UNDER_REVIEW').length;
    const verified = allReferrals.filter(r => r.status === 'VERIFIED').length;
    const rewarded = allReferrals.filter(r => r.status === 'REWARDED').length;
    const revoked = allReferrals.filter(r => r.status === 'REVOKED' || r.status === 'DEDUCTED').length;
    const rejected = allReferrals.filter(r => r.status === 'REJECTED').length;

    const totalCreditsIssued = allReferrals
      .filter(r => r.status === 'REWARDED')
      .reduce((sum, r) => sum + (Number(r.rewardAmount) || 20.00), 0);

    const fraudCount = allReferrals.filter(r => r.fraudFlag || r.status === 'UNDER_REVIEW').length;
    const fraudRate = total > 0 ? Number(((fraudCount / total) * 100).toFixed(1)) : 0;
    const conversionRate = total > 0 ? Number(((rewarded / total) * 100).toFixed(1)) : 0;

    // Leaderboard of Top Promoter Schools
    const schoolMap = new Map();
    for (const ref of allReferrals) {
      if (ref.status === 'REWARDED' || ref.status === 'VERIFIED') {
        const sId = String(ref.referrerSchoolId).trim();
        const current = schoolMap.get(sId) || { count: 0, earnings: 0, name: ref.referrerSchoolName };
        schoolMap.set(sId, {
          count: current.count + 1,
          earnings: current.earnings + (ref.status === 'REWARDED' ? (Number(ref.rewardAmount) || 20.00) : 0),
          name: ref.referrerSchoolName
        });
      }
    }

    const leaderboard = [];
    for (const [sId, stats] of schoolMap.entries()) {
      leaderboard.push({
        schoolId: sId,
        schoolName: stats.name || `School #${sId}`,
        successfulCount: stats.count,
        totalEarnings: stats.earnings
      });
    }
    leaderboard.sort((a, b) => b.successfulCount - a.successfulCount);

    return {
      allReferrals,
      totalReferrals: total,
      pendingCount: underVerification,
      underVerificationCount: underVerification,
      underReviewCount: underReview,
      verifiedCount: verified,
      rewardedCount: rewarded,
      revokedCount: revoked,
      deductedCount: revoked,
      rejectedCount: rejected,
      totalCreditsIssued,
      fraudCount,
      fraudRate,
      conversionRate,
      leaderboard: leaderboard.slice(0, 10)
    };
  },

  /**
   * Get referral stats and pipeline for an individual School's Portal
   */
  async getSchoolReferralStats(schoolId) {
    if (!schoolId) {
      return { 
        code: null, 
        totalInvited: 0, 
        underVerificationCount: 0, 
        pendingCount: 0, 
        verifiedCount: 0, 
        rewardedCount: 0, 
        totalEarnings: 0, 
        pipeline: [] 
      };
    }

    const targetId = String(schoolId).trim();
    const code = await referralService.getSchoolReferralCode(targetId);

    let referrals = [];
    const resetAt = getEffectiveResetTimestamp(targetId);

    // 1. Fetch live cloud referrals from Supabase cleanly
    if (navigator.onLine) {
      try {
        const { data: rawCloudRefs, error: refError } = await supabase
          .from('report_referrals')
          .select('*')
          .eq('referrer_school_id', targetId)
          .order('created_at', { ascending: false });

        const cloudRefs = (rawCloudRefs || []).filter(r => !resetAt || new Date(r.created_at) > new Date(resetAt));

        if (!refError && Array.isArray(cloudRefs) && cloudRefs.length > 0) {
          // Fetch the referee school details
          const refereeIds = cloudRefs.map(r => r.referred_school_id).filter(Boolean);
          let schoolDetailsMap = new Map();

          if (refereeIds.length > 0) {
            const { data: refereeSchools } = await supabase
              .from('report_schools')
              .select('id, name, location')
              .in('id', refereeIds);

            if (refereeSchools) {
              refereeSchools.forEach(s => schoolDetailsMap.set(String(s.id).trim(), s));
            }
          }

          referrals = cloudRefs.map(r => {
            const refSchool = schoolDetailsMap.get(String(r.referred_school_id).trim());
            return {
              id: r.id,
              referrerSchoolId: r.referrer_school_id,
              referredSchoolId: r.referred_school_id,
              schoolName: refSchool?.name || `School #${r.referred_school_id}`,
              location: refSchool?.location || null,
              referralCodeUsed: r.referral_code_used,
              status: r.status,
              rewardAmount: Number(r.reward_amount) || 20.00,
              createdAt: r.created_at,
              updatedAt: r.updated_at
            };
          });

          // Sync into local Dexie cache
          for (const r of referrals) {
            await db.referrals.put(r).catch(() => null);
          }
        }
      } catch (err) {
        console.warn('[referralAnalyticsService] Cloud referral sync notice:', err);
      }
    }

    // 2. If empty or offline, fallback to Dexie
    if (referrals.length === 0) {
      const rawLocalRefs = await db.referrals.where('referrerSchoolId').equals(targetId).toArray();
      const localRefs = (rawLocalRefs || []).filter(r => !resetAt || new Date(r.createdAt || r.created_at) > new Date(resetAt));
      const allSchools = await db.schools.toArray();
      referrals = localRefs.map(r => {
        const refSchool = allSchools.find(s => String(s.id).trim() === String(r.referredSchoolId).trim());
        return {
          id: r.id,
          referrerSchoolId: r.referrerSchoolId,
          referredSchoolId: r.referredSchoolId,
          schoolName: refSchool?.name || r.schoolName || 'Newly Registered School',
          location: refSchool?.location || null,
          referralCodeUsed: r.referralCodeUsed,
          status: r.status || 'UNDER_VERIFICATION',
          rewardAmount: Number(r.rewardAmount) || 20.00,
          createdAt: r.createdAt
        };
      });
    }

    const totalInvited = referrals.length;
    const underVerification = referrals.filter(r => r.status === 'UNDER_VERIFICATION' || r.status === 'PENDING').length;
    const underReview = referrals.filter(r => r.status === 'UNDER_REVIEW').length;
    const verified = referrals.filter(r => r.status === 'VERIFIED').length;
    const rewarded = referrals.filter(r => r.status === 'REWARDED').length;
    const rejected = referrals.filter(r => r.status === 'REJECTED').length;

    const earnings = referrals
      .filter(r => r.status === 'REWARDED')
      .reduce((sum, r) => sum + (Number(r.rewardAmount) || 20.00), 0);

    return {
      code,
      totalInvited,
      underVerificationCount: underVerification,
      pendingCount: underVerification + underReview,
      verifiedCount: verified,
      rewardedCount: rewarded,
      rejectedCount: rejected,
      totalEarnings: earnings,
      pipeline: referrals
    };
  }
};

export default referralAnalyticsService;
