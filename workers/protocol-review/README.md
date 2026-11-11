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
3. The hourly limits and the daily spending ceiling are checked, and the most
   the review could cost is reserved from the day's budget.
4. Claude (`claude-opus-5-5`) reviews the protocol, guided by the rubric in
   `src/prompt/rubric.ts` and the protocol reference in
   `src/prompt/protocol-reference.ts`. While it writes, the service sends
   `progress` events; when it is done, one `result` event.
5. The reservation is settled to what the review really cost, as reported by
   the API.

If the model provider fails (a bad key, no credit, overload, an outage, a
refusal, an answer that does not parse, a timeout), the researcher gets
`service_unavailable` and the review does not count against their hourly
limit. The service logs a fixed reason code and the HTTP status, and sends the
team one PostHog event, `protocol_review_service_failure`, holding only that
code and status.

## Limits

| Limit                         | Value                            | Where it is set                                        |
| ----------------------------- | -------------------------------- | ------------------------------------------------------ |
| Reviews per installation      | 5 an hour                        | `REVIEW_LIMITS.perInstallationPerHour`, contract.ts    |
| Reviews per network address   | 30 an hour                       | `REVIEW_LIMITS.perAddressPerHour`, contract.ts         |
| Largest request               | 750,000 bytes                    | `REVIEW_LIMITS.maxRequestBytes`, contract.ts           |
| Shared reviews kept for       | 90 days                          | `REVIEW_LIMITS.sharedReviewRetentionDays`, contract.ts |
| Spending on the model per day | US $25 (UTC day)                 | `DAILY_SPEND_CEILING_USD`, constants.ts                |
| Answer length                 | 40,000 tokens, thinking included | `MAX_OUTPUT_TOKENS`, constants.ts                      |
| Findings per review           | 12                               | `MAX_FINDINGS`, constants.ts                           |
| Time per review               | 8 minutes                        | `MODEL_TIMEOUT_MS`, constants.ts                       |

An hourly window starts at the first review counted against an installation
or address and lasts one hour. A review that fails or is refused gives its
count back; a review the researcher cancels still counts. Every limit and
price is a constant in source, never read from the environment, so the app
that explains the limits and the service that enforces them cannot disagree.

The limits are kept in one SQLite-backed Durable Object (`ReviewLimiter`),
so the counts are exact even when reviews arrive together. Before calling the
model, a review reserves its worst case from the day's budget (its prompt at
two characters a token at the cache-write price, plus the whole answer cap);
afterwards the reservation is replaced by the real cost. Concurrent reviews
therefore cannot together overshoot the ceiling. When the day's remaining
budget cannot cover a reservation, the review is refused with
`503 daily_limit` until the next midnight UTC.

## What is stored, and what is not

- **The limiter** holds counters only: for each hourly window, a SHA-256 hash
  of the installation id or of the network address, when the window started
  and ended, and how many reviews it counted; and, for each UTC day, the
  amount spent. Raw addresses and ids are never stored. Windows that have
  ended and days before yesterday are deleted as new reviews arrive.
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

## First deployment

You need a Cloudflare account with access to the `networkcanvas.com` zone, and
an Anthropic API key for the project's organisation.

```bash
cd workers/protocol-review

# 1. Sign in to Cloudflare.
pnpm wrangler login

# 2. Store the Anthropic API key as a secret (it is never in the repository).
pnpm wrangler secret put ANTHROPIC_API_KEY

# 3. Deploy. The first deploy creates the Durable Object (with its SQLite
#    migration), creates the SHARED_REVIEWS KV namespace (the binding in
#    wrangler.jsonc has no id, so Wrangler provisions one), and attaches the
#    custom domain protocol-review.networkcanvas.com.
pnpm run deploy
```

If your Wrangler version does not provision the KV namespace by itself (the
deploy fails asking for a namespace id), create it and add its id to the
binding in `wrangler.jsonc`:

```bash
pnpm wrangler kv namespace create SHARED_REVIEWS
# then: "kv_namespaces": [{ "binding": "SHARED_REVIEWS", "id": "<the id printed>" }]
```

Check the deployment with a preflight request, which needs no key and spends
nothing:

```bash
curl -i -X OPTIONS https://protocol-review.networkcanvas.com/review \
  -H 'Origin: https://architect.networkcanvas.com'
# Expect 204 with Access-Control-Allow-Origin: https://architect.networkcanvas.com
```

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
pnpm cf-typegen   # after changing wrangler.jsonc
```

A local review calls the real API with your key and spends real money.

## Changing the daily ceiling

Change `DAILY_SPEND_CEILING_USD` in `src/constants.ts` and deploy. The
ceiling is in US dollars per UTC day and applies from the next review. The
cost of each review is computed from the token counts the API reports and the
price table `MODEL_PRICES_USD_PER_MILLION_TOKENS` beside it; if the model or
its prices change, update both together.

## Code

| File                                 | What it does                                                        |
| ------------------------------------ | ------------------------------------------------------------------- |
| `src/index.ts`                       | Wires everything to Cloudflare; the `ReviewLimiter` Durable Object. |
| `src/review.ts`                      | The request: origin, size, schema, limits, model, stream, sharing.  |
| `src/limiter.ts`                     | Hourly windows and the daily budget, as pure functions.             |
| `src/sql-store.ts`                   | The limiter's state in the Durable Object's SQLite storage.         |
| `src/anthropic-model.ts`             | The streamed call to Claude, and how its errors are classified.     |
| `src/findings.ts`                    | The answer's JSON schema, and checking, ordering and numbering.     |
| `src/prompt/rubric.ts`               | The reviewer's brief and the review rubric.                         |
| `src/prompt/protocol-reference.ts`   | The schema 9 shapes and fix syntax the model writes fixes in.       |
| `src/pricing.ts`, `src/constants.ts` | Prices, limits and the ceiling.                                     |
| `src/contract.ts`                    | The wire contract shared with Architect.                            |
