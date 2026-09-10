import { expect, type Page } from '@playwright/test';

// The subject picker (`@codaco/protocol-builder`'s `SubjectSection`, through
// `EntityTypePickerField`) backs every stage's `subject` field. Each existing
// type renders as a radio whose accessible name is the type's own label — the
// picker's own story locates one that way (`EntityTypePickerField.stories.tsx`:
// `getByRole('radio', { name: 'family member' })`) — inside a radiogroup named
// "Node type" or "Edge type", which is what tells the two apart on a stage
// that has both.
//
// "Create a new {node|edge} type" opens the package's `CodebookEntityEditor`,
// whose name field is labelled "{Node|Edge} type name", whose icon is a text
// field named "Interface icon", and whose submit reads "Save entity".
async function selectOrCreateEntityType(
  page: Page,
  entityType: 'node' | 'edge',
  name: string,
  opts: { icon?: string } = {},
): Promise<void> {
  const entityLabel = entityType === 'node' ? 'Node' : 'Edge';
  const picker = page.getByRole('radiogroup', {
    name: `${entityLabel} type`,
    exact: true,
  });
  // `exact: true`: without it the default substring match means selecting a
  // type named "Person" would also match an existing "Personnel" pill and
  // `.first()` would silently click the wrong one instead of falling through
  // to creation.
  const existing = picker.getByRole('radio', { name, exact: true });
  if (await existing.count()) {
    const choice = existing.first();
    await choice.click();
    await confirmSubjectChange(page, entityType);
    try {
      await expect(choice).toBeChecked({ timeout: 2_000 });
    } catch {
      // A stage transition can remount the controlled RadioGroup while the
      // click is in flight. Retry the same semantic choice once, then require
      // the form-controlled checked state before driving dependent fields.
      await choice.click();
      await confirmSubjectChange(page, entityType);
      await expect(choice).toBeChecked();
    }
    return;
  }
  await page
    .getByRole('button', { name: `Create a new ${entityType} type` })
    .click();
  await page
    .getByRole('textbox', { name: `${entityLabel} type name` })
    .fill(name);
  if (opts.icon) {
    // The icon is named rather than picked from a gallery: the editor takes
    // the icon's own name and refuses one no interface can draw.
    await page.getByRole('textbox', { name: 'Interface icon' }).fill(opts.icon);
  }
  const save = page.getByRole('button', { name: 'Save entity' });
  await save.click();
  // Wait out the dialog's exit animation before the caller interacts with
  // controls behind it (see prompts.ts for the shared-dialog-form hazard).
  await save.waitFor({ state: 'detached' });
  await confirmSubjectChange(page, entityType);
}

/**
 * The stage asks before it takes a subject away from everything configured
 * under it, and a stage with nothing configured yet asks nothing at all — so
 * this answers the question when it is put and does nothing when it is not.
 */
async function confirmSubjectChange(
  page: Page,
  entityType: 'node' | 'edge',
): Promise<void> {
  for (const label of [
    `Choose the ${entityType} type`,
    `Change the ${entityType} type`,
  ]) {
    const confirm = page.getByRole('button', { name: label, exact: true });
    if (await confirm.count()) {
      await confirm.click();
      await confirm.waitFor({ state: 'detached' });
      return;
    }
  }
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
