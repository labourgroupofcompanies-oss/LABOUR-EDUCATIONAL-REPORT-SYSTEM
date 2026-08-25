// supabase/functions/initialize-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { corsHeaders, errorResponse, handleCors, jsonResponse } from "../_shared/corsHeaders.ts";
import { PaymentGatewayFactory } from "../_shared/providers/PaymentGateway.ts";
import { PaystackProvider } from "../_shared/providers/PaystackProvider.ts";

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing Authorization header", 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const body = await req.json();
    const { school_id, amount, payment_method, momo_provider, momo_phone, customer_email } = body;

    if (!school_id || !amount || Number(amount) <= 0 || !customer_email) {
      return errorResponse("Invalid payment initialization payload");
    }

    const reference = `LBRED-${school_id.substring(0, 6)}-${Date.now().toString().slice(-6)}`;
    const amountInKobo = Math.round(Number(amount) * 100);

    const provider = PaymentGatewayFactory.getProvider('paystack') as PaystackProvider;
    const initResult = await provider.initialize({
      email: customer_email,
      amountInKobo,
      reference,
      metadata: {
        school_id,
        initiated_by: user.id,
        payment_method,
        momo_provider,
        momo_phone
      }
    });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: paymentRecord, error: dbError } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        school_id,
        provider: "paystack",
        provider_reference: reference,
        payment_method: payment_method || "card",
        currency: "GHS",
        requested_amount: Number(amount),
        status: "INITIALIZED",
        momo_provider,
        momo_phone,
        customer_email,
        paystack_access_code: initResult.accessCode,
        initiated_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB Insert Error:", dbError);
      return errorResponse(`Failed to record payment transaction: ${dbError.message}`, 500);
    }

    return jsonResponse({
      success: true,
      payment_id: paymentRecord.id,
      reference,
      access_code: initResult.accessCode,
      authorization_url: initResult.authorizationUrl,
    });
  } catch (err: any) {
    console.error("initialize-payment error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});
