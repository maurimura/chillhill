# Cloudflare deployment

## GitHub CI/CD

Repository: [maurimura/chillhill](https://github.com/maurimura/chillhill) (public).
`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch.
It installs locked dependencies with Node 24, runs the unit/API tests, type-checks
and builds the game, and checks the sharing preview with a JavaScript-disabled
crawler. Only a successful `main` run deploys. The deployment job downloads the
verified static build, applies pending D1 migrations, then runs Wrangler against
the existing `chillhill` Worker and database. Deployments are serialized and are
never canceled halfway through a migration. A read-only smoke test verifies the
live game, share image, the combined worldwide board, and country preferences.

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

CI also scans the full checked-out Git history with checksum-pinned Gitleaks,
checks npm advisories, and tests the production browser security policy and API
against disposable local D1 state. Weekly npm Dependabot updates keep application
and build dependencies under review. See [the security review](security-review.md)
for findings, remaining limitations, and repository settings.

The local API and browser security suites run concurrently, and either failure
blocks deployment. Local fixture addresses keep their rate-limit allowances separate.
Within `test:cloudflare`, independent validation/read checks run in parallel; the
start, finish and naming phases remain ordered. Simultaneous finish/name retries
must publish exactly one entry. The rate-limit probe sends bounded batches of
eight and verifies that other clients, game assets and preferences remain available.
Named API checks report their own timings and collect all failures in each batch.
The browser security suite does not export or download videos.

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

Leaderboard entries live in D1 separately from Worker deployments. Reusing the same
database binding preserves them across releases. The combined board ranks existing
Standard and Custom entries together across all game versions. Migrations
`0002_combined_leaderboard.sql` and `0003_all_time_leaderboard.sql` add ranking
indexes without deleting records. Legacy category and version query parameters are ignored.

For subsequent releases:

```sh
npm test
npm run db:migrate:remote
npm run deploy
```

Renew authentication with `npx wrangler login` if needed. Verify the homepage and
`/api/leaderboard`
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
   `/api/leaderboard`. Play a real completed Drift king run, claim
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
  combined top ten beside the run summary (stacked on phones), with no source
  or category picker. Standard and Custom runs compete in the same ranking. Qualifying runs automatically show/focus the public nickname form.
  Local records are retained privately for resilience, not shown as a second board.
- A server-issued, expiring run token is requested when Drift king starts. Tokens
  stay in memory, never in local storage or URLs. Offline runs still save locally.
- Only positive, completed runs that reach the combined top ten can enter a public
  nickname. Nothing is published until the player chooses to submit it. Rank is
  checked again atomically at submission, because another player may have moved
  ahead while the form was open. Abandoned name prompts do not occupy a rank.
- Public entries contain the chosen nickname and run statistics, not email or
  accounts. Encourage nicknames rather than real names. The backend uses short-lived,
  salted IP hashes for abuse limiting; raw addresses are not stored in D1.
- Requests have bounded bodies, same-origin checks, input validation, hashed
  session tokens, replay protection, and score/speed/time plausibility limits.
  Sessions and abuse counters expire; the board retains one all-time top ten of named records.
- The `API_RATE_LIMITER` binding rejects bursts before D1 access: 60 requests per
  minute per source address and operation (board reads, run starts, run writes).
  All leaderboard queries share the read allowance; all run IDs share the
  write allowance. Keep this binding configured: missing/unavailable limits make
  leaderboard requests return 503 while the game and country preferences work.
  The existing durable hourly limits still apply to writes. Cloudflare's counters
  are approximate and per location, so this reduces abuse rather than imposing a
  global spending cap. Shared networks can share an allowance. The daily hashed
  edge keys are pseudonymous, not anonymous; raw addresses are never stored in D1.
- `public/_headers` sets the static site's Content Security Policy, frame blocking,
  HTTPS policy and other browser protections. API responses set their own headers.
  Scripts, workers and network requests are restricted to this site's origin;
  inline styles support paint/UI controls, and data/blob images support previews.
  Test through Wrangler with `npm run test:security`; Vite preview does not apply
  Cloudflare's `_headers` rules.
- **This is a community leaderboard, not cheat-proof competitive ranking.** The
  browser still calculates the run. A determined modified client can fabricate
  plausible statistics. Server-side simulation/replay verification would be a
  separate feature before introducing prizes or competitive rewards.
- Scoring-version metadata is retained only as history. It never separates the
  public ranking, qualification, or name admission. Private records read older
  versioned browser saves and use the permanent `chillhill.scores` key for new saves.
- `/api/preferences` uses Cloudflare's country metadata for automatic driving
  units. It needs no database and returns only a country code with `no-store`;
  it never returns or records an IP, city or precise location.

Static assets and API routing follow Cloudflare's
[asset binding configuration](https://developers.cloudflare.com/workers/static-assets/binding/).
Database setup uses [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
Use `npm run db:migrate:remote` and `npm run deploy` for subsequent updates; inspect
Cloudflare usage limits before promoting the game widely. Database records are
user data: export/back up before destructive schema changes or manual moderation.
