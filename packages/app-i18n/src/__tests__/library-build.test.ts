import { describe, expect, it } from 'vitest';

import config from '../../vite.config.ts';

/**
 * What this package's own published build does to its messages.
 *
 * `common.*` descriptors and their catalogs ship inside `dist`, so they have
 * to be compiled on the way out, exactly as a host compiles its own. Shipping
 * them as ICU source looks harmless for as long as every message is
 * placeholder-free literal text: a host whose production bundle has aliased
 * the ICU parser away cannot format them, falls back to rendering the source
 * verbatim, and for `Cancel` that is the same string. The first message with a
 * placeholder — or the first real translation — is where that stops being
 * true, which is why this is a guard on the build rather than on any output
 * text.
 */

type ConfiguredPlugin = Readonly<{ name: string; transform?: unknown }>;

type TransformResult = { code: string } | undefined | null;
type TransformHandler = (
  code: string,
  id: string,
) => TransformResult | Promise<TransformResult>;

const isConfiguredPlugin = (value: unknown): value is ConfiguredPlugin =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  typeof (value as { name: unknown }).name === 'string';

const configuredPlugins = ((config.plugins ?? []) as unknown[])
  .flat(9)
  .filter(isConfiguredPlugin);

const pluginNamed = (name: string): ConfiguredPlugin => {
  const plugin = configuredPlugins.find((entry) => entry.name === name);
  if (plugin === undefined) {
    throw new Error(`the build config has no ${name} plugin`);
  }
  return plugin;
};

const transformOf = (plugin: ConfiguredPlugin): TransformHandler => {
  const hook = plugin.transform;
  if (typeof hook === 'function') return hook as TransformHandler;
  // Vite's object hook form, `{ filter, handler }`, which is what the formatjs
  // unplugin registers.
  if (typeof hook === 'object' && hook !== null && 'handler' in hook) {
    return (hook as { handler: TransformHandler }).handler;
  }
  throw new Error(`${plugin.name} has no transform hook`);
};

const DESCRIPTOR_SOURCE = `import { defineMessages } from 'react-intl';
export const messages = defineMessages({
  hello: {
    id: 'demo.hello',
    defaultMessage: 'Hello {name}',
    description: 'Test greeting.',
  },
});
`;

describe('the published library build', () => {
  it('compiles the descriptors it ships to AST', async () => {
    const transform = transformOf(pluginNamed('formatjs'));
    const result = await transform(DESCRIPTOR_SOURCE, '/app/src/demo.ts');
    expect(result?.code).not.toContain('Hello {name}');
    expect(result?.code).toContain('"type"');
  });

  it('compiles descriptors written against the documented wrapper', async () => {
    // Everything in this repo imports `defineMessages` from
    // `@codaco/app-i18n/messages`, never from react-intl. The transform
    // matches on the called name rather than on where it was imported from,
    // so the wrapper is compiled identically — pinned here because a change
    // to that upstream matching would otherwise leave every real call site
    // shipping ICU strings into a bundle with no parser.
    const transform = transformOf(pluginNamed('formatjs'));
    const result = await transform(
      DESCRIPTOR_SOURCE.replace("'react-intl'", "'@codaco/app-i18n/messages'"),
      '/app/src/demo.ts',
    );
    expect(result?.code).not.toContain('Hello {name}');
    expect(result?.code).toContain('"type"');
  });

  it('compiles the catalogs it ships to AST', async () => {
    const transform = transformOf(pluginNamed('app-i18n-catalogs'));
    const result = await transform(
      JSON.stringify({ 'demo.hello': 'Hello {name}' }),
      '/app/src/locales/en-GB.json',
    );
    expect(result?.code).not.toContain('Hello {name}');
    expect(result?.code).toContain('"type"');
  });

  it('leaves the ICU parser resolvable for consumers', () => {
    // Swapping in the no-parser build is an application's decision about its
    // own bundle. Made here it would follow this package everywhere, including
    // into dev servers and test runs that format ICU strings.
    expect(configuredPlugins.map((plugin) => plugin.name)).not.toContain(
      'app-i18n-no-parser',
    );
  });
});
