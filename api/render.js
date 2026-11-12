// AI Render: turns the customer's booth into ultra photo-realistic images and videos with fal.ai.
//   POST /api/render { kind: "image"|"video", mode?: "upgrade"|"faithful", image?: <base64 JPEG>, sourceUrl?: <one of our stored AI images>,
//                      direction?: string, brand?: { company, tagline, colors[], size, type } }  -> { id }
//   GET  /api/render?id=<render id>  -> the render, checking fal.ai for progress and finishing it when ready
//   GET  /api/render                 -> the customer's renders, newest first
// Needs FAL_KEY in Vercel. One image or video credit is reserved when a render starts and given back if it fails.
//
// Modes for images:
//   upgrade  (default) the 3D render is a layout and brand reference; the AI designs and photographs a premium, custom-built version.
//   faithful           the AI keeps the design exactly and only makes it look real.
// Videos animate a finished AI image when one is given (sourceUrl), so the motion starts from a photo-realistic frame.
import { activePass, dbConfigured, getRender, insertRender, listRenders, refundMediaCredit, storeResult, updateRender, useMediaCredit, userFromToken } from "./_db.js";

const MODELS = {
  // Gemini 3 Pro Image: strongest for design upgrades and crisp brand text. $0.15 per image at 1K, $0.30 at 2K.
  image: process.env.FAL_IMAGE_MODEL || "fal-ai/nano-banana-pro/edit",
  video: process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v2.1/standard/image-to-video",
};
const IMAGE_RESOLUTION = process.env.FAL_IMAGE_RESOLUTION || "2K";

const clean = (v, n) => String(v || "").replace(/[\r\n"]+/g, " ").trim().slice(0, n);
function brandLine(b = {}) {
  const company = clean(b.company, 60), tagline = clean(b.tagline, 100);
  const colors = (Array.isArray(b.colors) ? b.colors : []).map(c => clean(c, 9)).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 4);
  return { company, tagline, colors, size: clean(b.size, 30), type: clean(b.type, 20).toLowerCase() };
}

const PROMPTS = {
  upgrade: (dir, b) => [
    "You are a world-class exhibit designer and an award-winning architectural photographer.",
    "The attached image is only a rough 3D blockout of a trade show booth. Use it as a reference for the booth's footprint, size, open sides, overall layout, camera angle and brand colors, nothing more.",
    `Design and photograph the finished, premium, custom-built version of this booth${b.company ? ` for "${b.company}"` : ""}${b.tagline ? `, tagline "${b.tagline}"` : ""}${b.size ? `, a ${b.size}${b.type ? " " + b.type : ""} booth` : ""}.`,
    "Elevate every element far beyond the blockout: seamless backlit fabric (SEG) walls with soft rounded corners and crisp integrated LED edge lighting; a bold illuminated 3D logo",
    b.company ? `spelling exactly "${b.company}";` : ";",
    "large-format brand graphics with real-looking lifestyle or product photography and short, punchy benefit messaging that fits this brand; a premium reception counter with a backlit branded front panel; a large digital screen with branded content; a slightly raised platform floor with a glowing LED edge; refined modern furniture, live plants and tasteful accent lighting.",
    b.colors.length ? `Use the brand colors ${b.colors.join(", ")} as the dominant palette, balanced with clean white surfaces.` : "Use the blockout's colors as the brand palette, balanced with clean white surfaces.",
    "Make it an ultra photo-realistic, magazine-quality professional photograph from a three-quarter view close to the reference angle, in a real convention center with a high ceiling, truss lighting and neighboring exhibits softly out of focus, with realistic materials, reflections, shadows and depth of field.",
    "Absolutely no 3D-render or CGI look, no mannequins or placeholder figures, no distorted or misspelled text.",
    dir ? `Photo style: ${dir}` : "",
  ].filter(Boolean).join(" "),
  faithful: (dir) => [
    "Transform this computer-generated 3D render into a real photograph of a trade show booth, taken with a professional camera at a real convention center.",
    "The result must not look like a 3D render: replace every flat, synthetic surface with real materials, such as printed tension fabric graphics, brushed aluminum frames, real carpet texture, glossy laminate, wood grain and glass, with real reflections, soft shadows and natural light falloff.",
    "Replace the simple placeholder figures with realistic people in business attire, and make the surrounding booths and hall look like a real, detailed exhibition hall with a ceiling, lights and signage.",
    "Keep this booth exactly as designed: same camera angle, layout, size, structures, furniture positions, colors, logos and all wording.",
    dir ? `Photo style: ${dir}` : "",
  ].filter(Boolean).join(" "),
  video: (dir, fromPhoto) => [
    fromPhoto
      ? "Bring this photograph to life as real camera footage: a smooth, slow cinematic camera move toward the trade show booth at a busy convention center."
      : "Real camera footage, not a 3D animation: a smooth, slow cinematic camera move toward this trade show booth at a busy, real convention center.",
    "Real people in business attire stroll past at a relaxed, natural walking pace, in real time and not sped up or time-lapsed; a few stop to talk with staff at the booth. Movement is calm and lifelike, with no rushing or jerky motion. LED lighting and screens glow naturally.",
    "Keep the booth's design, structures, colors, logos and wording exactly as they are.",
    dir ? `Style: ${dir}` : "",
  ].filter(Boolean).join(" "),
};

const fal = (url, init = {}) => fetch(url, { ...init, headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });

async function currentUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return userFromToken(token).catch(() => null);
}

