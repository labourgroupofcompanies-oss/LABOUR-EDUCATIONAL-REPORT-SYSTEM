// supabase/functions/verify-payment/index.ts
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

    const { reference } = await req.json();
    if (!reference) return errorResponse("Reference is required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: txRecord, error: fetchError } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .eq("provider_reference", reference)
      .single();

    if (fetchError || !txRecord) {
      return errorResponse("Transaction record not found", 404);
    }

    if (["WALLET_CREDITED", "COMPLETED"].includes(txRecord.status)) {
      return jsonResponse({
        success: true,
        status: txRecord.status,
        message: "Payment already verified and credited.",
        verified_amount: txRecord.verified_amount,
      });
    }

    await supabaseAdmin
      .from("payment_transactions")
      .update({
        status: "PENDING_VERIFICATION",
        authorized_at: new Date().toISOString(),
      })
      .eq("id", txRecord.id);

    return jsonResponse({
      success: true,
      status: "PENDING_VERIFICATION",
      message: "Payment registered. Awaiting webhook authoritative verification and crediting.",
    });
  } catch (err: any) {
    console.error("verify-payment error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});
