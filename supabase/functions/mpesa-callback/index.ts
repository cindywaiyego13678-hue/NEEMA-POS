// ============================================================
// Edge Function: mpesa-callback
// Safaricom calls THIS function automatically after the customer
// enters their M-Pesa PIN (or cancels/times out). It has no auth
// header from your app — Safaricom calls it directly.
// Set this function's URL as MPESA_CALLBACK_URL in your secrets.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const callback = body.Body?.stkCallback;
    if (!callback) return new Response('ok');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const checkoutRequestId = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode; // 0 = success

    if (resultCode === 0) {
      const items = callback.CallbackMetadata?.Item || [];
      const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;

      await supabaseAdmin.from('sales')
        .update({ mpesa_receipt: receipt, status: 'completed' })
        .eq('mpesa_checkout_request_id', checkoutRequestId);
    } else {
      // Payment failed, was cancelled, or timed out
      await supabaseAdmin.from('sales')
        .update({ status: 'void' })
        .eq('mpesa_checkout_request_id', checkoutRequestId);
    }

    return new Response('ok');
  } catch (err) {
    console.error(err);
    return new Response('ok'); // always acknowledge to Safaricom, even on our own errors
  }
});
