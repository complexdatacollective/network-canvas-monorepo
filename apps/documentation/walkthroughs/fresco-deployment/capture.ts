/*
 * Records the Fresco setup clips the deployment walkthrough plays, from a
 * local Fresco on an unconfigured database. Each run drives one pass through
 * the setup wizard and cuts the clips it names; run each against a fresh
 * database (migrated, with `scripts/initialize.ts` run), because the wizard
 * only appears on an instance with no account.
 *
 *   uploadthing  storage not configured (STORAGE_PROVIDER and S3_* blank):
 *                account-username, account-password, storage-uploadthing
 *   s3           storage not configured: storage-s3
 *   protocol     storage pinned to the local Garage store (`.env.development`
 *                and `scripts/dev-s3.ts`): upload-protocol, finish
 *
 *   FRESCO_URL=http://localhost:3005 pnpm --filter @codaco/documentation \
 *     capture:fresco-deployment <run>
 *
 * Every value typed is made up for the recording, so the storage clips stop
 * at Save and continue: Fresco verifies an UploadThing token with UploadThing
 * and refuses an S3 endpoint on a loopback address, so neither dummy setup
 * can be saved. Clips are written as WebM,
 * MP4 and a final-frame JPEG to public/assets/walkthroughs/fresco-deployment.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium, type Locator, type Page } from '@playwright/test';

const FRESCO_URL = process.env.FRESCO_URL ?? 'http://localhost:3005';
const VIEWPORT = { width: 1280, height: 736 };
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(
  here,
  '../../public/assets/walkthroughs/fresco-deployment',
);
const PROTOCOL = path.resolve(
  here,
  '../../public/protocols/Sample Protocol v5.netcanvas',
);

const DEMO = {
  username: 'fresco-demo-admin',
  password: 'Demo-Only-Passphrase-42!',
  token: 'eyJhcGlLZXkiOiJza19kZW1vX25vdF9yZWFsIiwiYXBwSWQiOiJkZW1vIn0=',
  s3: {
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    publicUrl: 'https://fresco-demo-study.s3.us-east-1.amazonaws.com',
    bucket: 'fresco-demo-study',
    region: 'us-east-1',
    accessKeyId: 'AKIADEMONOTAREALKEY0',
    secretAccessKey: 'demo-secret-not-a-real-key-0000000000000',
  },
};

// The /updates cursor, drawn into the page because headless Chromium draws
// none, with a ring that spreads on each click.
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal { display: none !important; }';
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)';
    cursor.innerHTML = '<svg width="44" height="44" viewBox="-4 -4 40 40" style="overflow:visible">'
      + '<rect x="20" y="36" width="38" height="20" rx="10" fill="var(--color-sea-serpent, #3eb1d8)" stroke="var(--color-navy-taupe, #241f4b)" stroke-width="3"/>'
      + '<path d="M0 0 L0 30 L8 23 L14 36 L21 33 L15 21 L26 21 Z" fill="var(--color-sea-serpent, #3eb1d8)" stroke="var(--color-navy-taupe, #241f4b)" stroke-width="4" stroke-linejoin="round"/></svg>';
    document.body.append(cursor);
    window.addEventListener('mousemove', (event) => {
      cursor.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
    }, true);
    window.addEventListener('mousedown', (event) => {
      const ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;width:16px;height:16px;border-radius:50%;'
        + 'border:4px solid var(--color-sea-serpent, #3eb1d8);left:' + (event.clientX - 12) + 'px;top:' + (event.clientY - 12) + 'px;'
        + 'transition:transform 450ms ease-out, opacity 450ms ease-out';
      document.body.append(ring);
      requestAnimationFrame(() => { ring.style.transform = 'scale(4)'; ring.style.opacity = '0'; });
      setTimeout(() => ring.remove(), 500);
    }, true);
  });
`;

type Clip = { name: string; start: number; end: number };

async function record(run: (page: Page, clip: Clipper) => Promise<void>) {
  const videoDir = mkdtempSync(path.join(tmpdir(), 'fresco-capture-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const startedAt = Date.now();
  const clips: Clip[] = [];
  const marks = clipper(clips, startedAt);
  await page.goto(`${FRESCO_URL}/setup`, { waitUntil: 'networkidle' });
  await page.mouse.move(VIEWPORT.width - 120, VIEWPORT.height - 80);
  await run(page, marks);
  const video = page.video();
  await context.close();
  await browser.close();
  const source = await video?.path();
  if (!source) throw new Error('No video was recorded.');
  mkdirSync(OUT, { recursive: true });
  for (const clip of clips) cut(source, clip);
  rmSync(videoDir, { recursive: true, force: true });
}

type Clipper = ReturnType<typeof clipper>;

// Marks where each clip starts and ends, in seconds into the recording.
function clipper(clips: Clip[], startedAt: number) {
  const now = () => (Date.now() - startedAt) / 1000;
  return {
    async take(name: string, action: () => Promise<void>) {
      const start = now();
      await action();
      clips.push({ name, start, end: now() });
    },
  };
}

const ffmpeg = (args: string[]) =>
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

function cut(source: string, { name, start, end }: Clip) {
  const base = path.join(OUT, name);
  const range = ['-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', source];
  ffmpeg([
    ...range,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '30',
    `${base}.webm`,
  ]);
  ffmpeg([
    ...range,
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    `${base}.mp4`,
  ]);
  ffmpeg([
    '-sseof',
    '-0.1',
    '-i',
    `${base}.mp4`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    '-update',
    '1',
    `${base}.jpg`,
  ]);
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

// Glides the pointer to the middle of `target` rather than jumping there.
async function pointAt(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Target is not visible.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 30,
  });
  await pause(page, 250);
}

async function click(page: Page, target: Locator) {
  await pointAt(page, target);
  await page.mouse.down();
  await page.mouse.up();
  await pause(page, 400);
}

async function type(page: Page, target: Locator, text: string) {
  await click(page, target);
  await page.keyboard.type(text, { delay: 70 });
  await pause(page, 600);
}

async function createAccount(page: Page, clip?: Clipper) {
  const username = page.getByRole('textbox', { name: 'Username' });
  const typeUsername = async () => {
    await pause(page, 800);
    await type(page, username, DEMO.username);
    await pause(page, 900);
  };
  const choosePassword = async () => {
    await click(page, page.getByRole('option', { name: /^Password/ }));
    await type(
      page,
      page.getByLabel('Password', { exact: true }),
      DEMO.password,
    );
    await type(page, page.getByLabel('Confirm password'), DEMO.password);
    await click(page, page.getByRole('button', { name: 'Create account' }));
    await page
      .getByRole('heading', { name: 'Configure Storage', level: 2 })
      .waitFor();
    await pause(page, 1500);
  };
  if (clip) {
    await clip.take('account-username', typeUsername);
    await clip.take('account-password', choosePassword);
  } else {
    await page.mouse.move(0, 0);
    await username.fill(DEMO.username);
    await page.getByRole('option', { name: /^Password/ }).click();
    await page.getByLabel('Password', { exact: true }).fill(DEMO.password);
    await page.getByLabel('Confirm password').fill(DEMO.password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page
      .getByRole('heading', { name: 'Configure Storage', level: 2 })
      .waitFor();
  }
}

const runs: Record<string, (page: Page, clip: Clipper) => Promise<void>> = {
  async uploadthing(page, clip) {
    await createAccount(page, clip);
    // Fresco checks the token with UploadThing before it moves on, so a
    // made-up token cannot get past this step. The save request is held open
    // so the clip ends on Fresco saving, not on its rejection.
    await clip.take('storage-uploadthing', async () => {
      await pause(page, 600);
      await click(
        page,
        page.getByRole('textbox', { name: 'UPLOADTHING_TOKEN' }),
      );
      await page.keyboard.insertText(DEMO.token);
      await pause(page, 1200);
      await pointAt(
        page,
        page.getByRole('button', { name: 'Save and continue' }),
      );
      await page.route('**/*', (route) =>
        route.request().method() === 'POST'
          ? new Promise<void>(() => {})
          : route.continue(),
      );
      await page.mouse.down();
      await page.mouse.up();
      await pause(page, 1200);
    });
  },

  async s3(page, clip) {
    await createAccount(page);
    await clip.take('storage-s3', async () => {
      await pause(page, 800);
      await click(page, page.getByRole('option', { name: /^S3/ }));
      const fields: [string, string][] = [
        ['Endpoint URL', DEMO.s3.endpoint],
        ['Public URL', DEMO.s3.publicUrl],
        ['Bucket name', DEMO.s3.bucket],
        ['Region', DEMO.s3.region],
        ['Access key ID', DEMO.s3.accessKeyId],
        ['Secret access key', DEMO.s3.secretAccessKey],
      ];
      // Each value is pasted from the storage provider, as the reader would.
      for (const [label, value] of fields) {
        await click(page, page.getByLabel(label, { exact: false }).first());
        await page.keyboard.insertText(value);
        await pause(page, 500);
      }
      await pointAt(
        page,
        page.getByRole('button', { name: 'Save and continue' }),
      );
      await pause(page, 1500);
    });
  },

  async protocol(page, clip) {
    await createAccount(page);
    await page
      .getByRole('button', { name: /continue/i })
      .first()
      .click();
    await page
      .getByRole('heading', { name: 'Import Protocols', level: 2 })
      .waitFor();
    await clip.take('upload-protocol', async () => {
      await pause(page, 900);
      const chooser = page.waitForEvent('filechooser');
      await click(page, page.getByRole('button', { name: /browse/i }));
      await (await chooser).setFiles(PROTOCOL);
      // The success toast sits over Continue until it closes by itself.
      const imported = page.getByText('Protocol imported successfully');
      await imported.waitFor({ timeout: 60000 });
      await imported.waitFor({ state: 'hidden', timeout: 30000 });
      await pause(page, 500);
      await click(page, page.getByRole('button', { name: 'Continue' }));
      await page
        .getByRole('heading', { name: 'Documentation', level: 2 })
        .waitFor();
      await pause(page, 1200);
    });
    await clip.take('finish', async () => {
      await pause(page, 600);
      await click(
        page,
        page.getByRole('button', { name: 'Go to the dashboard!' }),
      );
      await page.waitForURL(/dashboard/);
      await page.waitForLoadState('networkidle');
      await pause(page, 2000);
    });
  },
};

const name = process.argv[2] ?? '';
const run = runs[name];
if (!run) {
  throw new Error(`Name a run: ${Object.keys(runs).join(', ')}.`);
}
await record(run);
