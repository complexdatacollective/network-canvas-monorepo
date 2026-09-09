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

/**
 * The same protocol with the narrative pedigree's OWN document left in a shape
 * the schema refuses — an import that dropped its diseases, which is exactly
 * the stage a researcher opens this editor to repair.
 *
 * `protocolContextFromSections` reports it and leaves it out of
 * `orderedStages`; the interview's order still names it, and still runs it
 * where the order says.
 */
function contextWithUnreadableNarrativePedigree(
  order: readonly string[],
): ProtocolBuilderProtocolContext {
  const sections = fixtureProtocolSections();
  const stageKey = sectionId({
    kind: 'stage',
    stageId: 'narrative-pedigree-1',
  });
  const stage = sections[stageKey];
  if (stage === undefined) {
    throw new Error(
      'The fixture protocol has no "narrative-pedigree-1" stage.',
    );
  }
  return protocolContextFromSections({
    ...sections,
    [stageKey]: { ...stage, diseases: [] },
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

    // Numbered by where it runs, so two pedigrees a researcher gave one name
    // can still be told apart.
    expect(options).toEqual([
      {
        value: 'family-pedigree-1',
        label: 'Family Pedigree',
        position: FIXTURE_ORDER.indexOf('family-pedigree-1') + 1,
      },
    ]);
    expect(problem).toBeNull();
  });

  /**
   * The protocol schema requires a stage label to be non-empty and does NOT
   * require it to be unique, and researchers rename generated names — so two
   * Family Pedigree stages can carry one name while collecting different
   * families. Offered by name alone they are two identical rows, and choosing
   * the wrong one binds this stage to the wrong family with nothing, then or
   * later, to say so. Each carries where it runs, which is what the section
   * puts in front of the researcher and what the skip-logic destination
   * control shows for the same reason.
   */
  it('tells two pedigrees that share a name apart by where they run', () => {
    const sections = fixtureProtocolSections();
    const pedigreeKey = sectionId({
      kind: 'stage',
      stageId: 'family-pedigree-1',
    });
    const pedigree = sections[pedigreeKey];
    if (pedigree === undefined) {
      throw new Error('The fixture protocol has no "family-pedigree-1" stage.');
    }
    const twin = 'family-pedigree-2';
    const context = protocolContextFromSections({
      ...sections,
      [sectionId({ kind: 'stage', stageId: twin })]: { ...pedigree, id: twin },
      [sectionId({ kind: 'stageOrder' })]: {
        stages: ['family-pedigree-1', twin, 'narrative-pedigree-1'],
      },
    });

    const { options } = resolveSourceStages(
      context,
      'narrative-pedigree-1',
      'family-pedigree-1',
    );

    // The same name, deliberately: that is the protocol this rule is about.
    expect(options.map((option) => option.label)).toEqual([
      'Family Pedigree',
      'Family Pedigree',
    ]);
    expect(options).toEqual([
      { value: 'family-pedigree-1', label: 'Family Pedigree', position: 1 },
      { value: twin, label: 'Family Pedigree', position: 2 },
    ]);
  });

  /**
   * A stage being created is not in the interview's order yet, and a host that
   * appends puts it at the end — so with nowhere named, every pedigree already
   * in the interview precedes it. Treating it as first instead would offer a
   * new narrative pedigree nothing at all to read.
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

  /**
   * And where the host says it is going, that is where it goes. A stage being
   * inserted ahead of the only pedigree in the interview runs BEFORE it, so
   * that pedigree's family has not been collected when this stage would draw
   * it — which is the same exclusion an existing stage above it gets.
   */
  it('offers a stage being created only the pedigrees it will run after', () => {
    const context = contextInOrder(FIXTURE_ORDER);
    const pedigreeIndex = FIXTURE_ORDER.indexOf('family-pedigree-1');

    expect(
      resolveSourceStages(context, 'not-in-the-order-yet', undefined, 0)
        .options,
    ).toEqual([]);
    // Inserted AT the pedigree's index, the new stage displaces it downwards
    // and still runs first.
    expect(
      resolveSourceStages(
        context,
        'not-in-the-order-yet',
        undefined,
        pedigreeIndex,
      ).options,
    ).toEqual([]);
    expect(
      resolveSourceStages(
        context,
        'not-in-the-order-yet',
        undefined,
        pedigreeIndex + 1,
      ).options.map((option) => option.value),
    ).toEqual(['family-pedigree-1']);
  });

  /**
   * The same rule seen from the stored choice: a pedigree that will run after
   * the stage being created is the problem it is for an existing stage, not a
   * choice silently left standing.
   */
  it('reports a source that will run after the stage being created', () => {
    const { options, problem } = resolveSourceStages(
      contextInOrder(FIXTURE_ORDER),
      'not-in-the-order-yet',
      'family-pedigree-1',
      0,
    );

    expect(problem).toBe('afterThisStage');
    expect(options).toEqual([]);
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

  /**
   * A stage the schema refuses is still a stage the interview RUNS, and where
   * it runs is what decides which pedigrees precede it.
   *
   * `orderedStages` holds only the stages that could be read, so an
   * existing-but-invalid one is missing from it — and, read from that list
   * alone, it looked like a stage the interview does not contain, which is
   * placed as a new one arriving at the end. Every pedigree in the interview
   * was then offered to it, including the one that runs after it, and the
   * stored choice of that pedigree had nothing wrong with it. Repair the rest
   * of the stage and the save takes an order the interview cannot execute.
   */
  it('keeps the place of an existing stage the schema refuses', () => {
    const context = contextWithUnreadableNarrativePedigree([
      'ego-form-1',
      'narrative-pedigree-1',
      'family-pedigree-1',
    ]);
    // The precondition, asserted rather than assumed: without it this test
    // would pass on the ordinary path and prove nothing.
    expect(context.orderedStages.map((stage) => stage.id)).not.toContain(
      'narrative-pedigree-1',
    );

    const { options, problem } = resolveSourceStages(
      context,
      'narrative-pedigree-1',
      'family-pedigree-1',
    );

    expect(options).toEqual([]);
    expect(problem).toBe('afterThisStage');
  });

  /** And the pedigrees that really do precede it are still offered. */
  it('offers an unreadable stage the pedigrees that run before it', () => {
    const { options, problem } = resolveSourceStages(
      contextWithUnreadableNarrativePedigree(FIXTURE_ORDER),
      'narrative-pedigree-1',
      'family-pedigree-1',
    );

    expect(options.map((option) => option.value)).toEqual([
      'family-pedigree-1',
    ]);
    expect(problem).toBeNull();
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
