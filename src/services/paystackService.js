// src/services/paystackService.js

/**
 * Client-side Wrapper for Paystack Inline Popup
 */
export const paystackService = {
  /**
   * Open the Paystack payment popup directly using public key
   */
  openPaystackPopup({ reference, email, amountInKobo, currency = 'GHS', onSuccess, onCancel }) {
    if (typeof window.PaystackPop === 'undefined') {
      alert('Paystack script is loading. Please check your internet connection and try again.');
      if (onCancel) onCancel();
      return;
    }

    const key = (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();
    if (!key) {
      console.error('[Paystack] VITE_PAYSTACK_PUBLIC_KEY is not configured.');
      alert('Payment service is not configured. Please contact support.');
      if (onCancel) onCancel();
      return;
    }

    try {
      const handler = window.PaystackPop.setup({
        key: key,
        email: email,
        amount: amountInKobo,
        currency: currency || 'GHS',
        ref: reference,
        callback: function(response) {
          if (onSuccess) onSuccess(response);
        },
        onClose: function() {
          if (onCancel) onCancel();
        }
      });

      handler.openIframe();
    } catch (err) {
      console.error('Paystack SDK setup error:', err);
      alert('Failed to launch Paystack: ' + err.message);
      if (onCancel) onCancel();
    }
  }
};

export default paystackService;


