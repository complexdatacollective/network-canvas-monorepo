import { z } from 'zod';

import { StudyContextSchema } from '@codaco/shared-consts';

/**
 * The wire contract between Architect and the protocol review service.
 *
 * Architect sends a protocol and the researcher's study details; the service
 * asks a language model to review them and streams back a list of problems,
 * each with a fix written as edits to the protocol. This module is the one
 * definition of that exchange: the Worker validates and produces these shapes,
 * and Architect imports them from `@codaco/protocol-review-worker/contract`.
 *
 * Kept free of Worker-only and browser-only APIs so both sides can load it.
 */

/** Where the deployed service answers. */
export const PROTOCOL_REVIEW_SERVICE_URL =
  'https://protocol-review.networkcanvas.com';

/** The one route: `POST` a `ReviewRequest`, receive a stream of `ReviewEvent`s. */
export const REVIEW_PATH = '/review';

/**
 * The only origins the service answers. A browser cannot forge `Origin`, so
 * this stops any other website from spending the service's budget; it does
 * not stop a script that sets the header itself, which the limits below and
 * the daily spending ceiling are for.
 */
export const ALLOWED_ORIGINS = [
  'https://architect.networkcanvas.com',
  'https://architect.networkcanvas.dev',
] as const;

/**
 * Limits, fixed here rather than configured, so that the service and the app
 * that explains them to the researcher cannot disagree.
 */
export const REVIEW_LIMITS = {
  /** Reviews one installation of Architect may start in an hour. */
  perInstallationPerHour: 5,
  /** Reviews one network address may start in an hour. */
  perAddressPerHour: 30,
  /** The largest request body the service reads, in bytes. */
  maxRequestBytes: 750_000,
  /**
   * How long a review a researcher chose to share is kept, in days. Nothing
   * is kept from a review that was not shared.
   */
  sharedReviewRetentionDays: 90,
} as const;

export const ReviewRequestSchema = z.strictObject({
  /**
   * A random id Architect mints once per browser and keeps in local storage.
   * It identifies nobody; it exists so the hourly limit can be counted.
   */
  installationId: z.uuid(),
  /** The language the researcher reads Architect in; findings are written in it. */
  locale: z.string().min(2).max(35),
  /** Whether the researcher chose to share this review with the Network Canvas team. */
  share: z.boolean(),
  studyContext: StudyContextSchema,
  /**
   * The protocol as Architect holds it (schema 9 JSON). The service checks
   * only that it is an object within the size limit: deciding whether a
   * protocol is valid is Architect's job, and it sends only valid ones.
   */
  protocol: z.record(z.string(), z.unknown()),
});

export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

