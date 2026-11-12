// POST /api/stripe-webhook — Stripe calls this when a payment completes.
// Needs STRIPE_WEBHOOK_SECRET (whsec_...) from the webhook endpoint in Stripe.
// Every notice is checked against Stripe's signature before it is trusted.
// For now a completed purchase is logged and emailed to CONTACT_TO; once accounts exist,
// this is where the buyer's pass and credits get switched on.
import crypto from "node:crypto";
import { ADDONS, PLANS } from "./_plans.js";
import { brandedEmail, esc, sendToCustomer, sendToOwner } from "./_email.js";
import { addMediaCredits, dbConfigured, passById, recordPass, recordTopup } from "./_db.js";

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
    if (s.metadata?.addon) return handleTopup(req, res, event, s);
    const plan = PLANS[s.metadata?.plan];
    const email = s.customer_details?.email || "unknown";
    const paid = s.amount_total != null ? `$${(s.amount_total / 100).toFixed(2)} ${String(s.currency || "").toUpperCase()}` : "unknown";
    const mode = event.livemode ? "LIVE" : "TEST";
    console.log("purchase", JSON.stringify({ mode, plan: s.metadata?.plan, email, paid, session: s.id, status: s.payment_status }));
    let recorded = false, newRow = null;
    if (s.payment_status === "paid" && plan && email !== "unknown" && dbConfigured()) {
      try {
        newRow = await recordPass({ email, plan: s.metadata.plan, days: plan.days, images: plan.images, videos: plan.videos, ai: plan.ai, amountCents: s.amount_total ?? null, livemode: !!event.livemode, stripeSession: s.id });
        recorded = true;
      } catch (err) {
        console.error("record pass failed", err?.message);
        return res.status(500).json({ error: "record_failed" }); // Stripe retries later
      }
    }
    // Only email the first time a pass is recorded, so a resent Stripe notice doesn't send duplicates.
    const firstTime = !dbConfigured() || !!newRow;
    if (s.payment_status === "paid" && firstTime) {
      const passName = plan ? plan.name : s.metadata?.plan || "Pass";
      const test = !event.livemode;
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      const dashboard = `https://dashboard.stripe.com/${test ? "test/" : ""}${pi ? `payments/${pi}` : "payments"}`;
      const rows = [
        ["Pass", esc(passName)],
        ["Amount", esc(paid)],
        ["Customer", `<a href="mailto:${esc(email)}" style="color:#2563eb;text-decoration:none">${esc(email)}</a>`],
      ];
      if (plan) rows.push(["Includes", esc(`${plan.days} days, ${plan.ai} AI design actions, ${plan.images} AI images, ${plan.videos} 10-second AI video${plan.videos === 1 ? "" : "s"}`)]);
      rows.push(["Mode", test ? "Test payment" : "Live payment"]);
      const html = brandedEmail({
        eyebrow: test ? "Payment received · test" : "Payment received",
        title: `${passName} purchased for ${paid}`,
        rows,
        panelHtml: recorded ? "The pass is switched on. The customer can sign in to the app with this email to use it." : "This pass couldn't be switched on automatically, so it still needs to be activated by hand.",
        button: { href: dashboard, label: "View in Stripe" },
        footer: `Stripe session ${s.id}`,
      });
      const text = [`${mode} purchase on AI Booth Studio`, "", `Pass: ${passName}`, `Amount: ${paid}`, `Customer: ${email}`, `Stripe: ${dashboard}`, "", recorded ? "The pass is switched on." : "This pass still needs to be activated by hand."].join("\n");
      await sendToOwner({ subject: `${test ? "[Test] " : ""}New purchase: ${passName} (${paid})`, text, html, replyTo: email !== "unknown" ? email : undefined });

      // Confirmation to the customer
      if (plan && email !== "unknown") {
        const site = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
        const endsAt = newRow?.ends_at ? new Date(newRow.ends_at) : new Date(Date.now() + plan.days * 864e5);
        const until = endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
        const includes = `${plan.days} days of full access, ${plan.ai} AI design actions, ${plan.images} AI images, ${plan.videos} 10-second AI video${plan.videos === 1 ? "" : "s"}`;
        const steps = recorded
          ? `1. Open the app and click <b>Sign in</b>.<br>2. Enter <b>${esc(email)}</b> and open the sign-in link we email you.<br>3. Your pass and credits appear under <b>Account</b>.`
          : "Your pass is being switched on and will be ready shortly. We'll be in touch if anything is needed.";
        const custHtml = brandedEmail({
          eyebrow: test ? "Payment confirmed · test" : "Payment confirmed",
          title: `Your ${passName} is ready`,
          rows: [
            ["Pass", esc(passName)],
            ["Amount paid", esc(paid)],
            ["Includes", esc(includes)],
            ["Active until", esc(until)],
            ["Account email", esc(email)],
          ],
          panelHtml: steps,
          button: { href: `${site}/app/#signin`, label: "Open AI Booth Studio" },
          footer: "Thanks for choosing AI Booth Studio. Your card receipt comes separately from Stripe. Questions? Just reply to this email.",
        });
        const custText = [
          `Your ${passName} is ready${test ? " (test purchase)" : ""}.`, "",
          `Pass: ${passName}`, `Amount paid: ${paid}`, `Includes: ${includes}`, `Active until: ${until}`, `Account email: ${email}`, "",
          recorded ? `Open ${site}/app/ and sign in with ${email} to start designing.` : "Your pass is being switched on and will be ready shortly.",
          "", "Your card receipt comes separately from Stripe. Questions? Just reply to this email.",
        ].join("\n");
        await sendToCustomer({ to: email, subject: `${test ? "[Test] " : ""}Your AI Booth Studio ${passName} is ready`, text: custText, html: custHtml });
      }

    }
  }

  return res.status(200).json({ received: true });
}

