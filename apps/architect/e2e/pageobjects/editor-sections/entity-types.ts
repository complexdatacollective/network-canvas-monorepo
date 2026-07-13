import { type Page } from '@playwright/test';

// EntitySelectField (sections/fields/EntitySelectField/EntitySelectField.tsx)
// backs every stage's `subject` field (Node Type / Edge Type sections). Each
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
// Both node (NodeType.tsx, `Section title="Node Type"`) and edge
// (FilteredEdgeType.tsx, `Section title="Edge Type"`) sections are
// structurally identical, so a single implementation covers both.
async function selectOrCreateEntityType(
  page: Page,
  entityType: 'node' | 'edge',
  name: string,
): Promise<void> {
  const entityLabel = entityType === 'node' ? 'Node' : 'Edge';
  const existing = page.getByRole('radio', {
    name: `Select ${entityType} ${name}`,
  });
  if (await existing.count()) {
    await existing.first().click();
    return;
  }
  await page
    .getByRole('button', { name: `Create new ${entityType} type` })
    .click();
  await page
    .getByRole('textbox', { name: `${entityLabel} type name` })
    .fill(name);
  await page.getByRole('button', { name: 'Save and Close' }).click();
}

export async function selectOrCreateNodeType(
  page: Page,
  name: string,
): Promise<void> {
  await selectOrCreateEntityType(page, 'node', name);
}

export async function selectOrCreateEdgeType(
  page: Page,
  name: string,
): Promise<void> {
  await selectOrCreateEntityType(page, 'edge', name);
}
