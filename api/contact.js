// POST /api/contact — receives the landing page contact form and emails it on.
// Sends through Resend (resend.com) when these environment variables are set in Vercel:
//   RESEND_API_KEY   the Resend API key
//   CONTACT_TO       where messages go
//   CONTACT_FROM     a sender on the verified domain, e.g. "AI Booth Design <contact@aiboothstudio.com>"
// Without them, messages are only logged to the function logs.
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
