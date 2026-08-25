import db from '../lib/db';
import { assertSchoolContext } from './tenantGuard';

export const scoreRepository = {
  async getScores(schoolId, academicYear = null, term = null) {
    const sId = assertSchoolContext(schoolId, 'getScores');
    let collection;

    if (academicYear && term) {
      collection = db.scores.where('[schoolId+academicYear+term]').equals([sId, academicYear, term]);
    } else {
      collection = db.scores.where('schoolId').equals(sId);
    }

    return await collection.toArray();
  },

  async getScoreCount(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getScoreCount');
    return await db.scores.where('schoolId').equals(sId).count();
  }
};

export default scoreRepository;
