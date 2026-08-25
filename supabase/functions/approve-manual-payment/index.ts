// supabase/functions/approve-manual-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { errorResponse, handleCors, jsonResponse } from "../_shared/corsHeaders.ts";

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

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const allowedRoles = ["developer", "accountant", "operations", "admin"];
    if (!profile || !allowedRoles.includes(profile.role)) {
      return errorResponse("Forbidden: Insufficient privileges to approve manual payments", 403);
    }

    const { payment_id, verified_amount, notes } = await req.json();
    if (!payment_id || !verified_amount || Number(verified_amount) <= 0) {
      return errorResponse("Valid payment_id and verified_amount are required");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: txRecord, error: fetchErr } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .eq("id", payment_id)
      .single();

    if (fetchErr || !txRecord) return errorResponse("Payment record not found", 404);

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("process_wallet_credit", {
      p_payment_id: txRecord.id,
      p_school_id: txRecord.school_id,
      p_verified_amount: Number(verified_amount),
      p_provider_reference: txRecord.provider_reference,
      p_description: `Manual Bank Deposit Approved by ${user.id} — Notes: ${notes || 'N/A'}`,
      p_channel: "bank_deposit",
      p_paystack_tx_id: `MANUAL-${Date.now()}`,
      p_paid_at: new Date().toISOString(),
      p_raw_response: { approved_by: user.id, notes },
    });

    if (rpcError) {
      return errorResponse(`Manual approval failed: ${rpcError.message}`, 500);
    }

    return jsonResponse({ success: true, message: "Manual payment approved & wallet credited", result: rpcResult });
  } catch (err: any) {
    console.error("approve-manual-payment error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});
