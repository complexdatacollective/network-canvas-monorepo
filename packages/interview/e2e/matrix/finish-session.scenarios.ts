import type { Page } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios, ScenarioContext } from './types.js';

// The name variable's codebook key is a builder-generated id, not the literal
// 'name' (addNodeType auto-seeds a "name" text variable and addVariable dedupes
// to it). build() captures the deduped id here so back-navigation-preserves-
// network's run() can key its network assertion by the same id. Safe as a
// module-scoped value: build() and run() for a single scenario execute
// sequentially within one test, and each Playwright worker imports this module
// fresh.
let seededNameVarId = '';

const FINISHED_NOTICE =
  'This interview is finished, and its answers can no longer be changed.';

// The finish stage every scenario that does not author its own ends at:
// SyntheticInterview appends it, with Network Canvas's own text, under this id.
const DEFAULT_FINISH_STAGE_ID = 'finish';

/** A researcher's own finish stage: its text, and an outcome that is not the default. */
const AUTHORED = {
  label: 'Menu-only finish label',
  interviewScript: 'INTERVIEWER: thank the participant',
  title: 'All *done*',
  content: 'Thank you for **taking part**.\n\nYou may now close this window.',
  outcome: 'ineligible',
} as const;

// Captured by build() for run(), as seededNameVarId is.
let authoredFinishStageId = '';

const buildAuthoredFinish = () => {
  const synth = new SyntheticInterview();
  synth.addInformationStage({ title: 'Study overview' });
  authoredFinishStageId = synth.addFinishSessionStage(AUTHORED).id;
  return synth;
};

