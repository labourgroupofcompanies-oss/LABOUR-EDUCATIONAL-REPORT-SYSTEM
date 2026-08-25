import db from '../lib/db';
import { assertSchoolContext } from './tenantGuard';

export const teacherRepository = {
  async getTeachers(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getTeachers');
    return await db.profiles.where('schoolId').equals(sId)
      .filter(p => p.role === 'teacher' || p.role === 'headteacher' || p.role === 'admin')
      .toArray();
  },

  async getTeacherCount(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getTeacherCount');
    return await db.profiles.where('schoolId').equals(sId)
      .filter(p => p.role === 'teacher' || p.role === 'headteacher' || p.role === 'admin')
      .count();
  }
};

export default teacherRepository;
