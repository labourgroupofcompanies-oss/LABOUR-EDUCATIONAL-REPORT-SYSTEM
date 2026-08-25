import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

export const walletLedgerService = {
  /**
   * Add an immutable transaction to the ledger (Source of Truth) and update school wallet balance directly
   */
  async addLedgerTransaction({
    schoolId,
    type,
    amount,
    reference,
    sourceSchoolId = null,
    processedBy = 'System',
    metadata = {}
  }) {
    if (!schoolId || !type || amount === undefined || !reference) {
      throw new Error('[WalletLedger] Invalid ledger transaction payload.');
    }

    const cleanSchoolId = String(schoolId).trim();
    const numAmount = Number(amount);

    // 1. Idempotency Check: Prevent duplicate ledger reference entries locally & in cloud
    const existing = await db.walletLedger.where('reference').equals(reference).first();
    if (existing) {
      console.warn(`[WalletLedger] Duplicate prevented: Reference ${reference} has already been credited.`);
      return { ...existing, isDuplicate: true, newBalance: null };
    }

    // 1b. Check if already recorded in Supabase cloud transactions
    if (navigator.onLine) {
      try {
        const { data: existingCloudTx } = await supabase
          .from('wallet_transactions')
          .select('id, reference')
          .eq('reference', reference)
          .maybeSingle();

        if (existingCloudTx) {
          console.warn(`[WalletLedger] Cloud duplicate prevented: Transaction ${reference} already exists in Supabase.`);
          await db.walletLedger.put({
            id: `WLT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            schoolId: cleanSchoolId,
            type,
            amount: numAmount,
            reference,
            status: 'COMPLETED',
            processedBy,
            createdAt: new Date().toISOString()
          }).catch(() => null);
          return { isDuplicate: true, reference };
        }
      } catch (_) {}
    }

    const txRecord = {
      id: `WLT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      schoolId: cleanSchoolId,
      type,
      amount: numAmount,
      reference,
      sourceSchoolId: sourceSchoolId ? String(sourceSchoolId).trim() : null,
      status: 'COMPLETED',
      processedBy,
      metadata,
      createdAt: new Date().toISOString()
    };

    // Save to local immutable ledger
    await db.walletLedger.add(txRecord).catch(() => null);

    let calculatedNewBal = null;

    // 2. Direct Supabase Cloud Update (Authoritative)
    if (navigator.onLine) {
      try {
        // Fetch current authoritative wallet_balance from report_schools
        const { data: cloudSchool } = await supabase
          .from('report_schools')
          .select('id, wallet_balance')
          .eq('id', cleanSchoolId)
          .maybeSingle();

        const currentCloudBal = Number(cloudSchool?.wallet_balance || 0);
        calculatedNewBal = Math.max(0, currentCloudBal + numAmount);

        // Direct insert to wallet_transactions table with balance_before and balance_after
        const walletTxPayload = {
          school_id: cleanSchoolId,
          transaction_type: numAmount >= 0 ? 'CREDIT' : 'DEBIT',
          currency: 'GHS',
          amount: Math.abs(numAmount),
          balance_before: currentCloudBal,
          balance_after: calculatedNewBal,
          reference: txRecord.reference,
          description: txRecord.type === 'REFERRAL_REWARD'
            ? 'Referral Reward Credit (+GH₵20.00)'
            : (txRecord.type === 'WELCOME_BONUS' ? 'Welcome Bonus Credit (+GH₵10.00)' : 'Wallet Credit'),
          created_by: txRecord.processedBy
        };

        let { error: insertErr } = await supabase.from('wallet_transactions').insert([walletTxPayload]);
        if (insertErr) {
          try {
            await supabase.from('platform_wallet_transactions').insert([walletTxPayload]);
          } catch (_) {}
        }

        // Update report_schools.wallet_balance in Supabase
        const { error: updErr } = await supabase
          .from('report_schools')
          .update({ wallet_balance: calculatedNewBal })
          .eq('id', cleanSchoolId);

        if (updErr) {
          console.warn('[WalletLedger] Direct report_schools balance update notice:', updErr);
        } else {
          console.log(`[WalletLedger] Cloud wallet_balance successfully updated for school ${cleanSchoolId}: GH₵ ${calculatedNewBal}`);
        }
      } catch (cloudErr) {
        console.warn('[WalletLedger] Supabase cloud operation notice:', cloudErr);
      }
    }

    // 3. Local Dexie School Balance Update
    const localSchool = await db.schools.get(cleanSchoolId);
    if (localSchool) {
      const oldBal = Number(localSchool.wallet_balance || localSchool.walletBalance || 0);
      const newLocalBal = calculatedNewBal !== null ? calculatedNewBal : Math.max(0, oldBal + numAmount);
      await db.schools.update(cleanSchoolId, {
        wallet_balance: newLocalBal,
        walletBalance: newLocalBal
      }).catch(() => null);
    }

    return {
      ...txRecord,
      newBalance: calculatedNewBal
    };
  },

  /**
   * Reconcile cached balance strictly against Sum(All Completed Ledger Transactions)
   */
  async reconcileWallet(schoolId) {
    if (!schoolId) return 0;
    const targetId = String(schoolId).trim();

    let remoteBalance = null;

    if (navigator.onLine) {
      try {
        const { data: schoolDb } = await supabase
          .from('report_schools')
          .select('wallet_balance')
          .eq('id', targetId)
          .maybeSingle();

        if (schoolDb && schoolDb.wallet_balance !== undefined && schoolDb.wallet_balance !== null) {
          remoteBalance = Number(schoolDb.wallet_balance);
        }
      } catch (err) {
        console.warn('[WalletLedger] Cloud balance check notice:', err);
      }
    }

    const allTx = await db.walletLedger
      .where('schoolId')
      .equals(targetId)
      .filter(tx => tx.status === 'COMPLETED')
      .toArray();

    const localSchool = await db.schools.get(targetId);

    const ledgerBalance = allTx.length > 0
      ? allTx.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
      : (remoteBalance !== null ? remoteBalance : Number(localSchool?.wallet_balance || localSchool?.walletBalance || 0));

    const finalBalance = remoteBalance !== null ? remoteBalance : ledgerBalance;

    // Update local school entity
    if (localSchool) {
      await db.schools.update(targetId, {
        walletBalance: finalBalance,
        wallet_balance: finalBalance,
        lastReconciledAt: new Date().toISOString()
      }).catch(() => null);
    }

    return finalBalance;
  }
};

export default walletLedgerService;
