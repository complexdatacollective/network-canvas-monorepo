import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

// The name variable's codebook key is a builder-generated id, not the literal
// 'name' (addNodeType auto-seeds a "name" text variable and addVariable dedupes
// to it). build() captures the deduped id here so back-navigation-preserves-
// network's run() can key its network assertion by the same id. Safe as a
// module-scoped value: build() and run() for a single scenario execute
// sequentially within one test, and each Playwright worker imports this module
// fresh.
let seededNameVarId = '';

export const finishSessionScenarios: InterfaceScenarios = {
  interfaceType: 'FinishSession',
  scenarios: [
    {
      id: 'terminal-render-and-navigation',
      covers: [
        'stage.type',
        'stage.id',
        'stage.label',
        'terminal-navigation',
        'progress-100',
        'analytics.interview_finished',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      // currentStep 1 === protocolStages.length: the engine-appended finish
      // stage. It has no schema-8 definition — nothing here is authorable,
      // so this scenario just proves the (hardcoded) render + terminal nav.
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

        // Dead config: DefaultFinishStage.label ('Finish Interview') and its
        // synthetic id are never read by this component — the heading text
        // above is a hardcoded literal in FinishSession.tsx, not stage.label.
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
            'Your responses cannot be changed after you finish the interview.',
          ),
        ).toBeVisible();

        const primary = dialog.getByTestId('dialog-primary');
        const cancel = dialog.getByTestId('dialog-cancel');
        await expect(primary).toHaveText('Finish Interview');
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

        // Rejection keeps the dialog open with the error message, primary
        // re-enabled for retry.
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('finish failed')).toBeVisible();
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
      id: 'abort-path-dismiss-while-pending',
      covers: ['onFinish.abort-on-dismiss'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page }) => {
        await page.evaluate(() =>
          window.__test.setFinishBehavior({ mode: 'hang-until-abort' }),
        );

        await page.getByRole('button', { name: 'Finish' }).click();
        const dialog = page.getByRole('dialog');
        const primary = dialog.getByTestId('dialog-primary');
        await primary.click();

        await expect(primary).toBeDisabled();
        await expect(primary).toHaveText('Please wait...');

        // Dismiss while pending — this aborts the in-flight onFinish call.
        await dialog.getByTestId('dialog-cancel').click();
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.aborted).toBe(true);

        // AbortError is swallowed — no error text ever renders anywhere.
        await expect(page.getByText('finish failed')).toHaveCount(0);
        await expect(page.locator('[class*="text-destructive"]')).toHaveCount(
          0,
        );

        // Finish stage still usable.
        await expect(
          page.getByRole('heading', { name: 'Finish Interview' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Finish' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
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
        // the only thing under test here is whether visiting the
        // engine-appended finish stage mutates the shared graph.
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
        // "Go to a stage" button out of every other suite's aria tree). Enable
        // it for this scenario only; App re-renders and Shell mounts the drawer.
        await page.evaluate(() =>
          window.__test.setAllowStageNavigation(true),
        );

        await page
          .getByRole('button', { name: 'Go to a stage' })
          .first()
          .click();

        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();

        // Only the 2 real stages appear — the engine-appended finish stage is
        // excluded from the StagesMenu (it reads getProtocolStages, not the
        // finish-augmented list).
        const options = listbox.getByRole('option');
        await expect(options).toHaveCount(2);
        await expect(
          listbox.getByRole('option', { name: 'Finish Interview' }),
        ).toHaveCount(0);
      },
    },
  ],
};
