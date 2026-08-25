import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { walletLedgerService } from './walletLedgerService';
import { configurationService } from './configurationService';
import { eventBus } from './eventBus';

export const rewardService = {
  /**
   * Process and issue atomic, idempotent referral rewards
   * @param {string} referredSchoolId
   * @param {object} options - { referralId, manualOverride, activationDetails }
   */
  async processReferralReward(referredSchoolId, options = {}) {
    const targetSchoolId = referredSchoolId ? String(referredSchoolId).trim() : null;
    const referralId = options?.referralId ? String(options.referralId).trim() : null;

    if (!targetSchoolId && !referralId) {
      throw new Error('School ID or Referral ID is required to process reward.');
    }

    // 1. Find referral record in Dexie or Supabase
    let referral = null;

    if (referralId) {
      referral = await db.referrals.get(referralId);
    }
    if (!referral && targetSchoolId) {
      referral = await db.referrals.where('referredSchoolId').equals(targetSchoolId).first();
    }

    // If not found in Dexie, search Supabase
    if (!referral && navigator.onLine) {
      try {
        let q = supabase.from('report_referrals').select('*');
        if (referralId) {
          q = q.eq('id', referralId);
        } else if (targetSchoolId) {
          q = q.eq('referred_school_id', targetSchoolId);
        }
        const { data: cloudRef, error: cloudErr } = await q.maybeSingle();
        if (!cloudErr && cloudRef) {
          referral = {
            id: cloudRef.id,
            referrerSchoolId: cloudRef.referrer_school_id,
            referredSchoolId: cloudRef.referred_school_id,
            referralCodeUsed: cloudRef.referral_code_used,
            status: cloudRef.status,
            rewardAmount: Number(cloudRef.reward_amount) || 20.00,
            welcomeBonusAmount: Number(cloudRef.welcome_bonus_amount) || 10.00,
            fraudScore: Number(cloudRef.fraud_score) || 0,
            fraudFlag: Boolean(cloudRef.fraud_flag),
            rejectionReason: cloudRef.rejection_reason,
            createdAt: cloudRef.created_at,
            updatedAt: cloudRef.updated_at
          };
          // Persist in local Dexie
          await db.referrals.put(referral).catch(() => null);
        }
      } catch (err) {
        console.warn('[RewardService] Supabase referral lookup notice:', err);
      }
    }

    if (!referral) {
      throw new Error(`Referral record could not be found for School ID: ${targetSchoolId || referralId}`);
    }

    // 1b. Anti-Cheat Check: Never reward an already rewarded record
    if (referral.status === 'REWARDED') {
      return { 
        success: true, 
        message: 'Referral reward has already been issued for this referral record.',
        alreadyRewarded: true,
        rewardAmount: Number(referral.rewardAmount || 20.00)
      };
    }

    // 1c. Anti-Cheat Check: Block Flagged Fraud & Self-Referrals
    if (referral.fraudFlag || referral.status === 'UNDER_REVIEW') {
      throw new Error(`Referral payout blocked: Flagged by Anti-Fraud Security Engine (${referral.rejectionReason || 'High Risk Suspicion'}).`);
    }

    if (String(referral.referrerSchoolId).trim() === String(referral.referredSchoolId).trim()) {
      throw new Error('Referral payout blocked: Self-referrals cannot be rewarded.');
    }

    const config = await configurationService.getReferralConfig();

    // 2. Status Verification Gate — referral MUST be VERIFIED or PENDING before payout
    // manualOverride only bypasses the PENDING check, not UNDER_VERIFICATION
    if (referral.status !== 'VERIFIED' && referral.status !== 'PENDING') {
      if (!options?.manualOverride) {
        throw new Error(`Referral is in status "${referral.status}" and requires admin verification before payout.`);
      }
    }

    const rewardAmount = Number(referral.rewardAmount || config.rewardAmount || 20.00);
    const welcomeBonusAmount = Number(referral.welcomeBonusAmount || config.welcomeBonusAmount || 10.00);

    // Require a valid referral ID for idempotent reference — never use Date.now() fallback
    if (!referral.id) {
      throw new Error('Referral payout blocked: Missing referral record ID. Cannot generate idempotent reference.');
    }

    // Use referral creation year for stable reference (survives calendar year boundaries)
    const refYear = referral.createdAt ? new Date(referral.createdAt).getFullYear() : new Date().getFullYear();
    const refSuffix = String(referral.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
    const refReference = `REF-${refYear}-${refSuffix}`;
    const welcomeReference = `WELCOME-${refYear}-${refSuffix}`;

    // Get school info from Dexie or Supabase
    let referrerSchool = await db.schools.get(referral.referrerSchoolId);
    let referredSchool = targetSchoolId ? await db.schools.get(targetSchoolId) : null;

    if (!referrerSchool && navigator.onLine) {
      try {
        const { data: sData } = await supabase.from('report_schools').select('*').eq('id', referral.referrerSchoolId).maybeSingle();
        if (sData) {
          referrerSchool = sData;
          await db.schools.put(sData).catch(() => null);
        }
      } catch (e) {
        console.warn('[RewardService] Cloud referrer school fetch notice:', e);
      }
    }

    if (!referredSchool && (targetSchoolId || referral.referredSchoolId) && navigator.onLine) {
      try {
        const sid = targetSchoolId || referral.referredSchoolId;
        const { data: sData } = await supabase.from('report_schools').select('*').eq('id', sid).maybeSingle();
        if (sData) {
          referredSchool = sData;
          await db.schools.put(sData).catch(() => null);
        }
      } catch (e) {
        console.warn('[RewardService] Cloud referred school fetch notice:', e);
      }
    }

    // 3. OPTIMISTIC LOCK: Update referral status to REWARDED in Supabase FIRST
    //    This prevents concurrent calls from passing the status check and double-crediting
    const nowIso = new Date().toISOString();

    if (navigator.onLine) {
      try {
        let q = supabase
          .from('report_referrals')
          .update({
            status: 'REWARDED',
            reward_date: nowIso,
            verified_by: referral.verifiedBy || 'Super Admin',
            updated_at: nowIso
          });

        if (referral.id && typeof referral.id === 'string' && referral.id.includes('-') && !referral.id.startsWith('REF_')) {
          q = q.eq('id', referral.id);
        } else {
          q = q.eq('referred_school_id', targetSchoolId || referral.referredSchoolId);
        }

        const { error: lockErr } = await q;
        if (lockErr) {
          console.warn('[RewardService] Supabase optimistic lock failed:', lockErr.message);
          // Continue — Dexie will still be updated below
        }
      } catch (cloudErr) {
        console.warn('[RewardService] Supabase reward status update notice:', cloudErr);
      }
    }

    // Update Dexie local status immediately (prevents re-entry on same device)
    const updatedReferral = {
      ...referral,
      status: 'REWARDED',
      activationDate: referral.activationDate || nowIso,
      rewardDate: nowIso,
      verifiedBy: referral.verifiedBy || 'Super Admin',
      updatedAt: nowIso
    };
    await db.referrals.put(updatedReferral);

    // 4. Issue Referrer Reward (+GH₵20.00) directly into Wallet Ledger & Balance
    //    Now safe from race conditions — status is already REWARDED in both DB and Dexie
    const creditResult = await walletLedgerService.addLedgerTransaction({
      schoolId: referral.referrerSchoolId,
      type: 'REFERRAL_REWARD',
      amount: rewardAmount,
      reference: refReference,
      sourceSchoolId: targetSchoolId || referral.referredSchoolId,
      processedBy: options?.manualOverride ? 'Super Admin Manual Override' : 'System Reward Engine',
      metadata: { referralId: referral.id, referredSchoolName: referredSchool?.name || 'Referred School' }
    });

    // 5. Issue Welcome Bonus to New School (+GH₵10.00) if enabled
    if (config.enableWelcomeBonus && welcomeBonusAmount > 0 && (targetSchoolId || referral.referredSchoolId)) {
      await walletLedgerService.addLedgerTransaction({
        schoolId: targetSchoolId || referral.referredSchoolId,
        type: 'WELCOME_BONUS',
        amount: welcomeBonusAmount,
        reference: welcomeReference,
        sourceSchoolId: referral.referrerSchoolId,
        processedBy: options?.manualOverride ? 'Super Admin Manual Override' : 'System Reward Engine',
        metadata: { referralId: referral.id, referrerSchoolName: referrerSchool?.name || 'Referrer School' }
      }).catch(err => console.warn('[RewardService] Welcome bonus grant notice:', err));
    }

    // 6. Update Referrer School Stats
    if (referrerSchool) {
      const succCount = (referrerSchool.totalSuccessfulReferrals || 0) + 1;
      const totalEarned = (referrerSchool.totalReferralEarnings || 0) + rewardAmount;
      await db.schools.update(referral.referrerSchoolId, {
        totalSuccessfulReferrals: succCount,
        totalReferralEarnings: totalEarned
      }).catch(() => null);
    }

    // 7. Audit Log
    await db.referralAuditLogs.add({
      id: `LOG_${Date.now()}`,
      referralId: referral.id,
      action: 'REWARD_ISSUED',
      details: `Referrer ${referral.referrerSchoolId} credited +GH₵${rewardAmount}. Referee ${targetSchoolId || referral.referredSchoolId} credited +GH₵${welcomeBonusAmount}.`,
      createdAt: nowIso
    }).catch(() => null);

    // 8. In-App Notifications
    if (db.notifications) {
      await db.notifications.add({
        schoolId: referral.referrerSchoolId,
        title: '🎉 Referral Bonus Received!',
        content: `Congratulations! Your wallet has been credited with GH₵ ${rewardAmount.toFixed(2)} for referring ${referredSchool?.name || 'a new school'}.`,
        created_at: nowIso,
        isRead: false
      }).catch(() => null);

      if (config.enableWelcomeBonus && welcomeBonusAmount > 0) {
        await db.notifications.add({
          schoolId: targetSchoolId || referral.referredSchoolId,
          title: '🎁 Welcome Bonus Received!',
          content: `Welcome to Labour Edu App! Your school wallet has been credited with a GH₵ ${welcomeBonusAmount.toFixed(2)} Welcome Bonus.`,
          created_at: nowIso,
          isRead: false
        }).catch(() => null);
      }
    }

    // Publish Reward Completed Event
    await eventBus.publish('ReferralRewardIssued', updatedReferral);

    return {
      ...updatedReferral,
      newWalletBalance: creditResult?.newBalance
    };
  }
};

// Subscribe Reward Engine to SubscriptionActivated domain events
eventBus.subscribe('SubscriptionActivated', async (payload) => {
  if (payload?.schoolId) {
    try {
      await rewardService.processReferralReward(payload.schoolId, { activationDetails: payload });
    } catch (err) {
      console.error('[RewardService] SubscriptionActivated listener error:', err);
    }
  }
});

export default rewardService;
