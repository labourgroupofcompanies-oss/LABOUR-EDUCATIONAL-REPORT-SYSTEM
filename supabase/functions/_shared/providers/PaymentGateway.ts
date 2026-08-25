// supabase/functions/_shared/providers/PaymentGateway.ts
import { PaystackProvider } from "./PaystackProvider.ts";

export interface InitializeParams {
  email: string;
  amountInKobo: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
  channels?: string[];
}

export interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface VerifyResult {
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  reference: string;
  amountInKobo: number;
  currency: string;
  channel: string;
  transactionId: string;
  paidAt?: string;
  gatewayResponse: string;
  raw: any;
}

export interface PaymentProvider {
  initialize(params: InitializeParams): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean>;
}

export class PaymentGatewayFactory {
  static getProvider(name: string = 'paystack', secretKey?: string): PaymentProvider {
    switch (name.toLowerCase()) {
      case 'paystack':
        return new PaystackProvider(secretKey || Deno.env.get('PAYSTACK_SECRET_KEY') || '');
      default:
        throw new Error(`Unsupported payment provider: ${name}`);
    }
  }
}
