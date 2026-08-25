import authService from './authService';
import learnerRepository from '../repositories/learnerRepository';
import teacherRepository from '../repositories/teacherRepository';
import classRepository from '../repositories/classRepository';
import subjectRepository from '../repositories/subjectRepository';
import scoreRepository from '../repositories/scoreRepository';
import attendanceRepository from '../repositories/attendanceRepository';
import paymentRepository from '../repositories/paymentRepository';
import reportRepository from '../repositories/reportRepository';
import { assertSchoolContext } from '../repositories/tenantGuard';

// In-Memory Query Count Cache (5 second TTL or instant invalidation on write)
const countCache = new Map();
const CACHE_TTL_MS = 5000;

const getCachedCount = async (key, fetcher) => {
  const now = Date.now();
  const entry = countCache.get(key);
  if (entry && (now - entry.timestamp) < CACHE_TTL_MS) {
    return entry.value;
  }
  const value = await fetcher();
  countCache.set(key, { value, timestamp: now });
  return value;
};

export const schoolDataService = {
  /**
   * Resolve active schoolId automatically from auth session or param
   */
  resolveSchoolId(overrideSchoolId = null) {
    if (overrideSchoolId && String(overrideSchoolId).trim() !== '') {
      return assertSchoolContext(overrideSchoolId, 'schoolDataService (override)');
    }
    const currentUser = authService.getCurrentUser();
    const schoolId = currentUser?.schoolId || currentUser?.school_id;
    return assertSchoolContext(schoolId, 'schoolDataService (auto-resolved)');
  },

  /**
   * Programmatic Cache Invalidation
   */
  invalidateCache(schoolId = null) {
    if (schoolId) {
      const sId = String(schoolId);
      for (const key of countCache.keys()) {
        if (key.startsWith(sId)) {
          countCache.delete(key);
        }
      }
    } else {
      countCache.clear();
    }
  },

  // ── LEARNERS ──────────────────────────────────────────────────────────────
  async getLearners(options = {}, schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await learnerRepository.getLearners(sId, options);
  },

  async getLearner(learnerId, schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await learnerRepository.getLearnerById(sId, learnerId);
  },

  async getLearnerCount(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await getCachedCount(`${sId}_learnerCount`, () => learnerRepository.getLearnerCount(sId));
  },

  async getActiveLearnerCount(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await getCachedCount(`${sId}_activeLearnerCount`, () => learnerRepository.getActiveLearnerCount(sId));
  },

  async createLearner(learnerData, userId = 'Admin', schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    const id = await learnerRepository.createLearner(sId, learnerData, userId);
    this.invalidateCache(sId);
    return id;
  },

  async updateLearner(learnerId, updateData, userId = 'Admin', schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    await learnerRepository.updateLearner(sId, learnerId, updateData, userId);
    this.invalidateCache(sId);
  },

  // ── TEACHERS ──────────────────────────────────────────────────────────────
  async getTeachers(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await teacherRepository.getTeachers(sId);
  },

  async getTeacherCount(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await getCachedCount(`${sId}_teacherCount`, () => teacherRepository.getTeacherCount(sId));
  },

  // ── CLASSES ───────────────────────────────────────────────────────────────
  async getClasses(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await classRepository.getClasses(sId);
  },

  async getClassCount(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await getCachedCount(`${sId}_classCount`, () => classRepository.getClassCount(sId));
  },

  // ── SUBJECTS ──────────────────────────────────────────────────────────────
  async getSubjects(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await subjectRepository.getSubjects(sId);
  },

  async getSubjectCount(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await getCachedCount(`${sId}_subjectCount`, () => subjectRepository.getSubjectCount(sId));
  },

  // ── SCORES & ACADEMICS ───────────────────────────────────────────────────
  async getScores(academicYear = null, term = null, schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await scoreRepository.getScores(sId, academicYear, term);
  },

  async getAttendance(academicYear = null, term = null, schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await attendanceRepository.getAttendanceSummaries(sId, academicYear, term);
  },

  // ── PAYMENTS & REPORTS ───────────────────────────────────────────────────
  async getPayments(schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await paymentRepository.getPayments(sId);
  },

  async getReports(academicYear = null, term = null, schoolId = null) {
    const sId = this.resolveSchoolId(schoolId);
    return await reportRepository.getReports(sId, academicYear, term);
  }
};

export default schoolDataService;
