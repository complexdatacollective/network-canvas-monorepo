import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getValue } from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';

import {
  resourceProblemClause,
  schemaProblemSentence,
} from '../schemaProblems.ts';

/**
 * Every code the validator can attach to an issue, read from the validator
 * itself.
 *
 * `z.ZodIssueCode` is deprecated as a way to WRITE a code — the string literal
 * is preferred — and it is used here for the one thing it still does better
 * than anything else: it is Zod's own list of every code it emits, so this
 * suite fails the day an upgrade adds one, rather than the day a researcher
 * meets it. The union type behind it is what makes the copy record total; this
 * is the same list at runtime.
 */
const EVERY_CODE = Object.values(z.ZodIssueCode);

/** What the validator says, which no researcher should be shown. */
const RAW = 'Invalid input: expected string, received undefined';

const FIELD = 'Node type';

const sentenceFor = (code: string): string =>
  schemaProblemSentence({ code, message: RAW, absent: false }, FIELD);

describe('the words a schema refusal is put in', () => {
  it('has copy of its own for every code the validator can produce', () => {
    // A code with no entry in the record falls back to the sentence for a
    // refusal this package has never heard of. That fallback is what makes
    // this test able to fail: a missing entry is invisible in the sentence
    // itself, and visible as a collision with it.
    const unrecognised = sentenceFor('a_code_from_a_later_validator');

    for (const code of EVERY_CODE) {
      if (code === 'custom') continue;
      expect(sentenceFor(code), `no copy is written for "${code}"`).not.toBe(
        unrecognised,
      );
    }
  });

  it('never repeats the validator, and always names the control', () => {
    for (const code of EVERY_CODE) {
      if (code === 'custom') continue;
      const sentence = sentenceFor(code);
      expect(sentence).not.toContain(RAW);
      expect(sentence.startsWith(`${FIELD} `)).toBe(true);
    }
  });

  /**
   * The one code whose message is already about this protocol: every
   * cross-reference rule in the schema raises `custom`, and those messages
   * name the attribute, type or resource that is wrong. Rewriting them as a
   * sentence about "a value" would throw away the only part that helps.
   */
  it('keeps the schema’s own words where they were written for a researcher', () => {
    expect(
      schemaProblemSentence(
        {
          code: 'custom',
          message:
            'This stage uses a resource ("roster") that is not in the protocol.',
          absent: false,
        },
        FIELD,
      ),
    ).toBe(
      'This stage uses a resource ("roster") that is not in the protocol.',
    );
  });

  /**
   * A value that is not there is the same fact whatever code the validator
   * reached for, and it is said the same way — so a schema that starts
   * reporting a missing key as something other than `invalid_type` changes
   * nothing a researcher reads.
   */
  it('says a missing value is missing, whatever the code', () => {
    for (const code of EVERY_CODE) {
      // `custom` is not a validator reaching for a code — see below.
      if (code === 'custom') continue;
      expect(
        schemaProblemSentence({ code, message: RAW, absent: true }, FIELD),
      ).toBe('Node type has no value, and this stage needs one.');
    }
  });

  /**
   * And the exception, which is what the rule above is for.
   *
   * Several of the schema's cross-reference rules report AT a key that is not
   * there, because the absence is the fault: an ego rule with no attribute is
   * refused at `[…, 'options', 'attribute']`. The message explains that; "has
   * no value" replaces it with a claim about an empty control, which the rule
   * set the researcher is looking at plainly is not.
   */
  it('keeps those words even where the value they are about is missing', () => {
    expect(
      schemaProblemSentence(
        {
          code: 'custom',
          message:
            'An ego rule must reference an attribute; a type-level ego rule (no attribute) is not valid.',
          absent: true,
        },
        'Rules',
      ),
    ).toBe(
      'An ego rule must reference an attribute; a type-level ego rule (no attribute) is not valid.',
    );
  });
});

/**
 * The evidence that the exception above is a real case rather than a shape the
 * types happen to allow: the protocol schema is asked to judge a stage the rule
 * refuses, and its issue is read exactly as the editor reads one.
 */
describe('a cross-reference rule reported where nothing is', () => {
  it('is what the schema does with a type-level ego rule', async () => {
    const protocol = structuredClone(allInterfaces) as Record<string, unknown>;
    const stages = protocol.stages as Record<string, unknown>[];
    const stageIndex = stages.findIndex(
      (stage) => stage.id === 'name-generator-roster-1',
    );
    const stage = stages[stageIndex] as Record<string, unknown>;
    stage.skipLogic = {
      action: 'SKIP',
      filter: {
        join: 'OR',
        rules: [
          // No `attribute`, which is the fault the rule reports.
          { id: 'probe-rule-1', type: 'ego', options: { operator: 'EXISTS' } },
        ],
      },
    };
    const { id: _id, type: _type, ...stageFields } = stage;

    const result = await CurrentProtocolSchema.safeParseAsync(protocol);
    expect(result.success).toBe(false);
    const issue = (result.error?.issues ?? []).find(
      (candidate) =>
        candidate.path[0] === 'stages' &&
        candidate.path[1] === stageIndex &&
        candidate.path.includes('skipLogic'),
    );
    if (issue === undefined) throw new Error('the schema refused nothing');

    // What `stageIssuesOf` computes for one of these, read the same way.
    const inside = issue.path.slice(2) as (string | number)[];
    const absent = isUnanswered(getValue(stageFields, inside));
    expect(issue.code).toBe('custom');
    expect(absent).toBe(true);

    // So the researcher is told what the rule says, and not that a rule set
    // holding a rule is empty.
    expect(
      schemaProblemSentence(
        { code: issue.code, message: issue.message, absent },
        'Rules',
      ),
    ).toBe(issue.message);
  });
});

describe('the words a refused resource entry is described in', () => {
  const clauseFor = (code: string): string =>
    resourceProblemClause({ code, absent: false });

  it('has copy of its own for every code the validator can produce', () => {
    // Read the same way as above: a code with no entry falls back to the
    // clause for a refusal this package has never heard of, and a missing
    // entry shows up as a collision with it.
    const unrecognised = clauseFor('a_code_from_a_later_validator');

    for (const code of EVERY_CODE) {
      expect(clauseFor(code), `no copy is written for "${code}"`).not.toBe(
        unrecognised,
      );
    }
  });

  /**
   * `custom` is answered here in this package's words, unlike a refusal about
   * a control. A stored resource is refused by the asset schema, whose custom
   * rules are about how a file name may be written rather than about anything
   * in this protocol — so there is no message worth keeping, and the signature
   * of this one cannot take one.
   */
  it('never repeats the validator, whatever it refused', () => {
    for (const code of EVERY_CODE) {
      expect(clauseFor(code)).not.toContain(RAW);
      expect(clauseFor(code)).not.toContain('Invalid input');
    }
  });

  it('says a missing value is missing, whatever the code', () => {
    for (const code of EVERY_CODE) {
      expect(resourceProblemClause({ code, absent: true })).toBe(
        'part of its entry is missing.',
      );
    }
  });
});
