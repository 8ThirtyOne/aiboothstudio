// POST /api/review { page, decision, name, email, comments } — a reviewer's answer from a review page such as /review/lsi/.
// Emailed to you (CONTACT_TO) with the decision up front. Nothing is stored.
import { brandedEmail, esc, sendToOwner } from "./_email.js";

const PAGES = { lsi: "LSI image approval" };
const DECISIONS = {
  approve: { label: "Approved", line: "Approved: fine to use all three as shown." },
  disapprove: { label: "Not approved", line: "Not approved: they'd rather LSI isn't on the site." },
  changes: { label: "Approved with changes", line: "Approved with changes: see their comments for what to change." },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  const b = req.body || {};
  if (b.website) return res.status(200).json({ ok: true }); // hidden field only bots fill in
  const page = String(b.page || ""), decision = DECISIONS[String(b.decision || "")];
  if (!PAGES[page] || !decision) return res.status(400).json({ code: "bad_request", message: "Choose Approve, Approve with changes or Don't approve." });
  if (b.decision === "changes" && !String(b.comments || "").trim()) return res.status(400).json({ code: "bad_request", message: "Please describe the changes in the comments box." });
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().slice(0, 200);
  const comments = String(b.comments || "").trim().slice(0, 4000);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ code: "bad_email", message: "Check the email address." });

  const who = name || email || "A reviewer";
  const rows = [["Decision", `<b>${esc(decision.label)}</b>`], ["Page", esc(PAGES[page])]];
  if (name) rows.push(["Name", esc(name)]);
  if (email) rows.push(["Email", `<a href="mailto:${esc(email)}" style="color:#2563eb;text-decoration:none">${esc(email)}</a>`]);
  const html = brandedEmail({
    eyebrow: "Review reply",
    title: `${decision.label}: ${PAGES[page]}`,
    rows,
    panelHtml: comments ? esc(comments).replace(/\r?\n/g, "<br>") : `<span style="color:#6b7280">No comments added.</span>`,
    button: email ? { href: `mailto:${email}?subject=${encodeURIComponent("Re: " + PAGES[page])}`, label: `Reply to ${name || email}` } : null,
    footer: `${decision.line} Sent from the review page.`,
  });
  const text = [`${decision.label}: ${PAGES[page]}`, `From: ${who}${email && name ? ` <${email}>` : ""}`, "", comments || "(no comments)"].join("\n");
  const sent = await sendToOwner({ subject: `Review reply · ${decision.label} · ${PAGES[page]} (${who})`, text, html, replyTo: email || undefined }).catch(() => false);
  console.log("review reply", JSON.stringify({ page, decision: b.decision, from: who, sent: !!sent }));
  if (sent === false) return res.status(502).json({ code: "send_failed", message: "Your reply couldn't be sent. Please email support@aiboothstudio.com instead." });
  return res.status(200).json({ ok: true });
}
