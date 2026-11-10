import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import { createDefaultFinishSessionStage } from '../finish-session-defaults.ts';
import { interfaceTextFor, withInterfaceText } from '../interface-text.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

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

describe('the interface text a protocol must hold', () => {
  it('accepts a protocol holding all the interface text it uses', async () => {
    expect((await validateProtocol(baseProtocol())).error?.issues).toBe(
      undefined,
    );
    expect(
      (await validateProtocol(withNameRules(baseProtocol()))).success,
    ).toBe(true);
  });

  it('refuses a protocol with no interface text, at each group it uses', async () => {
    const { interfaceText: _held, ...protocol } = baseProtocol();
    const used = Object.keys(
      interfaceTextFor(protocol as Parameters<typeof interfaceTextFor>[0]),
    );
    expect(used).toContain('navigation');

    for (const draft of [false, true]) {
      const issues = await interfaceTextIssues(protocol, { draft });
      expect(issues.map(({ path }) => path)).toEqual(
        used.map((group) => ['interfaceText', group]),
      );
    }
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(false);
  });

  it('refuses a protocol missing one group it uses, naming the entries the group must hold', async () => {
    const protocol = baseProtocol();
    const navigation = Object.keys(protocol.interfaceText?.navigation ?? {});
    delete protocol.interfaceText?.navigation;

    expect(await interfaceTextIssues(protocol)).toEqual([
      {
        code: 'custom',
        path: ['interfaceText', 'navigation'],
        message: `The interview shows text from the "navigation" interface text group, so the protocol must hold this group, with these entries in its languages: ${navigation.map((key) => `"${key}"`).join(', ')}.`,
      },
    ]);
  });

  it('refuses a protocol missing the group of a kind of stage it has', async () => {
    const protocol: Document = completeProtocol();
    expect(protocol.interfaceText?.quickAdd).toBeDefined();
    delete protocol.interfaceText?.quickAdd;

    expect(
      (await interfaceTextIssues(protocol)).map(({ path }) => path),
    ).toEqual([['interfaceText', 'quickAdd']]);
  });

  it('refuses a protocol missing the message of a validation rule it uses, though it holds others', async () => {
    const protocol = withNameRules(baseProtocol());
    expect(Object.keys(protocol.interfaceText?.validation ?? {})).toEqual([
      'required',
      'minLength',
    ]);
    delete protocol.interfaceText?.validation?.required;

    for (const draft of [false, true]) {
      expect(await interfaceTextIssues(protocol, { draft })).toEqual([
        {
          code: 'custom',
          path: ['interfaceText', 'validation', 'required'],
          message:
            'The interview shows the "required" text of the "validation" interface text group, so the group must hold it in the protocol\'s languages.',
        },
      ]);
    }
  });

  it('refuses a protocol missing a button it shows', async () => {
    // The base protocol's name generator closes its form with Done.
    const protocol = baseProtocol();
    delete protocol.interfaceText?.buttons?.done;

    expect(
      (await interfaceTextIssues(protocol)).map(({ path }) => path),
    ).toEqual([['interfaceText', 'buttons', 'done']]);
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

  it('refuses an entry or a group it shows held as undefined, as if absent', async () => {
    const { protocol } = withUndefinedText();

    for (const draft of [false, true]) {
      expect(
        (await interfaceTextIssues(protocol, { draft })).map(
          ({ path }) => path,
        ),
      ).toEqual([
        ['interfaceText', 'buttons', 'done'],
        ['interfaceText', 'search'],
      ]);
    }
  });

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
