import db from '../lib/db';
import { assertSchoolContext } from './tenantGuard';

export const reportRepository = {
  async getReports(schoolId, academicYear = null, term = null) {
    const sId = assertSchoolContext(schoolId, 'getReports');
    let collection;
    if (academicYear && term) {
      collection = db.reportSummaries.where('[schoolId+academicYear+term]').equals([sId, academicYear, term]);
    } else {
      collection = db.reportSummaries.where('schoolId').equals(sId);
    }
    return await collection.toArray();
  },

  async getReportCount(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getReportCount');
    return await db.reportSummaries.where('schoolId').equals(sId).count();
  }
};

export default reportRepository;
