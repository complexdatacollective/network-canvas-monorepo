import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { assertBaselinesCommitted, makeCapture } from '../helpers/visual.js';
import { Toolbar } from '../pageobjects/toolbar.js';

// The summary cover prints "Document Created: <now>" from `new Date()` at
// render time (Cover.tsx), and falls back to `DateTime.now()` when the
// protocol has no lastModified — both would differ on every run (and can
// even change line wrapping, shifting the whole page). Pin the page clock
// so the visual baselines are deterministic. setFixedTime only fakes Date;
// asynchronous validation and persistence continue normally.
const FIXED_CLOCK = new Date('2026-01-01T12:00:00Z');

/**
 * The printed document's own page structure. `SummaryPage.tsx` stamps
 * `page-break-marker` on every element that begins a printed page — the cover,
 * the contents, each stage, each codebook entity, and the resource library —
 * so this is the document telling us where its sections are, not a selector
 * guessing.
 */
const SECTION = '.page-break-marker';

/**
 * The width the summary's content actually gets on paper, in CSS pixels.
 *
 * This document is designed to be printed, so a baseline captured at the
 * browser's desktop viewport shows a layout no researcher ever sees. Worse, it
 * is not even the screen layout: `.page-break-marker`'s `width: 21cm` and
 * `padding: 1.5cm` live in `protocol-summary.css`'s `@media screen` block, so
 * `emulateMedia({ media: 'print' })` switches them OFF and the section then
 * stretches to whatever the viewport happens to be — 1280px, with the content
 * flush to both edges. Neither paper nor screen.
 *
 * On paper the `@page` margin sits outside the content box, so the width
 * available to content is the sheet minus both margins. Sizing the viewport to
 * that makes each captured section exactly the column a researcher holds.
 *
 * Both numbers are READ FROM THE DOCUMENT rather than restated here: the sheet
 * from `--page-size-width` (architect-theme.css) and the margin from
 * `--margin` (protocol-summary.css). Hard-coding either would put a third copy
 * of the paper size in the tree, free to drift from the two that already
 * exist — which is the defect class this branch spent its time removing.
 */
const CSS_PX_PER_CM = 96 / 2.54;

const printableWidthPx = async (page: {
  evaluate: <T>(fn: (selector: string) => T, arg: string) => Promise<T>;
}): Promise<{ width: number; height: number }> => {
  // Read from a SECTION, not from `document.documentElement`. `--margin` is on
  // `:root`, but `--page-size-width`/`--page-size-height` come from the
  // `protocol-summary-surface` Tailwind utility, which is applied to an element
  // inside the document — so they are absent on `<html>` and resolve to NaN
  // there. Custom properties inherit, and a `.page-break-marker` sits inside
  // that surface, so it sees all three. (The first attempt read the root and
  // the guard below caught it: run 32275600864.)
  const { pageWidthCm, pageHeightCm, marginCm } = await page.evaluate(
    (selector: string) => {
      const section = document.querySelector(selector);
      if (!section) throw new Error(`no ${selector} to read page metrics from`);
      const styles = getComputedStyle(section);
      const read = (name: string) =>
        Number.parseFloat(styles.getPropertyValue(name));
      return {
        pageWidthCm: read('--page-size-width'),
        pageHeightCm: read('--page-size-height'),
        marginCm: read('--margin'),
      };
    },
    SECTION,
  );

  // A missing or non-cm custom property would silently produce NaN and a
  // nonsense viewport, so refuse rather than capture a meaningless baseline.
  for (const [name, value] of [
    ['--page-size-width', pageWidthCm],
    ['--page-size-height', pageHeightCm],
    ['--margin', marginCm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `[visual] ${name} did not resolve to a positive cm value (got ${value}). ` +
          'The printable-summary baselines size their viewport from it.',
      );
    }
  }

  return {
    width: Math.round((pageWidthCm - marginCm * 2) * CSS_PX_PER_CM),
    height: Math.round((pageHeightCm - marginCm * 2) * CSS_PX_PER_CM),
  };
};

/** A baseline filename from a section's own identity. */
const sectionSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

