import JSZip from 'jszip';

import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readStoreCounts } from '../helpers/read-store.js';

/**
 * Home's keyboard model and its protocol-import error copy (issue #1395).
 *
 * The focus assertions all read `document.activeElement` rather than relying on
 * `toBeFocused` alone in places where the point is that focus RESTS somewhere:
 * the reported defect was a second, later focus move that a snapshot taken one
 * tick early would miss entirely.
 */

// The wording no researcher should be shown: the archive library's name and
// documentation URL, its central-directory phrasing, an internal filename, or a
// JSON parser's cursor position.
const IMPLEMENTATION_DETAIL =
  /jszip|stuk\.github\.io|central directory|protocol\.json|JSON at position/i;

const activeElementDescription = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return 'none';
    const role = active.getAttribute('role') ?? active.tagName.toLowerCase();
    const label =
      active.getAttribute('aria-label') ??
      active.textContent?.trim().slice(0, 40) ??
      '';
    return `${role}:${label}`;
  });

const seedOneProtocol = async (
  seed: (
    protocol: import('@codaco/protocol-validation').CurrentProtocol,
    opts?: { id?: string; name?: string },
  ) => Promise<string>,
  name: string,
) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name });
};

test('keeps the protocol library shadow inside the home scrollport', async ({
  architectPage,
}) => {
  await architectPage.goto('/');

  const bottomClearance = await architectPage
    .getByRole('tablist', { name: 'Protocol library' })
    .evaluate((tablist) => {
      let panel = tablist.parentElement;
      while (panel && getComputedStyle(panel).boxShadow === 'none') {
        panel = panel.parentElement;
      }
      if (!panel) {
        throw new Error('Could not find the shadow-casting library panel');
      }

      let scrollport = panel.parentElement;
      while (
        scrollport &&
        !['auto', 'scroll'].includes(getComputedStyle(scrollport).overflowY)
      ) {
        scrollport = scrollport.parentElement;
      }
      if (!scrollport) {
        throw new Error('Could not find the library panel scrollport');
      }

      return (
        scrollport.getBoundingClientRect().bottom -
        panel.getBoundingClientRect().bottom
      );
    });

  // The panel's medium elevation needs the page's existing 2rem bottom gap
  // inside the scrollport. At zero clearance the scrollport clips the shadow.
  expect(bottomClearance).toBeGreaterThanOrEqual(32);
});

test('arrow keys move between row menu actions, and Escape returns to the Actions button', async ({
  architectPage,
  seed,
}) => {
  await seedOneProtocol(seed, 'Keyboard Study');
  await architectPage.goto('/');

  const trigger = architectPage.getByRole('button', {
    name: 'Actions for Keyboard Study',
  });
  await trigger.focus();
  // Entering the collection on a control inside a row must rest there. It used
  // to bounce straight onto the row, so the button could never be reached.
  await expect(trigger).toBeFocused();

  await architectPage.keyboard.press('ArrowDown');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(
    architectPage.getByRole('menuitem', { name: 'Open' }),
  ).toBeFocused();

  await architectPage.keyboard.press('ArrowDown');
  await expect(
    architectPage.getByRole('menuitem', { name: 'See more info' }),
  ).toBeFocused();
  // The menu is still open — the filed defect was the menu closing (or, worse,
  // staying open while the list navigated behind it).
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await architectPage.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  expect(await activeElementDescription(architectPage)).toBe(
    'button:Actions for Keyboard Study',
  );
});

test('closing See more info returns focus to the row Actions button', async ({
  architectPage,
  seed,
}) => {
  await seedOneProtocol(seed, 'Info Study');
  await architectPage.goto('/');

  const trigger = architectPage.getByRole('button', {
    name: 'Actions for Info Study',
  });
  await trigger.click();
  await architectPage.getByRole('menuitem', { name: 'See more info' }).click();

  const dialog = architectPage.getByRole('dialog', { name: 'Info Study' });
  await expect(dialog).toBeVisible();
  // The header's icon button and the footer's action share the name "Close";
  // the footer one is what a researcher reaches by keyboard from the content.
  await dialog
    .getByRole('contentinfo')
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(dialog).toHaveCount(0);

  await expect(trigger).toBeFocused();
  // Asserted again after the exit animation has fully settled: the reported
  // failure was focus arriving on the trigger and then being taken away.
  await expect(async () => {
    expect(await activeElementDescription(architectPage)).toBe(
      'button:Actions for Info Study',
    );
  }).toPass();
});

