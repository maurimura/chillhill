# Cloudflare deployment

## GitHub CI/CD

Repository: [maurimura/chillhill](https://github.com/maurimura/chillhill) (private).
`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch.
It installs locked dependencies with Node 24, runs the unit/API tests, type-checks
and builds the game, and checks the sharing preview with a JavaScript-disabled
crawler. Only a successful `main` run deploys. The deployment job downloads the
verified static build, applies pending D1 migrations, then runs Wrangler against
the existing `chillhill` Worker and database. Deployments are serialized and are
never canceled halfway through a migration. A read-only smoke test verifies the
live game, share image, both worldwide boards, and country preferences.

### One-time deployment secret

1. Create a [Cloudflare custom API token](https://dash.cloudflare.com/profile/api-tokens)
   named `chillhill GitHub deploy` with these permissions:
   - Account: **Workers Scripts / Edit**, **D1 / Edit**, **Account Settings / Read**.
   - Zone: **Workers Routes / Edit**, **Zone / Read**.
2. Restrict account resources to the game's account and zone resources to
   **maurimura.dev**. Do not use all accounts/zones or the Global API Key.
3. Save the token in [repository Actions secrets](https://github.com/maurimura/chillhill/settings/secrets/actions)
   as **CLOUDFLARE_API_TOKEN**. The account ID is already configured and is not a secret.
4. Open the **Test and deploy** workflow in GitHub Actions and re-run failed jobs
   if the first run was waiting for the secret. Future `main` pushes deploy automatically.

The workflow fails clearly if the secret is missing; it never reports a skipped
deployment as success. Do not commit credentials or paste them into chat/logs.
The local Wrangler OAuth login is interactive and is not reused as a CI token.
Actions use pinned official commit SHAs, `contents: read`, and no persisted checkout
credentials; monthly Dependabot PRs update action pins. PR jobs receive no deployment
secret and never access the production database.

References: [Cloudflare GitHub Actions setup](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[GitHub workflow security](https://docs.github.com/en/actions/reference/security/secure-use).

One Cloudflare Worker serves the built game and `/api/*`; a D1 database holds the
community top ten for Standard and Custom. The requested hostname is
`chillhill.maurimura.dev`. Local personal records and offline driving still work
without the API.

## Live deployment

The game is published at **https://chillhill.maurimura.dev**. The checked-in
`wrangler.jsonc` targets the existing `chillhill` Worker and
`chillhill-leaderboard` D1 database in the domain owner's account. Do not create
another database for routine updates.

First published on September 7, 2026. The production database starts with empty
leaderboards; local test names and scores are not imported.

For subsequent releases:

```sh
npm test
npm run db:migrate:remote
npm run deploy
```

Renew authentication with `npx wrangler login` if needed. Verify the homepage and
both `/api/leaderboard?category=standard` and `/api/leaderboard?category=custom`
after deploying. Keep production smoke checks read-only apart from ordinary game
sessions; `npm run test:cloudflare` intentionally accepts only localhost.

## First deployment in another account

1. Run `npm install` and `npx wrangler login`. Use the Cloudflare account that owns
   the active `maurimura.dev` zone. Do not put tokens in Vite variables, game code,
   committed files, or chat.
2. Inspect existing Workers, D1 databases, and the exact hostname in the dashboard.
   Reuse an existing chillhill resource if appropriate; do not replace another
   site's DNS/Worker. The apex and all other subdomains are outside this deployment.
3. Run `npx wrangler d1 create chillhill-leaderboard` only if no appropriate database
   exists. Copy its `database_id` into `wrangler.jsonc` and set the intended
   `account_id`. The committed IDs belong to the current live deployment; do not
   use them for another account or an unrelated site.
4. Run `npm run db:migrate:remote` to create the leaderboard tables.
5. Run `npm test`, `npm run build`, then `npm run deploy`.
6. Verify HTTPS at `https://chillhill.maurimura.dev` and
   `/api/leaderboard?category=standard`. Play a real completed Drift king run, claim
   a qualifying score with a nickname, and view it from a second browser. Do not
   seed test scores into production.

The custom domain configuration provisions the selected hostname through
[Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
The zone must already be active in this account. Keep `workers_dev: false` so the
game is published only at the requested custom domain. Do not upgrade an account
plan or enable paid products without the owner's approval.

## Full-stack local preview

```sh
npm run build
npm run db:migrate:local
npm run preview:cloudflare
```

Open `http://localhost:8787`. This runs the production build and the actual Worker
against isolated local D1 state in `.wrangler/`, never the remote database. Ordinary
`npm run dev` remains a lightweight, offline workflow with no leaderboard UI. API requests
are enabled in production builds (including this preview), not in the Vite-only
server. Music files and their attribution are deployed with the other static assets.

## Leaderboard behavior and limits

- The visible board is worldwide only. Production game-over results show the
  matching category beside the run summary (stacked on phones), with no source
  picker. Qualifying runs automatically show/focus the public nickname form.
  Local records are retained privately for resilience, not shown as a second board.
- A server-issued, expiring run token is requested when Drift king starts. Tokens
  stay in memory, never in local storage or URLs. Offline runs still save locally.
- Only positive, completed runs that reach a category's top ten can enter a public
  nickname. Nothing is published until the player chooses to submit it. Rank is
  checked again atomically at submission, because another player may have moved
  ahead while the form was open. Abandoned name prompts do not occupy a rank.
- Public entries contain the chosen nickname and run statistics, not email or
  accounts. Encourage nicknames rather than real names. The backend uses short-lived,
  salted IP hashes for abuse limiting; raw addresses are not stored in D1.
- Requests have bounded bodies, same-origin checks, input validation, hashed
  session tokens, replay protection, and score/speed/time plausibility limits.
  Sessions and abuse counters expire; each category retains ten named records.
- **This is a community leaderboard, not cheat-proof competitive ranking.** The
  browser still calculates the run. A determined modified client can fabricate
  plausible statistics. Server-side simulation/replay verification would be a
  separate feature before introducing prizes or competitive rewards.
- Rules v3 raises the Standard top speed to 110 km/h. Older v1/v2 personal records
  and D1 rows remain untouched; current boards only rank matching rules.
- `/api/preferences` uses Cloudflare's country metadata for automatic driving
  units. It needs no database and returns only a country code with `no-store`;
  it never returns or records an IP, city or precise location.

Static assets and API routing follow Cloudflare's
[asset binding configuration](https://developers.cloudflare.com/workers/static-assets/binding/).
Database setup uses [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
Use `npm run db:migrate:remote` and `npm run deploy` for subsequent updates; inspect
Cloudflare usage limits before promoting the game widely. Database records are
user data: export/back up before destructive schema changes or manual moderation.
