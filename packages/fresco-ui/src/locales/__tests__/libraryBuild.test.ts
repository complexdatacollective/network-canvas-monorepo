// Guards the one thing only the PUBLISHED artifact can get wrong.
//
// An npm consumer running app-i18n's production Vite integration compiles its
// own sources and its own catalogs, and can reach neither of this package's:
// the FormatJS source transform excludes node_modules, and the catalog
// compiler only matches `.json` module ids, by which point `dist/locales` is
// JavaScript. The same integration swaps in FormatJS's no-parser runtime, so
// any message still carrying an ICU string throws when it is formatted and
// react-intl falls back to returning that string verbatim — a placeholder
// message renders as "Enter at most {max} characters." and a plural one as
// its whole `{count, plural, …}` body.
//
// So `vite build` — and only `vite build` — has to pre-parse both halves.
// This reads the plugin list out of the package's real config with the
// build's environment and runs the transforms, because every way this breaks
// (the plugins dropped, the gating inverted, an id pattern that stops
// matching this package's layout) is silent: nothing errors, the strings just
// sail through into dist.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin, PluginOption, UserConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = resolve(localesDir, '..', '..');

function collectPlugins(option: PluginOption | PluginOption[]): Plugin[] {
  if (Array.isArray(option)) return option.flatMap(collectPlugins);
  if (typeof option === 'object' && option !== null && 'name' in option) {
    return [option];
  }
  return [];
}

/** The plugins `vite build` gets — not the ones Storybook or Vitest do. */
async function libraryBuildPlugins(): Promise<Plugin[]> {
  vi.stubEnv('VITEST', '');
  vi.stubEnv('STORYBOOK', '');
  vi.resetModules();
  const { default: config } = (await import('../../../vite.config')) as {
    default: UserConfig;
  };
  return collectPlugins(config.plugins ?? []);
}

type TransformHandler = (this: unknown, code: string, id: string) => unknown;

/** Runs one plugin's transform hook, whichever form it declares it in. */
async function runTransform(
  plugins: Plugin[],
  pluginName: string,
  code: string,
  id: string,
): Promise<string> {
  const plugin = plugins.find((entry) => entry.name === pluginName);
  if (!plugin) {
    throw new Error(`the library build installs no "${pluginName}" plugin`);
  }
  const hook = plugin.transform;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  if (typeof handler !== 'function') {
    throw new Error(`"${pluginName}" declares no transform hook`);
  }
  const result = await (handler as unknown as TransformHandler).call(
    {},
    code,
    id,
  );
  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null && 'code' in result) {
    const { code: transformed } = result as { code: unknown };
    if (typeof transformed === 'string') return transformed;
  }
  throw new Error(`"${pluginName}" left ${id} untransformed`);
}

// The import shape every localized module in this package uses. FormatJS
// matches `defineMessages` by name, and this package re-exports it through
// `@codaco/app-i18n/messages` rather than importing react-intl directly.
const SOURCE_MODULE = `
import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  hint: {
    id: 'frescoUi.demo.hint',
    defaultMessage: 'Enter at most {max} characters.',
    description: 'Hint summarising a maximum text length rule.',
  },
});
`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('what the library build emits for this package’s messages', () => {
  it('pre-parses the defaultMessage of a descriptor', async () => {
    const transformed = await runTransform(
      await libraryBuildPlugins(),
      'formatjs',
      SOURCE_MODULE,
      join(packageRoot, 'src', 'Demo.tsx'),
    );

    // An AST is an array of parts, and the placeholder survives as a
    // structured argument rather than as the literal `{max}`.
    expect(transformed).toContain('"type":1');
    expect(transformed).not.toContain('Enter at most {max} characters.');
  });

  it('pre-parses the committed override catalog', async () => {
    const catalog = readFileSync(join(localesDir, 'en-GB.json'), 'utf8');

    const transformed = await runTransform(
      await libraryBuildPlugins(),
      'app-i18n-catalogs',
      catalog,
      join(localesDir, 'en-GB.json'),
    );

    // A literal message compiles to a one-element AST that still spells the
    // message out, so matching on the text proves nothing. What separates a
    // compiled catalog from a passed-through one is the shape: every value is
    // an array of parts rather than the ICU string it started as.
    const emitted = /^export default (?<catalog>.+);$/s.exec(transformed)
      ?.groups?.catalog;
    expect(emitted).toBeDefined();
    const compiled = JSON.parse(emitted ?? '') as Record<string, unknown>;

    expect(Object.keys(compiled)).toEqual(
      Object.keys(JSON.parse(catalog) as Record<string, string>),
    );
    expect(Object.keys(compiled).length).toBeGreaterThan(0);
    for (const message of Object.values(compiled)) {
      expect(Array.isArray(message)).toBe(true);
    }
  });
});
