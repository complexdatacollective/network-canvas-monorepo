import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureName,
  captureStory,
  DEFAULT_DELAY_MS,
  enumerateCaptureStories,
  launchBrowser,
  ratiosFor,
  serveStatic,
} from './capture.mts';
import { variantFileName, WALKTHROUGH_WIDTHS } from './config.mts';
import {
  type GeneratedRatio,
  type GeneratedVariant,
  processMaster,
  pruneAssets,
  writeManifest,
  writeWalkthroughManifest,
} from './process.mts';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storybookStatic = resolve(packageRoot, '../interview/storybook-static');
const generatedDir = join(packageRoot, 'src/generated');
const assetsDir = join(generatedDir, 'assets');

if (!existsSync(join(storybookStatic, 'iframe.html'))) {
  console.error(
    `No storybook build at ${storybookStatic}.\n` +
      'Run the package generate script, which builds the storybook first:\n' +
      '  pnpm --filter @codaco/interface-images generate',
  );
  process.exit(1);
}

// Acquire both resources under the same cleanup path so a browser launch
// failure can't leak the static server.
const { url, close } = await serveStatic(storybookStatic);
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

try {
  browser = await launchBrowser();
  const stories = await enumerateCaptureStories(browser, url);
  if (stories.length === 0) {
    throw new Error('No stories tagged "capture" found in the storybook build');
  }
  console.log(`Found ${stories.length} capture stories`);

  const results = new Map<string, GeneratedRatio[]>();
  const walkthroughResults = new Map<string, Map<string, GeneratedVariant[]>>();
  const expectedFiles = new Set<string>();

  for (const { id, capture } of stories) {
    const name = captureName(capture);
    if (capture.skip) {
      console.log(`- ${name}: skipped (parameters.capture.skip)`);
      continue;
    }
    for (const envVar of capture.env ?? []) {
      if (!process.env[envVar]) {
        console.warn(
          `  ! ${capture.interface} declares env ${envVar}, which is not set — ` +
            'the storybook build may not have had it either',
        );
      }
    }
    const generated: GeneratedRatio[] = [];
    for (const ratio of ratiosFor(capture)) {
      console.log(`- ${name} @ ${ratio} (${id})`);
      const master = await captureStory(
        browser,
        url,
        id,
        ratio,
        capture.delay ?? DEFAULT_DELAY_MS,
        capture.advance ?? 0,
        capture.keepFocus ?? false,
      );
      const result = await processMaster(
        assetsDir,
        name,
        ratio,
        master,
        capture.walkthrough === undefined ? undefined : WALKTHROUGH_WIDTHS,
      );
      generated.push(result);
      for (const variant of result.variants) {
        expectedFiles.add(variantFileName(name, ratio, variant.w));
      }
    }
    if (capture.walkthrough === undefined) {
      results.set(capture.interface, generated);
    } else {
      const stills =
        walkthroughResults.get(capture.interface) ??
        new Map<string, GeneratedVariant[]>();
      stills.set(capture.walkthrough, generated[0]?.variants ?? []);
      walkthroughResults.set(capture.interface, stills);
    }
  }

  await pruneAssets(assetsDir, expectedFiles);
  await writeManifest(generatedDir, results);
  await writeWalkthroughManifest(generatedDir, walkthroughResults);

  console.log(`Done: ${results.size} interfaces, ${expectedFiles.size} assets`);
} finally {
  await browser?.close();
  close();
}
