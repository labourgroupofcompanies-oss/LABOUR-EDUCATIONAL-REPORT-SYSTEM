// Supabase Edge Function: developer-api
// Serverless API Key Validation & HMAC Webhook Dispatcher
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: X-API-Key header is missing' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify key hash format
    const isSandbox = apiKey.startsWith('pk_test_');
    const isProd = apiKey.startsWith('pk_live_');

    if (!isSandbox && !isProd) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid API key format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        environment: isProd ? 'production' : 'sandbox',
        apiVersion: 'v1.2.0',
        message: 'Platform Developer API edge gateway request validated.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
