import { beforeEach, describe, expect, it } from 'vitest';

import type { DyadCensusMetadataItem } from '@codaco/shared-consts';

import type { SessionEngine } from '../../session-engine/engine';
import {
  censusAnswers,
  clearCensusAnswer,
  recordCensusAnswer,
} from '../shared/censusMetadata';
import { harnessFor, parseProtocol } from './harness';

/**
 * The replacement rule a census answer follows, exercised directly.
 *
 * A simulated participant answers each pair once, so a walk never re-answers
 * one and the replacement below never fires during generation. It is still the
 * rule the interfaces follow, and the rule a resumed or revisited census
 * depends on, so it is pinned here rather than left to a path no fixture
 * reaches — a guard that cannot fail proves nothing.
 */

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { name: { name: 'name', type: 'text', component: 'Text' } },
    },
  },
  edge: { friend: { name: 'friend', color: 'edge-color-seq-1' } },
};

const CENSUS_STAGE = {
  id: 'census',
  type: 'DyadCensus',
  label: 'Census',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'Pairs', text: 'About each pair of people.' },
  prompts: [
    { id: 'p-one', text: 'One?', createEdge: 'friend' },
    { id: 'p-two', text: 'Two?', createEdge: 'friend' },
  ],
};

const CURRENT_STEP = 0;

let engine: SessionEngine;

beforeEach(() => {
  engine = harnessFor(parseProtocol(CODEBOOK, [CENSUS_STAGE])).engine;
});

const answer = (
  promptIndex: number,
  pair: readonly [string, string],
  present: boolean,
): void =>
  recordCensusAnswer({
    engine,
    currentStep: CURRENT_STEP,
    promptIndex,
    pair,
    present,
  });

const ledger = (): DyadCensusMetadataItem[] =>
  censusAnswers(engine, CURRENT_STEP) ?? [];

describe('censusAnswers', () => {
  it('reports nothing for a stage that has recorded nothing', () => {
    expect(censusAnswers(engine, CURRENT_STEP)).toBeNull();
  });

  it('reports nothing for a stage whose metadata is not a census ledger', () => {
    engine.updateStageMetadata({
      currentStep: CURRENT_STEP,
      metadata: { automaticLayout: true },
    });

    expect(censusAnswers(engine, CURRENT_STEP)).toBeNull();
  });
});

describe('recordCensusAnswer', () => {
  it('appends an answer', () => {
    answer(0, ['a', 'b'], true);

    expect(ledger()).toEqual([[0, 'a', 'b', true]]);
  });

  it('replaces this prompt’s earlier answer for the same pair', () => {
    answer(0, ['a', 'b'], true);
    answer(0, ['a', 'b'], false);

    expect(ledger()).toEqual([[0, 'a', 'b', false]]);
  });

  it('replaces it however the pair is written round', () => {
    // The pair is unordered, so a re-answer arriving the other way round is
    // the same answer being changed rather than a second one.
    answer(0, ['a', 'b'], true);
    answer(0, ['b', 'a'], false);

    expect(ledger()).toEqual([[0, 'b', 'a', false]]);
  });

  it('leaves another prompt’s answer for the same pair alone', () => {
    answer(0, ['a', 'b'], true);
    answer(1, ['a', 'b'], false);

    expect(ledger()).toEqual([
      [0, 'a', 'b', true],
      [1, 'a', 'b', false],
    ]);
  });

  it('leaves this prompt’s answers for other pairs alone', () => {
    answer(0, ['a', 'b'], true);
    answer(0, ['a', 'c'], false);
    answer(0, ['a', 'b'], false);

    expect(ledger()).toEqual([
      [0, 'a', 'c', false],
      [0, 'a', 'b', false],
    ]);
  });

  it('keeps each stage’s ledger to itself', () => {
    answer(0, ['a', 'b'], true);

    expect(Object.keys(engine.draft.stageMetadata)).toEqual([
      String(CURRENT_STEP),
    ]);
  });
});

describe('clearCensusAnswer', () => {
  it('withdraws only this prompt’s answer for the pair', () => {
    answer(0, ['a', 'b'], false);
    answer(0, ['a', 'c'], false);
    answer(1, ['a', 'b'], false);

    clearCensusAnswer({
      engine,
      currentStep: CURRENT_STEP,
      promptIndex: 0,
      pair: ['b', 'a'],
    });

    expect(ledger()).toEqual([
      [0, 'a', 'c', false],
      [1, 'a', 'b', false],
    ]);
  });

  it('creates no ledger for a stage that has recorded nothing', () => {
    clearCensusAnswer({
      engine,
      currentStep: CURRENT_STEP,
      promptIndex: 0,
      pair: ['a', 'b'],
    });

    expect(engine.draft.stageMetadata).toEqual({});
  });
});
