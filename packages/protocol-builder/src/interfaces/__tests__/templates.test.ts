import { describe, expect, it } from 'vitest';

import {
  familyPedigreeWordingIn,
  stageSchema,
} from '@codaco/protocol-validation';

import { STAGE_TYPES } from '../../stage-types.ts';
import { getInterfaceTemplate, newStageFields } from '../templates.ts';

/**
 * The words a Family Pedigree holds only while a configuration asks for them:
 * the wording question and its control, and the gender identity question.
 */
const CONFIGURATION_WORDS = [
  'framingChoiceDescription',
  'framingChoiceTitle',
  'framingControlLabel',
  'genderIdentityLabel',
];

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
      background: { concentricCircles: 4, skewedTowardCenter: false },
    });
    expect(getInterfaceTemplate('NetworkComposer')).toEqual({
      behaviours: { automaticLayout: true },
      background: { concentricCircles: 4, skewedTowardCenter: false },
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
  it('answers the whole circles background for every canvas interface', () => {
    for (const stageType of [
      'Sociogram',
      'Narrative',
      'NetworkComposer',
    ] as const) {
      expect(getInterfaceTemplate(stageType).background, stageType).toEqual({
        concentricCircles: 4,
        skewedTowardCenter: false,
      });
    }
  });

  /**
   * The prompt is the researcher's wording to the participant, so a new
   * pedigree stage starts without one and cannot be saved until it has one.
   */
  it('leaves the family pedigree prompt for the researcher to write', () => {
    expect(getInterfaceTemplate('FamilyPedigree')).not.toHaveProperty('prompt');
    expect(getInterfaceTemplate('FamilyPedigree')).toEqual({});
  });

  /**
   * A narrative pedigree starts reading no pedigree and drawing no disease,
   * with the probabilistic markers off until a researcher asks for them.
   */
  it('starts a narrative pedigree with no source, no diseases, and the at-risk markers off', () => {
    expect(getInterfaceTemplate('NarrativePedigree')).toEqual({
      sourceStageId: '',
      diseases: [],
      showAtRiskStatuses: false,
    });
  });

  it('starts a finish screen as completed', () => {
    expect(getInterfaceTemplate('FinishSession')).toEqual({
      outcome: 'completed',
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
 * like a defect rather than like the nineteen beside it. If a template ever
 * does start covering one of these, this list is what says so.
 */
const STILL_NEEDED: Readonly<Record<string, readonly string[]>> = {
  AlterEdgeForm: ['form', 'introductionPanel', 'subject'],
  AlterForm: ['form', 'introductionPanel', 'subject'],
  Anonymisation: ['explanationText'],
  CategoricalBin: ['prompts', 'subject'],
  DyadCensus: ['introductionPanel', 'prompts', 'subject'],
  EgoForm: ['form', 'introductionPanel'],
  FamilyPedigree: [
    'edgeConfiguration',
    'nodeConfiguration',
    'prompt',
    'subject',
  ],
  // Its closing text is supplied when Architect adds it to a protocol, in
  // each of the protocol's languages; the template holds only the outcome.
  FinishSession: ['content', 'title'],
  Geospatial: ['mapOptions', 'prompts', 'subject'],
  Information: ['items', 'title'],
  // Its choices are the protocol's own languages, so a name is all it needs.
  LanguageChooser: [],
  NameGenerator: ['form', 'prompts', 'subject'],
  NameGeneratorQuickAdd: ['prompts', 'quickAdd', 'subject'],
  NameGeneratorRoster: ['dataSource', 'prompts', 'subject'],
  Narrative: ['presets', 'subject'],
  NarrativePedigree: ['diseases'],
  NetworkComposer: ['layoutVariable', 'quickAdd', 'subject'],
  OneToManyDyadCensus: ['prompts', 'subject'],
  OrdinalBin: ['prompts', 'subject'],
  Sociogram: ['prompts', 'subject'],
  TieStrengthCensus: ['introductionPanel', 'prompts', 'subject'],
};

/** An English protocol, which every supplied wording is written in. */
const ENGLISH = { defaultLocale: 'en', locales: ['en'] };

/**
 * A new stage of `type` in an English protocol, exactly as a stage editor
 * mounts one, plus a name.
 *
 * `CreatingStage` mounts its form on `newStageFields(type, localization)` and
 * submits it through `stageDocument`, which stamps the identity — so this is
 * that composition with nothing in between.
 */
const newStage = (type: (typeof STAGE_TYPES)[number]) => ({
  ...newStageFields(type, ENGLISH),
  type,
  id: 'stage-1',
  label: { en: 'A new stage' },
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
   * A new stage holds its interface's template under its own type, and,
   * where Network Canvas supplies the wording of a setting, that wording:
   * nothing else seeds the form, so what a researcher's new stage holds is
   * what the template map says, plus a roster's panel title, a family
   * pedigree's name question and a finish screen's finishing words. A
   * pedigree's list wording arrives with its completeness requirement, which a
   * new stage does not have. The messages a stage shows a participant are
   * supplied too, where the stage's configuration needs them: a quick-add
   * line always, a roster's messages for its data file, and a map's messages
   * always.
   */
  it.each(STAGE_TYPES)('is the %s template under its stage type', (type) => {
    const { id: _id, label: _label, ...seeded } = newStage(type);
    expect(seeded).toEqual({
      ...getInterfaceTemplate(type),
      ...(type === 'NameGeneratorRoster'
        ? {
            panelTitle: { en: 'Available to add' },
            externalDataError: { en: 'External data could not be loaded.' },
            allAddedNotice: {
              en: 'There is nothing left to add from this list.',
            },
          }
        : {}),
      ...(type === 'NameGeneratorQuickAdd'
        ? { quickAddHint: { en: 'Press Enter when you are finished.' } }
        : {}),
      ...(type === 'Geospatial'
        ? {
            offlineNotice: {
              en: 'You are offline — the map will not load until you reconnect.',
            },
            mapUnavailable: {
              en: 'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
            },
            outsideAreasLabel: { en: 'Outside Selectable Areas' },
          }
        : {}),
      ...(type === 'FinishSession'
        ? {
            finishLabel: { en: 'Finish' },
            finishConfirmation: {
              en: 'Are you sure you want to finish the interview?',
            },
            finishedNotice: {
              en: 'This interview is finished, and its answers can no longer be changed.',
            },
            finishFailed: {
              en: 'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
            },
          }
        : {}),
      ...(type === 'FamilyPedigree'
        ? {
            nodeConfiguration: {
              nameField: {
                prompt: { en: 'Name (optional)' },
                hint: { en: expect.stringContaining('first name') },
              },
            },
            // The words a new stage starts with: all but those a configuration
            // asks for, which a new stage does not yet have.
            wording: Object.fromEntries(
              Object.entries(familyPedigreeWordingIn(['en'])).filter(
                ([key]) => !CONFIGURATION_WORDS.includes(key),
              ),
            ),
          }
        : {}),
      ...(type === 'NetworkComposer'
        ? {
            addNamePlaceholder: { en: 'Type a name, then press Enter' },
            overtakenEditNotice: {
              en: 'Undo or redo changed an answer while you were editing it, so your edit has not been saved. To keep your edit, change that answer again. If you continue, your edit will be lost.',
            },
            tooltips: {
              addPerson: { en: 'Add node' },
              automaticLayout: { en: 'Automatic layout' },
            },
          }
        : {}),
      // The template turns automatic layout on, so its tooltips are asked; no
      // preset highlights, shows edges or groups, and drawing is off.
      ...(type === 'Narrative'
        ? {
            tooltips: {
              pauseLayout: { en: 'Pause automatic layout' },
              resumeLayout: { en: 'Resume automatic layout' },
            },
          }
        : {}),
      ...(type === 'NarrativePedigree'
        ? {
            keyHeading: { en: 'Key' },
            tooltips: {
              clearFocus: { en: 'Clear focus' },
              saveSnapshot: { en: 'Save snapshot' },
            },
            conditionText: {
              heading: { en: 'Conditions' },
              instruction: {
                en: 'Select a condition to see who it affects.',
              },
              notation: {
                affected: { en: 'Has this condition' },
                obligateAffected: { en: 'Will develop this condition' },
                obligateCarrier: { en: 'Carries this condition' },
                unknown: { en: 'Not known' },
              },
              snapshotCondition: { en: '{title}: {condition}' },
              snapshotInheritance: {
                en: '{title}: {condition} — inheritance for {name}',
              },
            },
          }
        : {}),
      type,
    });
  });

  /**
   * The wording is supplied in the protocol's languages, and a panel title is
   * required, so a default language Network Canvas has no wording for holds
   * the English text, for the researcher to translate.
   */
  it('writes a roster’s panel title in the protocol’s languages, in English in a default language with no supplied wording', () => {
    expect(
      newStageFields('NameGeneratorRoster', {
        defaultLocale: 'hu',
        locales: ['hu', 'fr', 'ja'],
      }),
    ).toMatchObject({
      panelTitle: { hu: 'Available to add', fr: 'Éléments disponibles' },
    });
  });

  it.each(STAGE_TYPES)('still needs the listed properties on %s', (type) => {
    expect(refusedProperties(type)).toEqual(STILL_NEEDED[type] ?? []);
  });

  /**
   * Stated once, plainly, because it is what a reader of the list above would
   * otherwise have to work out by scanning it. The day another interface can
   * be saved straight from its template, this fails and someone reads the
   * list. The language chooser is the exception: it has nothing to configure
   * beyond its name. (A finish screen is never made from its template:
   * Architect adds it to a new protocol with the closing text Network Canvas
   * supplies.)
   */
  it('is a saveable stage only for the language chooser', () => {
    const saveable = STAGE_TYPES.filter(
      (type) => stageSchema.safeParse(newStage(type)).success,
    );

    expect(saveable).toEqual(['LanguageChooser']);
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
