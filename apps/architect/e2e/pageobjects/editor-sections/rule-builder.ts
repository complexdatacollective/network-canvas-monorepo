import { type Locator } from '@playwright/test';

// The rule builder `@codaco/protocol-builder` ships (`rules/RuleSetField.tsx`,
// `rules/RuleEditorDialog.tsx`), mounted by the Skip logic section (ego rules
// available) and by the Stage filter section (no ego rules). Facts read off
// that source:
// - Add buttons: each rule set names its one add control, because a stage
//   editor can mount both at once (`addRuleLabel` — see ADD_RULE_BUTTONS).
//   The rule target is chosen inside the editor. The dialog is titled
//   'Construct a Rule' for both new and edit; its submit reads 'Finish and
//   Close'.
// - The entity radios are whole sentences ('Node - match a node type or one of
//   its attributes.'), so they are matched by their opening word.
// - The entity TYPE is the package's `EntityTypePickerField`: a native radio
//   named for the type alone, `sr-only` inside the label that draws the chip —
//   so the label is what a researcher clicks, and the input is what reports
//   checked. The stage editor behind the dialog renders the same picker, so
//   every locator here is dialog-scoped.
// - The 'Rule type' rich select is a listbox whose options carry their
//   descriptions in their accessible names ('Attribute Rule based on…' /
//   'Presence Based on…').
// - Operator LABELS (rules/operators.ts): EXACTLY → 'is exactly', EXISTS →
//   'exists', NOT_EXISTS → 'does not exist'. Presence operators render as
//   radios; attribute-rule operators are a native <select> named 'Operator'.
// - Boolean 'Attribute value' is a radiogroup. Its visible option labels come
//   from the attribute's authored markdown, while each radio exposes the
//   stored boolean through `data-value`.
// - The attribute is picked from a native select inside the
//   `options.attribute` field — the same seam, a different control from the
//   spotlight Architect used to render.
// - The join control only renders once 2+ rules exist. Its visible radios read
//   'All rules must match' / 'Any rule can match'; a single-rule set writes no
//   `join` key.
export type RuleSpec =
  | { kind: 'egoBooleanExactly'; variableName: string; value: boolean }
  | {
      kind: 'alterPresence';
      nodeTypeName: string;
      operator: 'exists' | 'does not exist';
    }
  | {
      kind: 'alterBooleanAttribute';
      nodeTypeName: string;
      variableName: string;
      // `true` only, deliberately. An entity rule's boolean starts as '' (not
      // false), so authoring `false` means toggling on then off — a sequence
      // no sample-protocol rule needs and none of these tests would cover.
      // The type says so rather than a runtime throw, so a caller finds out
      // at compile time.
      value: true;
    };

/**
 * The add buttons a filter offers. Ego rules are skip-logic only, so a filter
 * has no ego button — and `FilterRuleSpec` makes asking for one a compile
 * error rather than a locator that times out.
 */
export type FilterRuleSpec = Exclude<RuleSpec, { kind: 'egoBooleanExactly' }>;

/**
 * Verbatim from `RuleSetFields.tsx`. A rule set is one editable list, so each
 * builder has one add control and the dialog owns the target choice.
 */
const ADD_RULE_BUTTONS = {
  filter: 'Add new filter rule',
  skipLogic: 'Add new skip logic rule',
} as const;

/**
 * The chip a researcher clicks to choose an entity type.
 *
 * The radio itself is `sr-only` inside its own label, so the label is the
 * control on screen; the radio is still what reports the choice.
 */
const entityTypeChip = (host: Locator, name: string): Locator =>
  host
    .getByRole('radio', { name, exact: true })
    .locator('xpath=ancestor::label[1]');

const ruleDialog = (host: Locator) =>
  host.page().getByRole('dialog', { name: 'Construct a Rule' });

async function selectAttribute(
  dialog: Locator,
  attributeName: string,
): Promise<void> {
  // Scoped to the field rather than named: the select's own label is the
  // entity it is about ('Node attribute', 'Ego attribute'), and this helper
  // serves both.
  await dialog
    .locator('[data-field-name="options.attribute"]')
    .getByRole('combobox')
    .selectOption({ label: attributeName });
}

