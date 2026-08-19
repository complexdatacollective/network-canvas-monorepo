import { type Locator, type Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import {
  readAnnouncements,
  recordAnnouncements,
} from '../helpers/announcements.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson, settleAfterRefusal } from '../helpers/read-store.js';
import { acknowledgeRefusal } from '../helpers/refusal.js';
import { Timeline } from '../pageobjects/timeline.js';
import { Toolbar } from '../pageobjects/toolbar.js';

type Stage = { id: string; label: string; type: string };

/**
 * A skip-logic filter the protocol schema actually accepts.
 *
 * `{ join: 'AND', rules: [] }` does not: `FilterSchema` requires at least one
 * rule. That matters far more than it looks. Seeding writes straight to
 * IndexedDB, so Architect opens an invalid protocol quite happily — but
 * `protocolValidationListener` then rejects every candidate it produces, so
 * NOTHING the test does afterwards is persisted. A "nothing changed"
 * assertion is therefore true whatever the guard under test does, and the
 * test cannot fail. `settleAfterRefusal` is what exposed it: waiting for a
 * write of its own to become durable is impossible in a protocol that cannot
 * write at all, where the old one-second sleep simply expired and passed.
 *
 * The rule's content is irrelevant to these tests — the reorder and delete
 * guards read `skipLogic.destination`, not the filter — so this asks the
 * cheapest true question available: does any node of the first codebook type
 * exist. Read from the fixture rather than hardcoded, so a codebook change
 * fails here rather than seeding another unwritable protocol.
 */
const anyNodeOfFirstType = (protocol: {
  codebook: { node?: Record<string, unknown> };
}) => {
  const [nodeType] = Object.keys(protocol.codebook.node ?? {});
  if (!nodeType) throw new Error('fixture has no node type to filter on');
  return {
    join: 'AND' as const,
    rules: [
      {
        type: 'node' as const,
        id: 'skip-when-any-node-exists',
        options: { type: nodeType, operator: 'EXISTS' as const },
      },
    ],
  };
};

// Narrow one element of the protocol JSON's `stages` array with a real
// runtime guard (mirroring `isRow` in helpers/read-store.ts) rather than an
// `as` cast, so a drifted/malformed stage throws here instead of silently
// producing a mis-typed object the assertions would then trust.
function toStage(value: unknown): Stage {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'label' in value &&
    typeof value.label === 'string' &&
    'type' in value &&
    typeof value.type === 'string'
  ) {
    return { id: value.id, label: value.label, type: value.type };
  }
  throw new Error('protocol stage missing a string id, label, or type');
}

// `readProtocolJson` returns `Record<string, unknown>`; extract its stages as
// a typed array via `toStage` (no `as`). Each `unknown` element is narrowed
// runtime-side, so callers get a real `Stage[]`.
function stagesOf(protocol: Record<string, unknown>): Stage[] {
  const stages = protocol.stages;
  if (!Array.isArray(stages)) {
    throw new Error('protocol JSON has no stages array');
  }
  return stages.map((value: unknown) => toStage(value));
}

// The persisting edit this route offers `settleAfterRefusal`: ProtocolInfoCard
// sits above the timeline, and its description field commits on blur. It
// touches nothing the refusal specs assert on — stage order, stage count, and
// the announcements they read are all untouched by a description change.
const editDescription = (page: Page) => async (token: string) => {
  const description = page.getByRole('textbox', {
    name: 'Protocol description',
  });
  await description.fill(token);
  await description.blur();
};

test('shows the skip-logic icon without a destination note', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const firstStage = protocol.stages[0];
  if (!firstStage) throw new Error('fixture has no stages');
  firstStage.skipLogic = {
    action: 'SKIP',
    filter: anyNodeOfFirstType(protocol),
  };

  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const row = new Timeline(architectPage).stageRowByLabel(firstStage.label);
  await expect(row.getByRole('img', { name: 'Has skip logic' })).toBeVisible();
  await expect(row.getByText(/^If skipped:/)).toHaveCount(0);
});

