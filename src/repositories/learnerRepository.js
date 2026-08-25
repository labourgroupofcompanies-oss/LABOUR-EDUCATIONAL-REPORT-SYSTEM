import db from '../lib/db';
import { supabase } from '../lib/supabase';
import { assertSchoolContext } from './tenantGuard';

export const learnerRepository = {
  /**
   * Get all learners for a school (indexed query)
   */
  async getLearners(schoolId, options = {}) {
    const sId = assertSchoolContext(schoolId, 'getLearners');
    let list = await db.learners.filter(l => this.belongsToSchool(l, sId)).toArray();

    if (options.status) {
      const targetStatus = options.status.toLowerCase();
      list = list.filter(l => (l.status || 'Active').toLowerCase() === targetStatus);
    } else if (options.classId) {
      list = list.filter(l => String(l.currentClassId) === String(options.classId));
    }

    if (options.searchQuery && options.searchQuery.trim()) {
      const q = options.searchQuery.toLowerCase().trim();
      list = list.filter(l =>
        (l.fullName || `${l.firstName || ''} ${l.lastName || ''}`).toLowerCase().includes(q) ||
        (l.regNumber || l.enrollmentCode || '').toLowerCase().includes(q)
      );
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const l of list) {
      const key = l.supabaseId ? `SUB_${l.supabaseId}` : (l.regNumber ? `REG_${String(l.regNumber).trim().toUpperCase()}` : `ID_${l.id}`);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(l);
    }

    return unique;
  },

  /**
   * Helper to verify if a record belongs to a school (string vs number coercion)
   */
  belongsToSchool(learner, schoolId) {
    if (!learner || !schoolId) return false;
    const target = String(schoolId).trim();
    const lSchoolId = learner.schoolId !== undefined && learner.schoolId !== null ? String(learner.schoolId).trim() : '';
    const lSchoolIdSnake = learner.school_id !== undefined && learner.school_id !== null ? String(learner.school_id).trim() : '';
    return lSchoolId === target || lSchoolIdSnake === target;
  },

  /**
   * Total learner count for a school with deduplication and string/number coercion
   */
  async getLearnerCount(schoolId) {
    if (!schoolId) return 0;
    const sId = assertSchoolContext(schoolId, 'getLearnerCount');
    const targetId = String(sId).trim();
    const allLearners = await db.learners.toArray();

    const seenKeys = new Set();
    let count = 0;

    for (const l of allLearners) {
      if (!this.belongsToSchool(l, targetId)) continue;

      const key = l.supabaseId || (l.regNumber ? `REG_${l.regNumber}` : `ID_${l.id}`);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      count++;
    }
    return count;
  },

  /**
   * ACTIVE learner count for subscription billing with deduplication
   */
  async getActiveLearnerCount(schoolId) {
    if (!schoolId) return 0;
    const sId = assertSchoolContext(schoolId, 'getActiveLearnerCount');
    const targetId = String(sId).trim();
    const allLearners = await db.learners.toArray();

    const seenKeys = new Set();
    let count = 0;

    for (const l of allLearners) {
      if (!this.belongsToSchool(l, targetId)) continue;

      const status = (l.status || 'active').toString().toLowerCase().trim();
      if (status === 'alumni' || status === 'graduated' || status === 'transferred' || status === 'inactive') {
        continue;
      }

      const key = l.supabaseId || (l.regNumber ? `REG_${l.regNumber}` : `ID_${l.id}`);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      count++;
    }
    return count;
  },

  /**
   * Get single learner by ID with school isolation
   */
  async getLearnerById(schoolId, learnerId) {
    const sId = assertSchoolContext(schoolId, 'getLearnerById');
    const learner = await db.learners.get(learnerId);
    if (learner && String(learner.schoolId) !== String(sId)) {
      throw new Error(`[TENANT GUARD FAILURE] Cross-tenant access denied for learner ID ${learnerId}`);
    }
    return learner;
  },

  /**
   * Create new learner with audit log
   */
  async createLearner(schoolId, learnerData, userId = 'Admin') {
    const sId = assertSchoolContext(schoolId, 'createLearner');
    const prevCount = await this.getActiveLearnerCount(sId);

    const payload = {
      ...learnerData,
      schoolId: sId,
      status: learnerData.status || 'Active',
      createdAt: learnerData.createdAt || new Date().toISOString()
    };

    const id = await db.learners.put(payload);
    const newCount = prevCount + 1;

    // Audit Log Entry
    await db.auditLogs.add({
      schoolId: sId,
      timestamp: new Date().toISOString(),
      userId,
      action: 'LEARNER_CREATED',
      previousCount: prevCount,
      newCount,
      details: { learnerId: id, name: payload.fullName }
    }).catch(() => null);

    return id;
  },

  /**
   * Update learner with school isolation
   */
  async updateLearner(schoolId, learnerId, updateData, userId = 'Admin') {
    const sId = assertSchoolContext(schoolId, 'updateLearner');
    const existing = await this.getLearnerById(sId, learnerId);
    if (!existing) throw new Error(`Learner not found.`);

    const prevCount = await this.getActiveLearnerCount(sId);

    await db.learners.update(learnerId, {
      ...updateData,
      schoolId: sId
    });

    const newCount = await this.getActiveLearnerCount(sId);

    if (updateData.status && updateData.status !== existing.status) {
      await db.auditLogs.add({
        schoolId: sId,
        timestamp: new Date().toISOString(),
        userId,
        action: `LEARNER_STATUS_${updateData.status.toUpperCase()}`,
        previousCount: prevCount,
        newCount,
        details: { learnerId, previousStatus: existing.status, newStatus: updateData.status }
      }).catch(() => null);
    }
  }
};

export default learnerRepository;
