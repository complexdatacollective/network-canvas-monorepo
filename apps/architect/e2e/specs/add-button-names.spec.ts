import { type Locator, type Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';

/**
 * #1391's second half. Every list in a stage editor carries one button that
 * appends to it, and for a long time most of them were called "Add new" — so a
 * Categorical Bin prompt editor offered three identically-named controls and a
 * roster stage offered three more, with nothing but visual position to tell
 * them apart. To anyone navigating by a list of buttons (a screen reader's
 * elements list, a voice-control "click Add new") they were one control.
 *
 * The fix is one distinct name per list; this is the assertion that keeps it
 * that way, because nothing else in the suite would notice a new call site
 * reusing an existing name.
 *
 * SCOPE — list add buttons, not every button. The wider net of EVERY button,
 * page-wide, was measured against the all-interfaces fixture and rejected:
 * per-row controls repeat by design. A five-prompt list renders five "Edit
 * prompt" and five "Remove prompt" buttons, each named for what it does and
 * disambiguated by the row it sits in. So does every drag handle. That net
 * would fire on all of them and have to be suppressed back down to roughly
 * the set below.
 *
 * The line is therefore the convention every add button in Architect follows —
 * "Add new …"/"Create new …" — which is what makes a one-per-list control
 * identifiable without an allowlist. Two things follow from drawing it there.
 *
 * The rule builders were brought INSIDE it. `RuleSetFields` mounts
 * `Query/Rules/Rules.tsx` twice per stage editor, once for Skip Logic and once
 * for Filter, and both used to hard-code "Add alter rule"/"Add edge rule" — a
 * real duplicate of exactly this class in ten interfaces, and one this guard
 * could not see, because those names sit outside the convention. Each rule set
 * now names its own buttons ("Add new skip logic alter rule",
 * "Add new filter alter rule", …), so they are covered here with no widening
 * and no allowlist. The ego button was renamed along with them although it
 * never duplicated: it is the third button of the same group, and leaving it
 * as "Add ego rule" would have left one control of the three outside both the
 * convention and this guard.
 *
 * What stays outside is `RichTextEditor.tsx`'s "Add link" — a toolbar button,
 * one per editor, belonging to the editor it sits in exactly as a row's Edit
 * button belongs to its row. A stage with two rich-text fields legitimately
 * has two, which is why the regex requires the word "new" rather than
 * carrying an exclusion for it.
 *
 * A control that appends to a list and is named outside the convention is a
 * naming bug in its own right; this guard does not try to detect it.
 *
 * No `@visual` tag: this reads the accessibility tree, not pixels.
 *
 * ONE TEST PER STAGE TYPE, not one test for all of them. As a single test the
 * work — 19 editors, every collapsed section in each expanded, one
 * representative row-editor dialog opened per list — took 35s of the 60s
 * budget on a developer machine, and on a CI runner it spent the whole 60s
 * getting partway into the fourteenth editor, which had taken 26s here: about
 * 2.3× slower, deterministically over budget, and it failed that way on the
 * first run and both retries. Raising the timeout would only move the cliff to
 * whatever the twentieth editor costs, and the walk is not doing anything it
 * can skip — every editor and every one of its row-editor dialogs is the
 * coverage. Split, the slowest editor is 2.8s of its own 60s, and a failure
 * names the editor in the test title rather than in a list at the end.
 *
 * Coverage is by construction: the tests are generated from the fixture's
 * stages, so a stage type added to `all-interfaces` gets a test with no edit
 * here. (`packages/protocol-validation/src/__tests__/all-interfaces-fixture.test.ts`
 * is what stops that fixture quietly losing a type.)
 */
const ADD_BUTTON = /^(Add|Create) new\b/;

/**
 * A line of `ariaSnapshot` YAML: `- button "Create new prompt"`, sometimes
 * with a trailing state (`[disabled]`) or children. Names are emitted with
 * `"` escaped as `\"`.
 */
const BUTTON_LINE = /^\s*-\s*button\s+"((?:[^"\\]|\\.)*)"/;

