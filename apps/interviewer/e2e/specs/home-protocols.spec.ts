import path from 'node:path';

import { expect, test } from '../fixtures/test.js';
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
    await page.getByRole('button', { name: 'Install sample protocol' }).click();
    await expect(page.getByText('Protocol imported')).toBeVisible({
      timeout: 15_000,
    });
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
      await page
        .getByRole('button', { name: 'Delete Protocol' })
        .click({ force: true });
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
