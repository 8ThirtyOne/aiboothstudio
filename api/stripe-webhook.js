// POST /api/stripe-webhook — Stripe calls this when a payment completes.
// Needs STRIPE_WEBHOOK_SECRET (whsec_...) from the webhook endpoint in Stripe.
// Every notice is checked against Stripe's signature before it is trusted.
// For now a completed purchase is logged and emailed to CONTACT_TO; once accounts exist,
// this is where the buyer's pass and credits get switched on.
import crypto from "node:crypto";
import { PLANS } from "./_plans.js";

const TOLERANCE_SECONDS = 300;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(typeof c === "string" ? Buffer.from(c) : c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Stripe's scheme: header "t=<unix>,v1=<hex hmac>"; HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret.
function verify(raw, header, secret) {
  const parts = Object.fromEntries(String(header || "").split(",").map(p => p.split("=", 2)).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = String(header || "").split(",").filter(p => p.trim().startsWith("v1=")).map(p => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.`).update(raw).digest("hex");
  const exp = Buffer.from(expected, "hex");
  return sigs.some(s => { const b = Buffer.from(s, "hex"); return b.length === exp.length && crypto.timingSafeEqual(b, exp); });
}

async function notifyOwner(lines, subject) {
  const { RESEND_API_KEY, CONTACT_TO, CONTACT_FROM } = process.env;
  if (!RESEND_API_KEY || !CONTACT_TO || !CONTACT_FROM) return;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: CONTACT_FROM, to: CONTACT_TO.split(",").map(s => s.trim()).filter(Boolean), subject, text: lines.join("\n") }),
  });
  if (!r.ok) console.error("purchase email failed", r.status);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "not_configured" });

  const raw = await readRawBody(req);
  if (!verify(raw, req.headers["stripe-signature"], secret)) return res.status(400).json({ error: "bad_signature" });

  let event;
  try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "bad_json" }); }

  if (event.type === "checkout.session.completed") {
    const s = event.data?.object || {};
    const plan = PLANS[s.metadata?.plan];
    const email = s.customer_details?.email || "unknown";
    const paid = s.amount_total != null ? `$${(s.amount_total / 100).toFixed(2)} ${String(s.currency || "").toUpperCase()}` : "unknown";
    const mode = event.livemode ? "LIVE" : "TEST";
    console.log("purchase", JSON.stringify({ mode, plan: s.metadata?.plan, email, paid, session: s.id, status: s.payment_status }));
    if (s.payment_status === "paid") {
      await notifyOwner([
        `${mode} purchase on AI Booth Design`,
        "",
        `Pass: ${plan ? plan.name : s.metadata?.plan || "unknown"}`,
        `Amount: ${paid}`,
        `Customer: ${email}`,
        `Stripe session: ${s.id}`,
        "",
        "Accounts aren't connected yet, so this pass still has to be switched on by hand.",
      ], `${mode === "TEST" ? "[Test] " : ""}New purchase: ${plan ? plan.name : "pass"} (${paid})`);
    }
  }

  return res.status(200).json({ received: true });
}
