import db from '../lib/db';
import { assertSchoolContext } from './tenantGuard';

export const classRepository = {
  async getClasses(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getClasses');
    return await db.classes.where('schoolId').equals(sId).toArray();
  },

  async getClassCount(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getClassCount');
    return await db.classes.where('schoolId').equals(sId).count();
  },

  async getClassById(schoolId, classId) {
    const sId = assertSchoolContext(schoolId, 'getClassById');
    const cls = await db.classes.get(classId);
    if (cls && String(cls.schoolId) !== String(sId)) {
      throw new Error(`[TENANT GUARD FAILURE] Cross-tenant access denied for class ID ${classId}`);
    }
    return cls;
  }
};

export default classRepository;
