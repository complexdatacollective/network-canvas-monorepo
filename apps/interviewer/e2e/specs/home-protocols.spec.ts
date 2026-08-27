import path from 'node:path';

import { expect, test } from '../fixtures/test.js';
import { clickWhenDeckSettles } from '../helpers/deck.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

const MALFORMED = path.resolve(
  import.meta.dirname,
  '../fixtures/malformed.netcanvas',
);

test.describe('protocol import & delete', () => {
  test('imports a .netcanvas and shows its deck card', async ({
    protocol,
    page,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await expect(
      page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME }),
    ).toBeVisible();
    // No visual snapshot here: the protocol deck is a spring-physics fan whose
    // cards settle to a frame-timing-dependent sub-pixel rest position, so a
    // full-page baseline is irreducibly flaky (~13k px antialiasing diff even
    // fully settled). The deck-with-protocol state is still covered visually by
    // the delete-confirm-dialog snapshot (deck behind the modal backdrop), and
    // this test's functional assertions cover the import itself.
  });

  test('re-importing the same protocol does not create a duplicate card', async ({
    protocol,
    page,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    // Wait for the first import to actually commit before re-importing: the
    // deck shows the name from the pending card before saveProtocol lands, so
    // without this the re-import could race a still-pending install instead of
    // exercising the same-hash upsert this test is about.
    await expect(page.getByText('Protocol imported')).toBeVisible({
      timeout: 15_000,
    });
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    // Content hash is the key, so put() upserts — exactly one card.
    await expect(
      page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME }),
    ).toHaveCount(1);
  });

  test('a malformed file shows the import-failed toast', async ({
    protocol,
  }) => {
    await protocol.importExpectingFailure(MALFORMED);
  });

  test('installs the bundled sample protocol', async ({ page }) => {
    await page.goto('/');
    // The deck's initial active slide is the import trigger, not the sample
    // card (Home's settings load — which decides whether the sample card
    // even exists — resolves after first paint, and the "keep the active
    // card stable" effect locks onto whatever was active at that point).
    // With no protocols installed the deck is exactly [sample, import], so
    // the first pagination dot always targets the sample card.
    await page.getByRole('button', { name: 'Go to card 1' }).click();
    // Only the ACTIVE sample card renders its "Install sample protocol"
    // footer button.
    await clickWhenDeckSettles(
      page.getByRole('button', { name: 'Install sample protocol' }),
    );
    await expect(page.getByText('Protocol imported')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('re-enabling the sample-protocol setting leaves the installed card in place', async ({
    page,
  }) => {
    await page.goto('/');
    // Same first-dot targeting as the install test above: with nothing
    // installed the deck is exactly [sample, import].
    await page.getByRole('button', { name: 'Go to card 1' }).click();
    await clickWhenDeckSettles(
      page.getByRole('button', { name: 'Install sample protocol' }),
    );
    await expect(page.getByText('Protocol imported')).toBeVisible({
      timeout: 15_000,
    });

    // Installing switches the teaser preference off. Turning it back on must
    // not put the teaser back over the protocol that is now installed.
    await page.getByTestId('settings-trigger').click();
    await page.getByRole('tab', { name: 'About' }).click();
    const showSample = page.getByRole('switch', {
      name: 'Show sample protocol on home screen',
    });
    await expect(showSample).toHaveAttribute('aria-checked', 'false');
    await showSample.click();
    // The switch is controlled by the persisted settings row, so this flip
    // only lands once the write has committed.
    await expect(showSample).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The teaser and the installed card carry different delete controls
    // ("Dismiss the sample protocol" vs "Delete Protocol"), which is the
    // clearest signal of which one holds the slot.
    const installedCardControls = async () => {
      await expect(
        page.getByRole('heading', { name: 'Sample Protocol' }),
      ).toHaveCount(1);
      await expect(
        page.getByRole('button', { name: 'Delete Protocol' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Dismiss the sample protocol' }),
      ).toHaveCount(0);
    };
    await installedCardControls();

    // A reload rebuilds the deck from scratch, which is where the teaser used
    // to reappear with no action button at all.
    await page.reload();
    await installedCardControls();
  });

  test('hides the resume notification while the case ID form is open', async ({
    protocol,
    interviewNav,
    page,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await interviewNav.startNewSession('P-resume');
    await page.goto('/');

    const resumeNotification = page.getByRole('button', {
      name: /Resume last interview/,
    });
    await expect(resumeNotification).toBeVisible();

    await clickWhenDeckSettles(
      page.getByRole('button', { name: 'Start new interview' }),
    );
    await expect(page.getByTestId('new-session-case-id')).toBeVisible();
    await expect(resumeNotification).not.toBeVisible();

    // exact: true — the new-session backdrop is itself a button labelled
    // "Cancel starting interview" (ProtocolDeck.tsx), so a substring name match
    // resolves to two elements. Target the form's own "Cancel" button.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(resumeNotification).toBeVisible();
  });

  test(
    'deletes a protocol via the confirm dialog',
    {
      tag: '@visual',
    },
    async ({ protocol, page, capture }) => {
      // Import leaves the single imported card active, so the Delete Protocol
      // control targets it directly.
      await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
      // force: true — see the comment on ProtocolFixture.delete(): the active
      // card's delete control sits under the next card's bounding box in the
      // deck's fanned 3D layout, which fools Playwright's actionability
      // pre-check even though a real click there is delivered correctly.
      await clickWhenDeckSettles(
        page.getByRole('button', { name: 'Delete Protocol' }),
        { force: true },
      );
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('heading', { name: 'Delete this protocol?' }),
      ).toBeVisible();
      await capture('delete-confirm-dialog');
      await dialog.getByTestId('dialog-primary').click();
      await expect(page.getByText('Protocol deleted')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME }),
      ).toHaveCount(0);
    },
  );
});
