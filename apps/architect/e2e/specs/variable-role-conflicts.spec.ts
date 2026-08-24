import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { readStageJson } from '../helpers/read-store.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
import { Timeline } from '../pageobjects/timeline.js';

// Two categorical options are the schema minimum (categoricalOptionsSchema:
// `.min(2)`), and every writer below is on the same `node`/`person` subject —
// role conflicts are scoped by subject (roleMapKey), so a mismatched entity
// or type would silently drop out of the role map instead of conflicting.
const categoricalOptions = [
  { label: 'Option A', value: 'a' },
  { label: 'Option B', value: 'b' },
];

// Builds a protocol with a form+bin cross-class conflict on `sharedVar` (an
// AlterForm field — a VALIDATED writer — and a CategoricalBin prompt's
// `variable` — an UNVALIDATED writer — both on node type "person"), plus two
// single-role variables (`formOnlyVar`, `binOnlyVar`) that must each stay
// excluded from the *other* class's picker, and one wholly unused `cleanVar`
// confirming the pickers aren't just returning an empty list. Each writer
// gets its own stage (rather than sharing one AlterForm/CategoricalBin stage
// with two fields/prompts) so every DialogArrayField section holds exactly
// one row — no need to disambiguate rows by index or preview text.
// Variable "name"s (not just their codebook keys) must satisfy
// VariableNameSchema's `/^[a-zA-Z0-9._:-]+$/` — no spaces — since that field
// is what the alert/picker render as the visible label.
// Passed through CurrentProtocolSchema.parse (like
// helpers/load-fixture.ts's loadAllInterfacesFixture) rather than typed
// directly as CurrentProtocol: entityAttributeReference's branded string
// type isn't structurally assignable from a plain string literal without an
// `as` cast, but a schema-driven .parse() legitimately produces the branded
// value from an unknown-typed input — and validates the fixture is
// real-shape at the same time.
function conflictProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: 'Variable Role Conflicts E2E',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            sharedVar: {
              name: 'sharedVar',
              type: 'categorical',
              // Referenced by an AlterForm field below — schema.ts's
              // logic refinements reject a form-field variable with no
              // `component` ("must define a component ... to be rendered
              // as a form field").
              component: 'CheckboxGroup',
              options: categoricalOptions,
            },
            formOnlyVar: {
              name: 'formOnlyVar',
              type: 'categorical',
              component: 'CheckboxGroup',
              options: categoricalOptions,
            },
            binOnlyVar: {
              name: 'binOnlyVar',
              type: 'categorical',
              options: categoricalOptions,
            },
            cleanVar: {
              name: 'cleanVar',
              type: 'categorical',
              options: categoricalOptions,
            },
          },
        },
      },
    },
    stages: [
      {
        id: 'shared-field-form',
        type: 'AlterForm',
        label: 'Person Details',
        subject: { entity: 'node', type: 'person' },
        form: {
          fields: [{ variable: 'sharedVar', prompt: 'Shared field prompt' }],
        },
        introductionPanel: {
          title: 'Person details',
          text: 'A few questions about this person.',
        },
      },
      {
        id: 'form-only-form',
        type: 'AlterForm',
        label: 'Extra Person Form',
        subject: { entity: 'node', type: 'person' },
        form: {
          fields: [
            { variable: 'formOnlyVar', prompt: 'Form only field prompt' },
          ],
        },
        introductionPanel: {
          title: 'Extra form',
          text: 'A few more questions about this person.',
        },
      },
      {
        id: 'shared-bin',
        type: 'CategoricalBin',
        label: 'Contact Category',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'shared-bin-prompt',
            text: 'Shared bin prompt',
            variable: 'sharedVar',
          },
        ],
      },
      {
        id: 'bin-only-bin',
        type: 'CategoricalBin',
        label: 'Extra Category Bin',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'bin-only-prompt',
            text: 'Bin only prompt',
            variable: 'binOnlyVar',
          },
        ],
      },
    ],
  });
}

