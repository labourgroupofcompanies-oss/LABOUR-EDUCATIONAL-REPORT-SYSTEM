// supabase/functions/paystack-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { errorResponse, jsonResponse } from "../_shared/corsHeaders.ts";
import { PaymentGatewayFactory } from "../_shared/providers/PaymentGateway.ts";
import { PaystackProvider } from "../_shared/providers/PaystackProvider.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const signature = req.headers.get("x-paystack-signature");
    const rawBody = await req.text();

    const provider = PaymentGatewayFactory.getProvider('paystack') as PaystackProvider;
    const isValidSignature = await provider.verifyWebhookSignature(rawBody, signature || "");

    if (!isValidSignature) {
      console.warn("Invalid Paystack webhook signature header");
      return errorResponse("Invalid signature", 401);
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event;
    const eventData = payload.data;

    if (eventType === "charge.success") {
      const reference = eventData.reference;
      const verifyResult = await provider.verify(reference);

      if (verifyResult.status !== "success") {
        console.error(`Paystack verification status mismatch for ${reference}: expected success, got ${verifyResult.status}`);
        return errorResponse("Verification status mismatch", 400);
      }

      const verifiedAmount = verifyResult.amountInKobo / 100;
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: txRecord } = await supabaseAdmin
        .from("payment_transactions")
        .select("*")
        .eq("provider_reference", reference)
        .single();

      if (!txRecord) {
        console.error(`Payment record not found for reference ${reference}`);
        return errorResponse("Payment record not found", 404);
      }

      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("process_wallet_credit", {
        p_payment_id: txRecord.id,
        p_school_id: txRecord.school_id,
        p_verified_amount: verifiedAmount,
        p_provider_reference: reference,
        p_description: `Wallet Top-Up via Paystack (${verifyResult.channel}) — Ref: ${reference}`,
        p_channel: verifyResult.channel,
        p_paystack_tx_id: verifyResult.transactionId,
        p_paid_at: verifyResult.paidAt || new Date().toISOString(),
        p_raw_response: verifyResult.raw,
      });

      if (rpcError) {
        console.error("process_wallet_credit RPC error:", rpcError);
        return errorResponse(`Wallet crediting failed: ${rpcError.message}`, 500);
      }

      return jsonResponse({ success: true, message: "Webhook processed & wallet credited", result: rpcResult });
    }

    if (eventType === "charge.failed") {
      const reference = eventData.reference;
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "FAILED",
          failed_at: new Date().toISOString(),
          failure_reason: eventData.gateway_response || "Payment charge failed",
          paystack_raw_response: eventData,
        })
        .eq("provider_reference", reference);

      return jsonResponse({ success: true, message: "Charge failure recorded" });
    }

    return jsonResponse({ success: true, message: `Event ${eventType} ignored` });
  } catch (err: any) {
    console.error("paystack-webhook error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});
