import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { Timeline } from '../pageobjects/timeline.js';

/**
 * The Issues panel names each field by harvesting its label out of the DOM
 * (`Issues.tsx`), because the flattened errors carry only the internal field
 * path. This has to be an E2E assertion rather than a component test: the bug
 * it guards was a mount-ordering one — Base UI mounts the popover's rows in a
 * later commit than the one that opens it — and jsdom's timing hid it. A
 * component test could only see it by re-emitting the errors, which is
 * precisely the second pass that masked the broken first open.
 */
test('names the offending field on the first open of the issues panel', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const informationStage = protocol.stages.find(
    (stage) => stage.type === 'Information',
  );
  if (!informationStage) throw new Error('fixture has no Information stage');

  await seed(protocol, { name: 'Issues Panel', assets });
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage(informationStage.label);

  // Clearing Information's required page heading is the smallest way to make
  // the stage fail its own validation.
  await architectPage.getByRole('textbox', { name: 'Page heading' }).fill('');

  // A failed submit opens the panel by itself. Nothing is edited afterwards, so
  // this is the first — and for most researchers, only — pass over these rows.
  await architectPage.getByRole('button', { name: 'Finished Editing' }).click();

  const row = architectPage.getByTestId('issue').first();
  await expect(row).toBeVisible();
  // The field's own label, not `title` — the internal path the errors are
  // keyed by, which is what leaked before the harvest ran on mount.
  await expect(row).toHaveText(/^Title - /);
});

/**
 * An issue row is a promise to take the researcher to the thing they have to
 * correct.
 *
 * E2E rather than a component test for the same mount-ordering reason as
 * above, plus one of its own: Base UI's popover restores focus on close, and
 * where it restores it to is decided by the real focus manager against a real
 * document. Before this it went back to the "Issues (n)" trigger, so a
 * keyboard or screen-reader user was returned exactly where they started
 * while the page had scrolled somewhere else entirely.
 */
test('sends focus to the control an issue row names', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const informationStage = protocol.stages.find(
    (stage) => stage.type === 'Information',
  );
  if (!informationStage) throw new Error('fixture has no Information stage');

  await seed(protocol, { name: 'Issues Focus', assets });
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage(informationStage.label);

  const heading = architectPage.getByRole('textbox', { name: 'Page heading' });
  await heading.fill('');
  await architectPage.getByRole('button', { name: 'Finished Editing' }).click();

  const row = architectPage.getByTestId('issue').first();
  await expect(row).toBeVisible();
  await row.getByRole('link').click();

  // Not the trigger, and not `<body>`: the field the row names.
  await expect(heading).toBeFocused();
});
