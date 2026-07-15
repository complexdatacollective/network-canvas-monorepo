import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { makeCapture } from '../helpers/visual.js';
import { Toolbar } from '../pageobjects/toolbar.js';

// The summary cover prints "Document Created: <now>" from `new Date()` at
// render time (Cover.tsx), and falls back to `DateTime.now()` when the
// protocol has no lastModified — both would differ on every run (and can
// even change line wrapping, shifting the whole page). Pin the page clock
// so the visual baselines are deterministic. setFixedTime only fakes Date;
// timers keep running, so the autosave debounce is unaffected.
const FIXED_CLOCK = new Date('2026-01-01T12:00:00Z');

test(
  'renders the printable summary under print media',
  { tag: '@visual' },
  async ({ architectPage, seed }) => {
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
      architectPage.locator('#asset-roster_data').getByText('Variables'),
    ).toBeVisible();
    await architectPage.emulateMedia({ media: 'print' });
    await capture('summary-print', { fullPage: true });
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
  async ({ architectPage, seed }) => {
    const { protocol, assets } = loadAllInterfacesFixture();
    await seed(protocol, { name: 'All Interfaces', assets });
    await architectPage.clock.setFixedTime(FIXED_CLOCK);
    await architectPage.goto('/protocol/codebook');

    // Codebook.tsx renders each node type's protocol-defined `name` as an h2
    // (EntityType.tsx); the fixture's only node type is `person`.
    await expect(
      architectPage.getByRole('heading', {
        level: 2,
        name: 'person',
        exact: true,
      }),
    ).toBeVisible();
    // Each variable renders as an EditableVariablePill button labelled "Rename
    // variable <name>" (VariablePill.tsx); `biologicalSex` is unique to the
    // `person` node type in the fixture.
    await expect(
      architectPage.getByRole('button', {
        name: 'Rename variable biologicalSex',
      }),
    ).toBeVisible();

    const capture = makeCapture(architectPage);
    await capture('codebook');
  },
);
