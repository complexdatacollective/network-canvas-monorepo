import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { Timeline } from '../pageobjects/timeline.js';
import { Toolbar } from '../pageobjects/toolbar.js';

type ProtocolStagesJson = {
  stages: { id: string; label: string; type: string }[];
};

test('reorders stages via drag and commits one moveStage', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = (await readProtocolJson(architectPage)) as ProtocolStagesJson;
  const timeline = new Timeline(architectPage);
  await timeline.dragStage(before.stages[0].label, before.stages[2].label);

  await expect
    .poll(async () => {
      const after = (await readProtocolJson(
        architectPage,
      )) as ProtocolStagesJson;
      return after.stages[0].id;
    })
    .not.toBe(before.stages[0].id);
});

test('inserts a new Information stage at the clicked index', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = (await readProtocolJson(architectPage)) as ProtocolStagesJson;
  const insertIndex = 1;

  const timeline = new Timeline(architectPage);
  await timeline.insertAt(insertIndex);

  // NewStageScreen opens as a fullscreen dialog titled "Select an Interface
  // Type" (Dialog `title` prop in NewStageScreen.tsx).
  await expect(
    architectPage.getByRole('dialog', { name: 'Select an Interface Type' }),
  ).toBeVisible();

  // `type="search"` gives the input an implicit `searchbox` role.
  await architectPage
    .getByRole('searchbox', { name: 'Search interfaces' })
    .fill('Information');
  await architectPage
    .getByRole('button')
    .filter({
      has: architectPage.getByRole('heading', {
        level: 4,
        name: 'Information',
        exact: true,
      }),
    })
    .click();

  // handleSelectInterface (NewStageScreen.tsx) builds the query string as
  // `type` then `insertAtIndex`, in that order.
  await architectPage.waitForURL(
    new RegExp(
      `/protocol/stage/new\\?type=Information&insertAtIndex=${insertIndex}$`,
    ),
  );

  // StageHeading.tsx's stage-name input is `aria-label="Stage name"`.
  await architectPage
    .getByRole('textbox', { name: 'Stage name' })
    .fill('Inserted Info Stage');

  // Information's Title section (Title.tsx) requires a non-empty `title`
  // (UI-level `validation={{ required: true }}`, stricter than the schema's
  // `title: z.string().optional()`) and ContentGrid.tsx's `notEmpty`
  // validator requires a non-empty `items` array — both are redux-form
  // sync-validated, so a save that actually commits needs both filled.
  await architectPage
    .getByRole('textbox', { name: 'Page heading' })
    .fill('Inserted stage heading');
  await architectPage.getByRole('button', { name: 'Create new' }).click();
  await architectPage.getByRole('radio', { name: 'Text' }).click();
  const contentField = architectPage.getByRole('textbox', {
    name: 'Content',
  });
  await contentField.click();
  // Real keystrokes (not `.fill()`) so Tiptap/ProseMirror's own input
  // handling — which `.fill()`'s direct DOM write bypasses — registers the
  // change into redux-form.
  await contentField.pressSequentially('Minimal content.');
  // `exact` to avoid matching the RichTextEditor toolbar's "Add link" button.
  await architectPage.getByRole('button', { name: 'Add', exact: true }).click();

  const toolbar = new Toolbar(architectPage);
  await toolbar.button('finished-editing').click();
  await architectPage.waitForURL(/\/protocol$/);

  await expect
    .poll(async () => {
      const after = (await readProtocolJson(
        architectPage,
      )) as ProtocolStagesJson;
      return after.stages.length;
    })
    .toBe(before.stages.length + 1);

  const after = (await readProtocolJson(architectPage)) as ProtocolStagesJson;
  expect(after.stages[insertIndex]).toMatchObject({
    type: 'Information',
    label: 'Inserted Info Stage',
  });
  // The stage previously at `insertIndex` shifted down by one rather than
  // being replaced.
  expect(after.stages[insertIndex + 1]?.id).toBe(
    before.stages[insertIndex]?.id,
  );
});

test('blocks deleting a FamilyPedigree stage referenced by NarrativePedigree', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  await timeline.deleteStage('Family Pedigree');
  // Guard shows an acknowledge dialog, not the destructive confirm. All of
  // fresco-ui's `useDialog` dialogs (and NewStageScreen's inline `Dialog`)
  // share one `Dialog` component built on a plain (non-alert) Base UI
  // `Dialog.Root`, so the accessible role is `dialog`, not `alertdialog`.
  await expect(
    architectPage.getByRole('dialog', { name: 'Cannot delete stage' }),
  ).toBeVisible();
});

test('deletes a leaf stage after confirming the destructive dialog', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = (await readProtocolJson(architectPage)) as ProtocolStagesJson;
  const target = before.stages.find((stage) => stage.label === 'Information');
  if (!target) throw new Error('fixture is missing an "Information" stage');

  const timeline = new Timeline(architectPage);
  await timeline.deleteStage('Information');

  // handleDeleteStage's non-guarded path opens a destructive `confirm`
  // dialog titled "Delete stage".
  await architectPage
    .getByRole('dialog', { name: 'Delete stage' })
    .getByRole('button', { name: 'Delete stage' })
    .click();

  await expect
    .poll(async () => {
      const after = (await readProtocolJson(
        architectPage,
      )) as ProtocolStagesJson;
      return after.stages.some((stage) => stage.id === target.id);
    })
    .toBe(false);
});
