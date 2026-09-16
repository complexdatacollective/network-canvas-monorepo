// What a job is allowed to carry, and what a queue may declare about itself.
// The job table is one table for every team, outside row-level security's
// reach, so a payload that named a participant, an address or protocol content
// would put tenant data where nothing isolates it — the objection that kept
// Studio off a queue library until #1895.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  JOB_PAYLOAD_POLICY,
  JOB_PAYLOAD_SCHEMAS,
  JOB_QUEUES,
  JOB_SCHEDULES,
  type JobQueueName,
} from '@codaco/studio-sync/jobs';

const QUEUE_NAMES = JOB_QUEUES.map(({ name }) => name);

/** An id column's name: `id`, or something ending in `Id`. */
const IDENTIFIER_KEY = /^(id|[a-z][A-Za-z0-9]*Id)$/;

/**
 * Names that would mean the payload carries the thing itself rather than a
 * reference to the row holding it.
 */
const CONTENT_KEY =
  /email|address|mail|url|link|token|secret|name|label|content|body|text|message|payload|data/i;

function shapeOf(schema: z.ZodType): Record<string, z.ZodType> {
  if (!('shape' in schema)) {
    throw new Error('a job payload schema must be an object schema');
  }
  return schema.shape as Record<string, z.ZodType>;
}

describe('job queue declarations', () => {
  it('declares every dead-letter target before the queue that names it', () => {
    // A queue's dead letter is a foreign key to another queue's name, so the
    // order the declarations are created in is load-bearing.
    for (const [index, { name, options }] of JOB_QUEUES.entries()) {
      // Read off the declarations themselves rather than through a resolver:
      // only the queues that name one carry the field at all, which is why it
      // is narrowed rather than read and compared to `undefined`.
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

  // The case that checked the declarations against pg-boss's own option types
  // went with pg-boss (#1957). There is no library to drift from now: the
  // options are resolved against `QUEUE_DEFAULTS` in
  // `src/jobs/queues.ts`, in this repository, where a renamed field is
  // a typecheck failure at the use site rather than a runtime surprise.
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
    // The exception is a decision with a reason, not a default.
    expect(policy.reason.length).toBeGreaterThan(40);
  });

  it('keeps sign-in email to the link and the account it signs in', () => {
    expect(
      Object.keys(shapeOf(JOB_PAYLOAD_SCHEMAS['sign-in-email'])).toSorted(),
    ).toEqual(['email', 'url']);
  });

  it.each(
    QUEUE_NAMES.filter(
      (queue) => JOB_PAYLOAD_POLICY[queue].kind === 'identifiers',
    ),
  )('carries identifiers only on %s', (queue: JobQueueName) => {
    const schema = JOB_PAYLOAD_SCHEMAS[queue];
    const shape = shapeOf(schema);

    for (const [key, field] of Object.entries(shape)) {
      expect(key, `${queue} payload key ${key}`).toMatch(IDENTIFIER_KEY);
      expect(key, `${queue} payload key ${key}`).not.toMatch(CONTENT_KEY);
      // An identifier is a row id, so the schema has to refuse anything that
      // is not one: a `string` field named `teamId` would admit a label.
      expect(field.safeParse(randomUUID()).success).toBe(true);
      expect(field.safeParse('not-an-identifier').success).toBe(false);
    }

    // Strict, so a payload cannot grow a field the policy never saw.
    const valid = Object.fromEntries(
      Object.keys(shape).map((key) => [key, randomUUID()]),
    );
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, email: 'a@example.org' }).success).toBe(
      false,
    );
  });
});
