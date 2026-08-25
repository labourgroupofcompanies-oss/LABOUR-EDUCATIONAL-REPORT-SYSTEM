// supabase/functions/_shared/providers/PaystackProvider.ts
import { InitializeParams, InitializeResult, PaymentProvider, VerifyResult } from "./PaymentGateway.ts";

export class PaystackProvider implements PaymentProvider {
  private secretKey: string;
  private baseUrl = "https://api.paystack.co";

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  async initialize(params: InitializeParams): Promise<InitializeResult> {
    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        email: params.email,
        amount: params.amountInKobo,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
        channels: params.channels,
      }),
    });

    const data = await response.json();
    if (!data.status) {
      throw new Error(`Paystack initialization failed: ${data.message || 'Unknown error'}`);
    }

    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: this.headers,
    });

    const data = await response.json();
    if (!data.status) {
      throw new Error(`Paystack verification failed: ${data.message || 'Unknown error'}`);
    }

    const tx = data.data;
    let normalizedStatus: 'success' | 'failed' | 'abandoned' | 'pending' = 'pending';
    if (tx.status === 'success') normalizedStatus = 'success';
    else if (tx.status === 'failed') normalizedStatus = 'failed';
    else if (tx.status === 'abandoned') normalizedStatus = 'abandoned';

    return {
      status: normalizedStatus,
      reference: tx.reference,
      amountInKobo: tx.amount,
      currency: tx.currency,
      channel: tx.channel,
      transactionId: String(tx.id),
      paidAt: tx.paid_at,
      gatewayResponse: tx.gateway_response,
      raw: tx,
    };
  }

  async verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
    if (!signature || !this.secretKey) return false;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secretKey);
    const msgData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return computedSignature === signature;
  }
}
