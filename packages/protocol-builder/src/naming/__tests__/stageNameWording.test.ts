import { describe, expect, it } from 'vitest';

import {
  type FinishKinds,
  type MediaKinds,
  type PanelSource,
  STAGE_LABEL_MAX_LENGTH,
  type StageNameParts,
  type StageType,
  stageNameWordingFor,
  SUPPLIED_LANGUAGES,
} from '@codaco/protocol-validation';

import { interfaceNameMessages } from '../../interfaces/interfaceNames.ts';
import de from '../../locales/de.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';
import itCatalog from '../../locales/it.json';
import nl from '../../locales/nl.json';
import ptBR from '../../locales/pt-BR.json';
import zhHans from '../../locales/zh-Hans.json';
import zhHant from '../../locales/zh-Hant.json';
import { composeStageName } from '../generateStageLabel.ts';
import {
  formatStageNameMessage,
  stageNameLanguageOf,
} from '../stageNameLanguage.ts';

/**
 * The Architect interface's own catalogs, by language. Which languages there
 * are is `SUPPLIED_LANGUAGES`; the lookup below fails for one with no catalog
 * listed here, so a language added to that list is not forgotten.
 */
const CATALOGS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  en,
  de,
  es,
  fr,
  'it': itCatalog,
  nl,
  'pt-BR': ptBR,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
};

const catalogText = (locale: string, id: string): string => {
  const entry = CATALOGS[locale]?.[id];
  if (typeof entry === 'string') return entry;
  if (
    typeof entry === 'object' &&
    entry !== null &&
    'defaultMessage' in entry
  ) {
    if (typeof entry.defaultMessage === 'string') return entry.defaultMessage;
  }
  throw new Error(`No ${locale} catalog text for ${id}.`);
};

const STAGE_TYPES = Object.keys(interfaceNameMessages) as StageType[];

const language = (locale: string) => {
  const found = stageNameLanguageOf({
    defaultLocale: locale,
    locales: [locale],
  });
  if (found === undefined) throw new Error(`No wording in ${locale}.`);
  return found;
};

