import { describe, expect, it } from 'vitest';

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

    expect(Object.keys(text)).toEqual(['interview']);
    expect(text.interview?.exitInterview).toEqual({
      en: 'Exit interview',
      fr: expect.any(String),
    });
  });

  it('writes English in a default language Network Canvas supplies no words in, and nothing in another', () => {
    const text = interfaceTextFor(
      protocolWith({
        localization: { defaultLocale: 'hu', locales: ['hu', 'ka'] },
      }),
    );

    expect(text.interview?.back).toEqual({ hu: 'Back' });
  });

  it('holds the passphrase text only while the protocol encrypts an attribute', () => {
    const encrypted = protocolWith({ codebook: ENCRYPTED_CODEBOOK });
    expect(Object.keys(interfaceTextFor(encrypted))).toContain('passphrase');

    const decrypted = protocolWith({
      interfaceText: interfaceTextFor(encrypted),
    });
    expect(Object.keys(interfaceTextFor(decrypted))).toEqual(['interview']);
  });

  it('holds the form text while a stage shows a form', () => {
    const text = interfaceTextFor(
      protocolWith({ stages: [{ type: 'EgoForm', form: { fields: [] } }] }),
    );
    expect(Object.keys(text)).toEqual(['interview', 'forms']);
  });

  it('holds the form text for the forms a stage always shows, and the passphrase’s', () => {
    const groups = (extra: Parameters<typeof protocolWith>[0]) =>
      Object.keys(interfaceTextFor(protocolWith(extra)));
    expect(groups({ stages: [{ type: 'NameGeneratorQuickAdd' }] })).toContain(
      'forms',
    );
    expect(groups({ stages: [{ type: 'Anonymisation' }] })).toContain('forms');
    expect(groups({ codebook: ENCRYPTED_CODEBOOK })).toContain('forms');
    // A Network Composer's name box is not a form that can be submitted.
    expect(groups({ stages: [{ type: 'NetworkComposer' }] })).not.toContain(
      'forms',
    );
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
    expect(Object.keys(text.validation ?? {}).sort()).toEqual([
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
      ).sort();

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
      ).sort();
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
        interview: { back: { en: 'Previous', fr: 'Précédent' } },
      },
    });
    expect(interfaceTextFor(reworded).interview?.back).toEqual({
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
    expect(
      InterfaceTextSchema.safeParse({ interview: { back: { en: ' ' } } })
        .success,
    ).toBe(false);
  });

  it('names a catalog message for every text', () => {
    expect(
      INTERFACE_TEXT_MESSAGES.find(
        ({ group, key }) => group === 'forms' && key === 'yes',
      )?.id,
    ).toBe('frescoUi.booleanField.yes');
  });
});

describe('interface text after a change to the languages', () => {
  it('follows the change while the default-language text is still Network Canvas’s, and leaves reworded text alone', () => {
    const english = { defaultLocale: 'en', locales: ['en'] };
    const text = interfaceTextFor(protocolWith({ localization: english }));
    const reworded = {
      ...text,
      interview: { ...text.interview, back: { en: 'Previous' } },
    };

    const updates = interfaceTextAfterLanguageChange(reworded, {
      before: english,
      after: ENGLISH_AND_FRENCH,
    });
    const updated = (key: string) =>
      updates.find(
        (update) => update.group === 'interview' && update.key === key,
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
