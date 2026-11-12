import { describe, expect, it } from 'vitest';

import { MAX_OUTPUT_TOKENS } from '../constants.ts';
import { REVIEW_OUTPUT_SCHEMA } from '../findings.ts';
import { ModelCallError, type ModelRunOutput } from '../model.ts';
import { createOpenAIModel } from '../openai-model.ts';

/**
 * The OpenAI call, against a stand-in for the Responses API: what it sends,
 * how it reads the stream, and what a failure is recorded as having cost.
 */

type Json = Record<string, unknown>;

const USAGE = {
  input_tokens: 12_000,
  input_tokens_details: { cached_tokens: 9_000, cache_write_tokens: 500 },
  output_tokens: 3_000,
  output_tokens_details: { reasoning_tokens: 2_000 },
  total_tokens: 15_000,
};

const message = (text: string) => ({
  type: 'message',
  id: 'msg_1',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }],
});

const refusal = (text: string) => ({
  type: 'message',
  id: 'msg_1',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'refusal', refusal: text }],
});

const response = (overrides: Json = {}): Json => ({
  id: 'resp_1',
  object: 'response',
  status: 'completed',
  error: null,
  incomplete_details: null,
  output: [message('{"findings":[]}')],
  usage: USAGE,
  ...overrides,
});

const created = {
  type: 'response.created',
  response: response({ status: 'in_progress', output: [], usage: undefined }),
};
const delta = (text: string) => ({
  type: 'response.output_text.delta',
  delta: text,
});
const completed = (overrides: Json = {}) => ({
  type: 'response.completed',
  response: response(overrides),
});

