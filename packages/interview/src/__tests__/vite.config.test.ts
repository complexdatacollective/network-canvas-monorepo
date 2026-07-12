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
