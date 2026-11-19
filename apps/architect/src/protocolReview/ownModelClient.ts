import type { Finding } from '@codaco/protocol-review-worker/contract';
import type { ReviewMaterial } from '@codaco/protocol-review-worker/prompt';

import {
  chatCompletionsUrl,
  type OwnModelErrorCode,
  type OwnModelSettings,
} from './ownModel';
import { createEventStreamParser } from './reviewClient';

/**
 * Asks the researcher's own model for a review, from the browser, through
 * the OpenAI-compatible chat API that Ollama, LM Studio, vLLM and most hosted
 * providers answer. The prompt and the reading of the answer are the review
 * service's own, so a review is asked for and checked by the same rules
 * whoever writes it.
 *
 * Nothing here goes to the Network Canvas service: the one request is to the
 * endpoint the researcher named.
 */

/**
 * How long one review may take before it is abandoned, in milliseconds. A
 * model on the researcher's own hardware can take far longer than a hosted
 * one, so this is generous; the review can always be stopped by hand.
 */
const OWN_MODEL_TIMEOUT_MS = 30 * 60 * 1000;

/** How long a connection test may take, in milliseconds. */
const OWN_MODEL_TEST_TIMEOUT_MS = 60 * 1000;

export type OwnModelOutcome =
  | { kind: 'result'; findings: Finding[] }
  | { kind: 'error'; code: OwnModelErrorCode }
  | { kind: 'aborted' };

const failed = (code: OwnModelErrorCode): OwnModelOutcome => ({
  kind: 'error',
  code,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const CONTEXT_OVERFLOW =
  /context[ _-]?(?:length|window|size)|maximum context|too many tokens|prompt is too long|exceeds? the (?:available|maximum)/iu;
const UNKNOWN_MODEL =
  /model.{0,80}(?:not found|does not exist|not exist|unknown)/iu;

/** What an error body says, in the shapes endpoints use: its code and message. */
const errorDetail = (body: unknown): { code: string; message: string } => {
  const error = isRecord(body) ? body.error : undefined;
  if (typeof error === 'string') return { code: '', message: error };
  if (!isRecord(error)) return { code: '', message: '' };
  return {
    code: typeof error.code === 'string' ? error.code : '',
    message: typeof error.message === 'string' ? error.message : '',
  };
};

/** The fixed reason an HTTP error from the endpoint stands for. */
const classifyStatus = (status: number, body: unknown): OwnModelErrorCode => {
  const { code, message } = errorDetail(body);
  if (
    status === 413 ||
    code === 'context_length_exceeded' ||
    CONTEXT_OVERFLOW.test(message)
  ) {
    return 'too_long';
  }
  if (status === 401 || status === 403) return 'refused';
  if (
    status === 404 ||
    code === 'model_not_found' ||
    UNKNOWN_MODEL.test(message)
  ) {
    return 'not_found';
  }
  return 'endpoint_error';
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
};

const headersFor = (settings: OwnModelSettings): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(settings.apiKey === ''
    ? {}
    : { Authorization: `Bearer ${settings.apiKey}` }),
});

/**
 * A signal that aborts when `outer` does or when `timeoutMs` passes, and
 * which of the two it was.
 */
const withTimeout = (outer: AbortSignal, timeoutMs: number) => {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (outer.aborted) abort();
  outer.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    release: () => {
      clearTimeout(timer);
      outer.removeEventListener('abort', abort);
    },
  };
};

const post = (
  fetchImpl: typeof fetch,
  url: string,
  settings: OwnModelSettings,
  body: unknown,
  signal: AbortSignal,
) =>
  fetchImpl(url, {
    method: 'POST',
    headers: headersFor(settings),
    body: JSON.stringify(body),
    signal,
    // The request carries nothing of this site's: no cookies, no referrer.
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });

/**
 * The JSON object in a model's answer. A model that is not held to a schema
 * may show its reasoning first (`<think>…</think>`), wrap the answer in a
 * code fence, or add a sentence around it; the object is what is between the
 * first `{` and the last `}` of what remains.
 */