/** How much a problem matters, most serious first. */
export const FINDING_SEVERITIES = [
  'serious',
  'worth_fixing',
  'suggestion',
] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** What part of the design a problem is about. */
export const FINDING_CATEGORIES = [
  'research_fit',
  'structure',
  'entities',
  'attributes_and_forms',
  'skip_logic',
  'wording',
  'burden',
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

/**
 * One edit to the protocol. A fix is a list of these, applied in order.
 *
 * `path` is a JSON Pointer (RFC 6901: segments joined by `/`, with `~1` for a
 * `/` and `~0` for a `~` inside a segment) from the protocol's root, with one
 * extension: **a segment that addresses a member of an array is that member's
 * `id`**, not its index, whenever the members have ids (stages, prompts, form
 * fields, panels, filter rules and so on). An index is used only for arrays
 * whose members have no id.
 *
 *     /stages/3f1c…/prompts/9a2e…/text/en
 *     /codebook/node/b7d0…/variables/41cc…/options
 *
 * - `set` writes `value` at `path`, replacing what is there or adding the key.
 * - `remove` deletes the key or array member at `path`; `value` is null.
 * - `insert` adds `value` to an array as a new member. The last segment says
 *   where: `-` appends, and an existing member's id (or index) inserts before
 *   that member.
 *
 * `value` is the new content as JSON text (`"\"A sentence.\""`, `"{…}"`,
 * `"12"`), because the content of a protocol has no single type.
 */
export const FIX_OPERATION_KINDS = ['set', 'remove', 'insert'] as const;

export const FixOperationSchema = z.strictObject({
  op: z.enum(FIX_OPERATION_KINDS),
  path: z.string().startsWith('/'),
  value: z.string().nullable(),
});

export type FixOperation = z.infer<typeof FixOperationSchema>;

export const FindingFixSchema = z.strictObject({
  /** What the fix does and why it helps, as one or two plain sentences. */
  summary: z.string(),
  /**
   * Each change the fix makes, in words a researcher reads before agreeing to
   * it ("Stage 10 · Who knows whom: add a filter so it shows only…").
   */
  changes: z.array(z.string()),
  /**
   * The same changes as edits. Written by a language model, so Architect
   * checks them before offering to make them: a fix whose edits do not apply,
   * or that leave the protocol invalid, is shown without "Fix for me".
   */
  operations: z.array(FixOperationSchema),
});

export type FindingFix = z.infer<typeof FindingFixSchema>;

export const FindingSchema = z.strictObject({
  /** Unique within its review. */
  id: z.string().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  category: z.enum(FINDING_CATEGORIES),
  /** The problem as one sentence. */
  title: z.string().min(1),
  /** Why it matters for this study, as plain text. */
  explanation: z.string().min(1),
  /**
   * Where the problem is. A stage's id when it is about one stage; a codebook
   * entity (and its type id, for a node or edge type) when it is about the
   * data model; all null when it is about the protocol as a whole.
   */
  stageId: z.string().nullable(),
  codebookEntity: z.enum(['node', 'edge', 'ego']).nullable(),
  codebookTypeId: z.string().nullable(),
  fix: FindingFixSchema,
});

export type Finding = z.infer<typeof FindingSchema>;

/** Where an installation stands against its hourly limit. */
export const ReviewQuotaSchema = z.strictObject({
  limit: z.number().int(),
  remaining: z.number().int(),
  /** When the count starts again (ISO 8601). */
  resetsAt: z.iso.datetime(),
});

export type ReviewQuota = z.infer<typeof ReviewQuotaSchema>;

export const ReviewResultSchema = z.strictObject({
  reviewId: z.uuid(),
  /** Most serious first. */
  findings: z.array(FindingSchema),
  quota: ReviewQuotaSchema,
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/**
 * Why a review did not run, as a fixed code Architect turns into words.
 *
 * | code                  | status | meaning                                                        |
 * | --------------------- | ------ | -------------------------------------------------------------- |
 * | `forbidden_origin`    | 403    | The request did not come from Architect.                       |
 * | `invalid_request`     | 400    | The body is not a `ReviewRequest`.                             |
 * | `too_large`           | 413    | The body is over `REVIEW_LIMITS.maxRequestBytes`.              |
 * | `hourly_limit`        | 429    | This installation or address has used its reviews; `retryAt`.  |
 * | `daily_limit`         | 503    | The service has spent its budget for today; `retryAt`.         |
 * | `service_unavailable` | 503    | The model provider failed, refused or is out of credit.        |
 *
 * A refused or failed review never counts against the hourly limit.
 */
export const REVIEW_ERROR_CODES = [
  'forbidden_origin',
  'invalid_request',
  'too_large',
  'hourly_limit',
  'daily_limit',
  'service_unavailable',
] as const;

export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];

/** The JSON body of every response that is not a stream. */
export const ReviewErrorSchema = z.strictObject({
  error: z.enum(REVIEW_ERROR_CODES),
  /** When trying again can succeed (ISO 8601); null when nobody can say. */
  retryAt: z.iso.datetime().nullable(),
});

export type ReviewError = z.infer<typeof ReviewErrorSchema>;

/**
 * An accepted review answers `200` with `Content-Type: text/event-stream`.
 * Each server-sent event is one `data:` line holding one of these as JSON.
 *
 * - `progress` arrives repeatedly while the model writes; `received` is how
 *   many characters of its answer have arrived so far, which only grows.
 * - `result` arrives once, last, when the review succeeded.
 * - `error` arrives once, last, when it failed after the stream had begun.
 */
export const ReviewEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('progress'),
    received: z.number().int().nonnegative(),
  }),
  z.strictObject({ type: z.literal('result'), result: ReviewResultSchema }),
  z.strictObject({ type: z.literal('error'), error: ReviewErrorSchema }),
]);

export type ReviewEvent = z.infer<typeof ReviewEventSchema>;
