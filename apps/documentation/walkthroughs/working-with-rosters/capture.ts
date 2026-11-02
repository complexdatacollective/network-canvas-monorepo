/*
 * Records the Architect clips the working-with-rosters walkthrough plays,
 * from a local Architect dev server. A fresh browser context is an empty
 * library, so the script creates an empty protocol through the home screen,
 * then builds a roster stage on the example roster, previews it, and adds the
 * "identify yourself" stage in front of it, cutting a clip per step.
 *
 *   pnpm --filter @codaco/architect dev
 *   ARCHITECT_URL=http://localhost:5173 pnpm --filter @codaco/documentation \
 *     capture:working-with-rosters
 *
 * Preview opens in a popup window, which Playwright records as its own video:
 * roster-preview-open joins the end of the editor's recording to the start of
 * the popup's, and roster-preview-drag is cut from the popup alone. Clips are
 * written as WebM, MP4 and a final-frame JPEG to
 * public/assets/walkthroughs/working-with-rosters.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  type BrowserContext,
  chromium,
  type Locator,
  type Page,
} from '@playwright/test';

const ARCHITECT_URL = process.env.ARCHITECT_URL ?? 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 736 };
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(
  here,
  '../../public/assets/walkthroughs/working-with-rosters',
);
const ROSTER = path.resolve(here, '../../public/assets/simpsons-roster.csv');

// The /updates cursor, drawn into the page because headless Chromium draws
// none, with a ring that spreads on each click.
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
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

// A stretch of one page's recording, in seconds since that page opened.
type Segment = { page: Page; start: number; end: number };
type Clip = { name: string; segments: Segment[] };

class Recorder {
  readonly clips: Clip[] = [];
  private readonly openedAt = new Map<Page, number>();

  constructor(context: BrowserContext) {
    context.on('page', (page) => this.openedAt.set(page, Date.now()));
  }

  now(page: Page) {
    const opened = this.openedAt.get(page);
    if (opened === undefined) throw new Error('Page was not recorded.');
    return (Date.now() - opened) / 1000;
  }

  async take(name: string, page: Page, action: () => Promise<void>) {
    const start = this.now(page);
    await action();
    this.clips.push({ name, segments: [{ page, start, end: this.now(page) }] });
  }
}

const ffmpeg = (args: string[]) =>
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

async function cut(
  { name, segments }: Clip,
  sources: Map<Page, string>,
  workDir: string,
) {
  // Each segment is cut to a near-lossless intermediate, joined, and then
  // encoded once for the player.
  const parts = segments.map((segment, index) => {
    const source = sources.get(segment.page);
    if (!source) throw new Error(`No video for a segment of ${name}.`);
    const part = path.join(workDir, `${name}-${index}.mp4`);
    ffmpeg([
      '-ss',
      segment.start.toFixed(2),
      '-to',
      segment.end.toFixed(2),
      '-i',
      source,
      '-an',
      '-vf',
      `scale=${VIEWPORT.width}:${VIEWPORT.height}`,
      '-c:v',
      'libx264',
      '-crf',
      '10',
      '-pix_fmt',
      'yuv420p',
      part,
    ]);
    return part;
  });
  const joined = path.join(workDir, `${name}.mp4`);
  ffmpeg([
    ...parts.flatMap((part) => ['-i', part]),
    '-filter_complex',
    `${parts.map((_, index) => `[${index}:v]`).join('')}concat=n=${parts.length}:v=1[v]`,
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-crf',
    '10',
    '-pix_fmt',
    'yuv420p',
    joined,
  ]);
  const base = path.join(OUT, name);
  ffmpeg([
    '-i',
    joined,
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '30',
    `${base}.webm`,
  ]);
  ffmpeg([
    '-i',
    joined,
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

// Space Architect leaves clear of its sticky header and the stage editor's
// floating action bar. Preview has neither.
const clearBand = (page: Page) =>
  new URL(page.url()).pathname.startsWith('/preview/')
    ? { top: 0, bottom: VIEWPORT.height }
    : { top: 110, bottom: VIEWPORT.height - 110 };

// Scrolls `target` to the middle of the screen, as a reader would, when it is
// off screen or under the header or action bar.
async function reveal(page: Page, target: Locator) {
  await target.waitFor();
  const box = await target.boundingBox();
  const clear = clearBand(page);
  if (box && box.y >= clear.top && box.y + box.height <= clear.bottom) return;
  await target.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'smooth' }),
  );
  await pause(page, 900);
}

// Glides the pointer to the middle of `target` rather than jumping there.
async function pointAt(page: Page, control: Locator) {
  // A visually hidden input is pointed at through the label drawn for it.
  const hidden = await control.evaluate(
    (element) => element.getBoundingClientRect().width < 4,
  );
  const target = hidden ? control.locator('xpath=ancestor::label[1]') : control;
  await reveal(page, target);
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
  await pause(page, 500);
}

async function type(page: Page, target: Locator, text: string) {
  await click(page, target);
  await page.keyboard.type(text, { delay: 70 });
  await pause(page, 600);
}

// Native selects draw their list outside the page, so the clip shows the
// click and the chosen value.
async function choose(page: Page, target: Locator, value: string) {
  await click(page, target);
  await target.selectOption(value);
  await page.keyboard.press('Escape');
  await pause(page, 700);
}

async function chooseInterface(page: Page) {
  await type(
    page,
    page.getByRole('searchbox', { name: 'Search interfaces' }),
    'roster',
  );
  await pause(page, 500);
  await click(
    page,
    page.getByRole('button', { name: 'Name Generator for Roster Data' }),
  );
  await page.getByRole('heading', { name: 'Node setup', level: 3 }).waitFor();
  await pause(page, 1500);
}

async function createPrompt(page: Page, text: string) {
  await click(page, page.getByRole('button', { name: 'Create new prompt' }));
  const dialog = page.getByRole('dialog', { name: 'Create prompt' });
  await dialog.waitFor();
  await pause(page, 600);
  await type(page, dialog.getByRole('textbox', { name: 'Prompt text' }), text);
  await click(page, dialog.getByRole('button', { name: 'Add', exact: true }));
  await dialog.waitFor({ state: 'hidden' });
  await pointAt(page, page.getByRole('list', { name: 'Prompts' }));
  await pause(page, 1500);
}

// Opens the stage's only prompt and assigns a new true/false attribute to it.
async function assignAttribute(page: Page, variable: string) {
  const prompts = page.getByRole('list', { name: 'Prompts' });
  await click(page, prompts.getByRole('button', { name: 'Edit prompt' }));
  const dialog = page.getByRole('dialog', { name: 'Edit prompt' });
  await dialog.waitFor();
  await pause(page, 600);
  await click(
    page,
    dialog.getByRole('button', { name: 'Add new attribute to assign' }),
  );
  await click(page, dialog.getByRole('button', { name: 'Select attribute' }));
  const picker = page.getByRole('dialog', {
    name: 'Create or select an attribute',
  });
  await picker.waitFor();
  await pause(page, 500);
  await page.keyboard.type(variable, { delay: 70 });
  await pause(page, 700);
  await click(
    page,
    picker.getByRole('option', { name: /^Create new attribute called/ }),
  );
  await picker.waitFor({ state: 'hidden' });
  await pause(page, 700);
  await click(page, dialog.getByRole('radio', { name: 'True' }));
  await pause(page, 600);
  await click(page, dialog.getByRole('button', { name: 'Save', exact: true }));
  await dialog.waitFor({ state: 'hidden' });
  await pointAt(page, prompts);
  await pause(page, 1500);
}

async function chooseNodeType(page: Page) {
  const person = page
    .getByRole('radiogroup', { name: 'Node type' })
    .getByRole('radio', { name: 'Person' });
  await click(page, person);
  if (!(await person.isChecked())) {
    throw new Error('Person was not selected.');
  }
  await pause(page, 600);
}

async function run(page: Page, recorder: Recorder) {
  const take = (name: string, action: () => Promise<void>) =>
    recorder.take(name, page, action);

  // Setup, not shown in any clip: an empty protocol from the home screen.
  await page.goto(ARCHITECT_URL, { waitUntil: 'networkidle' });
  const installNotice = page
    .getByRole('status', { name: 'Install Architect' })
    .getByRole('button', { name: 'Dismiss' });
  if (await installNotice.isVisible()) await installNotice.click();
  await page.getByRole('button', { name: 'Create a new protocol' }).click();
  await page
    .getByRole('textbox', { name: 'Protocol Name' })
    .fill('Classroom study');
  await page.getByRole('button', { name: 'Create Protocol' }).click();
  await page.getByRole('list', { name: 'Protocol stages' }).waitFor();
  await page.mouse.move(VIEWPORT.width - 160, VIEWPORT.height - 160);
  await pause(page, 1000);

  await take('roster-add-stage', async () => {
    await pause(page, 800);
    await click(page, page.getByRole('button', { name: 'Add new stage' }));
    await page
      .getByRole('heading', { name: 'Select an Interface Type' })
      .waitFor();
    await pause(page, 1500);
  });

  await take('roster-pick-interface', async () => {
    await pause(page, 400);
    await chooseInterface(page);
  });

  await take('roster-stage-name', async () => {
    await pause(page, 400);
    await click(page, page.getByRole('textbox', { name: 'Stage name' }));
    await page.keyboard.press('ControlOrMeta+a');
    await pause(page, 300);
    await page.keyboard.type('Classmates', { delay: 70 });
    await pause(page, 1800);
  });

  await take('roster-node-type', async () => {
    await pause(page, 400);
    await click(
      page,
      page.getByRole('button', { name: 'Create new node type' }),
    );
    const dialog = page.getByRole('dialog', { name: 'Create new node type' });
    await dialog.waitFor();
    await pause(page, 600);
    await type(
      page,
      dialog.getByRole('textbox', { name: 'Node type name' }),
      'Person',
    );
    await click(page, dialog.getByRole('button', { name: 'Save entity' }));
    await dialog.waitFor({ state: 'hidden' });
    await pointAt(page, page.getByRole('radio', { name: 'Person' }));
    await pause(page, 1500);
  });

  await take('roster-select-file', async () => {
    await pause(page, 400);
    await click(page, page.getByRole('button', { name: 'Select a data file' }));
    await page.getByRole('dialog', { name: 'Choose a data file' }).waitFor();
    await pause(page, 1500);
  });

  await take('roster-import-file', async () => {
    const dialog = page.getByRole('dialog', { name: 'Choose a data file' });
    await pause(page, 400);
    // The button is a label for a hidden file input: clicking it raises the
    // file chooser, which Playwright answers in place of the OS dialog.
    const chooser = page.waitForEvent('filechooser');
    await click(
      page,
      dialog.locator('label', { hasText: 'Choose a file from your computer' }),
    );
    await (await chooser).setFiles(ROSTER);
    await dialog.waitFor({ state: 'hidden' });
    await pause(page, 1500);
  });

  await take('roster-file-holds', async () => {
    const holds = page
      .getByRole('region', { name: 'Roster source' })
      .getByRole('status')
      .filter({ hasText: 'What this data file holds' });
    await pause(page, 400);
    await pointAt(page, holds);
    await pause(page, 2500);
  });

  await take('roster-card-display', async () => {
    const section = page.getByRole('region', { name: 'Card display' });
    await pause(page, 400);
    await click(page, section.getByRole('switch', { name: 'Card display' }));
    await click(
      page,
      section.getByRole('button', { name: 'Add new display property' }),
    );
    await choose(
      page,
      section.getByRole('combobox', { name: 'Attribute' }),
      'gender',
    );
    await type(page, section.getByRole('textbox', { name: 'Label' }), 'Gender');
    await pause(page, 1200);
  });

  await take('roster-sorting', async () => {
    const section = page.getByRole('region', { name: 'Roster sorting' });
    await pause(page, 400);
    await click(page, section.getByRole('switch', { name: 'Roster sorting' }));
    await click(
      page,
      section.getByRole('button', { name: 'Add new sortable property' }),
    );
    const list = section.getByRole('list', { name: 'Sortable properties' });
    await choose(
      page,
      list.getByRole('combobox', { name: 'Attribute' }),
      'occupation',
    );
    await type(
      page,
      list.getByRole('textbox', { name: 'Label' }),
      'Occupation',
    );
    await pause(page, 1200);
  });

  await take('roster-search', async () => {
    const section = page.getByRole('region', { name: 'Roster search' });
    await pause(page, 400);
    await click(page, section.getByRole('switch', { name: 'Roster search' }));
    await click(page, section.getByRole('checkbox', { name: 'name' }));
    const slider = section.getByRole('slider', { name: 'Search accuracy' });
    await pointAt(page, slider);
    const thumb = await slider.boundingBox();
    const low = await section
      .getByText('Low accuracy', { exact: true })
      .first()
      .boundingBox();
    if (!thumb || !low) throw new Error('Search accuracy is not visible.');
    await page.mouse.down();
    await page.mouse.move(low.x + low.width / 2, thumb.y + thumb.height / 2, {
      steps: 30,
    });
    await page.mouse.up();
    await pause(page, 1500);
  });

  await take('roster-prompt', async () => {
    await pause(page, 400);
    await createPrompt(page, 'Who do you study with?');
  });

  await take('roster-assign', async () => {
    await pause(page, 400);
    await assignAttribute(page, 'study_together');
  });

  await take('roster-finish-editing', async () => {
    await pause(page, 400);
    await click(page, page.getByRole('button', { name: 'Finished Editing' }));
    await page.getByRole('list', { name: 'Protocol stages' }).waitFor();
    await pointAt(
      page,
      page.getByRole('heading', { name: 'Classmates', level: 4 }),
    );
    await pause(page, 1500);
  });

  // Preview opens in its own window, whose recording carries the rest of
  // roster-preview-open and all of roster-preview-drag.
  const editorStart = recorder.now(page);
  await pause(page, 400);
  await click(page, page.getByRole('button', { name: /^Edit stage 1: / }));
  await page.getByRole('heading', { name: 'Node setup', level: 3 }).waitFor();
  await pause(page, 1000);
  // Example data would start the preview with everyone already added.
  await click(page, page.getByRole('button', { name: 'Preview settings' }));
  await pause(page, 600);
  await click(
    page,
    page.getByRole('switch', { name: 'Start preview with example data' }),
  );
  await pause(page, 600);
  await click(page, page.getByRole('button', { name: 'Preview settings' }));
  const opened = page.context().waitForEvent('page');
  await click(page, page.getByRole('button', { name: 'Preview', exact: true }));
  const preview = await opened;
  const editorEnd = recorder.now(page);
  await preview.setViewportSize(VIEWPORT);
  await preview
    .getByRole('heading', { name: 'Who do you study with?' })
    .waitFor({ timeout: 60000 });
  const previewStart = recorder.now(preview);
  await preview.mouse.move(VIEWPORT.width - 200, VIEWPORT.height - 120);
  await pause(preview, 2000);
  recorder.clips.push({
    name: 'roster-preview-open',
    segments: [
      { page, start: editorStart, end: editorEnd },
      { page: preview, start: previewStart, end: recorder.now(preview) },
    ],
  });

  await recorder.take('roster-preview-drag', preview, async () => {
    await pause(preview, 400);
    const card = preview
      .getByRole('listbox', { name: 'Available Roster Nodes' })
      .getByRole('option', { name: 'Lisa' });
    await pointAt(preview, card);
    await pause(preview, 400);
    await preview.mouse.down();
    const box = await card.boundingBox();
    if (!box) throw new Error('The roster card is not visible.');
    await preview.mouse.move(box.x + box.width / 2 + 60, box.y + 30, {
      steps: 10,
    });
    await preview.mouse.move(950, 350, { steps: 40 });
    await pause(preview, 600);
    await preview.mouse.up();
    await preview
      .getByRole('listbox', { name: 'Added Nodes' })
      .getByRole('option', { name: 'Lisa' })
      .waitFor();
    await pause(preview, 2000);
  });
  await preview.close();

  // Back to the timeline without changing the roster stage.
  await page.bringToFront();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('list', { name: 'Protocol stages' }).waitFor();
  await page.mouse.move(VIEWPORT.width - 160, VIEWPORT.height - 160);
  await pause(page, 1000);

  await take('roster-ego-stage', async () => {
    await pause(page, 600);
    await click(
      page,
      page.getByRole('button', { name: /^Add stage here, before stage 1: / }),
    );
    await page
      .getByRole('heading', { name: 'Select an Interface Type' })
      .waitFor();
    await pause(page, 800);
    await chooseInterface(page);
    await chooseNodeType(page);
    await click(page, page.getByRole('button', { name: 'Select a data file' }));
    const dialog = page.getByRole('dialog', { name: 'Choose a data file' });
    await dialog.waitFor();
    await pause(page, 800);
    await click(
      page,
      dialog
        .getByRole('list', { name: 'Resources in this protocol' })
        .getByRole('button', { name: 'simpsons-roster.csv' }),
    );
    await dialog.waitFor({ state: 'hidden' });
    await pause(page, 1500);
  });

  await take('roster-ego-prompt', async () => {
    await pause(page, 400);
    await createPrompt(page, 'Find yourself in this list.');
  });

  await take('roster-ego-assign', async () => {
    await pause(page, 400);
    await assignAttribute(page, 'is_ego');
  });

  await take('roster-ego-limits', async () => {
    const section = page.getByRole('region', { name: 'Nomination limits' });
    await pause(page, 400);
    await click(
      page,
      section.getByRole('switch', { name: 'Nomination limits' }),
    );
    await type(page, section.getByLabel('Minimum number of alters'), '1');
    await type(page, section.getByLabel('Maximum number of alters'), '1');
    await pause(page, 1500);
  });
}

async function record() {
  const videoDir = mkdtempSync(path.join(tmpdir(), 'rosters-capture-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const recorder = new Recorder(context);
  const page = await context.newPage();
  const pages: Page[] = [page];
  context.on('page', (opened) => pages.push(opened));
  try {
    await run(page, recorder);
  } catch (error) {
    // The recording and a screenshot of the failing step stay behind.
    const shot = path.join(videoDir, 'failure.png');
    await pages
      .filter((open) => !open.isClosed())
      .at(-1)
      ?.screenshot({ path: shot });
    process.stderr.write(`Capture failed; see ${shot}\n`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
  const sources = new Map<Page, string>();
  for (const recorded of pages) {
    const source = await recorded.video()?.path();
    if (source) sources.set(recorded, source);
  }
  mkdirSync(OUT, { recursive: true });
  for (const clip of recorder.clips) await cut(clip, sources, videoDir);
  rmSync(videoDir, { recursive: true, force: true });
}

await record();
