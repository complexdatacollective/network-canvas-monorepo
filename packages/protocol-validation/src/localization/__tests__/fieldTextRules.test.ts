import { describe, expect, it } from 'vitest';

import { createDefaultFinishSessionStage } from '../../schemas/9/finish-session-defaults.ts';
import { ProtocolSchemaV9 } from '../../schemas/9/schema.ts';
import { createBaseProtocol } from '../../utils/test-utils.ts';
import { findFieldTextProblems } from '../fieldTextRules.ts';

/**
 * A protocol whose interface text holds only the back button, in Spanish
 * alone, in the given languages.
 */
const heldOnlyInSpanish = (localization: {
  defaultLocale: string;
  locales: string[];
}) =>
  ProtocolSchemaV9.parse({
    ...createBaseProtocol(),
    codebook: { node: {}, edge: {}, ego: {} },
    localization,
    stages: [createDefaultFinishSessionStage({ id: 'end', localization })],
    interfaceText: { navigation: { back: { es: 'Volver' } } },
  });

const withoutDefaultLanguage = (
  protocol: Parameters<typeof findFieldTextProblems>[0],
) =>
  findFieldTextProblems(protocol).filter(
    ({ rule }) => rule === 'interfaceTextWithoutDefaultLanguage',
  );

describe('interface text without words in the default language', () => {
  it('is not an entry held only in another language, where Network Canvas has wording in the default language', () => {
    for (const defaultLocale of ['en', 'en-US']) {
      const protocol = heldOnlyInSpanish({
        defaultLocale,
        locales: [defaultLocale, 'es'],
      });
      expect(withoutDefaultLanguage(protocol)).toEqual([]);
    }
  });

  it('is an entry held only in another language, where Network Canvas has no wording in the default language', () => {
    const protocol = heldOnlyInSpanish({
      defaultLocale: 'sw',
      locales: ['sw', 'es'],
    });

    expect(withoutDefaultLanguage(protocol)).toEqual([
      {
        rule: 'interfaceTextWithoutDefaultLanguage',
        path: ['interfaceText', 'navigation', 'back'],
        locale: 'sw',
      },
    ]);
  });

  it('is not an entry written in the default language Network Canvas has no wording in', () => {
    const protocol = ProtocolSchemaV9.parse({
      ...heldOnlyInSpanish({ defaultLocale: 'sw', locales: ['sw', 'es'] }),
      interfaceText: { navigation: { back: { sw: 'Rudi', es: 'Volver' } } },
    });

    expect(withoutDefaultLanguage(protocol)).toEqual([]);
  });
});
