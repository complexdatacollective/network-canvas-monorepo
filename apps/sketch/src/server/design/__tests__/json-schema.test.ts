// @vitest-environment node
//
// The JSON Schemas Sketch sends to Anthropic structured outputs and OpenAI
// strict mode. A schema change must update the hashes on purpose: a new hash
// means a new grammar compile on Anthropic, and the live smoke test (SPEC
// §1.3) should be re-run.
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  countOptional,
  countUnions,
  schemaStats,
  toProviderJsonSchema,
} from '../json-schema.ts';
import {
  ScreeningSchema,
  StudyDesignSchema,
  WordingSchema,
} from '../schema.ts';

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const SCHEMAS = [
  ['StudyDesign', StudyDesignSchema],
  ['Wording', WordingSchema],
  ['Screening', ScreeningSchema],
] as const;

describe('provider JSON Schemas', () => {
  it('StudyDesign has exactly one union and no optional properties', () => {
    for (const defs of [true, false]) {
      const schema = toProviderJsonSchema(StudyDesignSchema, { defs });
      expect(countUnions(schema)).toBeLessThanOrEqual(1);
      expect(countOptional(schema)).toBe(0);
    }
  });

  it.each(SCHEMAS)(
    '%s passes the provider asserts with no unions or optional properties beyond budget',
    (_, s) => {
      const schema = toProviderJsonSchema(s);
      expect(countOptional(schema)).toBe(0);
      expect(countUnions(schema)).toBeLessThanOrEqual(1);
      expect(schema.type).toBe('object');
    },
  );

  it('keeps the measured StudyDesign budget', () => {
    expect(schemaStats(toProviderJsonSchema(StudyDesignSchema))).toEqual({
      unions: 1,
      optional: 0,
      properties: 153,
      objects: 26,
      enums: expect.any(Number),
      maxEnum: 14,
      anyOfBranches: 11,
      maxObjectDepth: 2,
      bytes: 28_938,
    });
    expect(
      Object.keys(toProviderJsonSchema(StudyDesignSchema).$defs as object),
    ).toEqual(
      expect.arrayContaining([
        'Attribute',
        'SkipLogic',
        'SkipCondition',
        'Operator',
        'NodeFilter',
        'FilterCondition',
      ]),
    );
  });

  it('emits the schemas whose hashes are recorded', () => {
    expect(
      Object.fromEntries(
        SCHEMAS.map(([name, s]) => [name, sha256(toProviderJsonSchema(s))]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "Screening": "b26b714997904503f942e3f7fa6302138337122472bc36eca22e938ef00df3a3",
        "StudyDesign": "120b00df9439d8cec963d7aceddddee8a38c12b4c56f7b26b086d961c6a4168d",
        "Wording": "4b760d7df90de94c5d6d013446340d1cc734f57ca66840b8a4b00495a484d24d",
      }
    `);
    expect(
      sha256(toProviderJsonSchema(StudyDesignSchema, { defs: false })),
    ).toMatchInlineSnapshot(
      `"13e0d3f4f03dc1f074885125f7a32635aed36beb9e8a8475b50bb5be2c4fc7c4"`,
    );
  });
});

describe('provider asserts reject schemas a provider would refuse', () => {
  it.each([
    [
      '.optional()',
      z.object({ a: z.string().optional() }),
      /not every property required/,
    ],
    ['.nullable()', z.object({ a: z.string().nullable() }), /type array/],
    [
      '.min() on an array',
      z.object({ a: z.array(z.string()).min(2) }),
      /keyword "minItems" not allowed/,
    ],
    [
      '.int()',
      z.object({ a: z.number().int() }),
      /keyword "(minimum|maximum)" not allowed/,
    ],
    ['a non-object root', z.array(z.string()), /root must be a plain object/],
  ] as const)('%s', (_, schema, message) => {
    expect(() => toProviderJsonSchema(schema)).toThrow(message);
  });

  it('accepts a discriminated union and counts it once', () => {
    const schema = toProviderJsonSchema(
      z.object({
        a: z.discriminatedUnion('k', [
          z.object({ k: z.literal('x') }),
          z.object({ k: z.literal('y') }),
        ]),
      }),
    );
    expect(countUnions(schema)).toBe(1);
  });
});
