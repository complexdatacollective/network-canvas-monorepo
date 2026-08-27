import { expect, type Locator } from '@playwright/test';

// How long a control must hold one position before we treat the deck as
// settled. Comfortably longer than a frame, so the spring's slow tail still
// registers as movement.
const STILL_FOR_MS = 200;

// Clicks a control on a deck card, once the deck has stopped moving.
//
// Cards ride a spring and grow as their footer enters, so a card's controls
// keep moving for around a second after the deck travels to it or its slot
// changes hands. A click dispatched during that flight is silently swallowed:
// the card's 3D-transformed subtree (DeckCarousel's perspective/preserve-3d
// slides) hit-tests as if the card were elsewhere, so the event lands on the
// deck container behind it — which ignores taps on an already-active card —
// while Playwright sees a successful click on a control whose bounding box did
// contain the point. Playwright's own stability check samples two animation
// frames, which the spring's slow tail satisfies mid-flight, so wait for a
// longer stretch of stillness first.
//
// Pass force for the delete control, whose actionability pre-check the fanned
// layout defeats even at rest (see ProtocolFixture.delete).
export async function clickWhenDeckSettles(
  control: Locator,
  options: { force?: boolean } = {},
): Promise<void> {
  let previous: string | null = null;
  await expect(async () => {
    const box = JSON.stringify(await control.boundingBox());
    const settled = box === previous;
    previous = box;
    expect(settled, 'deck card is still moving').toBe(true);
  }).toPass({ intervals: [STILL_FOR_MS], timeout: 15_000 });
  await control.click(options);
}
