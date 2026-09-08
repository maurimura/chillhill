# Security review — September 7, 2026

No exposed credentials were found in the audited code, history or production build.
This is a scoped security review, not a guarantee that every vulnerability or
secret format can be detected.

## Evidence and scope

- Gitleaks 8.30.1, downloaded from its official GitHub release and checked against
  the published SHA-256, returned zero findings for the public mirror (all five
  branches, 12 commits at the initial snapshot), local Git history/reflogs, all
  301 historical file blobs (including local merge/checkpoint snapshots), and
  the built `dist/` directory. Reports were redacted and kept outside the repo.
  The initial main revision was `30f21af`; concurrent sharing-metadata edits were
  left intact.
- No private `.env`, `.dev.vars`, private-key file or credential store was found
  in the tracked historical paths. `.env.example` contains public game defaults.
  The Cloudflare account/database IDs identify resources; they do not authorize
  access. `CLOUDFLARE_API_TOKEN` appears as a GitHub Actions secret reference,
  never as a hardcoded credential. No credential rotation is indicated by these
  findings.
- The npm advisory audit returned **zero known vulnerabilities**, including build
  dependencies, on the review date. This result can change as advisories appear.
- Read-only HTTPS requests to the live game confirmed `/.env`, `/.git/config`
  and `/worker/index.ts` returned exactly the same HTML as the home page (the SPA
  fallback), not the named private files. No synthetic runs were submitted to
  production.
- Reviewed the Worker routes, SQL, token lifecycle, input validation, public
  serialization, browser rendering/imports, deployment configuration and CI.
  No authentication bypass, SQL injection or exploitable user-input HTML
  injection was identified in that scope.

## Findings and changes

| Finding                                                                                            | Impact                                                                                             | Action                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub secret scanning and push protection were disabled                                           | Future credentials could reach the public repository without repository-level prevention or alerts | Enabled both with owner approval; a follow-up API read confirmed both enabled and returned no secret-scanning alerts                           |
| Board GETs reached D1 without throttling; rejected POSTs still queried the database-backed limiter | Automated traffic could exhaust database availability or usage allowance                           | Added a Cloudflare rate-limit binding before D1 for reads and writes, while retaining durable hourly write limits; binding failures return 503 |
| Live HTML lacked CSP, frame restrictions and other browser security headers                        | Fewer browser defenses against injected content, external connections and framing                  | Added `public/_headers`, equivalent API protections, local browser verification, and deployment header assertions                              |
| CI did not scan secrets or npm advisories; Dependabot covered Actions only                         | Regressions or newly vulnerable dependencies could go unnoticed                                    | Added a checksum-pinned Gitleaks history scan, npm audit gate, weekly npm updates, and local API/CSP checks in CI                              |

Repository settings above are live. Code and workflow changes in this review
require the normal commit/review/deployment process before affecting production.

## Existing protections verified

- SQL values use bound parameters; ranking/admission writes run atomically.
- Run capabilities use 32 random bytes, are hashed in D1, expire after 24 hours,
  stay in browser memory, and are excluded from public records and logs.
- Writes require same-origin JSON, check the streaming 8 KiB body limit, validate
  names and score fields, prevent conflicting retries/replays, and use server
  completion times for ranking ties. Origin headers deter cross-site browser
  submissions; they do not authenticate a custom HTTP client.
- Public records contain only the nickname and allowed run fields. Names and
  other dynamic scoreboard text are escaped. Imported scene names use DOM text.
- Fork PR verification receives no deployment token. Actions are pinned to commit
  SHAs, checkout credentials are not persisted, and workflow permissions are read
  only. Deployment currently runs only after verification on `main`.

## Remaining limitations and owner decisions

1. **Community score integrity:** the browser computes the score. A modified
   client can submit plausible fabricated statistics with its own valid session.
   Local API tests demonstrate that synthetic records can be admitted. Publishing
   the source makes the rules visible but does not create this trust limitation.
   Server-verified replays/simulation would be needed for competitive rewards.
2. **Distributed abuse:** edge rate limits are approximate and per Cloudflare
   location. Per-address limits can affect shared networks and can be evaded by
   distributed sources. They reduce D1 load; they are not a global spending cap
   or complete bot/DDoS defense. Cloudflare billing limits and account-wide WAF
   settings were not changed or audited.
3. **Repository/deployment governance:** at inspection, `main` had no branch
   protection or rulesets; the `production` environment had no reviewers or branch
   restrictions. Only authorized writers can push, but a compromised writer
   could alter workflows or deploy credentials. Consider requiring the existing
   verification check, blocking force pushes/deletion, and limiting production
   deployments to `main`. These settings were not changed.
4. **Coverage boundaries:** this review did not inspect GitHub Actions log/archive
   contents, removed remote history, forks/caches, account credentials, deployment
   token scopes, or the Cloudflare account's security configuration. GitHub's
   initial zero-alert response is not proof every asynchronous scan is finished.
5. **Data retention:** expired sessions/counters are pruned in bounded batches on
   new run creation. Expiry prevents their use but is not a scheduled guarantee
   that data is deleted exactly 24 hours later.

## Validation

- `npm test`: 235 passing tests, including rejection before D1 access, stable
  rate-limit keys, fail-closed behavior, existing token/replay checks and SQLite
  transaction tests.
- `npm run build`: both TypeScript checks and the production Vite build passed.
- `npm run test:cloudflare`: exercised the actual Worker/D1 bindings on isolated
  local state, including synthetic names, validation and edge limits.
- `npm run test:security`: Chromium verified game/garage rendering, car previews,
  fonts, music and the terrain worker under CSP; inline-script injection and
  an external fetch were blocked by the browser.

The combined replay/curves release also verifies worker video export, automatic
download and local video playback under CSP. `media-src` permits `blob:` for
generated clips alongside same-origin music. External connections and inline
scripts remain blocked. Release verification passed all 294 unit tests; the
dependency audit and scans of staged changes and 70 Git commits reported no findings.

References: [Gitleaks](https://github.com/gitleaks/gitleaks),
[Cloudflare static response headers](https://developers.cloudflare.com/workers/static-assets/headers/),
[Cloudflare rate-limit binding and limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[GitHub secret scanning](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enable-secret-scanning),
[free public-repository push protection](https://github.blog/changelog/2023-05-09-secret-scannings-push-protection-is-available-on-public-repositories-for-free/).
