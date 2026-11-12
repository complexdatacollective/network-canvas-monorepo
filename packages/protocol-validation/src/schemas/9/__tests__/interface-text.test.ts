import { describe, expect, it } from 'vitest';

import { collectLocalizedStrings } from '../../../utils/collectLocalizedStrings.ts';
import {
  INTERFACE_TEXT_MESSAGES,
  InterfaceTextSchema,
  interfaceTextAfterLanguageChange,
  interfaceTextFor,
  interfaceTextShown,
  interfaceTextShownBy,
  suppliedInterfaceText,
  withInterfaceText,
} from '../interface-text.ts';
import { SUPPLIED_LANGUAGES } from '../supplied-text.ts';

const ENGLISH_AND_FRENCH = { defaultLocale: 'en', locales: ['en', 'fr'] };

const protocolWith = (
  extra: Readonly<{
    codebook?: unknown;
    stages?: readonly unknown[];
    interfaceText?: unknown;
    localization?: { defaultLocale: string; locales: string[] };
  }> = {},
) => ({
  localization: ENGLISH_AND_FRENCH,
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
  ...extra,
});

const ENCRYPTED_CODEBOOK = {
  node: {
    person: { variables: { name: { type: 'text', encrypted: true } } },
  },
};

describe('the interface text a protocol holds', () => {
  it('always holds the interview’s own words, in each language Network Canvas supplies them in', () => {
    const text = interfaceTextFor(protocolWith());

    expect(Object.keys(text)).toEqual([
      'navigation',
      'interviewer',
      'buttons',
      'messages',
      'search',
    ]);
    expect(text.navigation?.exitInterview).toEqual({
      en: 'Exit interview',
      fr: expect.any(String),
    });
    expect(Object.keys(text.messages ?? {})).toEqual([
      'stageError',
      'error',
      'unnamed',
    ]);
    expect(text.interviewer?.exitReview).toEqual({
      en: 'Exit review',
      fr: 'Quitter la consultation',
    });
    expect(text.messages?.error).toEqual({
      en: 'An error occurred.',
      fr: 'Une erreur s’est produite.',
    });
  });

  it('writes British English with the British spelling the interview uses', () => {
    const text = interfaceTextFor(
      protocolWith({
        localization: { defaultLocale: 'en-GB', locales: ['en-GB', 'en'] },
      }),
    );

    expect(text.messages?.stageError?.['en-GB']).toContain('study organiser');
    expect(text.messages?.stageError?.en).toContain('study organizer');
    // Where the spelling is the same, only English holds it, and British
    // English falls back to it.
    expect(text.navigation?.exitInterview).toEqual({ en: 'Exit interview' });
  });

  it('writes nothing in a language Network Canvas supplies no words in, even the default', () => {
    const text = interfaceTextFor(
      protocolWith({
        localization: { defaultLocale: 'hu', locales: ['hu', 'ka'] },
      }),
    );

    expect(text.navigation?.back).toEqual({});
  });

  it('holds the passphrase text only while the protocol encrypts an attribute', () => {
    const encrypted = protocolWith({ codebook: ENCRYPTED_CODEBOOK });
    expect(Object.keys(interfaceTextFor(encrypted))).toContain('passphrase');

    const decrypted = protocolWith({
      interfaceText: interfaceTextFor(encrypted),
    });
    expect(Object.keys(interfaceTextFor(decrypted))).toEqual([
      'navigation',
      'interviewer',
      'buttons',
      'messages',
      'search',
    ]);
  });

  it('holds the discard question, and Yes to confirm it, while a stage can ask it', () => {
    const text = interfaceTextFor(
      protocolWith({ stages: [{ type: 'EgoForm', form: { fields: [] } }] }),
    );
    // An Ego Form shows no text of its own that is not the protocol's.
    expect(Object.keys(text)).toEqual([
      'navigation',
      'interviewer',
      'buttons',
      'messages',
      'search',
      'forms',
    ]);
    expect(Object.keys(text.buttons ?? {})).toEqual([
      'cancel',
      'yes',
      'copy',
      'copied',
    ]);
    expect(Object.keys(text.forms ?? {})).toEqual([
      'discardChangesTitle',
      'discardChangesDescription',
    ]);
  });

  // The text every stage of one kind shows alike, held while the protocol
  // has such a stage (one that shows it, where only some stages do).
  it.each([
    ['FamilyPedigree', {}, ['familyTreeView', 'familyPedigree']],
    ['NarrativePedigree', {}, ['familyTreeView']],
    [
      'CategoricalBin',
      { behaviours: { interactionMode: 'select' } },
      ['categoricalBin'],
    ],
    ['CategoricalBin', {}, []],
    ['CategoricalBin', { behaviours: { interactionMode: 'drag' } }, []],
    ['NameGeneratorQuickAdd', {}, ['quickAdd']],
    ['NameGeneratorRoster', {}, []],
    ['NetworkComposer', {}, ['networkComposer']],
    ['EgoForm', {}, []],
    ['Sociogram', {}, []],
  ])('holds the text every %s stage %o shows alike', (type, config, groups) => {
    const stageTypeGroups = [
      'familyTreeView',
      'familyPedigree',
      'categoricalBin',
      'quickAdd',
      'networkComposer',
    ];
    const text = interfaceTextFor(
      protocolWith({ stages: [{ type, ...config }] }),
    );
    expect(
      Object.keys(text).filter((group) => stageTypeGroups.includes(group)),
    ).toEqual(groups);
    expect(
      Object.keys(interfaceTextFor(protocolWith({ stages: [] }))).filter(
        (group) => stageTypeGroups.includes(group),
      ),
    ).toEqual([]);
  });

  it('holds a Family Pedigree’s shared text in every language Network Canvas supplies', () => {
    const text = interfaceTextFor(
      protocolWith({
        localization: { defaultLocale: 'en', locales: ['en', 'es'] },
        stages: [{ type: 'FamilyPedigree' }],
      }),
    );
    expect(text.familyPedigree?.undoDescription?.es).toBe(
      'Deshaz el último cambio que hiciste en tu árbol familiar.',
    );
    expect(text.familyTreeView?.showWholeFamily?.en).toBe(
      'Show the whole family',
    );
  });

  it('words a button any stage may show once, among the buttons', () => {
    const buttons = (type: string) =>
      Object.keys(
        interfaceTextFor(protocolWith({ stages: [{ type }] })).buttons ?? {},
      );
    expect(buttons('FamilyPedigree')).toEqual(
      expect.arrayContaining(['undo', 'redo', 'skip', 'zoomIn', 'zoomOut']),
    );
    expect(buttons('NarrativePedigree')).toEqual(
      expect.arrayContaining(['zoomIn', 'zoomOut']),
    );
    expect(buttons('NarrativePedigree')).not.toContain('undo');
    expect(buttons('Information')).not.toContain('zoomIn');
  });

  it('holds Yes and No where a question is answered with them', () => {
    const answersYesOrNo = (extra: Parameters<typeof protocolWith>[0]) => {
      const buttons = interfaceTextFor(protocolWith(extra)).buttons;
      const holdsNo = buttons?.no !== undefined;
      // Wherever No is shown, so is Yes.
      if (holdsNo) expect(buttons?.yes).toBeDefined();
      return holdsNo;
    };
    // A Dyad Census answers each pair with Yes or No, and a Family Pedigree
    // asks Yes-or-No questions of its own.
    expect(answersYesOrNo({ stages: [{ type: 'DyadCensus' }] })).toBe(true);
    expect(answersYesOrNo({ stages: [{ type: 'FamilyPedigree' }] })).toBe(true);
    // Any form may ask a yes-or-no attribute.
    expect(
      answersYesOrNo({
        codebook: { ego: { variables: { smokes: { type: 'boolean' } } } },
      }),
    ).toBe(true);
    // A roster's cards show the answers in the columns it lists, as Yes and
    // No for a yes-or-no one; one that lists none shows only names.
    expect(answersYesOrNo({ stages: [{ type: 'NameGeneratorRoster' }] })).toBe(
      false,
    );
    expect(
      answersYesOrNo({
        stages: [
          {
            type: 'NameGeneratorRoster',
            cardOptions: { additionalProperties: [] },
          },
        ],
      }),
    ).toBe(false);
    expect(
      answersYesOrNo({
        stages: [
          {
            type: 'NameGeneratorRoster',
            cardOptions: {
              additionalProperties: [
                { label: { en: 'Smokes' }, variable: 'smokes' },
              ],
            },
          },
        ],
      }),
    ).toBe(true);
    // A form whose questions are not yes-or-no shows neither.
    for (const stages of [
      [{ type: 'EgoForm', form: { fields: [{ variable: 'name' }] } }],
      [{ type: 'NameGeneratorQuickAdd' }],
      [{ type: 'Anonymisation' }],
      [{ type: 'CategoricalBin', prompts: [{ otherVariable: 'other' }] }],
      [{ type: 'Sociogram' }],
    ]) {
      expect(answersYesOrNo({ stages })).toBe(false);
    }
    expect(answersYesOrNo({ codebook: ENCRYPTED_CODEBOOK })).toBe(false);
  });

  it('holds the discard question while a stage can ask it', () => {
    const asksToDiscard = (stage: Readonly<Record<string, unknown>>) => {
      const text = interfaceTextFor(protocolWith({ stages: [stage] }));
      // Its confirm button reads as Yes.
      if (text.forms !== undefined) expect(text.buttons?.yes).toBeDefined();
      return text.forms !== undefined;
    };
    // The form stages ask as the participant leaves answers unsaved.
    for (const type of ['EgoForm', 'AlterForm', 'AlterEdgeForm']) {
      expect(asksToDiscard({ type })).toBe(true);
    }
    // A Network Composer asks as its inspector leaves a form with fields to
    // answer, for a node or for an edge of a type it draws.
    expect(asksToDiscard({ type: 'NetworkComposer' })).toBe(false);
    expect(
      asksToDiscard({ type: 'NetworkComposer', nodeForm: { fields: [] } }),
    ).toBe(false);
    expect(
      asksToDiscard({
        type: 'NetworkComposer',
        nodeForm: { fields: [{ variable: 'age', prompt: { en: 'Age' } }] },
      }),
    ).toBe(true);
    expect(
      asksToDiscard({
        type: 'NetworkComposer',
        edges: [
          {
            subject: { entity: 'edge', type: 'knows' },
            form: { fields: [{ variable: 'since', prompt: { en: 'Since' } }] },
          },
        ],
      }),
    ).toBe(true);
    // A form that saves or cancels as one, or a passphrase, never asks.
    for (const stage of [
      { type: 'NameGenerator', form: { fields: [{ variable: 'name' }] } },
      { type: 'NameGeneratorQuickAdd' },
      { type: 'FamilyPedigree' },
      { type: 'DyadCensus' },
      { type: 'Anonymisation' },
      { type: 'CategoricalBin', prompts: [{ otherVariable: 'other' }] },
      { type: 'Geospatial' },
    ]) {
      expect(asksToDiscard(stage)).toBe(false);
    }
  });

  it('holds Done on a Name Generator and Delete where a node can be deleted', () => {
    const buttonsOf = (stages: readonly unknown[]) =>
      Object.keys(interfaceTextFor(protocolWith({ stages })).buttons ?? {});

    // Done closes a Name Generator's form.
    expect(buttonsOf([{ type: 'NameGenerator' }])).toContain('done');
    // A Family Pedigree and a Network Composer's inspector delete a node.
    expect(buttonsOf([{ type: 'FamilyPedigree' }])).toContain('delete');
    expect(buttonsOf([{ type: 'NetworkComposer' }])).toContain('delete');
    for (const type of [
      'NameGeneratorQuickAdd',
      'NameGeneratorRoster',
      'EgoForm',
      'Sociogram',
    ]) {
      expect(buttonsOf([{ type }])).not.toContain('done');
      expect(buttonsOf([{ type }])).not.toContain('delete');
    }
    expect(buttonsOf([{ type: 'NameGenerator' }])).not.toContain('delete');
    expect(buttonsOf([{ type: 'FamilyPedigree' }])).not.toContain('done');
  });

  it('holds the passphrase text a protocol can show', () => {
    const passphraseText = (extra: Parameters<typeof protocolWith>[0]) =>
      Object.keys(interfaceTextFor(protocolWith(extra)).passphrase ?? {});
    const asksAndChecks = [
      'passphrase',
      'choosePassphraseHelp',
      'passphraseIncorrect',
      'confirmPassphrase',
      'passwordPlaceholder',
    ];
    const aboutEncryptedAnswers = [
      'protectedAnswersLocked',
      'protectedAnswersNotSaved',
      'answerUnavailable',
      'answerUnavailableKept',
    ];

    // Encrypted answers can be locked or unreadable; the passphrase is not
    // chosen on a stage, so its acceptance is never announced.
    const encrypted = passphraseText({ codebook: ENCRYPTED_CODEBOOK });
    expect(encrypted).toEqual(
      expect.arrayContaining([...asksAndChecks, ...aboutEncryptedAnswers]),
    );
    expect(encrypted).not.toContain('passphraseAccepted');
    // An Anonymisation stage chooses the passphrase and announces it.
    const chosen = passphraseText({ stages: [{ type: 'Anonymisation' }] });
    expect(chosen).toEqual(
      expect.arrayContaining([...asksAndChecks, 'passphraseAccepted']),
    );
    for (const key of aboutEncryptedAnswers) expect(chosen).not.toContain(key);
    expect(passphraseText({})).toEqual([]);
  });

  it('holds the notice that a file could not be shown on an Information stage showing one', () => {
    const holdsNotice = (stage: Readonly<Record<string, unknown>>) =>
      interfaceTextFor(protocolWith({ stages: [stage] })).messages
        ?.itemUnavailable !== undefined;

    expect(
      holdsNotice({
        type: 'Information',
        items: [{ id: 'i', type: 'asset', content: 'image' }],
      }),
    ).toBe(true);
    expect(
      holdsNotice({
        type: 'Information',
        items: [{ id: 'i', type: 'text', content: { en: 'Hello' } }],
      }),
    ).toBe(false);
    expect(holdsNotice({ type: 'Information' })).toBe(false);
    expect(holdsNotice({ type: 'Sociogram' })).toBe(false);
  });

  it('holds what only some stages of a kind show while one is configured to', () => {
    const entries = (
      group: 'familyPedigree' | 'networkComposer',
      stage: Readonly<Record<string, unknown>>,
      codebook?: unknown,
    ) =>
      Object.keys(
        interfaceTextFor(protocolWith({ stages: [stage], codebook }))[group] ??
          {},
      );

    // The completeness checklist's last item, while the stage checks it.
    expect(entries('familyPedigree', { type: 'FamilyPedigree' })).not.toContain(
      'trackerAllDetails',
    );
    expect(
      entries('familyPedigree', {
        type: 'FamilyPedigree',
        completeness: { scope: 'all' },
      }),
    ).toContain('trackerAllDetails');

    const formField = { variable: 'age', prompt: { en: 'Age' } };
    // An undo or redo can overtake an edit only in the inspector's form.
    expect(
      entries('networkComposer', { type: 'NetworkComposer' }),
    ).not.toContain('overtakenEditNotice');
    expect(
      entries('networkComposer', {
        type: 'NetworkComposer',
        nodeForm: { fields: [formField] },
      }),
    ).toContain('overtakenEditNotice');
    expect(
      entries('networkComposer', {
        type: 'NetworkComposer',
        edges: [
          {
            subject: { entity: 'edge', type: 'knows' },
            form: { fields: [formField] },
          },
        ],
      }),
    ).toContain('overtakenEditNotice');

    // The inspector names an edge simply as a connection only when it is of a
    // type the stage does not draw, which the codebook must have.
    const codebook = { node: {}, edge: { knows: {}, likes: {} }, ego: {} };
    const drawing = (types: readonly string[]) => ({
      type: 'NetworkComposer',
      edges: types.map((type) => ({ subject: { entity: 'edge', type } })),
    });
    expect(entries('networkComposer', drawing([]))).not.toContain('connection');
    expect(entries('networkComposer', drawing(['knows']), codebook)).toContain(
      'connection',
    );
    expect(
      entries('networkComposer', drawing(['knows', 'likes']), codebook),
    ).not.toContain('connection');
  });

  it('holds Save and Don’t know while the protocol has a Family Pedigree, and Save for a Categorical Bin’s dialog', () => {
    const buttonsOf = (stages: readonly unknown[]) =>
      Object.keys(interfaceTextFor(protocolWith({ stages })).buttons ?? {});

    expect(buttonsOf([{ type: 'FamilyPedigree' }])).toEqual(
      expect.arrayContaining(['save', 'dontKnow']),
    );
    expect(buttonsOf([{ type: 'EgoForm' }])).not.toContain('save');
    expect(buttonsOf([{ type: 'EgoForm' }])).not.toContain('dontKnow');
    const binAskingForOther = {
      type: 'CategoricalBin',
      prompts: [{ otherVariable: 'other' }],
    };
    expect(buttonsOf([binAskingForOther])).toContain('save');
    expect(buttonsOf([binAskingForOther])).not.toContain('dontKnow');
    expect(
      buttonsOf([{ type: 'CategoricalBin', prompts: [{}] }]),
    ).not.toContain('save');
    expect(
      interfaceTextFor(protocolWith({ stages: [{ type: 'FamilyPedigree' }] }))
        .buttons?.dontKnow,
    ).toEqual({ en: 'Don’t know', fr: 'Je ne sais pas' });
  });

  it('holds the layout toggle while a Sociogram or Narrative lays people out automatically', () => {
    const holdsToggle = (stage: Readonly<Record<string, unknown>>) => {
      const buttons = interfaceTextFor(
        protocolWith({ stages: [stage] }),
      ).buttons;
      expect(buttons?.resumeLayout !== undefined).toBe(
        buttons?.pauseLayout !== undefined,
      );
      return buttons?.pauseLayout !== undefined;
    };

    const on = { automaticLayout: true };
    expect(holdsToggle({ type: 'Sociogram', behaviours: on })).toBe(true);
    expect(holdsToggle({ type: 'Narrative', behaviours: on })).toBe(true);
    expect(
      holdsToggle({
        type: 'Sociogram',
        behaviours: { automaticLayout: false },
      }),
    ).toBe(false);
    expect(holdsToggle({ type: 'Narrative', behaviours: {} })).toBe(false);
    // A Network Composer words its own layout control.
    expect(holdsToggle({ type: 'NetworkComposer', behaviours: on })).toBe(
      false,
    );
  });

  it('holds the loading notice and the external data error while a stage loads people from a file', () => {
    const holdsError = (stage: Readonly<Record<string, unknown>>) => {
      const messages = interfaceTextFor(
        protocolWith({ stages: [stage] }),
      ).messages;
      expect(messages?.loading !== undefined).toBe(
        messages?.externalDataError !== undefined,
      );
      return messages?.externalDataError !== undefined;
    };

    expect(holdsError({ type: 'NameGeneratorRoster' })).toBe(true);
    for (const type of ['NameGenerator', 'NameGeneratorQuickAdd']) {
      expect(
        holdsError({ type, panels: [{ id: 'p', dataSource: 'friends' }] }),
      ).toBe(true);
      expect(
        holdsError({ type, panels: [{ id: 'p', dataSource: 'existing' }] }),
      ).toBe(false);
    }
    expect(holdsError({ type: 'Sociogram' })).toBe(false);
  });

  it('always holds the search text, which the list of screens uses', () => {
    for (const stages of [[], [{ type: 'Geospatial' }]]) {
      expect(interfaceTextFor(protocolWith({ stages })).search).toEqual({
        searchLabel: { en: 'Search', fr: 'Rechercher' },
        searchNoMatch: {
          en: 'Nothing matched your search term.',
          fr: 'Aucun résultat ne correspond à votre recherche.',
        },
      });
    }
  });

  it('holds the error message whatever the protocol shows', () => {
    for (const stages of [
      [],
      [{ type: 'Geospatial' }],
      [{ type: 'EgoForm' }],
    ]) {
      expect(
        interfaceTextFor(protocolWith({ stages })).messages?.error,
      ).toEqual({ en: 'An error occurred.', fr: expect.any(String) });
    }
  });

  it('holds the validation messages of only the rules the protocol uses', () => {
    const text = interfaceTextFor(
      protocolWith({
        codebook: {
          node: {
            person: {
              variables: {
                name: {
                  type: 'text',
                  validation: { required: true, maxLength: 20 },
                },
                age: {
                  type: 'number',
                  validation: { greaterThanVariable: 'other', unique: false },
                },
              },
            },
          },
        },
      }),
    );
    expect(Object.keys(text.validation ?? {}).toSorted()).toEqual([
      'greaterThan',
      'maxLength',
      'required',
    ]);
    expect(text.validation?.required).toEqual({
      en: 'You must answer this question before continuing.',
      fr: 'Vous devez répondre à cette question avant de continuer.',
    });
    expect(interfaceTextFor(protocolWith()).validation).toBeUndefined();
  });

  it('holds the messages of the rules the interview applies itself', () => {
    const rules = (stages: readonly unknown[], codebook?: unknown) =>
      Object.keys(
        interfaceTextFor(protocolWith({ stages, codebook })).validation ?? {},
      ).toSorted();

    // Choosing a passphrase: it must be given, confirmed and long enough.
    expect(rules([], ENCRYPTED_CODEBOOK)).toEqual([
      'minLength',
      'required',
      'sameAs',
    ]);
    expect(rules([{ type: 'Anonymisation' }])).toEqual([
      'minLength',
      'required',
      'sameAs',
    ]);
    expect(
      rules([{ type: 'Anonymisation', validation: { maxLength: 40 } }]),
    ).toEqual(['maxLength', 'minLength', 'required', 'sameAs']);
    // A Family Pedigree asks questions that must be answered.
    expect(rules([{ type: 'FamilyPedigree' }])).toEqual(['required']);
    // A Dyad Census and a Tie Strength Census need an answer for each pair.
    expect(rules([{ type: 'DyadCensus' }])).toEqual(['required']);
    expect(rules([{ type: 'TieStrengthCensus' }])).toEqual(['required']);
    // A one-to-many census lets a person be left unconnected.
    expect(rules([{ type: 'OneToManyDyadCensus' }])).toEqual([]);
  });

  it('holds the date messages for the bounds a date control sets', () => {
    const withControl = (control: Record<string, unknown>) =>
      Object.keys(
        interfaceTextFor(
          protocolWith({
            codebook: {
              ego: { variables: { born: { type: 'datetime', ...control } } },
            },
          }),
        ).validation ?? {},
      ).toSorted();
    expect(
      withControl({
        component: 'DatePicker',
        parameters: { min: '1900-01-01' },
      }),
    ).toEqual(['minDate']);
    expect(withControl({ component: 'DatePicker' })).toEqual([]);
    expect(withControl({ component: 'RelativeDatePicker' })).toEqual([
      'maxDate',
      'minDate',
    ]);
    // A Network Composer field can choose its own control.
    expect(
      Object.keys(
        interfaceTextFor(
          protocolWith({
            stages: [
              {
                type: 'NetworkComposer',
                form: {
                  fields: [
                    {
                      variable: 'met',
                      component: 'DatePicker',
                      parameters: { max: '2026-01-01' },
                    },
                  ],
                },
              },
            ],
          }),
        ).validation ?? {},
      ),
    ).toEqual(['maxDate']);
  });

  it('drops the message of a rule the protocol no longer uses', () => {
    const codebook = (validation: Record<string, unknown>) => ({
      ego: { variables: { name: { type: 'text', validation } } },
    });
    const before = withInterfaceText(
      protocolWith({ codebook: codebook({ required: true, minLength: 2 }) }),
    );
    const after = withInterfaceText({
      ...before,
      codebook: codebook({ required: true }),
    });
    expect(Object.keys(interfaceTextFor(after).validation ?? {})).toEqual([
      'required',
    ]);
    expect(after.interfaceText).toEqual(interfaceTextFor(after));
  });

  it('keeps the researcher’s words', () => {
    const reworded = protocolWith({
      interfaceText: {
        navigation: { back: { en: 'Previous', fr: 'Précédent' } },
      },
    });
    expect(interfaceTextFor(reworded).navigation?.back).toEqual({
      en: 'Previous',
      fr: 'Précédent',
    });
  });

  it('leaves a protocol that already holds its text as it is', () => {
    const complete = withInterfaceText(protocolWith());
    expect(withInterfaceText(complete)).toBe(complete);
  });

  it('is text the schema accepts', () => {
    const text = interfaceTextFor(
      protocolWith({
        codebook: ENCRYPTED_CODEBOOK,
        stages: [{ type: 'EgoForm', form: { fields: [] } }],
      }),
    );
    expect(InterfaceTextSchema.safeParse(text).success).toBe(true);
    // A stage that asks nothing to discard and nothing Yes or No holds no
    // form text and no Yes or No.
    const noForms = interfaceTextFor(
      protocolWith({ stages: [{ type: 'Geospatial' }] }),
    );
    expect(noForms.forms).toBeUndefined();
    expect(Object.keys(noForms.buttons ?? {})).toEqual([
      'cancel',
      'copy',
      'copied',
    ]);
    expect(InterfaceTextSchema.safeParse(noForms).success).toBe(true);
    expect(
      InterfaceTextSchema.safeParse({ navigation: { back: { en: ' ' } } })
        .success,
    ).toBe(false);
    // The old group names are gone, and so are the groups that held only
    // text screen readers read.
    for (const group of ['interview', 'roster', 'egoForm']) {
      expect(
        InterfaceTextSchema.safeParse({ [group]: { back: { en: 'Back' } } })
          .success,
      ).toBe(false);
    }
  });

  it('is worded, in every language Network Canvas supplies, as each text declares its lines', () => {
    const everyLanguage = {
      defaultLocale: 'en',
      locales: [...SUPPLIED_LANGUAGES],
    };
    const text: Record<string, Record<string, unknown>> = {};
    for (const { group, key } of INTERFACE_TEXT_MESSAGES) {
      const value = suppliedInterfaceText(group, key, everyLanguage);
      expect({ group, key, languages: Object.keys(value ?? {}) }).toEqual({
        group,
        key,
        languages: [...SUPPLIED_LANGUAGES],
      });
      text[group] = { ...text[group], [key]: value };
    }

    // A text declared one line refuses a line break in any language.
    expect(InterfaceTextSchema.safeParse(text).error?.issues).toBeUndefined();
  });

  it('holds the screen error message as markdown, and the rest as plain text', () => {
    const formats = new Map(
      collectLocalizedStrings({
        interfaceText: interfaceTextFor(protocolWith()),
      }).map(({ path, format }) => [path.join('.'), format]),
    );

    expect(formats.get('interfaceText.messages.stageError')).toBe('markdown');
    expect(formats.get('interfaceText.messages.error')).toBe('plain');
    expect(formats.get('interfaceText.navigation.back')).toBe('plain');
  });

  it('names a catalog message for every text', () => {
    const idsOf = (group: string, key: string) =>
      INTERFACE_TEXT_MESSAGES.filter(
        (message) => message.group === group && message.key === key,
      ).map(({ id }) => id);

    expect(idsOf('navigation', 'back')).toEqual(['common.back']);
  });

  it('lets one text stand in for several catalog messages', () => {
    const idsOf = (group: string, key: string) =>
      INTERFACE_TEXT_MESSAGES.filter(
        (message) => message.group === group && message.key === key,
      ).map(({ id }) => id);

    // The discard dialog’s confirm button reads as the Yes answer.
    expect(idsOf('buttons', 'yes')).toEqual([
      'frescoUi.booleanField.yes',
      'interview.interfaces.discardChanges',
    ]);
    // The error message is the form’s and the generic one.
    expect(idsOf('messages', 'error')).toEqual([
      'common.genericError',
      'frescoUi.form.submitFailed',
    ]);
    // Every search box and filter reads as the one search label.
    expect(idsOf('search', 'searchLabel')).toEqual([
      'common.search',
      'interview.runtime.filter',
      'frescoUi.collectionFilterInput.searchPlaceholder',
    ]);
    const ids = INTERFACE_TEXT_MESSAGES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('interface text after a change to the languages', () => {
  it('gives a new language Network Canvas’s wording for every entry, reworded or not', () => {
    const english = { defaultLocale: 'en', locales: ['en'] };
    const text = interfaceTextFor(protocolWith({ localization: english }));
    const reworded = {
      ...text,
      navigation: { ...text.navigation, continue: { en: 'Next' } },
    };

    const updates = interfaceTextAfterLanguageChange(reworded, {
      before: english,
      after: ENGLISH_AND_FRENCH,
    });
    const updated = (key: string) =>
      updates.find(
        (update) => update.group === 'navigation' && update.key === key,
      )?.value;

    expect(updated('back')).toEqual({ en: 'Back', fr: 'Retour' });
    expect(updated('continue')).toEqual({ en: 'Next', fr: 'Continuer' });
  });

  it('overwrites no translation, and fills no gap in a language the protocol already had', () => {
    const text = interfaceTextFor(protocolWith());
    const reworded = {
      ...text,
      navigation: {
        ...text.navigation,
        back: { en: 'Previous', fr: 'Précédent' },
        continue: { en: 'Next' },
      },
    };

    const updates = interfaceTextAfterLanguageChange(reworded, {
      before: ENGLISH_AND_FRENCH,
      after: { defaultLocale: 'en', locales: ['en', 'fr', 'de'] },
    });
    const updated = (key: string) =>
      updates.find(
        (update) => update.group === 'navigation' && update.key === key,
      )?.value;

    expect(updated('back')).toEqual({
      en: 'Previous',
      fr: 'Précédent',
      de: 'Zurück',
    });
    expect(updated('continue')).toEqual({ en: 'Next', de: 'Weiter' });
  });

  it('gives a new language Network Canvas has no wording in nothing', () => {
    const english = { defaultLocale: 'en', locales: ['en'] };
    const text = interfaceTextFor(protocolWith({ localization: english }));
    const updates = interfaceTextAfterLanguageChange(text, {
      before: english,
      after: { defaultLocale: 'en', locales: ['en', 'ja'] },
    });

    expect(updates.length).toBeGreaterThan(0);
    for (const { value } of updates) expect(Object.keys(value)).toEqual(['en']);
  });

  it('removes a language that was removed', () => {
    const text = interfaceTextFor(protocolWith());
    const updates = interfaceTextAfterLanguageChange(text, {
      before: ENGLISH_AND_FRENCH,
      after: { defaultLocale: 'en', locales: ['en'] },
    });

    expect(updates.length).toBeGreaterThan(0);
    for (const { value } of updates) expect(Object.keys(value)).toEqual(['en']);
  });
});

describe('the interface text the interview shows', () => {
  const locales = { defaultLocale: 'en', locales: ['en', 'es', 'sw'] };
  const supplied = suppliedInterfaceText('navigation', 'back', locales);

  it('is Network Canvas’s wording where the protocol holds none', () => {
    expect(supplied).toEqual({ en: 'Back', es: expect.any(String) });
    for (const held of [undefined, null, 'text', [], { navigation: 'text' }]) {
      expect(interfaceTextShown(held, 'navigation', 'back', locales)).toEqual(
        supplied,
      );
    }
  });

  it('is the protocol’s own translation where it holds one, and the rest from Network Canvas', () => {
    const held = { navigation: { back: { en: 'Previous', sw: 'Rudi' } } };

    expect(interfaceTextShown(held, 'navigation', 'back', locales)).toEqual({
      en: 'Previous',
      es: supplied?.es,
      sw: 'Rudi',
    });
  });

  it('is only what the protocol holds in a language Network Canvas has no wording in', () => {
    const swahili = { defaultLocale: 'sw', locales: ['sw'] };

    expect(interfaceTextShown({}, 'navigation', 'back', swahili)).toEqual({});
    expect(
      interfaceTextShown(
        { navigation: { back: { sw: 'Rudi' } } },
        'navigation',
        'back',
        swahili,
      ),
    ).toEqual({ sw: 'Rudi' });
  });

  it('reads an entry that is not text in each language as holding nothing', () => {
    expect(
      interfaceTextShown(
        { navigation: { back: { en: 3 } } },
        'navigation',
        'back',
        locales,
      ),
    ).toEqual(supplied);
  });

  it('is undefined for a group or an entry that does not exist', () => {
    expect(interfaceTextShown({}, 'invented', 'back', locales)).toBeUndefined();
    expect(
      interfaceTextShown({}, 'navigation', 'invented', locales),
    ).toBeUndefined();
  });

  it('lists only the entries the protocol shows', () => {
    const plain = interfaceTextShownBy(protocolWith());
    const keys = plain.map(({ group, key }) => `${group}.${key}`);

    expect(keys).toContain('navigation.back');
    expect(keys).not.toContain('passphrase.protectedAnswersLocked');

    const encrypted = interfaceTextShownBy(
      protocolWith({ codebook: ENCRYPTED_CODEBOOK }),
    ).map(({ group, key }) => `${group}.${key}`);
    expect(encrypted).toContain('passphrase.protectedAnswersLocked');
  });

  it('lists each with the text shown, the protocol’s over Network Canvas’s', () => {
    const shown = interfaceTextShownBy(
      protocolWith({
        localization: ENGLISH_AND_FRENCH,
        interfaceText: { navigation: { back: { fr: 'Précédent' } } },
      }),
    );
    const back = shown.find(
      ({ group, key }) => group === 'navigation' && key === 'back',
    );

    expect(back?.value).toEqual({ en: 'Back', fr: 'Précédent' });
    for (const { group, key, value } of shown) {
      expect(value).toEqual(
        group === 'navigation' && key === 'back'
          ? back?.value
          : suppliedInterfaceText(group, key, ENGLISH_AND_FRENCH),
      );
    }
  });
});
