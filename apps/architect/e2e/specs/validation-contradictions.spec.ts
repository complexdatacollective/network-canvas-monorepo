import { type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import {
  EGO_FORM_STAGE_ID,
  EGO_MOOD_ID,
  pipedTextProtocol,
} from '../fixtures/piped-text-protocol.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { openValidationSection } from '../pageobjects/editor-sections/form-field-controls.js';
import {
  addFormField,
  closeFieldSettings,
  openFieldSettings,
} from '../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

// The repair guidance a researcher is given for an inverted min/max pair
// (`validationContradictionMessages.invertedBounds`, protocol-validation's own
// catalog), with the attribute named because by the time rules can be set the
// attribute exists and has a name.
const INVERTED_BOUNDS =
  'The minimum and maximum rules for age leave no permitted answer. Adjust the bounds or the required-answer rule.';

/**
 * The same sentence as a pattern, for reading it off a control's own
 * description: a rule row describes its number box with its hint and its
 * error together, so the description holds this sentence among others.
 */
const invertedBounds = new RegExp(
  INVERTED_BOUNDS.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
);

/**
 * The rules the codebook holds for the `age` attribute, as the protocol has
 * them right now.
 *
 * The attribute and its rules are written when the stage is saved;
 * `undefined` is "no rules on it", which is what a refused write leaves
 * behind.
 */
function ageValidation(
  protocol: CurrentProtocol,
): Record<string, unknown> | undefined {
  const variables = protocol.codebook.ego?.variables ?? {};
  const age = Object.values(variables).find(
    (variable) => variable.name === 'age',
  );
  if (!age || age.type !== 'number') {
    throw new Error('expected a saved number variable named "age"');
  }
  return age.validation;
}

// `ageValidation` throws until the attribute is in the protocol, which with
// the stage's draft is only once the stage has been saved; a poll waits on
// this instead.
function ageValidationOrNothing(
  protocol: CurrentProtocol,
): Record<string, unknown> | undefined {
  const age = Object.values(protocol.codebook.ego?.variables ?? {}).find(
    (variable) => variable.name === 'age',
  );
  return age && age.type === 'number' ? age.validation : undefined;
}

/** An EgoForm carrying one number field on a new `age` attribute, left open. */
async function egoFormWithAgeField(architectPage: Page): Promise<StageEditor> {
  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  await addFormField(editor.section('Form'), {
    variableName: 'age',
    promptText: 'How old are you?',
    inputControl: 'Number Input',
  });
  return editor;
}

/**
 * Open the settings of the field just added, and the codebook rules for its
 * attribute in them.
 *
 * The rules are the CODEBOOK's, and are shown for an attribute that exists:
 * the field is added first, which creates the attribute.
 */
async function openAgeRules(editor: StageEditor) {
  const section = editor.section('Form');
  const settings = await openFieldSettings(section, 'How old are you?');
  return { settings, rules: await openValidationSection(settings) };
}

test('the field editor blocks an inverted min/max validation pair', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await egoFormWithAgeField(architectPage);
  const { settings, rules } = await openAgeRules(editor);

  // Each rule is a switch, with the value beside it in a number input carrying
  // the same (visually hidden) name — role tells the two apart
  // (`VariableValidationEditor`, `ValidationRule`).
  const minValue = rules.getByRole('spinbutton', {
    name: 'Minimum value',
    exact: true,
  });
  const maxValue = rules.getByRole('spinbutton', {
    name: 'Maximum value',
    exact: true,
  });

  await rules
    .getByRole('switch', { name: 'Minimum value', exact: true })
    .click();
  await minValue.fill('10');
  await minValue.press('Tab');

  // Attempt maxValue 2 — the reason must be shown, and the value must be held
  // for correction rather than dropped.
  await rules
    .getByRole('switch', { name: 'Maximum value', exact: true })
    .click();
  await maxValue.fill('2');
  // A rule's number is held as typing and commits when the researcher has
  // finished with it — raising a maximum from 5 to 40 passes through 4, and a
  // map written at every keystroke would judge every intermediate. So the
  // move out of the box is what puts 2 into the rule map for the pair to be
  // judged. Tab keeps focus in the field settings, which stay open only while
  // focus is in them or in the field.
  await maxValue.press('Tab');
  // On each of the two rows that make it, because either is a place to repair
  // it — which is how Architect's rule list reports a contradiction
  // (`Validations.tsx` runs the check for every row). Read off the controls'
  // own descriptions rather than as free text, so a sentence about some other
  // rule could not satisfy this.
  await expect(minValue).toHaveAccessibleDescription(invertedBounds);
  await expect(maxValue).toHaveAccessibleDescription(invertedBounds);
  // The refused pair stays on screen for correction; what the attribute can
  // carry is asserted once the stage is saved, below — the rules are part of
  // the stage's draft until then.
  await expect(maxValue).toHaveValue('2');

  // Correcting the value clears the complaint and lets the write through.
  await maxValue.fill('20');
  await maxValue.press('Tab');
  await expect(rules.getByText(INVERTED_BOUNDS).first()).toBeHidden();

  await closeFieldSettings(editor.section('Form'), settings);

  await editor.expectNoIssues();
  await editor.save();

  // Confirm the corrected pair (not the rejected 10/2 pair) is what actually
  // persisted, proving the gate didn't just block the UI but let the fixed
  // rule through end-to-end.
  expect(
    ageValidation(
      await readProtocolJson(architectPage, (protocol) => {
        const validation = ageValidationOrNothing(protocol);
        return validation?.maxValue === 20;
      }),
    ),
  ).toMatchObject({
    minValue: 10,
    maxValue: 20,
  });
});

