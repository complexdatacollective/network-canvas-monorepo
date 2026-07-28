import { describe, expect, it } from 'vitest';

import { getAdditionalAttributesOptionsForSubject } from '~/components/AssignAttributes/AssignAttributes';
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
// node-type subject. `qa` extends this for the two VALIDATED quickAdd sites
// below: a text variable written both by a form field (validated, s1) and by
// FamilyPedigree's nodeLabelVariable (unvalidated, s3), on the same subject.
//
// Composer scope-change consequentials: NetworkComposer's OWN quickAdd used
// to stand in for `qa`'s unvalidated hit here, but it is now a VALIDATED
// writer (network-composer.ts), so it can no longer produce one — s3 is
// FamilyPedigree's nodeLabelVariable instead, the same text-typed unvalidated
// writer NodeConfiguration.crossClassGate.test.tsx uses for the same reason.
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
      type: 'FamilyPedigree',
      label: 'P',
      nodeConfig: { type: 'person', nodeLabelVariable: 'qa' },
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

// Fix round 1 introduced the follow-up quickAdd sites; testing each against
// the combined (both-hit) `protocol` fixture cannot tell a correct
// implementation from one with the exclusion direction swapped — `qa`
// carries BOTH a validated and an unvalidated hit, so either direction drops
// it. The single-hit fixture variant below (mirroring the `formOnly`/
// `binOnly` pattern above) isolates each hit kind so a swapped
// `excludeValidatedUses`/`excludeUnvalidatedUses` call fails.
const validatedOnly = { ...protocol, stages: [protocol.stages[0]] }; // s1 only: cat + qa validated, neither unvalidated
const qaUnvalidatedOnly = { ...protocol, stages: [protocol.stages[2]] }; // s3 only: qa unvalidated (FamilyPedigree nodeLabelVariable), not validated; cat has no hits at all

// Composer scope-change consequentials: convexHullVariable lost its usage tag
// entirely (network-composer.ts) — a grouping/display slot, not an attribute
// writer — so its picker must never restrict, or be restricted by, a
// variable's use elsewhere. Every categorical variable for the subject is
// offered unconditionally, regardless of the role map.
describe('getConvexHullOptionsForSubject (NodeConfiguration convexHull picker, UNTAGGED — unrestricted)', () => {
  it('never drops a categorical variable, even one both validated and unvalidated elsewhere', () => {
    const result = getConvexHullOptionsForSubject(stateWith(protocol), {
      entity: subject.entity,
      type: subject.type,
    });

    expect(result.map((o) => o.value)).toContain('cat');
  });

  it('returns every categorical variable for the subject, unfiltered by role', () => {
    const result = getConvexHullOptionsForSubject(stateWith(validatedOnly), {
      entity: subject.entity,
      type: subject.type,
    });

    expect(result.map((o) => o.value)).toEqual(['cat']);
  });
});

// Composer scope-change consequentials: NetworkComposer's own quickAdd is now
// a VALIDATED writer (its interview input honours codebook validation —
// network-composer.ts), so its picker flips to `excludeUnvalidatedUses` and
// mirrors NameGeneratorQuickAdd's `getQuickAddOptionsForSubject` block below
// exactly.
describe('getComposerQuickAddOptionsForSubject (NetworkComposer quickAdd picker, VALIDATED writer)', () => {
  it('drops a text variable an unvalidated writer elsewhere already claims', () => {
    const result = getComposerQuickAddOptionsForSubject(
      stateWith(qaUnvalidatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).not.toContain('qa');
  });

  it('keeps a text variable only a form elsewhere already writes', () => {
    const result = getComposerQuickAddOptionsForSubject(
      stateWith(validatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).toContain('qa');
  });

  it('keeps the dropped option when it is the currently-selected value', () => {
    const result = getComposerQuickAddOptionsForSubject(
      stateWith(qaUnvalidatedOnly),
      subject,
      'qa',
    );

    expect(result.map((o) => o.value)).toContain('qa');
  });
});

// Final-review sweep: additionalAttributes stamps (NameGenerator,
// NameGeneratorQuickAdd, NameGeneratorRoster prompt editors) are UNVALIDATED
// writers, so their shared row pool excludes in the OPPOSITE direction to the
// quickAdd blocks below — and its escape is the multi-row committed set, not
// a single currentValue.
describe('getAdditionalAttributesOptionsForSubject (AssignAttributes pool, UNVALIDATED writer)', () => {
  it('drops a variable a form elsewhere already validates', () => {
    const result = getAdditionalAttributesOptionsForSubject(
      stateWith(validatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).not.toContain('qa');
    expect(result.map((o) => o.value)).not.toContain('cat');
  });

  it('keeps a variable only an unvalidated writer elsewhere already claims', () => {
    const result = getAdditionalAttributesOptionsForSubject(
      stateWith(qaUnvalidatedOnly),
      subject,
    );

    expect(result.map((o) => o.value)).toContain('qa');
  });

  it('keeps every committed row value offered while still dropping other conflicted options', () => {
    const result = getAdditionalAttributesOptionsForSubject(
      stateWith(validatedOnly),
      subject,
      ['qa'],
    );

    expect(result.map((o) => o.value)).toContain('qa');
    expect(result.map((o) => o.value)).not.toContain('cat');
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
