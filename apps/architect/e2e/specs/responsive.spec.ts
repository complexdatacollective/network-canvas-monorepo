import { type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { PROTOCOL_NAME_TOO_LONG_MESSAGE } from '../../src/config/index.js';
import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';
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

for (const page of [
  { path: '/protocol/assets', heading: 'Resource Library' },
  { path: '/protocol/codebook', heading: 'Codebook' },
] as const) {
  test(`${page.heading} content keeps a horizontal inset at phone width`, async ({
    architectPage,
    seed,
  }) => {
    await seed(emptyProtocol(), { name: 'Inset test' });
    await architectPage.setViewportSize(VIEWPORTS[0]);
    await gotoProtocol(architectPage);
    await architectPage.goto(page.path);

    const heading = architectPage.getByRole('heading', {
      name: page.heading,
      level: 1,
    });
    await expect(heading).toBeVisible();

    const bounds = await heading.evaluate((element) => {
      const container = element.parentElement?.parentElement;
      if (!(container instanceof HTMLElement)) {
        throw new Error('page heading container not found');
      }
      const box = container.getBoundingClientRect();
      return { left: box.left, right: box.right, width: window.innerWidth };
    });

    expect(bounds.left).toBeGreaterThanOrEqual(20);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width - 20);
  });
}

/**
 * Every stage type the all-interfaces fixture carries.
 *
 * Eleven of them earned their place by overflowing. Five — Information, Ego
 * Form, Name Generator, Ordinal Bin and Narrative — overflowed at phone width
 * from `ArrayField`'s 24rem `min-width` floor, each measuring 432px of content
 * inside a 390px box before it was removed.
 *
 * The remaining six were listed here as known gaps while that floor was fixed,
 * and are asserted now that the fixed widths behind them are gone. Measured
 * before, at 390: Name Generator Roster 484, Geospatial 484, Family Pedigree
 * 550, Alter Form 400, Alter Edge Form 400, Narrative Pedigree 410. Four causes
 * between them, so each is worth its own assertion rather than one
 * representative: the asset thumbnail's flat `w-[25rem]` (roster, geospatial);
 * `ArrayField`'s remaining `min-w-fit`, inherited from `controlVariants` and
 * left behind when `min-w-sm` went (roster, both Alter Forms, Narrative
 * Pedigree); Family Pedigree's two-column variable rows, which now stack below
 * a 34rem container query; and the variable pill's uncapped 20rem `max-width`,
 * which no `min-w-0` can restrain because a variable name renders `nowrap` and
 * so has no min-content smaller than itself.
 *
 * The other eight were never reported overflowing, and measuring them bore that
 * out — every one sits exactly at 390/390 and 768/768, with the app scroll
 * container's width identical from the first frame after the stage-name field
 * appears to thirty frames later. They are asserted anyway, because they are
 * where the next regression in a shared control would surface: they exercise
 * the same `ArrayField`, variable pill, thumbnail and two-column row that
 * produced all four causes above, and nothing but an assertion distinguishes
 * "measured clean" from "not measured".
 *
 * This is now the fixture's whole set, in its stage order, and the test below
 * asserts that it still is — a twentieth interface added to all-interfaces
 * fails here until it is named, rather than quietly going uncovered.
 */