// Issue #1383. The spec above only proves the CORRECTED pair saves. The
// failure it was filed for is the uncorrected path: the editor closed, the
// save succeeded, and the offending rule was gone from the codebook without a
// word.
test('the field editor refuses to save an uncorrected min/max pair', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await egoFormWithAgeField(architectPage);
  const { settings, rules } = await openAgeRules(editor);

  const minValue = rules.getByRole('spinbutton', {
    name: 'Minimum value',
    exact: true,
  });
  const maxValue = rules.getByRole('spinbutton', {
    name: 'Maximum value',
    exact: true,
  });

  await rules
    .getByRole('switch', { name: 'Minimum value', exact: true })
    .click();
  await minValue.fill('100');
  await minValue.press('Tab');
  await rules
    .getByRole('switch', { name: 'Maximum value', exact: true })
    .click();
  await maxValue.fill('50');
  await maxValue.press('Tab');

  // The section stays open with both entered values intact, and says why — on
  // each of the two rows that make the pair.
  await expect(rules).toBeVisible();
  await expect(minValue).toHaveAccessibleDescription(invertedBounds);
  await expect(maxValue).toHaveAccessibleDescription(invertedBounds);
  await expect(minValue).toHaveValue('100');
  await expect(maxValue).toHaveValue('50');

  // What the protocol holds once the stage is saved, rule by rule. The rules
  // are the stage's draft until then, so the stage is saved. The minimum landed as it was entered — and switching the
  // maximum ON gave it the minimum's own value, which is a pair the attribute
  // can carry. The 50 that contradicts it never reached the record: that is
  // the failure #1383 was filed for said the other way round — not an editor
  // that closed and a save that succeeded with the offending rule gone
  // without a word, but a rule that never landed while the pair it would make
  // is on screen saying why.
  await closeFieldSettings(editor.section('Form'), settings);
  await editor.save();

  const validation = ageValidation(
    await readProtocolJson(
      architectPage,
      (protocol) => ageValidationOrNothing(protocol)?.minValue === 100,
    ),
  );
  expect(validation?.minValue).toBe(100);
  expect(validation?.maxValue).not.toBe(50);
  expect(validation?.maxValue).toBeGreaterThanOrEqual(100);
});

// Issue #1383. `Café` written with the precomposed U+00E9 and `Café` written
// as `e` + a combining acute render identically, so they reach the
// participant as two choices nothing tells apart.
test('the option editor rejects canonically equivalent labels', async ({
  architectPage,
  seed,
}) => {
  await seed(pipedTextProtocol());
  await architectPage.goto(`/protocol/stage/${EGO_FORM_STAGE_ID}`);

  // The options are the attribute's, edited from the settings of a field
  // that collects it.
  const settings = await openFieldSettings(
    new StageEditor(architectPage).section('Form'),
    'Your mood?',
  );
  await settings.getByRole('button', { name: 'Edit options' }).click();
  const optionsDialog = architectPage.getByRole('dialog', {
    name: 'Options and settings of mood',
  });
  const values = optionsDialog.getByRole('region', {
    name: 'Choice values',
    exact: true,
  });

  // Written with explicit escapes so the source file's own encoding cannot
  // quietly normalise the decomposed spelling into the precomposed one.
  const PRECOMPOSED = 'Caf\u00e9';
  const DECOMPOSED = 'Cafe\u0301';

  for (const [label, value] of [
    [PRECOMPOSED, 'cafe_a'],
    [DECOMPOSED, 'cafe_b'],
  ] as const) {
    await values
      .getByRole('button', { name: 'Create new option', exact: true })
      .click();
    await values
      .getByRole('textbox', { name: 'Label', exact: true })
      .fill(label);
    await values
      .getByRole('textbox', { name: 'Value', exact: true })
      .fill(value);
    await values
      .getByRole('button', { name: 'Finish editing option', exact: true })
      .click();
  }

  const save = optionsDialog.getByRole('button', { name: 'Save', exact: true });
  await save.click();

  await expect(save).toBeVisible();
  await expect(
    optionsDialog.getByText('Every option needs a unique label.').first(),
  ).toBeVisible();

  const protocol = await readProtocolJson(architectPage);
  const mood = protocol.codebook.ego?.variables?.[EGO_MOOD_ID];
  expect(
    mood !== undefined && 'options' in mood
      ? mood.options?.map(({ value }) => value)
      : undefined,
  ).toEqual(['happy', 'sad', 'calm']);
});
