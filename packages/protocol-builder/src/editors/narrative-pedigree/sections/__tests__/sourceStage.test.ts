import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  protocolContextFromSections,
  type ProtocolBuilderProtocolContext,
} from '../../../../protocol-context.ts';
import { fixtureProtocolSections } from '../../../../testing/protocolFixture.ts';
import {
  diseaseMarksNobody,
  resolveSourceStages,
  sourceStageNodeType,
  sourceStageRecordedVariables,
} from '../sourceStage.ts';

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

    // Numbered as the researcher will see it in the interview, because two
    // pedigrees may carry the same name.
    expect(options).toEqual([
      { value: 'family-pedigree-1', label: 'Family Pedigree', position: 3 },
    ]);
    expect(problem).toBeNull();
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

describe('the attributes the source pedigree records', () => {
  /**
   * A nomination prompt is the one place a Family Pedigree writes a boolean
   * onto a family member, so it is the whole of what a disease may read.
   */
  it('is what its nomination prompts write', () => {
    expect([
      ...sourceStageRecordedVariables(
        contextInOrder(FIXTURE_ORDER),
        'family-pedigree-1',
      ),
    ]).toEqual(['hasConditionX']);
  });

  it('is nothing at all when the source cannot be resolved', () => {
    const context = contextInOrder(FIXTURE_ORDER);

    expect(sourceStageRecordedVariables(context, 'sociogram-1').size).toBe(0);
    expect(sourceStageRecordedVariables(context, 'no-such-stage').size).toBe(0);
    expect(sourceStageRecordedVariables(context, undefined).size).toBe(0);
  });
});

describe('a disease that would mark nobody', () => {
  const recorded = new Set(['hasConditionX']);

  it('is one mapping an attribute nothing records', () => {
    expect(diseaseMarksNobody({ variable: 'biologicalSex' }, recorded)).toBe(
      true,
    );
  });

  it('is not one mapping an attribute a nomination prompt writes', () => {
    expect(diseaseMarksNobody({ variable: 'hasConditionX' }, recorded)).toBe(
      false,
    );
  });

  /**
   * An unfinished row is what `required` reports; complaining that a blank
   * marks nobody would put two refusals on one empty control.
   */
  it('is not an unfinished row, or something that is not a row at all', () => {
    expect(diseaseMarksNobody({ variable: '' }, recorded)).toBe(false);
    expect(diseaseMarksNobody({}, recorded)).toBe(false);
    expect(diseaseMarksNobody(null, recorded)).toBe(false);
    expect(diseaseMarksNobody(['hasConditionZ'], recorded)).toBe(false);
  });
});