const EDITOR_TYPES_UNDER_TEST = [
  'Anonymisation',
  'EgoForm',
  'Information',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'Sociogram',
  'DyadCensus',
  'OneToManyDyadCensus',
  'TieStrengthCensus',
  'OrdinalBin',
  'CategoricalBin',
  'AlterForm',
  'AlterEdgeForm',
  'Narrative',
  'FamilyPedigree',
  'NarrativePedigree',
  'NetworkComposer',
  'Geospatial',
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

    // The guard on the guard: sorted, so the failure names the missing type
    // rather than printing two unordered sets.
    expect(
      [...new Set(protocol.stages.map((stage) => stage.type))].toSorted(),
    ).toEqual([...EDITOR_TYPES_UNDER_TEST].toSorted());

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

/**
 * #1397. A protocol whose name arrived before Architect capped names: ~400
 * graphemes of RTL text and emoji, the exact shape the issue was filed with.
 * Seeded straight into IndexedDB so the cap never sees it — these specs are
 * about what an EXISTING oversized name does, which is the acceptance criterion
 * no cap can satisfy on its own.
 */
const OVERSIZED_NAME =
  'مشروع بحث الشبكات الاجتماعية الحضرية والريفية🏙️🏡 '.repeat(9);

/** An unbroken token with no wrap opportunity anywhere in it. */
const UNBREAKABLE_NAME = 'A'.repeat(400);

/**
 * Long enough to reach the description control's own `max-h-52` bound, so both
 * of the card's growable regions are at maximum. A name-only fixture never
 * exercises the compound worst case.
 */
const MAXIMAL_DESCRIPTION =
  'This protocol collects egocentric network data from participants across urban and rural sites. '.repeat(
    8,
  );

/**
 * Deliberately NOT the all-interfaces fixture. Its Geospatial stage carries the
 * shared Mapbox testing token, so `TestingMapboxTokenAlert` renders a banner
 * above the card that pushes the timeline below the fold on its own (measured:
 * the card's own top at y=457 on a 720px viewport, before the name contributes
 * anything). A viewport assertion on that fixture would be measuring the
 * banner, not the name.
 */
function protocolWithStages(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    stages: [1, 2, 3].map((index) => ({
      id: `info-${index}`,
      label: `Information ${index}`,
      type: 'Information',
      title: `Information ${index}`,
      items: [],
    })),
  };
}

const NAME_VIEWPORTS = [
  ...VIEWPORTS,
  { name: 'desktop', width: 1280, height: 720 },
] as const;

/** The name control's bound, in line-heights (`max-h-[3lh]`). */
const NAME_BOUND_LINES = 3;

async function readNameControlMetrics(page: Page) {
  return page.getByRole('textbox', { name: 'Protocol name' }).evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      offsetHeight: (el as HTMLElement).offsetHeight,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      lineHeight: parseFloat(style.lineHeight),
      direction: style.direction,
      overflowY: style.overflowY,
    };
  });
}

function expectNameWithinBound(metrics: {
  offsetHeight: number;
  lineHeight: number;
}) {
  expect(metrics.offsetHeight).toBeLessThanOrEqual(
    Math.ceil(NAME_BOUND_LINES * metrics.lineHeight) + 1,
  );
}

for (const viewport of NAME_VIEWPORTS) {
  test(`an oversized protocol name stays bounded and leaves the timeline on screen at ${viewport.name} width`, async ({
    architectPage,
    seed,
  }) => {
    await seed(protocolWithStages(), { name: OVERSIZED_NAME });
    await architectPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoProtocol(architectPage);

    // AC4, the filed defect, asserted FIRST so it is what a regression reports:
    // the timeline's first row measured y=1189 inside a 720px viewport before
    // this. `toBeInViewport` compares against the real viewport; `offsetTop`
    // would not — this app scrolls inside a container, so an
    // offset-parent-relative number can be small while the list is off screen.
    // This assertion is genuinely tight: a four-line bound instead of three put
    // the row at y=726 and failed here.
    await expect(new Timeline(architectPage).rows().first()).toBeInViewport();

    const metrics = await readNameControlMetrics(architectPage);

    // The bound is doing work rather than the value simply being short: the
    // control's content is taller than the box that paints it. Without this the
    // height assertion below would pass vacuously for any short name.
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.offsetHeight);
    expectNameWithinBound(metrics);
    expect(metrics.overflowY).toBe('hidden');

    // AC3: `dir="auto"` gives an RTL name an RTL base direction, so it reads
    // and truncates from the correct end.
    expect(metrics.direction).toBe('rtl');

    // AC3 again: wrapping was never the defect. A ~400-grapheme mixed RTL and
    // emoji name wraps with no horizontal overflow at any width.
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expectNoHorizontalOverflow(await readScrollMetrics(architectPage));

    // The researcher's own metadata is never rewritten on load: no migration,
    // no truncation, no silent repair. Only what the app PAINTS is bounded.
    const stored = await readProtocolJson(architectPage);
    expect(stored.name).toBe(OVERSIZED_NAME);
  });

  test(`an unbreakable protocol name wraps instead of overflowing at ${viewport.name} width`, async ({
    architectPage,
    seed,
  }) => {
    await seed(protocolWithStages(), { name: UNBREAKABLE_NAME });
    await architectPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoProtocol(architectPage);

    const metrics = await readNameControlMetrics(architectPage);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.offsetHeight);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expectNameWithinBound(metrics);
    await expect(new Timeline(architectPage).rows().first()).toBeInViewport();
    expectNoHorizontalOverflow(await readScrollMetrics(architectPage));
  });

  test(`the protocol card stays inside a ${viewport.name} viewport with an oversized name AND a maximal description`, async ({
    architectPage,
    seed,
  }) => {
    await seed(
      { ...protocolWithStages(), description: MAXIMAL_DESCRIPTION },
      { name: OVERSIZED_NAME },
    );
    await architectPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoProtocol(architectPage);

    // Both growable regions at maximum. Measure the CARD, not just the name —
    // the issue title is about the editor viewport, and a bound on the name
    // alone would still let the pair of them fill the screen.
    const cardHeight = await architectPage
      .getByRole('textbox', { name: 'Protocol name' })
      .evaluate((el) => {
        const card = el.closest('.max-w-3xl');
        if (!(card instanceof HTMLElement)) {
          throw new Error('protocol info card not found');
        }
        return card.offsetHeight;
      });

    expect(cardHeight).toBeLessThanOrEqual(viewport.height);
    expectNameWithinBound(await readNameControlMetrics(architectPage));
    expectNoHorizontalOverflow(await readScrollMetrics(architectPage));
  });
}

