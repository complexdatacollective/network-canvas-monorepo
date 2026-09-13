import { type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

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
 * overflow, because the app scrolls inside its own container — the element
 * `ProjectLayout` renders. That container is where the horizontal scrollbar
 * actually appeared — 873 vs 753 on the timeline at tablet width, 432 vs 390
 * on the stage editor at phone width — so both are measured and both are
 * asserted.
 *
 * The container is found by BEHAVIOUR — it is the app's one outermost
 * viewport-height vertical scroll port — rather than by the Tailwind utility
 * it happens to be built from. `div.overflow-y-auto` used to name that class,
 * which is exactly backwards: the class is a cosmetic detail free to be
 * renamed without changing anything, while the scrolling it stands for is the
 * behaviour this whole spec measures. Taking the FIRST such div in the
 * document was worse still — a new scrolling panel anywhere earlier in the
 * tree would silently redirect every assertion below onto the wrong box, and
 * the spec would keep passing.
 *
 * Requiring exactly one is part of the oracle: the app scrolls in a single
 * place, and a second full-height scroll port is itself the kind of layout
 * regression these tests exist to catch.
 */
async function readScrollMetrics(page: Page): Promise<ScrollMetrics> {
  return page.evaluate(() => {
    const ports = Array.from(document.querySelectorAll('*')).filter(
      (element): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false;
        const { overflowY } = getComputedStyle(element);
        if (overflowY !== 'auto' && overflowY !== 'scroll') return false;
        // Half the viewport separates the app's own scroll port from the
        // incidental ones inside it by an order of magnitude, at both widths
        // under test: measured 647/844 and 929/1024 for the app container,
        // against 114 for a description textarea and 58 for a toolbar strip.
        return element.clientHeight >= window.innerHeight * 0.5;
      },
    );
    const outermost = ports.filter(
      (element) =>
        !ports.some((other) => other !== element && other.contains(element)),
    );
    const [container] = outermost;
    if (outermost.length !== 1 || !container) {
      throw new Error(
        `expected exactly one app-level vertical scroll port, found ${outermost.length}`,
      );
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
 * Where the stage editor's two columns actually sit.
 *
 * The list of the stage's sections is Architect's own chrome, portalled into
 * the first track of the route's grid, while the form it describes is rendered
 * by `@codaco/protocol-builder` into the second — so nothing but a measurement
 * can say whether the researcher is looking at one column or two. The grid's
 * tracks are chosen by a CONTAINER query, which a page with no query container
 * above the grid answers "no" to at every width: the two columns would then
 * never arrive, silently, and the list would sit above the form on a desktop
 * screen with room for both.
 */
async function stageEditorColumns(page: Page): Promise<{
  outline: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
  };
  form: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
  };
}> {
  const outline = page.getByRole('navigation', { name: 'Stage sections' });
  const form = page.locator('form#edit-stage');
  await expect(outline.getByRole('listitem').first()).toBeVisible();
  await expect(form).toBeVisible();
  const [outlineBox, formBox] = await Promise.all([
    outline.boundingBox(),
    form.boundingBox(),
  ]);
  if (!outlineBox || !formBox) {
    throw new Error('the stage editor has no section list or no form');
  }
  const box = (b: { x: number; y: number; width: number; height: number }) => ({
    top: b.y,
    bottom: b.y + b.height,
    left: b.x,
    right: b.x + b.width,
    width: b.width,
  });
  return { outline: box(outlineBox), form: box(formBox) };
}

/**
 * The width at which the section list moves beside the form, and the widest
 * screen Architect is designed for. Read at both, because the interesting
 * failure is the list never moving at all.
 */
test('the stage editor lists its sections beside the form at desktop width', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.setViewportSize({ width: 1280, height: 900 });
  await gotoProtocol(architectPage);
  const [stage] = protocol.stages;
  if (!stage) throw new Error('fixture has no stages');
  await architectPage.goto(`/protocol/stage/${stage.id}`);

  const { outline, form } = await stageEditorColumns(architectPage);
  // Beside, not above: the list ends where the form's column begins, and the
  // two share the same band of the page.
  expect(outline.right).toBeLessThanOrEqual(form.left + 1);
  expect(outline.top).toBeLessThan(form.bottom);
  expect(form.top).toBeLessThan(outline.bottom);

  // The whole of its column, with nothing inset inside it. The track is
  // `16rem`, and the list's titles are `truncate`d — so every pixel a gutter
  // takes inside this column is a pixel of section title the researcher
  // stops being able to read, silently. A route gutter applied inside the
  // query container instead of outside it measured 208 here.
  const remInPx = await architectPage.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(remInPx).toBeGreaterThan(0);
  expect(outline.width).toBeGreaterThanOrEqual(16 * remInPx - 1);
});

/**
 * The band no other case in this file covers.
 *
 * The grid asks its container for 60rem before it splits, and the container
 * is the element INSIDE the route's gutter — so the answer is about the width
 * the researcher can actually see, 48px narrower than the window, and the
 * split lands at 1008px of viewport rather than 960. Putting the gutter
 * inside the container instead moves it without changing a number anyone
 * wrote down: measured in Chromium, 985px of viewport then showed two columns
 * where the same page had shown one, the form dropping from 937px wide to
 * 641.
 *
 * The rest of this file reads 390, 768 and 1280, which is exactly the span
 * the threshold can move across unnoticed. Both sides of it are asserted
 * here: one column while the room is only apparently there, two as soon as
 * it is.
 */
test('the stage editor splits into two columns on the room the researcher can see, not the window', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.setViewportSize({ width: 985, height: 900 });
  await gotoProtocol(architectPage);
  const [stage] = protocol.stages;
  if (!stage) throw new Error('fixture has no stages');
  await architectPage.goto(`/protocol/stage/${stage.id}`);

  // Polled rather than read once: a viewport change re-runs the container
  // query on the next frame, and this reads the frame after the resize is
  // settled rather than racing it.
  const arrangement = async () => {
    const { outline, form } = await stageEditorColumns(architectPage);
    return outline.bottom <= form.top + 1 ? 'stacked' : 'beside';
  };

  await expect.poll(arrangement).toBe('stacked');

  await architectPage.setViewportSize({ width: 1008, height: 900 });
  await expect.poll(arrangement).toBe('beside');

  const { outline, form } = await stageEditorColumns(architectPage);
  expect(outline.right).toBeLessThanOrEqual(form.left + 1);
  expect(outline.top).toBeLessThan(form.bottom);
});

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

    // The page's content column, found by MEASUREMENT rather than by a fixed
    // number of `parentElement` hops: walk out from the heading to the first
    // ancestor that spans (nearly) the whole viewport. A wrapper added or
    // removed around the header cannot silently change WHICH box gets
    // asserted, which is exactly what a hop count would let happen.
    const bounds = await heading.evaluate((element) => {
      const spansViewport = (node: Element) =>
        node.getBoundingClientRect().width >= window.innerWidth * 0.6;
      let column: Element | null = element;
      while (column && !spansViewport(column)) column = column.parentElement;
      if (!column) throw new Error('page content column not found');
      const box = column.getBoundingClientRect();
      return { left: box.left, right: box.right, width: window.innerWidth };
    });

    // Non-vacuity: the box asserted below really is the content column and not
    // a short run of heading text that would clear both insets for free.
    expect(bounds.right - bounds.left).toBeGreaterThanOrEqual(
      bounds.width * 0.6,
    );
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
    const timeline = new Timeline(architectPage);
    const row = timeline.stageCards().first();
    const badge = timeline.stageBadges().first();
    const spine = timeline.spine();
    await expect(row).toBeVisible();
    await expect(badge).toBeVisible();
    await expect(spine).toBeAttached();

    // The spine is one absolutely-positioned line at `left-1/2` of the
    // timeline wrapper. Each row's numbered badge only lands on it because the
    // row's flanking grid tracks are `minmax(0, 1fr)` — equal by construction
    // at every width, with no content floor to push one side wider. A bare
    // `1fr` would let a long label or the trailing action cluster drift the
    // badge off the line, which no pixel-free assertion but this one notices.
    const [rowBox, badgeBox, spineBox] = await Promise.all([
      row.boundingBox(),
      badge.boundingBox(),
      spine.boundingBox(),
    ]);
    if (!rowBox || !badgeBox || !spineBox) {
      throw new Error('timeline row, badge or spine has no box');
    }
    const centre = (box: { x: number; width: number }) => box.x + box.width / 2;

    expect(Math.abs(centre(badgeBox) - centre(rowBox))).toBeLessThanOrEqual(1);
    expect(Math.abs(centre(badgeBox) - centre(spineBox))).toBeLessThanOrEqual(
      1,
    );
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

  test(`the stage editor stacks its section list above the form at ${viewport.name} width`, async ({
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
    const [stage] = protocol.stages;
    if (!stage) throw new Error('fixture has no stages');
    await architectPage.goto(`/protocol/stage/${stage.id}`);

    const { outline, form } = await stageEditorColumns(architectPage);
    // Below the two-column breakpoint the list is a strip ABOVE the form
    // rather than a column beside it: a page this narrow has no room for one.
    // Overlapping horizontally is the other half of that — two things stacked
    // share the page's width, and two side by side do not.
    expect(outline.bottom).toBeLessThanOrEqual(form.top + 1);
    expect(outline.left).toBeLessThan(form.right);
    expect(form.left).toBeLessThan(outline.right);
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
    //
    // The card is the innermost element holding BOTH growable controls, each
    // located by role and accessible name. That is what "the card" means here,
    // and unlike `closest('.max-w-3xl')` it survives the design system
    // changing the width utility it happens to be capped with.
    const card = architectPage
      .locator('div')
      .filter({
        has: architectPage.getByRole('textbox', { name: 'Protocol name' }),
      })
      .filter({
        has: architectPage.getByRole('textbox', {
          name: 'Protocol description',
        }),
      })
      .last();
    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error('protocol info card has no box');

    expect(cardBox.height).toBeLessThanOrEqual(viewport.height);
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
  await expect(allowance).toHaveText(
    'Protocol names are limited to 100 characters.',
  );

  // Refused: neither accepted nor truncated.
  await expect(nameControl).toHaveValue('Wave 2 pilot');
});