export const extractAnswerJson = (answer: string): string => {
  const text = answer.replaceAll(/<think>[\s\S]*?<\/think>/giu, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start === -1 || end <= start ? text : text.slice(start, end + 1);
};

/** How the answer may be asked for, most exact first. */
const ANSWER_FORMATS = ['json_schema', 'json_object', 'none'] as const;

type RequestOwnModelReviewOptions = {
  settings: OwnModelSettings;
  request: ReviewMaterial;
  signal: AbortSignal;
  /**
   * Characters received so far of the model's answer (`received`) and of its
   * reasoning, when the endpoint reports it (`thinking`); both only grow.
   */
  onProgress?: (progress: { received: number; thinking: number }) => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Requests a review from the researcher's own model and waits for its
 * outcome. Never throws: an abort through `signal` is `aborted`, and every
 * other failure is an `OwnModelErrorCode`.
 */
export const requestOwnModelReview = async ({
  settings,
  request,
  signal,
  onProgress,
  fetchImpl = fetch,
  timeoutMs = OWN_MODEL_TIMEOUT_MS,
}: RequestOwnModelReviewOptions): Promise<OwnModelOutcome> => {
  const url = chatCompletionsUrl(settings.address);
  if (url === null) return failed('unreachable');

  // Loaded on demand: the instructions are long, and only a researcher who
  // reviews with their own model needs them in the browser.
  const [{ REVIEW_SYSTEM_PROMPT, buildReviewMessage }, findingsModule] =
    await Promise.all([
      import('@codaco/protocol-review-worker/prompt'),
      import('@codaco/protocol-review-worker/findings'),
    ]);
  const { REVIEW_OUTPUT_SCHEMA, normaliseFindings } = findingsModule;
  if (signal.aborted) return { kind: 'aborted' };

  // The service's providers are held to the schema by the provider. An
  // endpoint may not support that, or may ignore it, so the shape is also
  // written out for the model to read.
  const user = `${buildReviewMessage(request)}

Answer with one JSON object and nothing else: no text before or after it, and no code fence. It must match this JSON Schema:
${JSON.stringify(REVIEW_OUTPUT_SCHEMA)}`;

  const bodyFor = (format: (typeof ANSWER_FORMATS)[number]) => ({
    model: settings.model,
    stream: true,
    messages: [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    ...(format === 'json_schema'
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'protocol_review',
              strict: true,
              schema: REVIEW_OUTPUT_SCHEMA,
            },
          },
        }
      : format === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
  });

  const timeout = withTimeout(signal, timeoutMs);
  const stopped = (): OwnModelOutcome =>
    signal.aborted ? { kind: 'aborted' } : failed('endpoint_error');

  try {
    let response: Response | null = null;
    for (const format of ANSWER_FORMATS) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- each way of asking is tried only after the one before was refused
        response = await post(
          fetchImpl,
          url,
          settings,
          bodyFor(format),
          timeout.signal,
        );
      } catch {
        if (signal.aborted || timeout.timedOut()) return stopped();
        return failed('unreachable');
      }
      if (response.ok) break;
      // oxlint-disable-next-line no-await-in-loop -- as above
      const code = classifyStatus(response.status, await readJson(response));
      // A request refused as invalid may be refused for the answer format,
      // which not every endpoint supports: it is asked again more plainly.
      const refusedAsInvalid =
        code === 'endpoint_error' &&
        (response.status === 400 || response.status === 422);
      if (!refusedAsInvalid || format === 'none') return failed(code);
    }
    if (response === null || !response.ok) return failed('endpoint_error');

    let text = '';
    let thinking = 0;
    let streamError = false;

    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      // An endpoint that does not stream answers all at once.
      const body = await readJson(response);
      const choice =
        isRecord(body) && Array.isArray(body.choices)
          ? (body.choices[0] as unknown)
          : undefined;
      const message = isRecord(choice) ? choice.message : undefined;
      if (isRecord(message) && typeof message.content === 'string') {
        text = message.content;
      }
    } else if (response.body) {
      const handle = (data: string) => {
        if (data === '[DONE]') return;
        let chunk: unknown;
        try {
          chunk = JSON.parse(data) as unknown;
        } catch {
          return;
        }
        if (!isRecord(chunk)) return;
        if (chunk.error !== undefined && chunk.error !== null) {
          streamError = true;
          return;
        }
        const choice = Array.isArray(chunk.choices)
          ? (chunk.choices[0] as unknown)
          : undefined;
        const delta = isRecord(choice) ? choice.delta : undefined;
        if (!isRecord(delta)) return;
        // Endpoints name a reasoning model's thinking in one of two ways.
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoning === 'string') thinking += reasoning.length;
        if (typeof delta.content === 'string') text += delta.content;
        onProgress?.({ received: text.length, thinking });
      };
      const parser = createEventStreamParser(handle);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
          if (streamError) break;
        }
        parser.push(decoder.decode());
        parser.end();
      } catch {
        return stopped();
      } finally {
        reader.cancel().catch(() => undefined);
      }
    }

    if (signal.aborted) return { kind: 'aborted' };
    if (streamError) return failed('endpoint_error');
    const normalised = normaliseFindings(extractAnswerJson(text));
    return normalised.ok
      ? { kind: 'result', findings: normalised.findings }
      : failed('unreadable_answer');
  } finally {
    timeout.release();
  }
};

export type OwnModelTestResult =
  | { ok: true }
  | { ok: false; code: OwnModelErrorCode }
  | { ok: false; code: 'aborted' };

type TestOwnModelOptions = {
  settings: OwnModelSettings;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Checks that the endpoint can be reached from this browser, accepts the key
 * and knows the model, by asking the model for one word through the same
 * address and headers a review uses. Never throws.
 */
export const testOwnModel = async ({
  settings,
  signal,
  fetchImpl = fetch,
  timeoutMs = OWN_MODEL_TEST_TIMEOUT_MS,
}: TestOwnModelOptions): Promise<OwnModelTestResult> => {
  const url = chatCompletionsUrl(settings.address);
  if (url === null) return { ok: false, code: 'unreachable' };
  const timeout = withTimeout(signal, timeoutMs);
  try {
    let response: Response;
    try {
      response = await post(
        fetchImpl,
        url,
        settings,
        {
          model: settings.model,
          stream: false,
          messages: [{ role: 'user', content: 'Reply with the word OK.' }],
        },
        timeout.signal,
      );
    } catch {
      if (signal.aborted) return { ok: false, code: 'aborted' };
      return {
        ok: false,
        code: timeout.timedOut() ? 'endpoint_error' : 'unreachable',
      };
    }
    const body = await readJson(response);
    if (signal.aborted) return { ok: false, code: 'aborted' };
    if (!response.ok) {
      return { ok: false, code: classifyStatus(response.status, body) };
    }
    // Anything that answers 200 without a chat answer is not a chat API.
    return isRecord(body) && Array.isArray(body.choices)
      ? { ok: true }
      : { ok: false, code: 'not_found' };
  } finally {
    timeout.release();
  }
};
