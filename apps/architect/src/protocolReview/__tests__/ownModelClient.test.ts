import { describe, expect, it, vi } from 'vitest';

import { REVIEW_OUTPUT_SCHEMA } from '@codaco/protocol-review-worker/findings';
import { REVIEW_SYSTEM_PROMPT } from '@codaco/protocol-review-worker/prompt';

import type { OwnModelSettings } from '../ownModel';
import {
  extractAnswerJson,
  requestOwnModelReview,
  testOwnModel,
} from '../ownModelClient';
import { makeFinding, op, STUDY_CONTEXT } from './fixtures';

const SETTINGS: OwnModelSettings = {
  address: 'http://localhost:11434/v1',
  model: 'llama',
  apiKey: '',
};

const MATERIAL = {
  locale: 'en',
  studyContext: STUDY_CONTEXT,
  protocol: { schemaVersion: 9, stages: [] },
};

/** A finding as a model writes it: without the id the reader gives it. */
const written = (title: string, severity: 'serious' | 'suggestion') => {
  const { id: _id, ...finding } = makeFinding(
    'x',
    [op('set', '/stages/a/label', 'A')],
    { title, severity },
  );
  return finding;
};

const ANSWER = JSON.stringify({
  findings: [written('Second', 'suggestion'), written('First', 'serious')],
});

