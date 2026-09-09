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
 * The same protocol with one stage's OWN document left in a shape the schema
 * refuses — an import that dropped a required list, which is exactly the kind
 * of stage a researcher opens this editor to repair.
 *
 * `protocolContextFromSections` reports it and leaves it out of
 * `orderedStages`; the interview's order still names it, and still runs it
 * where the order says.
 */
function contextWithUnreadableStage(
  stageId: string,
  order: readonly string[],
): ProtocolBuilderProtocolContext {
  const sections = fixtureProtocolSections();
  const stageKey = sectionId({ kind: 'stage', stageId });
  const stage = sections[stageKey];
  if (stage === undefined) {
    throw new Error(`The fixture protocol has no "${stageId}" stage.`);
  }
  return protocolContextFromSections({
    ...sections,
    // Every stage the fixture holds has a `label`, and the schema requires a
    // non-empty one, so this is a document the schema refuses whatever the
    // interface — the merge that lost a label, seen from the protocol.
    [stageKey]: { ...stage, label: '' },
    [sectionId({ kind: 'stageOrder' })]: { stages: [...order] },
  });
}

const contextWithUnreadableNarrativePedigree = (
  order: readonly string[],
): ProtocolBuilderProtocolContext =>
  contextWithUnreadableStage('narrative-pedigree-1', order);

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
   * The insertion position is an index in the order the PROTOCOL states, which
   * is the list the host inserts into — and that list names the stages the
   * schema refuses as well as the ones it accepts.
   *
   * Applied straight to the readable stages, a stage the schema cannot read
   * sitting before the insertion point is counted as if it were not there, and
   * the boundary lands one stage too far down the interview: the pedigree the
   * new stage will run BEFORE was offered to it as one it could read, and a
   * stage bound to it draws a family the participant has not been asked about
   * yet.
   */
  it('counts an unreadable stage before the insertion point', () => {
    const context = contextWithUnreadableNarrativePedigree([
      'ego-form-1',
      'narrative-pedigree-1',
      'family-pedigree-1',
    ]);
    // The precondition, asserted rather than assumed: without an unreadable
    // stage in the order this test proves nothing.
    expect(context.orderedStages.map((stage) => stage.id)).toEqual([
      'ego-form-1',
      'family-pedigree-1',
    ]);

    // Inserted between the unreadable stage and the pedigree, the new stage
    // runs first, so the pedigree is not one it may read.
    const before = resolveSourceStages(
      context,
      'not-in-the-order-yet',
      'family-pedigree-1',
      2,
    );
    expect(before.options).toEqual([]);
    expect(before.problem).toBe('afterThisStage');

    // And one position further on it runs after the pedigree, which is then
    // exactly what it may read.
    const after = resolveSourceStages(
      context,
      'not-in-the-order-yet',
      'family-pedigree-1',
      3,
    );
    expect(after.options.map((option) => option.value)).toEqual([
      'family-pedigree-1',
    ]);
    expect(after.problem).toBeNull();
  });

  /**
   * Every pedigree this control offers a NEW stage runs before it, and a stage
   * inserted after them does not move them: their numbers are the ones the
   * timeline already shows.
   *
   * The number is what tells two identically named pedigrees apart, so one
   * that disagrees with the timeline points the researcher at the wrong stage
   * — which is worse than no number at all.
   */
  it('keeps the numbers of the pedigrees a new stage is inserted after', () => {
    const context = contextInOrder(FIXTURE_ORDER);
    const pedigreePosition = FIXTURE_ORDER.indexOf('family-pedigree-1') + 1;

    // Appended at the end of the interview.
    expect(
      resolveSourceStages(
        context,
        'not-in-the-order-yet',
        undefined,
        FIXTURE_ORDER.length,
      ).options,
    ).toEqual([
      {
        value: 'family-pedigree-1',
        label: 'Family Pedigree',
        position: pedigreePosition,
      },
    ]);

    // And inserted immediately after the pedigree, which it displaces
    // downwards without moving anything above it.
    expect(
      resolveSourceStages(
        context,
        'not-in-the-order-yet',
        undefined,
        pedigreePosition,
      ).options.map((option) => option.position),
    ).toEqual([pedigreePosition]);
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

  /**
   * The number is what the researcher matches against the timeline, and the
   * timeline holds every stage the interview RUNS — including one whose own
   * document the schema refuses. Counted in the readable stages alone, a
   * pedigree standing behind an unreadable stage was numbered lower than the
   * stage it names, so the number pointed at a different row of the timeline
   * than the option it labels — which is exactly the mistake it exists to
   * prevent when two pedigrees share a name.
   */
  it('counts the stages nobody can read when numbering a pedigree', () => {
    const order = [
      'ego-form-1',
      'sociogram-1',
      'family-pedigree-1',
      'narrative-pedigree-1',
    ];
    const context = contextWithUnreadableStage('ego-form-1', order);
    // The precondition, asserted rather than assumed: without a stage missing
    // from the readable list the two numberings agree and this proves nothing.
    expect(context.orderedStages.map((stage) => stage.id)).toEqual([
      'sociogram-1',
      'family-pedigree-1',
      'narrative-pedigree-1',
    ]);

    expect(
      resolveSourceStages(context, 'narrative-pedigree-1', 'family-pedigree-1')
        .options,
    ).toEqual([
      {
        value: 'family-pedigree-1',
        label: 'Family Pedigree',
        position: order.indexOf('family-pedigree-1') + 1,
      },
    ]);
  });

  /** And a stage being created reads the same timeline. */
  it('counts them for a stage the host is about to insert', () => {
    const order = ['ego-form-1', 'sociogram-1', 'family-pedigree-1'];
    const context = contextWithUnreadableStage('ego-form-1', order);

    expect(
      resolveSourceStages(
        context,
        'not-in-the-order-yet',
        undefined,
        order.length,
      ).options.map((option) => option.position),
    ).toEqual([order.indexOf('family-pedigree-1') + 1]);
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