test('reports the list as exactly its stages', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  await expect(timeline.rows()).toHaveCount(protocol.stages.length);

  // Every insertion point and the trailing add control were once direct
  // children of the `<ul>`. That is invalid list content, and assistive
  // technology counts a list by its children — so the list announced itself as
  // twice its own length plus one. `toHaveCount` above cannot see it: the
  // extra children are not `<li>`s, which is the whole problem.
  const structure = await architectPage.evaluate(() => {
    const list = document.querySelector('ul[aria-label="Protocol stages"]');
    if (!list) throw new Error('stage list not found');
    const addControl = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Add new stage',
    );
    if (!addControl) throw new Error('add control not found');
    return {
      // Every direct child's tag name, de-duplicated: `['LI']` and nothing else.
      childTags: [...new Set([...list.children].map((child) => child.tagName))],
      insertionPointsInsideList: list.querySelectorAll(
        'button[aria-label^="Add stage here"]',
      ).length,
      insertionPointsOutsideAnItem: [
        ...list.querySelectorAll('button[aria-label^="Add stage here"]'),
      ].filter((button) => button.parentElement?.tagName !== 'LI').length,
      addControlIsInsideList: list.contains(addControl),
    };
  });

  expect(structure.childTags).toEqual(['LI']);
  // The insertion points are still there, still one per stage, each inside the
  // item for the stage it sits above — reachable, not merely removed.
  expect(structure.insertionPointsInsideList).toBe(protocol.stages.length);
  expect(structure.insertionPointsOutsideAnItem).toBe(0);
  expect(structure.addControlIsInsideList).toBe(false);

  // Everything above reads the DOM, which is exactly why the real defect got
  // through it: a `<ul>` can be a perfect tree of `<li>`s and still reach a
  // screen reader as no list at all. Tailwind's preflight sets
  // `list-style: none`, and WebKit drops the `list` role from an unstyled
  // list — so on Safari/VoiceOver there was no "list, N items" and no list
  // navigation, and `aria-label="Protocol stages"` had no list role to attach
  // to. Chromium keeps the role regardless, so only an accessibility-tree
  // assertion can see the difference. `getByRole` resolves against the
  // accessibility tree, not the tag.
  const list = architectPage.getByRole('list', { name: 'Protocol stages' });
  await expect(list).toHaveCount(1);
  await expect(list.getByRole('listitem')).toHaveCount(protocol.stages.length);
});

test('keeps the timeline tab order insertion-point-then-stage', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const [first, second] = protocol.stages;
  if (!first || !second) throw new Error('fixture needs two stages');
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  // Grouping each insertion point into the list item below it moved elements in
  // the DOM tree. Tab order is what a researcher actually learned, so it is
  // asserted directly: the point that inserts before a stage comes immediately
  // before that stage's own controls, for every stage.
  await tabUntilFocused(architectPage, timeline.insertButtons().first());
  for (const label of [first.label, second.label]) {
    await architectPage.keyboard.press('Tab');
    await expect(timeline.openControl(label)).toBeFocused();
    await architectPage.keyboard.press('Tab');
    await expect(timeline.deleteControl(label)).toBeFocused();
    await architectPage.keyboard.press('Tab');
  }
  // Landed on the insertion point above the third stage, having passed nothing
  // else in between.
  await expect(timeline.insertButtons().nth(2)).toBeFocused();
});

test('reorders stages by dragging the preview and commits one moveStage', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const [first, , third] = before;
  if (!first || !third) throw new Error('fixture must have at least 3 stages');
  const timeline = new Timeline(architectPage);
  await timeline.dragStageFromPreview(first.label, third.label);

  await expect
    .poll(async () => stagesOf(await readProtocolJson(architectPage))[0]?.id)
    .not.toBe(first.id);

  // Starting a drag on the preview focuses its native button. Once the pointer
  // leaves the dropped row, that retained focus must not keep Delete revealed.
  await architectPage.mouse.move(0, 0);
  await expect(timeline.deleteControl(first.label)).toHaveCSS('opacity', '0');
});

