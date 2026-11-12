import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol, {
  BUILT_IN_WORDING_MISSING,
} from '../../../validation/validate-protocol.ts';
import { findBuiltInWordingProblems } from '../built-in-wording.ts';
import { createDefaultFinishSessionStage } from '../finish-session-defaults.ts';
import {
  interfaceTextFor,
  interfaceTextShownBy,
  withInterfaceText,
} from '../interface-text.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

type WordingProtocol = Parameters<typeof findBuiltInWordingProblems>[0];

type Document = Record<string, unknown> & {
  interfaceText?: Record<string, Record<string, unknown>>;
};

/** The base protocol, ending at a finish stage and holding its interface text. */
const baseProtocol = (): Document => withFinishStage(createBaseProtocol());

/** The protocol's name attribute required and at least two letters long. */
const withNameRules = (protocol: Document): Document => {
  const document = structuredClone(protocol);
  const codebook = document.codebook as {
    node: { person: { variables: { name: Record<string, unknown> } } };
  };
  codebook.node.person.variables.name.validation = {
    required: true,
    minLength: 2,
  };
  return withInterfaceText(
    document as Document & {
      localization: { defaultLocale: string; locales: string[] };
    },
  );
};

const interfaceTextIssues = async (
  protocol: unknown,
  options?: { draft?: boolean },
) => {
  const result = await validateProtocol(protocol, options);
  return (result.error?.issues ?? []).filter(
    ({ path }) => path[0] === 'interfaceText',
  );
};

describe('the interface text a protocol may hold', () => {
  it('accepts a protocol holding all the interface text it uses', async () => {
    expect((await validateProtocol(baseProtocol())).error?.issues).toBe(
      undefined,
    );
    expect(
      (await validateProtocol(withNameRules(baseProtocol()))).success,
    ).toBe(true);
  });

  it('accepts a protocol with no interface text, in a default language Network Canvas supplies', async () => {
    const { interfaceText: _held, ...protocol } = baseProtocol();
    expect(Object.keys(interfaceTextFor(protocol as never))).toContain(
      'navigation',
    );

    for (const draft of [false, true]) {
      expect((await validateProtocol(protocol, { draft })).error?.issues).toBe(
        undefined,
      );
    }
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect(
      findBuiltInWordingProblems(protocol as unknown as WordingProtocol),
    ).toEqual([]);
  });

  it('accepts a protocol missing a group, an entry or a button it shows', async () => {
    const protocol = withNameRules(baseProtocol());
    delete protocol.interfaceText?.navigation;
    delete protocol.interfaceText?.validation?.required;
    delete protocol.interfaceText?.buttons?.done;

    for (const draft of [false, true]) {
      expect((await validateProtocol(protocol, { draft })).error?.issues).toBe(
        undefined,
      );
    }

    const quickAdd: Document = completeProtocol();
    expect(quickAdd.interfaceText?.quickAdd).toBeDefined();
    delete quickAdd.interfaceText?.quickAdd;
    expect((await validateProtocol(quickAdd)).error?.issues).toBe(undefined);
  });

  it('still refuses an unknown group or entry, and blank text', async () => {
    const group = baseProtocol();
    Object.assign(group.interfaceText ?? {}, { invented: { a: { en: 'A' } } });
    const entry = baseProtocol();
    Object.assign(entry.interfaceText?.navigation ?? {}, {
      invented: { en: 'A' },
    });
    const blank = baseProtocol();
    Object.assign(blank.interfaceText?.navigation ?? {}, { back: { en: ' ' } });

    for (const protocol of [group, entry, blank]) {
      expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(false);
      expect((await interfaceTextIssues(protocol)).length).toBeGreaterThan(0);
    }
  });

  it('reports what the interview shows and the protocol lacks, in a default language Network Canvas has no wording in', async () => {
    const swahili = { defaultLocale: 'sw', locales: ['sw'] };
    const protocol = {
      ...createBaseProtocol(),
      codebook: { node: {}, edge: {}, ego: {} },
      localization: swahili,
      stages: [
        createDefaultFinishSessionStage({ id: 'end', localization: swahili }),
      ],
    };
    const used = interfaceTextShownBy(protocol);

    expect(used.length).toBeGreaterThan(0);
    const issues = (await validateProtocol(protocol)).error?.issues.filter(
      ({ code }) => code === BUILT_IN_WORDING_MISSING,
    );
    expect(issues?.map(({ path }) => path)).toEqual(
      expect.arrayContaining(
        used.map(({ group, key }) => ['interfaceText', group, key, 'sw']),
      ),
    );
    expect((await validateProtocol(protocol, { draft: true })).success).toBe(
      true,
    );
  });

  it('accepts an entry held as undefined, as if absent', async () => {
    const { protocol } = withUndefinedText();

    for (const draft of [false, true]) {
      expect(await interfaceTextIssues(protocol, { draft })).toEqual([]);
    }
  });

  /**
   * The base protocol with Done held as undefined, and the search group held
   * as undefined: keys an object in memory may hold that a saved file drops.
   */
  const withUndefinedText = () => {
    const protocol = baseProtocol();
    const held = protocol.interfaceText ?? {};
    return {
      protocol: {
        ...protocol,
        localization: { defaultLocale: 'en', locales: ['en'] },
        interfaceText: {
          ...held,
          buttons: { ...held.buttons, done: undefined },
          search: undefined,
        },
      },
      held,
    };
  };

  it('fills an entry or a group held as undefined, as if absent', () => {
    const { protocol, held } = withUndefinedText();
    const filled = interfaceTextFor(protocol);

    expect(held.buttons?.done).toBeDefined();
    expect(filled.buttons?.done).toEqual(held.buttons?.done);
    expect(filled.search).toEqual(held.search);
    expect(withInterfaceText(protocol).interfaceText).toEqual(filled);
  });

  it('still accepts a group, or an entry, the protocol does not use', async () => {
    const protocol = baseProtocol();
    const unused = interfaceTextFor({
      ...protocol,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: { person: { variables: { name: { encrypted: true } } } },
      },
    });
    expect(protocol.interfaceText?.passphrase).toBeUndefined();
    const held = {
      ...protocol,
      interfaceText: {
        ...protocol.interfaceText,
        passphrase: unused.passphrase,
        validation: { maxValue: { en: 'Must be at most {max}.' } },
      },
    };

    expect((await validateProtocol(held)).error?.issues).toBe(undefined);
  });

  it('accepts an entry with no text yet in a language Network Canvas has no wording in, while a draft', async () => {
    const japanese = { defaultLocale: 'ja', locales: ['ja'] };
    const document = {
      ...createBaseProtocol(),
      codebook: { node: {}, edge: {}, ego: {} },
      localization: japanese,
      stages: [
        createDefaultFinishSessionStage({ id: 'end', localization: japanese }),
      ],
    };
    const protocol = { ...document, interfaceText: interfaceTextFor(document) };
    expect(protocol.interfaceText.navigation?.exitInterview).toEqual({});

    expect((await validateProtocol(protocol, { draft: true })).success).toBe(
      true,
    );
  });

  it('migrates a schema 8 protocol to one that holds its interface text', async () => {
    const migrated = migrateProtocol(asSchema8Protocol(completeProtocol()), 9);

    expect(migrated.interfaceText).toEqual(interfaceTextFor(migrated));
    expect((await validateProtocol(migrated)).error?.issues).toBe(undefined);
  });
});
