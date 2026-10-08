import type { Locator, Page } from '@playwright/test';

import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { StagePreview } from '../pageobjects/preview.js';
import { Timeline } from '../pageobjects/timeline.js';

/**
 * Regression coverage for issue #1398: confirming **Finish Interview** in the
 * Architect preview was a visible no-op. `PreviewHost` passed a `noopFinish`
 * to the Shell, so the confirmation closed back onto the same Finish screen —
 * no completed state, no next action, and Finish confirmable again forever.
 *
 * Driven end-to-end rather than only in `PreviewHost.test.tsx` because the
 * defect lives in the seam between two realms: the interview package owns the
 * Finish button and its confirmation dialog, Architect owns the popup and what
 * replaces the Shell. The unit test mocks the Shell away, so only this spec
 * exercises the real dialog → `onFinish` → teardown sequence, and only a real
 * browser can show where focus ends up after Base UI tears the dialog down.
 *
 * Two `Information` stages before the protocol's own finish stage: the second
 * exists so the first "Next Step" lands on a real stage rather than the finish
 * stage, i.e. so the spec proves the finish stage is reached by finishing the
 * protocol rather than by starting on it.
 */
const STAGE_LABEL = 'Welcome';

function twoScreenProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: 'Preview finish E2E',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: { en: STAGE_LABEL },
        title: { en: 'Welcome' },
        items: [
          {
            id: 'welcome-text',
            type: 'text',
            content: { en: 'Thank you for taking part.' },
          },
        ],
      },
      {
        id: 'closing',
        type: 'Information',
        label: { en: 'Closing' },
        title: { en: 'Closing' },
        items: [
          {
            id: 'closing-text',
            type: 'text',
            content: { en: 'That is everything we wanted to ask.' },
          },
        ],
      },
      {
        id: 'finish',
        type: 'FinishSession',
        label: { en: 'Finish' },
        title: { en: 'All done' },
        content: { en: 'Thank you for your time.' },
        outcome: 'completed',
      },
    ],
  });
}

/**
 * Seed the protocol, open its first stage, launch the preview, and walk it to
 * the protocol's finish stage. `exact` on the Finish locator matters: the
 * confirmation's title and its confirm action are "Finish Interview", while
 * the stage's button is the bare "Finish".
 */
async function previewToFinishStage(
  architectPage: Page,
  seed: (protocol: CurrentProtocol) => Promise<string>,
): Promise<{ preview: Page; nextStep: Locator; finishButton: Locator }> {
  await seed(twoScreenProtocol());
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage(STAGE_LABEL);

  const preview = await new StagePreview(architectPage).open();
  const nextStep = preview.getByRole('button', { name: 'Next Step' });
  const finishButton = preview.getByRole('button', {
    name: 'Finish',
    exact: true,
  });

  await expect(preview.getByRole('heading', { name: 'All done' })).toHaveCount(
    0,
  );
  await nextStep.click();
  await nextStep.click();
  await expect(finishButton).toBeVisible();

  return { preview, nextStep, finishButton };
}

test('finishing a preview reports completion, prevents a repeat, and can be restarted', async ({
  architectPage,
  seed,
}) => {
  // A protocol seed plus a popup launch plus a full walk to the finish stage.
  test.slow();

  const { preview, nextStep, finishButton } = await previewToFinishStage(
    architectPage,
    seed,
  );

  await finishButton.click();
  const dialog = preview.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Finish Interview' }).click();

  // 1. The completed state replaces the interview: the protocol's own
  //    closing text, the notice that the answers can no longer change, and
  //    nothing that would confirm Finish a second time or step back.
  const completionHeading = preview.getByRole('heading', { name: 'All done' });
  await expect(completionHeading).toBeVisible();
  await expect(preview.getByText('Thank you for your time.')).toBeVisible();
  await expect(
    preview.getByText(
      'This interview is finished, and its answers can no longer be changed.',
    ),
  ).toBeVisible();
  await expect(finishButton).toHaveCount(0);
  await expect(nextStep).toHaveCount(0);
  await expect(preview.getByTestId('previous-button')).toHaveCount(0);

  // 2. Focus lands on that heading and STAYS there. The re-check is
  //    deliberately gated on elapsed wall-clock time, not on a condition:
  //    every "the dialog is gone" oracle is already true once the completed
  //    state renders and would wait for nothing. What could still steal focus
  //    is Base UI's own deferred focus return, which fires a frame or more
  //    after close — so the only way to catch it is to let time pass. The
  //    re-check reads document.activeElement once rather than using
  //    `toBeFocused`, whose retries would forgive focus that left and came
  //    back.
  await expect(completionHeading).toBeFocused();
  await preview.waitForTimeout(1_000);
  expect(
    await completionHeading.evaluate((el) => el === document.activeElement),
  ).toBe(true);

  // 3. The completed state's one action really restarts the preview: a run of the same
  //    protocol, back at the stage Architect launched (the first screen's own
  //    copy, which the second screen does not share). That the restarted run
  //    carries a genuinely new session — not the finished one revived — is
  //    pinned in PreviewHost.test.tsx, which can read the session id.
  await preview
    .getByRole('button', { name: 'Start the preview again' })
    .click();
  await expect(completionHeading).toHaveCount(0);
  await expect(preview.getByText('Thank you for taking part.')).toBeVisible();
  await expect(nextStep).toBeVisible();
  await expect(finishButton).toHaveCount(0);
});

test('the finish confirmation tells the researcher a preview is never saved', async ({
  architectPage,
  seed,
}) => {
  test.slow();

  const { preview, finishButton } = await previewToFinishStage(
    architectPage,
    seed,
  );

  await finishButton.click();
  const dialog = preview.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The host-supplied description, not the participant default ("…satisfied
  // with your responses"), which promises a permanence a preview never has.
  await expect(dialog).toContainText('This is a preview, so nothing is saved.');
  await expect(dialog).not.toContainText('satisfied with your responses');
  // Confirming is a choice, not a trap: the researcher gives up this run only
  // by taking the confirm action, and Cancel leaves the interview intact.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(finishButton).toBeVisible();
});
