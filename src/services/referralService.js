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
  },

  /**
   * Completely clear all referral records, bonus messages, notifications,
   * ledger transactions, and referral locks for a school so they can start afresh.
   * @param {string} schoolId
   */
  async clearSchoolReferralsAndHistory(schoolId) {
    if (!schoolId) return { success: false, message: 'Missing school ID' };
    const targetSchoolId = String(schoolId).trim();

    try {
      // 1. Remove from Supabase Cloud (report_referrals)
      if (navigator.onLine) {
        try {
          await supabase
            .from('report_referrals')
            .delete()
            .or(`referrer_school_id.eq.${targetSchoolId},referred_school_id.eq.${targetSchoolId}`);

          // Reset referral stats on report_schools
          await supabase
            .from('report_schools')
            .update({
              referral_code: null,
              wallet_balance: 0.00
            })
            .eq('id', targetSchoolId);
        } catch (cloudErr) {
          console.warn('[referralService] Cloud referral purge notice:', cloudErr);
        }
      }

      // 2. Remove all related referral records from Dexie IndexedDB
      const allLocalRefs = await db.referrals
        .filter(r => String(r.referrerSchoolId).trim() === targetSchoolId || String(r.referredSchoolId).trim() === targetSchoolId)
        .toArray();

      const deletedRefIds = new Set(allLocalRefs.map(r => r.id));

      for (const ref of allLocalRefs) {
        if (ref.id) await db.referrals.delete(ref.id);
      }

      // 3. Remove from fraudAnalysis & referralAuditLogs in Dexie
      if (db.fraudAnalysis) {
        const frauds = await db.fraudAnalysis
          .filter(f => deletedRefIds.has(f.referralId))
          .toArray();
        for (const f of frauds) {
          if (f.id) await db.fraudAnalysis.delete(f.id);
        }
      }

      if (db.referralAuditLogs) {
        const auditLogs = await db.referralAuditLogs
          .filter(a => deletedRefIds.has(a.referralId) || (a.details && a.details.includes(targetSchoolId)))
          .toArray();
        for (const a of auditLogs) {
          if (a.id) await db.referralAuditLogs.delete(a.id);
        }
      }

      // 4. Remove all referral bonus received & deducted notifications from db.notifications
      if (db.notifications) {
        const notifs = await db.notifications
          .filter(n => 
            String(n.schoolId).trim() === targetSchoolId &&
            (
              (n.title && (n.title.toLowerCase().includes('referral') || n.title.toLowerCase().includes('welcome bonus'))) ||
              (n.content && (n.content.toLowerCase().includes('referral') || n.content.toLowerCase().includes('welcome bonus')))
            )
          )
          .toArray();
        for (const n of notifs) {
          if (n.id) await db.notifications.delete(n.id);
        }
      }

      // 5. Remove referral ledger transactions from db.walletLedger
      if (db.walletLedger) {
        const ledgerEntries = await db.walletLedger
          .filter(l => 
            String(l.schoolId).trim() === targetSchoolId && 
            (
              l.type === 'REFERRAL_REWARD' || 
              l.type === 'REFERRAL_DEDUCTION' || 
              l.type === 'WELCOME_BONUS' ||
              (l.reference && (l.reference.startsWith('REF-') || l.reference.startsWith('DED-REF-') || l.reference.startsWith('WELCOME-')))
            )
          )
          .toArray();
        for (const entry of ledgerEntries) {
          if (entry.id) await db.walletLedger.delete(entry.id);
        }
      }

      // 6. Reset School entity in Dexie
      const localSchool = await db.schools.get(targetSchoolId);
      if (localSchool) {
        await db.schools.update(targetSchoolId, {
          referralCode: null,
          referredBySchoolId: null,
          referralLocked: false,
          totalSuccessfulReferrals: 0,
          totalReferralEarnings: 0,
          wallet_balance: 0,
          walletBalance: 0
        });
      }

      // 7. Store local timestamp to invalidate any historical test wallet transactions
      try {
        localStorage.setItem('wallet_reset_at_' + targetSchoolId, new Date().toISOString());
      } catch (_) {}

      // 8. Trigger sync/event
      await eventBus.publish('ReferralHistoryCleared', { schoolId: targetSchoolId });

      return {
        success: true,
        message: `All referral records, bonus messages, and transactions for this school have been completely cleared. They can now start afresh!`
      };
    } catch (err) {
      console.error('[referralService] clearSchoolReferralsAndHistory error:', err);
      return { success: false, message: err.message || 'Failed to clear school referrals.' };
    }
  },

  /**
   * Permanently purge a single referral record from Supabase and Dexie
   */
  async purgeSingleReferral(referralId, referrerSchoolId = null, referredSchoolId = null) {
    if (!referralId) return { success: false, message: 'Missing referral ID' };
    const refIdStr = String(referralId).trim();

    try {
      // 1. Supabase Cloud deletion
      if (navigator.onLine) {
        try {
          let q = supabase.from('report_referrals').delete();
          if (refIdStr.includes('-') && !refIdStr.startsWith('REF_')) {
            q = q.eq('id', refIdStr);
          } else if (referredSchoolId) {
            q = q.eq('referred_school_id', referredSchoolId);
          }
          await q;
        } catch (cErr) {
          console.warn('[referralService] Cloud purge notice:', cErr);
        }
      }

      // 2. Dexie deletion
      await db.referrals.delete(refIdStr).catch(() => null);
      const matchingLocal = await db.referrals
        .filter(r => r.id === refIdStr || (referredSchoolId && r.referredSchoolId === referredSchoolId))
        .toArray();
      for (const m of matchingLocal) {
        if (m.id) await db.referrals.delete(m.id);
      }

      // 3. Clear audit logs for this referral
      if (db.referralAuditLogs) {
        const logs = await db.referralAuditLogs.filter(l => l.referralId === refIdStr).toArray();
        for (const log of logs) {
          if (log.id) await db.referralAuditLogs.delete(log.id);
        }
      }

      // 4. Remove matching notifications
      if (db.notifications) {
        const notifs = await db.notifications
          .filter(n => 
            (referrerSchoolId && String(n.schoolId) === String(referrerSchoolId)) &&
            (
              (n.title && n.title.includes('Referral')) ||
              (n.content && n.content.includes('Referral'))
            )
          )
          .toArray();
        for (const notif of notifs) {
          if (notif.id) await db.notifications.delete(notif.id);
        }
      }

      // 5. If referrer school is known, invalidate cache
      if (referrerSchoolId) {
        try {
          localStorage.setItem('wallet_reset_at_' + referrerSchoolId, new Date().toISOString());
        } catch (_) {}
      }

      await eventBus.publish('ReferralPurged', { referralId: refIdStr });
      return { success: true, message: 'Referral record successfully purged.' };
    } catch (err) {
      console.error('[referralService] purgeSingleReferral error:', err);
      return { success: false, message: err.message || 'Failed to purge referral.' };
    }
  }
};

export default referralService;
