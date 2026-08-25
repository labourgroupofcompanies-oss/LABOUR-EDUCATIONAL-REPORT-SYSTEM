import db from '../lib/db';
import { assertSchoolContext } from './tenantGuard';

export const subjectRepository = {
  async getSubjects(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getSubjects');
    return await db.subjects.where('schoolId').equals(sId).toArray();
  },

  async getSubjectCount(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getSubjectCount');
    return await db.subjects.where('schoolId').equals(sId).count();
  }
};

export default subjectRepository;
