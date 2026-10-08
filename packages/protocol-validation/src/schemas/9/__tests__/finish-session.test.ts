import { describe, expect, it } from 'vitest';

import {
  migrateProtocol,
  migrateProtocolWithSessions,
} from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol, {
  FINISH_STAGE_TEXT_MISSING,
} from '../../../validation/validate-protocol.ts';
import {
  createDefaultFinishSessionStage,
  DEFAULT_FINISH_SESSION_TEXT,
  defaultFinishSessionText,
  hasDefaultFinishSessionText,
  withDefaultFinishSessionTranslation,
} from '../finish-session-defaults.ts';
import { findFinishStageTextProblems } from '../finish-stage-text.ts';
import ProtocolSchemaV9 from '../schema.ts';
import { finishSessionStage } from '../stages/finish-session.ts';
import { findTimelineStructureProblems } from '../timeline-structure.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

const finish = (id = 'finish', outcome = 'completed') => ({
  id,
  type: 'FinishSession',
  label: { en: 'Finish' },
  title: { en: 'All done' },
  content: { en: 'Thank you.' },
  outcome,
});

const information = (id: string) => ({
  id,
  type: 'Information',
  label: { en: id },
  title: { en: id },
  items: [{ id: `${id}-text`, type: 'text', content: { en: 'Text' } }],
});

