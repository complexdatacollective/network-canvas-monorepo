import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  protocolContextFromSections,
  type ProtocolBuilderProtocolContext,
} from '../../../protocol-context.ts';
import { fixtureProtocolSections } from '../../../testing/protocolFixture.ts';
import { resolveSourceStages, sourceStageNodeType } from '../sourceStage.ts';

/**
 * The shared protocol, in whatever interview order the test needs.
 *
 * Built from the fixture's own sections rather than from hand-written stages,
 * so what these rules are asked about is a protocol the schema accepts — and
 * so a fixture that stops holding a Family Pedigree fails here rather than
 * quietly making every exclusion below vacuous.
 */
function contextInOrder(
  order: readonly string[],
): ProtocolBuilderProtocolContext {
  return protocolContextFromSections({
    ...fixtureProtocolSections(),
    [sectionId({ kind: 'stageOrder' })]: { stages: [...order] },
  });
}

const FIXTURE_ORDER = [
  'ego-form-1',
  'sociogram-1',
  'family-pedigree-1',
  'narrative-pedigree-1',
];

describe('the pedigrees a narrative pedigree may read', () => {
  it('offers the Family Pedigree stages that run before it', () => {
    const { options, problem } = resolveSourceStages(
      contextInOrder(FIXTURE_ORDER),
      'narrative-pedigree-1',
      'family-pedigree-1',
    );

    expect(options).toEqual([
      { value: 'family-pedigree-1', label: 'Family Pedigree' },
    ]);
    expect(problem).toBeNull();
  });

  /**
   * A stage being created is not in the interview's order yet, and every
   * pedigree already in it therefore precedes it. Treating it as first instead
   * would offer a new narrative pedigree nothing at all to read.
   */
  it('treats a stage the order does not list as running last', () => {
    const { options, problem } = resolveSourceStages(
      contextInOrder(FIXTURE_ORDER),
      'not-in-the-order-yet',
      undefined,
    );

    expect(options.map((option) => option.value)).toEqual([
      'family-pedigree-1',
    ]);
    expect(problem).toBeNull();
  });

  it('reports a source that now runs after this stage', () => {
    const { options, problem } = resolveSourceStages(
      // The researcher — or a collaborator — moved the pedigree below the
      // stage that reads it, so the family would still be empty.
      contextInOrder([
        'ego-form-1',
        'narrative-pedigree-1',
        'family-pedigree-1',
      ]),
      'narrative-pedigree-1',
      'family-pedigree-1',
    );

    expect(problem).toBe('afterThisStage');
    // And nothing is offered in its place, because nothing qualifies.
    expect(options).toEqual([]);
  });

  it('reports a source that has left the interview', () => {
    const { problem } = resolveSourceStages(
      contextInOrder(['family-pedigree-1', 'narrative-pedigree-1']),
      'narrative-pedigree-1',
      'a-pedigree-that-was-deleted',
    );

    expect(problem).toBe('missing');
  });

  it('reports a source whose interface is no longer a pedigree', () => {
    const { problem } = resolveSourceStages(
      contextInOrder(FIXTURE_ORDER),
      'narrative-pedigree-1',
      'sociogram-1',
    );

    expect(problem).toBe('notAPedigree');
  });

  it('says nothing is wrong when nothing has been chosen', () => {
    const { problem } = resolveSourceStages(
      contextInOrder(FIXTURE_ORDER),
      'narrative-pedigree-1',
      undefined,
    );

    expect(problem).toBeNull();
  });
});

describe('the node type a narrative pedigree describes', () => {
  it('is the source pedigree’s own alter type', () => {
    expect(
      sourceStageNodeType(contextInOrder(FIXTURE_ORDER), 'family-pedigree-1'),
    ).toBe('family_member');
  });

  it('is nothing at all when the source cannot be resolved', () => {
    const context = contextInOrder(FIXTURE_ORDER);

    expect(sourceStageNodeType(context, 'sociogram-1')).toBeUndefined();
    expect(sourceStageNodeType(context, 'no-such-stage')).toBeUndefined();
    expect(sourceStageNodeType(context, undefined)).toBeUndefined();
  });
});
