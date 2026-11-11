// AI Render: turns the customer's booth render into a photo-realistic image or video with fal.ai.
//   POST /api/render { kind: "image"|"video", image: <base64 JPEG>, direction?: string }  -> { id }
//   GET  /api/render?id=<render id>  -> the render, checking fal.ai for progress and finishing it when ready
//   GET  /api/render                 -> the customer's renders, newest first
// Needs FAL_KEY in Vercel. One image or video credit is reserved when a render starts and given back if it fails.
import { activePass, dbConfigured, getRender, insertRender, listRenders, refundMediaCredit, storeResult, updateRender, useMediaCredit, userFromToken } from "./_db.js";

const MODELS = {
  image: process.env.FAL_IMAGE_MODEL || "fal-ai/flux-pro/kontext",
  video: process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v2.1/standard/image-to-video",
};

const PROMPTS = {
  image: dir => `Turn this 3D render of a trade show booth into an ultra-realistic professional photograph taken at a real convention center. Keep the booth's exact layout, structures, proportions, colors, graphics, logos and wording. Use realistic materials (tension fabric, aluminum, wood, carpet, glass), natural exhibition hall lighting and sharp, true-to-life detail.${dir ? " " + dir : ""}`,
  video: dir => `A smooth, slow cinematic camera move around this trade show booth at a busy convention center, photo-realistic, with realistic visitors walking past. Keep the booth's exact design, structures, colors, logos and wording.${dir ? " " + dir : ""}`,
};

const fal = (url, init = {}) => fetch(url, { ...init, headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });

async function currentUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return userFromToken(token).catch(() => null);
}

export default async function handler(req, res) {
  if (!process.env.FAL_KEY || !dbConfigured()) return res.status(503).json({ code: "not_configured", message: "AI Render isn't set up on this server yet." });
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ code: "sign_in_required", message: "Sign in to use AI Render." });

  try {
    if (req.method === "GET") {
      const id = String(req.query?.id || "");
      if (!id) return res.status(200).json({ renders: await listRenders(user.id) });
      const r = await getRender(id, user.id);
      if (!r) return res.status(404).json({ code: "not_found", message: "That render wasn't found." });
      return res.status(200).json({ render: await advance(r) });
    }

    if (req.method === "POST") {
      const { kind, image, direction } = req.body || {};
      if (!MODELS[kind]) return res.status(400).json({ code: "bad_request", message: "Choose image or video." });
      if (typeof image !== "string" || image.length < 1000 || image.length > 3_000_000) return res.status(400).json({ code: "bad_request", message: "The current view couldn't be captured. Try again." });
      const pass = await activePass(user.email);
      if (!pass) return res.status(402).json({ code: "pass_required", message: "AI Render needs an active pass. See passes and pricing on the website." });
      if (!(await useMediaCredit(pass.id, kind))) return res.status(429).json({ code: "no_credits", message: `You've used all the AI ${kind}s on your pass.` });

      const prompt = PROMPTS[kind](String(direction || "").trim().slice(0, 600));
      const input = kind === "image"
        ? { prompt, image_url: `data:image/jpeg;base64,${image}`, output_format: "jpeg" }
        : { prompt, image_url: `data:image/jpeg;base64,${image}`, duration: "5" };
      const sub = await fal(`https://queue.fal.run/${MODELS[kind]}`, { method: "POST", body: JSON.stringify(input) });
      const job = await sub.json().catch(() => ({}));
      if (!sub.ok || !job.request_id) {
        await refundMediaCredit(pass.id, kind);
        console.error("fal submit failed", sub.status, JSON.stringify(job).slice(0, 300));
        return res.status(502).json({ code: "render_failed", message: "AI Render couldn't start. Your credit was not used. Try again." });
      }
      const row = await insertRender({
        owner: user.id, pass_id: pass.id, kind, model: MODELS[kind], status: "queued", prompt: String(direction || "").slice(0, 600),
        fal_request: JSON.stringify({ id: job.request_id, status: job.status_url, response: job.response_url }),
      });
      return res.status(200).json({ id: row.id });
    }

    return res.status(405).end();
  } catch (err) {
    console.error("render error", err?.message);
    return res.status(502).json({ code: "server_error", message: "Something went wrong with AI Render. Try again." });
  }
}

// Checks fal.ai once and moves a queued or running render forward. Finished files are copied to our storage.
async function advance(r) {
  if (r.status === "done" || r.status === "failed") return r;
  let job; try { job = JSON.parse(r.fal_request || "{}"); } catch { job = {}; }
  if (!job.status) return r;
  const st = await fal(job.status).then(x => x.json()).catch(() => null);
  if (!st) return r;
  if (st.status === "IN_QUEUE" || st.status === "IN_PROGRESS") {
    if (r.status !== "running" && st.status === "IN_PROGRESS") { await updateRender(r.id, { status: "running" }); r.status = "running"; }
    return r;
  }
  const out = await fal(job.response).then(async x => ({ ok: x.ok, body: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, body: {} }));
  const url = r.kind === "image" ? out.body?.images?.[0]?.url : out.body?.video?.url;
  if (!out.ok || !url) {
    const error = String(out.body?.detail?.[0]?.msg || out.body?.detail || "The AI service couldn't create this one.").slice(0, 300);
    await updateRender(r.id, { status: "failed", error });
    if (r.pass_id) await refundMediaCredit(r.pass_id, r.kind).catch(() => {});
    return { ...r, status: "failed", error };
  }
  let resultUrl = url;
  try {
    const file = await fetch(url);
    const type = file.headers.get("content-type") || (r.kind === "image" ? "image/jpeg" : "video/mp4");
    const ext = r.kind === "image" ? (type.includes("png") ? "png" : "jpg") : "mp4";
    resultUrl = await storeResult(`${r.owner}/${r.id}.${ext}`, Buffer.from(await file.arrayBuffer()), type);
  } catch (err) {
    console.error("storing render failed, keeping the AI service link", err?.message);
  }
  await updateRender(r.id, { status: "done", result_url: resultUrl });
  return { ...r, status: "done", result_url: resultUrl };
}

export const config = { maxDuration: 60 };
