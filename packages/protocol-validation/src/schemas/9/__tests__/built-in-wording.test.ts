import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol, {
  BUILT_IN_WORDING_MISSING,
} from '../../../validation/validate-protocol.ts';
import { findBuiltInWordingProblems } from '../built-in-wording.ts';
import { createDefaultFinishSessionStage } from '../finish-session-defaults.ts';
import {
  interfaceTextShown,
  interfaceTextShownBy,
  interfaceTextWithUpdates,
  withInterfaceText,
} from '../interface-text.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

type Localization = { defaultLocale: string; locales: string[] };

// As Architect creates a protocol: a finish stage, holding none of the wording
// Network Canvas supplies (the interview shows that wording).
const protocolIn = (localization: Localization) =>
  withInterfaceText({
    ...createBaseProtocol(),
    codebook: { node: {}, edge: {}, ego: {} },
    localization,
    stages: [createDefaultFinishSessionStage({ id: 'end', localization })],
  });

// `withInterfaceText` returns the document it was given, typed without the
// text it holds.
const heldBackButton = (protocol: object) =>
  (protocol as { interfaceText?: { navigation?: { back?: unknown } } })
    .interfaceText?.navigation?.back;

// The back button text the interview shows.
const shownBackButton = (protocol: {
  localization: Localization;
  interfaceText?: unknown;
}) =>
  interfaceTextShown(
    protocol.interfaceText,
    'navigation',
    'back',
    protocol.localization,
  );

const mexicanWithSpanish = { defaultLocale: 'es-MX', locales: ['es-MX', 'es'] };

describe('built-in wording in a default language Network Canvas has none in', () => {
  it('is none in a default language Network Canvas has wording in', async () => {
    const protocol = protocolIn({ defaultLocale: 'en', locales: ['en', 'es'] });
    expect(findBuiltInWordingProblems(protocol)).toEqual([]);
    expect((await validateProtocol(protocol)).success).toBe(true);
  });

  it('lets a regional variant fall back to its base language while the protocol is written', async () => {
    const protocol = protocolIn(mexicanWithSpanish);
    expect(heldBackButton(protocol)).toBeUndefined();
    expect(shownBackButton(protocol)).toEqual({ es: 'Volver' });
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect((await validateProtocol(protocol, { draft: true })).success).toBe(
      true,
    );
  });

  it('stops the protocol leaving its editor until the default language has it', async () => {
    const protocol = protocolIn(mexicanWithSpanish);
    const problems = findBuiltInWordingProblems(protocol);
    expect(problems).toContainEqual({
      path: ['interfaceText', 'navigation', 'back'],
      locale: 'es-MX',
    });
    expect(problems).toContainEqual({
      path: ['stages', 0, 'finishLabel'],
      locale: 'es-MX',
    });

    const result = await validateProtocol(protocol);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        code: BUILT_IN_WORDING_MISSING,
        path: ['interfaceText', 'navigation', 'back', 'es-MX'],
      }),
    );
  });

  it('is met by making the base language the default', async () => {
    const protocol = {
      ...protocolIn(mexicanWithSpanish),
      localization: { defaultLocale: 'es', locales: ['es-MX', 'es'] },
    };
    expect(findBuiltInWordingProblems(protocol)).toEqual([]);
  });

  it('shows wording with no translation at all in a language Network Canvas has none in', () => {
    const protocol = protocolIn({ defaultLocale: 'sw', locales: ['sw'] });
    expect(heldBackButton(protocol)).toBeUndefined();
    expect(shownBackButton(protocol)).toEqual({});
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect(findBuiltInWordingProblems(protocol)).toContainEqual({
      path: ['interfaceText', 'navigation', 'back'],
      locale: 'sw',
    });
  });

  it('is never English shown in place of the default language', () => {
    const protocol = protocolIn({ defaultLocale: 'sw', locales: ['sw', 'en'] });
    expect(heldBackButton(protocol)).toBeUndefined();
    expect(shownBackButton(protocol)).toEqual({ en: 'Back' });
  });
});

/** A protocol whose finish stage holds none of the wording supplied for it. */
const holdingNothing = (localization: Localization) => {
  const bare = createDefaultFinishSessionStage({ id: 'end', localization });
  return {
    ...createBaseProtocol(),
    codebook: { node: {}, edge: {}, ego: {} },
    localization,
    stages: [bare],
  };
};

const FINISH_SETTINGS = ['finishLabel', 'finishConfirmation', 'finishFailed'];

