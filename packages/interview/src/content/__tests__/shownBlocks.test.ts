import { describe, expect, it } from 'vitest';

import {
  dynamicValueNameFor,
  fieldBlockMarkdown,
  type LogicInputs,
  readContentDocument,
} from '@codaco/protocol-validation';

import { shownBlocks } from '../shownBlocks';

const OUTER = 'c0a8e4b2-1d3f-4e5a-8b6c-7d8e9f0a1b2c';
const INNER = 'c0a8e4b2-1d3f-4e5a-8b6c-7d8e9f0a1b2d';
const condition = (conditionId: string) =>
  dynamicValueNameFor({ kind: 'condition', conditionId });

// Markdown, a logic block whose first version contains markdown, a field and
// another logic block, a field, and markdown again.
const text = [
  'Intro',
  `{${condition(OUTER)}, select, true {Outer met\n\n${fieldBlockMarkdown('first')}\n\n{${condition(INNER)}, select, true {Inner met} other {Inner not met}}} other {Outer not met}}`,
  fieldBlockMarkdown('second'),
  'Outro',
].join('\n\n');

const inputsWhere = (met: readonly string[]): LogicInputs => ({
  conditionMet: (conditionId) => met.includes(conditionId),
  valueOf: () => ({ missing: true }),
  locale: 'en',
});

const shown = (met: readonly string[]) =>
  shownBlocks(readContentDocument(text).nodes, inputsWhere(met)).map((block) =>
    block.kind === 'markdown'
      ? { key: block.key, text: block.value.en }
      : { field: block.fieldId },
  );

describe('shownBlocks', () => {
  // A run's key names its place in the document, through the version shown
  // of each logic block it is in: the interview keys the run's element by
  // it, so the same key must keep meaning the same run.
  it('keys each run of markdown by its place, through the versions shown', () => {
    expect(shown([OUTER])).toEqual([
      { key: '0', text: 'Intro' },
      { key: '1.0.0', text: 'Outer met' },
      { field: 'first' },
      { key: '1.0.2.1.0', text: 'Inner not met' },
      { field: 'second' },
      { key: '3', text: 'Outro' },
    ]);
    expect(shown([OUTER, INNER])).toEqual([
      { key: '0', text: 'Intro' },
      { key: '1.0.0', text: 'Outer met' },
      { field: 'first' },
      { key: '1.0.2.0.0', text: 'Inner met' },
      { field: 'second' },
      { key: '3', text: 'Outro' },
    ]);
  });

  it('gives markdown in another version of a logic block another key', () => {
    expect(shown([])).toEqual([
      { key: '0', text: 'Intro' },
      { key: '1.1.0', text: 'Outer not met' },
      { field: 'second' },
      { key: '3', text: 'Outro' },
    ]);
  });
});