// Extra AI Render credits: added to the pass they were bought for, once per Stripe session.
async function handleTopup(req, res, event, s) {
  const kind = s.metadata.addon, addon = ADDONS[kind];
  const qty = Math.floor(Number(s.metadata.qty));
  const passId = String(s.metadata.pass_id || "");
  const email = s.customer_details?.email || s.customer_email || "unknown";
  const paid = s.amount_total != null ? `$${(s.amount_total / 100).toFixed(2)} ${String(s.currency || "").toUpperCase()}` : "unknown";
  const test = !event.livemode;
  console.log("topup", JSON.stringify({ mode: test ? "TEST" : "LIVE", kind, qty, email, paid, session: s.id, status: s.payment_status }));
  if (s.payment_status !== "paid" || !addon || !(qty > 0) || !passId || !dbConfigured()) return res.status(200).json({ received: true });

  let added = false, row = null, pass = null;
  try {
    row = await recordTopup({ stripeSession: s.id, passId, email: email === "unknown" ? "" : email, kind, qty, amountCents: s.amount_total ?? null, livemode: !!event.livemode });
    if (!row) return res.status(200).json({ received: true, duplicate: true }); // already handled
    added = await addMediaCredits(passId, kind, qty);
    pass = await passById(passId).catch(() => null);
  } catch (err) {
    console.error("topup failed", err?.message);
    if (!row) return res.status(500).json({ error: "record_failed" }); // Stripe retries later
  }

  const what = `${qty} extra AI ${kind}${qty === 1 ? "" : "s"}`;
  const left = pass ? (kind === "image" ? pass.images_total - pass.images_used : pass.videos_total - pass.videos_used) : null;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  const dashboard = `https://dashboard.stripe.com/${test ? "test/" : ""}${pi ? `payments/${pi}` : "payments"}`;
  const html = brandedEmail({
    eyebrow: test ? "Payment received · test" : "Payment received",
    title: `${what} purchased for ${paid}`,
    rows: [["Credits", esc(what)], ["Amount", esc(paid)], ["Customer", esc(email)], ["Mode", test ? "Test payment" : "Live payment"]],
    panelHtml: added ? "The credits were added to the customer's pass." : "The credits couldn't be added automatically, so they still need to be added by hand.",
    button: { href: dashboard, label: "View in Stripe" },
    footer: `Stripe session ${s.id}`,
  });
  await sendToOwner({ subject: `${test ? "[Test] " : ""}Extra credits: ${what} (${paid})`, text: `${what} for ${paid} from ${email}. ${added ? "Added to the pass." : "Needs adding by hand."}\n${dashboard}`, html, replyTo: email !== "unknown" ? email : undefined });

  if (email !== "unknown") {
    const site = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const until = pass ? new Date(pass.ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
    const rows = [["Added", esc(what)], ["Amount paid", esc(paid)]];
    if (left != null) rows.push([kind === "image" ? "Images now left" : "Videos now left", String(left)]);
    if (until) rows.push(["Use them by", esc(until)]);
    await sendToCustomer({
      to: email,
      subject: `${test ? "[Test] " : ""}Your extra AI ${kind}s are ready`,
      text: `${what} ${qty === 1 ? "was" : "were"} added to your AI Booth Studio pass${until ? `. Use ${qty === 1 ? "it" : "them"} by ${until}` : ""}.\nOpen ${site}/app/ and click AI Render.`,
      html: brandedEmail({
        eyebrow: test ? "Payment confirmed · test" : "Payment confirmed",
        title: `Your extra AI ${kind}${qty === 1 ? " is" : "s are"} ready`,
        rows,
        panelHtml: added ? "Already on your pass. Open the app and click <b>AI Render</b> to use them." : "They're being added to your pass and will be ready shortly.",
        button: { href: `${site}/app/`, label: "Open AI Booth Studio" },
        footer: "Your card receipt comes separately from Stripe. Questions? Just reply to this email.",
      }),
    });
  }
  return res.status(200).json({ received: true });
}
