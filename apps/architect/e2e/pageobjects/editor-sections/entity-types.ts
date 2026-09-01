import { expect, type Page } from '@playwright/test';

// EntitySelectField (sections/fields/EntitySelectField/EntitySelectField.tsx)
// backs every stage's `subject` field (Node setup / Edge setup sections). Each
// existing type renders as a Base UI Radio pill (PreviewNode/PreviewEdge),
// with accessible role "radio" and name `Select ${entityType} ${label}` —
// verified against the component's own unit test
// (`EntitySelectField.test.tsx`: `getByRole('radio', { name: 'Select node
// Person' })`), not guessed. "Create new {node|edge} type" opens
// NewTypeDialog -> EntityTypeDialog -> InlineEditScreen, whose name field is
// `ValidatedField label="{Node|Edge} type name" labelHidden
// component={FrescoReduxField}` (TypeEditor.tsx) and whose save button reads
// "Save and Close" (InlineEditScreen.tsx) regardless of entity kind.
//
// Both node (NodeType.tsx, `Section title="Node setup"`) and edge
// (FilteredEdgeType.tsx, `Section title="Edge setup"`) sections are
// structurally identical, so a single implementation covers both.
async function selectOrCreateEntityType(
  page: Page,
  entityType: 'node' | 'edge',
  name: string,
  opts: { icon?: string } = {},
): Promise<void> {
  const entityLabel = entityType === 'node' ? 'Node' : 'Edge';
  // `exact: true`: without it the default substring match means selecting a
  // type named "Person" would also match an existing "Select node Personnel"
  // pill and `.first()` would silently click the wrong one instead of falling
  // through to creation.
  const existing = page.getByRole('radio', {
    name: `Select ${entityType} ${name}`,
    exact: true,
  });
  if (await existing.count()) {
    const choice = existing.first();
    await choice.click();
    try {
      await expect(choice).toBeChecked({ timeout: 2_000 });
    } catch {
      // A stage transition can remount the controlled RadioGroup while the
      // click is in flight. Retry the same semantic choice once, then require
      // the form-controlled checked state before driving dependent fields.
      await choice.click();
      await expect(choice).toBeChecked();
    }
    return;
  }
  await page
    .getByRole('button', { name: `Create new ${entityType} type` })
    .click();
  await page
    .getByRole('textbox', { name: `${entityLabel} type name` })
    .fill(name);
  if (opts.icon) {
    // TypeEditor's IconPicker: a combobox (default label 'Icon') whose
    // options' accessible names contain the icon slug
    // (IconPicker.test.tsx's own locator convention). Only applies on the
    // creation branch — the default is 'add-a-person'.
    await page.getByRole('combobox', { name: 'Icon' }).click();
    await page.getByRole('option', { name: new RegExp(opts.icon) }).click();
  }
  const saveAndClose = page.getByRole('button', { name: 'Save and Close' });
  await saveAndClose.click();
  // Wait out the dialog's exit animation before the caller interacts with
  // controls behind it (see prompts.ts for the shared-dialog-form hazard).
  await saveAndClose.waitFor({ state: 'detached' });
}

export async function selectOrCreateNodeType(
  page: Page,
  name: string,
  opts: { icon?: string } = {},
): Promise<void> {
  await selectOrCreateEntityType(page, 'node', name, opts);
}

export async function selectOrCreateEdgeType(
  page: Page,
  name: string,
): Promise<void> {
  await selectOrCreateEntityType(page, 'edge', name);
}
