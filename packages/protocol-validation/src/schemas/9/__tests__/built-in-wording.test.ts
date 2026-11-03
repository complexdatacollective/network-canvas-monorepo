import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol, {
  BUILT_IN_WORDING_MISSING,
} from '../../../validation/validate-protocol.ts';
import { findBuiltInWordingProblems } from '../built-in-wording.ts';
import { createDefaultFinishSessionStage } from '../finish-session-defaults.ts';
import { withInterfaceText } from '../interface-text.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

type Localization = { defaultLocale: string; locales: string[] };

// As Architect creates a protocol: a finish stage and the interface text,
// each written in every language Network Canvas has wording in exactly.
const protocolIn = (localization: Localization) =>
  withInterfaceText({
    ...createBaseProtocol(),
    codebook: { node: {}, edge: {}, ego: {} },
    localization,
    stages: [createDefaultFinishSessionStage({ id: 'end', localization })],
  });

// `withInterfaceText` returns the document it was given, typed without the
// text it adds.
const backButton = (protocol: object) =>
  (protocol as { interfaceText?: { navigation?: { back?: unknown } } })
    .interfaceText?.navigation?.back;

const mexicanWithSpanish = { defaultLocale: 'es-MX', locales: ['es-MX', 'es'] };

describe('built-in wording in a default language Network Canvas has none in', () => {
  it('is none in a default language Network Canvas has wording in', async () => {
    const protocol = protocolIn({ defaultLocale: 'en', locales: ['en', 'es'] });
    expect(findBuiltInWordingProblems(protocol)).toEqual([]);
    expect((await validateProtocol(protocol)).success).toBe(true);
  });

  it('lets a regional variant fall back to its base language while the protocol is written', async () => {
    const protocol = protocolIn(mexicanWithSpanish);
    expect(backButton(protocol)).toEqual({ es: 'Volver' });
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

  it('holds wording with no translation at all in a language Network Canvas has none in', () => {
    const protocol = protocolIn({ defaultLocale: 'sw', locales: ['sw'] });
    expect(backButton(protocol)).toEqual({});
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect(findBuiltInWordingProblems(protocol)).toContainEqual({
      path: ['interfaceText', 'navigation', 'back'],
      locale: 'sw',
    });
  });

  it('is never English written in place of the default language', () => {
    const protocol = protocolIn({ defaultLocale: 'sw', locales: ['sw', 'en'] });
    expect(backButton(protocol)).toEqual({ en: 'Back' });
  });
});
