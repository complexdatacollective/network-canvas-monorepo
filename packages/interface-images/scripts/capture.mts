import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import http from 'node:http';
import { extname, join } from 'node:path';

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

/**
 * Serve a static directory on an ephemeral port.
 *
 * The directory is indexed once at startup and requests are resolved by
 * exact lookup against that index, so request data is never used in a
 * filesystem path expression (no traversal surface).
 */
export const serveStatic = async (
  dir: string,
): Promise<{ url: string; close: () => void }> => {
  const files = new Map<string, string>();
  const indexDirectory = async (absolute: string, urlPath: string) => {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const entryAbsolute = join(absolute, entry.name);
      const entryUrl = `${urlPath}/${entry.name}`;
      if (entry.isDirectory()) {
        await indexDirectory(entryAbsolute, entryUrl);
      } else if (entry.isFile()) {
        files.set(entryUrl, entryAbsolute);
        if (entry.name === 'index.html') {
          files.set(urlPath === '' ? '/' : urlPath, entryAbsolute);
          files.set(`${urlPath}/`, entryAbsolute);
        }
      }
    }
  };
  await indexDirectory(dir, '');

  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent(
      (req.url ?? '/').split('?')[0] ?? '/',
    );
    const file = files.get(requestPath);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
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
};

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

const field = (value: object, key: string): unknown => Reflect.get(value, key);

const isRatio = (value: unknown): value is Ratio =>
  ALL_RATIOS.some((ratio) => ratio === value);

/** Checks the story's `parameters.capture` block, which arrives untyped from
 * the live preview, against CaptureParameters. */
const isCaptureParameters = (value: unknown): value is CaptureParameters => {
  if (typeof value !== 'object' || value === null) return false;
  const name = field(value, 'interface');
  const delay = field(value, 'delay');
  const ratios = field(value, 'ratios');
  const env = field(value, 'env');
  const skip = field(value, 'skip');
  const advance = field(value, 'advance');
  return (
    typeof name === 'string' &&
    name !== '' &&
    (delay === undefined || typeof delay === 'number') &&
    (ratios === undefined ||
      (Array.isArray(ratios) && ratios.every((ratio) => isRatio(ratio)))) &&
    (env === undefined ||
      (Array.isArray(env) && env.every((item) => typeof item === 'string'))) &&
    (skip === undefined || typeof skip === 'boolean') &&
    (advance === undefined || typeof advance === 'number')
  );
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
      () => {
        const preview =
          '__STORYBOOK_PREVIEW__' in window
            ? window.__STORYBOOK_PREVIEW__
            : undefined;
        return (
          typeof preview === 'object' &&
          preview !== null &&
          'storyStore' in preview &&
          preview.storyStore != null
        );
      },
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
      const capture = story.parameters?.capture;
      if (!isCaptureParameters(capture)) {
        throw new Error(
          `Story ${story.id} is tagged 'capture' but has no valid parameters.capture (it needs an interface name; delay and advance must be numbers, ratios and env arrays, skip a boolean)`,
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

// Reads the phase of the story's render. Serialised into the page, so it must
// not reference module scope.
const renderPhase = () => {
  const preview =
    '__STORYBOOK_PREVIEW__' in window
      ? window.__STORYBOOK_PREVIEW__
      : undefined;
  if (
    typeof preview !== 'object' ||
    preview === null ||
    !('storyRenders' in preview) ||
    !Array.isArray(preview.storyRenders)
  ) {
    return undefined;
  }
  const render: unknown = preview.storyRenders[0];
  return typeof render === 'object' && render !== null && 'phase' in render
    ? render.phase
    : undefined;
};

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

    // An interface that focuses its first control on mount (e.g. a census
    // answer) would otherwise be pictured with a keyboard focus ring, which a
    // participant using a pointer or touch never sees.
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });

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