// Only images we stored ourselves (the customer's own finished AI images) may be animated by URL.
function ownStoredImage(url, userId) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  return typeof url === "string" && url.startsWith(`${base}/storage/v1/object/public/renders/${userId}/`) && /\.(jpe?g|png|webp)$/i.test(url);
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
      const { kind, image, sourceUrl, direction, brand } = req.body || {};
      const mode = req.body?.mode === "faithful" ? "faithful" : "upgrade";
      if (!MODELS[kind]) return res.status(400).json({ code: "bad_request", message: "Choose image or video." });
      const fromPhoto = kind === "video" && ownStoredImage(sourceUrl, user.id);
      if (!fromPhoto && (typeof image !== "string" || image.length < 1000 || image.length > 3_000_000)) return res.status(400).json({ code: "bad_request", message: "The current view couldn't be captured. Try again." });
      const pass = await activePass(user.email);
      if (!pass) return res.status(402).json({ code: "pass_required", message: "AI Render needs an active pass. See passes and pricing on the website." });
      if (!(await useMediaCredit(pass.id, kind))) return res.status(429).json({ code: "no_credits", message: `You've used all the AI ${kind}s on your pass.` });

      const dir = clean(direction, 600), b = brandLine(brand);
      const prompt = kind === "video" ? PROMPTS.video(dir, fromPhoto) : PROMPTS[mode](dir, b);
      const imageUrl = fromPhoto ? sourceUrl : `data:image/jpeg;base64,${image}`;
      const input = kind === "video"
        ? { prompt, image_url: imageUrl, duration: "5" }
        : MODELS.image.includes("nano-banana")
          ? { prompt, image_urls: [imageUrl], num_images: 1, output_format: "jpeg", ...(MODELS.image.includes("pro") ? { resolution: IMAGE_RESOLUTION } : { limit_generations: true }) }
          : { prompt, image_url: imageUrl, output_format: "jpeg", guidance_scale: 5 };
      const sub = await fal(`https://queue.fal.run/${MODELS[kind]}`, { method: "POST", body: JSON.stringify(input) });
      const job = await sub.json().catch(() => ({}));
      if (!sub.ok || !job.request_id) {
        await refundMediaCredit(pass.id, kind);
        console.error("fal submit failed", sub.status, JSON.stringify(job).slice(0, 300));
        return res.status(502).json({ code: "render_failed", message: "AI Render couldn't start. Your credit was not used. Try again." });
      }
      const row = await insertRender({
        owner: user.id, pass_id: pass.id, kind, model: MODELS[kind], status: "queued",
        prompt: `${kind === "image" ? mode : fromPhoto ? "from-photo" : "from-view"}: ${dir}`.slice(0, 600),
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