/**
 * The accessibility tree, deliberately — not `getByRole('button')` over the
 * DOM. What is being asserted is what assistive technology is handed, so an
 * `aria-hidden` subtree or an inert background (fresco-ui's `Modal` marks
 * everything outside an open dialog inert) must not contribute names, and the
 * accessible name has to be the computed one rather than an attribute read.
 */
async function addButtonNames(scope: Locator): Promise<string[]> {
  const snapshot = await scope.ariaSnapshot();
  return snapshot
    .split('\n')
    .map((line) => BUTTON_LINE.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
    .map((name) => name.replaceAll(String.raw`\"`, '"'))
    .filter((name) => ADD_BUTTON.test(name));
}

/** Sorted so a failure reads as a set, not in tree order. */
function duplicated(names: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) repeated.add(name);
    seen.add(name);
  }
  return [...repeated].toSorted();
}

/**
 * A toggleable `Section` renders its own switch, named by the section heading
 * (`Section.tsx` labels it `aria-labelledby` the heading, so its accessible
 * name equals the `data-name` the section stamps). Collapsed sections keep
 * their children unmounted, so their add buttons are invisible to the tree —
 * and the bin/bucket sort-order lists, which are half of the collisions this
 * guards, are collapsed until configured.
 *
 * Turning one ON writes nothing to the form (every `handleToggleChange` in
 * these sections only clears on the way OFF), so the draft stays pristine and
 * the next navigation is not intercepted.
 *
 * Re-queried between passes: expanding a section can reveal another one.
 */
async function expandCollapsedSections(scope: Locator): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    let expandedAny = false;
    const sections = await scope.locator('[data-name]').all();
    for (const section of sections) {
      const name = await section.getAttribute('data-name');
      if (!name) continue;
      const toggle = section.getByRole('switch', { name, exact: true }).first();
      if ((await toggle.count()) === 0) continue;
      if (await toggle.isDisabled()) continue;
      if ((await toggle.getAttribute('aria-checked')) === 'true') continue;
      await toggle.click();
      expandedAny = true;
    }
    if (!expandedAny) return;
  }
}

/**
 * The stage editor itself, and then each list's row editor: the row editors
 * are their own surfaces, and three of the four known collisions only ever
 * appeared inside one. `DialogItem` names each row's edit trigger
 * `Edit ${itemLabel}`, one distinct label per list, so the first button of
 * each distinct name opens one representative dialog per list without walking
 * every row.
 */
async function duplicateAddButtons(page: Page): Promise<string[]> {
  const failures: string[] = [];
  const body = page.locator('body');

  await expandCollapsedSections(body);
  for (const name of duplicated(await addButtonNames(body))) {
    failures.push(`stage editor: ${name}`);
  }

  const editTriggers = await page.getByRole('button', { name: /^Edit / }).all();
  const openedLabels = new Set<string>();

  for (const trigger of editTriggers) {
    const label = await trigger.getAttribute('aria-label');
    if (!label || openedLabels.has(label)) continue;
    openedLabels.add(label);

    await trigger.click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();

    await expandCollapsedSections(dialog);

    for (const name of duplicated(await addButtonNames(dialog))) {
      failures.push(`"${label}" editor: ${name}`);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  return failures;
}

const { protocol, assets } = loadAllInterfacesFixture();

for (const stage of protocol.stages) {
  test(`the ${stage.type} editor offers no two identically-named add buttons`, async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocol, { name: 'All Interfaces', assets });
    await gotoProtocol(page);

    await page.goto(`/protocol/stage/${stage.id}`);
    await expect(
      page.getByRole('textbox', { name: 'Stage name' }),
    ).toBeVisible();

    expect((await duplicateAddButtons(page)).toSorted()).toEqual([]);
  });
}
