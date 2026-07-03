// ============================================================
// Edge Function: mpesa-stk-push
// Triggers a real M-Pesa payment prompt on the customer's phone.
//
// REQUIRES these secrets set in Supabase -> Edge Functions -> Secrets:
//   MPESA_CONSUMER_KEY
//   MPESA_CONSUMER_SECRET
//   MPESA_SHORTCODE       (your Till/Paybill number)
//   MPESA_PASSKEY          (from Safaricom Daraja portal)
//   MPESA_CALLBACK_URL     (a public URL Safaricom will call with the result —
//                            can be another Edge Function, see mpesa-callback)
//
// Get these by registering at https://developer.safaricom.co.ke
// Start in the SANDBOX environment to test before going live.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken() {
  const key = Deno.env.get('MPESA_CONSUMER_KEY');
  const secret = Deno.env.get('MPESA_CONSUMER_SECRET');
  const credentials = btoa(`${key}:${secret}`);

  // Use https://sandbox.safaricom.co.ke for testing,
  // https://api.safaricom.co.ke for production
  const res = await fetch('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${credentials}` }
  });
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { phone, amount, sale_id } = await req.json();
    if (!phone || !amount || !sale_id) {
      return new Response(JSON.stringify({ error: 'Missing phone, amount, or sale_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize phone to 254XXXXXXXXX format
    let normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.slice(1);
    if (normalizedPhone.startsWith('7') || normalizedPhone.startsWith('1')) normalizedPhone = '254' + normalizedPhone;

    const shortcode = Deno.env.get('MPESA_SHORTCODE');
    const passkey = Deno.env.get('MPESA_PASSKEY');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = btoa(`${shortcode}${passkey}${timestamp}`);

    const accessToken = await getAccessToken();

    const stkRes = await fetch('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: normalizedPhone,
        PartyB: shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: Deno.env.get('MPESA_CALLBACK_URL'),
        AccountReference: 'ApplianceShop',
        TransactionDesc: 'Purchase'
      })
    });

    const stkData = await stkRes.json();

    if (stkData.ResponseCode !== '0') {
      return new Response(JSON.stringify({ error: stkData.errorMessage || 'STK push failed', details: stkData }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Store the checkout request ID so the callback can match it back to this sale
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    await supabaseAdmin.from('sales').update({
      mpesa_checkout_request_id: stkData.CheckoutRequestID
    }).eq('id', sale_id);

    return new Response(JSON.stringify({ success: true, checkoutRequestId: stkData.CheckoutRequestID }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
