// Server-side database access through Supabase's REST API, using the secret key.
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel. Underscore name: not a public route.

export function dbConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  const r = await fetch(`${base}/rest/v1/${path}`, {
    method,
    // New-style secret keys (sb_secret_...) go in the apikey header only.
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${method} ${path.split("?")[0]} ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Records a purchased pass. Safe to call twice for the same Stripe session (Stripe can resend notices).
export async function recordPass({ email, plan, days, images, videos, amountCents, livemode, stripeSession }) {
  const now = Date.now();
  const row = {
    email: email.toLowerCase(),
    plan,
    starts_at: new Date(now).toISOString(),
    ends_at: new Date(now + days * 864e5).toISOString(),
    images_total: images,
    videos_total: videos,
    amount_cents: amountCents,
    livemode,
    stripe_session: stripeSession,
  };
  return rest("passes?on_conflict=stripe_session", { method: "POST", body: row, prefer: "resolution=ignore-duplicates,return=minimal" });
}

// The customer's newest pass that hasn't expired, or null.
export async function activePass(email) {
  const q = `passes?select=*&email=eq.${encodeURIComponent(email.toLowerCase())}&ends_at=gt.${encodeURIComponent(new Date().toISOString())}&order=ends_at.desc&limit=1`;
  const rows = await rest(q);
  return rows && rows[0] ? rows[0] : null;
}

// Checks a signed-in customer's access token with Supabase Auth and returns their email, or null.
export async function userFromToken(token) {
  if (!token) return null;
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const r = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.email ? { id: u.id, email: u.email.toLowerCase() } : null;
}
