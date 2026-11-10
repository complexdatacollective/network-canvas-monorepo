import { describe, expect, it } from 'vitest';

import { STAGE_LABEL_MAX_LENGTH } from '@codaco/protocol-validation';

import {
  composeStageName,
  dedupeStageLabel,
  generateStageLabel,
} from '../generateStageLabel.ts';
import { stageNameLanguageOf } from '../stageNameLanguage.ts';

const languageOf = (defaultLocale: string) => {
  const language = stageNameLanguageOf({
    defaultLocale,
    locales: [defaultLocale],
  });
  if (language === undefined) throw new Error(`no wording in ${defaultLocale}`);
  return language;
};

const english = languageOf('en');

describe('composeStageName', () => {
  it('joins subject, type, and qualifier with spaces', () => {
    expect(
      composeStageName(
        {
          subjectName: 'Person',
          typeName: 'Form Name Generator',
          qualifier: 'with Roster Panels',
        },
        english,
      ),
    ).toBe('Person Form Name Generator with Roster Panels');
  });
  it('omits empty subject and qualifier', () => {
    expect(
      composeStageName(
        {
          subjectName: null,
          typeName: 'Ego Form',
          qualifier: null,
        },
        english,
      ),
    ).toBe('Ego Form');
  });
  it('capitalises a lowercase user-defined subject without changing other casing', () => {
    expect(
      composeStageName(
        {
          subjectName: 'person',
          typeName: 'Form Name Generator',
          qualifier: null,
        },
        english,
      ),
    ).toBe('Person Form Name Generator');
  });
  it('trims user-defined parts before capitalising the stage name', () => {
    expect(
      composeStageName(
        {
          subjectName: '  person ',
          typeName: 'Form Name Generator',
          qualifier: null,
        },
        english,
      ),
    ).toBe('Person Form Name Generator');
  });
});

describe('dedupeStageLabel', () => {
  it('returns the base when free', () => {
    expect(dedupeStageLabel('Person Sociogram', ['Other'])).toBe(
      'Person Sociogram',
    );
  });
  it('appends the lowest free number on collision, case-insensitively', () => {
    expect(dedupeStageLabel('Person Sociogram', ['person sociogram'])).toBe(
      'Person Sociogram #2',
    );
  });
  it('fills numbering gaps', () => {
    expect(dedupeStageLabel('A', ['A', 'A #3'])).toBe('A #2');
  });

  /**
   * Two spellings of the same name. A researcher who types "Cafe\u0301
   * Sociogram" on one machine and "Caf\u00e9 Sociogram" on another sees one
   * string on screen either way, so two stages with those labels are two
   * stages with the same name — which is how the codebook, the protocol schema
   * and the migration repair all count it (`normalizeForComparison`). Folding
   * case alone left this one surface disagreeing.
   */
  it('treats a decomposed and a precomposed label as the same name', () => {
    const decomposed = 'Cafe\u0301 Sociogram';
    const precomposed = 'Caf\u00e9 Sociogram';
    expect(decomposed).not.toBe(precomposed);

    expect(dedupeStageLabel(precomposed, [decomposed])).toBe(
      `${precomposed} #2`,
    );
    // …and the suffix search normalises too, so #2 is not handed out twice.
    expect(
      dedupeStageLabel(precomposed, [decomposed, `${decomposed} #2`]),
    ).toBe(`${precomposed} #3`);
  });
});

