import type { Locator, Page } from '@playwright/test';

// The one FamilyPedigree wizard driver, owned by the interview package's e2e
// fixtures. Reached by relative path because `@codaco/interview-e2e` is a
// private harness with no published entry point — it is a leaf module whose
// only import is `@playwright/test`, so nothing else crosses the boundary.
import {
  setPedigreeField,
  setPedigreePartnership,
} from '../../../../../packages/interview/e2e/fixtures/pedigree-field-driver.js';
import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { loadTemplateProtocol } from '../../helpers/load-fixture.js';
import { appErrorBoundary, StagePreview } from '../../pageobjects/preview.js';
import { Timeline } from '../../pageobjects/timeline.js';

/**
 * Regression coverage for issue #1390: opening a person's editor in the
 * FamilyPedigree preview threw `useFamilyPedigreeStore must be used within a
 * FamilyPedigreeProvider`, which escaped past the interview's stage error
 * boundary to Architect's global one — and acknowledging that boundary
 * remounted PreviewHost, which re-ran the handshake and rebuilt the session,
 * discarding the pedigree the researcher had just built.
 *
 * This is the only Architect spec that drives the preview window, because that
 * host stack (popup + `window.opener` handshake + PreviewHost + Architect's own
 * AppErrorBoundary) is exactly what the interview package's own matrix suite
 * cannot reach.
 *
 * The protocol is the shipped Eco-Genetic Relationship Maps template — its
 * `family-pedigree` stage is a fully-configured FamilyPedigree with
 * participant-chosen framing, an intro screen and two `nodeConfig.form` fields,
 * i.e. the configuration QA reported against.
 */

const CEGRM_TEMPLATE = 'eco-genetic-relationship-maps';
const PEDIGREE_STAGE_LABEL = 'Family pedigree';

/**
 * Fill one field of the open dialog. `setPedigreeField` is the SAME driver the
 * interview package's FamilyPedigree matrix scenarios use — imported, not
 * ported. The copy that used to live here had already lost the number and
 * accessible-name branches, so a wizard change that touched either would have
 * been caught in one suite and silently missed in this one.
 */
const setField = (
  dialog: Locator,
  fieldName: string,
  value: boolean | string | number,
) => setPedigreeField(dialog, fieldName, value);

/**
 * Walk the quick-start wizard to a two-parent pedigree named Linda and Robert,
 * then dismiss the "Building the rest of your pedigree" hint whose backdrop
 * would otherwise swallow the first canvas click.
 */
async function buildPedigree(preview: Page): Promise<void> {
  const dialog = preview.getByRole('dialog');
  const next = () => dialog.getByTestId('wizard-next').click();

  await preview.getByTestId('pedigree-get-started').click();
  await expect(dialog).toBeVisible();

  // The template's introScreen, then its participant-chosen framing.
  await next();
  await dialog.locator('[role="option"][data-value="gamete"]').click();
  await next();

  await setField(dialog, 'biologicalSex', 'female');
  await next();

  await setField(dialog, 'egg-parent.is-donor', false);
  await setField(dialog, 'egg-parent.name', 'Linda');
  await setField(dialog, 'egg-parent.gestationalCarrier', true);
  await next();

  await setField(dialog, 'sperm-parent.is-donor', false);
  await setField(dialog, 'sperm-parent.name', 'Robert');
  await next();

  await setField(dialog, 'hasOtherParents', false);
  await next();

  await setPedigreePartnership(dialog, 'egg-parent', 'Robert', 'current');
  await next();

  await setField(dialog, 'hasPartner', false);
  await next();

  await expect(
    dialog.getByText('Building the rest of your pedigree'),
  ).toBeVisible();
  await dialog.getByTestId('dialog-primary').click();
  await expect(dialog).toBeHidden();
}

async function openPersonEditor(preview: Page, name: string): Promise<void> {
  await preview.getByRole('button', { name, exact: true }).click();
  const editItem = preview.getByTestId('pedigree-menu-edit');
  await expect(editItem).toBeVisible();
  // The menu inherits pointer-events:none from its backdrop during the open
  // animation (repo-wide base-ui menu race).
  await expect
    .poll(() => editItem.evaluate((el) => getComputedStyle(el).pointerEvents))
    .not.toBe('none');
  await editItem.click();
}

test('edits a person in the Family Pedigree preview without losing the pedigree', async ({
  architectPage,
  seed,
}) => {
  // Building a pedigree through the quick-start wizard is a long interaction
  // on top of a protocol seed and a preview launch.
  test.slow();

  await seed(loadTemplateProtocol(CEGRM_TEMPLATE));
  await gotoProtocol(architectPage);

  await new Timeline(architectPage).openStage(PEDIGREE_STAGE_LABEL);

  const stagePreview = new StagePreview(architectPage);
  // Synthetic data off, so the stage opens on its empty build phase and the
  // pedigree under test is one this spec created — the state the crash
  // destroyed.
  await stagePreview.setUseSyntheticData(false);
  const preview = await stagePreview.open();

  await buildPedigree(preview);
  // `exact` throughout: the completeness checklist also names people, so a
  // substring match would resolve to both the canvas node and a checklist row.
  await expect(
    preview.getByRole('button', { name: 'Linda', exact: true }),
  ).toBeVisible();

  await openPersonEditor(preview, 'Linda');

  const dialog = preview.getByRole('dialog');
  // The crash: PersonNameField's `useFamilyPedigreeStore` threw as the dialog
  // rendered, so the editor never appeared and the boundary's copy did.
  //
  // Assert the editor FIRST: it is the assertion that waits, so an absence
  // check placed ahead of it could resolve before a crash had rendered
  // anything. Ordered this way the pair fails on both halves against unfixed
  // source — the field is never found, and the boundary count is 1.
  await expect(
    dialog.locator('[data-field-name="name"]').getByRole('textbox'),
  ).toHaveValue('Linda');
  await expect(appErrorBoundary(preview)).toHaveCount(0);

  // Change the name and one of the protocol-authored `nodeConfig.form` fields.
  await setField(dialog, 'name', 'Linda Edited');
  await dialog
    .locator('[data-field-name="living_status"]')
    .getByRole('checkbox', { name: 'Deceased' })
    .click();
  await dialog.getByTestId('dialog-submit').click();
  await expect(dialog).toBeHidden();

  // The edit landed, and the rest of the pedigree survived it — before the fix
  // the boundary's recovery rebuilt the session from scratch instead.
  await expect(
    preview.getByRole('button', { name: 'Linda Edited', exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByRole('button', { name: 'Robert', exact: true }),
  ).toBeVisible();
  await expect(appErrorBoundary(preview)).toHaveCount(0);

  // Reopening the editor is the oracle for the form field: preview session
  // state is never persisted, so the dialog itself is where it can be read
  // back.
  await openPersonEditor(preview, 'Linda Edited');
  await expect(
    dialog.locator('[data-field-name="name"]').getByRole('textbox'),
  ).toHaveValue('Linda Edited');
  await expect(
    dialog
      .locator('[data-field-name="living_status"]')
      .getByRole('checkbox', { name: 'Deceased' }),
  ).toHaveAttribute('aria-checked', 'true');
});
