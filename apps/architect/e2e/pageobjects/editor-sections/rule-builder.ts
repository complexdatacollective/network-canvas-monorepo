import { type Locator } from '@playwright/test';

// Shared Query/Rules primitive (src/components/Query/Rules/*) used by the
// SkipLogic section (`type="query"` — ego rules available) and the
// Filter/NetworkFilter sections (no ego rules). Facts verified against
// source, not guessed:
// - Add buttons: each editable rule list names its one add control, because
//   most stage editors mount both at once (RuleSetFields.tsx — see
//   ADD_RULE_BUTTONS below). The rule target (Node/Edge/Ego) is selected inside
//   the editor. The rule
//   editor dialog is titled 'Construct a Rule' for both new and edit; its
//   submit reads 'Finish and Close' (EditRule.tsx).
// - Entity type selection inside the dialog reuses the EntitySelectField
//   radio-pill pattern — accessible names 'Select node <Name>' /
//   'Select edge <Name>' (PreviewNode.tsx / PreviewEdge.tsx), the exact
//   convention entity-types.ts already documents. The dialog also contains a
//   'Create new node type' button, and the stage editor BEHIND the dialog has
//   identical pills — every locator here is dialog-scoped.
// - The 'Rule type' rich select is a listbox whose options carry the long
//   markdown descriptions as accessible names ('Attribute Rule based on…' /
//   'Presence Based on…', withEntityRuleType.tsx).
// - Operator LABELS (options.ts): EXACTLY → 'is exactly', EXISTS → 'exists',
//   NOT_EXISTS → 'does not exist' .
//   Presence operators render as radios; variable-rule operators are a native
//   <select> named 'Operator'.
// - Boolean 'Attribute Value' is a radiogroup. Its visible option labels come
//   from the variable's authored markdown, while each radio exposes the stored
//   boolean through `data-value`.
// - Attribute rules use the standard entity-scoped attribute picker. Its
//   trigger reads 'Select attribute', and the spotlight is selection-only.
// - The 'Rule Matching' control only renders once 2+ rules exist. Its visible
//   radios read 'All rules must match' / 'Any rule can match'; a single-rule
//   filter writes no `join` key.
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

const ruleDialog = (host: Locator) =>
  host.page().getByRole('dialog', { name: 'Construct a Rule' });

async function selectAttribute(
  dialog: Locator,
  attributeName: string,
): Promise<void> {
  const attributeField = dialog.locator(
    '[data-field-name="options.attribute"]',
  );
  await attributeField
    .getByRole('button', { name: 'Select attribute' })
    .click();

  const page = dialog.page();
  const search = page.getByRole('searchbox', {
    name: 'Find or create an attribute',
  });
  await search.fill(attributeName);
  await page
    .getByTestId('spotlight-list-item')
    .filter({ hasText: attributeName })
    .first()
    .waitFor();
  await search.press('Enter');
  await attributeField
    .getByRole('button', { name: 'Change attribute' })
    .waitFor();
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
    .getByRole('radiogroup', { name: 'Attribute Value' })
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
  await dialog.getByRole('radio', { name: /^Node -/ }).click();
  await dialog
    .getByRole('radio', {
      name: `Select node ${spec.nodeTypeName}`,
      exact: true,
    })
    .click();
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
      .getByRole('radiogroup', { name: 'Attribute Value' })
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