test(
  'renders the printable summary under print media',
  { tag: '@visual' },
  async ({ architectPage, seed }, testInfo) => {
    const { protocol, assets } = loadAllInterfacesFixture();
    await seed(protocol, { name: 'All Interfaces', assets });
    await architectPage.clock.setFixedTime(FIXED_CLOCK);
    const capture = makeCapture(architectPage);
    await architectPage.goto('/protocol/summary');
    await expect(architectPage.getByText('Loading protocol...')).toHaveCount(0);
    // The Resource Library's network-asset table renders only after the roster
    // file is fetched and parsed for its variables (Asset.tsx gates the whole
    // table on `variables`), so wait for it or the capture races the async load.
    await expect(
      architectPage.locator('#asset-roster_data').getByText('Attributes'),
    ).toBeVisible();
    await architectPage.emulateMedia({ media: 'print' });
    // Size the viewport to the paper, not the desktop. See `printableWidthPx`:
    // print media switches off the screen-only paper-card width, so without
    // this every section is captured at the browser's 1280px, which is a
    // layout the printed document never has.
    const paper = await printableWidthPx(architectPage);
    await architectPage.setViewportSize(paper);
    // Chromium can choose a larger cached responsive thumbnail after the app's
    // idle preloader runs. Pin an advertised 2x candidate for this visual
    // fixture, then decode the actual image. The image remains fully visible;
    // this excludes cache timing from the label/layout assertion.
    const pinnedPictures = await architectPage
      .locator(`${SECTION} picture`)
      .evaluateAll(async (pictures) => {
        await Promise.all(
          pictures.map(async (picture) => {
            const image = picture.querySelector('img');
            const source = picture.querySelector('source');
            if (!image || !source) throw new Error('Incomplete print picture');
            const width = image.getBoundingClientRect().width;
            if (width <= 0)
              throw new Error('Print picture has no visible width');
            const candidates = source.srcset.split(/,\s+/).map((candidate) => {
              const match = /^(.*) (\d+)w$/.exec(candidate);
              if (!match) throw new Error('Unrecognized print picture source');
              return { url: match[1]!, width: Number(match[2]) };
            });
            const target = candidates.find(
              (candidate) => candidate.width >= width * 2,
            );
            if (!target) throw new Error('No 2x print picture source');
            source.srcset = `${target.url} ${target.width}w`;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            await image.decode();
            if (
              image.currentSrc !== new URL(target.url, document.baseURI).href
            ) {
              throw new Error(
                'Print picture did not select the requested source',
              );
            }
          }),
        );
        return pictures.length;
      });
    expect(pinnedPictures).toBe(protocol.stages.length);
    // Re-settle after the resize: a narrower column re-wraps headings and can
    // change how many rows a table needs, and capturing mid-reflow would bake
    // a transient layout into the baseline.
    await expect(architectPage.locator(SECTION).first()).toBeVisible();

    // Captured PER SECTION rather than as one full-page image. The single
    // baseline this replaces was 1280x20190: locating a change in it needed a
    // row-diff script, and the commit that last adopted it recorded that its
    // author could not find what had changed. Split, a failure names the
    // section in the filename that failed, and each image is a page or two of
    // reviewable document.
    const sections = architectPage.locator(SECTION);

    // Non-vacuity, asserted before anything is captured: this test's entire
    // coverage is a loop over `sections`, so an empty or shortened list would
    // otherwise pass having captured nothing. The count is derived from the
    // fixture rather than hard-coded, so it tracks the protocol.
    const entityCount =
      (protocol.codebook.ego ? 1 : 0) +
      Object.keys(protocol.codebook.node ?? {}).length +
      Object.keys(protocol.codebook.edge ?? {}).length;
    // cover + contents + one per stage + one per codebook entity + resources
    const expectedSections = 2 + protocol.stages.length + entityCount + 1;
    await expect(sections).toHaveCount(expectedSections);

    // Each section names its own baseline: an `id` where the document has one
    // (`stage-…`, `ego`, `entity-…`), otherwise its heading.
    const names = await sections.evaluateAll((elements) =>
      elements.map(
        (element) =>
          element.id ||
          element.querySelector('h1, h2')?.textContent?.trim() ||
          '',
      ),
    );
    expect(names.filter((name) => name === '')).toEqual([]);
    expect(new Set(names).size).toBe(names.length);

    const baselines = names.map((name) => `summary-${sectionSlug(name)}`);
    // One actionable failure instead of one opaque "a snapshot doesn't exist"
    // per section. Derived from `names`, so it checks the exact set the loop
    // below is about to capture and a partial deletion fails too. See
    // assertBaselinesCommitted for why this is not a skip.
    assertBaselinesCommitted(testInfo, baselines);

    for (const [index, name] of baselines.entries()) {
      await capture(name, { locator: sections.nth(index) });
    }
  },
);