test('surfaces a form+bin variable role conflict in the timeline alert and Stages nav tab', async ({
  architectPage,
  seed,
}) => {
  await seed(conflictProtocol());
  await gotoProtocol(architectPage);

  // VariableRoleConflictsAlert.tsx: singular title text for exactly one
  // conflict (our fixture has only one: sharedVar).
  await expect(
    architectPage.getByRole('heading', {
      level: 4,
      name: 'An attribute is written both with and without validation',
    }),
  ).toBeVisible();

  // The conflict's own <li> names the variable and both stage labels
  // (describeHits joins each side's stage labels — "collected by a form in
  // Person Details; written without validation in Contact Category").
  const conflictItem = architectPage
    .locator('li')
    .filter({ hasText: 'sharedVar' });
  await expect(conflictItem).toHaveCount(1);
  await expect(conflictItem).toContainText('Person Details');
  await expect(conflictItem).toContainText('Contact Category');

  // ProjectNav.tsx: the Stages tab's icon carries a warning badge whose
  // sr-only text names the conflict; that text is appended to the link's
  // accessible name.
  await expect(
    architectPage.getByRole('link', {
      name: /Stages.*has attributes written both with and without validation/,
    }),
  ).toBeVisible();
});

test("excludes each writer's picker from offering the other class's variable, while keeping the current selection", async ({
  architectPage,
  seed,
}) => {
  await seed(conflictProtocol());
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  const editor = new StageEditor(architectPage);

  // AlterForm's field `variable` picker is a VALIDATED writer
  // (withFieldsHandlers.tsx's excludeUnvalidatedUses): it must drop
  // binOnlyVar (an UNVALIDATED-only writer elsewhere), while keeping the
  // field's own current value (sharedVar, also itself part of the conflict)
  // and the unrelated cleanVar.
  await timeline.openStage('Person Details');
  await editor
    .section('Form')
    .getByRole('button', { name: 'Edit field' })
    .click();
  const fieldDialog = architectPage.getByRole('dialog', { name: 'Edit Field' });
  await expect(fieldDialog).toBeVisible();
  await fieldDialog.getByRole('button', { name: 'Change attribute' }).click();

  const formPickerItems = architectPage.getByTestId('spotlight-list-item');
  await expect(formPickerItems).toHaveCount(3);
  await expect(formPickerItems.filter({ hasText: 'binOnlyVar' })).toHaveCount(
    0,
  );
  await expect(formPickerItems.filter({ hasText: 'sharedVar' })).toHaveCount(1);
  await expect(formPickerItems.filter({ hasText: 'cleanVar' })).toHaveCount(1);

  // Navigating away (rather than closing the spotlight/dialog first) is
  // deliberate: neither has been touched, so there is nothing to discard,
  // and it sidesteps the spotlight's own Escape handler racing the outer
  // Dialog's (both are dismissible-on-Escape).
  await gotoProtocol(architectPage);

  // CategoricalBin's prompt `variable` picker is an UNVALIDATED writer
  // (withVariableOptions.tsx's excludeValidatedUses): it must drop
  // formOnlyVar (a VALIDATED-only writer elsewhere), while keeping the
  // prompt's own current value (sharedVar) and the unrelated cleanVar.
  await timeline.openStage('Contact Category');
  await editor
    .field('prompts')
    .getByRole('button', { name: 'Edit prompt' })
    .click();
  const promptDialog = architectPage.getByRole('dialog', {
    name: 'Edit Prompt',
  });
  await expect(promptDialog).toBeVisible();
  await promptDialog.getByRole('button', { name: 'Change attribute' }).click();

  const binPickerItems = architectPage.getByTestId('spotlight-list-item');
  await expect(binPickerItems).toHaveCount(3);
  await expect(binPickerItems.filter({ hasText: 'formOnlyVar' })).toHaveCount(
    0,
  );
  await expect(binPickerItems.filter({ hasText: 'sharedVar' })).toHaveCount(1);
  await expect(binPickerItems.filter({ hasText: 'cleanVar' })).toHaveCount(1);

  await gotoProtocol(architectPage);

  // Inspecting both pickers never saved anything: the underlying stages
  // still hold their originally-seeded variables.
  const alterFormStage = await readStageJson(architectPage, 0);
  if (alterFormStage.type !== 'AlterForm') {
    throw new Error('expected stage 0 to still be an AlterForm');
  }
  expect(alterFormStage.form.fields[0]?.variable).toBe('sharedVar');

  const categoricalBinStage = await readStageJson(architectPage, 2);
  if (categoricalBinStage.type !== 'CategoricalBin') {
    throw new Error('expected stage 2 to still be a CategoricalBin');
  }
  expect(categoricalBinStage.prompts[0]?.variable).toBe('sharedVar');
});
