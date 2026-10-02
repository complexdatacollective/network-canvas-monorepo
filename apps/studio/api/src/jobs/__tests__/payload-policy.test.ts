import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';

import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  JOB_PAYLOAD_PARSE_OPTIONS,
  JOB_PAYLOAD_POLICY,
  JOB_PAYLOAD_SCHEMAS,
  JOB_QUEUES,
  JOB_SCHEDULES,
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

  it.each(['protocol-store-gc', 'denied-attempts-summary'] as const)(
    'admits an empty object from another realm on %s',
    (queue) => {
      expect(codecAdmits(queue, runInNewContext('({})'))).toBe(true);
      expect(codecAdmits(queue, Object.create(null))).toBe(true);
    },
  );

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
