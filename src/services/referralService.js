import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { configurationService } from './configurationService';
import { fraudDetectionService } from './fraudDetectionService';
import { eventBus } from './eventBus';
import { enqueueSync } from './syncEngine';

export const referralService = {
  /**
   * Generate clean, unique non-duplicating referral code
   */
  generateReferralCode(schoolId, schoolName = '') {
    const prefix = 'REF';
    const cleanName = String(schoolName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'SCH';
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const idSegment = String(schoolId).replace(/[^0-9]/g, '').slice(-3) || '101';
    return `${prefix}-${cleanName}-${idSegment}${randomSuffix}`;
  },

  /**
   * Get or initialize school's unique referral code and persist to Supabase & Dexie
   */
  async getSchoolReferralCode(schoolId) {
    if (!schoolId) return null;
    const targetId = String(schoolId).trim();
    let school = await db.schools.get(targetId);

    // 1. Check if Dexie already has a referral code
    if (school?.referralCode) {
      return school.referralCode;
    }

    // 2. Fetch from Supabase
    if (navigator.onLine) {
      try {
        const { data: remote, error } = await supabase
          .from('report_schools')
          .select('id, name, referral_code')
          .eq('id', targetId)
          .maybeSingle();

        if (!error && remote) {
          if (remote.referral_code) {
            const updated = { ...(school || { id: targetId, name: remote.name }), referralCode: remote.referral_code };
            await db.schools.put(updated).catch(() => null);
            return remote.referral_code;
          }

          // Generate code and save to Supabase
          const newCode = this.generateReferralCode(targetId, remote.name || 'SCH');
          await supabase
            .from('report_schools')
            .update({ referral_code: newCode })
            .eq('id', targetId)
            .catch(() => null);

          const updated = { ...(school || { id: targetId, name: remote.name }), referralCode: newCode };
          await db.schools.put(updated).catch(() => null);
          return newCode;
        }
      } catch (err) {
        console.warn('[referralService] Remote school fetch failed:', err);
      }
    }

    // 3. Fallback: generate and save locally
    const newCode = this.generateReferralCode(targetId, school?.name || 'SCH');
    const updated = { ...(school || { id: targetId }), referralCode: newCode };
    await db.schools.put(updated).catch(() => null);

    return newCode;
  },

  /**
   * Attach referral code during registration or within expiry window
   */
  async attachReferralCode(newSchoolId, referralCode, newSchoolData = {}) {
    if (!newSchoolId || !referralCode) return { success: false, message: 'Missing parameters.' };

    const config = await configurationService.getReferralConfig();
    if (!config.isProgramEnabled) {
      return { success: false, message: 'Referral program is currently inactive.' };
    }

    const cleanCode = String(referralCode).trim().toUpperCase();
    const targetSchoolId = String(newSchoolId).trim();

    // 1. Check if new school is already locked
    let newSchool = await db.schools.get(targetSchoolId);
    if (newSchool?.referralLocked || newSchool?.referredBySchoolId) {
      return { success: false, message: 'Referral code has already been permanently attached and locked.' };
    }

    // 2. Check in Supabase if new school already has an attached referral
    if (navigator.onLine) {
      try {
        const { data: existingRef } = await supabase
          .from('report_referrals')
          .select('id')
          .eq('referred_school_id', targetSchoolId)
          .maybeSingle();

        if (existingRef) {
          return { success: false, message: 'A referral relationship is already registered for this school.' };
        }
      } catch (e) {
        console.warn('[referralService] Existing referral check notice:', e);
      }
    }

    // 3. Find Referrer School by Referral Code (Direct Supabase query + Local Dexie)
    let referrerSchool = null;

    if (navigator.onLine) {
      try {
        // Query by referral_code column
        const { data: directMatch } = await supabase
          .from('report_schools')
          .select('id, name, referral_code')
          .eq('referral_code', cleanCode)
          .maybeSingle();

        if (directMatch) {
          referrerSchool = directMatch;
        } else {
          // Query all schools to find matching name prefix or ID
          const { data: allRemote } = await supabase.from('report_schools').select('id, name, referral_code');
          if (allRemote && allRemote.length > 0) {
            for (const s of allRemote) {
              const potentialCode = this.generateReferralCode(s.id, s.name);
              const idSegment = String(s.id).replace(/[^0-9]/g, '').slice(-3);
              if (
                (s.referral_code && s.referral_code.toUpperCase() === cleanCode) ||
                potentialCode.toUpperCase() === cleanCode
              ) {
                referrerSchool = { id: s.id, name: s.name, referralCode: cleanCode };
                // Persist the code in Supabase if not already saved
                if (!s.referral_code) {
                  try {
                    await supabase.from('report_schools').update({ referral_code: cleanCode }).eq('id', s.id);
                  } catch (_) {}
                }
                break;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[referralService] Remote referrer lookup notice:', err);
      }
    }

    if (!referrerSchool) {
      const allSchools = await db.schools.toArray();
      referrerSchool = allSchools.find(s => s.referralCode && String(s.referralCode).trim().toUpperCase() === cleanCode);
    }

    if (!referrerSchool) {
      console.warn(`[referralService] Referral code "${cleanCode}" could not be resolved to an existing school.`);
      return { success: false, message: 'Invalid referral code provided.' };
    }

    if (String(referrerSchool.id).trim() === targetSchoolId) {
      return { success: false, message: 'Self-referral is strictly prohibited.' };
    }

    // 4. Run Fraud Detection Engine
    const fraudAnalysis = await fraudDetectionService.analyzeReferralRisk(referrerSchool.id, {
      ...newSchoolData,
      id: targetSchoolId
    });

    const initialStatus = fraudAnalysis.fraudFlag ? 'UNDER_REVIEW' : 'UNDER_VERIFICATION';

    const nowIso = new Date().toISOString();
    const referralRecord = {
      referrerSchoolId: String(referrerSchool.id).trim(),
      referredSchoolId: targetSchoolId,
      referralCodeUsed: cleanCode,
      status: initialStatus,
      rewardAmount: config.rewardAmount || 20.00,
      welcomeBonusAmount: config.welcomeBonusAmount || 10.00,
      fraudScore: fraudAnalysis.fraudScore || 0,
      fraudFlag: Boolean(fraudAnalysis.fraudFlag),
      rejectionReason: fraudAnalysis.fraudFlag ? `Flagged by Anti-Fraud Engine: ${fraudAnalysis.riskFactors?.join(', ')}` : null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // 5. Save to Supabase (Cloud Source of Truth)
    const generatedUuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null;
    let cloudId = null;
    if (navigator.onLine) {
      try {
        const payload = {
          ...(generatedUuid ? { id: generatedUuid } : {}),
          referrer_school_id: referralRecord.referrerSchoolId,
          referred_school_id: referralRecord.referredSchoolId,
          referral_code_used: referralRecord.referralCodeUsed,
          status: referralRecord.status,
          reward_amount: referralRecord.rewardAmount,
          welcome_bonus_amount: referralRecord.welcomeBonusAmount,
          fraud_score: referralRecord.fraudScore,
          fraud_flag: referralRecord.fraudFlag,
          rejection_reason: referralRecord.rejectionReason,
          created_at: nowIso,
          updated_at: nowIso
        };

        const { data: inserted, error: insErr } = await supabase
          .from('report_referrals')
          .insert([payload])
          .select('id')
          .maybeSingle();

        if (!insErr && inserted) {
          cloudId = inserted.id;
        } else {
          console.warn('[referralService] Supabase insert warning:', insErr);
          await enqueueSync('insert', 'report_referrals', payload, referralRecord.referrerSchoolId);
        }
      } catch (cloudErr) {
        console.warn('[referralService] Supabase save error, queuing outbox sync:', cloudErr);
        await enqueueSync('insert', 'report_referrals', {
          ...(generatedUuid ? { id: generatedUuid } : {}),
          referrer_school_id: referralRecord.referrerSchoolId,
          referred_school_id: referralRecord.referredSchoolId,
          referral_code_used: referralRecord.referralCodeUsed,
          status: referralRecord.status,
          reward_amount: referralRecord.rewardAmount,
          welcome_bonus_amount: referralRecord.welcomeBonusAmount
        }, referralRecord.referrerSchoolId);
      }
    }

    referralRecord.id = cloudId || generatedUuid || `REF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Save Referral record to Dexie
    await db.referrals.put(referralRecord);

    // Save Fraud Analysis record if flagged
    if (fraudAnalysis.fraudFlag) {
      await db.fraudAnalysis.add({
        id: `FRAUD_${Date.now()}`,
        referralId: referralRecord.id,
        fraudScore: fraudAnalysis.fraudScore,
        riskFactors: fraudAnalysis.riskFactors,
        createdAt: nowIso
      }).catch(() => null);
    }

    // Lock relationship in School Entity
    const updatedNewSchool = {
      ...(newSchool || { id: targetSchoolId }),
      name: newSchool?.name || newSchoolData.schoolName || 'Referred School',
      referredBySchoolId: referrerSchool.id,
      referralLocked: true,
      referredAt: nowIso
    };
    await db.schools.put(updatedNewSchool);

    // Audit Log
    await db.referralAuditLogs.add({
      id: `LOG_${Date.now()}`,
      referralId: referralRecord.id,
      action: 'REFERRAL_ATTACHED',
      details: `Referral code ${cleanCode} attached for ${updatedNewSchool.name}. Status: ${initialStatus}.`,
      createdAt: nowIso
    }).catch(() => null);

    // Publish Event
    await eventBus.publish('ReferralAttached', referralRecord);

    return {
      success: true,
      message: `Referral code ${cleanCode} attached successfully! Status: Under Verification.`,
      referral: referralRecord
    };
  },

  /**
   * Super Admin / Developer Verification
   */
  async verifyReferral(referralId, verifiedBy = 'Developer / Super Admin') {
    const nowIso = new Date().toISOString();

    // 1. Update in Supabase
    if (navigator.onLine && referralId) {
      try {
        let { error } = await supabase
          .from('report_referrals')
          .update({
            status: 'VERIFIED',
            verified_by: verifiedBy,
            verified_at: nowIso,
            updated_at: nowIso
          })
          .eq('id', referralId);

        if (error) {
          console.warn('[referralService] Initial verify update notice, retrying simplified update:', error);
          await supabase
            .from('report_referrals')
            .update({ status: 'VERIFIED' })
            .eq('id', referralId);
        }
      } catch (err) {
        console.warn('[referralService] Supabase verify error:', err);
      }
    }

    // 2. Update in Dexie
    let referral = await db.referrals.get(referralId);
    if (!referral) {
      // Look up by string or filter
      referral = await db.referrals.filter(r => r.id === referralId || r.supabaseId === referralId).first();
    }

    if (referral) {
      const updated = {
        ...referral,
        status: 'VERIFIED',
        verifiedBy,
        verificationDate: nowIso,
        updatedAt: nowIso
      };
      await db.referrals.put(updated);
    }

    await db.referralAuditLogs.add({
      id: `LOG_${Date.now()}`,
      referralId,
      action: 'REFERRAL_VERIFIED',
      details: `Referral verified by ${verifiedBy}`,
      createdAt: nowIso
    }).catch(() => null);

    await eventBus.publish('ReferralVerified', { id: referralId, status: 'VERIFIED' });
    return { success: true };
  },

  /**
   * Super Admin / Developer Rejection
   */
  async rejectReferral(referralId, reason = 'Administrative Rejection', actor = 'Developer / Super Admin') {
    const nowIso = new Date().toISOString();

    // 1. Update in Supabase
    if (navigator.onLine) {
      try {
        await supabase
          .from('report_referrals')
          .update({
            status: 'REJECTED',
            rejection_reason: reason,
            updated_at: nowIso
          })
          .eq('id', referralId);
      } catch (err) {
        console.warn('[referralService] Supabase reject error:', err);
      }
    }

    // 2. Update in Dexie
    let referral = await db.referrals.get(referralId);
    if (!referral) {
      referral = await db.referrals.filter(r => r.id === referralId || r.supabaseId === referralId).first();
    }

    if (referral) {
      const updated = {
        ...referral,
        status: 'REJECTED',
        rejectionReason: reason,
        updatedAt: nowIso
      };
      await db.referrals.put(updated);
    }

    await db.referralAuditLogs.add({
      id: `LOG_${Date.now()}`,
      referralId,
      action: 'REFERRAL_REJECTED',
      details: `Referral rejected by ${actor}. Reason: ${reason}`,
      createdAt: nowIso
    }).catch(() => null);

    await eventBus.publish('ReferralRejected', { id: referralId, status: 'REJECTED' });
    return { success: true };
  }
};

export default referralService;
