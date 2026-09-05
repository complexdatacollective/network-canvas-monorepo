import { afterEach, describe, expect, it, vi } from 'vitest';

type BeforeWriteFile = (
  filePath: string,
  content: string,
) => {
  content: string;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('interview declaration output', () => {
  it('maps directory specifiers to their index files', async () => {
    let beforeWriteFile: BeforeWriteFile | undefined;
    vi.doMock('vite-plugin-dts', () => ({
      default: (options: { beforeWriteFile?: BeforeWriteFile }) => {
        beforeWriteFile = options.beforeWriteFile;
        return { name: 'unplugin-dts' };
      },
    }));
    vi.stubEnv('VITEST', '');

    await import('../../vite.config');

    if (!beforeWriteFile) {
      throw new Error(
        'Expected the declaration plugin to configure beforeWriteFile',
      );
    }

    const result = beforeWriteFile(
      'dist/store/store.d.ts',
      "export type Store = import('..').ProtocolPayload; export type Root = import('.').RootPayload; export type Ancestor = import('../..').AncestorPayload; export type RootAncestor = import('../../..').RootAncestorPayload;",
    );

    expect(result.content).toContain("import('../index.js').ProtocolPayload");
    expect(result.content).toContain("import('./index.js').RootPayload");
    expect(result.content).toContain(
      "import('../../index.js').AncestorPayload",
    );
    expect(result.content).toContain(
      "import('../../../index.js').RootAncestorPayload",
    );
  });
});

describe('interview client directive', () => {
  it('banners a chunk built from a module that declared the boundary', async () => {
    const { createClientDirective } = await import('../../vite.config');
    const { banner, record } = createClientDirective();

    record(
      "'use client';\n\nexport const Node = () => null;\n",
      '/src/Node.tsx',
    );
    record('export const NODE_RADIUS = 4;\n', '/src/constants.ts');

    // The main bundle: one client module in the chunk is enough, because the
    // chunk evaluates as a single module in the consumer's graph.
    expect(banner(['/src/constants.ts', '/src/Node.tsx'])).toBe(
      "'use client';",
    );

    // The `contract` bundle: server-safe, and it says so.
    expect(banner(['/src/constants.ts'])).toBe('');
  });

  it('reads the directive off the source before other transforms run', async () => {
    const { createClientDirective } = await import('../../vite.config');
    const { banner, plugin } = createClientDirective();

    if (typeof plugin.transform !== 'function') {
      throw new Error('Expected the client-directive plugin to transform');
    }

    // `enforce: 'pre'` is what makes this reliable — a later transform can move
    // or drop the directive, and the recorded id is taken from the raw source.
    expect(plugin.enforce).toBe('pre');

    plugin.transform.call(
      // The hook reads only its arguments; a plugin context would be noise.
      undefined as never,
      '"use client";\n\nexport const Panel = () => null;\n',
      '/src/Panel.tsx',
    );

    expect(banner(['/src/Panel.tsx'])).toBe("'use client';");
  });

  it('ignores a module that only mentions the directive in its body', async () => {
    const { createClientDirective } = await import('../../vite.config');
    const { banner, record } = createClientDirective();

    record(
      'export const DIRECTIVE = "\'use client\';";\n',
      '/src/directive.ts',
    );

    expect(banner(['/src/directive.ts'])).toBe('');
  });
});
