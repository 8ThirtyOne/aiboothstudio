// POST /api/checkout -> { url } of a Stripe Checkout page.
//   { plan: "week" | "month" | "year" }        a pass, bought from the website
//   { addon: "image" | "video", qty: 1..20 }   extra AI Render credits, bought from the app by a signed-in customer
//                                               with an active pass (Authorization: Bearer <access token>)
// Needs STRIPE_SECRET_KEY in Vercel (sk_test_... while testing, sk_live_... at launch).
import { ADDONS, ADDON_MAX_QTY, PLANS } from "./_plans.js";
import { activePass, dbConfigured, userFromToken } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ code: "not_configured", message: "Checkout isn't set up yet." });

  const body = req.body || {};
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  let form;

  if (body.addon != null) {
    const addonId = String(body.addon), addon = ADDONS[addonId];
    const qty = Math.floor(Number(body.qty));
    if (!addon || !(qty >= 1 && qty <= ADDON_MAX_QTY)) return res.status(400).json({ code: "bad_request", message: `Choose image or video credits, 1 to ${ADDON_MAX_QTY}.` });
    if (!dbConfigured()) return res.status(503).json({ code: "not_configured", message: "Buying extra credits isn't set up yet." });
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = await userFromToken(token).catch(() => null);
    if (!user) return res.status(401).json({ code: "sign_in_required", message: "Sign in to buy extra credits." });
    const pass = await activePass(user.email).catch(() => null);
    if (!pass) return res.status(402).json({ code: "pass_required", message: "Extra credits are added to an active pass. Buy a pass first." });
    const until = new Date(pass.ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    form = new URLSearchParams({
      mode: "payment",
      customer_email: user.email,
      "line_items[0][quantity]": String(qty),
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(addon.amount),
      "line_items[0][price_data][product_data][name]": `AI Booth Studio ${addon.name}`,
      "line_items[0][price_data][product_data][description]": `Added to your pass for photo-realistic AI Render ${addonId}s. Use them by ${until}, when your pass ends.`,
      "metadata[addon]": addonId,
      "metadata[qty]": String(qty),
      "metadata[pass_id]": pass.id,
      "payment_intent_data[metadata][addon]": addonId,
      "payment_intent_data[metadata][qty]": String(qty),
      success_url: `${origin}/app/?credits=added`,
      cancel_url: `${origin}/app/`,
    });
  } else {
    const planId = String(body.plan || "");
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ code: "bad_request", message: "Unknown pass." });
    form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(plan.amount),
      "line_items[0][price_data][product_data][name]": `AI Booth Studio ${plan.name}`,
      "line_items[0][price_data][product_data][description]": `${plan.days} days of full access, ${plan.ai} AI design actions, ${plan.images} AI images and ${plan.videos} AI video${plan.videos === 1 ? "" : "s"}. One-time payment, no subscription.`,
      customer_creation: "always",
      billing_address_collection: "auto",
      "metadata[plan]": planId,
      "payment_intent_data[metadata][plan]": planId,
      success_url: `${origin}/thanks/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#pricing`,
    });
  }

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