/** A provider that answers with these server-sent events. */
const streaming = (events: Json[]) => {
  const requests: { url: string; headers: Headers; body: Json }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      headers: request.headers,
      body: (await request.json()) as Json,
    });
    const body = events
      .map(
        (event) =>
          `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join('');
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  return { requests, fetcher };
};

/** A provider that answers every request with one HTTP error. */
const rejecting = (status: number, code: string) => {
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts += 1;
    return new Response(
      JSON.stringify({ error: { message: 'No.', type: 'x', code } }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  };
  return { fetcher, attempts: () => attempts };
};

const call = async (fetcher: typeof fetch) => {
  const seen = { started: 0, text: '' };
  const model = createOpenAIModel('test-key', { fetch: fetcher });
  const run = model({
    system: 'The instructions.',
    user: 'The protocol.',
    signal: new AbortController().signal,
    onStart: () => {
      seen.started += 1;
    },
    onText: (chunk) => {
      seen.text += chunk;
    },
  });
  let output: ModelRunOutput | null = null;
  let error: unknown = null;
  try {
    output = await run;
  } catch (thrown) {
    error = thrown;
  }
  return { seen, output, error };
};

const failureOf = (error: unknown) => {
  if (!(error instanceof ModelCallError)) {
    throw new Error(`Expected a ModelCallError, got ${String(error)}`);
  }
  return { reason: error.reason, status: error.status, billing: error.billing };
};

describe('what the OpenAI call sends', () => {
  it('asks for one stored-nowhere, streamed, schema-bound answer', async () => {
    const { requests, fetcher } = streaming([created, completed()]);
    await call(fetcher);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe('https://api.openai.com/v1/responses');
    expect(request?.headers.get('Authorization')).toBe('Bearer test-key');
    expect(request?.body).toEqual({
      model: 'gpt-6.1-sol',
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'high' },
      store: false,
      stream: true,
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: 'The instructions.',
              prompt_cache_breakpoint: { mode: 'explicit' },
            },
          ],
        },
        // The protocol is never written to the cache.
        { role: 'user', content: 'The protocol.' },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'protocol_review',
          strict: true,
          schema: REVIEW_OUTPUT_SCHEMA,
        },
      },
    });
  });
});

describe('how the OpenAI call reads the answer', () => {
  it('reports the start, each piece of text, and the usage split three ways', async () => {
    const { fetcher } = streaming([
      created,
      delta('{"findings"'),
      delta(':[]}'),
      completed(),
    ]);
    const { seen, output } = await call(fetcher);

    expect(seen).toEqual({ started: 1, text: '{"findings":[]}' });
    expect(output).toEqual({
      text: '{"findings":[]}',
      stopReason: 'end_turn',
      // 12,000 input holds 9,000 read from the cache and 500 written to it;
      // the 2,000 reasoning tokens are inside the 3,000 output.
      usage: {
        inputTokens: 2_500,
        cacheCreationInputTokens: 500,
        cacheReadInputTokens: 9_000,
        outputTokens: 3_000,
      },
    });
  });

  it.each([
    [
      'an answer cut off at the output cap',
      {
        type: 'response.incomplete',
        response: response({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        }),
      },
      'max_tokens',
    ],
    [
      'an answer stopped by the content filter',
      {
        type: 'response.incomplete',
        response: response({
          status: 'incomplete',
          incomplete_details: { reason: 'content_filter' },
        }),
      },
      'refusal',
    ],
    [
      'a refusal',
      completed({ output: [refusal('I cannot help with that.')] }),
      'refusal',
    ],
  ])('says %s in the service’s own words', async (_, last, stopReason) => {
    const { output } = await call(streaming([created, last]).fetcher);
    expect(output?.stopReason).toBe(stopReason);
    // Whatever stopped it, what it cost is still counted.
    expect(output?.usage.outputTokens).toBe(3_000);
  });
});

describe('what a failed OpenAI call may have cost', () => {
  it.each([
    [401, 'invalid_api_key', 'authentication'],
    [429, 'rate_limit_exceeded', 'rate_limited'],
    // Out of credit is a 429 too; only its code says so.
    [429, 'insufficient_quota', 'billing'],
    [500, 'server_error', 'provider_error'],
  ] as const)(
    'nothing when the provider refuses outright (%i %s), in one attempt',
    async (status, code, reason) => {
      const { fetcher, attempts } = rejecting(status, code);
      const { seen, error } = await call(fetcher);

      expect(failureOf(error)).toEqual({
        reason,
        status,
        billing: { kind: 'rejected' },
      });
      expect(seen.started).toBe(0);
      expect(attempts()).toBe(1);
    },
  );

  it('what it reported when the response failed after it began', async () => {
    const { fetcher } = streaming([
      created,
      {
        type: 'response.failed',
        response: response({
          status: 'failed',
          error: { code: 'server_error', message: 'x' },
        }),
      },
    ]);
    expect(failureOf((await call(fetcher)).error)).toEqual({
      reason: 'provider_error',
      status: 200,
      billing: {
        kind: 'reported',
        usage: {
          inputTokens: 2_500,
          cacheCreationInputTokens: 500,
          cacheReadInputTokens: 9_000,
          outputTokens: 3_000,
        },
      },
    });
  });

  it.each([
    [
      'the response fails without saying what it used',
      [
        created,
        {
          type: 'response.failed',
          response: response({ status: 'failed', usage: undefined }),
        },
      ],
    ],
    [
      'the stream carries an error',
      [
        created,
        { type: 'error', code: 'server_error', message: 'x', param: null },
      ],
    ],
    ['the stream ends without a finished response', [created, delta('{')]],
    [
      'the finished response reports no usage',
      [created, completed({ usage: undefined })],
    ],
  ])('the whole reservation when %s', async (_, events) => {
    const failure = failureOf((await call(streaming(events).fetcher)).error);
    expect(failure.billing).toEqual({ kind: 'unknown' });
    expect(failure.reason).toBe('provider_error');
  });

  it('the whole reservation when the connection is lost before an answer', async () => {
    const { error } = await call(async () => {
      throw new TypeError('The network connection was lost.');
    });
    expect(failureOf(error)).toEqual({
      reason: 'connection',
      status: 0,
      billing: { kind: 'unknown' },
    });
  });
});
