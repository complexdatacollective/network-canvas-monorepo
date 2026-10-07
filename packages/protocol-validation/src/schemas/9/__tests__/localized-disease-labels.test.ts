import { describe, expect, it } from 'vitest';

import { escapeMessageText } from '../../../localization/messageSyntax.ts';
import { findDuplicateDiseaseLabels } from '../stages/narrative-pedigree.ts';

const bilingual = { defaultLocale: 'en', locales: ['en', 'fr'] };

const diseases = (...labels: Record<string, string>[]) =>
  labels.map((label) => ({ label }));

describe('findDuplicateDiseaseLabels', () => {
  // The second row has no French text, so French participants see its English
  // label, which is the first row's French label.
  it('reports a collision caused by fallback in the locale it affects only', () => {
    expect(
      findDuplicateDiseaseLabels(
        diseases({ en: 'Breast cancer', fr: 'Cancer' }, { en: 'Cancer' }),
        bilingual,
      ),
    ).toEqual([{ index: 1, locale: 'fr', text: 'Cancer' }]);
  });

  it('reports a collision in every locale that shows it', () => {
    expect(
      findDuplicateDiseaseLabels(
        diseases({ en: 'Cancer' }, { en: 'cancer ' }),
        bilingual,
      ),
    ).toEqual([
      { index: 1, locale: 'en', text: 'cancer ' },
      { index: 1, locale: 'fr', text: 'cancer ' },
    ]);
  });

  it('accepts labels that resolve to distinct text in every locale', () => {
    expect(
      findDuplicateDiseaseLabels(
        diseases(
          { en: 'Cancer', fr: 'Tumeur' },
          { en: 'Tumour', fr: 'Cancer' },
        ),
        bilingual,
      ),
    ).toEqual([]);
  });

  it('compares the text a participant reads, not its escaped source', () => {
    expect(
      findDuplicateDiseaseLabels(
        diseases(
          { en: escapeMessageText('Type {A}') },
          { en: escapeMessageText('type {a}') },
        ),
        { defaultLocale: 'en', locales: ['en'] },
      ),
    ).toEqual([{ index: 1, locale: 'en', text: 'type {a}' }]);
  });

  it('skips a label with no translation in a declared language', () => {
    expect(
      findDuplicateDiseaseLabels(
        diseases({ en: 'Cancer' }, { de: 'Cancer' }),
        bilingual,
      ),
    ).toEqual([]);
  });
});