describe('the wording a proposed stage name is made from', () => {
  it('covers every language Network Canvas supplies wording in, and no other', () => {
    expect(SUPPLIED_LANGUAGES.length).toBeGreaterThan(0);
    for (const locale of SUPPLIED_LANGUAGES) {
      expect(stageNameWordingFor(locale), locale).toBeDefined();
      expect(CATALOGS[locale], `${locale} catalog`).toBeDefined();
    }
    expect(stageNameWordingFor('sw')).toBeUndefined();
  });

  it('names every kind of stage in every language', () => {
    expect(STAGE_TYPES.length).toBe(21);
    for (const locale of SUPPLIED_LANGUAGES) {
      for (const type of STAGE_TYPES) {
        const name = stageNameWordingFor(locale)?.types[type];
        expect(name?.trim(), `${locale} ${type}`).toBeTruthy();
      }
    }
  });

  // The interface the researcher edits the stage in and the name proposed for
  // it use one term for a kind of stage in each language. English alone names
  // a name generator by its distinguishing word first, to read in front of a
  // node type, and leaves "Interface" off.
  it('names a kind of stage as the Architect interface does in the same language', () => {
    const NAMED_FOR_ENGLISH_ORDER: readonly StageType[] = [
      'NameGenerator',
      'NameGeneratorQuickAdd',
      'NameGeneratorRoster',
      'Geospatial',
      'Anonymisation',
    ];
    for (const locale of SUPPLIED_LANGUAGES) {
      for (const type of STAGE_TYPES) {
        if (locale === 'en' && NAMED_FOR_ENGLISH_ORDER.includes(type)) continue;
        expect(
          stageNameWordingFor(locale)?.types[type],
          `${locale} ${type}`,
        ).toBe(catalogText(locale, interfaceNameMessages[type].id));
      }
    }
  });

  it('uses the terms the interface uses for panels, media and how an interview ends', () => {
    const lower = (text: string) => text.toLocaleLowerCase();
    for (const locale of SUPPLIED_LANGUAGES) {
      const wording = stageNameWordingFor(locale);
      if (wording === undefined) throw new Error(locale);
      const ask = (message: string, argument: string, value: string): string =>
        lower(
          formatStageNameMessage(language(locale), message, {
            [argument]: value,
          }),
        );
      expect(ask(wording.panels, 'source', 'both')).toContain(
        lower(catalogText(locale, 'protocolBuilder.nodePanels.fieldLabel')),
      );
      for (const [kind, id] of [
        ['image', 'kindImage'],
        ['video', 'kindVideo'],
        ['audio', 'kindAudio'],
      ] as const) {
        expect(
          ask(wording.media, 'media', kind),
          `${locale} ${kind}`,
        ).toContain(
          lower(catalogText(locale, `protocolBuilder.contentBlock.${id}`)),
        );
      }
      for (const [kind, id] of [
        ['completed', 'outcomeCompleted'],
        ['ineligible', 'outcomeIneligible'],
        ['terminated', 'outcomeTerminated'],
      ] as const) {
        expect(
          ask(wording.finish, 'finish', kind),
          `${locale} ${kind}`,
        ).toContain(
          lower(catalogText(locale, `protocolBuilder.finishSession.${id}`)),
        );
      }
    }
  });

  it('leaves no argument unfilled in any case of any message', () => {
    const shapes: StageNameParts[] = [
      'subjectTypeQualifier',
      'subjectType',
      'typeQualifier',
      'type',
    ];
    const sources: PanelSource[] = ['network', 'roster', 'both'];
    const media: MediaKinds[] = [
      'image',
      'video',
      'audio',
      'imageVideo',
      'imageAudio',
      'videoAudio',
      'imageVideoAudio',
      'summary',
    ];
    const finish: FinishKinds[] = [
      'completed',
      'ineligible',
      'terminated',
      'completedAutomatic',
      'ineligibleAutomatic',
      'terminatedAutomatic',
      'automatic',
    ];
    for (const locale of SUPPLIED_LANGUAGES) {
      const lang = language(locale);
      const { wording } = lang;
      const texts = [
        ...sources.map((source) =>
          formatStageNameMessage(lang, wording.panels, { source }),
        ),
        ...media.map((kind) =>
          formatStageNameMessage(lang, wording.media, { media: kind }),
        ),
        ...finish.map((kind) =>
          formatStageNameMessage(lang, wording.finish, { finish: kind }),
        ),
        ...shapes.map((parts) =>
          formatStageNameMessage(lang, wording.name, {
            parts,
            subject: 'S',
            type: 'T',
            qualifier: 'Q',
          }),
        ),
      ];
      for (const text of texts) {
        expect(text, locale).not.toMatch(/[{}]/);
      }
      // Each pattern uses exactly the parts its shape names.
      const named = (parts: StageNameParts) =>
        formatStageNameMessage(lang, wording.name, {
          parts,
          subject: 'S',
          type: 'T',
          qualifier: 'Q',
        });
      expect(named('type'), locale).toBe('T');
      expect(named('subjectType'), locale).toMatch(
        /^[^Q]*T[^Q]*S[^Q]*$|^[^Q]*S[^Q]*T[^Q]*$/u,
      );
      expect(named('typeQualifier'), locale).toMatch(
        /^[^S]*T[^S]*Q[^S]*$|^[^S]*Q[^S]*T[^S]*$/u,
      );
      expect(named('subjectTypeQualifier'), locale).toMatch(/S/u);
      expect(named('subjectTypeQualifier'), locale).toMatch(/Q/u);
      expect(named('subjectTypeQualifier'), locale).toMatch(/T/u);
    }
  });

  // The longest name Architect proposes without a subject must be accepted by
  // the schema in every language, whatever else is shortened.
  it('proposes names within the schema’s limit for every kind of stage', () => {
    for (const locale of SUPPLIED_LANGUAGES) {
      const lang = language(locale);
      for (const type of STAGE_TYPES) {
        const typeName = lang.wording.types[type];
        const qualifier = formatStageNameMessage(lang, lang.wording.media, {
          media: 'imageVideoAudio',
        });
        const name = composeStageName({ typeName, qualifier }, lang);
        expect(name.length, `${locale} ${type}`).toBeLessThanOrEqual(
          STAGE_LABEL_MAX_LENGTH,
        );
      }
    }
  });
});
