import { describe, expect, it } from 'vitest';

import { describeMigrationFailure } from '../describeMigrationFailure';

/**
 * The failure this exists for: two attributes on one entity carry the SAME
 * name. Schema 8 rejects that, `migrateProtocol` re-validates and throws, and
 * the researcher used to see only "Protocol migration failed." — an instrument
 * that will not open, with no way forward.
 *
 * Exactly the same name, not two spellings of one: the schema compares names
 * exactly (see `findDuplicateName`, which documents why it must not fold), so
 * `name` and `NAME` are two different attributes and a protocol holding both
 * opens normally.
 */
const duplicateNameError = new Error(
  'Migration resulted in invalid protocol: Duplicate attribute name "Gender" at codebook.node.abc.variables',
);

const protocolWithCollision = {
  codebook: {
    node: {
      abc: {
        name: 'Person',
        variables: {
          v1: { name: 'Gender', type: 'text' },
          v2: { name: 'Gender', type: 'text' },
        },
      },
    },
  },
};

describe('describeMigrationFailure', () => {
  it('names the attribute and where it lives', () => {
    const { title, message } = describeMigrationFailure(
      duplicateNameError,
      protocolWithCollision,
    );

    expect(title).toBe('Two attributes share a name');
    expect(message).toContain('"Gender"');
    expect(message).toContain('"Person"');
  });

  it('tells the researcher what to actually do', () => {
    const { message } = describeMigrationFailure(
      duplicateNameError,
      protocolWithCollision,
    );

    expect(message).toMatch(/rename one of them/i);
    // Never the bare sentence the researcher used to get.
    expect(message).not.toBe('Protocol migration failed.');
  });

  it('finds a collision on the interviewee', () => {
    const { message } = describeMigrationFailure(duplicateNameError, {
      codebook: {
        ego: {
          variables: {
            v1: { name: 'Gender', type: 'text' },
            v2: { name: 'Gender', type: 'text' },
          },
        },
      },
    });

    expect(message).toContain('the interviewee');
  });

  // The regression this pins: folding here would send the researcher looking
  // at entries the schema never objected to. `GENDER` is not part of the pair.
  it('does not point at names the schema treats as different', () => {
    const { message } = describeMigrationFailure(duplicateNameError, {
      codebook: {
        node: {
          abc: {
            name: 'Person',
            variables: {
              v1: { name: 'GENDER', type: 'text' },
              v2: { name: 'gender', type: 'text' },
            },
          },
        },
      },
    });

    // No entity is named, because no entity holds two attributes called
    // "Gender" — the case-variants are two different attributes.
    expect(message).not.toContain('"Person"');
    expect(message).toContain('"Gender"');
  });

  it('still names the attribute when the collision cannot be located', () => {
    const { title, message } = describeMigrationFailure(duplicateNameError, {});

    expect(title).toBe('Two attributes share a name');
    expect(message).toContain('"Gender"');
  });

  it('surfaces the underlying reason for an unrecognised failure', () => {
    const { title, message } = describeMigrationFailure(
      new Error('stages.3.prompts must contain at least 1 element'),
      protocolWithCollision,
    );

    expect(title).toBe('Failed to Open Protocol');
    expect(message).toContain('at least 1 element');
  });
});
