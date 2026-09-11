import { expect, type Locator, type Page } from '@playwright/test';

// The resource browser, driven by a caller that opened it ITSELF.
//
// `data-source.ts` owns the whole open-and-choose flow and the per-kind copy
// it needs ("Select an image" / "Choose an image", "Select a data file" /
// "Choose a data file", …): a field's picker names the KIND of resource it
// accepts on every control it offers, so nothing here can address the browser
// by a title it does not know. Prefer `selectResource` / `importResource`
// there. These two exist for the one caller that cannot use them —
// `content-grid.ts`, whose content block chooses its kind inside a dialog of
// its own and presses the picker's button itself, leaving TWO dialogs on
// screen at once.
//
// So the browser is found by what only it holds, and both descriptions are
// read off the same components `data-source.ts` reads:
// - the import control, a real `<input type="file">` labelled "Choose a file
//   from your computer" (`ResourceUploadControl.tsx`) — every browser but an
//   API key's has one, and it is there before any resource is;
// - the protocol's own resources, a `<ul>` named "Resources in this protocol"
//   whose every row carries a `<button>` named for the resource
//   (`ResourceBrowserDialog.tsx`) — present only once the protocol holds one,
//   which is exactly when something can be chosen from it.
// Choosing a resource and importing a file both close the browser and select
// what they landed on into the field that opened it
// (`AssetPickerField.handleSelect`).
function browserByImportControl(page: Page): Locator {
  return page.getByRole('dialog').filter({
    has: page.getByLabel('Choose a file from your computer', { exact: true }),
  });
}

function browserByLibrary(page: Page): Locator {
  return page.getByRole('dialog').filter({
    has: page.getByRole('list', { name: 'Resources in this protocol' }),
  });
}

/**
 * Imports a file through the open browser's own import control.
 *
 * The browser closes and takes the imported resource into the field that
 * opened it, so callers assert on that field afterwards (its button flips to
 * "Change the …").
 */
export async function uploadIntoResourceBrowser(
  page: Page,
  filePath: string,
): Promise<void> {
  const browser = browserByImportControl(page);
  await browser
    .getByLabel('Choose a file from your computer', { exact: true })
    .setInputFiles(filePath);
  await expect(browser).toBeHidden();
}

/** Chooses a resource the protocol already holds, by its own name. */
export async function pickResource(
  page: Page,
  resourceName: string,
): Promise<void> {
  const browser = browserByLibrary(page);
  await browser
    .getByRole('list', { name: 'Resources in this protocol' })
    .getByRole('button', { name: resourceName, exact: true })
    .click();
  // Selection closes the browser, and only then is the field holding the
  // choice — callers act on the dialog behind it immediately afterwards.
  await expect(browser).toBeHidden();
}
