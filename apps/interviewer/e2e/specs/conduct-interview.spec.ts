import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/test.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

// --- Sociogram keyboard-DnD helpers (Step 5, optional) ------------------
//
// There is no reusable placement fixture for the Sociogram stage — unlike
// packages/interview/e2e's stage-fixture.ts, which is scoped to that
// package's own Playwright project (a Storybook-hosted contract, not this
// app). These are modelled on stage-fixture.ts's navigateDndToTarget /
// dragNodeToMainList (Ctrl+D to pick up, arrow keys to cycle drop targets,
// Enter to drop) and SociogramFixture.connectNodes (click source then
// target to link; edges counted as visible SVG lines) — see
// packages/interview/e2e/fixtures/stage-fixture.ts:35, :1067, :305-403.
//
// The lean e2e protocol's Sociogram stage sets no `behaviours.automaticLayout`
// (packages/protocols/e2e/interviewer-e2e/protocol.json), so Sociogram.tsx
// resolves `layoutMode: 'MANUAL'`: the force-directed worker (useAutoLayout)
// is disabled entirely and placement is purely drag-driven, so there is no
// non-deterministic physics settle to wait on — the flakiness risk the task
// brief warned about for the *automatic*-layout case doesn't apply here.

async function getDndAnnouncement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const statusElements = document.querySelectorAll(
      'body > div[role="status"][aria-live="polite"]',
    );
    for (const el of statusElements) {
      const text = el.textContent?.trim() ?? '';
      if (text.includes('Drop target')) {
        return text;
      }
    }
    return '';
  });
}

// Picks up an unplaced node from the drawer and drops it onto the Sociogram
// canvas via keyboard DnD. Canvas.tsx computes the drop position from the
// last real pointer position (a document-level `pointermove` listener, since
// keyboard DnD never dispatches one) — moving the mouse first means each
// node lands at a distinct point instead of stacking at the (0.5, 0.5)
// default.
async function placeNodeOnCanvas(
  page: Page,
  label: string,
  point: { x: number; y: number },
  maxSteps = 5,
): Promise<void> {
  const node = page.getByRole('button', { name: new RegExp(`^${label}`) });
  await expect(node).toBeVisible();

  await page.mouse.move(point.x, point.y);

  await node.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus();
  });
  await node.press('Control+d');

  let found = false;
  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press('ArrowRight');
    const announcement = await getDndAnnouncement(page);
    if (announcement.includes('Sociogram Canvas')) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error(
      `Could not find the "Sociogram Canvas" drop target for "${label}" after ${maxSteps} steps`,
    );
  }
  await page.keyboard.press('Enter');
}

function getEdgeCount(page: Page): Promise<number> {
  return page.locator('svg line[visibility="visible"]').count();
}

async function connectNodes(
  page: Page,
  fromLabel: string,
  toLabel: string,
): Promise<void> {
  const fromNode = page.getByRole('button', {
    name: new RegExp(`^${fromLabel}`),
  });
  const toNode = page.getByRole('button', {
    name: new RegExp(`^${toLabel}`),
  });
  const edgesBefore = await getEdgeCount(page);

  await fromNode.click();
  await expect(fromNode).toHaveAttribute('data-node-linking', 'true');
  await toNode.click();
  await expect(fromNode).not.toHaveAttribute('data-node-linking');
  await expect.poll(() => getEdgeCount(page)).not.toBe(edgesBefore);
}