test('fires window.print with a pdf-styled document title', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });

  // Stub window.print before the app boots: the real window.print() would
  // open an OS print dialog and hang headless Chromium.
  // usePrintProtocolAction (PrintProtocolAction.tsx) sets document.title to a
  // ".pdf"-styled filename, calls window.print(), then restores the previous
  // title synchronously in a `finally` right after window.print() returns —
  // so the pdf-styled title only exists WHILE window.print() is executing.
  // Record it from inside the stub rather than reading document.title after
  // the click, which would only ever observe the already-restored value.
  await architectPage.addInitScript(() => {
    window.__printTitles = [];
    window.print = () => {
      window.__printTitles?.push(document.title);
    };
  });

  await architectPage.goto('/protocol/summary');
  await expect(architectPage.getByText('Loading protocol...')).toHaveCount(0);

  const toolbar = new Toolbar(architectPage);
  await toolbar.print();

  const printTitles = await architectPage.evaluate(
    () => window.__printTitles ?? [],
  );
  expect(printTitles).toHaveLength(1);
  // usePrintProtocolAction's filename format (PrintProtocolAction.tsx):
  // `${protocol name} Protocol Summary (Created ${date} ${time}).pdf`.
  expect(printTitles[0]).toMatch(
    /^All Interfaces Protocol Summary \(Created .+\)\.pdf$/,
  );

  // main.tsx's static <title>Architect</title> (index.html) is what
  // usePrintProtocolAction captured as `previousTitle` and restored — by now
  // window.print() has returned, so the pdf-styled title is gone again.
  await expect(architectPage).toHaveTitle('Architect');
});

test(
  'renders the codebook with entity types and variables',
  { tag: '@visual' },
  async ({ architectPage, seed }, testInfo) => {
    // Same pre-flight as the summary test, so "the baseline is missing" is
    // answered the same way wherever it happens. Inert while it exists.
    const baseline = 'codebook';
    assertBaselinesCommitted(testInfo, [baseline]);
    const { protocol, assets } = loadAllInterfacesFixture();
    await seed(protocol, { name: 'All Interfaces', assets });
    await architectPage.clock.setFixedTime(FIXED_CLOCK);
    await architectPage.goto('/protocol/codebook');

    // EntityType renders the protocol-defined name and entity kind as the
    // shared Section heading beneath Codebook's "Node Types" h2.
    await expect(
      architectPage.getByRole('heading', {
        level: 3,
        name: 'person node type',
        exact: true,
      }),
    ).toBeVisible();
    // Each variable renders as an editable ConnectedVariablePill button whose
    // accessible name identifies the variable and the edit action
    // (VariablePill.tsx);
    // `biologicalSex` is unique to the `person` node type in the fixture.
    await expect(
      architectPage.getByRole('button', {
        name: 'Edit attribute name: biologicalSex',
        exact: true,
      }),
    ).toBeVisible();

    const capture = makeCapture(architectPage);
    await capture(baseline);
  },
);

// #1392: the Codebook's "Used In" column disagreed with its own delete gate.
// The usage index it derives both from missed every reference that reaches a
// variable through a data-source column or a sort key, so a variable could be
// undeletable with nothing to show for it — or, worse, deletable while a stage
// still read it.
test('lists roster data-source references in Used In', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/codebook');

  // The fixture's NameGeneratorRoster names `age` in cardOptions,
  // sortOptions and searchOptions, and names it nowhere else — no prompt, no
  // form field. Before the fix this cell listed every OTHER stage and omitted
  // the roster entirely.
  const ageRow = architectPage.locator('tr', {
    has: architectPage.getByRole('button', {
      name: 'Edit attribute name: age',
      exact: true,
    }),
  });
  await expect(ageRow).toHaveCount(1);
  await expect(
    ageRow.getByRole('link', { name: 'Name Generator Roster' }),
  ).toBeVisible();

  // The invariant behind the two symptoms, asserted across the whole table:
  // a row whose delete is disabled as in-use must say where.
  const disabledWithNothingToShow = await architectPage.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    return rows
      .filter((row) => {
        const control = row.querySelector('button[aria-label^="In use"]');
        const usage = row.querySelectorAll('td')[1];
        return control !== null && (usage?.textContent ?? '').trim() === '';
      })
      .map((row) => row.textContent?.trim().slice(0, 60) ?? '');
  });
  expect(disabledWithNothingToShow).toEqual([]);
});

