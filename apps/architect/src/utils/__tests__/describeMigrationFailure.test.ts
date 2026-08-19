import { describe, expect, it } from 'vitest';

import { describeMigrationFailure } from '../describeMigrationFailure';

/**
 * The failure this exists for: schema 8 compares codebook names without regard
 * to case or Unicode composition, so a protocol authored under an older
 * Architect can hold `name` and `NAME` on one entity. `migrateProtocol`
 * re-validates and throws, and the researcher used to see only "Protocol
 * migration failed." — an instrument that will not open, with no way forward.
 */
const duplicateNameError = new Error(
  'Migration resulted in invalid protocol: Duplicate attribute name "NAME" at codebook.node.abc.variables',
);

const protocolWithCollision = {
  codebook: {
    node: {
      abc: {
        name: 'Person',
        variables: {
          v1: { name: 'name', type: 'text' },
          v2: { name: 'NAME', type: 'text' },
        },
      },
    },
  },
};

describe('describeMigrationFailure', () => {
  it('names both spellings and where they live', () => {
    const { title, message } = describeMigrationFailure(
      duplicateNameError,
      protocolWithCollision,
    );

    expect(title).toBe('Two attributes share a name');
    expect(message).toContain('"name" and "NAME"');
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

  it('reports the researchers own spellings, not a folded key', () => {
    // The comparison folds to `name`; describing the fold would name a string
    // they never typed.
    const { message } = describeMigrationFailure(
      duplicateNameError,
      protocolWithCollision,
    );

    expect(message).toContain('NAME');
  });

  it('finds a collision on the interviewee', () => {
    const { message } = describeMigrationFailure(duplicateNameError, {
      codebook: {
        ego: {
          variables: {
            v1: { name: 'name', type: 'text' },
            v2: { name: 'NAME', type: 'text' },
          },
        },
      },
    });

    expect(message).toContain('the interviewee');
  });

  it('treats canonically equivalent names as the same name', () => {
    // Precomposed U+00E9 vs decomposed e + U+0301. These render identically and
    // fold to the same key, which is exactly why the schema now rejects them —
    // so the message must find BOTH and show the two spellings as stored.
    const precomposed = 'Caf\u00e9';
    const decomposed = 'Cafe\u0301';
    expect(precomposed).not.toBe(decomposed);

    const { message } = describeMigrationFailure(
      new Error(`Duplicate attribute name "${decomposed}"`),
      {
        codebook: {
          node: {
            abc: {
              name: 'Person',
              variables: {
                v1: { name: precomposed, type: 'text' },
                v2: { name: decomposed, type: 'text' },
              },
            },
          },
        },
      },
    );

    expect(message).toContain(`"${precomposed}" and "${decomposed}"`);
  });

  it('still names the attribute when the collision cannot be located', () => {
    const { title, message } = describeMigrationFailure(duplicateNameError, {});

    expect(title).toBe('Two attributes share a name');
    expect(message).toContain('"NAME"');
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