test('closing the Clear all and storage dialogs restores their exact trigger', async ({
  architectPage,
  seed,
}) => {
  // Pinning test. The issue reports these landing on `<body>` or the page
  // header; on this tree they already restore their trigger (fixed by #1387).
  // Kept so the filed description cannot quietly become true again.
  await seedOneProtocol(seed, 'Dialog Study');
  await architectPage.goto('/');

  const clearAll = architectPage.getByRole('button', {
    name: 'Clear all locally saved protocols',
  });
  // Every dialog button is addressed through its OWN dialog. A dismissed
  // dialog is kept mounted for its exit animation, so its footer buttons carry
  // the same `dialog-*` test ids as the next dialog's while both are in the
  // document — an unscoped `getByTestId('dialog-primary')` resolves to two
  // elements and fails on strict mode as soon as the timing goes that way.
  const clearAllDialog = architectPage.getByRole('dialog', {
    name: 'Remove all data?',
  });
  await clearAll.click();
  await expect(clearAllDialog).toBeVisible();
  await clearAllDialog.getByTestId('dialog-cancel').click();
  await expect(clearAllDialog).toBeHidden();
  await expect(clearAll).toBeFocused();

  const storageInfo = architectPage.getByRole('button', {
    name: 'Where your protocols are stored',
  });
  const storageDialog = architectPage.getByRole('dialog', {
    name: 'Protocol Storage',
  });
  await storageInfo.click();
  await expect(storageDialog).toBeVisible();
  await storageDialog.getByTestId('dialog-primary').click();
  await expect(storageDialog).toBeHidden();
  await expect(storageInfo).toBeFocused();

  // "Every Home dialog restores its exact trigger" includes the ones that are
  // not row actions at all.
  const createNew = architectPage.getByRole('button', {
    name: 'Create a new protocol',
  });
  await createNew.click();
  const createDialog = architectPage.getByRole('dialog', {
    name: 'Create New Protocol',
  });
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(createDialog).toHaveCount(0);
  await expect(createNew).toBeFocused();
});

test('dismissing the protocol gallery card moves focus to the Templates tab', async ({
  architectPage,
}) => {
  await architectPage.goto('/');
  await architectPage.getByRole('tab', { name: 'Templates' }).click();

  const galleryCard = architectPage.getByRole('group', {
    name: 'Protocol gallery',
  });
  const dismiss = galleryCard.getByRole('button', { name: 'Dismiss' });
  await dismiss.focus();
  await dismiss.click();

  await expect(galleryCard).toHaveCount(0);
  await expect(
    architectPage.getByRole('tab', { name: 'Templates' }),
  ).toBeFocused();
  expect(await activeElementDescription(architectPage)).not.toBe('none');
});

test.describe('malformed protocol import', () => {
  test('reports a non-archive in product copy, leaves the library untouched, and stays retry-ready', async ({
    architectPage,
    seed,
  }) => {
    await seedOneProtocol(seed, 'Untouched Study');
    await architectPage.goto('/');
    const before = await readStoreCounts(architectPage);
    // Pin the "before" read to the state we just seeded. Without this the
    // untouched-library assertion below is satisfied by any pair of equal
    // reads — including two reads that found nothing.
    expect(before).toEqual({ protocols: 1, assets: 0 });

    await architectPage.locator('input[type="file"]').setInputFiles({
      name: 'broken.netcanvas',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    });

    const dialog = architectPage.getByRole('dialog', {
      name: 'Failed to Open Protocol',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "This file isn't a Network Canvas protocol.",
    );

    // The leading copy — everything outside the collapsed disclosure — must
    // carry none of the library's own wording.
    const leadingCopy = await dialog
      .locator('p')
      .allInnerTexts()
      .then((parts) => parts.join(' '));
    expect(leadingCopy).not.toMatch(IMPLEMENTATION_DETAIL);

    // The detail is still reachable for a bug report, behind a shut disclosure.
    const details = dialog.getByRole('button', { name: 'Technical details' });
    await expect(details).toHaveAttribute('aria-expanded', 'false');
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog).toContainText('stuk.github.io');

    await dialog.getByTestId('dialog-primary').click();
    await expect(dialog).toHaveCount(0);

    expect(await readStoreCounts(architectPage)).toEqual(before);
    await expect(architectPage).toHaveURL(/\/$/);
    await expect(architectPage.getByText('Untouched Study')).toBeVisible();
  });

  test('reports an archive with no protocol in it in product copy', async ({
    architectPage,
  }) => {
    const zip = new JSZip();
    zip.file('assets/photo.png', 'PNGDATA');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await architectPage.goto('/');
    await architectPage.locator('input[type="file"]').setInputFiles({
      name: 'no-protocol.netcanvas',
      mimeType: 'application/octet-stream',
      buffer,
    });

    const dialog = architectPage.getByRole('dialog', {
      name: 'Failed to Open Protocol',
    });
    await expect(dialog).toBeVisible();
    const leadingCopy = await dialog
      .locator('p')
      .allInnerTexts()
      .then((parts) => parts.join(' '));
    expect(leadingCopy).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(leadingCopy).toContain('missing its protocol');
  });

  test('reports damaged protocol contents without the parser position', async ({
    architectPage,
  }) => {
    const zip = new JSZip();
    zip.file('protocol.json', '{"schemaVersion": 8, "na');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await architectPage.goto('/');
    await architectPage.locator('input[type="file"]').setInputFiles({
      name: 'damaged.netcanvas',
      mimeType: 'application/octet-stream',
      buffer,
    });

    const dialog = architectPage.getByRole('dialog', {
      name: 'Failed to Open Protocol',
    });
    await expect(dialog).toBeVisible();
    const leadingCopy = await dialog
      .locator('p')
      .allInnerTexts()
      .then((parts) => parts.join(' '));
    expect(leadingCopy).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(leadingCopy).toContain('damaged');
  });
});
