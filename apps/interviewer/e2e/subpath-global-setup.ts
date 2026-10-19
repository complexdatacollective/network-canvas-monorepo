import type { FullConfig } from '@playwright/test';

// `dist/` holds whichever build ran last, and vite preview serves a root build
// at /v8/ just as readily: its index.html comes back 200, and only the assets
// it names (at /assets/…, outside the base) are missing. Every spec would then
// fail on a blank page. Check the build's own manifest instead, and say what
// to do about it.
export default async function subpathGlobalSetup(
  config: FullConfig,
): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('playwright.subpath.config.ts sets no baseURL');

  const expectedScope = new URL(baseURL).pathname;
  const response = await fetch(new URL('manifest.webmanifest', baseURL));
  const manifest: unknown = response.ok ? await response.json() : null;
  const scope =
    typeof manifest === 'object' && manifest !== null && 'scope' in manifest
      ? manifest.scope
      : undefined;

  if (scope !== expectedScope) {
    throw new Error(
      `dist/ is not an Interviewer build for ${expectedScope} (manifest scope: ${String(scope)}). ` +
        `Build it with INTERVIEWER_BASE_PATH=${expectedScope} first, or run \`pnpm --filter @codaco/interviewer test:e2e:subpath\`.`,
    );
  }
}
