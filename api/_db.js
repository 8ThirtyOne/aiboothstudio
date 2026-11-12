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
// Returns the new row, or null when this session was already recorded.
export async function recordPass({ email, plan, days, images, videos, ai, amountCents, livemode, stripeSession }) {
  const now = Date.now();
  const row = {
    email: email.toLowerCase(),
    plan,
    starts_at: new Date(now).toISOString(),
    ends_at: new Date(now + days * 864e5).toISOString(),
    images_total: images,
    videos_total: videos,
    ai_total: ai,
    amount_cents: amountCents,
    livemode,
    stripe_session: stripeSession,
  };
  const rows = await rest("passes?on_conflict=stripe_session", { method: "POST", body: row, prefer: "resolution=ignore-duplicates,return=representation" });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
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

// A design that its owner has shared, found by its share token, or null.
export async function sharedDesign(token) {
  const rows = await rest(`designs?select=name,data,updated_at&share_token=eq.${encodeURIComponent(token)}&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

// ── AI Render: renders table, media credits and result storage
export async function insertRender(row) {
  const rows = await rest("renders", { method: "POST", body: row, prefer: "return=representation" });
  return rows[0];
}
export async function getRender(id, owner) {
  const rows = await rest(`renders?select=*&id=eq.${encodeURIComponent(id)}&owner=eq.${encodeURIComponent(owner)}&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}
export async function updateRender(id, fields) {
  await rest(`renders?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: { ...fields, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
}
export async function listRenders(owner) {
  return rest(`renders?select=id,kind,status,result_url,error,created_at&owner=eq.${encodeURIComponent(owner)}&order=created_at.desc&limit=60`);
}
export async function useMediaCredit(passId, kind) {
  return (await rest("rpc/use_media_credit", { method: "POST", body: { p_pass: passId, p_kind: kind } })) === true;
}
export async function refundMediaCredit(passId, kind) {
  await rest("rpc/refund_media_credit", { method: "POST", body: { p_pass: passId, p_kind: kind } });
}
// Copies a finished file into the public "renders" bucket. Returns its public URL.
export async function storeResult(path, bytes, contentType) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const r = await fetch(`${base}/storage/v1/object/renders/${path}`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, "Content-Type": contentType, "x-upsert": "true" },
    body: bytes,
  });
  if (!r.ok) throw new Error(`storage upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${base}/storage/v1/object/public/renders/${path}`;
}

// Uses one AI Build action on a pass. Returns true if one was available and used.
export async function useAiAction(passId) {
  const ok = await rest("rpc/use_ai_action", { method: "POST", body: { p_pass: passId } });
  return ok === true;
}

// ── Extra credits bought on top of a pass
// Records a paid top-up once per Stripe session. Returns the new row, or null when it was already recorded.
export async function recordTopup({ stripeSession, passId, email, kind, qty, amountCents, livemode }) {
  const rows = await rest("credit_purchases?on_conflict=stripe_session", {
    method: "POST",
    body: { stripe_session: stripeSession, pass_id: passId, email: email.toLowerCase(), kind, qty, amount_cents: amountCents, livemode },
    prefer: "resolution=ignore-duplicates,return=representation",
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
export async function addMediaCredits(passId, kind, qty) {
  return (await rest("rpc/add_media_credits", { method: "POST", body: { p_pass: passId, p_kind: kind, p_qty: qty } })) === true;
}
export async function addAiActions(passId, qty) {
  return (await rest("rpc/add_ai_actions", { method: "POST", body: { p_pass: passId, p_qty: qty } })) === true;
}
export async function passById(id) {
  const rows = await rest(`passes?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}
