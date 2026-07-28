import { describe, expect, it } from 'vitest';

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
// node-type subject.
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
      form: { fields: [{ variable: 'cat', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
  ],
};

const subject = { entity: 'node', type: 'person' };
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
