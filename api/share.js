// GET /api/share?t=<token> — returns a shared design (name and design data) for the view-only link.
// Only designs whose owner created a share link can be read, and only by that link's token.
import { dbConfigured, sharedDesign } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  if (!dbConfigured()) return res.status(503).json({ error: "not_configured" });
  const token = String(req.query?.t || "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return res.status(404).json({ error: "not_found" });
  try {
    const d = await sharedDesign(token);
    if (!d) return res.status(404).json({ error: "not_found" });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ name: d.name, data: d.data, updatedAt: d.updated_at });
  } catch (err) {
    console.error("share lookup failed", err?.message);
    return res.status(502).json({ error: "lookup_failed" });
  }
}
