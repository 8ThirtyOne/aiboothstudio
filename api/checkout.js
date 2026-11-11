// POST /api/checkout { plan: "week" | "month" | "year" } -> { url } of a Stripe Checkout page.
// Needs STRIPE_SECRET_KEY in Vercel (sk_test_... while testing, sk_live_... at launch).
import { PLANS } from "./_plans.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ code: "not_configured", message: "Checkout isn't set up yet." });

  const planId = String((req.body || {}).plan || "");
  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ code: "bad_request", message: "Unknown pass." });

  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(plan.amount),
    "line_items[0][price_data][product_data][name]": `AI Booth Design ${plan.name}`,
    "line_items[0][price_data][product_data][description]": `${plan.days} days of full access, ${plan.images} AI images and ${plan.videos} AI video${plan.videos === 1 ? "" : "s"}. One-time payment, no subscription.`,
    customer_creation: "always",
    billing_address_collection: "auto",
    "metadata[plan]": planId,
    "payment_intent_data[metadata][plan]": planId,
    success_url: `${origin}/thanks/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#pricing`,
  });

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("stripe checkout error", r.status, data?.error?.type, data?.error?.message);
      return res.status(502).json({ code: "stripe_error", message: "Checkout couldn't start. Please try again." });
    }
    return res.status(200).json({ url: data.url });
  } catch (err) {
    console.error("stripe checkout request failed", err?.message);
    return res.status(502).json({ code: "network", message: "Couldn't reach the payment service." });
  }
}
