import { type Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { Timeline } from '../pageobjects/timeline.js';

// No `@visual` tag: these assertions are measurements read out of the layout,
// not rasterised pixels, so they belong in the native lane and need no
// committed PNG baseline.

type ScrollMetrics = {
  documentScrollWidth: number;
  documentClientWidth: number;
  containerScrollWidth: number;
  containerClientWidth: number;
};

/**
 * The document-level check ALONE is worthless here: `<html>` never reports the
 * overflow, because the app scrolls inside its own container
 * (`div.relative.h-full.overflow-y-auto`, the element `AppLayout` renders).
 * That container is where the horizontal scrollbar actually appeared — 873 vs
 * 753 on the timeline at tablet width, 432 vs 390 on the stage editor at phone
 * width — so both are measured and both are asserted.
 */
async function readScrollMetrics(page: Page): Promise<ScrollMetrics> {
  return page.evaluate(() => {
    const container = document.querySelector('div.overflow-y-auto');
    if (!(container instanceof HTMLElement)) {
      throw new Error('app scroll container not found');
    }
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      containerScrollWidth: container.scrollWidth,
      containerClientWidth: container.clientWidth,
    };
  });
}

function expectNoHorizontalOverflow(metrics: ScrollMetrics) {
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(
    metrics.documentClientWidth,
  );
  expect(metrics.containerScrollWidth).toBeLessThanOrEqual(
    metrics.containerClientWidth,
  );
}

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
] as const;

/**
 * Stage editors whose horizontal overflow at phone width came from
 * `ArrayField`'s 24rem `min-width` floor — every one of these measured 432px of
 * content inside a 390px box before it was removed.
 *
 * Deliberately not the whole set. Five editors still overflow at 390 from
 * fixed widths of their own, unrelated to that floor and untouched by this
 * change: Name Generator Roster (484), Geospatial (484), Family Pedigree
 * (550), Alter Form and Alter Edge Form (400), Narrative Pedigree (410).
 * Listing them here rather than asserting them keeps this suite honest about
 * what has actually been fixed, and gives whoever takes those on a place to
 * extend.
 */
const EDITOR_TYPES_UNDER_TEST = [
  'Information',
  'EgoForm',
  'NameGenerator',
  'OrdinalBin',
  'Narrative',
] as const;

for (const viewport of VIEWPORTS) {
  test(`the timeline fits a ${viewport.name} viewport`, async ({
    architectPage,
    seed,
  }) => {
    const { protocol, assets } = loadAllInterfacesFixture();
    await seed(protocol, { name: 'All Interfaces', assets });
    await architectPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoProtocol(architectPage);
    await expect(new Timeline(architectPage).rows().first()).toBeVisible();

    expectNoHorizontalOverflow(await readScrollMetrics(architectPage));
  });

  test(`the timeline keeps its badges on the spine at ${viewport.name} width`, async ({
    architectPage,
    seed,
  }) => {
    const { protocol, assets } = loadAllInterfacesFixture();
    await seed(protocol, { name: 'All Interfaces', assets });
    await architectPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoProtocol(architectPage);

    // The card, not its list item: the list item also spans the insertion
    // point above the card, and it is the card's own grid that puts the badge
    // on the spine.
    const row = new Timeline(architectPage).stageCards().first();
    await expect(row).toBeVisible();

    // The spine is one absolutely-positioned line at `left-1/2` of the
    // timeline wrapper. Each row's numbered badge only lands on it because the
    // row's flanking grid tracks are `minmax(0, 1fr)` — equal by construction
    // at every width, with no content floor to push one side wider. A bare
    // `1fr` would let a long label or the trailing action cluster drift the
    // badge off the line, which no pixel-free assertion but this one notices.
    const drift = await row.evaluate((element) => {
      const badge = element.children[1];
      if (!(badge instanceof HTMLElement)) {
        throw new Error('row is missing its numbered badge');
      }
      const rowBox = element.getBoundingClientRect();
      const badgeBox = badge.getBoundingClientRect();
      const line = document.querySelector('div.bg-timeline.absolute');
      if (!(line instanceof HTMLElement)) {
        throw new Error('timeline spine not found');
      }
      const lineBox = line.getBoundingClientRect();
      return {
        badgeToRowCentre: Math.abs(
          badgeBox.left + badgeBox.width / 2 - (rowBox.left + rowBox.width / 2),
        ),
        badgeToSpine: Math.abs(
          badgeBox.left +
            badgeBox.width / 2 -
            (lineBox.left + lineBox.width / 2),
        ),
      };
    });

    expect(drift.badgeToRowCentre).toBeLessThanOrEqual(1);
    expect(drift.badgeToSpine).toBeLessThanOrEqual(1);
  });

  test(`stage editors fit a ${viewport.name} viewport`, async ({
    architectPage,
    seed,
  }) => {
    const { protocol, assets } = loadAllInterfacesFixture();
    await seed(protocol, { name: 'All Interfaces', assets });
    await architectPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoProtocol(architectPage);

    for (const type of EDITOR_TYPES_UNDER_TEST) {
      const stage = protocol.stages.find(
        (candidate) => candidate.type === type,
      );
      if (!stage) throw new Error(`fixture has no ${type} stage`);

      await architectPage.goto(`/protocol/stage/${stage.id}`);
      await expect(
        architectPage.getByRole('textbox', { name: 'Stage name' }),
      ).toBeVisible();

      expectNoHorizontalOverflow(await readScrollMetrics(architectPage));
    }
  });

  test(`the page-actions toolbar stays inside a ${viewport.name} viewport`, async ({
    architectPage,
    seed,
  }) => {
    const { protocol, assets } = loadAllInterfacesFixture();
    await seed(protocol, { name: 'All Interfaces', assets });
    await architectPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoProtocol(architectPage);

    // The toolbar pill measured 443px inside a 358px content box at phone
    // width and clipped "Cancel" off the left edge of the screen. It may now
    // scroll internally, but no part of the pill itself may sit outside the
    // viewport.
    const bounds = await architectPage
      .getByRole('toolbar', { name: 'Page actions' })
      .evaluate((toolbar) => {
        const pill = toolbar.parentElement;
        if (!pill) throw new Error('toolbar has no pill container');
        const box = pill.getBoundingClientRect();
        return { left: box.left, right: box.right, width: window.innerWidth };
      });

    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  });
}