/** An OpenAI-style stream that writes `pieces` one chunk each, then ends. */
const chatStream = (
  pieces: readonly { content?: string; reasoning_content?: string }[],
  contentType = 'text/event-stream',
) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const delta of pieces) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`,
          ),
        );
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
};

const errorResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Sent = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  init: RequestInit;
};

/** A stand-in endpoint that answers each request in turn, and keeps what it was sent. */
const endpoint = (...answers: (Response | Error)[]) => {
  const sent: Sent[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    sent.push({
      url:
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(
        typeof init?.body === 'string' ? init.body : 'null',
      ) as Record<string, unknown>,
      init: init ?? {},
    });
    const answer = answers[sent.length - 1];
    if (answer === undefined) throw new Error('Asked more often than expected');
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { fetchImpl, sent };
};

const review = (
  fetchImpl: typeof fetch,
  options: Partial<Parameters<typeof requestOwnModelReview>[0]> = {},
) =>
  requestOwnModelReview({
    settings: SETTINGS,
    request: MATERIAL,
    signal: new AbortController().signal,
    fetchImpl,
    ...options,
  });

describe('a review from the researcher’s own model', () => {
  it('asks the endpoint’s chat API with the service’s prompt, and reads the answer by the service’s rules', async () => {
    const { fetchImpl, sent } = endpoint(
      chatStream([
        { content: ANSWER.slice(0, 40) },
        { content: ANSWER.slice(40) },
      ]),
    );
    const outcome = await review(fetchImpl);

    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(request?.body).toMatchObject({
      model: 'llama',
      stream: true,
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true, schema: REVIEW_OUTPUT_SCHEMA },
      },
    });
    const messages = request?.body.messages as {
      role: string;
      content: string;
    }[];
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toBe(REVIEW_SYSTEM_PROMPT);
    expect(messages[1]?.content).toContain('<protocol>');
    expect(messages[1]?.content).toContain(JSON.stringify(STUDY_CONTEXT));
    // The shape is also written out, for an endpoint that ignores the schema.
    expect(messages[1]?.content).toContain(
      JSON.stringify(REVIEW_OUTPUT_SCHEMA),
    );

    // Most serious first, numbered by the reader, as the service does.
    expect(outcome).toMatchObject({
      kind: 'result',
      findings: [
        { id: 'f1', title: 'First', severity: 'serious' },
        { id: 'f2', title: 'Second', severity: 'suggestion' },
      ],
    });
  });

  it('sends nothing of this site’s with the request, and no key when there is none', async () => {
    const { fetchImpl, sent } = endpoint(chatStream([{ content: ANSWER }]));
    await review(fetchImpl);
    expect(sent[0]?.headers).toEqual({ 'content-type': 'application/json' });
    expect(sent[0]?.init.credentials).toBe('omit');
    expect(sent[0]?.init.referrerPolicy).toBe('no-referrer');
  });

  it('sends the key as a bearer token when there is one', async () => {
    const { fetchImpl, sent } = endpoint(chatStream([{ content: ANSWER }]));
    await review(fetchImpl, { settings: { ...SETTINGS, apiKey: 'sk-own' } });
    expect(sent[0]?.headers.authorization).toBe('Bearer sk-own');
  });

  it('reports the answer and the model’s reasoning as they arrive, under either name', async () => {
    const { fetchImpl } = endpoint(
      chatStream([
        { reasoning_content: 'abc' },
        { reasoning_content: 'de' },
        { content: ANSWER.slice(0, 10) },
        { content: ANSWER.slice(10) },
      ]),
    );
    const progress: { received: number; thinking: number }[] = [];
    await review(fetchImpl, { onProgress: (now) => progress.push(now) });
    expect(progress).toEqual([
      { received: 0, thinking: 3 },
      { received: 0, thinking: 5 },
      { received: 10, thinking: 5 },
      { received: ANSWER.length, thinking: 5 },
    ]);
  });

  it('asks more plainly when the endpoint refuses the answer format', async () => {
    const { fetchImpl, sent } = endpoint(
      errorResponse(400, { error: { message: 'response_format unsupported' } }),
      errorResponse(422),
      chatStream([{ content: ANSWER }]),
    );
    const outcome = await review(fetchImpl);
    expect(outcome.kind).toBe('result');
    expect(sent.map((request) => request.body.response_format)).toEqual([
      expect.objectContaining({ type: 'json_schema' }),
      { type: 'json_object' },
      undefined,
    ]);
  });

  it('reads an answer wrapped in reasoning, a code fence or a sentence', async () => {
    const wrapped = `<think>Is {this} a finding?</think>\nHere is the review:\n\`\`\`json\n${ANSWER}\n\`\`\`\nDone.`;
    expect(extractAnswerJson(wrapped)).toBe(ANSWER);
    const { fetchImpl } = endpoint(chatStream([{ content: wrapped }]));
    expect(await review(fetchImpl)).toMatchObject({
      kind: 'result',
      findings: [{ title: 'First' }, { title: 'Second' }],
    });
  });

  it('reads the answer of an endpoint that does not stream', async () => {
    const { fetchImpl } = endpoint(
      new Response(
        JSON.stringify({ choices: [{ message: { content: ANSWER } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    expect((await review(fetchImpl)).kind).toBe('result');
  });

  it('takes an answer with no findings as a review that found no problems', async () => {
    const { fetchImpl } = endpoint(
      chatStream([{ content: '{"findings":[]}' }]),
    );
    expect(await review(fetchImpl)).toEqual({ kind: 'result', findings: [] });
  });

  it.each([
    ['prose', 'I could not review this protocol.'],
    ['an answer cut short', ANSWER.slice(0, ANSWER.length - 20)],
    ['nothing', ''],
    ['findings of the wrong shape', '{"findings":[{"title":"Only a title"}]}'],
  ])('does not take %s for a review', async (_what, content) => {
    const { fetchImpl } = endpoint(chatStream([{ content }]));
    expect(await review(fetchImpl)).toEqual({
      kind: 'error',
      code: 'unreadable_answer',
    });
  });

  it.each([
    [401, {}, 'refused'],
    [403, {}, 'refused'],
    [404, {}, 'not_found'],
    [400, { error: { message: 'model "llama" not found' } }, 'not_found'],
    [413, {}, 'too_long'],
    [400, { error: { code: 'context_length_exceeded' } }, 'too_long'],
    [
      400,
      { error: 'the request exceeds the available context size' },
      'too_long',
    ],
    [429, {}, 'endpoint_error'],
    [500, {}, 'endpoint_error'],
  ] as const)('reads a %i answer (%j) as %s', async (status, body, code) => {
    const { fetchImpl, sent } = endpoint(errorResponse(status, body));
    expect(await review(fetchImpl)).toEqual({ kind: 'error', code });
    // None of these is about the answer format: it is not asked again.
    expect(sent).toHaveLength(1);
  });

  it('says the endpoint could not be reached when the request never arrives', async () => {
    const { fetchImpl } = endpoint(new TypeError('Failed to fetch'));
    expect(await review(fetchImpl)).toEqual({
      kind: 'error',
      code: 'unreachable',
    });
  });

  it('says so too for an address it may not call, and calls nothing', async () => {
    const { fetchImpl } = endpoint();
    expect(
      await review(fetchImpl, {
        settings: { ...SETTINGS, address: 'http://192.168.1.20:11434/v1' },
      }),
    ).toEqual({ kind: 'error', code: 'unreachable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports an error the endpoint sends in the middle of its answer', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: '{' } }] })}\n\ndata: ${JSON.stringify({ error: { message: 'out of memory' } })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const { fetchImpl } = endpoint(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    expect(await review(fetchImpl)).toEqual({
      kind: 'error',
      code: 'endpoint_error',
    });
  });

  /** An endpoint that never answers, and fails as fetch does when aborted. */
  const hanging = () =>
    vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

  it('stops when the researcher stops it', async () => {
    const controller = new AbortController();
    const fetchImpl = hanging();
    const outcome = review(fetchImpl, { signal: controller.signal });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    controller.abort();
    expect(await outcome).toEqual({ kind: 'aborted' });
  });

  it('gives up on an endpoint that takes too long', async () => {
    expect(await review(hanging(), { timeoutMs: 5 })).toEqual({
      kind: 'error',
      code: 'endpoint_error',
    });
  });
});

describe('testing the connection', () => {
  const test = (fetchImpl: typeof fetch, settings = SETTINGS) =>
    testOwnModel({
      settings,
      signal: new AbortController().signal,
      fetchImpl,
    });

  it('asks the model for one word, at the address and with the key a review uses', async () => {
    const { fetchImpl, sent } = endpoint(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    expect(await test(fetchImpl, { ...SETTINGS, apiKey: 'sk-own' })).toEqual({
      ok: true,
    });
    expect(sent[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(sent[0]?.headers.authorization).toBe('Bearer sk-own');
    expect(sent[0]?.body).toMatchObject({ model: 'llama', stream: false });
    // Nothing of the protocol or the study is in a test.
    expect(JSON.stringify(sent[0]?.body)).not.toContain('protocol');
  });

  it.each([
    [errorResponse(401), 'refused'],
    [errorResponse(404), 'not_found'],
    [errorResponse(500), 'endpoint_error'],
    [new TypeError('Failed to fetch'), 'unreachable'],
    // Something answers, but it is not a chat API.
    [
      new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
      'not_found',
    ],
  ] as const)('says why it failed (%#)', async (answer, code) => {
    const { fetchImpl } = endpoint(answer);
    expect(await test(fetchImpl)).toEqual({ ok: false, code });
  });
});
