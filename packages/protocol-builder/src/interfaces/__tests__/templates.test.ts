import { describe, expect, it } from 'vitest';

import { stageSchema } from '@codaco/protocol-validation';

import { STAGE_TYPES } from '../../stage-types.ts';
import { getInterfaceTemplate } from '../templates.ts';

describe('getInterfaceTemplate', () => {
  it('answers with a template object for every stage type', () => {
    expect(STAGE_TYPES.length).toBeGreaterThan(0);
    for (const stageType of STAGE_TYPES) {
      const template = getInterfaceTemplate(stageType);
      expect(template, stageType).toBeTypeOf('object');
      expect(Array.isArray(template), stageType).toBe(false);
    }
  });

  it('answers with an empty template for an interface that authors no defaults', () => {
    expect(getInterfaceTemplate('NameGenerator')).toEqual({});
    // The three form interfaces used to be listed in the map holding `{}`,
    // which reads as a template whose contents went missing rather than as an
    // interface with no defaults to give. They are unlisted now, and answer
    // the same thing. What they still need is the subject of the second
    // describe below.
    expect(getInterfaceTemplate('AlterForm')).toEqual({});
    expect(getInterfaceTemplate('AlterEdgeForm')).toEqual({});
    expect(getInterfaceTemplate('EgoForm')).toEqual({});
  });

  /**
   * These are the authored defaults, not schema defaults: leaving one unset
   * produces a schema-valid stage that behaves differently from the interface
   * a researcher chose. `automaticLayout` in particular is load-bearing for
   * Architect's e2e protocol normalizer, which treats a persisted
   * `automaticLayout: false` as equivalent to the key being absent precisely
   * because the template seeds `true`.
   */
  it('seeds the layout and consideration behaviours their interfaces are designed around', () => {
    expect(getInterfaceTemplate('Narrative')).toEqual({
      behaviours: { allowRepositioning: true, automaticLayout: true },
      background: { skewedTowardCenter: false },
    });
    expect(getInterfaceTemplate('NetworkComposer')).toEqual({
      behaviours: { automaticLayout: true },
      background: { skewedTowardCenter: false },
    });
    expect(getInterfaceTemplate('OneToManyDyadCensus')).toEqual({
      behaviours: { removeAfterConsideration: true },
    });
  });

  /**
   * The one template entry that exists because absence and `false` are NOT the
   * same stage: `ConcentricCircles` defaults `skewed` to `true`, so a canvas
   * saved with no answer to the toggle draws the skew the editor showed
   * switched off.
   */
  it('answers the concentric-circles skew for every canvas interface', () => {
    for (const stageType of [
      'Sociogram',
      'Narrative',
      'NetworkComposer',
    ] as const) {
      expect(getInterfaceTemplate(stageType).background, stageType).toEqual({
        skewedTowardCenter: false,
      });
    }
  });

  it('seeds the pedigree interfaces with their framing, boundaries and intro copy', () => {
    const familyPedigree = getInterfaceTemplate('FamilyPedigree');
    expect(familyPedigree.framing).toEqual({ mode: 'fixed', value: 'gamete' });
    expect(familyPedigree.boundaries).toEqual({
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    });
    // The intro screen is a content list, so assert its shape rather than
    // restating the researcher-facing copy here.
    expect(familyPedigree.introScreen).toMatchObject({
      items: [{ id: 'intro-text', type: 'text' }],
    });
    const introItems = (
      familyPedigree.introScreen as { items: { content: string }[] }
    ).items;
    expect(introItems[0]?.content.trim()).not.toBe('');

    expect(getInterfaceTemplate('NarrativePedigree')).toEqual({
      sourceStageId: '',
      diseases: [],
      showAtRiskStatuses: false,
    });
  });
});

/**
 * What each interface still needs from a researcher, keyed by the top-level
 * property the schema refuses.
 *
 * The answer to "does a template produce a stage that can be saved?", written
 * down for every interface rather than asked about one. It is `subject`,
 * `prompts`, `form`, `introductionPanel` and their kin all the way down: the
 * node type a stage works with, the questions it asks, the words a participant
 * reads. None of that is a default a template could hold — one that invented
 * it would be authoring the study — so the sections of the editor are what
 * fill a stage in, and no template is a head start on a saveable stage.
 *
 * Written down because the alternative is discovering the same fact one
 * interface at a time, which is how `AlterForm`'s empty template came to look
 * like a defect rather than like the eighteen beside it. If a template ever
 * does start covering one of these, this list is what says so.
 */