test('reorders stages by dragging the stage text', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const [first, , third] = before;
  if (!first || !third) throw new Error('fixture must have at least 3 stages');

  const timeline = new Timeline(architectPage);
  await timeline.dragStageFromText(first.label, third.label);

  await expect
    .poll(async () => stagesOf(await readProtocolJson(architectPage))[0]?.id)
    .not.toBe(first.id);
});

test('inserts a new Information stage at the clicked index', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
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
  // validator requires a non-empty `items` array — both are validated on
  // submit, so a save that actually commits needs both filled.
  await architectPage
    .getByRole('textbox', { name: 'Page heading' })
    .fill('Inserted stage heading');
  await architectPage
    .getByRole('button', { name: 'Create new content item' })
    .click();
  await architectPage.getByRole('radio', { name: 'Text' }).click();
  const contentField = architectPage.getByRole('textbox', {
    name: 'Content',
  });
  await contentField.click();
  // Real keystrokes (not `.fill()`) so Tiptap/ProseMirror's own input
  // handling — which `.fill()`'s direct DOM write bypasses — registers the
  // change into the form store.
  await contentField.pressSequentially('Minimal content.');
  // `exact` to avoid matching the RichTextEditor toolbar's "Add link" button.
  await architectPage.getByRole('button', { name: 'Add', exact: true }).click();

  const toolbar = new Toolbar(architectPage);
  await toolbar.button('finished-editing').click();
  await architectPage.waitForURL(/\/protocol$/);

  await expect
    .poll(async () => stagesOf(await readProtocolJson(architectPage)).length)
    .toBe(before.length + 1);

  const after = stagesOf(await readProtocolJson(architectPage));
  expect(after[insertIndex]).toMatchObject({
    type: 'Information',
    label: 'Inserted Info Stage',
  });
  // The stage previously at `insertIndex` shifted down by one rather than
  // being replaced.
  const displaced = before[insertIndex];
  if (!displaced) throw new Error('insertIndex out of range in fixture');
  expect(after[insertIndex + 1]?.id).toBe(displaced.id);
});

test('blocks deleting a FamilyPedigree stage referenced by NarrativePedigree', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const familyPedigree = before.find(
    (stage) => stage.type === 'FamilyPedigree',
  );
  if (!familyPedigree) {
    throw new Error('fixture is missing a FamilyPedigree stage');
  }

  const timeline = new Timeline(architectPage);
  await timeline.deleteStage('Family Pedigree');
  // Guard shows an acknowledge dialog, not the destructive confirm. All of
  // fresco-ui's `useDialog` dialogs (and NewStageScreen's inline `Dialog`)
  // share one `Dialog` component built on a plain (non-alert) Base UI
  // `Dialog.Root`, so the accessible role is `dialog`, not `alertdialog`.
  const guardDialog = architectPage.getByRole('dialog', {
    name: 'Cannot delete stage',
  });

  await acknowledgeRefusal(guardDialog);
  // Then commit an edit of our own and wait for THAT to reach IndexedDB, so an
  // erroneously-accepted delete has provably landed by the read below rather
  // than merely having been given time to (see `settleAfterRefusal`).
  await settleAfterRefusal(architectPage, editDescription(architectPage));
  const after = stagesOf(await readProtocolJson(architectPage));
  expect(after.some((stage) => stage.id === familyPedigree.id)).toBe(true);
  expect(after.length).toBe(before.length);
});

test('deletes a leaf stage after confirming the destructive dialog', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const target = before.find((stage) => stage.label === 'Information');
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
    .poll(async () =>
      stagesOf(await readProtocolJson(architectPage)).some(
        (stage) => stage.id === target.id,
      ),
    )
    .toBe(false);
});

