import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { LocalizationDeclaration } from '../../../localization/localeTag.ts';
import {
  SUPPLIED_PEDIGREE_OPTION_LABELS,
  suppliedOptionLabel,
  suppliedOptionLabels,
  suppliedOptionLabelsAfterLanguageChange,
} from '../family-pedigree-option-labels.ts';
import {
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
} from '../family-pedigree-values.ts';
import { localizedString } from '../localized-string.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import type { LanguageChange } from '../supplied-text.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

const labelSchema = localizedString(z.string().min(1), {
  format: 'markdown',
  lines: 'single',
});

describe('supplied Family Pedigree option labels', () => {
  it.each(Object.keys(SUPPLIED_PEDIGREE_OPTION_LABELS))(
    'labels every value of both sets in %s, as text a protocol can hold',
    (locale) => {
      for (const value of PEDIGREE_SEX_ASSIGNED_AT_BIRTH) {
        const label = suppliedOptionLabel(
          'pedigreeSexAssignedAtBirth',
          value,
          locale,
        );
        expect(label).toBeDefined();
        expect(labelSchema.safeParse({ [locale]: label }).success).toBe(true);
      }
      for (const value of PEDIGREE_RELATIONSHIP_KINDS) {
        const label = suppliedOptionLabel(
          'pedigreeRelationship',
          value,
          locale,
        );
        expect(label).toBeDefined();
        expect(labelSchema.safeParse({ [locale]: label }).success).toBe(true);
      }
    },
  );

  it('serves only the same language, not a regional variant or a neighbouring language', () => {
    expect(suppliedOptionLabel('pedigreeRelationship', 'donor', 'de')).toBe(
      'Eizell- oder Samenspender/in',
    );
    expect(
      suppliedOptionLabel('pedigreeRelationship', 'donor', 'de-AT'),
    ).toBeUndefined();
    expect(
      suppliedOptionLabel('pedigreeSexAssignedAtBirth', 'male', 'zh-HK'),
    ).toBeUndefined();
    // Network Canvas's Traditional Chinese is Taiwan's.
    expect(
      suppliedOptionLabel('pedigreeSexAssignedAtBirth', 'male', 'zh-TW'),
    ).toBe(
      suppliedOptionLabel('pedigreeSexAssignedAtBirth', 'male', 'zh-Hant'),
    );
    expect(
      suppliedOptionLabel('pedigreeSexAssignedAtBirth', 'female', 'pt-PT'),
    ).toBeUndefined();
    expect(
      suppliedOptionLabel('pedigreeSexAssignedAtBirth', 'female', 'ca'),
    ).toBeUndefined();
  });

  it('labels a value in each protocol language that has supplied labels', () => {
    expect(
      suppliedOptionLabels('pedigreeSexAssignedAtBirth', 'female', {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'hu'],
      }),
    ).toEqual({ en: 'Female', fr: 'Féminin' });
  });

  it('writes no English in a default language Network Canvas supplies no labels in', () => {
    expect(
      suppliedOptionLabels('pedigreeRelationship', 'donor', {
        defaultLocale: 'hu',
        locales: ['hu'],
      }),
    ).toEqual({});
    expect(
      suppliedOptionLabels('pedigreeRelationship', 'donor', {
        defaultLocale: 'hu',
        locales: ['hu', 'de'],
      }),
    ).toEqual({ de: 'Eizell- oder Samenspender/in' });
  });

  const SET = 'pedigreeSexAssignedAtBirth';
  const optionsFor = (localization: LocalizationDeclaration) =>
    PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
      value,
      label: suppliedOptionLabels(SET, value, localization),
    }));
  const labelsIn = (labels: Record<string, string>): Record<string, string>[] =>
    PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) =>
      Object.fromEntries(
        Object.entries(labels).map(([locale, source]) => [
          locale,
          suppliedOptionLabel(SET, value, source)!,
        ]),
      ),
    );
  const relabelled = (
    options: ReturnType<typeof optionsFor>,
    change: LanguageChange,
  ) =>
    suppliedOptionLabelsAfterLanguageChange(SET, options, change).map(
      (option) => option.label,
    );
  const english = { defaultLocale: 'en', locales: ['en'] };
  const hungarian = { defaultLocale: 'hu', locales: ['hu'] };

  it('fills in a new language', () => {
    expect(
      relabelled(optionsFor(english), {
        before: english,
        after: { defaultLocale: 'en', locales: ['en', 'es'] },
      }),
    ).toEqual(labelsIn({ en: 'en', es: 'es' }));
  });

  it('fills in a new language while a default language with no supplied labels is still unwritten', () => {
    expect(
      relabelled(optionsFor(hungarian), {
        before: hungarian,
        after: { defaultLocale: 'hu', locales: ['hu', 'de'] },
      }),
    ).toEqual(labelsIn({ de: 'de' }));
  });

  it('fills in a new language in a protocol created with an unsupported default and a supported language', () => {
    const mixed = { defaultLocale: 'hu', locales: ['hu', 'en'] };
    expect(
      relabelled(optionsFor(mixed), {
        before: mixed,
        after: { defaultLocale: 'hu', locales: ['hu', 'en', 'de'] },
      }),
    ).toEqual(labelsIn({ en: 'en', de: 'de' }));
  });

  it('fills in a new language once the researcher writes the labels in an unsupported default language', () => {
    const mixed = { defaultLocale: 'hu', locales: ['hu', 'en'] };
    const options = optionsFor(mixed).map((option) => ({
      ...option,
      label: { ...option.label, hu: `${option.value} (hu)` },
    }));
    expect(
      relabelled(options, {
        before: mixed,
        after: { defaultLocale: 'hu', locales: ['hu', 'en', 'de'] },
      }),
    ).toEqual(
      labelsIn({ en: 'en', de: 'de' }).map((label, index) => ({
        hu: `${PEDIGREE_SEX_ASSIGNED_AT_BIRTH[index]} (hu)`,
        ...label,
      })),
    );
  });

  it('gives a corrected language its own labels, as when an English protocol migrated from schema 8 is really German', () => {
    expect(
      relabelled(optionsFor(english), {
        before: english,
        after: { defaultLocale: 'de', locales: ['de'] },
        renamed: { en: 'de' },
      }),
    ).toEqual(labelsIn({ de: 'de' }));
  });

  it('removes the English labels from a language corrected to one Network Canvas supplies no labels in', () => {
    expect(
      relabelled(optionsFor(english), {
        before: english,
        after: hungarian,
        renamed: { en: 'hu' },
      }),
    ).toEqual(labelsIn({}));
  });

  it('keeps each language’s own labels when the default language changes', () => {
    const both = { defaultLocale: 'en', locales: ['en', 'hu'] };
    const options = optionsFor(both);
    expect(
      relabelled(options, {
        before: both,
        after: { defaultLocale: 'hu', locales: ['en', 'hu'] },
      }),
    ).toEqual(labelsIn({ en: 'en' }));
  });

  it('fills in a new language for every label, reworded or not', () => {
    const options = optionsFor(english).map((option) =>
      option.value === 'intersex'
        ? { ...option, label: { en: 'Intersex or variation of sex' } }
        : option,
    );
    const filled = suppliedOptionLabelsAfterLanguageChange(SET, options, {
      before: english,
      after: { defaultLocale: 'en', locales: ['en', 'fr'] },
    });
    expect(filled.find((option) => option.value === 'intersex')?.label).toEqual(
      {
        en: 'Intersex or variation of sex',
        fr: suppliedOptionLabel(SET, 'intersex', 'fr'),
      },
    );
    expect(filled.find((option) => option.value === 'male')?.label).toEqual({
      en: 'Male',
      fr: 'Masculin',
    });
  });

  it('moves a reworded label unchanged to a corrected language, and gives the others its labels', () => {
    const options = optionsFor(english).map((option) =>
      option.value === 'intersex'
        ? { ...option, label: { en: 'Intersex or variation of sex' } }
        : option,
    );
    const corrected = suppliedOptionLabelsAfterLanguageChange(SET, options, {
      before: english,
      after: { defaultLocale: 'de', locales: ['de'] },
      renamed: { en: 'de' },
    });
    expect(
      corrected.find((option) => option.value === 'intersex')?.label,
    ).toEqual({ de: 'Intersex or variation of sex' });
    expect(corrected.find((option) => option.value === 'male')?.label).toEqual({
      de: suppliedOptionLabel(SET, 'male', 'de'),
    });
  });

  it('keeps a label the researcher wrote in another language', () => {
    const options = optionsFor({
      defaultLocale: 'en',
      locales: ['en', 'es'],
    }).map((option) =>
      option.value === 'male'
        ? { ...option, label: { ...option.label, es: 'Varón' } }
        : option,
    );
    const filled = suppliedOptionLabelsAfterLanguageChange(SET, options, {
      before: { defaultLocale: 'en', locales: ['en', 'es'] },
      after: { defaultLocale: 'en', locales: ['en', 'es', 'fr'] },
    });
    expect(filled.find((option) => option.value === 'male')?.label).toEqual({
      en: 'Male',
      es: 'Varón',
      fr: 'Masculin',
    });
    expect(filled.find((option) => option.value === 'female')?.label).toEqual({
      en: 'Female',
      es: 'Femenino',
      fr: 'Féminin',
    });
  });
});

describe('a Family Pedigree answer label', () => {
  const withSexLabel = (label: Record<string, string>) => {
    const protocol = completeProtocol();
    const sex = protocol.codebook.node.relative.variables.sex;
    return {
      ...protocol,
      codebook: {
        ...protocol.codebook,
        node: {
          ...protocol.codebook.node,
          relative: {
            ...protocol.codebook.node.relative,
            variables: {
              ...protocol.codebook.node.relative.variables,
              sex: {
                ...sex,
                options: sex.options.map((option) =>
                  option.value === 'intersex' ? { ...option, label } : option,
                ),
              },
            },
          },
        },
      },
    };
  };

  it('may be reworded', () => {
    expect(
      ProtocolSchemaV9.safeParse(withSexLabel({ en: 'Intersex variation' }))
        .success,
    ).toBe(true);
  });

  it('cannot be blank, because participants choose from it', () => {
    const result = ProtocolSchemaV9.safeParse(withSexLabel({ en: '  ' }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      'codebook',
      'node',
      'relative',
      'variables',
      'sex',
      'options',
      2,
      'label',
      'en',
    ]);
  });
});
