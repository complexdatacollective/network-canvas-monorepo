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
  it('fills a language added while the default-language text is still Network Canvas’s, and leaves reworded text alone', () => {
    const english = { defaultLocale: 'en', locales: ['en'] };
    const text = interfaceTextFor(protocolWith({ localization: english }));
    const reworded = {
      ...text,
      interview: { ...text.interview, back: { en: 'Previous' } },
    };

    const after = interfaceTextAfterLanguageChange(reworded, {
      before: english,
      after: ENGLISH_AND_FRENCH,
    });

    expect(after.interview?.exitInterview?.fr).toEqual(expect.any(String));
    expect(after.interview?.back).toEqual({ en: 'Previous' });
  });
});