test.describe('conducting an interview', () => {
  test('walks the lean protocol from start to completion', async ({
    protocol,
    interviewNav,
    page,
    capture,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await interviewNav.startNewSession('P01');

    // Stage 0: Information — capture then advance.
    await capture('interview-stage-info');
    await interviewNav.next();

    // Stage 1: EgoForm.
    await interviewNav.fillEgoName('Ada');
    // EgoForm exposes no data-stage-ready; readiness is signalled only by the
    // next-button gaining the bg-success pulse once the form becomes valid.
    // next()'s click auto-waits on the button's disabled state too, but this
    // makes the readiness gate explicit.
    await expect(page.getByTestId('next-button')).toHaveClass(/bg-success/);
    await capture('interview-stage-ego');
    await interviewNav.next();

    // Stage 2: NameGeneratorQuickAdd — add two alters.
    await interviewNav.quickAddNode('Grace');
    await interviewNav.quickAddNode('Katherine');
    await capture('interview-stage-namegen');
    await interviewNav.next();

    // Stage 3: Sociogram — placement/edges are exercised in the dedicated
    // sociogram test below; here we simply advance to Finish. Nodes may
    // remain unplaced in the drawer — the stage has no minNodes-placed
    // behaviour.
    await capture('interview-stage-sociogram');
    await interviewNav.next();

    // FinishSession stage.
    await interviewNav.finish();

    // App renders InterviewComplete.
    await expect(page.getByTestId('interview-complete')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Interview complete' }),
    ).toBeVisible();
    await capture('interview-complete');

    await page.getByTestId('interview-complete-exit').click();
    await expect(page).toHaveURL(/\/(data)?$/);
  });

  test('resumes a partially-completed interview at the right stage', async ({
    protocol,
    interviewNav,
    page,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await interviewNav.startNewSession('P02');
    // Advance one stage so currentStep persists (>0), then leave.
    await interviewNav.next();
    const stepBefore = await page
      .locator('[data-stage-step]')
      .getAttribute('data-stage-step');

    // InterviewRoute persists currentStep with a fire-and-forget updateSession,
    // so navigating away immediately can unmount before the write lands and
    // leave the resume row on the previous step. Wait for the persisted
    // currentStep (a plaintext field on the session row) to reflect the advance
    // before leaving.
    const sessionId = /\/interview\/([^/?#]+)/.exec(page.url())?.[1] ?? '';
    await expect
      .poll(
        () =>
          page.evaluate(
            (id) =>
              new Promise<number | null>((resolve) => {
                const req = indexedDB.open('interviewer');
                req.onsuccess = () => {
                  const get = req.result
                    .transaction('sessions', 'readonly')
                    .objectStore('sessions')
                    .get(id);
                  get.onsuccess = () =>
                    resolve(
                      (get.result as { currentStep?: number } | undefined)
                        ?.currentStep ?? null,
                    );
                  get.onerror = () => resolve(null);
                };
                req.onerror = () => resolve(null);
              }),
            sessionId,
          ),
        { timeout: 10_000 },
      )
      .toBe(Number(stepBefore));

    await page.goto('/data');

    // Resume via the in-progress row.
    await page.getByRole('button', { name: /^In progress ·/ }).click();
    await page.getByTestId('data-resume').first().click();
    await interviewNav.waitForStage();
    // hydrateSession restores currentStep (Interview.tsx); promptIndex is
    // always reset to 0 on hydration and is not asserted here.
    await expect(page.locator('[data-stage-step]')).toHaveAttribute(
      'data-stage-step',
      stepBefore ?? '1',
    );
  });

  test('places nodes on the sociogram canvas and connects them', async ({
    protocol,
    interviewNav,
    page,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await interviewNav.startNewSession('P03');
    await interviewNav.next(); // Information -> EgoForm

    await interviewNav.fillEgoName('Rosalind');
    await expect(page.getByTestId('next-button')).toHaveClass(/bg-success/);
    await interviewNav.next(); // EgoForm -> NameGeneratorQuickAdd

    await interviewNav.quickAddNode('Alice');
    await interviewNav.quickAddNode('Bob');
    await interviewNav.next(); // NameGeneratorQuickAdd -> Sociogram

    const canvas = page.getByRole('application', {
      name: 'Sociogram Canvas',
    });
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Sociogram canvas has no bounding box');

    await placeNodeOnCanvas(page, 'Alice', {
      x: box.x + box.width * 0.3,
      y: box.y + box.height * 0.3,
    });
    await placeNodeOnCanvas(page, 'Bob', {
      x: box.x + box.width * 0.7,
      y: box.y + box.height * 0.6,
    });

    // Both alters are now placed; the drawer reports zero unplaced.
    await expect(page.getByText(/^0 unplaced$/)).toBeVisible();

    await expect.poll(() => getEdgeCount(page)).toBe(0);
    await connectNodes(page, 'Alice', 'Bob');
    await expect.poll(() => getEdgeCount(page)).toBe(1);
  });
});
