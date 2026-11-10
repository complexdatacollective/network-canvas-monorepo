import { describe, expect, it } from 'vitest';

import {
  migrateProtocol,
  migrateProtocolWithSessions,
} from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol, {
  BUILT_IN_WORDING_MISSING,
  FINISH_STAGE_TEXT_MISSING,
} from '../../../validation/validate-protocol.ts';
import {
  defaultFinishSessionTextAfterLanguageChange,
  createDefaultFinishSessionStage,
  DEFAULT_FINISH_SESSION_TEXT,
  defaultFinishSessionText,
  hasDefaultFinishSessionText,
} from '../finish-session-defaults.ts';
import { findFinishStageTextProblems } from '../finish-stage-text.ts';
import { withInterfaceText } from '../interface-text.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { finishSessionStage } from '../stages/finish-session.ts';
import {
  hasSuppliedWording,
  SUPPLIED_LANGUAGES,
  suppliedBaseLanguage,
} from '../supplied-text.ts';
import { findTimelineStructureProblems } from '../timeline-structure.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

const finish = (id = 'finish', outcome = 'completed') => ({
  id,
  type: 'FinishSession',
  mode: 'confirmation',
  label: { en: 'Finish' },
  content: { en: '# All done\n\nPress Finish to end the interview.' },
  finishedContent: { en: '# Finished\n\nThank you.' },
  ...englishSettings('en'),
  outcome,
});

/** The finish stage's supplied settings, in English, under `locale`. */
const englishSettings = (locale: string) => ({
  finishLabel: { [locale]: 'Finish' },
  finishConfirmation: {
    [locale]: 'Are you sure you want to finish the interview?',
  },
  finishFailed: {
    [locale]:
      'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
  },
});

const information = (id: string) => ({
  id,
  type: 'Information',
  label: { en: id },
  title: { en: id },
  items: [{ id: `${id}-text`, type: 'text', content: { en: 'Text' } }],
});

const protocolWith = (stages: unknown[]) =>
  withInterfaceText({
    ...createBaseProtocol(),
    stages,
  });

const issues = (stages: unknown[]) => {
  const result = ProtocolSchemaV9.safeParse(protocolWith(stages));
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => ({ path, message }));
};

describe('FinishSession stage schema', () => {
  it.each(['completed', 'ineligible', 'terminated'])(
    'accepts the %s outcome',
    (outcome) => {
      expect(finishSessionStage.safeParse(finish('f', outcome)).success).toBe(
        true,
      );
    },
  );

  it('refuses an outcome outside the three kinds', () => {
    expect(finishSessionStage.safeParse(finish('f', 'withdrawn')).success).toBe(
      false,
    );
  });

  it('refuses a stage without an outcome', () => {
    const { outcome: _outcome, ...withoutOutcome } = finish();
    expect(finishSessionStage.safeParse(withoutOutcome).success).toBe(false);
  });

  it.each(['confirmation', 'automatic'])('accepts the %s mode', (mode) => {
    expect(finishSessionStage.safeParse({ ...finish(), mode }).success).toBe(
      true,
    );
  });

  it('refuses a stage without a mode, or with another one', () => {
    const { mode: _mode, ...withoutMode } = finish();
    expect(finishSessionStage.safeParse(withoutMode).success).toBe(false);
    expect(
      finishSessionStage.safeParse({ ...finish(), mode: 'manual' }).success,
    ).toBe(false);
  });

  it.each(['content', 'finishedContent'] as const)(
    'requires %s text',
    (field) => {
      expect(
        finishSessionStage.safeParse({ ...finish(), [field]: { en: '' } })
          .success,
      ).toBe(false);
    },
  );

  it('refuses skip logic: every route ends at a finish stage', () => {
    expect(
      finishSessionStage.safeParse({
        ...finish(),
        skipLogic: { action: 'SKIP', filter: { rules: [] } },
      }).success,
    ).toBe(false);
  });
});

