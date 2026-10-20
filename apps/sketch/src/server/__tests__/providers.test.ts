// @vitest-environment node
import type { Message } from '@anthropic-ai/sdk/resources/messages/messages';
import type { Response } from 'openai/resources/responses/responses';
import { describe, expect, it, vi } from 'vitest';

import { toProviderJsonSchema } from '../design/json-schema.ts';
import { StudyDesignSchema } from '../design/schema.ts';
import {
  type AnthropicClientLike,
  createAnthropicAdapter,
} from '../providers/anthropic.ts';
import {
  createOpenAIAdapter,
  type OpenAIClientLike,
} from '../providers/openai.ts';
import type { StructuredRequest } from '../providers/types.ts';

const schema = toProviderJsonSchema(StudyDesignSchema);
const request: StructuredRequest = {
  model: 'claude-sonnet-5-5',
  system: 'SYSTEM PROMPT',
  messages: [
    { role: 'user', content: 'describe' },
    { role: 'assistant', content: '{"a":1}' },
    { role: 'user', content: 'fix it' },
  ],
  schema,
  schemaName: 'study_design',
  maxTokens: 16000,
  effort: 'medium',
};

// The stage discriminators must survive as enums: zodOutputFormat would have
// moved them into description text.
const stageKinds = (s: Record<string, unknown>) =>
  JSON.stringify(s).match(/"enum":\["(information|sociogram|narrative)"\]/g);

const anthropicMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: '{"ok":true}', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 12,
      output_tokens: 34,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 7,
    },
    ...overrides,
  }) as Message;

describe('anthropic adapter', () => {
  const setup = (message: Message) => {
    const create = vi.fn(async () => message);
    const client = { messages: { create } } as unknown as AnthropicClientLike;
    return { adapter: createAnthropicAdapter({ client }), create };
  };

  it('sends the schema raw, caches the system prompt and sets effort', async () => {
    const { adapter, create } = setup(anthropicMessage());
    await adapter.generateStructured(request);

    const [params] = create.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(params).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      system: [
        {
          type: 'text',
          text: 'SYSTEM PROMPT',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: request.messages,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema' },
      },
    });
    const sent = (params.output_config as { format: { schema: unknown } })
      .format.schema;
    expect(sent).toBe(schema);
    expect(stageKinds(sent as Record<string, unknown>)).toHaveLength(3);
    expect(params).not.toHaveProperty('thinking');
  });

  it('reads text, stop reason and usage', async () => {
    const { adapter } = setup(anthropicMessage());
    await expect(adapter.generateStructured(request)).resolves.toEqual({
      json: { ok: true },
      rawText: '{"ok":true}',
      stopReason: 'complete',
      usage: {
        inputTokens: 12,
        outputTokens: 34,
        cacheReadTokens: 5000,
        cacheWriteTokens: 7,
      },
    });
  });

  it('flags cut-off and refused replies', async () => {
    const cut = setup(
      anthropicMessage({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: '{"ok":', citations: null }],
      }),
    );
    await expect(
      cut.adapter.generateStructured(request),
    ).resolves.toMatchObject({ json: null, stopReason: 'max_tokens' });
    const refused = setup(anthropicMessage({ stop_reason: 'refusal' }));
    await expect(
      refused.adapter.generateStructured(request),
    ).resolves.toMatchObject({ stopReason: 'refusal' });
  });

  it('turns SDK retries off so a timeout is not multiplied', async () => {
    const { adapter, create } = setup(anthropicMessage());
    await adapter.generateStructured({ ...request, timeoutMs: 90_000 });
    expect((create.mock.calls[0] as unknown[] | undefined)?.[1]).toEqual({
      maxRetries: 0,
      timeout: 90_000,
    });
  });

  it('is configured only with a key', () => {
    expect(createAnthropicAdapter({ apiKey: '' }).isConfigured()).toBe(false);
    expect(createAnthropicAdapter({ apiKey: 'sk-test' }).isConfigured()).toBe(
      true,
    );
  });
});

const openaiResponse = (overrides: Partial<Response> = {}): Response =>
  ({
    id: 'resp_1',
    object: 'response',
    status: 'completed',
    output_text: '{"ok":true}',
    output: [
      {
        type: 'message',
        id: 'm',
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'output_text', text: '{"ok":true}', annotations: [] },
        ],
      },
    ],
    incomplete_details: null,
    usage: {
      input_tokens: 6000,
      input_tokens_details: { cached_tokens: 5000, cache_write_tokens: 0 },
      output_tokens: 40,
      output_tokens_details: { reasoning_tokens: 10 },
      total_tokens: 6040,
    },
    ...overrides,
  }) as Response;

describe('openai adapter', () => {
  const setup = (response: Response) => {
    const create = vi.fn(async () => response);
    const client = { responses: { create } } as unknown as OpenAIClientLike;
    return { adapter: createOpenAIAdapter({ client }), create };
  };

  it('sends a strict json_schema format with the schema raw', async () => {
    const { adapter, create } = setup(openaiResponse());
    await adapter.generateStructured({ ...request, model: 'gpt-6-astra' });

    const [params] = create.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(params).toMatchObject({
      model: 'gpt-6-astra',
      instructions: 'SYSTEM PROMPT',
      max_output_tokens: 16000,
      reasoning: { effort: 'medium' },
      text: {
        format: { type: 'json_schema', name: 'study_design', strict: true },
      },
    });
    expect(params.input).toEqual(
      request.messages.map((m) => ({ type: 'message', ...m })),
    );
    const sent = (params.text as { format: { schema: unknown } }).format.schema;
    expect(sent).toBe(schema);
  });

  it('turns SDK retries off so a timeout is not multiplied', async () => {
    const { adapter, create } = setup(openaiResponse());
    await adapter.generateStructured({ ...request, timeoutMs: 90_000 });
    expect((create.mock.calls[0] as unknown[] | undefined)?.[1]).toEqual({
      maxRetries: 0,
      timeout: 90_000,
    });
  });

  it('separates cached input tokens', async () => {
    const { adapter } = setup(openaiResponse());
    await expect(adapter.generateStructured(request)).resolves.toEqual({
      json: { ok: true },
      rawText: '{"ok":true}',
      stopReason: 'complete',
      usage: {
        inputTokens: 1000,
        outputTokens: 40,
        cacheReadTokens: 5000,
        cacheWriteTokens: 0,
      },
    });
  });

  it('maps incomplete and refused responses', async () => {
    const cut = setup(
      openaiResponse({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    );
    await expect(
      cut.adapter.generateStructured(request),
    ).resolves.toMatchObject({ stopReason: 'max_tokens' });
    const refused = setup(
      openaiResponse({
        output_text: '',
        output: [
          {
            type: 'message',
            id: 'm',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: 'no' }],
          },
        ],
      }),
    );
    await expect(
      refused.adapter.generateStructured(request),
    ).resolves.toMatchObject({ stopReason: 'refusal', json: null });
  });
});