/**
 * #1400: the dialog said "This action cannot be undone!" about a deletion the
 * toolbar's Undo reverses — `stages/deleteStage` is inside the protocol
 * timeline (`ducks/modules/root.ts`). The claim and the click are asserted
 * together on purpose: pinning the sentence alone would keep passing if the
 * action ever left the timeline and made the new sentence the false one.
 *
 * E2E rather than a component test because the promise is about the real
 * toolbar control, on the real store, persisted to IndexedDB — the stage has
 * to come back where the researcher would look for it.
 */
test('restores a deleted stage through Undo, as its dialog promises', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const target = before.find((stage) => stage.label === 'Information');
  if (!target) throw new Error('fixture is missing an "Information" stage');

  const timeline = new Timeline(architectPage);
  await timeline.deleteStage('Information');

  const dialog = architectPage.getByRole('dialog', { name: 'Delete stage' });
  await expect(dialog).toContainText(
    'You can restore it with Undo while this protocol remains open.',
  );
  await expect(dialog).not.toContainText('cannot be undone');
  await dialog.getByRole('button', { name: 'Delete stage' }).click();

  await expect
    .poll(async () =>
      stagesOf(await readProtocolJson(architectPage)).some(
        (stage) => stage.id === target.id,
      ),
    )
    .toBe(false);

  await new Toolbar(architectPage).undo();

  await expect
    .poll(async () =>
      stagesOf(await readProtocolJson(architectPage)).map((stage) => stage.id),
    )
    .toEqual(before.map((stage) => stage.id));
  await expect(timeline.stageCard('Information')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Keyboard operability (#1388)
// ---------------------------------------------------------------------------

/**
 * Presses Tab until `target` holds focus, and fails if it never does. Real Tab
 * presses, not `locator.focus()`: the defect these guard against is an element
 * that is not in the tab order at all — and `:focus-visible`, which the
 * timeline's reveal-on-focus styling keys off, only matches after a genuine
 * keyboard interaction.
 */
async function tabUntilFocused(
  page: Page,
  target: Locator,
  limit = 40,
): Promise<void> {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press('Tab');
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  throw new Error(
    `Tab never reached the expected control within ${limit} stops`,
  );
}

test('an empty protocol can gain its first stage from the keyboard', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed({ ...protocol, stages: [] }, { name: 'Empty', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  // The trailing add control used to be a `motion.div` with an onClick: visible,
  // clickable, and completely absent from the tab order, which left a protocol
  // with no stages unreachable by keyboard.
  await tabUntilFocused(architectPage, timeline.addNewStageButton());
  await architectPage.keyboard.press('Enter');

  await expect(
    architectPage.getByRole('dialog', { name: 'Select an Interface Type' }),
  ).toBeVisible();

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

  await architectPage.waitForURL(
    /\/protocol\/stage\/new\?type=Information&insertAtIndex=0$/,
  );
});

test('opens a stage with Enter and with Space', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  const [first] = stagesOf(await readProtocolJson(architectPage));
  if (!first) throw new Error('fixture has no stages');

  await timeline.openControl(first.label).press('Enter');
  await architectPage.waitForURL(new RegExp(`/protocol/stage/${first.id}$`));

  await gotoProtocol(architectPage);
  // Space specifically: it is the activation a native <button> gives free and
  // the `<li tabIndex={0}>` this replaced never had.
  await timeline.openControl(first.label).press('Space');
  await architectPage.waitForURL(new RegExp(`/protocol/stage/${first.id}$`));
});

test('still opens a stage from the keyboard after a pointer drag', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const [first, , third] = before;
  if (!first || !third) throw new Error('fixture must have at least 3 stages');

  const timeline = new Timeline(architectPage);
  await timeline.dragStage(first.label, third.label);
  await expect
    .poll(async () => stagesOf(await readProtocolJson(architectPage))[0]?.id)
    .not.toBe(first.id);

  // The drag flag that suppresses "a drag that ended where it started" must not
  // also suppress a later keyboard activation, which carries no pointer
  // coordinates and no fresh pointerdown to reset it.
  await timeline.openControl(first.label).press('Enter');
  await architectPage.waitForURL(new RegExp(`/protocol/stage/${first.id}$`));
});

test('reorders stages with the arrow keys, announcing where the stage landed', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);
  await recordAnnouncements(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const [first, second] = before;
  if (!first || !second) throw new Error('fixture must have at least 2 stages');

  const timeline = new Timeline(architectPage);
  const openControl = timeline.openControl(first.label);
  await openControl.focus();
  await openControl.press('ArrowDown');

  await expect
    .poll(async () =>
      stagesOf(await readProtocolJson(architectPage)).map((stage) => stage.id),
    )
    .toEqual([second.id, first.id, ...before.slice(2).map((s) => s.id)]);

  await expect
    .poll(() => readAnnouncements(architectPage))
    .toContain(`Moved stage 1 to position 2 of ${before.length}.`);

  // Focus follows the stage, so a second press keeps moving the same stage
  // instead of stranding the researcher on <body>.
  await expect(timeline.openControl(first.label)).toBeFocused();
});

test('blocks a keyboard reorder that would strand a skip destination', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const [source, destination] = protocol.stages;
  if (!source || !destination) throw new Error('fixture needs two stages');
  source.skipLogic = {
    action: 'SKIP',
    filter: anyNodeOfFirstType(protocol),
    destination: { type: 'stage', stageId: destination.id },
  };

  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);
  await recordAnnouncements(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const timeline = new Timeline(architectPage);
  const openControl = timeline.openControl(destination.label);
  await openControl.focus();
  await openControl.press('ArrowUp');

  const guardDialog = architectPage.getByRole('dialog', {
    name: 'Cannot move stage',
  });

  await acknowledgeRefusal(guardDialog);
  // Focus first: dismissing the dialog is what has to return focus to the open
  // control, and the settle below deliberately moves focus into the
  // description field to make its edit.
  await expect(openControl).toBeFocused();
  // Sampled twice, either side of a real round-trip. The regression this
  // guards is a LATE focus claim — the reorder handle used to take focus on
  // the NEXT index change from any cause, arriving a frame or more after the
  // interaction that caused it — and `toBeFocused` stops retrying the moment
  // it first passes, so one sample taken immediately cannot see one land. The
  // store read is the wait, rather than a timeout: it is real work with a real
  // answer, so it cannot pass by being slow.
  await readProtocolJson(architectPage);
  await expect(openControl).toBeFocused();

  // Then commit an edit of our own and wait for THAT to reach IndexedDB, so an
  // erroneously-accepted move has provably landed by the read below rather
  // than merely having been given time to (see `settleAfterRefusal`).
  await settleAfterRefusal(architectPage, editDescription(architectPage));
  expect(
    stagesOf(await readProtocolJson(architectPage)).map((stage) => stage.id),
  ).toEqual(before.map((stage) => stage.id));
  // The dialog carries the reason, so nothing at all is announced — not merely
  // "not the announcement a successful move would have made".
  expect(
    (await readAnnouncements(architectPage)).filter((message) =>
      message.startsWith('Moved stage'),
    ),
  ).toEqual([]);
});

