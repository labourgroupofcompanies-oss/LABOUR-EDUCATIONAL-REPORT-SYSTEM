// src/services/paymentEngine.js
import { supabase } from '../lib/supabase';

/**
 * Enterprise Frontend Payment Engine Service
 * Orchestrates payment initialization, frontend verification trigger, polling, and history.
 */
export const paymentEngine = {
  /**
   * Initialize payment via Supabase Edge Function
   */
  async initializePayment({ schoolId, amount, paymentMethod, momoProvider, momoPhone, customerEmail }) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/initialize-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        school_id: schoolId,
        amount: Number(amount),
        payment_method: paymentMethod,
        momo_provider: momoProvider,
        momo_phone: momoPhone,
        customer_email: customerEmail
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to initialize payment');
    }

    return result; // { success, payment_id, reference, access_code, authorization_url }
  },

  /**
   * Post-callback trigger to notify system to verify
   */
  async triggerVerification(reference) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ reference })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to register payment verification');
    }

    return result;
  },

  /**
   * Poll payment_transactions status until COMPLETED, FAILED, or timeout
   */
  async pollPaymentStatus(paymentId, onComplete, onFailed, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    const interval = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(interval);
        onFailed('Verification timed out. Webhook is still processing your payment in the background.');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('payment_transactions')
          .select('status, verified_amount, completed_at, failure_reason')
          .eq('id', paymentId)
          .single();

        if (error) return;

        if (data?.status === 'COMPLETED' || data?.status === 'WALLET_CREDITED') {
          clearInterval(interval);
          onComplete(data);
        } else if (data?.status === 'FAILED') {
          clearInterval(interval);
          onFailed(data.failure_reason || 'Payment processing failed.');
        }
      } catch (_) {}
    }, 3000);

    return () => clearInterval(interval);
  },

  /**
   * Fetch payment transaction history for a school
   */
  async getPaymentTransactions(schoolId) {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};

export default paymentEngine;
