import { describe, expect, it } from 'vitest';

import { createAnthropicModel } from '../anthropic-model.ts';
import { MAX_OUTPUT_TOKENS } from '../constants.ts';
import { REVIEW_OUTPUT_SCHEMA } from '../findings.ts';

/**
 * The Anthropic call, against a stand-in for the Messages API: what it asks
 * for, and that it reports the model's thinking apart from its answer.
 */

type Json = Record<string, unknown>;

const USAGE = {
  input_tokens: 2_500,
  cache_creation_input_tokens: 500,
  cache_read_input_tokens: 9_000,
  output_tokens: 1,
};

const EVENTS: Json[] = [
  {
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: USAGE,
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'Reading the stages. ' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'Checking the codebook.' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'sig' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: '{"findings"' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: ':[]}' },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 3_000 },
  },
  { type: 'message_stop' },
];

/** A provider that answers with these server-sent events. */
const streaming = (events: Json[]) => {
  const requests: { url: string; body: Json }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
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

describe('the Anthropic call', () => {
  it('asks for a thorough, schema-bound answer whose thinking is summarised as it happens', async () => {
    const { requests, fetcher } = streaming(EVENTS);
    const model = createAnthropicModel('test-key', { fetch: fetcher });
    await model({
      system: 'The instructions.',
      user: 'The protocol.',
      signal: new AbortController().signal,
      onStart: () => {},
      onThinking: () => {},
      onText: () => {},
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(requests[0]?.body).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: REVIEW_OUTPUT_SCHEMA },
      },
      system: [
        {
          type: 'text',
          text: 'The instructions.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: 'The protocol.' }],
    });
  });

  it('reports the start, each piece of thinking and of the answer, and what it used', async () => {
    const seen = { started: 0, thinking: '', text: '' };
    const model = createAnthropicModel('test-key', {
      fetch: streaming(EVENTS).fetcher,
    });
    const output = await model({
      system: 'The instructions.',
      user: 'The protocol.',
      signal: new AbortController().signal,
      onStart: () => {
        seen.started += 1;
      },
      onThinking: (chunk) => {
        seen.thinking += chunk;
      },
      onText: (chunk) => {
        seen.text += chunk;
      },
    });

    expect(seen).toEqual({
      started: 1,
      thinking: 'Reading the stages. Checking the codebook.',
      text: '{"findings":[]}',
    });
    // The thinking is no part of the answer that is parsed.
    expect(output).toEqual({
      text: '{"findings":[]}',
      stopReason: 'end_turn',
      usage: {
        inputTokens: 2_500,
        cacheCreationInputTokens: 500,
        cacheReadInputTokens: 9_000,
        outputTokens: 3_000,
      },
    });
  });
});
