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
// - The 'Rule type' radios carry long markdown sentences as accessible names
//   ('Attribute - rule based on…' / 'Presence - based on…',
//   withEntityRuleType.tsx) — matched with .filter({ hasText }) per the
//   suite's long-markdown policy, not exact names.
// - Operator LABELS (options.ts): EXACTLY → 'is exactly', EXISTS → 'exists',
//   NOT_EXISTS → 'does not exist' .
//   Presence operators render as radios; variable-rule operators are a native
//   <select> named 'Operator'.
// - Boolean 'Attribute Value' is a switch whose accessible name mirrors its
//   state ('False'/'True', EditValue.tsx getLabel) — located by role within
//   [data-name="Attribute Value"], never by name.
// - Ego rules: no entity-type step; 'Ego variable' native select. When the
//   operator is chosen the value defaults to false (EditEgoRule's handler
//   injects it), so an EXACTLY-false ego rule never touches the switch.
// - The join control ('Must match' — 'All rules'/'Any rule' radios) only
//   renders once 2+ rules exist; a single-rule filter writes no `join` key.
export type RuleSpec =
  | { kind: 'egoBooleanExactly'; variableName: string; value: boolean }
  | {
      kind: 'alterPresence';
      nodeTypeName: string;
      operator: 'Exists' | 'Does not exist';
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

/** Authors one rule in the Filter section's builder. */
export async function addFilterRule(
  host: Locator,
  spec: FilterRuleSpec,
): Promise<void> {
  await addEntityRule(host, ADD_RULE_BUTTONS.filter, spec);
}

/** Authors one rule in the Skip Logic section's builder. */
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
  await dialog
    .getByRole('combobox', { name: 'Ego variable' })
    .selectOption({ label: spec.variableName });
  await dialog
    .getByRole('combobox', { name: 'Operator' })
    .selectOption({ label: 'is exactly' });
  // The draft's `value` stays '' after the operator pick (the change
  // handler misses the boolean default — verified live: the rendered
  // toggle shows False while the draft holds ''), and '' fails
  // validateRule. The toggle must be touched: once for true, twice
  // (on→off) to write an explicit false.
  const valueSwitch = dialog
    .locator('[data-name="Attribute Value"]')
    .getByRole('switch');
  await valueSwitch.click();
  if (!spec.value) {
    await valueSwitch.click();
  }

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
    // Long-markdown radio labels are sibling <label> elements — the radio
    // button has no text content, so match on the accessible NAME (which
    // does include the label) rather than .filter({hasText}).
    await dialog.getByRole('radio', { name: /^Presence/ }).click();
    await dialog
      .locator('[data-name="Operator"]')
      .getByRole('radio', { name: spec.operator, exact: true })
      .click();
  } else {
    await dialog.getByRole('radio', { name: /^Attribute -/ }).click();
    await dialog
      .getByRole('combobox', { name: 'Variable' })
      .selectOption({ label: spec.variableName });
    await dialog
      .getByRole('combobox', { name: 'Operator' })
      .selectOption({ label: 'is exactly' });
    await dialog
      .locator('[data-name="Attribute Value"]')
      .getByRole('switch')
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

// 'Must match' radios: 'All rules' → AND, 'Any rule' → OR. Only rendered
// once the host holds 2+ rules.
export async function chooseJoin(
  host: Locator,
  join: 'All rules' | 'Any rule',
): Promise<void> {
  await host.getByRole('radio', { name: join, exact: true }).click();
}
