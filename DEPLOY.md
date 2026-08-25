# OpenReply — Deployment Runbook (deployed 2026-08-24)

Comment-to-DM automation for @benefitsus (Instagram). Self-hosted fork of
diwenne/openreply. Facebook Pages lane is a planned fork (see bottom).

## The live system

| Piece | Where | Notes |
|---|---|---|
| Web app | https://openreply-lake-ten.vercel.app (Vercel project `openreply`, team jacobs-projects-9f6ae645) | Deploys via `npx vercel deploy --prod` from this repo. NOT git-connected — CLI deploys only. |
| Worker | Railway project `openreply` (267a1dec-6646-4de6-a3eb-52f49c622b28), service `worker` | Deploys via `railway up` from this repo. Build: `npm run db:generate`, Start: `npm run worker` (set in Railway service settings, NOT railway.json — see gotcha #1). |
| Postgres | Railway, public: altaria.proxy.rlwy.net:17030 | Vars saved: `.secrets/openreply-railway-pg.json` |
| Redis | Railway, public: altaria.proxy.rlwy.net:24340 | Vars saved: `.secrets/openreply-railway-redis.json` |
| Login | Email magic link via Resend (benefits-usa key), from openreply@benefitsusa.org | Dashboard account: jrp90272@gmail.com. **Magic links land in Gmail SPAM** — search `in:anywhere subject:"Sign in to openreply"`. |
| Secrets | `.secrets/openreply-env.txt` | ENCRYPTION_KEY must stay identical on Vercel + Railway worker forever. |

Health check (worker, db, redis, queue in one shot):
`curl -s https://openreply-lake-ten.vercel.app/api/health`

## Meta app

- **BenefitsUSA OpenReply**, app id 1918526319127174, PUBLISHED (Live), owned by
  Jacob's personal FB (developer account registered 2026-08-24).
- Use case: "Manage messaging & content on Instagram" (Instagram-login variant,
  NOT Facebook Login — the docs warn mixing them breaks OAuth).
- Instagram app id 1708880473522080 (this is INSTAGRAM_APP_ID; the 1918… id is
  only for the console URL and FACEBOOK_APP_SECRET).
- Webhook: https://openreply-lake-ten.vercel.app/api/webhook — verified, fields
  `comments` + `messages` (+ postbacks/referral/seen) subscribed, v26.0.
- OAuth redirect: https://openreply-lake-ten.vercel.app/api/instagram/callback
- **The IG account is @benefitsus** (NOT benefitsusa, NOT benefitsusaca — the
  old handle was renamed). Instagram Tester invite sent AND accepted 2026-08-24.
- Standard Access only: every additional IG account must be added as an
  Instagram Tester (App roles → Add People → Instagram Tester → pick from the
  AUTOCOMPLETE — free-typed names silently fail) and must accept at
  instagram.com → Settings → Website permissions → Apps and websites → Tester
  Invites (works on desktop web, no phone needed).

## Gotchas learned during deploy (do not relearn these)

1. **railway.json in the repo breaks Vercel.** Vercel's CLI detects it, flips
   the project to a `services` framework, and REWRITES vercel.json to build
   with Railway's worker command. Worker build/start commands live in Railway
   service settings instead. If Vercel ever builds with `npm run db:generate`
   again, check for a resurrected railway.json / services block in vercel.json.
2. Railway's new Postgres/Redis templates ship with NO public TCP proxy.
   Enabled via GraphQL `tcpProxyCreate` (backboard.railway.com/graphql/v2,
   bearer = accessToken from ~/.railway/config.json).
3. Railway's GitHub integration has no access to the JPonskis/openreply fork —
   hence `railway up` CLI deploys.
4. Meta password re-prompts: creating the app and revealing App secrets each
   require Jacob to re-enter his FB password (FB personal pw in
   .secrets/social-accounts.md).
5. An older app "AutoReplies-IG" is authorized on the IG account since Aug 12
   (previous attempt, not ours). Harmless; can be removed in Apps and websites.

## Ops

- **14 production campaigns live since 2026-08-25** — one per TOOL_WORDS.md
  registry word, any-post, whole-word, case-insensitive, public replies ON
  (20 rotating variants each: 19 common + 1 flavored). DM copy approved by
  Jacob 8/25. Created by scratchpad ship_campaigns.js (raw inserts modeled on
  a UI-created row); edit them in the dashboard from here on.
- Test campaign "TEST pipeline check" verified the full loop 8/25 (comment →
  webhook → DM SENT → link click tracked), then deactivated.
- Upstream sync: `git fetch upstream && git merge upstream/main` then redeploy
  both (upstream = diwenne/openreply; maintainer ships fixes near-daily).
- Vercel crons (vercel.json): token refresh daily 5:00 UTC (CRON_SECRET).
- Polling reconciler runs inside the Railway worker every 5 min (catches
  comments the webhook missed).

## Phase 2 — Facebook Pages fork (scoped, not built)

Add `object: "page"` webhook branch + FB client (private replies via
`/{page-id}/messages` with `recipient: {comment_id}`) + Page OAuth. In the
Meta app: add use case "Engage with customers on Messenger", subscribe Page
webhooks (`feed`). Scope: 2–4 days. See conversation notes 2026-08-24.