/**
 * #1397, AC1's "communicate". The editor's control enforces the cap by dropping
 * the over-limit edit, which is indistinguishable from a broken paste unless
 * the refusal is PAINTED. This is measured as geometry rather than asserted
 * with `toBeVisible()` on purpose: an `sr-only` element is not `display: none`
 * and does have a box, so `toBeVisible()` passes on a message no sighted
 * researcher can read. A 1x1 clipped box is the thing being ruled out.
 */
test('a refused protocol name is painted on screen, not only announced', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithStages(), { name: 'Wave 2 pilot' });
  await architectPage.setViewportSize({ width: 1280, height: 720 });
  await gotoProtocol(architectPage);

  const nameControl = architectPage.getByRole('textbox', {
    name: 'Protocol name',
  });
  const describedBy = await nameControl.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  // Attribute selector, not `#id`: React's `useId` emits colons, which are not
  // valid in a bare CSS id selector.
  const allowance = architectPage.locator(`[id="${describedBy}"]`);

  // Twelve graphemes, 88 remaining — the counter is silent chrome at this
  // distance from the limit. Asserting that FIRST is what stops the assertion
  // after the refusal from passing on an always-painted counter.
  const beforeRefusal = await allowance.boundingBox();
  expect(beforeRefusal?.width ?? 0).toBeLessThanOrEqual(1);
  expect(beforeRefusal?.height ?? 0).toBeLessThanOrEqual(1);

  // A real one-shot insertion, which is what a paste is. Deliberately not
  // `fill()`: that clears the field first, so the refusal would be measured
  // against an empty control rather than against the researcher's own name.
  await nameControl.click();
  await architectPage.keyboard.press('End');
  await architectPage.keyboard.insertText('B'.repeat(300));

  // THE HEADLINE, asserted first so a regression reports the filed defect
  // rather than something derived from it: the refusal now occupies real
  // painted area. `expect.poll` because `boundingBox()` is a one-shot read and
  // this has to be the assertion that waits, not one that races.
  await expect
    .poll(async () => (await allowance.boundingBox())?.width ?? 0)
    .toBeGreaterThan(1);
  const afterRefusal = await allowance.boundingBox();
  expect(afterRefusal?.height ?? 0).toBeGreaterThan(1);

  // ...and what is painted is the refusal, not the counter carrying on.
  await expect(allowance).toHaveText(PROTOCOL_NAME_TOO_LONG_MESSAGE);

  // Refused: neither accepted nor truncated.
  await expect(nameControl).toHaveValue('Wave 2 pilot');
});