// The same references reach the printable Summary's own "Used In" column,
// which is built from a separate index (lib/ProtocolSummary/helpers.ts) and
// renders one link per collected reference. A stage that reads one variable
// through several sites must still be named once — the fixture's roster names
// `age` in cardOptions, sortOptions.sortOrder, sortOptions.sortableProperties
// AND searchOptions, which is four references to one stage. This guards the
// committed per-section `summary-*.png` baselines as much as the page.
test('names each stage once in the printable summary Used In column', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/summary');
  await expect(architectPage.getByText('Loading protocol...')).toHaveCount(0);

  const usage = await architectPage.evaluate(() =>
    [...document.querySelectorAll('tbody tr[id^="variable-"]')].map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        id: row.id,
        links: [...(cells[cells.length - 1]?.querySelectorAll('a') ?? [])].map(
          (link) => link.getAttribute('href') ?? '',
        ),
      };
    }),
  );

  // Guard the guard: an empty table, or a table whose roster references never
  // arrived, would satisfy the de-duplication assertion vacuously.
  expect(usage.length).toBeGreaterThan(0);
  expect(usage.find((row) => row.id === 'variable-age')?.links).toEqual([
    '#stage-name-generator-roster-1',
  ]);

  const repeated = usage.filter(
    ({ links }) => new Set(links).size !== links.length,
  );
  expect(repeated).toEqual([]);
});

test('lands keyboard focus on the destination heading of a Used In link', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/codebook');

  const link = architectPage
    .locator('table tbody tr')
    .getByRole('link')
    .first();
  const destination = await link.textContent();
  await link.focus();
  await architectPage.keyboard.press('Enter');

  await expect(architectPage).toHaveURL(/\/protocol\/stage\//);

  // The heading, not `<body>`: before the fix the next Tab restarted at the
  // header's "Return to start screen" logo instead of continuing into the
  // editor.
  const focused = await architectPage.evaluate(() => {
    const active = document.activeElement;
    return {
      tag: active?.tagName ?? null,
      isRouteTarget:
        active instanceof HTMLElement &&
        active.hasAttribute('data-route-focus-target'),
      text: active?.textContent?.trim() ?? '',
    };
  });
  expect(focused.tag).toBe('H1');
  expect(focused.isRouteTarget).toBe(true);
  expect(focused.text).toBe(destination?.trim());

  await architectPage.keyboard.press('Tab');
  await expect(
    architectPage.getByRole('textbox', { name: 'Stage name' }),
  ).toBeFocused();
});

// #1392: a valid but very long variable name broke the delete confirmation.
// The confirm button's label carried the identifier, `min-w-fit` + `shrink-0`
// sized the button to the whole unbreakable token, and the flex footer pushed
// the autofocused Cancel button off the viewport — so the dialog's default
// action was invisible and Enter "silently" cancelled.
test('deletes a very long variable from a dialog that stays inside its box', async ({
  architectPage,
  seed,
}) => {
  const LONG_NAME = `long_${'x'.repeat(240)}`;
  const { protocol, assets } = loadAllInterfacesFixture();
  const withLongVariable = structuredClone(protocol);
  const personType = withLongVariable.codebook.node?.person;
  if (!personType?.variables) throw new Error('fixture lost its person type');
  personType.variables['long-name-variable'] = {
    name: LONG_NAME,
    type: 'text',
    component: 'Text',
  };
  await seed(withLongVariable, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/codebook');

  const row = architectPage.locator('tr', {
    has: architectPage.getByRole('button', {
      name: `Edit attribute name: ${LONG_NAME}`,
      exact: true,
    }),
  });
  await row.getByRole('button', { name: 'Delete attribute' }).click();

  const dialog = architectPage.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Nothing overflows, and every action is inside the dialog and hit-testable
  // at its own centre — `toBeVisible()` alone would pass for a button parked
  // at x = -1572.
  const geometry = await dialog.evaluate((node: HTMLElement) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    actions: [...node.querySelectorAll('button')].map((button) => {
      const box = button.getBoundingClientRect();
      const dialogBox = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(box.x + box.width / 2),
        Math.round(box.y + box.height / 2),
      );
      return {
        label: button.getAttribute('data-testid') ?? 'close',
        inside: box.x >= dialogBox.x - 1 && box.right <= dialogBox.right + 1,
        hittable: hit !== null && node.contains(hit),
      };
    }),
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.actions.every((action) => action.inside)).toBe(true);
  expect(geometry.actions.every((action) => action.hittable)).toBe(true);
  // The identifier is in the body text, which wraps; the action label is fixed.
  await expect(dialog.getByTestId('dialog-primary')).toHaveText(
    'Delete attribute',
  );

  await dialog.getByTestId('dialog-primary').click();
  await expect(dialog).toBeHidden();

  // The IndexedDB row, not the rendered table: the filed symptom was a
  // deletion that looked done and had not happened.
  const stored = await readProtocolJson(
    architectPage,
    (current) =>
      current.codebook.node?.person?.variables?.['long-name-variable'] ===
      undefined,
  );
  expect(
    stored.codebook.node?.person?.variables?.['long-name-variable'],
  ).toBeUndefined();
});