const STILL_NEEDED: Readonly<Record<string, readonly string[]>> = {
  AlterEdgeForm: ['form', 'introductionPanel', 'subject'],
  AlterForm: ['form', 'introductionPanel', 'subject'],
  Anonymisation: ['explanationText'],
  CategoricalBin: ['prompts', 'subject'],
  DyadCensus: ['introductionPanel', 'prompts', 'subject'],
  EgoForm: ['form', 'introductionPanel'],
  FamilyPedigree: ['censusPrompt', 'edgeConfig', 'nodeConfig'],
  Geospatial: ['mapOptions', 'prompts', 'subject'],
  Information: ['items', 'title'],
  NameGenerator: ['form', 'prompts', 'subject'],
  NameGeneratorQuickAdd: ['prompts', 'quickAdd', 'subject'],
  NameGeneratorRoster: ['dataSource', 'prompts', 'subject'],
  Narrative: ['background', 'presets', 'subject'],
  // Its template DOES set `diseases: []`, and the schema wants at least one —
  // so this key is present and still refused, which is a different thing from
  // the absences above and worth being able to tell apart.
  NarrativePedigree: ['diseases'],
  NetworkComposer: ['background', 'layoutVariable', 'quickAdd', 'subject'],
  OneToManyDyadCensus: ['prompts', 'subject'],
  OrdinalBin: ['prompts', 'subject'],
  Sociogram: ['background', 'prompts', 'subject'],
  TieStrengthCensus: ['introductionPanel', 'prompts', 'subject'],
};

/**
 * A new stage of `type`, exactly as a stage editor mounts one, plus a name.
 *
 * `CreatingStage` mounts its form on `{ ...getInterfaceTemplate(type) }` and
 * submits it through `stageDocument`, which stamps the identity — so this is
 * that composition with nothing in between.
 */
const newStage = (type: (typeof STAGE_TYPES)[number]) => ({
  ...getInterfaceTemplate(type),
  type,
  id: 'stage-1',
  label: 'A new stage',
});

/** The top-level properties the schema refuses, in a stable order. */
const refusedProperties = (
  type: (typeof STAGE_TYPES)[number],
): readonly string[] => {
  const parsed = stageSchema.safeParse(newStage(type));
  if (parsed.success) return [];
  return [
    ...new Set(
      parsed.error.issues.flatMap((issue) =>
        typeof issue.path[0] === 'string' ? [issue.path[0]] : [],
      ),
    ),
  ].toSorted();
};

describe('a new stage given nothing but a name', () => {
  /**
   * A new stage holds its interface's template under its own type, and
   * nothing else: the template is the only thing a create seeds the form
   * with, so what a researcher's new stage holds is what this map says.
   */
  it.each(STAGE_TYPES)('is the %s template under its stage type', (type) => {
    const { id: _id, label: _label, ...seeded } = newStage(type);
    expect(seeded).toEqual({ ...getInterfaceTemplate(type), type });
  });

  it.each(STAGE_TYPES)('still needs the listed properties on %s', (type) => {
    expect(refusedProperties(type)).toEqual(STILL_NEEDED[type] ?? []);
  });

  /**
   * Stated once, plainly, because it is what a reader of the list above would
   * otherwise have to work out by scanning it. The day an interface can be
   * saved straight from its template, this fails and someone reads the list.
   */
  it('is not a saveable stage for any interface', () => {
    const saveable = STAGE_TYPES.filter(
      (type) => stageSchema.safeParse(newStage(type)).success,
    );

    expect(saveable).toEqual([]);
  });

  /**
   * The control. `id` and `label` are the two the harness supplies, and if
   * either were not reaching the schema then every interface would be refused
   * for a reason that has nothing to do with its template — the lists above
   * would still be exact, and would be measuring the wrong thing.
   */
  it('is refused for what its interface needs, not for the name itself', () => {
    for (const type of STAGE_TYPES) {
      expect(refusedProperties(type)).not.toContain('id');
      expect(refusedProperties(type)).not.toContain('label');
    }

    const { label: _label, ...unnamed } = newStage('Information');
    const parsed = stageSchema.safeParse(unnamed);
    expect(
      parsed.success
        ? []
        : parsed.error.issues.map((issue) => issue.path.join('.')),
    ).toContain('label');
  });
});
