import db from '../lib/db';
import { assertSchoolContext } from './tenantGuard';

export const paymentRepository = {
  async getPayments(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getPayments');
    return await db.payments.where('schoolId').equals(sId).toArray();
  },

  async getPaymentCount(schoolId) {
    const sId = assertSchoolContext(schoolId, 'getPaymentCount');
    return await db.payments.where('schoolId').equals(sId).count();
  }
};

export default paymentRepository;
