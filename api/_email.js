// Shared branded email layout and sender (Resend). Underscore name: not a public route.
// Table-based with inline styles so it looks the same in Gmail, Outlook and Apple Mail.
import { LOGO_PNG_BASE64 } from "./_logo.js";

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SANS = "-apple-system,Segoe UI,Helvetica,Arial,sans-serif";
const MONO = "Menlo,Consolas,monospace";

// rows: [[label, valueHtml]], panelHtml: optional boxed block, button: { href, label }, footer: plain text
export function brandedEmail({ eyebrow, title, rows = [], panelHtml = "", button = null, footer = "" }) {
  const row = ([label, value]) => `<tr><td style="padding:6px 14px 6px 0;width:132px;vertical-align:top;font-family:${MONO};font-size:11px;line-height:1.6;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#6b7280">${esc(label)}</td><td style="padding:6px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:#111827">${value}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <tr><td style="background:#000000;padding:18px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle"><img src="cid:aibd-logo" width="31" height="30" alt="" style="display:block;border:0;outline:none"></td>
      <td style="vertical-align:middle;padding-left:11px;font-family:${SANS};font-size:18px;line-height:1;font-weight:800;color:#ffffff"><strong style="font-weight:800">AI Booth Studio</strong></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:26px 24px 6px">
    <div style="font-family:${MONO};font-size:11px;line-height:1;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#2563eb">${esc(eyebrow)}</div>
    <div style="font-family:${SANS};font-size:22px;line-height:1.3;font-weight:700;color:#111827;margin-top:10px">${esc(title)}</div>
  </td></tr>
  ${rows.length ? `<tr><td style="padding:12px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(row).join("")}</table></td></tr>` : ""}
  ${panelHtml ? `<tr><td style="padding:12px 24px 4px"><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:#111827">${panelHtml}</div></td></tr>` : ""}
  ${button ? `<tr><td style="padding:18px 24px 26px"><a href="${esc(button.href)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-family:${SANS};font-size:14px;line-height:1;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">${esc(button.label)}</a></td></tr>` : `<tr><td style="padding:10px 24px"></td></tr>`}
  ${footer ? `<tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;font-family:${SANS};font-size:12px;line-height:1.5;color:#9ca3af">${esc(footer)}</td></tr>` : ""}
</table>
</td></tr></table></body></html>`;
}

export const LOGO_ATTACHMENT = { filename: "ai-booth-studio-logo.png", content: LOGO_PNG_BASE64, content_id: "aibd-logo" };

// Sends a branded email to a customer from CONTACT_FROM. Replies go to SUPPORT_EMAIL (or the first CONTACT_TO).
export async function sendToCustomer({ to, subject, text, html }) {
  const { RESEND_API_KEY, CONTACT_TO, CONTACT_FROM, SUPPORT_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_FROM || !to) return false;
  const replyTo = (SUPPORT_EMAIL || String(CONTACT_TO || "").split(",")[0] || "").trim();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: String(subject).replace(/[\r\n]+/g, " ").slice(0, 150),
      text,
      html,
      attachments: [LOGO_ATTACHMENT],
    }),
  });
  if (!r.ok) console.error("resend customer email error", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

// Sends to CONTACT_TO from CONTACT_FROM. Returns true when Resend accepted it; false when not configured or rejected.
export async function sendToOwner({ subject, text, html, replyTo }) {
  const { RESEND_API_KEY, CONTACT_TO, CONTACT_FROM } = process.env;
  if (!RESEND_API_KEY || !CONTACT_TO || !CONTACT_FROM) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: CONTACT_TO.split(",").map(s => s.trim()).filter(Boolean),
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: String(subject).replace(/[\r\n]+/g, " ").slice(0, 150),
      text,
      ...(html ? { html, attachments: [LOGO_ATTACHMENT] } : {}),
    }),
  });
  if (!r.ok) console.error("resend error", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}
