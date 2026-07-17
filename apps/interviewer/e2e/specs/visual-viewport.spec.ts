import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/test.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

type TestVisualViewport = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  pageLeft: number;
  pageTop: number;
  scale: number;
};

const LAYOUT_VIEWPORT = { width: 1_824, height: 1_368 };
const LAYOUT_VISUAL_VIEWPORT: TestVisualViewport = {
  ...LAYOUT_VIEWPORT,
  offsetLeft: 0,
  offsetTop: 0,
  pageLeft: 0,
  pageTop: 0,
  scale: 1,
};
const BROWSER_VIEWPORT: TestVisualViewport = {
  width: 1_824,
  height: 1_192,
  offsetLeft: 0,
  offsetTop: 176,
  pageLeft: 0,
  pageTop: 176,
  scale: 1,
};
const KEYBOARD_VIEWPORT: Partial<TestVisualViewport> = {
  height: 526,
};
const SAMPLE_PROMPT =
  'Within the past 6 months, who have you felt close to, or discussed important personal matters with?';

test.use({ viewport: LAYOUT_VIEWPORT });

async function installVisualViewportStub(
  page: Page,
  initial: TestVisualViewport,
): Promise<void> {
  await page.addInitScript((initialViewport) => {
    const values = { ...initialViewport };
    const viewport = new EventTarget();

    for (const property of Object.keys(values) as Array<keyof typeof values>) {
      Object.defineProperty(viewport, property, {
        configurable: true,
        enumerable: true,
        get: () => values[property],
      });
    }

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    Reflect.set(
      window,
      '__setTestVisualViewport',
      (next: Partial<typeof values>) => {
        Object.assign(values, next);
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      },
    );
  }, initial);
}

async function setVisualViewport(
  page: Page,
  values: Partial<TestVisualViewport>,
): Promise<void> {
  await page.evaluate((next) => {
    const setter = Reflect.get(window, '__setTestVisualViewport');
    if (typeof setter !== 'function') {
      throw new Error('VisualViewport test setter was not installed');
    }
    (setter as (update: Partial<TestVisualViewport>) => void)(next);
  }, values);
}

async function getBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function expectInsideVisualViewport(
  locator: Locator,
  viewport: TestVisualViewport,
): Promise<void> {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      if (!box) return false;
      return (
        box.x >= viewport.pageLeft - 1 &&
        box.y >= viewport.pageTop - 1 &&
        box.x + box.width <= viewport.pageLeft + viewport.width + 1 &&
        box.y + box.height <= viewport.pageTop + viewport.height + 1
      );
    })
    .toBe(true);
}

test('keeps the Name Generator prompt, quick add, and new node inside the iOS visual viewport', async ({
  protocol,
  interviewNav,
  page,
}) => {
  // Keep setup at the full layout size so the deck carousel cannot overlap
  // the new-session dialog at this deliberately large test resolution. The
  // regression begins once the interview is running and Safari chrome reduces
  // and offsets the visible viewport.
  await installVisualViewportStub(page, LAYOUT_VISUAL_VIEWPORT);
  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  await page.getByRole('button', { name: 'Start new interview' }).click();
  const caseId = page.getByTestId('new-session-case-id');
  await caseId.fill('IOS-VIEWPORT');
  // At this iPad-sized resolution, a fanned protocol card's 2D hit box
  // overlaps the submit button even though the card is visually behind the
  // dialog. Submitting the real form with Enter avoids that unrelated deck
  // actionability quirk.
  await caseId.press('Enter');
  await expect(page).toHaveURL(/\/interview\//, { timeout: 15_000 });
  await interviewNav.waitForStage();

  await interviewNav.next(); // Information -> EgoForm
  await interviewNav.fillEgoName('Ada');
  await interviewNav.next(); // EgoForm -> NameGeneratorQuickAdd

  await setVisualViewport(page, BROWSER_VIEWPORT);
  const appFrame = page.locator('#root > [data-theme-interview]');
  await expectInsideVisualViewport(appFrame, BROWSER_VIEWPORT);

  const toggle = page.getByTestId('quick-add-toggle');
  await toggle.click();
  await setVisualViewport(page, KEYBOARD_VIEWPORT);
  const keyboardViewport = { ...BROWSER_VIEWPORT, ...KEYBOARD_VIEWPORT };

  // Exercise the wrapped text from the reported Sample Protocol without
  // changing the lean protocol (and its committed visual baselines).
  const prompt = page.getByTestId('prompt');
  await prompt.locator('h2').evaluate((heading, text) => {
    heading.textContent = text;
  }, SAMPLE_PROMPT);

  const input = page.getByTestId('quick-add-input');
  await expectInsideVisualViewport(appFrame, keyboardViewport);
  await expectInsideVisualViewport(prompt, keyboardViewport);
  await expectInsideVisualViewport(input, keyboardViewport);

  await input.fill('Grace');
  await input.press('Enter');
  const node = page.getByRole('option', { name: 'Grace' });
  await expectInsideVisualViewport(node, keyboardViewport);
  await expectInsideVisualViewport(input, keyboardViewport);

  const inputBox = await getBox(input);
  const nodeBox = await getBox(node);
  const overlaps =
    inputBox.x < nodeBox.x + nodeBox.width &&
    inputBox.x + inputBox.width > nodeBox.x &&
    inputBox.y < nodeBox.y + nodeBox.height &&
    inputBox.y + inputBox.height > nodeBox.y;
  expect(overlaps).toBe(false);
});
