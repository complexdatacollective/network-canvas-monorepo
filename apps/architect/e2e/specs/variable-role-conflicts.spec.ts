import { withInterfaceText } from '@codaco/interview/supplied-wording';
import {
  testVariableId,
  withTestCodebookIds,
} from '@codaco/protocol-builder/testing/testId';
import {
  createProtocolObjectId,
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readStageJson } from '../helpers/read-store.js';
import { openFieldSettings } from '../pageobjects/editor-sections/forms.js';
import {
  attributeRows,
  dismissAttributeWindow,
  offeredAttributeRows,
  openAttributeWindow,
  unavailableAttributeRows,
  unavailableReason,
} from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
import { Timeline } from '../pageobjects/timeline.js';

// Two categorical options are the schema minimum (categoricalOptionsSchema:
// `.min(2)`), and every writer below is on the same `node`/`person` subject —
// role conflicts are scoped by subject (roleMapKey), so a mismatched entity
// or type would silently drop out of the role map instead of conflicting.
const categoricalOptions = [
  { label: { en: 'Option A' }, value: 'a' },
  { label: { en: 'Option B' }, value: 'b' },
];

// Builds a protocol with a form+bin cross-class conflict on `sharedVar` (an
// AlterForm field — a VALIDATED writer — and a CategoricalBin prompt's
// `variable` — an UNVALIDATED writer — both on node type "person"), plus two
// single-role variables (`formOnlyVar`, `binOnlyVar`) that the *other*
// class's picker must list as not available here, and one wholly unused
// `cleanVar` confirming the pickers aren't just returning an empty list. Each writer
// gets its own stage (rather than sharing one AlterForm/CategoricalBin stage
// with two fields/prompts) so every array field section holds exactly one row
// — no need to disambiguate rows by index or preview text.
// Variable "name"s are what the alert/picker render as the visible label, so
// they are kept short and plain here. A name may be any text a
// `CodebookNameSchema` accepts, spaces and any script included. Codebook keys
// must be UUIDs, so the fixture is written with readable keys and given UUIDs
// by `withTestCodebookIds`.
// Passed through CurrentProtocolSchema.parse (like
// helpers/load-fixture.ts's loadAllInterfacesFixture) rather than typed
// directly as CurrentProtocol: entityAttributeReference's branded string
// type isn't structurally assignable from a plain string literal without an
// `as` cast, but a schema-driven .parse() legitimately produces the branded
// value from an unknown-typed input — and validates the fixture is
// real-shape at the same time.
/** A form that asks one question, for the attribute `variable`. */
function oneFieldForm(variable: string, prompt: string) {
  return formOf([
    { id: createProtocolObjectId(), variable, prompt: { en: prompt } },
  ]);
}

function conflictProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse(
    withInterfaceText(
      withTestCodebookIds({
        name: 'Variable Role Conflicts E2E',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
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
            id: createProtocolObjectId(),
            type: 'AlterForm',
            label: { en: 'Person Details' },
            subject: { entity: 'node', type: 'person' },
            form: oneFieldForm('sharedVar', 'Shared field prompt'),
          },
          {
            id: createProtocolObjectId(),
            type: 'AlterForm',
            label: { en: 'Extra Person Form' },
            subject: { entity: 'node', type: 'person' },
            form: oneFieldForm('formOnlyVar', 'Form only field prompt'),
          },
          {
            id: createProtocolObjectId(),
            type: 'CategoricalBin',
            label: { en: 'Contact Category' },
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: createProtocolObjectId(),
                text: { en: 'Shared bin prompt' },
                variable: 'sharedVar',
              },
            ],
          },
          {
            id: createProtocolObjectId(),
            type: 'CategoricalBin',
            label: { en: 'Extra Category Bin' },
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: createProtocolObjectId(),
                text: { en: 'Bin only prompt' },
                variable: 'binOnlyVar',
              },
            ],
          },
          ...emptyProtocol().stages,
        ],
      }),
    ),
  );
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