describe('generateStageLabel', () => {
  it('builds a full name', () => {
    expect(
      generateStageLabel({
        language: english,
        typeName: 'Form Name Generator',
        subjectName: 'Person',
        qualifier: {
          full: 'with Roster Panels',
          summary: 'with Roster Panels',
        },
        existingLabels: [],
      }),
    ).toBe('Person Form Name Generator with Roster Panels');
  });
  it('summarizes a listed qualifier when too long, before dropping the subject', () => {
    const label = generateStageLabel({
      language: english,
      typeName: 'Family Pedigree',
      subjectName: 'Extended Family Member Person',
      qualifier: {
        full: 'with Diabetes, Hypertension & Coronary Heart Disease Nominations',
        summary: 'with Nominations',
      },
      existingLabels: [],
    });
    expect(label.length).toBeLessThanOrEqual(STAGE_LABEL_MAX_LENGTH);
    expect(label).toContain('with Nominations');
  });
  it('never exceeds the length cap even with a dedup suffix', () => {
    const long = 'X'.repeat(60);
    const label = generateStageLabel({
      language: english,
      typeName: long,
      subjectName: null,
      qualifier: null,
      existingLabels: [long.slice(0, 50)],
    });
    expect(label.length).toBeLessThanOrEqual(STAGE_LABEL_MAX_LENGTH);
  });
});

describe('a name in another language', () => {
  it('puts the parts in the language’s own order', () => {
    expect(
      composeStageName(
        {
          subjectName: 'Persona',
          typeName: 'Generador de nombres (con formularios)',
          qualifier: 'con paneles de la lista',
        },
        languageOf('es'),
      ),
    ).toBe(
      'Generador de nombres (con formularios): Persona – con paneles de la lista',
    );
    expect(
      composeStageName(
        { subjectName: '朋友', typeName: '姓名生成器（使用表单）' },
        languageOf('zh-Hans'),
      ),
    ).toBe('姓名生成器（使用表单）：朋友');
  });

  it('keeps the subject as the researcher wrote it', () => {
    expect(
      composeStageName(
        { subjectName: 'ami·e', typeName: 'Sociogramme' },
        languageOf('fr'),
      ),
    ).toBe('Sociogramme\u00a0: ami·e');
  });

  it('treats a name already taken in that language as taken', () => {
    const language = languageOf('es');
    expect(
      generateStageLabel({
        language,
        typeName: 'Sociograma',
        subjectName: 'Persona',
        existingLabels: ['sociograma: persona'],
      }),
    ).toBe('Sociograma: Persona #2');
  });

  it('is never longer than a stage name may be', () => {
    const language = languageOf('de');
    const label = generateStageLabel({
      language,
      typeName: 'Namensgenerator '.repeat(20).trim(),
      existingLabels: [],
    });
    expect(label.length).toBeLessThanOrEqual(STAGE_LABEL_MAX_LENGTH);
    expect(label).not.toMatch(/\s$/);
  });

  // A name in a language written without spaces is cut at a word the runtime
  // finds, and what is left is whole characters of the original.
  it('cuts a Chinese name without spaces inside the limit', () => {
    const language = languageOf('zh-Hans');
    const typeName = '社会关系图'.repeat(30);
    const label = generateStageLabel({
      language,
      typeName,
      existingLabels: [],
    });
    expect(label.length).toBeLessThanOrEqual(STAGE_LABEL_MAX_LENGTH);
    expect(label.length).toBeGreaterThan(STAGE_LABEL_MAX_LENGTH / 2);
    expect(typeName.startsWith(label)).toBe(true);
  });

  it('does not cut through a character that takes two code units', () => {
    const language = languageOf('zh-Hant');
    const typeName = `1${'𠀀'.repeat(80)}`;
    const label = generateStageLabel({
      language,
      typeName,
      existingLabels: [],
    });
    expect(label.length).toBeLessThanOrEqual(STAGE_LABEL_MAX_LENGTH);
    expect(typeName.startsWith(label)).toBe(true);
    expect(label).not.toMatch(/[\uD800-\uDBFF]$/u);
  });

  it('gives a long name that collides a different name within the limit', () => {
    const language = languageOf('es');
    const typeName = 'Generador '.repeat(12).trim();
    const first = generateStageLabel({
      language,
      typeName,
      existingLabels: [],
    });
    const second = generateStageLabel({
      language,
      typeName,
      existingLabels: [first],
    });
    expect(second).not.toBe(first);
    expect(second.length).toBeLessThanOrEqual(STAGE_LABEL_MAX_LENGTH);
  });
});
