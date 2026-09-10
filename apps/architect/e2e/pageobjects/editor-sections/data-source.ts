import { expect, type Locator, type Page } from '@playwright/test';

// Every stage field that holds a protocol resource is `@codaco/protocol-builder`'s
// `AssetPickerField`, and it opens `ResourceBrowserDialog`. Both name the KIND
// of resource the field accepts rather than saying "resource": the button reads
// "Select a data file" / "Select a map layer" / "Select an image" / "Select an
// API key" (and "Change the …" once the field holds one), and the dialog is
// titled "Choose a data file" / "Choose a map layer" / … — one whole sentence
// per kind, declared in `resources/components/resourceKinds.ts`'s
// `pickerMessages`. There is no generic "Select resource" button and no
// "Resource Browser" dialog any more, so a kind has to be named here.
//
// Inside the dialog the protocol's own resources are a `<ul>` labelled
// "Resources in this protocol" whose every row carries a `<button>` named by
// the resource's own name (ResourceBrowserDialog.tsx) — not a listbox of
// option cards with an `<h4>` inside. Choosing one closes the dialog, and so
// does importing a file or adding a key: `AssetPickerField.handleSelect` sets
// the field and shuts the browser either way.
export type ResourceKind = 'network' | 'geojson' | 'image' | 'apikey';

const PICKER_COPY: Record<
  ResourceKind,
  { select: string; change: string; browser: string }
> = {
  network: {
    select: 'Select a data file',
    change: 'Change the data file',
    browser: 'Choose a data file',
  },
  geojson: {
    select: 'Select a map layer',
    change: 'Change the map layer',
    browser: 'Choose a map layer',
  },
  image: {
    select: 'Select an image',
    change: 'Change the image',
    browser: 'Choose an image',
  },
  apikey: {
    select: 'Select an API key',
    change: 'Change the API key',
    browser: 'Choose an API key',
  },
};

// The one button opens the browser whether the field is empty or already
// holds something — it only renames itself — so both of its exact names are
// named here rather than matching on a prefix.
function openButton(field: Locator, kind: ResourceKind): Locator {
  const copy = PICKER_COPY[kind];
  return field.getByRole('button', {
    name: new RegExp(`^(${copy.select}|${copy.change})$`),
  });
}

/** Opens the field's resource browser and returns the dialog. */
export async function openResourcePicker(
  page: Page,
  field: Locator,
  kind: ResourceKind,
): Promise<Locator> {
  await openButton(field, kind).click();
  const dialog = page.getByRole('dialog', {
    name: PICKER_COPY[kind].browser,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Chooses a resource the protocol already holds, by its own name. */
export async function selectResource(
  page: Page,
  field: Locator,
  kind: ResourceKind,
  resourceName: string,
): Promise<void> {
  const dialog = await openResourcePicker(page, field, kind);
  await dialog
    .getByRole('list', { name: 'Resources in this protocol' })
    .getByRole('button', { name: resourceName, exact: true })
    .click();
  // Selection closes the browser, and only then is the field holding the
  // choice — callers act on the page behind the dialog immediately afterwards.
  await expect(dialog).toBeHidden();
  await expect(openButton(field, kind)).toHaveText(PICKER_COPY[kind].change);
}

/**
 * Imports a file through the browser's own import control, which selects what
 * it imported into the field that opened it.
 *
 * The control is a plain visible `<input type="file">` labelled "Choose a file
 * from your computer" (ResourceUploadControl.tsx) — not a dropzone with
 * `role="button"` — so the file goes to the input by its label.
 */
export async function importResource(
  page: Page,
  field: Locator,
  kind: Exclude<ResourceKind, 'apikey'>,
  filePath: string,
): Promise<void> {
  const dialog = await openResourcePicker(page, field, kind);
  await dialog
    .getByLabel('Choose a file from your computer', { exact: true })
    .setInputFiles(filePath);
  await expect(dialog).toBeHidden();
  await expect(openButton(field, kind)).toHaveText(PICKER_COPY[kind].change);
}

/**
 * Adds an API key and takes it into the field that opened the browser.
 *
 * The key itself is an `<input type="password">` (ResourceSecretControl.tsx),
 * which has no implicit ARIA role at all — `getByRole('textbox')` cannot see
 * it — so it is addressed by its label.
 */
export async function addApiKey(
  page: Page,
  field: Locator,
  key: { name: string; value: string },
): Promise<void> {
  const dialog = await openResourcePicker(page, field, 'apikey');
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(key.name);
  await dialog.getByLabel('Key', { exact: true }).fill(key.value);
  await dialog
    .getByRole('button', { name: 'Add API key', exact: true })
    .click();
  // Adding stages the key AND selects it, so there is no second step of
  // finding the new row in the list, and the dialog closes on the same answer.
  await expect(dialog).toBeHidden();
  await expect(openButton(field, 'apikey')).toHaveText(
    PICKER_COPY.apikey.change,
  );
}

/** A roster's `dataSource`: a network data file the protocol already holds. */
export async function selectNetworkAsset(
  section: Locator,
  assetName: string,
): Promise<void> {
  await selectResource(section.page(), section, 'network', assetName);
}
