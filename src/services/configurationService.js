import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

const DEFAULT_CONFIG = {
  id: 'global',
  rewardAmount: 20.00,
  welcomeBonusAmount: 0.00,
  referralExpiryDays: 7,
  maxReferralsPerMonth: 20,
  fraudThreshold: 0.4,
  isProgramEnabled: true,
  requireVerification: true,
  enableWelcomeBonus: false,
  updatedAt: new Date().toISOString()
};

export const configurationService = {
  /**
   * Get dynamic referral configurations (Dexie local cache + Supabase sync)
   */
  async getReferralConfig() {
    try {
      const local = await db.referralConfigs.get('global');
      if (local) return { ...DEFAULT_CONFIG, ...local };

      // Fallback seed
      await db.referralConfigs.put(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    } catch (err) {
      console.warn('[configurationService] Error reading config:', err);
      return DEFAULT_CONFIG;
    }
  },

  /**
   * Update referral configurations (Super Admin Console)
   */
  async updateReferralConfig(newConfig, userId = 'Super Admin') {
    const updated = {
      ...DEFAULT_CONFIG,
      ...newConfig,
      id: 'global',
      updatedAt: new Date().toISOString(),
      updatedBy: userId
    };

    // Save local IndexedDB
    await db.referralConfigs.put(updated);

    // Save Supabase cloud storage (best-effort)
    if (navigator.onLine) {
      try {
        await supabase
          .from('platform_referral_configs')
          .upsert({
            id: 'global',
            reward_amount: updated.rewardAmount,
            welcome_bonus_amount: updated.welcomeBonusAmount,
            referral_expiry_days: updated.referralExpiryDays,
            max_referrals_per_month: updated.maxReferralsPerMonth,
            fraud_threshold: updated.fraudThreshold,
            is_program_enabled: updated.isProgramEnabled,
            require_verification: updated.requireVerification,
            enable_welcome_bonus: updated.enableWelcomeBonus,
            updated_at: updated.updatedAt
          });
      } catch (cloudErr) {
        console.warn('[configurationService] Supabase config sync notice:', cloudErr);
      }
    }

    return updated;
  }
};

export default configurationService;
