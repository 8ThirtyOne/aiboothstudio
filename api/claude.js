// POST /api/claude — the app's AI features (AI Build, photo to 3D, prompt writing) call Claude through here.
// Needs ANTHROPIC_API_KEY set in the hosting provider's environment settings. The key never reaches the browser.
import Anthropic from "@anthropic-ai/sdk";
import { activePass, dbConfigured, useAiAction, userFromToken } from "./_db.js";

// Reads ANTHROPIC_API_KEY from the environment. Stays inside the host's function time limit.
const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
const MODEL = "claude-opus-5-5";
const MAX_IMAGES = 4;
const MAX_PROMPT_CHARS = 60_000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed", message: "Use POST." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ code: "not_configured", message: "AI features aren't set up on this server yet." });

  // With AI_REQUIRE_PASS=1, only signed-in customers with an active pass and AI actions left can use the AI features.
  let pass = null;
  if (process.env.AI_REQUIRE_PASS === "1") {
    if (!dbConfigured()) return res.status(503).json({ code: "not_configured", message: "Accounts aren't set up on this server yet." });
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = await userFromToken(token).catch(() => null);
    if (!user) return res.status(401).json({ code: "sign_in_required", message: "Sign in to use AI features." });
    pass = await activePass(user.email).catch(() => null);
    if (!pass) return res.status(402).json({ code: "pass_required", message: "AI features need an active pass. See passes and pricing on the website." });
    if (pass.ai_used >= pass.ai_total) return res.status(429).json({ code: "ai_limit", message: `You've used all ${pass.ai_total} AI design actions on your pass.` });
  }

  const { input, images = [], tier = "default" } = req.body || {};
  const messages = Array.isArray(input) ? input : [{ role: "user", content: String(input || "") }];
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || typeof last.content !== "string" || !last.content.trim()) {
    return res.status(400).json({ code: "bad_request", message: "Send a prompt." });
  }
  if (JSON.stringify(messages).length > MAX_PROMPT_CHARS) return res.status(413).json({ code: "too_large", message: "That request is too long." });
  if (!Array.isArray(images) || images.length > MAX_IMAGES) return res.status(400).json({ code: "bad_request", message: `Send at most ${MAX_IMAGES} images.` });

  // Images ride along with the final user message, ahead of its text.
  const finalContent = [
    ...images.map(data => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: String(data) } })),
    { type: "text", text: last.content },
  ];
  const apiMessages = [...messages.slice(0, -1), { role: "user", content: finalContent }];

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      messages: apiMessages,
      output_config: { effort: tier === "complex" ? "high" : "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") {
      return res.status(422).json({ code: "refused", message: "The AI declined this request. Try rewording it." });
    }
    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    // Count the action only once Claude has answered, so failed requests don't use up the allowance.
    if (pass) await useAiAction(pass.id).catch(err => console.error("ai action count failed", err?.message));
    return res.status(200).json({ text, truncated: response.stop_reason === "max_tokens" });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ code: "rate_limited", message: "The AI is busy. Try again in a moment." });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ code: "not_configured", message: "The AI service key is invalid." });
    if (err instanceof Anthropic.BadRequestError) {
      console.error("claude bad request", err?.message);
      return res.status(400).json({ code: "bad_request", message: "The AI couldn't read that request." });
    }
    if (err instanceof Anthropic.APIConnectionTimeoutError) return res.status(504).json({ code: "timeout", message: "The AI took too long to answer. Try again." });
    if (err instanceof Anthropic.APIConnectionError) return res.status(502).json({ code: "network", message: "Couldn't reach the AI service." });
    console.error("claude api error", err?.status, err?.name, err?.message);
    return res.status(502).json({ code: "server_error", message: "The AI service returned an error.", status: err?.status ?? null });
  }
}

export const config = { maxDuration: 60 };
