// POST /api/ab { test, variant, event, visitor } — counts one A/B test event (a view or a click).
// No names, emails or IP addresses are stored: only the test, the version shown, what happened and a random visitor id.
// Needs supabase/008_ab_tests.sql. Results: see "A/B tests" in supabase/admin-queries.sql.
import { dbConfigured, recordAbEvent } from "./_db.js";

const TESTS = { hero1: ["a", "b"] };
const EVENTS = ["view", "hero_cta", "open_app", "buy_click", "contact"];
const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!dbConfigured()) return res.status(204).end();
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const test = String(b?.test || ""), variant = String(b?.variant || ""), event = String(b?.event || "");
  const visitor = String(b?.visitor || "").replace(/[^a-z0-9]/gi, "").slice(0, 40);
  if (!TESTS[test]?.includes(variant) || !EVENTS.includes(event) || visitor.length < 8) return res.status(400).end();
  if (BOTS.test(String(req.headers["user-agent"] || ""))) return res.status(204).end();
  try { await recordAbEvent({ test, variant, event, visitor }); } catch (err) { console.error("ab event failed", err?.message); }
  return res.status(204).end();
}
