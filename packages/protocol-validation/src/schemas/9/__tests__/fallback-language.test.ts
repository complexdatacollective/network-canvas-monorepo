import { describe, expect, it } from 'vitest';

import type { LocalizationDeclaration } from '../../../localization/localeTag.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol, {
  FALLBACK_LANGUAGE_MISSING,
} from '../../../validation/validate-protocol.ts';
import {
  findMissingFallbackLanguage,
  needsFallbackLanguage,
  withFallbackLanguage,
} from '../fallback-language.ts';
import { createDefaultFinishSessionStage } from '../finish-session-defaults.ts';
import { ProtocolLocalizationSchema } from '../localized-string.ts';
import { SUPPLIED_LANGUAGES } from '../supplied-text.ts';

// Swahili is a language Network Canvas has no wording in.
const swahili = { defaultLocale: 'sw', locales: ['sw'] };

const problemsOf = (localization: unknown) => {
  const result = ProtocolLocalizationSchema.safeParse(localization);
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => ({ path, message }));
};

describe('which protocols name a fallback language', () => {
  it.each(['en', 'en-US', 'pt', 'zh-TW'])(
    'is none whose default language Network Canvas has wording in (%s)',
    (defaultLocale) => {
      expect(needsFallbackLanguage(defaultLocale)).toBe(false);
    },
  );

  // A regional variant Network Canvas does not write is not a language it has
  // wording in, even beside the language it belongs to.
  it.each(['sw', 'es-MX', 'en-GB', 'ja'])(
    'is every one whose default language it has none in (%s)',
    (defaultLocale) => {
      expect(needsFallbackLanguage(defaultLocale)).toBe(true);
    },
  );
});

describe('the fallback language in a language declaration', () => {
  it.each(SUPPLIED_LANGUAGES)(
    'may be any language Network Canvas has wording in (%s)',
    (fallbackLocale) => {
      expect(problemsOf({ ...swahili, fallbackLocale })).toEqual([]);
    },
  );

  it('need not be a language the protocol declares', () => {
    const declared = ProtocolLocalizationSchema.parse({
      ...swahili,
      fallbackLocale: 'fr',
    });
    expect(declared).toEqual({ ...swahili, fallbackLocale: 'fr' });
  });

  it.each(['sw', 'es-MX', 'en-US', 'ja'])(
    'is refused when it is not one of those languages (%s)',
    (fallbackLocale) => {
      expect(problemsOf({ ...swahili, fallbackLocale })).toEqual([
        {
          path: ['fallbackLocale'],
          message: expect.stringContaining(
            `The fallback language "${fallbackLocale}" must be a language Network Canvas has its own wording in`,
          ),
        },
      ]);
    },
  );

  it('is refused when it is not a language tag', () => {
    expect(
      problemsOf({ ...swahili, fallbackLocale: 'EN_us' }).map(
        ({ path }) => path,
      ),
    ).toContainEqual(['fallbackLocale']);
  });

  it.each(['en', 'en-US', 'de'])(
    'is refused when the default language is one Network Canvas has wording in (%s)',
    (defaultLocale) => {
      expect(
        problemsOf({
          defaultLocale,
          locales: [defaultLocale, 'sw'],
          fallbackLocale: 'en',
        }),
      ).toEqual([
        {
          path: ['fallbackLocale'],
          message: expect.stringContaining('cannot name a fallback language'),
        },
      ]);
    },
  );

  it('may be absent while the protocol is being written', () => {
    expect(problemsOf(swahili)).toEqual([]);
  });
});

describe('a fallback language a protocol needs and does not name', () => {
  it('is reported with the default language that needs it', () => {
    expect(findMissingFallbackLanguage(swahili)).toBe('sw');
  });

  it.each([
    { ...swahili, fallbackLocale: 'en' },
    { defaultLocale: 'en', locales: ['en', 'sw'] },
  ])(
    'is not reported for $defaultLocale naming $fallbackLocale',
    (declared) => {
      expect(findMissingFallbackLanguage(declared)).toBeUndefined();
    },
  );

  // As Architect creates a protocol: a finish stage and nothing else.
  const protocolIn = (localization: LocalizationDeclaration) => ({
    ...createBaseProtocol(),
    codebook: { node: {}, edge: {}, ego: {} },
    localization,
    stages: [
      createDefaultFinishSessionStage({
        id: 'end',
        localization: { ...localization, locales: [...localization.locales] },
      }),
    ],
  });

  const fallbackIssues = async (
    localization: LocalizationDeclaration,
    options?: { draft: boolean },
  ) => {
    const result = await validateProtocol(protocolIn(localization), options);
    return (result.error?.issues ?? []).filter(
      ({ code, path }) =>
        code === FALLBACK_LANGUAGE_MISSING || path[1] === 'fallbackLocale',
    );
  };

  it('stops the protocol being handed over', async () => {
    expect(await fallbackIssues(swahili)).toEqual([
      {
        code: FALLBACK_LANGUAGE_MISSING,
        path: ['localization', 'fallbackLocale'],
        message: expect.stringContaining('must name a fallback language'),
      },
    ]);
  });

  it('does not stop the protocol being written', async () => {
    expect(await fallbackIssues(swahili, { draft: true })).toEqual([]);
  });

  it('is not reported once the protocol names one', async () => {
    expect(await fallbackIssues({ ...swahili, fallbackLocale: 'en' })).toEqual(
      [],
    );
  });

  it('is not reported for a default language Network Canvas has wording in', async () => {
    const english = { defaultLocale: 'en', locales: ['en'] };
    expect((await validateProtocol(protocolIn(english))).success).toBe(true);
  });
});

describe('the fallback language after a change to a protocol’s languages', () => {
  it('is kept while the default language still needs one', () => {
    expect(
      withFallbackLanguage(
        { defaultLocale: 'ja', locales: ['ja', 'sw'] },
        'es',
      ),
    ).toEqual({
      defaultLocale: 'ja',
      locales: ['ja', 'sw'],
      fallbackLocale: 'es',
    });
  });

  it('goes when a language Network Canvas has wording in becomes the default', () => {
    expect(
      withFallbackLanguage(
        { defaultLocale: 'en', locales: ['en', 'sw'], fallbackLocale: 'es' },
        'es',
      ),
    ).toEqual({ defaultLocale: 'en', locales: ['en', 'sw'] });
  });

  it('is not carried over from the declaration when none is given', () => {
    expect(
      withFallbackLanguage({ ...swahili, fallbackLocale: 'es' }, undefined),
    ).toEqual(swahili);
  });

  it('replaces the one the declaration names', () => {
    expect(
      withFallbackLanguage({ ...swahili, fallbackLocale: 'es' }, 'fr'),
    ).toEqual({ ...swahili, fallbackLocale: 'fr' });
  });
});
