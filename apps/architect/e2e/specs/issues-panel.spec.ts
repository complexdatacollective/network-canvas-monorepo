import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { selectOrCreateNodeType } from '../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../pageobjects/editor-sections/prompts.js';
import { createAttribute } from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
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
  // keyed by, which is what leaked before the harvest ran on mount. Until
  // #1400 this read "Title", which is not the label at all: the harvest ran,
  // but what it harvested was `startCase('title')`, and that only looks right
  // for the handful of fields whose path start-cases into their own label.
  await expect(row).toHaveText(/^Page heading - /);
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

/**
 * The panel over the fields the stage editor actually renders.
 *
 * Every field in the editor comes from `@codaco/protocol-builder` and renders
 * none of Architect's own `IssueAnchor`s, so the panel's rows used to be
 * composed against ids nothing mounted: each row linked to `#field_prompts`
 * and, with no anchor to read a name off, called its field by the store's
 * internal path. Observed on the deployed dev site at v8.2.5 while
 * release-testing a quick-add name generator.
 *
 * A LIST is the shape that broke hardest: the only thing inside it a person
 * can operate is an add button named by its own words, so there was nothing
 * anywhere to name the field by.
 */
test('names a list field, and links to something that is on the page', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol(), { name: 'Issues Panel Lists' });
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NameGeneratorQuickAdd');
  await selectOrCreateNodeType(architectPage, 'Person');
  await createAttribute(editor.field('quickAdd'), 'name');

  // The one thing left undone, so the panel lists exactly the prompt list.
  await architectPage.getByRole('button', { name: 'Finished Editing' }).click();

  const row = architectPage.getByTestId('issue').first();
  await expect(row).toBeVisible();
  // The field's own label — not "prompts", which is the form store's key.
  await expect(row).toHaveText(/^Prompts - /);

  const href = await row.getByRole('link').getAttribute('href');
  expect(href).toBeTruthy();
  await expect(architectPage.locator(href!)).toHaveCount(1);

  // And taking the row puts the researcher on the control that resolves it.
  await row.getByRole('link').click();
  await expect(
    architectPage.getByRole('button', { name: 'Create new prompt' }),
  ).toBeFocused();
});

/**
 * A refusal is about the value it was raised against, so it goes when that
 * value changes — without the researcher having to leave the protocol and
 * open it again.
 */
test('drops a refusal as soon as the researcher answers it', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol(), { name: 'Refusal Clearing' });
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NameGeneratorQuickAdd');
  await selectOrCreateNodeType(architectPage, 'Person');
  await createAttribute(editor.field('quickAdd'), 'name');

  await architectPage.getByRole('button', { name: 'Finished Editing' }).click();
  await expect(architectPage.getByTestId('issue')).toHaveCount(1);
  await architectPage.keyboard.press('Escape');

  await addPrompt(editor.section('Prompt collection'), async () => {
    await editor.fillRichText(
      'Prompt text',
      'Please name someone you talk to.',
    );
  });
  // Scoped to the LIST the prompt lands in. Unscoped, the same text is also
  // in the row dialog that wrote it, and that dialog animates out — so the
  // locator matched two elements for as long as the exit lasted, which a
  // strict-mode violation reports rather than retries away.
  await expect(
    architectPage
      .getByRole('list', { name: 'Prompts' })
      .getByText('Please name someone you talk to.'),
  ).toBeVisible();

  // The toolbar's issues control is composed from the field errors, so it goes
  // with them: no count left standing over a stage that now asks something.
  // Scoped to the toolbar, and matched on the count the control carries, so a
  // protocol whose NAME begins "Issues" cannot answer for it.
  await expect(
    architectPage
      .getByRole('toolbar')
      .getByRole('button', { name: /^Issues \(\d+\)$/ }),
  ).toHaveCount(0);
});
