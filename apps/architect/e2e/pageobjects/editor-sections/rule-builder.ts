import { type Locator } from '@playwright/test';

// Shared Query/Rules primitive (src/components/Query/Rules/*) used by the
// SkipLogic section (`type="query"` — ego rules available) and the
// Filter/NetworkFilter sections (no ego rules). Facts verified against
// source, not guessed:
// - Add buttons: 'Add alter rule' / 'Add edge rule' / 'Add ego rule'
//   (Rules.tsx). The rule editor dialog is titled 'Construct a Rule' for both
//   new and edit; its submit reads 'Finish and Close' (EditRule.tsx).
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
//   NOT_EXISTS → 'does not Exist' (capital E — verbatim from source).
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
      operator: 'exists' | 'does not Exist';
    }
  | {
      kind: 'alterBooleanAttribute';
      nodeTypeName: string;
      variableName: string;
      value: boolean;
    };

export async function addRule(host: Locator, spec: RuleSpec): Promise<void> {
  const page = host.page();
  const dialog = page.getByRole('dialog', { name: 'Construct a Rule' });

  if (spec.kind === 'egoBooleanExactly') {
    await host.getByRole('button', { name: 'Add ego rule' }).click();
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
  } else {
    await host.getByRole('button', { name: 'Add alter rule' }).click();
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
      if (!spec.value) {
        // An untouched entity-rule boolean stays '' (invalid); false would
        // need an ON-then-OFF toggle no sample-protocol rule requires.
        throw new Error(
          'alterBooleanAttribute with value:false is not implemented',
        );
      }
      await dialog
        .locator('[data-name="Attribute Value"]')
        .getByRole('switch')
        .click();
    }
  }

  await dialog.getByRole('button', { name: 'Finish and Close' }).click();
  // Wait out the exit animation before the caller adds the next rule or
  // touches controls behind the dialog (see prompts.ts for the pattern).
  await dialog.waitFor({ state: 'detached' });
}

// 'Must match' radios: 'All rules' → AND, 'Any rule' → OR. Only rendered
// once the host holds 2+ rules.
export async function chooseJoin(
  host: Locator,
  join: 'All rules' | 'Any rule',
): Promise<void> {
  await host.getByRole('radio', { name: join, exact: true }).click();
}
