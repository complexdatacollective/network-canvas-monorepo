import { describe, expect, it } from 'vitest';

import {
  getComposerQuickAddOptionsForSubject,
  getConvexHullOptionsForSubject,
} from '~/components/sections/NodeConfiguration/NodeConfiguration';
import { getQuickAddOptionsForSubject } from '~/components/sections/QuickAdd/withOptions';
import type { RootState } from '~/ducks/modules/root';
import {
  excludeUnvalidatedUses,
  excludeValidatedUses,
} from '~/selectors/roleFilters';

// Minimal RootState stub: only the slice the selectors touch.
const stateWith = (protocol: unknown): RootState =>
  ({
    activeProtocol: { present: protocol },
  }) as unknown as RootState;

// Same shape as the Task 7 role-map fixture: `cat` is written both by a form
// field (validated) and a CategoricalBin prompt (unvalidated), on the same
// node-type subject. `qa` extends this for the two quickAdd sites below: a
// text variable written both by a form field (validated) and by
// NetworkComposer's own quickAdd (unvalidated), on the same subject.
const protocol = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
          qa: {
            name: 'qa',
            type: 'text',
          },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: {
        fields: [
          { variable: 'cat', prompt: 'P' },
          { variable: 'qa', prompt: 'Q' },
        ],
      },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
    {
      id: 's3',
      type: 'NetworkComposer',
      label: 'C',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'qa',
    },
  ],
};

const subject: { entity: 'node' | 'edge' | 'ego'; type: string } = {
  entity: 'node',
  type: 'person',
};
const options = [
  { value: 'cat', label: 'Cat' },
  { value: 'dog', label: 'Dog' },
];

describe('excludeUnvalidatedUses (VALIDATED writer pickers: form fields, otherVariable)', () => {
  it('drops an option a bin/highlight/census elsewhere already writes', () => {
    const result = excludeUnvalidatedUses(
      stateWith(protocol),
      subject,
      options,
    );

    expect(result.map((o) => o.value)).toEqual(['dog']);
  });

  it('keeps the dropped option when it is the currently-selected value', () => {
    const result = excludeUnvalidatedUses(
      stateWith(protocol),
      subject,
      options,
      'cat',
    );

    expect(result.map((o) => o.value)).toEqual(['cat', 'dog']);
  });
});

describe('excludeValidatedUses (UNVALIDATED writer pickers: bins, highlight, census, etc.)', () => {
  it('drops an option a form elsewhere already writes', () => {
    const result = excludeValidatedUses(stateWith(protocol), subject, options);

    expect(result.map((o) => o.value)).toEqual(['dog']);
  });

  it('keeps the dropped option when it is the currently-selected value', () => {
    const result = excludeValidatedUses(
      stateWith(protocol),
      subject,
      options,
      'cat',
    );

    expect(result.map((o) => o.value)).toEqual(['cat', 'dog']);
  });
});

describe('a conflict-free variable is never dropped in either direction', () => {
  it('keeps a variable used only by a form', () => {
    const formOnly = { ...protocol, stages: [protocol.stages[0]] };

    expect(
      excludeUnvalidatedUses(stateWith(formOnly), subject, options).map(
        (o) => o.value,
      ),
    ).toEqual(['cat', 'dog']);
    expect(
      excludeValidatedUses(stateWith(formOnly), subject, options).map(
        (o) => o.value,
      ),
    ).toEqual(['dog']);
  });

  it('keeps a variable used only by a bin', () => {
    const binOnly = { ...protocol, stages: [protocol.stages[1]] };

    expect(
      excludeValidatedUses(stateWith(binOnly), subject, options).map(
        (o) => o.value,
      ),
    ).toEqual(['cat', 'dog']);
    expect(
      excludeUnvalidatedUses(stateWith(binOnly), subject, options).map(
        (o) => o.value,
      ),
    ).toEqual(['dog']);
  });
});

// Fix round 1 introduced the two follow-up sites (NetworkComposer's own
// quickAdd, and NameGeneratorQuickAdd's quickAdd), reusing `qa` — a text
// variable written both by a form field (validated, stage s1) and by
// NetworkComposer's own quickAdd (unvalidated, stage s3) on the same subject.
//
// Fix round 2: testing each site against the combined (both-hit) `protocol`
// fixture cannot tell a correct implementation from one with the exclusion
// direction swapped — `cat`/`qa` carry BOTH a validated and an unvalidated
// hit, so either direction drops them. Single-hit fixture variants below
// (mirroring the `formOnly`/`binOnly` pattern above) isolate each hit kind so
// a swapped `excludeValidatedUses`/`excludeUnvalidatedUses` call fails.
const validatedOnly = { ...protocol, stages: [protocol.stages[0]] }; // s1 only: cat + qa validated, neither unvalidated
const catUnvalidatedOnly = { ...protocol, stages: [protocol.stages[1]] }; // s2 only: cat unvalidated, not validated; qa has no hits at all
const qaUnvalidatedOnly = { ...protocol, stages: [protocol.stages[2]] }; // s3 only: qa unvalidated, not validated; cat has no hits at all

describe('getConvexHullOptionsForSubject (NodeConfiguration convexHull picker, UNVALIDATED writer)', () => {
  it('drops a categorical variable a form elsewhere already writes', () => {
    const result = getConvexHullOptionsForSubject(
      stateWith(validatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).not.toContain('cat');
  });

  it('keeps a categorical variable only an unvalidated writer elsewhere claims', () => {
    const result = getConvexHullOptionsForSubject(
      stateWith(catUnvalidatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).toContain('cat');
  });

  it('keeps the dropped option when it is the currently-selected value', () => {
    const result = getConvexHullOptionsForSubject(
      stateWith(validatedOnly),
      subject,
      'cat',
    );

    expect(result.map((o) => o.value)).toContain('cat');
  });
});

describe('getComposerQuickAddOptionsForSubject (NetworkComposer quickAdd picker, UNVALIDATED writer)', () => {
  it('drops a text variable a form elsewhere already writes', () => {
    const result = getComposerQuickAddOptionsForSubject(
      stateWith(validatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).not.toContain('qa');
  });

  it('keeps a text variable only an unvalidated writer elsewhere claims', () => {
    const result = getComposerQuickAddOptionsForSubject(
      stateWith(qaUnvalidatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).toContain('qa');
  });

  it('keeps the dropped option when it is the currently-selected value', () => {
    const result = getComposerQuickAddOptionsForSubject(
      stateWith(validatedOnly),
      subject,
      'qa',
    );

    expect(result.map((o) => o.value)).toContain('qa');
  });
});

describe('getQuickAddOptionsForSubject (NameGeneratorQuickAdd picker, VALIDATED writer)', () => {
  it('drops a text variable an unvalidated writer elsewhere already claims', () => {
    const result = getQuickAddOptionsForSubject(
      stateWith(qaUnvalidatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).not.toContain('qa');
  });

  it('keeps a text variable only a form elsewhere already writes', () => {
    const result = getQuickAddOptionsForSubject(
      stateWith(validatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).toContain('qa');
  });

  it('keeps the dropped option when it is the currently-selected value', () => {
    const result = getQuickAddOptionsForSubject(
      stateWith(qaUnvalidatedOnly),
      subject,
      'qa',
    );

    expect(result.map((o) => o.value)).toContain('qa');
  });
});