test("lists the other class's variable in each writer's picker as not available, with the reason, while keeping the current selection", async ({
  architectPage,
  seed,
}) => {
  await seed(conflictProtocol());
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  const editor = new StageEditor(architectPage);

  // Both pickers are `@codaco/protocol-builder`'s `VariablePickerField`. It
  // lists every attribute of the subject, and the caller marks the ones that
  // cannot be chosen here (`codebook/attributeAvailability.ts`): those are
  // `aria-disabled` (the bin's picker lists them under "Not available here",
  // a form field's keeps them in place), and choosing one shows the reason
  // instead of choosing it. Nothing has been typed in either popup,
  // so there is no create row and every option is an attribute.
  //
  // AlterForm's field attribute picker, in the field's settings, is a
  // VALIDATED writer: it must rule out
  // binOnlyVar (an UNVALIDATED-only writer elsewhere), while keeping the
  // field's own current value (sharedVar, also itself part of the conflict)
  // and the unrelated cleanVar on offer.
  await timeline.openStage('Person Details');
  const settings = await openFieldSettings(
    editor.section('Form'),
    'Shared field prompt',
  );
  const attributeField = settings.locator('[data-field-name$="-attribute"]');

  const formWindow = await openAttributeWindow(attributeField);
  await expect(formWindow.getByRole('option')).toHaveCount(4);
  await expect(offeredAttributeRows(formWindow, 'sharedVar')).toBeVisible();
  await expect(offeredAttributeRows(formWindow, 'cleanVar')).toBeVisible();
  await expect(offeredAttributeRows(formWindow, 'formOnlyVar')).toBeVisible();
  // A field's picker keeps an attribute that cannot be chosen in its place in
  // the list, disabled, with the reason beneath it.
  await expect(unavailableAttributeRows(formWindow)).toHaveCount(1);
  await expect(
    formWindow.getByRole('option', { name: 'binOnlyVar', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');
  expect(await unavailableReason(formWindow, 'binOnlyVar')).toBe(
    'The “Extra Category Bin” stage sets this attribute without validation, so it cannot also be collected here.',
  );
  // Choosing it chose nothing: the popup is still open on the same list, and
  // the row is still the one that cannot be chosen.
  await expect(formWindow).toBeVisible();
  await expect(
    unavailableAttributeRows(formWindow, 'binOnlyVar'),
  ).toBeVisible();
  await dismissAttributeWindow(formWindow);
  await expect(attributeField.locator('data[value]')).toHaveAttribute(
    'value',
    'sharedVar',
  );

  // Navigating away (rather than closing the settings first) is deliberate:
  // nothing has been touched, so there is nothing to discard.
  await gotoProtocol(architectPage);

  // CategoricalBin's prompt `variable` picker is an UNVALIDATED writer
  // (`BinAttributeField` marks validated uses for a slot whose writer class is
  // unvalidated): it must rule out formOnlyVar (a VALIDATED-only writer
  // elsewhere), while keeping the prompt's own current value (sharedVar) and
  // the unrelated cleanVar on offer.
  await timeline.openStage('Contact Category');
  await editor
    .field('prompts')
    .getByRole('button', { name: 'Edit prompt' })
    .click();
  const promptDialog = architectPage.getByRole('dialog', {
    name: 'Edit prompt',
  });
  await expect(promptDialog).toBeVisible();

  const binWindow = await openAttributeWindow(
    promptDialog.locator('[data-field-name="variable"]'),
  );
  // Four for the same reason: this picker offers creation too — a bin
  // attribute IS its list of values, so its create row escalates to the
  // codebook editor — but no create row is drawn until a name is typed.
  await expect(binWindow.getByRole('option')).toHaveCount(4);
  await expect(attributeRows(binWindow)).toHaveCount(4);
  await expect(offeredAttributeRows(binWindow, 'sharedVar')).toBeVisible();
  await expect(offeredAttributeRows(binWindow, 'cleanVar')).toBeVisible();
  await expect(offeredAttributeRows(binWindow, 'binOnlyVar')).toBeVisible();
  await expect(
    binWindow
      .getByRole('group', { name: 'Not available here', exact: true })
      .getByRole('option'),
  ).toHaveCount(1);
  await expect(
    binWindow
      .getByRole('group', { name: 'Not available here', exact: true })
      .getByRole('option', { name: 'formOnlyVar', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');
  expect(await unavailableReason(binWindow, 'formOnlyVar')).toBe(
    'The “Extra Person Form” stage collects this attribute and validates each answer, so it cannot also be set here without validation.',
  );
  await expect(binWindow).toBeVisible();
  await dismissAttributeWindow(binWindow);
  await expect(
    promptDialog.locator('[data-field-name="variable"]').locator('data[value]'),
  ).toHaveAttribute('value', 'sharedVar');

  await gotoProtocol(architectPage);

  // Inspecting both pickers never saved anything: the underlying stages
  // still hold their originally-seeded variables.
  const alterFormStage = await readStageJson(architectPage, 0);
  if (alterFormStage.type !== 'AlterForm') {
    throw new Error('expected stage 0 to still be an AlterForm');
  }
  expect(alterFormStage.form.fields[0]?.variable).toBe(
    testVariableId('sharedVar'),
  );

  const categoricalBinStage = await readStageJson(architectPage, 2);
  if (categoricalBinStage.type !== 'CategoricalBin') {
    throw new Error('expected stage 2 to still be a CategoricalBin');
  }
  expect(categoricalBinStage.prompts[0]?.variable).toBe(
    testVariableId('sharedVar'),
  );
});
