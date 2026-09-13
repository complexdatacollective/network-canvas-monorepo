import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { getStageReferenceSite } from '../../schemas/8/stage-reference.ts';
import { getStageSubjectResolution } from '../../schemas/8/stage-subject-resolution.ts';
import { stageSchema } from '../../schemas/8/stages/index.ts';
import {
  collectStageReferences,
  declaredStageReferenceSites,
} from '../collectEntityAttributeReferences.ts';

// Walks the REAL protocol schema, so this covers the walker and the
// `stageReference` tagging of each schema spot together. Stage fixtures are
// minimal: the stage union discriminates on `type`, and the walker only
// descends into reference-bearing fields.
const protocol = {
  schemaVersion: 8,
  stages: [
    {
      id: 'fp',
      type: 'FamilyPedigree',
    },
    {
      id: 'skip-to-stage',
      type: 'Information',
      title: 'About this study',
      skipLogic: {
        action: 'SHOW',
        filter: { rules: [] },
        destination: { type: 'stage', stageId: 'fp' },
      },
    },
    {
      id: 'skip-to-finish',
      type: 'Information',
      title: 'Nearly done',
      skipLogic: {
        action: 'SKIP',
        filter: { rules: [] },
        destination: { type: 'finish' },
      },
    },
    {
      id: 'np',
      type: 'NarrativePedigree',
      sourceStageId: 'fp',
    },
  ],
};

describe('collectStageReferences', () => {
  it('finds every stage a protocol names, from the schema tags alone', () => {
    expect(
      collectStageReferences(protocol).map((hit) => ({
        stageId: hit.stageId,
        site: hit.site,
        path: hit.path.join('.'),
      })),
    ).toEqual([
      {
        stageId: 'fp',
        site: 'skipLogic.destination.stageId',
        path: 'stages.1.skipLogic.destination.stageId',
      },
      { stageId: 'fp', site: 'sourceStageId', path: 'stages.3.sourceStageId' },
    ]);
  });

  /**
   * The whole point of deriving this from the schema: a destination is a stage
   * id on the `stage` branch and a literal end-of-interview on the `finish`
   * branch. A consumer working from a path list could not tell them apart, and
   * would refuse to delete a stage over a skip that goes nowhere near it.
   */
  it('reports nothing for a skip destination that is not a stage', () => {
    expect(
      collectStageReferences({
        schemaVersion: 8,
        stages: [protocol.stages[2]],
      }),
    ).toEqual([]);
  });

  it('finds nothing in a protocol that names no stages', () => {
    expect(collectStageReferences({ schemaVersion: 8, stages: [] })).toEqual(
      [],
    );
    expect(collectStageReferences(undefined)).toEqual([]);
  });
});

describe('declaredStageReferenceSites', () => {
  /**
   * The inventory a consumer enumerating the kinds it has to handle is handed.
   * Update it deliberately when a stage type gains or loses a reference to
   * another stage: the number moving is what tells that consumer's own
   * enumeration to grow a case.
   */
  it('is every site the current schema declares', () => {
    expect(declaredStageReferenceSites().toSorted()).toEqual([
      'skipLogic.destination.stageId',
      'sourceStageId',
    ]);
  });

  /**
   * A site registers as the module declaring it loads, so the registry on its
   * own answers for whatever happened to be imported first — nothing, in a
   * consumer that only ever asks this question. Reading it through the
   * collector is what makes the answer the schema's rather than the import
   * order's.
   */
  it('answers for the schema, where the registry alone answers for the imports', async () => {
    vi.resetModules();
    const registry = await import('../../schemas/8/stage-reference.ts');
    expect(registry.registeredStageReferenceSites()).toEqual([]);

    const fresh = await import('../collectEntityAttributeReferences.ts');
    expect(fresh.declaredStageReferenceSites().toSorted()).toEqual(
      declaredStageReferenceSites().toSorted(),
    );
  });
});

/**
 * A stage whose SUBJECT comes from another stage holds that stage's id, so the
 * field is a stage reference whether or not anybody remembered to tag it.
 * Untagged, the stage is invisible to `collectStageReferences`, and a host
 * deleting the stage it points at would leave a protocol naming a stage it no
 * longer has.
 */
describe('every stage that points at another stage is tagged', () => {
  const fieldOf = (
    option: z.ZodObject<z.ZodRawShape>,
    name: string,
  ): z.ZodType | undefined => {
    const field: unknown = option.shape[name];
    return field instanceof z.ZodType ? field : undefined;
  };

  it.each(
    stageSchema.options.map((option) => {
      const typeField: unknown = option.shape.type;
      const name =
        typeField instanceof z.ZodLiteral
          ? String([...typeField.values][0])
          : 'unknown';
      return [name, option] as const;
    }),
  )('%s tags the field its subject resolution reads', (_name, option) => {
    const resolution = getStageSubjectResolution(option);
    if (resolution?.from !== 'stageRef') return;
    const field = fieldOf(option, resolution.stageRef);
    expect(field && getStageReferenceSite(field)).toBe(resolution.stageRef);
  });
});
