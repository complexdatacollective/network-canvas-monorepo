import { describe, expect, it } from 'vitest';
import { z } from 'zod';

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
      expect(
        schemaProblemSentence({ code, message: RAW, absent: true }, FIELD),
      ).toBe('Node type has no value, and this stage needs one.');
    }
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
