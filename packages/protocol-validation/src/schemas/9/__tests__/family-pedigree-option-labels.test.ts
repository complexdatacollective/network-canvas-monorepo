import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  hasSuppliedOptionLabels,
  SUPPLIED_PEDIGREE_OPTION_LABELS,
  suppliedOptionLabel,
  suppliedOptionLabels,
  withSuppliedOptionLabelTranslation,
} from '../family-pedigree-option-labels.ts';
import {
  PEDIGREE_RELATIONSHIP_KINDS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH,
} from '../family-pedigree-values.ts';
import { localizedString } from '../localized-string.ts';

const labelSchema = localizedString(z.string().min(1), 'markdown');

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

  it('serves a regional variant from its language, and nothing to a neighbouring language', () => {
    expect(suppliedOptionLabel('pedigreeRelationship', 'donor', 'de-AT')).toBe(
      'Eizell- oder Samenspender/in',
    );
    expect(
      suppliedOptionLabel('pedigreeSexAssignedAtBirth', 'male', 'zh-TW'),
    ).toBe('男性');
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

  it('falls back to English in the default language when no protocol language has supplied labels', () => {
    expect(
      suppliedOptionLabels('pedigreeRelationship', 'donor', {
        defaultLocale: 'hu',
        locales: ['hu'],
      }),
    ).toEqual({ hu: 'Egg or sperm donor' });
  });

  const sexOptions = (locale: string) =>
    PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
      value,
      label: {
        [locale]: suppliedOptionLabel(
          'pedigreeSexAssignedAtBirth',
          value,
          locale,
        )!,
      },
    }));

  it('fills in a new language while the default-language labels are still the supplied ones', () => {
    const options = sexOptions('en');
    expect(
      hasSuppliedOptionLabels('pedigreeSexAssignedAtBirth', options, 'en'),
    ).toBe(true);
    const filled = withSuppliedOptionLabelTranslation(
      'pedigreeSexAssignedAtBirth',
      options,
      'es',
      'en',
    );
    expect(filled.map((option) => option.label)).toEqual(
      PEDIGREE_SEX_ASSIGNED_AT_BIRTH.map((value) => ({
        en: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'en'),
        es: suppliedOptionLabel('pedigreeSexAssignedAtBirth', value, 'es'),
      })),
    );
  });

  it('leaves the labels alone once the researcher has reworded one', () => {
    const options = sexOptions('en').map((option) =>
      option.value === 'intersex'
        ? { ...option, label: { en: 'Intersex or variation of sex' } }
        : option,
    );
    expect(
      withSuppliedOptionLabelTranslation(
        'pedigreeSexAssignedAtBirth',
        options,
        'es',
        'en',
      ),
    ).toBe(options);
  });

  it('keeps a label the option already has in the new language', () => {
    const options = sexOptions('en').map((option) =>
      option.value === 'male'
        ? { ...option, label: { ...option.label, es: 'Varón' } }
        : option,
    );
    const filled = withSuppliedOptionLabelTranslation(
      'pedigreeSexAssignedAtBirth',
      options,
      'es',
      'en',
    );
    expect(filled.find((option) => option.value === 'male')?.label).toEqual({
      en: 'Male',
      es: 'Varón',
    });
    expect(filled.find((option) => option.value === 'female')?.label).toEqual({
      en: 'Female',
      es: 'Femenino',
    });
  });
});
