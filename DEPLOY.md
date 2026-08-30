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

## Phase 2 — Facebook Pages lane (LIVE 2026-08-25)

Built and live-verified the same night: a real commenter ("Qualify" on a
Benefitsusa Page post) got the public reply + Messenger DM within 5s of
commenting. Both Pages connected (Benefitsusa 1061951727001979, Coveredusa
1067601133110947), webhooks subscribed, tokens encrypted at rest.

How it works: same 14 campaigns cover both platforms (platform is a delivery
detail). `object:"page"` feed webhooks + a per-Page polling sweep enqueue
`process-fb-comment` jobs; the worker matches workspace campaigns and sends
via the Page token (Messenger button template, inline-link fallback).
DmLog rows carry `platform: "facebook"`.

Meta-console facts that cost time, recorded so they never cost it again:
- Page permissions are NOT available until the FB use cases are added
  ("Engage with customers on Messenger" + "Manage everything on your Page"),
  and three of them (pages_read_engagement / manage_engagement /
  read_user_content) need explicit per-permission "Add" inside the Pages use
  case — one shows a confirmation modal that silently swallows the click.
- The standalone Webhooks console page doesn't exist for this app type; the
  app-level Page subscription was created via Graph API:
  POST /{app-id}/subscriptions (app token "id|secret"), object=page,
  fields=feed — verified instantly against our live endpoint.
- FB OAuth redirect lives in Facebook Login for Business → Settings →
  Valid OAuth Redirect URIs: /api/facebook/callback.
- Env: FACEBOOK_APP_ID=1918526319127174 on Vercel + Railway worker.

## Keyword matching — how strict a comment has to be (2026-08-28)

Campaigns fire on `Automation.matchMode`, not on a bare "does the word appear" test:

| mode | fires on | use for |
|---|---|---|
| `exact` | the keyword alone | nothing today; strictest |
| `standalone` **(default)** | keyword + punctuation, emoji, politeness | all 14 production campaigns |
| `anywhere` | keyword as a whole word mid-sentence | opt-in only; the old behaviour |
| `contains` | substring ("linking" matches "link") | rarely what you want |

**Why the default is `standalone`.** The trigger words are ordinary English (BILL, PLAN,
FOOD, COVERAGE) and every campaign runs on every post, so `anywhere` DM'd people who were
only *talking* — and posted a public reply under their comment, which is what the audience
sees. It sent three unwanted DMs in the first five days, one of them under a comment
criticizing our accuracy. Details in `memory/error-log.md` (2026-08-28).

**Changing it:** dashboard → the campaign → "And this comment has" → the two radios under
the keyword box. No deploy needed.

**Before changing the matcher, replay it against real text — never invented examples:**
```bash
npx tsx scripts/replay-corpus.ts <corpus.json>       # prints anywhere vs standalone disagreements
DATABASE_URL=<prod> npx tsx scripts/verify-match-mode.ts   # asserts every live campaign is strict
```
`scripts/verify-match-mode.ts` exits 1 if any live campaign fires mid-sentence, and it runs
the reconciler's exact `select`, so it also catches a schema/client drift that would make the
sweeps throw.

**The guard:** `/api/health` `ops.looseMatchCampaigns` (setting) and `ops.sentenceDms24h`
(what actually shipped) should both read 0. Watchdog rules 10 and 11 alert on either.

## The public reply is a receipt, not a promise (2026-08-30)

Every message in a campaign's public-reply pool claims delivery — "sent!",
"check your DMs", "on its way!". The worker used to post it **before** the DM,
deliberately: "decoupled so a DM failure never suppresses it."

On 2026-08-30 three people commented `Premium` on the Medicare reel. All three
got a public "sent!" under their own comment. None got a DM. Meta refused the
send with a bare `Invalid parameter` — `code=100 sub=1893060`, which Meta does
not document anywhere. It is recipient-side: 3 comments failed while **36
others on the same post, same campaign, same token** went through, interleaved
in time.

The order is now: **DM first, public reply only once the DM is a fact.** Also
silent on plan-limit skips, cross-campaign dedup skips, and rate-limit
requeues, all of which used to announce a send that had not happened. The
retry pass for a DM that already sent still posts its outstanding reply.

**A DM failure now means nothing was said in public.** That is the correct
default — better silence than a false claim — but it does mean a person whose
account refuses message requests gets nothing at all. If you want them handed
the link publicly instead, that is a product decision and needs new copy.

### Reading a failure without database access

`/api/health` now returns `dmAttempts24h` and `dmFailureReasons24h` — a
trace-stripped tally of the real Meta errors, no comment text and no user ids
(the endpoint is unauthenticated). A bare count cannot tell "three accounts
refuse message requests" (nothing to fix) from "the token died" (everything is
down), so the watchdog quotes the reasons and only fires when failures are BOTH
>= 5 and > 15% of attempts.

### Reaching the database from a laptop

`DATABASE_URL` in `.secrets/openreply-railway-pg.json` points at
`postgres.railway.internal`, which only resolves inside Railway. Use the public
proxy in the table at the top of this file:

```
postgresql://postgres:$PGPASSWORD@altaria.proxy.rlwy.net:17030/railway
```

`railway ssh` is NOT a fallback — it needs an SSH key registered on Jacob's
Railway account, which is an account settings change.

### Deploying both halves

The app and the worker are separate deploys and BOTH are needed for a change
that touches `lib/`:

```bash
npx vercel deploy --prod --token "$(cat ../../.secrets/vercel-token.txt)" --yes
railway up --service worker --detach
```

Confirm the worker actually restarted by checking that
`checks.worker.heartbeat.startedAt` moved — `railway up` returning a build URL
is not evidence the new code is running.