/** Authors one rule in the Stage filter section's builder. */
export async function addFilterRule(
  host: Locator,
  spec: FilterRuleSpec,
): Promise<void> {
  await addEntityRule(host, ADD_RULE_BUTTONS.filter, spec);
}

/** Authors one rule in the Skip logic section's builder. */
export async function addSkipLogicRule(
  host: Locator,
  spec: RuleSpec,
): Promise<void> {
  if (spec.kind === 'egoBooleanExactly') {
    await addEgoRule(host, spec);
    return;
  }
  await addEntityRule(host, ADD_RULE_BUTTONS.skipLogic, spec);
}

async function addEgoRule(
  host: Locator,
  spec: Extract<RuleSpec, { kind: 'egoBooleanExactly' }>,
): Promise<void> {
  const dialog = ruleDialog(host);

  await host.getByRole('button', { name: ADD_RULE_BUTTONS.skipLogic }).click();
  await dialog.getByRole('radio', { name: /^Ego -/ }).click();
  await selectAttribute(dialog, spec.variableName);
  await dialog
    .getByRole('combobox', { name: 'Operator' })
    .selectOption({ label: 'is exactly' });
  await dialog
    .getByRole('radiogroup', { name: 'Attribute value' })
    .locator(`[role="radio"][data-value="${String(spec.value)}"]`)
    .click();

  await finishRule(dialog);
}

async function addEntityRule(
  host: Locator,
  addButtonLabel: string,
  spec: FilterRuleSpec,
): Promise<void> {
  const dialog = ruleDialog(host);

  await host.getByRole('button', { name: addButtonLabel }).click();
  const ruleTarget = dialog.getByRole('region', { name: 'Rule target' });
  await ruleTarget.getByRole('radio', { name: /^Node -/ }).click();
  await entityTypeChip(ruleTarget, spec.nodeTypeName).click();
  if (spec.kind === 'alterPresence') {
    await dialog
      .getByRole('listbox', { name: 'Rule type' })
      .getByRole('option', { name: /^Presence/ })
      .click();
    await dialog
      .getByRole('radiogroup', { name: 'Operator' })
      .getByRole('radio', { name: spec.operator, exact: true })
      .click();
  } else {
    await dialog
      .getByRole('listbox', { name: 'Rule type' })
      .getByRole('option', { name: /^Attribute/ })
      .click();
    await selectAttribute(dialog, spec.variableName);
    await dialog
      .getByRole('combobox', { name: 'Operator' })
      .selectOption({ label: 'is exactly' });
    await dialog
      .getByRole('radiogroup', { name: 'Attribute value' })
      .locator('[role="radio"][data-value="true"]')
      .click();
  }

  await finishRule(dialog);
}

async function finishRule(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Finish and Close' }).click();
  // Wait out the exit animation before the caller adds the next rule or
  // touches controls behind the dialog (see prompts.ts for the pattern).
  await dialog.waitFor({ state: 'detached' });
}

// The rule validator rejects a multi-rule filter with no join ("Please select
// a join type"), and it does so at save() — long after the helper that built
// the rules returned. Fail where the mistake was made instead.
export function assertJoinMatchesRules(
  rules: readonly RuleSpec[],
  join: 'All rules' | 'Any rule' | undefined,
): void {
  if (rules.length > 1 && !join) {
    throw new Error(
      `${rules.length} rules need a join ('All rules' or 'Any rule') — ` +
        'without one the rule validator blocks the stage from saving.',
    );
  }
}

// 'Rule Matching' radios: 'All rules' → AND, 'Any rule' → OR. Only rendered
// once the host holds 2+ rules.
export async function chooseJoin(
  host: Locator,
  join: 'All rules' | 'Any rule',
): Promise<void> {
  const label =
    join === 'All rules' ? 'All rules must match' : 'Any rule can match';
  await host.getByRole('radio', { name: label, exact: true }).click();
}