describe('timeline structure', () => {
  it('accepts a timeline that ends at its only finish stage', () => {
    expect(issues([information('a'), finish()])).toEqual([]);
  });

  it('refuses a timeline with no stages', () => {
    expect(issues([])).toEqual([
      {
        path: ['stages'],
        message:
          'A protocol must have at least one stage: a finish stage to end the interview.',
      },
    ]);
  });

  it('refuses a timeline that ends without a finish stage, at its last stage', () => {
    expect(issues([information('a'), information('b')])).toEqual([
      {
        path: ['stages', 1],
        message:
          'The interview must end with a finish stage, but it ends after this stage.',
      },
    ]);
  });

  it('refuses every stage after a finish stage as unreachable', () => {
    expect(
      issues([information('a'), finish(), information('b'), information('c')]),
    ).toEqual([
      {
        path: ['stages', 2],
        message:
          'This stage comes after the finish stage at position 2, so no participant can reach it.',
      },
      {
        path: ['stages', 3],
        message:
          'This stage comes after the finish stage at position 2, so no participant can reach it.',
      },
    ]);
  });

  it('accepts several finish stages at the end, so routes can end differently', () => {
    expect(
      issues([
        information('a'),
        finish(),
        { ...finish('f2', 'ineligible'), mode: 'automatic' },
        finish('f3', 'terminated'),
      ]),
    ).toEqual([]);
  });

  it('refuses a stage between finish stages as unreachable', () => {
    expect(
      issues([information('a'), finish(), information('b'), finish('f2')]),
    ).toEqual([
      {
        path: ['stages', 2],
        message:
          'This stage comes after the finish stage at position 2, so no participant can reach it.',
      },
    ]);
  });

  it('reports problems by stage index without validating the stages', () => {
    expect(
      findTimelineStructureProblems([
        { type: 'FinishSession' },
        { type: 'Information' },
      ]),
    ).toEqual([{ kind: 'unreachable', stageIndex: 1, finishStageIndex: 0 }]);
    expect(
      findTimelineStructureProblems([
        { type: 'FinishSession' },
        { type: 'FinishSession' },
      ]),
    ).toEqual([]);
  });
});

describe('v8 to v9 migration', () => {
  const schema8 = () => asSchema8Protocol(completeProtocol());

  it('appends one completed finish stage with the supplied English text, under the default language', () => {
    const migrated = migrateProtocol(schema8(), 9);
    const { defaultLocale } = migrated.localization;
    expect(migrated.stages.at(-1)).toEqual({
      id: 'finish',
      type: 'FinishSession',
      mode: 'confirmation',
      label: { [defaultLocale]: DEFAULT_FINISH_SESSION_TEXT.en.label },
      content: { [defaultLocale]: DEFAULT_FINISH_SESSION_TEXT.en.content },
      finishedContent: {
        [defaultLocale]: DEFAULT_FINISH_SESSION_TEXT.en.finishedContent,
      },
      ...englishSettings(defaultLocale),
      outcome: 'completed',
    });
    expect(
      migrated.stages.filter((stage) => stage.type === 'FinishSession'),
    ).toHaveLength(1);
  });

  // The engine used to show its own finish screen one place past the last
  // stage; the appended finish stage takes that place, so a session that was
  // there, or anywhere before it, resumes where it was.
  it('resumes a session that was on the old finish screen at the finish stage', () => {
    const document = schema8();
    const { protocol, migrateSession } = migrateProtocolWithSessions(document);
    const finishIndex = protocol.stages.length - 1;
    expect(protocol.stages[finishIndex]?.type).toBe('FinishSession');
    const at = (currentStep: number) => {
      const result = migrateSession({
        network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
        stageMetadata: {},
        currentStep,
      });
      if (!result.success) throw result.error;
      return result.session.currentStep;
    };
    expect(at(document.stages.length)).toBe(finishIndex);
    expect(at(document.stages.length + 3)).toBe(finishIndex);
    expect(at(0)).toBe(0);
  });

  it('gives the finish stage an id no schema 8 stage holds', () => {
    const document = schema8();
    document.stages = [
      { ...document.stages[0]!, id: 'finish' },
      { ...document.stages[1]!, id: 'finish-2' },
      ...document.stages.slice(2),
    ];
    const migrated = migrateProtocol(document, 9);
    expect(migrated.stages.at(-1)?.id).toBe('finish-3');
  });

  it('migrates the same document to the same finish stage every time', () => {
    const first = migrateProtocol(schema8(), 9);
    const second = migrateProtocol(schema8(), 9);
    expect(first.stages.at(-1)).toEqual(second.stages.at(-1));
  });

  it('produces a protocol that validates, ending at its finish stage', () => {
    const migrated = migrateProtocol(schema8(), 9);
    expect(ProtocolSchemaV9.safeParse(migrated).success).toBe(true);
  });

  // Fresco's deploy normalization re-runs this migration over rows already
  // stored at schema 9, so a document that already ends at its finish stage
  // keeps that stage, with whatever the researcher wrote in it.
  it('keeps the finish stage a document already ends at, rather than adding a second', () => {
    const migrated = migrateProtocol(schema8(), 9);
    const finishStage = migrated.stages.at(-1);
    if (finishStage?.type !== 'FinishSession') {
      throw new Error('no finish stage');
    }
    const edited = {
      ...finishStage,
      mode: 'automatic' as const,
      finishedContent: { [migrated.localization.defaultLocale]: '# Thanks' },
    };

    const again = migrateProtocol(
      {
        ...migrated,
        schemaVersion: 8,
        stages: [...migrated.stages.slice(0, -1), edited],
      },
      9,
    );

    expect(again.stages.filter(({ type }) => type === 'FinishSession')).toEqual(
      [edited],
    );
    expect(again.stages.at(-1)).toEqual(edited);
  });
});

