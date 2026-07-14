import { type Locator } from '@playwright/test';

// ExternalDataSource.tsx's `dataSource` field renders through
// Form/Fields/File.tsx's `ResourcePickerControl` with `canUseExisting`
// unset (defaults false, unlike Form/Fields/DataSource.tsx's own
// `canUseExisting` branch/tests) — so no radio choice between "the
// in-progress interview network" and "a network data file" is ever shown
// here; the control goes straight to a single
// `<Button>{!value ? 'Select resource' : 'Update resource'}</Button>` that
// opens `AssetBrowserWindow` (`Dialog title="Resource Browser"`, a
// top-level portal — confirmed against the same Dialog title pattern
// resources.spec.ts already exercises for "Cannot delete resource" /
// "Delete Resource?").
//
// Assets.tsx renders its Collection as `role="listbox" aria-label="Resource
// library"` (also already exercised in resources.spec.ts) with each
// AssetCard as a `role="option"` item; clicking the card's `h4` name
// heading bubbles up to the option's own selection handler (AssetCard.tsx's
// action buttons `stopPropagation` on their own clicks, but the heading
// text does not), which is what AssetBrowserWindow's `onSelect` — and thus
// this field's `onChange` — is wired to.
export async function selectNetworkAsset(
  section: Locator,
  assetName: string,
): Promise<void> {
  const page = section.page();
  await section.getByRole('button', { name: 'Select resource' }).click();
  const dialog = page.getByRole('dialog', { name: 'Resource Browser' });
  await dialog
    .getByRole('listbox', { name: 'Resource library' })
    .getByRole('heading', { level: 4, name: assetName, exact: true })
    .click();
}
