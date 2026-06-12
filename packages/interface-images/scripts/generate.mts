import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureStory,
  DEFAULT_DELAY_MS,
  enumerateCaptureStories,
  launchBrowser,
  ratiosFor,
  serveStatic,
} from './capture.mts';
import { variantFileName } from './config.mts';
import {
  type GeneratedRatio,
  processMaster,
  pruneAssets,
  writeManifest,
} from './process.mts';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storybookStatic = resolve(packageRoot, '../interview/storybook-static');
const generatedDir = join(packageRoot, 'src/generated');
const assetsDir = join(generatedDir, 'assets');

if (!existsSync(join(storybookStatic, 'iframe.html'))) {
  console.error(
    `No storybook build at ${storybookStatic}.\n` +
      'Run via turbo so the dependency is built first:\n' +
      '  pnpm exec turbo run generate --filter=@codaco/interface-images',
  );
  process.exit(1);
}

const { url, close } = await serveStatic(storybookStatic);
const browser = await launchBrowser();

try {
  const stories = await enumerateCaptureStories(browser, url);
  if (stories.length === 0) {
    throw new Error('No stories tagged "capture" found in the storybook build');
  }
  console.log(`Found ${stories.length} capture stories`);

  const results = new Map<string, GeneratedRatio[]>();
  const expectedFiles = new Set<string>();

  for (const { id, capture } of stories) {
    if (capture.skip) {
      console.log(`- ${capture.interface}: skipped (parameters.capture.skip)`);
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
      console.log(`- ${capture.interface} @ ${ratio} (${id})`);
      const master = await captureStory(
        browser,
        url,
        id,
        ratio,
        capture.delay ?? DEFAULT_DELAY_MS,
        capture.advance ?? 0,
      );
      const result = await processMaster(
        assetsDir,
        capture.interface,
        ratio,
        master,
      );
      generated.push(result);
      for (const variant of result.variants) {
        expectedFiles.add(variantFileName(capture.interface, ratio, variant.w));
      }
    }
    results.set(capture.interface, generated);
  }

  await pruneAssets(assetsDir, expectedFiles);
  await writeManifest(generatedDir, results);

  const changed = [...results.values()].flat().filter((r) => r.changed).length;
  console.log(
    `Done: ${results.size} interfaces, ${expectedFiles.size} assets ` +
      `(${changed} ratio sets updated)`,
  );
} finally {
  await browser.close();
  close();
}
