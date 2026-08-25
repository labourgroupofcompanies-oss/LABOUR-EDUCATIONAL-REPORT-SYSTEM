import db from '../lib/db';
import { assertSchoolContext } from './tenantGuard';

export const attendanceRepository = {
  async getAttendanceSummaries(schoolId, academicYear = null, term = null) {
    const sId = assertSchoolContext(schoolId, 'getAttendanceSummaries');
    let collection;
    if (academicYear && term) {
      collection = db.reportSummaries.where('[schoolId+academicYear+term]').equals([sId, academicYear, term]);
    } else {
      collection = db.reportSummaries.where('schoolId').equals(sId);
    }
    return await collection.toArray();
  }
};

export default attendanceRepository;
