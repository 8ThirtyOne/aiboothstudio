// POST /api/contact — receives the landing page contact form and emails it on.
// Sends through Resend (resend.com) when these environment variables are set in Vercel:
//   RESEND_API_KEY   the Resend API key
//   CONTACT_TO       where messages go
//   CONTACT_FROM     a sender on the verified domain, e.g. "AI Booth Design <contact@aiboothstudio.com>"
// Without them, messages are only logged to the function logs.
import { LOGO_PNG_BASE64 } from "./_logo.js";

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Table-based layout with inline styles, so it renders the same in Gmail, Outlook and Apple Mail.
function emailHtml(msg) {
  const row = (label, value) => `<tr><td style="padding:6px 0;width:96px;vertical-align:top;font:600 11px/1.6 Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#6b7280">${label}</td><td style="padding:6px 0;font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">${value}</td></tr>`;
  const rows = [
    row("Name", esc(msg.name)),
    row("Email", `<a href="mailto:${esc(msg.email)}" style="color:#2563eb;text-decoration:none">${esc(msg.email)}</a>`),
    msg.company ? row("Company", esc(msg.company)) : "",
    row("Topic", esc(msg.topic || "General question")),
  ].join("");
  const body = esc(msg.message).replace(/\r?\n/g, "<br>");
  const first = esc(msg.name.split(/\s+/)[0] || msg.name);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <tr><td style="background:#000000;padding:18px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle"><img src="cid:aibd-logo" width="31" height="30" alt="" style="display:block;border:0;outline:none"></td>
      <td style="vertical-align:middle;padding-left:11px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:18px;line-height:1;font-weight:800;color:#ffffff"><strong style="font-weight:800">AI Booth Design</strong></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:26px 24px 6px">
    <div style="font:600 11px/1 Menlo,Consolas,monospace;letter-spacing:.2em;text-transform:uppercase;color:#2563eb">New contact message</div>
    <div style="font:700 22px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;margin-top:10px">${esc(msg.topic || "General question")} from ${esc(msg.name)}</div>
  </td></tr>
  <tr><td style="padding:12px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
  <tr><td style="padding:12px 24px 4px">
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">${body}</div>
  </td></tr>
  <tr><td style="padding:18px 24px 26px">
    <a href="mailto:${esc(msg.email)}?subject=${encodeURIComponent("Re: " + (msg.topic || "Your message to AI Booth Design"))}" style="display:inline-block;background:#2563eb;color:#ffffff;font:700 14px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;text-decoration:none;padding:12px 20px;border-radius:999px">Reply to ${first}</a>
  </td></tr>
  <tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;font:12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9ca3af">Sent from the contact form at aiboothstudio.com.</td></tr>
</table>
</td></tr></table></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const f = req.body || {};
  const clean = k => String(f[k] || "").trim().slice(0, k === "message" ? 4000 : 200);
  const msg = { name: clean("name"), email: clean("email"), company: clean("company"), topic: clean("topic"), message: clean("message") };
  if (!msg.name || !msg.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email)) return res.status(400).json({ ok: false });

  const { RESEND_API_KEY, CONTACT_TO, CONTACT_FROM } = process.env;
  if (!RESEND_API_KEY || !CONTACT_TO || !CONTACT_FROM) {
    console.log("contact form (email not configured)", JSON.stringify({ ...msg, receivedAt: new Date().toISOString() }));
    return res.status(200).json({ ok: true });
  }

  const details = [`Name: ${msg.name}`, `Email: ${msg.email}`];
  if (msg.company) details.push(`Company: ${msg.company}`);
  details.push(`Topic: ${msg.topic || "General question"}`);
  const text = `${details.join("\n")}\n\n${msg.message}\n\n— Sent from the AI Booth Design contact form`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: CONTACT_TO.split(",").map(s => s.trim()).filter(Boolean),
        reply_to: msg.email,
        subject: `New message: ${msg.topic || "General question"} from ${msg.name}`.replace(/[\r\n]+/g, " ").slice(0, 150),
        text,
        html: emailHtml(msg),
        attachments: [{ filename: "ai-booth-design-logo.png", content: LOGO_PNG_BASE64, content_id: "aibd-logo" }],
      }),
    });
    if (!r.ok) {
      console.error("resend error", r.status, (await r.text()).slice(0, 300));
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("resend request failed", err?.message);
    return res.status(502).json({ ok: false });
  }
}
