import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';

import { Effect, Exit, Schema, type SchemaAST } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  JOB_PAYLOAD_PARSE_OPTIONS,
  JOB_PAYLOAD_POLICY,
  JOB_PAYLOAD_SCHEMAS,
  JOB_QUEUES,
  JOB_SCHEDULES,
  JobCorrelationSchema,
  type JobQueueName,
} from '@codaco/studio-sync/jobs';

import { payloadCodec } from '../queues.ts';

const QUEUE_NAMES = JOB_QUEUES.map(({ name }) => name);

const IDENTIFIER_KEY = /^(id|[a-z][A-Za-z0-9]*Id)$/;

const CONTENT_KEY =
  /email|address|mail|url|link|token|secret|name|label|content|body|text|message|payload|data/i;

const admits = (
  schema: Schema.ConstraintDecoder<unknown>,
  value: unknown,
): boolean =>
  Exit.isSuccess(
    Schema.decodeUnknownExit(schema, JOB_PAYLOAD_PARSE_OPTIONS)(value),
  );

const codecAdmits = (queue: JobQueueName, value: unknown): boolean =>
  Exit.isSuccess(Effect.runSyncExit(payloadCodec(queue).decode(value)));

describe('job queue declarations', () => {
  it('declares every dead-letter target before the queue that names it', () => {
    for (const [index, { name, options }] of JOB_QUEUES.entries()) {
      if (!('deadLetter' in options)) continue;
      const deadLetter = options.deadLetter;
      expect(
        QUEUE_NAMES.indexOf(deadLetter),
        `${name} names a dead letter that is not declared before it`,
      ).toBeGreaterThanOrEqual(0);
      expect(QUEUE_NAMES.indexOf(deadLetter)).toBeLessThan(index);
    }
  });

  it('schedules only declared queues', () => {
    for (const { queue } of JOB_SCHEDULES) {
      expect(QUEUE_NAMES).toContain(queue);
    }
  });
});

describe('job payload policy', () => {
  it('classifies every declared queue and only declared queues', () => {
    expect(Object.keys(JOB_PAYLOAD_POLICY).toSorted()).toEqual(
      QUEUE_NAMES.toSorted(),
    );
    expect(Object.keys(JOB_PAYLOAD_SCHEMAS).toSorted()).toEqual(
      QUEUE_NAMES.toSorted(),
    );
  });

  it('excepts sign-in email and nothing else', () => {
    const excepted = Object.entries(JOB_PAYLOAD_POLICY)
      .filter(([, policy]) => policy.kind === 'exception')
      .map(([queue]) => queue);
    expect(excepted).toEqual(['sign-in-email']);

    const policy = JOB_PAYLOAD_POLICY['sign-in-email'];
    expect(policy.kind).toBe('exception');
    expect(policy.reason.length).toBeGreaterThan(40);
  });

  it('keeps sign-in email to the link and the account it signs in', () => {
    expect(
      Object.keys(JOB_PAYLOAD_SCHEMAS['sign-in-email'].fields).toSorted(),
    ).toEqual(['email', 'url']);

    const schema = JOB_PAYLOAD_SCHEMAS['sign-in-email'];
    const valid = {
      email: 'person@example.org',
      url: 'https://studio.example/api/auth/magic-link/verify?token=t',
    };
    const grown = { ...valid, teamId: randomUUID() };
    expect(admits(schema, valid)).toBe(true);
    expect(admits(schema, grown)).toBe(false);
    expect(codecAdmits('sign-in-email', valid)).toBe(true);
    expect(codecAdmits('sign-in-email', grown)).toBe(false);
  });

  it('admits only an empty object on the update check, as identifiers', () => {
    expect(JOB_PAYLOAD_POLICY['update-check']).toEqual({ kind: 'identifiers' });
    expect(codecAdmits('update-check', {})).toBe(true);
    // Nothing the instance knows may ride a job whose worker then contacts a
    // host outside the instance.
    expect(codecAdmits('update-check', { instanceId: randomUUID() })).toBe(
      false,
    );
    expect(codecAdmits('update-check', { version: '1.0.0' })).toBe(false);
  });

  it.each([
    'protocol-store-gc',
    'denied-attempts-summary',
    'update-check',
  ] as const)('admits an empty object from another realm on %s', (queue) => {
    expect(codecAdmits(queue, runInNewContext('({})'))).toBe(true);
    expect(codecAdmits(queue, Object.create(null))).toBe(true);
  });

  it.each(
    QUEUE_NAMES.filter(
      (queue) => JOB_PAYLOAD_POLICY[queue].kind === 'identifiers',
    ),
  )('carries identifiers only on %s', (queue: JobQueueName) => {
    const schema = JOB_PAYLOAD_SCHEMAS[queue];
    const fields = schema.fields;

    for (const [key, field] of Object.entries(fields)) {
      expect(key, `${queue} payload key ${key}`).toMatch(IDENTIFIER_KEY);
      expect(key, `${queue} payload key ${key}`).not.toMatch(CONTENT_KEY);
      expect(admits(field, randomUUID())).toBe(true);
      expect(admits(field, 'not-an-identifier')).toBe(false);
    }

    const valid = Object.fromEntries(
      Object.keys(fields).map((key) => [key, randomUUID()]),
    );
    const grown = { ...valid, email: 'a@example.org' };
    expect(admits(schema, valid)).toBe(true);
    expect(admits(schema, grown)).toBe(false);
    expect(codecAdmits(queue, valid)).toBe(true);
    expect(codecAdmits(queue, grown)).toBe(false);
    expect(codecAdmits(queue, 'not-a-payload')).toBe(false);
    expect(codecAdmits(queue, new Map())).toBe(false);
    expect(codecAdmits(queue, new Date(0))).toBe(false);
  });
});

