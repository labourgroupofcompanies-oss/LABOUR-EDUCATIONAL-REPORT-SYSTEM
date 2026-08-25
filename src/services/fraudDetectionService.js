import { db } from '../lib/db';

export const fraudDetectionService = {
  /**
   * Evaluate fraud risk score (0.0 to 1.0) for a new referral link
   */
  async analyzeReferralRisk(referrerSchoolId, newSchoolData, clientFingerprint = '') {
    let score = 0.0;
    const riskFactors = [];

    if (!referrerSchoolId || !newSchoolData) {
      return { score: 1.0, riskFactors: ['INVALID_PAYLOAD'], fraudFlag: true };
    }

    const sRefId = String(referrerSchoolId).trim();
    const sNewId = newSchoolData.id ? String(newSchoolData.id).trim() : '';

    // Rule 1: Self-Referral Check (SAME SCHOOL ID)
    if (sRefId === sNewId) {
      score += 1.0;
      riskFactors.push('SELF_REFERRAL_SAME_SCHOOL_ID');
    }

    const referrerSchool = await db.schools.get(sRefId);
    if (referrerSchool) {
      // Rule 2: Referral Loop Check (School B refers School A when A referred B)
      if (String(referrerSchool.referredBySchoolId).trim() === sNewId) {
        score += 1.0;
        riskFactors.push('CIRCULAR_REFERRAL_LOOP_DETECTED');
      }

      // Rule 3: Duplicate Phone Number Check
      if (referrerSchool.phone && newSchoolData.phone && referrerSchool.phone.trim() === newSchoolData.phone.trim()) {
        score += 0.5;
        riskFactors.push('DUPLICATE_CONTACT_PHONE');
      }

      // Rule 4: Duplicate Email Check
      if (referrerSchool.email && newSchoolData.email && referrerSchool.email.trim().toLowerCase() === newSchoolData.email.trim().toLowerCase()) {
        score += 0.5;
        riskFactors.push('DUPLICATE_CONTACT_EMAIL');
      }

      // Rule 5: Exact School Name Match
      if (referrerSchool.name && newSchoolData.name && referrerSchool.name.trim().toLowerCase() === newSchoolData.name.trim().toLowerCase()) {
        score += 0.6;
        riskFactors.push('DUPLICATE_SCHOOL_NAME');
      }

      // Rule 6: Duplicate Government Registration Code
      if (referrerSchool.gesCode && newSchoolData.gesCode && referrerSchool.gesCode.trim() === newSchoolData.gesCode.trim()) {
        score += 0.8;
        riskFactors.push('DUPLICATE_GES_REGISTRATION_CODE');
      }
    }

    const finalScore = Math.min(1.0, Number(score.toFixed(2)));
    const fraudFlag = finalScore >= 0.4;

    return {
      fraudScore: finalScore,
      riskFactors,
      fraudFlag
    };
  }
};

export default fraudDetectionService;