describe('supplied finish text', () => {
  it('is supplied in exactly the languages Network Canvas supplies wording in', () => {
    expect(Object.keys(DEFAULT_FINISH_SESSION_TEXT).toSorted()).toEqual(
      [...SUPPLIED_LANGUAGES].toSorted(),
    );
    expect(defaultFinishSessionText('hu')).toBeUndefined();
  });

  it.each([
    ['en-GB', 'en'],
    ['en-AU', 'en'],
    ['es-MX', 'es'],
    ['es-419', 'es'],
    ['fr-CA', 'fr'],
    ['zh-HK', 'zh-Hant'],
    ['zh-Hans-SG', 'zh-Hans'],
    ['de-AT', 'de'],
    ['de-CH', 'de'],
  ])(
    'has none for the regional variant %s, which can add %s',
    (locale, base) => {
      expect(defaultFinishSessionText(locale)).toBeUndefined();
      expect(hasSuppliedWording(locale)).toBe(false);
      expect(suppliedBaseLanguage(locale)).toBe(base);
    },
  );

  // Network Canvas's English is American English, its Spanish is Spain's and
  // so on: the region CLDR takes each language to mean when none is given.
  it.each([
    ['en-US', 'en'],
    ['es-ES', 'es'],
    ['fr-FR', 'fr'],
    ['de-DE', 'de'],
    ['nl-NL', 'nl'],
    ['pt', 'pt-BR'],
    ['zh-CN', 'zh-Hans'],
    ['zh', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['zh-Hant-TW', 'zh-Hant'],
  ])('is %s’s own in the language’s default region, %s', (locale, supplied) => {
    expect(defaultFinishSessionText(locale)).toEqual(
      DEFAULT_FINISH_SESSION_TEXT[
        supplied as keyof typeof DEFAULT_FINISH_SESSION_TEXT
      ],
    );
    expect(hasSuppliedWording(locale)).toBe(true);
    expect(suppliedBaseLanguage(locale)).toBeUndefined();
  });

  it.each(['pt-PT', 'ca', 'gl', 'ja', 'und'])(
    'has none for %s, rather than a neighbouring language',
    (locale) => {
      expect(defaultFinishSessionText(locale)).toBeUndefined();
      expect(hasSuppliedWording(locale)).toBe(false);
      expect(suppliedBaseLanguage(locale)).toBeUndefined();
    },
  );

  it.each(SUPPLIED_LANGUAGES)(
    'offers %s no other language to start from',
    (locale) => {
      expect(hasSuppliedWording(locale)).toBe(true);
      expect(suppliedBaseLanguage(locale)).toBeUndefined();
    },
  );

  it('creates a stage with text in each language that has it', () => {
    expect(
      createDefaultFinishSessionStage({
        id: 'end',
        localization: { defaultLocale: 'en', locales: ['en', 'ja'] },
      }),
    ).toEqual({
      id: 'end',
      type: 'FinishSession',
      mode: 'confirmation',
      label: { en: DEFAULT_FINISH_SESSION_TEXT.en.label },
      content: { en: DEFAULT_FINISH_SESSION_TEXT.en.content },
      finishedContent: { en: DEFAULT_FINISH_SESSION_TEXT.en.finishedContent },
      // Network Canvas words the settings in no Japanese.
      ...englishSettings('en'),
      outcome: 'completed',
    });
  });

  it('writes no English into a default language Network Canvas has no wording in', () => {
    expect(
      createDefaultFinishSessionStage({
        id: 'end',
        localization: { defaultLocale: 'es-MX', locales: ['es-MX', 'es'] },
      }),
    ).toEqual({
      id: 'end',
      type: 'FinishSession',
      mode: 'confirmation',
      label: { es: DEFAULT_FINISH_SESSION_TEXT.es.label },
      content: { es: DEFAULT_FINISH_SESSION_TEXT.es.content },
      finishedContent: { es: DEFAULT_FINISH_SESSION_TEXT.es.finishedContent },
      finishLabel: { es: 'Finalizar' },
      finishConfirmation: {
        es: expect.any(String),
      },
      finishFailed: { es: expect.any(String) },
      outcome: 'completed',
    });
  });

  it('is valid message text in every language', () => {
    const locales = Object.keys(DEFAULT_FINISH_SESSION_TEXT);
    const stage = createDefaultFinishSessionStage({
      id: 'end',
      localization: { defaultLocale: 'en', locales },
    });
    expect(
      ProtocolSchemaV9.safeParse(
        withInterfaceText({
          ...createBaseProtocol(),
          localization: { defaultLocale: 'en', locales },
          stages: [stage],
        }),
      ).success,
    ).toBe(true);
  });

  const english = { defaultLocale: 'en', locales: ['en'] };
  const stage = createDefaultFinishSessionStage({
    id: 'end',
    localization: english,
  });
  const afterChange = (
    from: typeof stage,
    change: Parameters<typeof defaultFinishSessionTextAfterLanguageChange>[1],
  ) => ({
    ...from,
    ...defaultFinishSessionTextAfterLanguageChange(from, change),
  });
  const addingFrench = {
    before: english,
    after: { defaultLocale: 'en', locales: ['en', 'fr'] },
  };

  describe('adding a language', () => {
    it('fills in the new language while the default language text is still the supplied text', () => {
      expect(hasDefaultFinishSessionText(stage, 'en')).toBe(true);
      expect(afterChange(stage, addingFrench)).toEqual({
        ...stage,
        label: { ...stage.label, fr: DEFAULT_FINISH_SESSION_TEXT.fr.label },
        content: {
          ...stage.content,
          fr: DEFAULT_FINISH_SESSION_TEXT.fr.content,
        },
        finishedContent: {
          ...stage.finishedContent,
          fr: DEFAULT_FINISH_SESSION_TEXT.fr.finishedContent,
        },
      });
    });

    it('leaves a regional variant untranslated, to fall back to its language', () => {
      const addingMexicanSpanish = {
        before: english,
        after: { defaultLocale: 'en', locales: ['en', 'es-MX', 'es'] },
      };
      expect(afterChange(stage, addingMexicanSpanish).content).toEqual({
        ...stage.content,
        es: DEFAULT_FINISH_SESSION_TEXT.es.content,
      });
    });

    it('fills a default language Network Canvas has no text in once a language it has text in becomes the default', () => {
      const mexican = { defaultLocale: 'es-MX', locales: ['es-MX', 'es'] };
      const unwritten = createDefaultFinishSessionStage({
        id: 'end',
        localization: mexican,
      });
      expect(hasDefaultFinishSessionText(unwritten, 'es-MX')).toBe(true);
      expect(
        afterChange(unwritten, {
          before: mexican,
          after: { defaultLocale: 'es', locales: ['es-MX', 'es'] },
        }).content,
      ).toEqual({ es: DEFAULT_FINISH_SESSION_TEXT.es.content });
    });

    it('leaves the new language untranslated once the researcher has changed any of the text', () => {
      const edited = { ...stage, content: { en: 'Thanks for taking part.' } };
      expect(hasDefaultFinishSessionText(edited, 'en')).toBe(false);
      expect(
        defaultFinishSessionTextAfterLanguageChange(edited, addingFrench),
      ).toEqual({});
    });

    it('still fills in the text when only the stage was renamed, leaving the new name untranslated', () => {
      const renamed = { ...stage, label: { en: 'End' } };
      expect(hasDefaultFinishSessionText(renamed, 'en')).toBe(true);
      expect(afterChange(renamed, addingFrench)).toEqual({
        ...renamed,
        content: {
          ...stage.content,
          fr: DEFAULT_FINISH_SESSION_TEXT.fr.content,
        },
        finishedContent: {
          ...stage.finishedContent,
          fr: DEFAULT_FINISH_SESSION_TEXT.fr.finishedContent,
        },
      });
    });

    it('decides an automatic stage by its finished screen alone', () => {
      // Its closing screen is never shown, so it may be empty, or text the
      // researcher wrote before switching the mode.
      const automatic = {
        ...stage,
        mode: 'automatic' as const,
        content: { en: 'Written before the mode changed.' },
      };
      expect(hasDefaultFinishSessionText(automatic, 'en')).toBe(true);
      expect(afterChange(automatic, addingFrench)).toEqual({
        ...automatic,
        label: { ...stage.label, fr: DEFAULT_FINISH_SESSION_TEXT.fr.label },
        finishedContent: {
          ...stage.finishedContent,
          fr: DEFAULT_FINISH_SESSION_TEXT.fr.finishedContent,
        },
      });

      const emptyClosing = { ...automatic, content: {} };
      expect(hasDefaultFinishSessionText(emptyClosing, 'en')).toBe(true);

      const editedFinished = {
        ...automatic,
        finishedContent: { en: 'All done.' },
      };
      expect(hasDefaultFinishSessionText(editedFinished, 'en')).toBe(false);
    });

    it('leaves a language with no supplied text untranslated', () => {
      expect(
        afterChange(stage, {
          before: english,
          after: { defaultLocale: 'en', locales: ['en', 'ja'] },
        }),
      ).toEqual(stage);
    });

    it('keeps text the stage already has in the new language', () => {
      const translated = {
        ...stage,
        finishedContent: { ...stage.finishedContent, fr: '# Fin' },
      };
      expect(afterChange(translated, addingFrench).finishedContent).toEqual({
        ...stage.finishedContent,
        fr: '# Fin',
      });
    });
  });

  describe('correcting a language', () => {
    const correctedToGerman = {
      before: english,
      after: { defaultLocale: 'de', locales: ['de'] },
      renamed: { en: 'de' },
    };

    it('gives the corrected language its own supplied text', () => {
      expect(afterChange(stage, correctedToGerman)).toEqual({
        ...stage,
        label: { de: DEFAULT_FINISH_SESSION_TEXT.de.label },
        content: { de: DEFAULT_FINISH_SESSION_TEXT.de.content },
        finishedContent: { de: DEFAULT_FINISH_SESSION_TEXT.de.finishedContent },
      });
    });

    it('leaves text with nothing supplied in the corrected language untranslated', () => {
      expect(
        afterChange(stage, {
          before: english,
          after: { defaultLocale: 'ja', locales: ['ja'] },
          renamed: { en: 'ja' },
        }),
      ).toEqual({ ...stage, label: {}, content: {}, finishedContent: {} });
    });
  });
});

describe('closing text missing in the default language', () => {
  const japanese = { defaultLocale: 'ja', locales: ['ja'] };
  // As Architect creates it: nothing in the codebook yet, and the interface
  // text it uses, which has no wording in Japanese either.
  const japaneseProtocol = () =>
    withInterfaceText({
      ...createBaseProtocol(),
      codebook: { node: {}, edge: {}, ego: {} },
      localization: japanese,
      stages: [
        createDefaultFinishSessionStage({ id: 'end', localization: japanese }),
      ],
    });

  // Network Canvas writes its wording only in a language it has it in, so
  // the settings are left for the researcher to write too.
  it('creates the stage with no text, rather than text in another language', () => {
    expect(
      createDefaultFinishSessionStage({ id: 'end', localization: japanese }),
    ).toEqual({
      id: 'end',
      type: 'FinishSession',
      mode: 'confirmation',
      label: {},
      content: {},
      finishedContent: {},
      finishLabel: {},
      finishConfirmation: {},
      finishFailed: {},
      outcome: 'completed',
    });
  });

  it('is a protocol that can still be edited', async () => {
    expect(ProtocolSchemaV9.safeParse(japaneseProtocol()).success).toBe(true);
    expect(
      (await validateProtocol(japaneseProtocol(), { draft: true })).success,
    ).toBe(true);
  });

  it('is reported as missing closing and finished text and built-in wording, not as a schema error', async () => {
    const result = await validateProtocol(japaneseProtocol());
    expect(result.success).toBe(false);
    const builtIn = (setting: string) => ({
      code: BUILT_IN_WORDING_MISSING,
      path: ['stages', 0, setting, 'ja'],
      message:
        "Network Canvas has no built-in wording in the protocol's default language (ja), so this text must be written in it, or a language Network Canvas has wording in made the default.",
    });
    const found = result.error?.issues ?? [];
    // The interface text has no Japanese wording either: each entry is
    // built-in wording to write, like the finish stage's settings.
    const interfaceTextIssues = found.filter(
      ({ path }) => path[0] === 'interfaceText',
    );
    expect(interfaceTextIssues.length).toBeGreaterThan(0);
    expect(
      interfaceTextIssues.every(
        ({ code, path }) =>
          code === BUILT_IN_WORDING_MISSING && path.at(-1) === 'ja',
      ),
    ).toBe(true);
    expect(found.filter(({ path }) => path[0] !== 'interfaceText')).toEqual([
      {
        code: FINISH_STAGE_TEXT_MISSING,
        path: ['stages', 0, 'content', 'ja'],
        message:
          "The stage that ends the interview has no closing text in the protocol's default language (ja).",
      },
      {
        code: FINISH_STAGE_TEXT_MISSING,
        path: ['stages', 0, 'finishedContent', 'ja'],
        message:
          "The stage that ends the interview has no finished text in the protocol's default language (ja).",
      },
      builtIn('finishLabel'),
      builtIn('finishConfirmation'),
      builtIn('finishFailed'),
    ]);
  });

  it('needs no closing text in automatic mode, which has no closing screen', () => {
    const [stage] = japaneseProtocol().stages;
    expect(
      findFinishStageTextProblems({
        ...japaneseProtocol(),
        stages: [{ ...stage!, mode: 'automatic' }],
      }),
    ).toEqual([
      {
        stageId: 'end',
        stageIndex: 0,
        locale: 'ja',
        missing: ['finishedContent'],
      },
    ]);
  });

  it('finds the finish stage and what it is missing', () => {
    expect(findFinishStageTextProblems(japaneseProtocol())).toEqual([
      {
        stageId: 'end',
        stageIndex: 0,
        locale: 'ja',
        missing: ['content', 'finishedContent'],
      },
    ]);
  });

  it('counts only the default language: text in another one is not enough', () => {
    expect(
      findFinishStageTextProblems({
        localization: { defaultLocale: 'ja', locales: ['ja', 'en'] },
        stages: [
          {
            ...finish('end'),
            content: { en: '# All done', ja: '# 終わり' },
            finishedContent: { en: '# Thank you.' },
          },
        ],
      }),
    ).toEqual([
      {
        stageId: 'end',
        stageIndex: 0,
        locale: 'ja',
        missing: ['finishedContent'],
      },
    ]);
  });

  it('counts blank text as missing', () => {
    expect(
      findFinishStageTextProblems({
        localization: { defaultLocale: 'en', locales: ['en'] },
        stages: [
          information('intro'),
          { ...finish('end'), finishedContent: { en: '  ' } },
        ],
      }),
    ).toEqual([
      {
        stageId: 'end',
        stageIndex: 1,
        locale: 'en',
        missing: ['finishedContent'],
      },
    ]);
  });

  it('finds nothing once both are written', async () => {
    expect(
      findFinishStageTextProblems({
        ...createBaseProtocol(),
        stages: [finish()],
      }),
    ).toEqual([]);
    expect(
      (await validateProtocol(protocolWith([information('intro'), finish()])))
        .success,
    ).toBe(true);
  });

  it.each(['label', 'content', 'finishedContent'] as const)(
    'refuses a blank %s translation in any language, not only the default',
    (field) => {
      const localization = { defaultLocale: 'en', locales: ['en', 'fr'] };
      const stage = {
        ...finish('end'),
        [field]: { ...finish('end')[field], fr: ' \u200B\t' },
      };
      const result = ProtocolSchemaV9.safeParse({
        ...createBaseProtocol(),
        codebook: { node: {}, edge: {}, ego: {} },
        localization,
        stages: [stage],
      });
      expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
          path: ['stages', 0, field, 'fr'],
          message: 'Text cannot be blank.',
        }),
      );
    },
  );

  it('still allows a finish stage with no translation while the protocol is a draft', async () => {
    expect(
      (await validateProtocol(japaneseProtocol(), { draft: true })).success,
    ).toBe(true);
  });

  it('counts default-language text made of invisible characters as missing', () => {
    expect(
      findFinishStageTextProblems({
        localization: { defaultLocale: 'en', locales: ['en'] },
        stages: [{ ...finish('end'), content: { en: '\u200B\u00AD' } }],
      }),
    ).toEqual([
      { stageId: 'end', stageIndex: 0, locale: 'en', missing: ['content'] },
    ]);
  });

  it('allows empty text only on the finish stage', () => {
    expect(
      issues([{ ...information('intro'), title: {} }, finish()]),
    ).toContainEqual({
      path: ['stages', 0, 'title'],
      message: 'Text must have at least one translation.',
    });
  });
});
