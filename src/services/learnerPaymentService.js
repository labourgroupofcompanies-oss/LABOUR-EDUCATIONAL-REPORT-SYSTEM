import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { enqueueSync } from './syncEngine';

/**
 * Enterprise Learner Payment & Financial Accounting Service
 */
const learnerPaymentService = {
  /**
   * Fetch fee structure items for a school / class
   */
  async getFeeStructure(schoolId, academicYear = null, term = null, className = null) {
    try {
      if (!schoolId) return [];

      let query = supabase
        .from('school_fee_structure')
        .select('*')
        .eq('school_id', schoolId);

      if (academicYear) query = query.eq('academic_year', academicYear);
      if (term) query = query.eq('term', term);

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        // Sync to local Dexie
        for (const item of data) {
          await db.feeStructure.put({
            id: item.id,
            schoolId: item.school_id,
            academicYear: item.academic_year,
            term: item.term,
            className: item.class_name,
            feeCategory: item.fee_category,
            amount: Number(item.amount),
            isMandatory: item.is_mandatory,
            displayOrder: item.display_order,
            createdAt: item.created_at
          }).catch(() => null);
        }
        return data;
      }

      // Offline fallback
      return await db.feeStructure.where('schoolId').equals(schoolId).toArray();
    } catch (err) {
      console.warn('[learnerPaymentService] getFeeStructure fallback:', err.message);
      return await db.feeStructure.where('schoolId').equals(schoolId).toArray();
    }
  },

  /**
   * Save or Update Fee Structure item
   */
  async saveFeeStructureItem(schoolId, itemData, staffName = 'Admin') {
    const itemId = itemData.id || crypto.randomUUID();
    const payload = {
      id: itemId,
      school_id: schoolId,
      academic_year: itemData.academic_year || '2025/2026',
      term: itemData.term || 'Term 1',
      class_name: itemData.class_name || 'All Classes',
      fee_category: itemData.fee_category || 'Tuition',
      amount: Number(itemData.amount || 0),
      is_mandatory: itemData.is_mandatory !== false,
      display_order: Number(itemData.display_order || 1)
    };

    // Save locally to Dexie
    await db.feeStructure.put({
      id: itemId,
      schoolId,
      academicYear: payload.academic_year,
      term: payload.term,
      className: payload.class_name,
      feeCategory: payload.fee_category,
      amount: payload.amount,
      isMandatory: payload.is_mandatory,
      displayOrder: payload.display_order
    });

    if (navigator.onLine) {
      try {
        await supabase.from('school_fee_structure').upsert([payload]);
        // Audit log
        await supabase.from('financial_audit_log').insert({
          school_id: schoolId,
          staff_id: staffName,
          action: 'Fee Structure Updated',
          entity: 'school_fee_structure',
          entity_id: itemId,
          new_values: payload
        }).catch(() => null);
      } catch (err) {
        console.warn('[learnerPaymentService] Cloud fee structure save error:', err);
        await enqueueSync('upsert', 'school_fee_structure', payload, schoolId);
      }
    } else {
      await enqueueSync('upsert', 'school_fee_structure', payload, schoolId);
    }

    return payload;
  },

  /**
   * Record a learner fee payment (With auto-allocations, idempotency, and cashbook check)
   */
  async recordPayment(paymentData, staffName = 'Bursar') {
    const clientTxId = crypto.randomUUID();
    const schoolId = paymentData.schoolId;
    const learnerId = paymentData.learnerId;
    const amount = Number(paymentData.amount);
    const academicYear = paymentData.academicYear || '2025/2026';
    const term = paymentData.term || 'Term 1';
    const paymentMethod = paymentData.paymentMethod || 'CASH';
    const notes = paymentData.notes || '';
    const allocations = paymentData.allocations || [{ category: 'Tuition & General Fees', amount }];

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase.rpc('record_learner_payment', {
          p_client_tx_id: clientTxId,
          p_school_id: schoolId,
          p_learner_id: learnerId,
          p_academic_year: academicYear,
          p_term: term,
          p_amount: amount,
          p_payment_method: paymentMethod,
          p_allocations: allocations,
          p_notes: notes,
          p_received_by: staffName
        });

        if (error) throw error;
        if (data && !data.success) {
          throw new Error(data.error || 'Failed to record payment');
        }

        // Cache local transaction
        if (data?.transaction) {
          await db.feeTransactions.put({
            id: data.transaction.id,
            clientTxId,
            schoolId,
            learnerId,
            academicYear,
            term,
            transactionType: 'PAYMENT',
            amount,
            balanceBefore: data.transaction.balance_before,
            balanceAfter: data.transaction.balance_after,
            paymentMethod,
            receiptNumber: data.receipt_number,
            receiptStatus: 'ACTIVE',
            receivedByStaff: staffName,
            createdAt: data.transaction.created_at
          }).catch(() => null);
        }

        return data;
      } catch (err) {
        console.warn('[learnerPaymentService] Cloud RPC payment error, using offline fallback:', err.message);
        return this.recordOfflinePayment(clientTxId, paymentData, staffName);
      }
    } else {
      return this.recordOfflinePayment(clientTxId, paymentData, staffName);
    }
  },

  /**
   * Offline Payment Recorder Fallback
   */
  async recordOfflinePayment(clientTxId, paymentData, staffName) {
    const schoolId = paymentData.schoolId;
    const learnerId = paymentData.learnerId;
    const amount = Number(paymentData.amount);
    const academicYear = paymentData.academicYear || '2025/2026';
    const term = paymentData.term || 'Term 1';

    const learner = await db.learners.get(learnerId);
    const oldOwed = Number(learner?.feesOwed || 0);
    const newOwed = oldOwed - amount;

    // Generate local receipt number
    const seq = (await db.feeTransactions.where('schoolId').equals(schoolId).count()) + 1;
    const receiptNo = `RCP-${academicYear.substring(0, 4)}-OFF-${String(seq).padStart(6, '0')}`;
    const txId = crypto.randomUUID();

    const txRecord = {
      id: txId,
      clientTxId,
      schoolId,
      learnerId,
      academicYear,
      term,
      transactionType: 'PAYMENT',
      amount,
      balanceBefore: oldOwed,
      balanceAfter: newOwed,
      paymentMethod: paymentData.paymentMethod || 'CASH',
      receiptNumber: receiptNo,
      receiptStatus: 'ACTIVE',
      receivedByStaff: staffName,
      createdAt: new Date().toISOString()
    };

    await db.feeTransactions.put(txRecord);

    // Update learner balance locally
    if (learner) {
      await db.learners.update(learnerId, {
        feesOwed: newOwed,
        feesPaid: Number(learner.feesPaid || 0) + amount
      });
    }

    // Queue in Outbox
    await enqueueSync('rpc', 'record_learner_payment', {
      p_client_tx_id: clientTxId,
      p_school_id: schoolId,
      p_learner_id: learnerId,
      p_academic_year: academicYear,
      p_term: term,
      p_amount: amount,
      p_payment_method: paymentData.paymentMethod || 'CASH',
      p_allocations: paymentData.allocations || [{ category: 'Tuition & General Fees', amount }],
      p_notes: paymentData.notes || '',
      p_received_by: staffName
    }, schoolId);

    return {
      success: true,
      status: 'OFFLINE_CREATED',
      receipt_number: receiptNo,
      balance_after: newOwed,
      transaction: txRecord
    };
  },

  /**
   * Reverse a transaction (Zero Deletions)
   */
  async reverseTransaction(schoolId, transactionId, reason, staffName = 'Headteacher') {
    try {
      const { data, error } = await supabase.rpc('reverse_learner_transaction', {
        p_school_id: schoolId,
        p_transaction_id: transactionId,
        p_reversal_reason: reason,
        p_performed_by: staffName
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[learnerPaymentService] reverseTransaction error:', err);
      throw err;
    }
  },

  /**
   * Fetch all transactions for a school or specific learner
   */
  async getTransactions(schoolId, learnerId = null) {
    try {
      let query = supabase
        .from('learner_fee_transactions')
        .select('*, learner:report_learners(full_name, reg_number)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (learnerId) {
        query = query.eq('learner_id', learnerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (err) {
      console.warn('[learnerPaymentService] getTransactions fallback to local:', err.message);
      let localTx = await db.feeTransactions.where('schoolId').equals(schoolId).toArray();
      if (learnerId) {
        localTx = localTx.filter(t => String(t.learnerId) === String(learnerId));
      }
      return localTx.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  },

  /**
   * Log receipt reprint in administrative audit trail
   */
  async logReceiptReprint(schoolId, receiptNumber, staffName = 'Staff', reason = 'Parent Request') {
    try {
      await supabase.from('financial_audit_log').insert({
        school_id: schoolId,
        staff_id: staffName,
        action: 'Receipt Reprinted',
        entity: 'learner_fee_transactions',
        entity_id: receiptNumber,
        new_values: { receipt_number: receiptNumber, reason, reprinted_at: new Date().toISOString() }
      }).catch(() => null);
    } catch (err) {
      console.warn('[learnerPaymentService] logReceiptReprint warn:', err);
    }
  },

  /**
   * Rebuild learner balances from ledger single source of truth
   */
  async rebuildBalances(schoolId) {
    try {
      const { data, error } = await supabase.rpc('rebuild_learner_balances', {
        p_school_id: schoolId
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[learnerPaymentService] rebuildBalances error:', err);
      throw err;
    }
  }
};

export default learnerPaymentService;
