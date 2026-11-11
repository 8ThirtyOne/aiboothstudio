# AI Booth Design

Landing site and 3D trade show booth designer, staged at `staging.aiboothstudio.com`.

| Path | What it is |
|---|---|
| `index.html` | Landing page |
| `app/index.html` | The 3D booth designer page (markup) |
| `app/app.css`, `app/app.js` | The designer's styles and code |
| `app/three-loader.js` | Loads three.js r170 and keeps r128-era colors and lighting, then starts the app |
| `app/cloud.js` | Designs saved to accounts, autosave, share links and the view-only mode (`/app/?view=…`) |
| `app/ai-render.js` | AI Render, live: photo-realistic images and videos using pass credits |
| `api/render.js` | Starts and tracks fal.ai renders (FAL_KEY), uses and refunds credits, stores results |
| `models/` | Real 3D models (CC0, Poly Haven) that replace built-in shapes; see models/README.md |
| `tools/bump-version.sh` | Bumps the release number (file labels and the version shown in the app) before each release |
| `api/share.js` | Serves a shared design to its view-only link |
| `img/` | Images and the hero video |
| `js/claude-shim.js` | Lets the pages run outside claude.ai: AI requests go to `/api/claude`, file saves become normal downloads |
| `api/claude.js` | Server function that calls the Claude API for AI Build, photo to 3D and prompt writing |
| `api/contact.js` | Contact form endpoint: emails messages through Resend (RESEND_API_KEY, CONTACT_TO, CONTACT_FROM) |
| `api/checkout.js` | Starts a Stripe Checkout payment for a pass (prices in `api/_plans.js`) |
| `api/stripe-webhook.js` | Receives Stripe payment notices, checks the signature, emails the owner |
| `thanks/index.html` | Page shown after a successful payment |
| `js/config.js`, `js/accounts.js` | Supabase sign-in (email links) and the signed-in customer's active pass |
| `api/_db.js` | Server access to the passes table (SUPABASE_URL, SUPABASE_SECRET_KEY) |
| `supabase/schema.sql` | Database setup, run once in the Supabase SQL Editor |
| `supabase/002_ai_limits.sql` | Adds AI action limits per pass; run after schema.sql |
| `supabase/003_designs.sql` | Designs table for saved designs and share links |
| `supabase/004_renders.sql` | Renders table, image and video credit functions, public "renders" storage bucket |
| `terms/`, `privacy/`, `refunds/` | Legal pages (drafts: fill in the highlighted details and have them reviewed) |

## Hosting (Vercel)

1. Import this repository in Vercel. No build step is needed; framework preset "Other".
2. In **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` (from console.anthropic.com). Without it the site works but the AI features say they aren't set up.
3. In **Settings → Deployment Protection**, keep protection on while this is a test site.
4. In **Settings → Domains**, add `staging.aiboothstudio.com`, then add the CNAME record Vercel shows in GoDaddy DNS.

Every push to `main` deploys; every other branch gets its own preview link.

## Not live yet (placeholders)

- Set AI_REQUIRE_PASS=1 in Vercel to limit AI features to signed-in customers with an active pass.
- The site is marked `noindex` so search engines skip it while it's a test site.

## Notes

- `/api/claude` has no sign-in check yet, so anyone who can reach the site can spend API credit. Keep Vercel deployment protection on until accounts are in place.
- The app still works as a claude.ai artifact: the shim only steps in when the claude.ai runtime isn't there.
