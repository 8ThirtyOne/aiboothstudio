// POST /api/contact — receives the landing page contact form.
// Placeholder: it validates and logs each message to the hosting provider's function logs.
// Next step: forward it by email (e.g. Resend or Postmark) or save it to the accounts database.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const f = req.body || {};
  const clean = k => String(f[k] || "").trim().slice(0, k === "message" ? 4000 : 200);
  const msg = { name: clean("name"), email: clean("email"), company: clean("company"), topic: clean("topic"), message: clean("message") };
  if (!msg.name || !msg.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email)) return res.status(400).json({ ok: false });
  console.log("contact form", JSON.stringify({ ...msg, receivedAt: new Date().toISOString() }));
  return res.status(200).json({ ok: true });
}
