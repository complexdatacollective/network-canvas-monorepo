# Protocol Review Worker

A Cloudflare Worker behind Architect's experimental **Automated Protocol
Review**. When a researcher asks for a review, Architect sends their protocol
and four study details (research questions, population, how the interview is
run, and an optional synopsis) to this service. The service asks Claude for an
adversarial review and streams back a list of problems, each with a fix
written as edits to the protocol.

The service exists so that no API key ships inside Architect, and so that the
spending on the model can be limited in one place.

The wire contract (the request, the events, the error codes and the limits)
is `src/contract.ts`. Architect imports it as
`@codaco/protocol-review-worker/contract`.

## How it works

1. Architect sends `POST /review` from `https://architect.networkcanvas.com`
   or `https://architect.networkcanvas.dev`. Requests from any other origin are
   refused (`403 forbidden_origin`).
2. The body is read up to its size limit and checked against the contract.
3. The hourly limits and the monthly and daily spending ceilings are checked,
   and the most the review could cost is reserved from the budget.
4. Claude (`claude-opus-5-5`) reviews the protocol, guided by the rubric in
   `src/prompt/rubric.ts` and the protocol reference in
   `src/prompt/protocol-reference.ts`. While it writes, the service sends
   `progress` events; when it is done, one `result` event.
5. The reservation is settled to what the review really cost, as reported by
   the API. When a call fails without saying what it cost (a lost connection,
   a timeout, a cancellation before the answer began), the whole reservation
   is kept, because the provider may have billed for it. Only a request the
   provider refused outright, with an HTTP error status before any answer
   began, is settled to nothing.

If the model provider fails (a bad key, no credit, overload, an outage, a
refusal, an answer that does not parse, a timeout), the researcher gets
`service_unavailable` and the review does not count against their hourly
limit. The service does not retry a failed call: a retried call reports only
the cost of its last attempt, so the researcher presses Try again instead. The service logs a fixed reason code and the HTTP status, and sends the
team one PostHog event, `protocol_review_service_failure`, holding only that
code and status.

## Limits

| Limit                         | Value                            | Where it is set                                        |
| ----------------------------- | -------------------------------- | ------------------------------------------------------ |
| Reviews per installation      | 5 an hour                        | `REVIEW_LIMITS.perInstallationPerHour`, contract.ts    |
| Reviews per network address   | 30 an hour                       | `REVIEW_LIMITS.perAddressPerHour`, contract.ts         |
| Largest request               | 750,000 bytes                    | `REVIEW_LIMITS.maxRequestBytes`, contract.ts           |
| Shared reviews kept for       | 90 days                          | `REVIEW_LIMITS.sharedReviewRetentionDays`, contract.ts |
| Spending on the model a month | US $200 (UTC calendar month)     | `MONTHLY_SPEND_CEILING_USD`, constants.ts              |
| Spending on the model a day   | US $20 (UTC day)                 | `DAILY_SPEND_CEILING_USD`, constants.ts                |
| Answer length                 | 40,000 tokens, thinking included | `MAX_OUTPUT_TOKENS`, constants.ts                      |
| Findings per review           | 12                               | `MAX_FINDINGS`, constants.ts                           |
| Time per review               | 8 minutes                        | `MODEL_TIMEOUT_MS`, constants.ts                       |

An hourly window starts at the first review counted against an installation
or address and lasts one hour. A review that fails or is refused gives its
count back; a review the researcher cancels still counts, including one
cancelled before the model was called. A cancelled review stops the model
call at once (or never starts it), whenever the researcher leaves: while the
request is being read and admitted, before the answer begins, or while it
streams. Every limit and
price is a constant in source, never read from the environment, so the app
that explains the limits and the service that enforces them cannot disagree.

