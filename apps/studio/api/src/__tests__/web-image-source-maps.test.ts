import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const studioRoot = new URL('../../../', import.meta.url);

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, studioRoot)), 'utf8');

const instructions = (source: string): string[] =>
  source
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '' && !line.startsWith('#'));

const dockerfile = instructions(read('Dockerfile'));
const viteConfig = read('web/vite.config.ts');
const turboConfig = readFileSync(
  fileURLToPath(new URL('../../turbo.json', studioRoot)),
  'utf8',
);

const outsideImports = [
  ...viteConfig.matchAll(/import\(\s*'(\.\.\/\.\.\/\.\.\/[^']+)'\s*\)/g),
].map(([, path]) => path!.replace('../../../', '$TURBO_ROOT$/'));

const SECRET_MOUNTS = [
  '--mount=type=secret,id=posthog_personal_api_key,env=POSTHOG_PERSONAL_API_KEY',
  '--mount=type=secret,id=posthog_project_id,env=POSTHOG_PROJECT_ID',
];

describe('the studio-web image build', () => {
  it('hands the PostHog credentials to the web build, and to nothing else, as BuildKit secrets', () => {
    const webBuild = dockerfile.filter(
      (line) =>
        line.startsWith('RUN ') &&
        line.includes('pnpm --filter @codaco/studio-web build'),
    );
    expect(webBuild).toHaveLength(1);
    for (const mount of SECRET_MOUNTS) {
      expect(webBuild[0]).toContain(mount);
    }
    expect(webBuild[0]).not.toContain('@codaco/studio-api');

    const mounting = dockerfile.filter((line) =>
      line.includes('type=secret,id=posthog_'),
    );
    expect(mounting).toEqual(webBuild);
  });

  it('never carries a credential in an ARG, an ENV or a label', () => {
    const declared = dockerfile.filter((line) =>
      /^(ARG|ENV|LABEL) /.test(line),
    );
    expect(declared.filter((line) => /POSTHOG/i.test(line))).toEqual([]);
  });

  it('copies the upload plugin the web build imports into the builder', () => {
    const imported =
      /import\(\s*'(?:\.\.\/){3}(scripts\/buildtime\/[\w.-]+\.ts)'\s*\)/.exec(
        viteConfig,
      )?.[1];
    expect(imported).toBe('scripts/buildtime/posthog-source-maps-plugin.ts');
    const copied = dockerfile.findIndex(
      (line) => line === `COPY ${imported} scripts/buildtime/`,
    );
    const built = dockerfile.findIndex((line) =>
      line.includes('pnpm --filter @codaco/studio-web build'),
    );
    expect(copied).toBeGreaterThan(-1);
    expect(copied).toBeLessThan(built);
  });

  it('uploads only when both credentials are set, and deletes the maps it uploaded', () => {
    expect(viteConfig).toContain(
      'if (!posthogPersonalApiKey || !posthogProjectId) return [];',
    );
    expect(viteConfig).toContain('deleteAfterUpload: true');
  });

  it('lists every file outside the package the web build imports among its cache inputs', () => {
    const block =
      /"@codaco\/studio-web#build":\s*\{[\s\S]*?"inputs":\s*\[([\s\S]*?)\]/.exec(
        turboConfig,
      )?.[1];
    expect(outsideImports).toContain(
      '$TURBO_ROOT$/scripts/buildtime/posthog-source-maps-plugin.ts',
    );
    for (const path of outsideImports) {
      expect(block).toContain(`"${path}"`);
    }
  });
});
