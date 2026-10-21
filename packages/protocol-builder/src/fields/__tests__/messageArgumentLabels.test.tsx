import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales, loadCatalog } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import {
  CurrentProtocolSchema,
  type MessageArgument,
  type MessageArguments,
} from '@codaco/protocol-validation';

import { protocolBuilderCatalogLoaders } from '../../locales/catalogs.ts';
import { useMessageArgumentLabels } from '../messageArgumentLabels.ts';

/**
 * A researcher is shown every argument a localized message can use: a heading
 * over each version a select argument chooses between, and a name for each
 * text or plural argument. An argument with no label leaves its version's
 * editor unnamed and shows the researcher a raw identifier, so this walks
 * every setting the current schema declares and fails for one a label is
 * missing for, in every language.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSchema = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && isRecord(value._zod);

const isArgument = (value: unknown): value is MessageArgument =>
  isRecord(value) &&
  (value.kind === 'text' ||
    value.kind === 'plural' ||
    (value.kind === 'select' && Array.isArray(value.cases)));

type DeclaredArgument = Readonly<{
  /** The first setting's path that declares it, for the failure message. */
  setting: string;
  name: string;
  argument: MessageArgument;
}>;

/**
 * The arguments of every localized message in `schema`, read from the
 * declaration each setting is tagged with (the `localizedMessage` metadata),
 * so a setting added to the schema is covered without being listed here.
 */
function declaredArguments(schema: unknown): DeclaredArgument[] {
  const declared: DeclaredArgument[] = [];
  const seen = new Set<unknown>();

  const visit = (node: unknown, path: string) => {
    if (!isSchema(node) || seen.has(node)) return;
    seen.add(node);

    const meta: unknown =
      typeof node.meta === 'function' ? node.meta() : undefined;
    const tagged = isRecord(meta) ? meta.localizedString : undefined;
    if (isRecord(tagged) && isRecord(tagged.arguments)) {
      const argumentsOf: MessageArguments = Object.fromEntries(
        Object.entries(tagged.arguments).filter(
          (entry): entry is [string, MessageArgument] => isArgument(entry[1]),
        ),
      );
      for (const [name, argument] of Object.entries(argumentsOf)) {
        declared.push({ setting: path, name, argument });
      }
    }

    const definition = isRecord(node._zod) ? node._zod.def : undefined;
    if (!isRecord(definition)) return;
    for (const [key, value] of Object.entries(definition)) {
      if (key === 'getter' && typeof value === 'function') {
        visit((value as () => unknown)(), path);
      } else if (isSchema(value)) {
        visit(value, path);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}[${index}]`));
      } else if (key === 'shape' && isRecord(value)) {
        for (const [field, child] of Object.entries(value)) {
          visit(child, path === '' ? field : `${path}.${field}`);
        }
      }
    }
  };

  visit(schema, '');
  return declared;
}

const declared = declaredArguments(CurrentProtocolSchema);

const messageLanguages = [
  'en',
  ...Object.keys(protocolBuilderCatalogLoaders),
] as const;

const labelsIn = async (locale: string) => {
  const messages =
    locale === 'en'
      ? undefined
      : await loadCatalog(locale, protocolBuilderCatalogLoaders);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppI18nProvider
      locale={locale}
      locales={ecosystemLocales}
      messages={messages}
    >
      {children}
    </AppI18nProvider>
  );
  return renderHook(() => useMessageArgumentLabels(), { wrapper }).result
    .current;
};

const isBlank = (label: string | undefined) =>
  label === undefined || label.trim() === '';

describe('the labels of a localized message’s arguments', () => {
  it('finds the arguments the schema declares', () => {
    const names = new Set(declared.map(({ name }) => name));
    // One from each kind of site: a stage's wording, a name generator's
    // notice, a narrative pedigree's heading and the interface text.
    for (const name of ['isYou', 'who', 'term', 'count', 'title', 'hasLabel']) {
      expect(names).toContain(name);
    }
    expect(
      declared.some(
        ({ argument }) =>
          argument.kind === 'select' && argument.cases.includes('twinIsYou'),
      ),
    ).toBe(true);
  });

  it.each(messageLanguages)(
    'names every select case and placeholder in %s',
    async (locale) => {
      const { caseLabels, placeholderLabels } = await labelsIn(locale);
      const unlabelled = declared.flatMap(({ name, argument, setting }) => {
        if (argument.kind !== 'select') {
          return isBlank(placeholderLabels[name])
            ? [`${setting}: placeholder “${name}”`]
            : [];
        }
        return [...new Set([...argument.cases, 'other'])]
          .filter((option) => isBlank(caseLabels[name]?.[option]))
          .map((option) => `${setting}: “${name}” case “${option}”`);
      });
      expect([...new Set(unlabelled)]).toEqual([]);
    },
  );

  it('never shows an identifier where a name belongs', async () => {
    const { caseLabels, placeholderLabels } = await labelsIn('en');
    const identifiers = declared.flatMap(({ name, argument }) =>
      argument.kind === 'select'
        ? [...argument.cases].filter(
            (option) => caseLabels[name]?.[option] === option,
          )
        : placeholderLabels[name] === name
          ? [name]
          : [],
    );
    expect(identifiers).toEqual([]);
  });
});