/** The completed state: closing text and notice, and no way back in. */
const expectCompletedState = async (
  page: Page,
  interview: ScenarioContext['interview'],
  heading: string,
) => {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(page.getByText(FINISHED_NOTICE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0);
  await expect(interview.nextButton).toHaveCount(0);
  await expect(page.getByTestId('previous-button')).toHaveCount(0);
};

export const finishSessionScenarios: InterfaceScenarios = {
  interfaceType: 'FinishSession',
  scenarios: [
    {
      id: 'terminal-render-and-navigation',
      covers: [
        'stage.type',
        'stage.id',
        'terminal-navigation',
        'progress-100',
        'analytics.interview_finished',
        'completed-state.after-finish',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      // currentStep 1: the finish stage SyntheticInterview appends, with the
      // text Network Canvas supplies.
      currentStep: 1,
      run: async ({ page, interview }) => {
        await expect(
          page.getByRole('heading', { name: 'Finish Interview' }),
        ).toBeVisible();
        await expect(
          page.getByText('You have reached the end of the interview', {
            exact: false,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Finish' }),
        ).toBeVisible();

        // Terminal navigation semantics: can't go forward, can go back.
        await expect(interview.nextButton).toBeDisabled();
        await expect(page.getByTestId('previous-button')).toBeEnabled();

        // No dialog until Finish is clicked.
        await expect(page.getByRole('dialog')).toHaveCount(0);

        // progress-100 has no host-side capture in the e2e host (no
        // StepChangeMeta recorded); the URL step param is the only signal.
        await expect(page).toHaveURL(/step=1/);

        // Happy path: drive the confirm flow to completion via the shared
        // fixture helper (asserts heading, clicks Finish, confirms dialog).
        await interview.finishInterview();
        await expect(page.getByRole('dialog')).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.aborted).toBe(false);
        expect(calls[0]?.finish).toEqual({
          stageId: DEFAULT_FINISH_STAGE_ID,
          outcome: 'completed',
        });

        // Finishing leaves the interview in its completed state, with focus
        // on the closing text rather than dropped on the document.
        await expectCompletedState(page, interview, 'Finish Interview');
        await expect(
          page.getByRole('heading', { name: 'Finish Interview' }),
        ).toBeFocused();
      },
    },

    {
      id: 'authored-text-and-outcome',
      covers: ['label', 'interviewScript', 'title', 'content', 'outcome'],
      visual: true,
      build: buildAuthoredFinish,
      currentStep: 1,
      run: async ({ page, interview }) => {
        // The title's markdown is inline: emphasis inside the heading.
        const heading = page.getByRole('heading', { name: 'All done' });
        await expect(heading).toBeVisible();
        await expect(heading.locator('em')).toHaveText('done');
        await expect(
          page.locator('strong', { hasText: 'taking part' }),
        ).toBeVisible();
        await expect(
          page.getByText('You may now close this window.'),
        ).toBeVisible();
        // The label is for the timeline and the interview script for the
        // interviewer; neither is shown to the participant.
        await expect(page.getByText(AUTHORED.label)).toHaveCount(0);
        await expect(page.getByText(AUTHORED.interviewScript)).toHaveCount(0);

        await page.getByRole('button', { name: 'Finish' }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Finish', exact: true })
          .click();

        // The host is told which finish stage ended the interview, and how.
        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.finish).toEqual({
          stageId: authoredFinishStageId,
          outcome: AUTHORED.outcome,
        });

        await expectCompletedState(page, interview, 'All done');
        await expect(page.getByText(AUTHORED.interviewScript)).toHaveCount(0);
      },
    },

    {
      id: 'completed-state-on-open',
      covers: ['completed-state.on-open'],
      visual: true,
      build: buildAuthoredFinish,
      finished: 'recorded',
      run: async ({ page, interview }) => {
        // A finished interview opens on the finish stage it ended at, whatever
        // step the host asks for, and does not move focus on its own.
        await expectCompletedState(page, interview, 'All done');
        await expect(
          page.getByRole('heading', { name: 'All done' }),
        ).not.toBeFocused();
        await expect(page.getByText('Study overview')).toHaveCount(0);

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(0);
      },
    },

    {
      id: 'completed-state-without-recorded-stage',
      covers: ['completed-state.unrecorded-finish'],
      build: buildAuthoredFinish,
      finished: 'unrecorded',
      run: async ({ page, interview }) => {
        // An interview finished before its host recorded finish stages shows
        // the protocol's finish stage.
        await expectCompletedState(page, interview, 'All done');
      },
    },

    {
      id: 'confirm-dialog-and-cancel',
      covers: [
        'confirm-dialog.copy',
        'confirm-dialog.destructive-focus',
        'onFinish.cancel-path',
        'interviewId-guard',
      ],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page }) => {
        await page.getByRole('button', { name: 'Finish' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText('Are you sure you want to finish the interview?'),
        ).toBeVisible();
        await expect(
          dialog.getByText(
            'Finish this interview only when you are satisfied with your responses.',
          ),
        ).toBeVisible();

        const primary = dialog.getByTestId('dialog-primary');
        const cancel = dialog.getByTestId('dialog-cancel');
        await expect(primary).toHaveText('Finish');
        await expect(cancel).toHaveText('Cancel');
        // Destructive intent autofocuses Cancel, not the primary action.
        await expect(cancel).toBeFocused();

        await cancel.click();
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(0);

        // Component is reusable after a cancel; the interviewId guard doesn't
        // block a repeat open.
        await page.getByRole('button', { name: 'Finish' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await dialog.evaluate(async (element) => {
          const animations = [
            element,
            ...element.querySelectorAll('*'),
          ].flatMap((node) => node.getAnimations());
          await Promise.all(
            animations.map((animation) =>
              animation.finished.catch(() => undefined),
            ),
          );
        });
        await expect(cancel).toHaveText('Cancel');
        await expect(
          dialog.getByRole('button', { name: 'Close' }),
        ).toBeVisible();
      },
    },

    {
      id: 'confirm-path-pending-resolve',
      covers: ['onFinish.confirm-calls-handler', 'onFinish.pending-state'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page, interview }) => {
        await page.evaluate(() =>
          window.__test.setFinishBehavior({ mode: 'manual' }),
        );

        await page.getByRole('button', { name: 'Finish' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const primary = dialog.getByTestId('dialog-primary');
        await primary.click();

        // Pending: disabled, spinner, "Please wait..." — no fixed delay to
        // wait out, the mock hangs until we call resolveManualFinish().
        await expect(primary).toBeDisabled();
        await expect(primary).toHaveText('Please wait...');
        await expect(dialog.locator('svg.animate-spin')).toBeVisible();

        await page.evaluate(() => window.__test.resolveManualFinish());
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.interviewId).toBe(interview.interviewId);
        expect(calls[0]?.aborted).toBe(false);
      },
    },

    {
      id: 'error-path-retry',
      covers: ['onFinish.error-retry'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page }) => {
        await page.evaluate(() =>
          window.__test.setFinishBehavior({
            mode: 'reject',
            message: 'finish failed',
          }),
        );

        await page.getByRole('button', { name: 'Finish' }).click();
        const dialog = page.getByRole('dialog');
        const primary = dialog.getByTestId('dialog-primary');
        await primary.click();

        // Rejection keeps the dialog open with actionable interface-language
        // guidance, without exposing raw host diagnostics; primary can retry.
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText(
            'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          dialog.getByText('finish failed', { exact: true }),
        ).toHaveCount(0);
        await expect(primary).toBeEnabled();

        await page.evaluate(() =>
          window.__test.setFinishBehavior({ mode: 'resolve' }),
        );
        await primary.click();
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(2);
      },
    },

    {
      id: 'held-open-while-pending',
      covers: ['onFinish.held-open-while-pending'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page, interview }) => {
        await page.evaluate(() =>
          window.__test.setFinishBehavior({ mode: 'manual' }),
        );

        await page.getByRole('button', { name: 'Finish' }).click();
        const dialog = page.getByRole('dialog');
        const primary = dialog.getByTestId('dialog-primary');
        await primary.click();

        await expect(primary).toBeDisabled();
        await expect(primary).toHaveText('Please wait...');

        // A host's finish runs to completion whatever happens to the dialog,
        // so it cannot be left while the finish is under way: Cancel is
        // disabled, there is no close button, and Escape is refused.
        await expect(dialog.getByTestId('dialog-cancel')).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(
          0,
        );
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();

        await page.evaluate(() => window.__test.resolveManualFinish());
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.interviewId).toBe(interview.interviewId);
        expect(calls[0]?.aborted).toBe(false);
      },
    },

    {
      id: 'back-navigation-preserves-network',
      covers: ['back-navigation-network-intact'],
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType();
        const nameVar = nodeType.addVariable({ name: 'name', type: 'text' });
        seededNameVarId = nameVar.id;
        const stageOne = synth.addInformationStage({ title: 'Stage One' });
        synth.addInformationStage({ title: 'Stage Two' });
        // Seed a node directly into the network so this scenario doesn't
        // depend on another interface's UI (e.g. NameGeneratorQuickAdd) —
        // the only thing under test here is whether visiting the finish
        // stage mutates the shared graph.
        synth.addManualNode(stageOne.id, nodeType.id, 'seed-node-1', {
          [nameVar.id]: 'Seeded Participant',
        });
        return synth;
      },
      seedNetwork: true,
      // 2 real stages (index 0, 1) + finish stage at index 2.
      currentStep: 2,
      run: async ({ page, interview, protocol }) => {
        await expect(
          page.getByRole('heading', { name: 'Finish Interview' }),
        ).toBeVisible();

        await page.getByTestId('previous-button').click();
        await expect(page).toHaveURL(/step=1/);
        await expect(
          page.getByRole('heading', { name: 'Stage Two' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const nodes = state?.nodes ?? [];
        expect(nodes).toHaveLength(1);
        expect(nodes[0]?.[entityAttributesProperty][seededNameVarId]).toBe(
          'Seeded Participant',
        );
      },
    },

    {
      id: 'stages-menu-excludes-finish',
      covers: ['stagesMenu-exclusion'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Stage One' });
        synth.addInformationStage({ title: 'Stage Two' });
        return synth;
      },
      currentStep: 2,
      run: async ({ page }) => {
        // Stage navigation is opt-in in the e2e host (default off keeps the
        // "Go to another screen" button out of every other suite's aria tree).
        // Enable it for this scenario only; App re-renders and Shell mounts the
        // drawer.
        await page.evaluate(() => window.__test.setAllowStageNavigation(true));

        await page
          .getByRole('button', { name: 'Go to another screen' })
          .first()
          .click();

        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();

        // Only the 2 other stages appear: the finish stage is reached with
        // Next, never from the StagesMenu.
        const options = listbox.getByRole('option');
        await expect(options).toHaveCount(2);
        await expect(
          listbox.getByRole('option', { name: 'Finish Interview' }),
        ).toHaveCount(0);
      },
    },
  ],
};