const FREE_TEXT = [
  'Ada Lovelace',
  'researcher@example.org',
  'https://studio.example.org/study',
];

const leavesOf = (ast: SchemaAST.AST): SchemaAST.AST[] => {
  switch (ast._tag) {
    case 'Objects':
      return ast.propertySignatures.flatMap(({ type }) => leavesOf(type));
    case 'Arrays':
      return [...ast.elements, ...ast.rest].flatMap(leavesOf);
    case 'Union':
      return ast.types.flatMap(leavesOf);
    default:
      return [ast];
  }
};

describe('the usage event queue', () => {
  it('is the one queue that carries usage events', () => {
    expect(
      Object.entries(JOB_PAYLOAD_POLICY)
        .filter(([, policy]) => policy.kind === 'usage-event')
        .map(([queue]) => queue),
    ).toEqual(['analytics-delivery']);
    expect(
      Object.keys(JOB_PAYLOAD_SCHEMAS['analytics-delivery'].fields),
    ).toEqual(['usage']);
  });

  it('declares every value as a fixed code, a number, a boolean or a minted identifier', () => {
    const leaves = leavesOf(JOB_PAYLOAD_SCHEMAS['analytics-delivery'].ast);
    expect(leaves.length).toBeGreaterThan(20);
    for (const leaf of leaves) {
      expect(['Literal', 'Number', 'Boolean', 'String']).toContain(leaf._tag);
      if (leaf._tag !== 'String') continue;
      const field = Schema.make<typeof Schema.String>(leaf);
      expect(admits(field, randomUUID())).toBe(true);
      for (const text of FREE_TEXT) {
        expect(admits(field, text), text).toBe(false);
      }
    }
  });

  it('refuses an interface type no protocol schema declares', () => {
    const committed = {
      usage: {
        event: 'protocol_draft_committed',
        occurredAt: Date.UTC(2026, 9, 8),
        accountId: 'account-1',
        teamId: 'team-1',
        protocolId: randomUUID(),
        interfaceTypes: ['Information'],
        operationCount: 1,
      },
    };
    expect(codecAdmits('analytics-delivery', committed)).toBe(true);
    expect(
      codecAdmits('analytics-delivery', {
        usage: { ...committed.usage, interfaceTypes: ['person'] },
      }),
    ).toBe(false);
    expect(
      codecAdmits('analytics-delivery', {
        usage: { ...committed.usage, teamName: 'Ada Lovelace' },
      }),
    ).toBe(false);
    expect(
      codecAdmits('analytics-delivery', {
        usage: { ...committed.usage, accountId: 'researcher@example.org' },
      }),
    ).toBe(false);
  });
});

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';
const TRACEPARENT = `00-${TRACE_ID}-${SPAN_ID}-01`;

describe('job correlation', () => {
  it('carries the traceparent and nothing else', () => {
    expect(Object.keys(JobCorrelationSchema.fields)).toEqual(['traceparent']);
    expect(admits(JobCorrelationSchema, { traceparent: TRACEPARENT })).toBe(
      true,
    );
    expect(
      admits(JobCorrelationSchema, {
        traceparent: `00-${TRACE_ID}-${SPAN_ID}-00`,
      }),
    ).toBe(true);
  });

  it.each([
    ['an extra key', { traceparent: TRACEPARENT, teamId: randomUUID() }],
    ['a tracestate', { traceparent: TRACEPARENT, tracestate: 'vendor=value' }],
    ['no traceparent', {}],
    ['a bare traceparent', TRACEPARENT],
  ])('refuses %s', (_, value) => {
    expect(admits(JobCorrelationSchema, value)).toBe(false);
  });

  it.each([
    ['another version', `01-${TRACE_ID}-${SPAN_ID}-01`],
    ['a short trace id', `00-${TRACE_ID.slice(1)}-${SPAN_ID}-01`],
    ['a short span id', `00-${TRACE_ID}-${SPAN_ID.slice(1)}-01`],
    ['uppercase hex', `00-${TRACE_ID.toUpperCase()}-${SPAN_ID}-01`],
    ['a zero trace id', `00-${'0'.repeat(32)}-${SPAN_ID}-01`],
    ['a zero span id', `00-${TRACE_ID}-${'0'.repeat(16)}-01`],
    ['no flags', `00-${TRACE_ID}-${SPAN_ID}`],
    ['a trailing field', `${TRACEPARENT}-00`],
    ['an address', 'researcher@example.org'],
    ['a row id', randomUUID()],
  ])('refuses a traceparent with %s', (_, traceparent) => {
    expect(admits(JobCorrelationSchema, { traceparent })).toBe(false);
  });
});