test('reveals the delete control when it takes focus', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  const [first] = stagesOf(await readProtocolJson(architectPage));
  if (!first) throw new Error('fixture has no stages');

  // `toBeVisible()` would pass here against the unfixed build: Playwright
  // considers only the bounding box and `visibility`, and these controls are
  // `opacity: 0` at full layout size. Opacity is the whole defect, so opacity
  // is what gets asserted.
  const deleteControl = timeline.deleteControl(first.label);
  await expect(deleteControl).toHaveCSS('opacity', '0');

  await deleteControl.focus();
  await expect(deleteControl).toHaveCSS('opacity', '1');
});

test('reveals a focused insertion point', async ({ architectPage, seed }) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  const insertButton = timeline.insertButtons().first();
  const insertLabel = insertButton.getByText('Add stage here');
  await expect(insertLabel).toHaveCSS('opacity', '0');

  await tabUntilFocused(architectPage, insertButton);
  await expect(insertLabel).toHaveCSS('opacity', '1');
});

test('returns focus to the insertion point that opened the interface selector', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  const insertButton = timeline.insertButtons().nth(1);
  await insertButton.focus();
  await insertButton.press('Enter');

  const selector = architectPage.getByRole('dialog', {
    name: 'Select an Interface Type',
  });
  await expect(selector).toBeVisible();
  await architectPage.keyboard.press('Escape');
  await expect(selector).toBeHidden();

  await expect(insertButton).toBeFocused();
});

