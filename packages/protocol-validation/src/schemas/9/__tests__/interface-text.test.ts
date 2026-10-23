import { describe, expect, it } from 'vitest';

import { collectLocalizedStrings } from '../../../utils/collectLocalizedStrings.ts';
import {
  INTERFACE_TEXT_MESSAGES,
  InterfaceTextSchema,
  interfaceTextAfterLanguageChange,
  interfaceTextFor,
  withInterfaceText,
} from '../interface-text.ts';

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

    expect(Object.keys(text)).toEqual(['navigation', 'buttons', 'messages']);
    expect(text.navigation?.exitInterview).toEqual({
      en: 'Exit interview',
      fr: expect.any(String),
    });
    expect(Object.keys(text.messages ?? {})).toEqual([
      'stageError',
      'itemUnavailable',
      'error',
    ]);
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
    expect(text.navigation?.exitInterview?.['en-GB']).toBe('Exit interview');
  });

  it('writes English in a default language Network Canvas supplies no words in, and nothing in another', () => {
    const text = interfaceTextFor(
      protocolWith({
        localization: { defaultLocale: 'hu', locales: ['hu', 'ka'] },
      }),
    );

    expect(text.navigation?.back).toEqual({ hu: 'Back' });
  });

  it('holds the passphrase text only while the protocol encrypts an attribute', () => {
    const encrypted = protocolWith({ codebook: ENCRYPTED_CODEBOOK });
    expect(Object.keys(interfaceTextFor(encrypted))).toContain('passphrase');

    const decrypted = protocolWith({
      interfaceText: interfaceTextFor(encrypted),
    });
    expect(Object.keys(interfaceTextFor(decrypted))).toEqual([
      'navigation',
      'buttons',
      'messages',
    ]);
  });

  it('holds the form text and the Yes and No answers while a stage shows a form', () => {
    const text = interfaceTextFor(
      protocolWith({ stages: [{ type: 'EgoForm', form: { fields: [] } }] }),
    );
    expect(Object.keys(text)).toEqual([
      'navigation',
      'buttons',
      'messages',
      'forms',
    ]);
    expect(Object.keys(text.buttons ?? {})).toEqual([
      'cancel',
      'done',
      'delete',
      'yes',
      'no',
    ]);
    expect(Object.keys(text.forms ?? {})).toEqual([
      'discardChangesTitle',
      'discardChangesDescription',
    ]);
  });

  it('holds the form text for the forms a stage always shows, and the passphrase’s', () => {
    // Whether the protocol holds the form text and the Yes and No answers.
    const showsForms = (extra: Parameters<typeof protocolWith>[0]) => {
      const text = interfaceTextFor(protocolWith(extra));
      const holdsYesAndNo = text.buttons?.yes !== undefined;
      expect(text.buttons?.no !== undefined).toBe(holdsYesAndNo);
      expect(text.forms !== undefined).toBe(holdsYesAndNo);
      return holdsYesAndNo;
    };
    expect(showsForms({ stages: [{ type: 'NameGeneratorQuickAdd' }] })).toBe(
      true,
    );
    expect(showsForms({ stages: [{ type: 'Anonymisation' }] })).toBe(true);
    // A Dyad Census answers each pair with Yes or No.
    expect(showsForms({ stages: [{ type: 'DyadCensus' }] })).toBe(true);
    // A roster's cards show the answers in the columns it lists, as Yes and
    // No for a yes-or-no one; one that lists none shows only names.
    expect(showsForms({ stages: [{ type: 'NameGeneratorRoster' }] })).toBe(
      false,
    );
    expect(
      showsForms({
        stages: [
          {
            type: 'NameGeneratorRoster',
            cardOptions: { additionalProperties: [] },
          },
        ],
      }),
    ).toBe(false);
    expect(
      showsForms({
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
    // A Categorical Bin asks for its "other" answer in a form dialog.
    expect(
      showsForms({
        stages: [{ type: 'CategoricalBin', prompts: [{ id: 'p' }] }],
      }),
    ).toBe(false);
    expect(
      showsForms({
        stages: [
          {
            type: 'CategoricalBin',
            prompts: [{ id: 'p', otherVariable: 'otherKind' }],
          },
        ],
      }),
    ).toBe(true);
    expect(showsForms({ codebook: ENCRYPTED_CODEBOOK })).toBe(true);
    // A stage that reports a refused save shows no form; the error message
    // it reports is always held.
    expect(showsForms({ stages: [{ type: 'Geospatial' }] })).toBe(false);
    expect(showsForms({ stages: [{ type: 'Sociogram' }] })).toBe(false);
    // A Network Composer's name box is not a form that can be submitted, but
    // the form its inspector shows for a selected person is, once it has
    // fields.
    expect(showsForms({ stages: [{ type: 'NetworkComposer' }] })).toBe(false);
    expect(
      showsForms({
        stages: [{ type: 'NetworkComposer', nodeForm: { fields: [] } }],
      }),
    ).toBe(false);
    expect(
      showsForms({
        stages: [
          {
            type: 'NetworkComposer',
            nodeForm: { fields: [{ variable: 'age', prompt: { en: 'Age' } }] },
          },
        ],
      }),
    ).toBe(true);
  });

  it('holds Save and Don’t know while the protocol has a Family Pedigree', () => {
    const buttonsOf = (stages: readonly unknown[]) =>
      Object.keys(interfaceTextFor(protocolWith({ stages })).buttons ?? {});

    expect(buttonsOf([{ type: 'FamilyPedigree' }])).toEqual(
      expect.arrayContaining(['save', 'dontKnow']),
    );
    expect(buttonsOf([{ type: 'EgoForm' }])).not.toContain('save');
    expect(buttonsOf([{ type: 'EgoForm' }])).not.toContain('dontKnow');
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

  it('holds the external data error while a stage loads people from a file', () => {
    const holdsError = (stage: Readonly<Record<string, unknown>>) =>
      interfaceTextFor(protocolWith({ stages: [stage] })).messages
        ?.externalDataError !== undefined;

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

  it('holds the search text while a roster or a map has a search', () => {
    const searchOf = (stage: Readonly<Record<string, unknown>>) =>
      interfaceTextFor(protocolWith({ stages: [stage] })).search;

    expect(
      searchOf({ type: 'NameGeneratorRoster', searchOptions: {} }),
    ).toEqual({
      searchLabel: { en: 'Search', fr: 'Rechercher' },
      searchNoMatch: {
        en: 'Nothing matched your search term.',
        fr: 'Aucun résultat ne correspond à votre recherche.',
      },
    });
    expect(
      searchOf({ type: 'Geospatial', mapOptions: { allowSearch: true } }),
    ).toBeDefined();
    expect(searchOf({ type: 'NameGeneratorRoster' })).toBeUndefined();
    expect(
      searchOf({ type: 'Geospatial', mapOptions: { allowSearch: false } }),
    ).toBeUndefined();
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
    // A stage that shows no form holds no form text and no Yes or No.
    const noForms = interfaceTextFor(
      protocolWith({ stages: [{ type: 'Geospatial' }] }),
    );
    expect(noForms.forms).toBeUndefined();
    expect(Object.keys(noForms.buttons ?? {})).toEqual([
      'cancel',
      'done',
      'delete',
    ]);
    expect(InterfaceTextSchema.safeParse(noForms).success).toBe(true);
    expect(
      InterfaceTextSchema.safeParse({ navigation: { back: { en: ' ' } } })
        .success,
    ).toBe(false);
    // The old group names are gone.
    expect(
      InterfaceTextSchema.safeParse({ interview: { back: { en: 'Back' } } })
        .success,
    ).toBe(false);
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
    const ids = INTERFACE_TEXT_MESSAGES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('interface text after a change to the languages', () => {
  it('follows the change while the default-language text is still Network Canvas’s, and leaves reworded text alone', () => {
    const english = { defaultLocale: 'en', locales: ['en'] };
    const text = interfaceTextFor(protocolWith({ localization: english }));
    const reworded = {
      ...text,
      navigation: { ...text.navigation, back: { en: 'Previous' } },
    };

    const updates = interfaceTextAfterLanguageChange(reworded, {
      before: english,
      after: ENGLISH_AND_FRENCH,
    });
    const updated = (key: string) =>
      updates.find(
        (update) => update.group === 'navigation' && update.key === key,
      );

    expect(updated('exitInterview')?.value.fr).toEqual(expect.any(String));
    expect(updated('back')).toBeUndefined();
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