const protocolWith = (stages: unknown[]) => ({
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

  it.each(['title', 'content'] as const)('requires %s text', (field) => {
    expect(
      finishSessionStage.safeParse({ ...finish(), [field]: { en: '' } })
        .success,
    ).toBe(false);
  });

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

  it('a protocol has exactly one finish stage', () => {
    expect(issues([information('a'), finish(), finish('f2')])).toEqual([
      {
        path: ['stages', 2],
        message:
          'A protocol has exactly one finish stage, but this is a second one: the first is at position 2.',
      },
    ]);
    expect(
      issues([information('a'), finish(), information('b'), finish('f2')]),
    ).toEqual([
      {
        path: ['stages', 2],
        message:
          'This stage comes after the finish stage at position 2, so no participant can reach it.',
      },
      {
        path: ['stages', 3],
        message:
          'A protocol has exactly one finish stage, but this is a second one: the first is at position 2.',
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
    ).toEqual([{ kind: 'second-finish', stageIndex: 1, finishStageIndex: 0 }]);
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
      label: { [defaultLocale]: DEFAULT_FINISH_SESSION_TEXT.en.label },
      title: { [defaultLocale]: DEFAULT_FINISH_SESSION_TEXT.en.title },
      content: { [defaultLocale]: DEFAULT_FINISH_SESSION_TEXT.en.content },
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
      title: { [migrated.localization.defaultLocale]: 'Thanks' },
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
  it('serves a regional variant from its language', () => {
    expect(defaultFinishSessionText('en-US')).toBe(
      DEFAULT_FINISH_SESSION_TEXT.en,
    );
    expect(defaultFinishSessionText('en-GB')).toBe(
      DEFAULT_FINISH_SESSION_TEXT.en,
    );
    expect(defaultFinishSessionText('es-MX')).toBe(
      DEFAULT_FINISH_SESSION_TEXT.es,
    );
  });

  it('serves Chinese by script', () => {
    expect(defaultFinishSessionText('zh-TW')).toBe(
      DEFAULT_FINISH_SESSION_TEXT['zh-Hant'],
    );
    expect(defaultFinishSessionText('zh-CN')).toBe(
      DEFAULT_FINISH_SESSION_TEXT['zh-Hans'],
    );
  });

  it.each(['pt', 'pt-PT', 'ca', 'gl', 'ja', 'und'])(
    'has none for %s, rather than a neighbouring language',
    (locale) => {
      expect(defaultFinishSessionText(locale)).toBeUndefined();
    },
  );

  it('creates a stage with text in each language that has it', () => {
    expect(
      createDefaultFinishSessionStage({
        id: 'end',
        localization: { defaultLocale: 'en-US', locales: ['en-US', 'ja'] },
      }),
    ).toEqual({
      id: 'end',
      type: 'FinishSession',
      label: { 'en-US': DEFAULT_FINISH_SESSION_TEXT.en.label },
      title: { 'en-US': DEFAULT_FINISH_SESSION_TEXT.en.title },
      content: { 'en-US': DEFAULT_FINISH_SESSION_TEXT.en.content },
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
      ProtocolSchemaV9.safeParse({
        ...createBaseProtocol(),
        localization: { defaultLocale: 'en', locales },
        stages: [stage],
      }).success,
    ).toBe(true);
  });

  describe('adding a language', () => {
    const stage = createDefaultFinishSessionStage({
      id: 'end',
      localization: { defaultLocale: 'en', locales: ['en'] },
    });

    it('fills in the new language while the default language text is still the supplied text', () => {
      expect(hasDefaultFinishSessionText(stage, 'en')).toBe(true);
      expect(withDefaultFinishSessionTranslation(stage, 'fr', 'en')).toEqual({
        ...stage,
        label: { ...stage.label, fr: DEFAULT_FINISH_SESSION_TEXT.fr.label },
        title: { ...stage.title, fr: DEFAULT_FINISH_SESSION_TEXT.fr.title },
        content: {
          ...stage.content,
          fr: DEFAULT_FINISH_SESSION_TEXT.fr.content,
        },
      });
    });

    it('leaves the new language untranslated once the researcher has changed any of the text', () => {
      const edited = { ...stage, content: { en: 'Thanks for taking part.' } };
      expect(hasDefaultFinishSessionText(edited, 'en')).toBe(false);
      expect(withDefaultFinishSessionTranslation(edited, 'fr', 'en')).toBe(
        edited,
      );
    });

    it('still fills in the text when only the stage was renamed, leaving the new name untranslated', () => {
      const renamed = { ...stage, label: { en: 'End' } };
      expect(hasDefaultFinishSessionText(renamed, 'en')).toBe(true);
      expect(withDefaultFinishSessionTranslation(renamed, 'fr', 'en')).toEqual({
        ...renamed,
        title: { ...stage.title, fr: DEFAULT_FINISH_SESSION_TEXT.fr.title },
        content: {
          ...stage.content,
          fr: DEFAULT_FINISH_SESSION_TEXT.fr.content,
        },
      });
    });

    it('leaves a language with no supplied text untranslated', () => {
      expect(withDefaultFinishSessionTranslation(stage, 'ja', 'en')).toBe(
        stage,
      );
    });

    it('keeps text the stage already has in the new language', () => {
      const translated = { ...stage, title: { ...stage.title, fr: 'Fin' } };
      expect(
        withDefaultFinishSessionTranslation(translated, 'fr', 'en').title,
      ).toEqual({ ...stage.title, fr: 'Fin' });
    });
  });
});

describe('closing text missing in the default language', () => {
  const japanese = { defaultLocale: 'ja', locales: ['ja'] };
  // As Architect creates it: nothing in the codebook yet.
  const japaneseProtocol = () => ({
    ...createBaseProtocol(),
    codebook: { node: {}, edge: {}, ego: {} },
    localization: japanese,
    stages: [
      createDefaultFinishSessionStage({ id: 'end', localization: japanese }),
    ],
  });

  it('creates the stage with no text, rather than text in another language', () => {
    expect(
      createDefaultFinishSessionStage({ id: 'end', localization: japanese }),
    ).toEqual({
      id: 'end',
      type: 'FinishSession',
      label: {},
      title: {},
      content: {},
      outcome: 'completed',
    });
  });

  it('is a protocol that can still be edited', async () => {
    expect(ProtocolSchemaV9.safeParse(japaneseProtocol()).success).toBe(true);
    expect(
      (await validateProtocol(japaneseProtocol(), { draft: true })).success,
    ).toBe(true);
  });

  it('is reported as missing heading and text, not as a schema error', async () => {
    const result = await validateProtocol(japaneseProtocol());
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      {
        code: FINISH_STAGE_TEXT_MISSING,
        path: ['stages', 0, 'title', 'ja'],
        message:
          "The stage that ends the interview has no heading in the protocol's default language (ja).",
      },
      {
        code: FINISH_STAGE_TEXT_MISSING,
        path: ['stages', 0, 'content', 'ja'],
        message:
          "The stage that ends the interview has no text in the protocol's default language (ja).",
      },
    ]);
  });

  it('finds the finish stage and what it is missing', () => {
    expect(findFinishStageTextProblems(japaneseProtocol())).toEqual([
      {
        stageId: 'end',
        stageIndex: 0,
        locale: 'ja',
        missing: ['title', 'content'],
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
            title: { en: 'All done', ja: '終わり' },
            content: { en: 'Thank you.' },
          },
        ],
      }),
    ).toEqual([
      { stageId: 'end', stageIndex: 0, locale: 'ja', missing: ['content'] },
    ]);
  });

  it('counts blank text as missing', () => {
    expect(
      findFinishStageTextProblems({
        localization: { defaultLocale: 'en', locales: ['en'] },
        stages: [
          information('intro'),
          { ...finish('end'), title: { en: '  ' } },
        ],
      }),
    ).toEqual([
      { stageId: 'end', stageIndex: 1, locale: 'en', missing: ['title'] },
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

  it('allows empty text only on the finish stage', () => {
    expect(
      issues([{ ...information('intro'), title: {} }, finish()]),
    ).toContainEqual({
      path: ['stages', 0, 'title'],
      message: 'Text must have at least one translation.',
    });
  });
});