test('hands focus to a surviving stage after a delete, and says what happened', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);
  await recordAnnouncements(architectPage);

  const before = stagesOf(await readProtocolJson(architectPage));
  const target = before.find((stage) => stage.label === 'Information');
  if (!target) throw new Error('fixture is missing an "Information" stage');
  const deletedPosition = before.indexOf(target) + 1;
  const successor = before[deletedPosition];
  if (!successor) throw new Error('"Information" must not be the last stage');

  const timeline = new Timeline(architectPage);
  const deleteControl = timeline.deleteControl(target.label);
  await deleteControl.focus();
  await deleteControl.press('Enter');

  await architectPage
    .getByRole('dialog', { name: 'Delete stage' })
    .getByRole('button', { name: 'Delete stage' })
    .click();

  await expect
    .poll(async () =>
      stagesOf(await readProtocolJson(architectPage)).some(
        (stage) => stage.id === target.id,
      ),
    )
    .toBe(false);

  // Without an explicit answer for the confirm branch, focus lands on <body>:
  // the control that opened the dialog is destroyed by the action it confirmed.
  // Located by the successor's own accessible name rather than through
  // `openControl`, whose row filter matches by heading text — and this
  // fixture's "Name Generator" is a prefix of two other stage labels.
  await expect(
    // The trailing comma is load-bearing: the control's name continues with the
    // interface's own title, and this fixture's "Name Generator" is a prefix of
    // two other stage labels.
    architectPage.getByRole('button', {
      name: `Edit stage ${deletedPosition}: ${successor.label},`,
    }),
  ).toBeFocused();
  await expect
    .poll(() => readAnnouncements(architectPage))
    .toContain(
      `Deleted stage ${deletedPosition}. ${before.length - 1} stages remain.`,
    );
});

test('returns focus to the delete control when the confirm is cancelled', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  const [first] = stagesOf(await readProtocolJson(architectPage));
  if (!first) throw new Error('fixture has no stages');

  const deleteControl = timeline.deleteControl(first.label);
  await deleteControl.focus();
  await deleteControl.press('Enter');

  const confirmDialog = architectPage.getByRole('dialog', {
    name: 'Delete stage',
  });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmDialog).toBeHidden();

  await expect(deleteControl).toBeFocused();
});

test('falls back to the add control when the last stage is deleted', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const [only] = protocol.stages;
  if (!only) throw new Error('fixture has no stages');
  await seed({ ...protocol, stages: [only] }, { name: 'Single stage', assets });
  await gotoProtocol(architectPage);
  await recordAnnouncements(architectPage);

  const timeline = new Timeline(architectPage);
  const deleteControl = timeline.deleteControl(only.label);
  await deleteControl.focus();
  await deleteControl.press('Enter');
  await architectPage
    .getByRole('dialog', { name: 'Delete stage' })
    .getByRole('button', { name: 'Delete stage' })
    .click();

  await expect(timeline.rows()).toHaveCount(0);
  // No neighbouring stage survives, so the list's own add control is the only
  // place left to put focus.
  await expect(timeline.addNewStageButton()).toBeFocused();
  await expect
    .poll(() => readAnnouncements(architectPage))
    .toContain('Deleted stage 1. No stages remain.');
});
