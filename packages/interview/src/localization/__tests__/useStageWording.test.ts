import { describe, expect, it } from 'vitest';

import { stageWordingOf } from '../useStageWording';

const english = { defaultLocale: 'en', locales: ['en'] };
const englishAndSpanish = { defaultLocale: 'en', locales: ['en', 'es'] };
const swahiliAndSpanish = { defaultLocale: 'sw', locales: ['sw', 'es'] };

describe('stageWordingOf', () => {
  it('gives Network Canvas’s wording for a setting the stage does not hold', () => {
    const wording = stageWordingOf(
      { type: 'LanguageChooser' },
      englishAndSpanish,
    );

    expect(wording.text('title')).toEqual({
      en: 'Choose a language',
      es: 'Elige un idioma',
    });
  });

  it('keeps the stage’s own text in each language it holds, and Network Canvas’s in the others', () => {
    const wording = stageWordingOf(
      { type: 'LanguageChooser', title: { es: 'Idioma de la entrevista' } },
      englishAndSpanish,
    );

    expect(wording.text('title')).toEqual({
      en: 'Choose a language',
      es: 'Idioma de la entrevista',
    });
  });

  it('gives only what the stage holds in a language Network Canvas has no wording in', () => {
    expect(
      stageWordingOf(
        { type: 'LanguageChooser', title: { sw: 'Chagua lugha' } },
        swahiliAndSpanish,
      ).text('title'),
    ).toEqual({ sw: 'Chagua lugha', es: 'Elige un idioma' });

    expect(
      stageWordingOf({ type: 'LanguageChooser' }, swahiliAndSpanish).text(
        'title',
      ),
    ).toEqual({ es: 'Elige un idioma' });
  });

  it('shows a setting only while the stage’s configuration shows it', () => {
    const withMinimum = stageWordingOf(
      { type: 'NameGenerator', behaviours: { minNodes: 2 } },
      english,
    );
    const withoutLimits = stageWordingOf({ type: 'NameGenerator' }, english);

    expect(withMinimum.shown('minNodesNotice')?.en).toContain(
      'You must create at least',
    );
    expect(withMinimum.shown('maxNodesNotice')).toBeUndefined();
    expect(withoutLimits.shown('minNodesNotice')).toBeUndefined();
    // The words are there to ask for whether or not they are shown.
    expect(withoutLimits.text('minNodesNotice').en).toContain(
      'You must create at least',
    );
  });

  it('gives every setting below a path by the rest of its path', () => {
    const below = stageWordingOf(
      {
        type: 'NarrativePedigree',
        conditionText: { selectCondition: { en: 'Pick a condition' } },
      },
      english,
    ).below('conditionText');

    expect(Object.keys(below).toSorted()).toEqual([
      'selectCondition',
      'snapshotCondition',
      'snapshotInheritance',
    ]);
    expect(below.selectCondition).toEqual({ en: 'Pick a condition' });
  });

  it('refuses a setting Network Canvas does not word', () => {
    const wording = stageWordingOf({ type: 'LanguageChooser' }, english);

    expect(() => wording.text('label')).toThrow(
      'Network Canvas supplies no wording for "label" of a LanguageChooser stage',
    );
  });
});
