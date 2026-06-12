import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import {
  extname,
  join,
  normalize,
  resolve as resolvePath,
  sep,
} from 'node:path';

import { type Browser, chromium } from 'playwright';

import {
  ALL_RATIOS,
  DEFAULT_DELAY_MS,
  DEVICE_SCALE_FACTOR,
  type Ratio,
  RATIOS,
} from './config.mts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

/** Serve a static directory on an ephemeral port. */
export const serveStatic = (
  dir: string,
): Promise<{ url: string; close: () => void }> =>
  new Promise((resolve) => {
    const root = resolvePath(dir);
    const server = http.createServer((req, res) => {
      const requestPath = normalize(
        decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'),
      );
      // Resolve and require the result to stay inside the served root
      // (the separator suffix prevents sibling-directory prefix matches).
      let file = resolvePath(join(root, requestPath));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      if (existsSync(file) && statSync(file).isDirectory()) {
        file = join(file, 'index.html');
      }
      if (!existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
      });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Static server failed to bind');
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
      });
    });
  });

/** parameters.capture contract — mirrors CaptureParameters in
 * packages/interview/.storybook/CaptureStory.tsx. */
export type CaptureParameters = {
  interface: string;
  delay?: number;
  ratios?: Ratio[];
  env?: string[];
  skip?: boolean;
  /** Click the Next button this many times before capturing; the
   * navigation is removed from the DOM afterwards. */
  advance?: number;
};

export type CaptureStoryEntry = {
  id: string;
  capture: CaptureParameters;
};

/**
 * Enumerate stories tagged `capture` and read their `parameters.capture`
 * block. `index.json` carries tags but not parameters, so we extract from
 * the live preview the same way Storybook's test-runner does.
 */
export const enumerateCaptureStories = async (
  browser: Browser,
  baseUrl: string,
): Promise<CaptureStoryEntry[]> => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/iframe.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () =>
        (
          window as unknown as {
            __STORYBOOK_PREVIEW__?: { storyStore?: unknown };
          }
        ).__STORYBOOK_PREVIEW__?.storyStore != null,
      undefined,
      { timeout: 60_000 },
    );
    const extracted = (await page.evaluate(
      'window.__STORYBOOK_PREVIEW__.extract()',
    )) as Record<
      string,
      { id: string; tags?: string[]; parameters?: Record<string, unknown> }
    >;

    const entries: CaptureStoryEntry[] = [];
    for (const story of Object.values(extracted)) {
      if (!story.tags?.includes('capture')) continue;
      const capture = story.parameters?.capture as
        | CaptureParameters
        | undefined;
      if (!capture?.interface) {
        throw new Error(
          `Story ${story.id} is tagged 'capture' but has no parameters.capture.interface`,
        );
      }
      entries.push({ id: story.id, capture });
    }

    const seen = new Map<string, string>();
    for (const { id, capture } of entries) {
      const existing = seen.get(capture.interface);
      if (existing) {
        throw new Error(
          `Duplicate capture stories for interface "${capture.interface}": ${existing} and ${id}`,
        );
      }
      seen.set(capture.interface, id);
    }
    return entries.toSorted((a, b) =>
      a.capture.interface.localeCompare(b.capture.interface),
    );
  } finally {
    await page.close();
  }
};

const STABILITY_INTERVAL_MS = 400;
const STABILITY_MAX_TRIES = 10;

/** Capture one story at one ratio. Returns a PNG master buffer. */
export const captureStory = async (
  browser: Browser,
  baseUrl: string,
  storyId: string,
  ratio: Ratio,
  delay: number,
  advance = 0,
): Promise<Buffer> => {
  const context = await browser.newContext({
    viewport: RATIOS[ratio].viewport,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
    // Captures fetch live third-party assets (Mapbox tiles); tolerate
    // TLS-intercepting proxies in sandboxed/corporate environments.
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    // 'load' rather than 'networkidle': some interfaces hold connections
    // open (map telemetry, long-polled assets) and would never go idle.
    // The settle loop below handles render quiescence.
    await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: 'load',
    });

    // Wait for the story's render lifecycle — including any play function
    // (e.g. FamilyPedigree replays its quick-start wizard) — to finish.
    const renderPhase = () => {
      const preview = (
        window as unknown as {
          __STORYBOOK_PREVIEW__?: { storyRenders?: Array<{ phase?: string }> };
        }
      ).__STORYBOOK_PREVIEW__;
      return preview?.storyRenders?.[0]?.phase;
    };
    // Terminal phases: 'finished' (SB10; older versions used 'completed'),
    // 'errored', 'aborted'.
    await page.waitForFunction(
      `['finished', 'completed', 'errored', 'aborted'].includes((${renderPhase.toString()})())`,
      undefined,
      { timeout: 120_000 },
    );

    // Fail loudly if the story errored rather than screenshotting the overlay.
    const errored = await page.evaluate(
      `document.body.classList.contains('sb-show-errordisplay') || !['finished', 'completed'].includes((${renderPhase.toString()})())`,
    );
    if (errored) {
      throw new Error(`Story ${storyId} errored while rendering or playing`);
    }

    await page.evaluate(() => document.fonts.ready);

    // Interfaces with an internal introduction step (e.g. DyadCensus) need
    // Next clicks to reach the state worth picturing. Their capture story
    // keeps the navigation mounted; remove it before screenshotting so it
    // never appears in the output.
    if (advance > 0) {
      const nextButton = page.getByTestId('next-button');
      for (let i = 0; i < advance; i++) {
        await nextButton.click();
        await page.waitForTimeout(300);
      }
      await page.evaluate(() => {
        document.querySelector('[role="navigation"]')?.remove();
        window.dispatchEvent(new Event('resize'));
      });
    }

    await page.waitForTimeout(delay);

    // Settle loop: screenshot until two consecutive frames are identical, so
    // entrance animations and async layout (e.g. map tiles) have finished.
    let previous = await page.screenshot({
      type: 'png',
      animations: 'disabled',
    });
    for (let i = 0; i < STABILITY_MAX_TRIES; i++) {
      await page.waitForTimeout(STABILITY_INTERVAL_MS);
      const next = await page.screenshot({
        type: 'png',
        animations: 'disabled',
      });
      if (next.equals(previous)) return next;
      previous = next;
    }
    console.warn(`  ! ${storyId} @ ${ratio} did not settle; using last frame`);
    return previous;
  } finally {
    await context.close();
  }
};

export const launchBrowser = () => chromium.launch();

export const ratiosFor = (capture: CaptureParameters): Ratio[] =>
  capture.ratios ?? ALL_RATIOS;

export { DEFAULT_DELAY_MS };