The limits are kept in one SQLite-backed Durable Object (`ReviewLimiter`),
so the counts are exact even when reviews arrive together. Before calling the
model, a review reserves its worst case from the budget: one token for
every UTF-8 byte it sends (the instructions, the protocol and study details,
and the answer's schema), since no token stands for less than a byte, plus
1,000 tokens for the API's framing, all at the cache-write price, plus the
whole answer cap. Afterwards the reservation is replaced by the real cost.
Concurrent reviews therefore cannot together overshoot a ceiling. The bound
is generous: the instructions alone reserve about $0.98, a typical protocol
of 50–150 KB about $1.25–$1.75, and a review of the largest allowed request
(750,000 bytes) about $4.75, so near a ceiling only a few large reviews can
run at once, though each settles to its real cost when it ends.

There are two ceilings, and a review must fit under both:

- **The month** (US $200) is the service's whole budget. The Anthropic API
  key carries the same monthly limit, and the service counts at least what
  the provider bills, so it reaches its own ceiling first and can say when
  reviews start again. When what is left of the month cannot cover a
  reservation, the review is refused with `503 monthly_limit` until the first
  midnight UTC of the next month.
- **The day** (US $20, a tenth of the month) stops one bad day from spending
  the month. When what is left of the day cannot cover a reservation, the
  review is refused with `503 daily_limit` until the next midnight UTC.

The month's spending is the sum of its days, each counted on the day its
review was admitted. A review admitted in the last minutes of a month is
counted in that month even if the provider bills it in the next, so the two
counts can differ at the boundary by the cost of the reviews then running.

## What is stored, and what is not

- **The limiter** holds counters only: for each hourly window, a SHA-256 hash
  of the installation id or of the network address, when the window started
  and ended, and how many reviews it counted; and, for each UTC day of the
  current month, the amount spent. Raw addresses and ids are never stored.
  Windows that have ended, and days of earlier months (but for yesterday),
  are deleted as new reviews arrive.
- **Shared reviews.** Only when the researcher chose to share the review, and
  only when it succeeded, the service keeps
  `{ receivedAt, locale, studyContext, protocol, findings }` in the
  `SHARED_REVIEWS` KV namespace under `review:<reviewId>`. KV deletes it after
  90 days.
- **Nothing else.** A review that was not shared leaves no trace of its
  content. Logs and analytics carry only fixed reason codes and HTTP statuses:
  no text, no ids, no addresses.
- **Anthropic** receives the protocol and study details to write the review,
  under the organisation's API data-retention terms.

## Releasing

The Worker has a release lane of its own. Nothing else deploys it: not the
normal Changesets lane, and not a push that leaves its version alone.

1. A pull request that changes the Worker adds a changeset naming
   `@codaco/protocol-review-worker` and nothing else (`pnpm changeset`;
   `pnpm check:changesets` refuses a changeset that mixes it with another
   lane).
2. Once that merges, CI opens or updates the **Release Protocol Review
   Worker** pull request (`changeset-release/protocol-review`), which moves
   the version and writes `CHANGELOG.md`.
3. Merging the release pull request deploys. The `apps-release-protocol-review`
   job in `.github/workflows/ci-and-release.yml` runs `wrangler deploy` with
   the Anthropic API key, waits until the service answers at
   `protocol-review.networkcanvas.com` (`pnpm check:deployment`), and tags the
   commit `@codaco/protocol-review-worker@<version>`.

If the deploy job fails, fix the cause and re-run the failed job. Later
pushes to `main` do not retry it: only the push that moved the version
deploys. A version is tagged only after the service has answered, so a deploy
that never came up can always be re-run.

A pull request never deploys, but it does bundle the Worker the way a deploy
would (`pnpm bundle`, in the `quality-support` job), so a change that cannot
be bundled fails before it merges.

To take a bad release off production at once, roll back by hand
(`pnpm wrangler rollback`, signed in to Cloudflare) and then release the fix.

### Setting up the lane (once)

The deploy job reads three secrets from a GitHub environment named
`protocol-review-worker`. Create it under Settings → Environments, and limit
its deployment branches to `main`, so that no other branch can run a job that
reads them.

| Secret                  | What it is                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token made from the **Edit Cloudflare Workers** template, limited to the account and to the `networkcanvas.com` zone.                         |
| `CLOUDFLARE_ACCOUNT_ID` | The id of the Cloudflare account that holds the `networkcanvas.com` zone.                                                                                      |
| `ANTHROPIC_API_KEY`     | An Anthropic API key from a workspace whose monthly spend limit is US $200, the same as `MONTHLY_SPEND_CEILING_USD` (see "Limits"). Give the key no other use. |

```bash
gh secret set CLOUDFLARE_API_TOKEN --env protocol-review-worker
gh secret set CLOUDFLARE_ACCOUNT_ID --env protocol-review-worker
gh secret set ANTHROPIC_API_KEY --env protocol-review-worker
```

Each command asks for the value, so it is never in your shell history. With
any of the three missing, the deploy job stops before it reaches Cloudflare
and says which.

The first deploy creates everything the Worker needs: the `ReviewLimiter`
Durable Object (with its SQLite migration), the `SHARED_REVIEWS` KV namespace
(named `protocol-review-worker-shared-reviews`; the binding in
`wrangler.jsonc` has no id, and later deploys find the namespace on the
deployed Worker), and the custom domain `protocol-review.networkcanvas.com`
with its DNS record and certificate. The zone must not already have a DNS
record at that name. The domain takes a few minutes to answer the first time,
which the job waits for.

### Changing the Anthropic API key

The key is uploaded with every deploy, from the environment secret. To change
it, set the secret again (`gh secret set ANTHROPIC_API_KEY --env
protocol-review-worker`); the next release carries the new key. For the new
key to take effect before then, also give it to the deployed Worker by hand:
`pnpm wrangler secret put ANTHROPIC_API_KEY`.

### Checking a deployment

```bash
pnpm check:deployment
```

sends preflight requests to the deployed service and checks that it answers
both Architect origins and refuses any other. Preflight requests need no key,
count against no limit and spend nothing.

Logs are in the Cloudflare dashboard (Workers → protocol-review-worker →
Observability). Failures appear as `protocol_review_failure reason=… status=…`.

## Local development

Create `.dev.vars` (ignored by git) from the example:

```bash
cp .dev.vars.example .dev.vars
# ANTHROPIC_API_KEY=sk-ant-...
# DEV_ALLOWED_ORIGIN=http://localhost:5173
```

`DEV_ALLOWED_ORIGIN` is the one extra origin the Worker answers, so a local
Architect can call it. It is for local development only: never set it in
production.

```bash
pnpm dev          # wrangler dev, with a local Durable Object and KV
pnpm test         # the unit tests (no API calls, no Workers runtime)
pnpm typecheck
pnpm bundle       # what `wrangler deploy` would upload, without deploying
pnpm cf-typegen   # after changing wrangler.jsonc
```

A local review calls the real API with your key and spends real money.

## Changing the spending ceilings

Change `MONTHLY_SPEND_CEILING_USD` or `DAILY_SPEND_CEILING_USD` in
`src/constants.ts` and release (see "Releasing"). They are in US dollars per
UTC calendar month and per UTC day, and apply from the next review. Keep the
monthly ceiling at or below the monthly limit set on the Anthropic API key:
above it, the provider refuses first and researchers see "unavailable" with
no time to come back. The cost of each review is computed from the token
counts the API reports and the price table
`MODEL_PRICES_USD_PER_MILLION_TOKENS` beside it; if the model or its prices
change, update both together.

## Code

| File                                 | What it does                                                        |
| ------------------------------------ | ------------------------------------------------------------------- |
| `src/index.ts`                       | Wires everything to Cloudflare; the `ReviewLimiter` Durable Object. |
| `src/review.ts`                      | The request: origin, size, schema, limits, model, stream, sharing.  |
| `src/limiter.ts`                     | Hourly windows and the two budgets, as pure functions.              |
| `src/sql-store.ts`                   | The limiter's state in the Durable Object's SQLite storage.         |
| `src/anthropic-model.ts`             | The streamed call to Claude, and how its errors are classified.     |
| `src/findings.ts`                    | The answer's JSON schema, and checking, ordering and numbering.     |
| `src/prompt/rubric.ts`               | The reviewer's brief and the review rubric.                         |
| `src/prompt/protocol-reference.ts`   | The schema 9 shapes and fix syntax the model writes fixes in.       |
| `src/pricing.ts`, `src/constants.ts` | Prices, limits and the ceiling.                                     |
| `src/contract.ts`                    | The wire contract shared with Architect.                            |
| `src/deployment-check.ts`            | Whether the deployed service answers Architect and nobody else.     |