describe('the text the interview shows, counting Network Canvas’s own wording', () => {
  it('needs the protocol to hold none, in a default language Network Canvas has wording in', async () => {
    for (const defaultLocale of ['en', 'en-US']) {
      const protocol = holdingNothing({
        defaultLocale,
        locales: [defaultLocale],
      });
      expect('interfaceText' in protocol).toBe(false);
      expect(findBuiltInWordingProblems(protocol)).toEqual([]);
      const result = await validateProtocol(protocol);
      expect(
        result.error?.issues.filter(
          ({ code }) => code === BUILT_IN_WORDING_MISSING,
        ),
      ).toBeUndefined();
      expect(result.success).toBe(true);
    }
  });

  it('needs the protocol to hold all of it, in a default language Network Canvas has none in', async () => {
    const protocol = holdingNothing({ defaultLocale: 'sw', locales: ['sw'] });
    const shown = interfaceTextShownBy(protocol);
    const problems = findBuiltInWordingProblems(protocol);

    expect(shown.length).toBeGreaterThan(0);
    expect(problems).toEqual([
      ...shown.map(({ group, key }) => ({
        path: ['interfaceText', group, key],
        locale: 'sw',
      })),
      ...FINISH_SETTINGS.map((setting) => ({
        path: ['stages', 0, setting],
        locale: 'sw',
      })),
    ]);

    const result = await validateProtocol(protocol);
    expect(
      result.error?.issues
        .filter(({ code }) => code === BUILT_IN_WORDING_MISSING)
        .map(({ path }) => path),
    ).toEqual(problems.map(({ path }) => [...path, 'sw']));
    expect((await validateProtocol(protocol, { draft: true })).success).toBe(
      true,
    );
  });

  it('is met by writing each text in the default language', async () => {
    const protocol = holdingNothing({ defaultLocale: 'sw', locales: ['sw'] });
    const written = {
      ...protocol,
      // A protocol in a language Network Canvas has no wording in also names
      // a fallback language before it is handed over.
      localization: { ...protocol.localization, fallbackLocale: 'en' },
      interfaceText: interfaceTextWithUpdates(
        undefined,
        interfaceTextShownBy(protocol).map(({ group, key }) => ({
          group,
          key,
          value: { sw: 'Maandishi' },
        })),
      ),
      stages: protocol.stages.map((stage) => ({
        ...stage,
        // The finish stage's own closing and finished screens, which Network
        // Canvas has no wording for.
        content: { sw: 'Asante.' },
        finishedContent: { sw: 'Umekamilika.' },
        finishLabel: { sw: 'Maliza' },
        finishConfirmation: { sw: 'Una uhakika?' },
        finishFailed: { sw: 'Imeshindwa' },
      })),
    };

    expect(findBuiltInWordingProblems(written)).toEqual([]);
    expect((await validateProtocol(written)).success).toBe(true);
  });

  it('counts only the default language: text held in another does not meet it', () => {
    const localization = { defaultLocale: 'sw', locales: ['sw', 'es'] };
    const protocol = {
      ...holdingNothing(localization),
      interfaceText: {
        navigation: { back: { es: 'Volver' }, next: { sw: 'Endelea' } },
      },
      stages: [
        {
          ...holdingNothing(localization).stages[0],
          finishLabel: { es: 'Terminar' },
          finishConfirmation: { sw: 'Una uhakika?', es: '¿Seguro?' },
        },
      ],
    };
    const paths = findBuiltInWordingProblems(protocol).map(({ path }) =>
      path.join('.'),
    );

    expect(paths).toContain('interfaceText.navigation.back');
    expect(paths).not.toContain('interfaceText.navigation.next');
    expect(paths).toContain('stages.0.finishLabel');
    expect(paths).not.toContain('stages.0.finishConfirmation');
    expect(paths).toContain('stages.0.finishFailed');
  });

  it('counts blank text as none', () => {
    const protocol = {
      ...holdingNothing({ defaultLocale: 'sw', locales: ['sw'] }),
      interfaceText: { navigation: { back: { sw: '   ' } } },
    };

    expect(
      findBuiltInWordingProblems(protocol).map(({ path }) => path.join('.')),
    ).toContain('interfaceText.navigation.back');
  });

  it('leaves out the text of a setting the stage is not configured to show', () => {
    const swahili = { defaultLocale: 'sw', locales: ['sw'] };
    const problemsOf = (behaviours: object) =>
      findBuiltInWordingProblems({
        localization: swahili,
        stages: [{ type: 'NameGenerator', behaviours }],
      })
        .map(({ path }) => path.join('.'))
        .filter((path) => path.startsWith('stages.'));

    expect(problemsOf({})).toEqual([]);
    expect(problemsOf({ minNodes: 2 })).toEqual(['stages.0.minNodesNotice']);
  });
});
