# AI Booth Design

Landing site and 3D trade show booth designer, staged at `staging.aiboothstudio.com`.

| Path | What it is |
|---|---|
| `index.html` | Landing page |
| `app/index.html` | The 3D booth designer |
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
| `terms/`, `privacy/`, `refunds/` | Legal pages (drafts: fill in the highlighted details and have them reviewed) |

## Hosting (Vercel)

1. Import this repository in Vercel. No build step is needed; framework preset "Other".
2. In **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` (from console.anthropic.com). Without it the site works but the AI features say they aren't set up.
3. In **Settings → Deployment Protection**, keep protection on while this is a test site.
4. In **Settings → Domains**, add `staging.aiboothstudio.com`, then add the CNAME record Vercel shows in GoDaddy DNS.

Every push to `main` deploys; every other branch gets its own preview link.

## Not live yet (placeholders)

- AI Render image and video generation.
- Set AI_REQUIRE_PASS=1 in Vercel to limit AI features to signed-in customers with an active pass.
- The site is marked `noindex` so search engines skip it while it's a test site.

## Notes

- `/api/claude` has no sign-in check yet, so anyone who can reach the site can spend API credit. Keep Vercel deployment protection on until accounts are in place.
- The app still works as a claude.ai artifact: the shim only steps in when the claude.ai runtime isn't there.
