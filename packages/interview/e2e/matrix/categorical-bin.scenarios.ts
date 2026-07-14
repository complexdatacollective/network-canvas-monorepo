import type { Locator, Page } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

/**
 * Keyboard-drag a node onto a drop target the CategoricalBinFixture cannot
 * express: the "Other" bin (whose drop opens a follow-up dialog before writing,
 * so the fixture's post-conditions never hold) and one specific bin of two that
 * share a label (both announce identically).
 *
 * Reads the DnD live-region announcement to know when the current drop target
 * matches. Dialog-interrupted drops leave STALE, frozen announcement regions in
 * the DOM, and a sequence of drags accumulates several — so this matches only a
 * region whose text CHANGED since the previous arrow press (the live region
 * cycles targets every press; stale regions stay frozen). This is why the
 * shared fixture's navigateDndToTarget — which reads the first region — cannot
 * be reused for the multi-drop "Other" flow.
 */
async function keyboardDropNode(
  page: Page,
  node: Locator,
  matchAnnouncement: (announcement: string) => boolean,
  maxSteps = 30,
): Promise<void> {
  const readAll = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'body > div[role="status"][aria-live="polite"]',
        ),
      ].map((el) => el.textContent?.trim() ?? ''),
    );

  await expect(node).toBeVisible();
  // tabIndex is -1 (roving), so .focus() via evaluate rather than Playwright.
  await node.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus();
  });
  await node.press('Control+d');

  let previous = await readAll();
  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press('ArrowRight');
    const current = await readAll();
    for (let r = 0; r < current.length; r++) {
      const text = current[r] ?? '';
      const changed = r >= previous.length || text !== previous[r];
      if (changed && text.includes('Drop target') && matchAnnouncement(text)) {
        await page.keyboard.press('Enter');
        return;
      }
    }
    previous = current;
  }
  throw new Error('keyboardDropNode: drop target not found');
}

/** Accessible names (aria-label, falling back to text) in DOM order. */
async function ariaLabelsInOrder(locator: Locator): Promise<string[]> {
  return locator.evaluateAll((els) =>
    els.map(
      (el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
    ),
  );
}

export const categoricalBinScenarios: InterfaceScenarios = {
  interfaceType: 'CategoricalBin',
  scenarios: [
    ((): ScenarioDefinition => {
      let categoryVarId = '';
      let nameVarId = '';
      let placeTypeId = '';
      return {
        id: 'basic-bin-subject-and-label',
        covers: [
          'type',
          'id',
          'label',
          'interviewScript',
          'subject',
          'prompts[]',
          'prompts[].id',
          'prompts[].variable',
          'codebook:variable-options',
          'codebook:node-label-and-type',
          'drop-writes-single-value-array',
          'ready-for-next-pulse',
        ],
        smoke: true,
        visual: true,
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const personType = synth.addNodeType({ name: 'Person' });
          const placeType = synth.addNodeType({ name: 'Place' });
          const personName = personType.addVariable({
            name: 'name',
            type: 'text',
          });
          const categoryVar = personType.addVariable({
            name: 'Category',
            type: 'categorical',
            options: [
              { label: 'Family', value: 1 },
              { label: 'Work', value: 2 },
              { label: 'School', value: 3 },
            ],
          });
          nameVarId = personName.id;
          categoryVarId = categoryVar.id;
          placeTypeId = placeType.id;

          const stage = synth.addStage('CategoricalBin', {
            label: 'Categorise People',
            interviewScript: 'Author note, never shown',
            subject: { entity: 'node', type: personType.id },
            initialNodes: { count: 3 },
          });
          stage.addPrompt({ variable: categoryVar.id });

          // Seed every attribute explicitly: seedNetwork installs the initial
          // nodes, but unset attributes on non-manual nodes are filled with
          // random synthetic values — an empty categorical array keeps each
          // node uncategorised (drawer) until dragged.
          synth.setNodeAttribute(0, personName.id, 'Alice');
          synth.setNodeAttribute(0, categoryVar.id, []);
          synth.setNodeAttribute(1, personName.id, 'Bob');
          synth.setNodeAttribute(1, categoryVar.id, []);
          synth.setNodeAttribute(2, personName.id, 'Carol');
          synth.setNodeAttribute(2, categoryVar.id, []);

          // Two Place nodes: never subject-scoped into this stage; must stay
          // invisible to drawer/bins and carry no Category attribute.
          synth.addManualNode(stage.id, placeType.id, 'place-1', {});
          synth.addManualNode(stage.id, placeType.id, 'place-2', {});

          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          await expect(stage.categoricalBin.drawerToggle).toContainText(
            '3 unplaced',
          );

          // Dead config: label is menu-only, interviewScript never renders.
          await expect(page.getByText('Categorise People')).toHaveCount(0);
          await expect(page.getByText('Author note, never shown')).toHaveCount(
            0,
          );

          await stage.categoricalBin.dragNodeToBin('Alice', 'Family');
          await stage.categoricalBin.dragNodeToBin('Bob', 'Work');
          await stage.categoricalBin.dragNodeToBin('Carol', 'School');

          const state = await protocol.getNetworkState(interview.interviewId);
          const byName = (name: string) =>
            state!.nodes.find(
              (n) => n[entityAttributesProperty][nameVarId] === name,
            )!;

          // Drop writes a single-element array of the option value.
          expect(
            byName('Alice')[entityAttributesProperty][categoryVarId],
          ).toEqual([1]);
          expect(
            byName('Bob')[entityAttributesProperty][categoryVarId],
          ).toEqual([2]);
          expect(
            byName('Carol')[entityAttributesProperty][categoryVarId],
          ).toEqual([3]);

          // Place nodes stay outside the subject scope and never gain a
          // Category attribute.
          const placeNodes = state!.nodes.filter((n) => n.type === placeTypeId);
          expect(placeNodes).toHaveLength(2);
          for (const p of placeNodes) {
            expect(p[entityAttributesProperty][categoryVarId]).toBeUndefined();
          }

          await expect(stage.categoricalBin.drawerToggle).toContainText(
            '0 unplaced',
          );
          expect(await interview.nextButtonHasPulse()).toBe(true);
        },
      };
    })(),

    ((): ScenarioDefinition => {
      let varAId = '';
      let varBId = '';
      let nameVarId = '';
      return {
        id: 'multi-prompt-markdown-pips',
        covers: [
          'prompts[]',
          'prompts[].id',
          'prompts[].text',
          'prompts[].variable',
        ],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const personType = synth.addNodeType({ name: 'Person' });
          const personName = personType.addVariable({
            name: 'name',
            type: 'text',
          });
          const varA = personType.addVariable({
            name: 'CategoryA',
            type: 'categorical',
            options: [
              { label: '**Family**', value: 1 },
              { label: 'Work', value: 2 },
            ],
          });
          const varB = personType.addVariable({
            name: 'CategoryB',
            type: 'categorical',
            options: [
              { label: 'Yes', value: 1 },
              { label: 'No', value: 2 },
            ],
          });
          nameVarId = personName.id;
          varAId = varA.id;
          varBId = varB.id;

          const stage = synth.addStage('CategoricalBin', {
            label: 'Sort people',
            subject: { entity: 'node', type: personType.id },
            initialNodes: { count: 2 },
          });
          stage.addPrompt({ variable: varA.id, text: 'Sort **these** people' });
          stage.addPrompt({ variable: varB.id, text: 'Prompt two' });

          synth.setNodeAttribute(0, personName.id, 'Alice');
          synth.setNodeAttribute(0, varA.id, []);
          synth.setNodeAttribute(0, varB.id, []);
          synth.setNodeAttribute(1, personName.id, 'Bob');
          synth.setNodeAttribute(1, varA.id, []);
          synth.setNodeAttribute(1, varB.id, []);

          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          // Prompt text renders markdown emphasis.
          await expect(
            page.locator('[data-testid="prompt"] strong').first(),
          ).toHaveText('these');
          // Bin heading renders markdown from the option label.
          await expect(
            page.locator('.catbin-item strong').filter({ hasText: 'Family' }),
          ).toBeVisible();

          await stage.categoricalBin.dragNodeToBin('Alice', 'Work');
          await stage.categoricalBin.dragNodeToBin('Bob', 'Work');
          expect(await interview.nextButtonHasPulse()).toBe(true);

          await interview.nextButton.click();

          // Prompt 2 re-uncategorises the set (fresh variable) and resets
          // expansion.
          await expect(stage.categoricalBin.drawerToggle).toContainText(
            '2 unplaced',
          );
          await expect(page.locator('.catbin-expanded')).toHaveCount(0);

          await stage.categoricalBin.dragNodeToBin('Alice', 'Yes');
          await stage.categoricalBin.dragNodeToBin('Bob', 'Yes');

          const state = await protocol.getNetworkState(interview.interviewId);
          for (const name of ['Alice', 'Bob']) {
            const node = state!.nodes.find(
              (n) => n[entityAttributesProperty][nameVarId] === name,
            )!;
            const a = node[entityAttributesProperty][varAId];
            const b = node[entityAttributesProperty][varBId];
            expect(Array.isArray(a) && a.length === 1).toBe(true);
            expect(Array.isArray(b) && b.length === 1).toBe(true);
          }
        },
      };
    })(),

    ((): ScenarioDefinition => {
      let categoryVarId = '';
      let nameVarId = '';
      return {
        id: 're-bin-move-between-bins',
        covers: ['re-bin-replaces-value'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const personType = synth.addNodeType({ name: 'Person' });
          const personName = personType.addVariable({
            name: 'name',
            type: 'text',
          });
          const categoryVar = personType.addVariable({
            name: 'Category',
            type: 'categorical',
            options: [
              { label: 'Family', value: 1 },
              { label: 'Work', value: 2 },
            ],
          });
          nameVarId = personName.id;
          categoryVarId = categoryVar.id;

          const stage = synth.addStage('CategoricalBin', {
            label: 'Categorise',
            subject: { entity: 'node', type: personType.id },
            initialNodes: { count: 1 },
          });
          stage.addPrompt({ variable: categoryVar.id });

          synth.setNodeAttribute(0, personName.id, 'Alice');
          synth.setNodeAttribute(0, categoryVar.id, []);

          return synth;
        },
        run: async ({ interview, stage, protocol }) => {
          await stage.categoricalBin.dragNodeToBin('Alice', 'Work');

          let state = await protocol.getNetworkState(interview.interviewId);
          const alice = () =>
            state!.nodes.find(
              (n) => n[entityAttributesProperty][nameVarId] === 'Alice',
            )!;
          expect(alice()[entityAttributesProperty][categoryVarId]).toEqual([2]);

          await stage.categoricalBin.moveNodeBetweenBins(
            'Alice',
            'Work',
            'Family',
          );

          state = await protocol.getNetworkState(interview.interviewId);
          // Re-bin replaces the value rather than appending.
          expect(alice()[entityAttributesProperty][categoryVarId]).toEqual([1]);
          expect(await stage.categoricalBin.getNodeCountInBin('Work')).toBe(0);
          expect(await stage.categoricalBin.getNodeCountInBin('Family')).toBe(
            1,
          );
        },
      };
    })(),

    ((): ScenarioDefinition => {
      let categoryVarId = '';
      let otherVarId = '';
      let nameVarId = '';
      return {
        id: 'other-bin-full-flow',
        covers: [
          'prompts[].otherVariable',
          'prompts[].otherVariablePrompt',
          'prompts[].otherOptionLabel',
          'other-dialog-submit-writes-other-clears-variable',
          'other-dialog-cancel-noop',
          'regular-bin-drop-clears-other-variable',
        ],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const personType = synth.addNodeType({ name: 'Person' });
          const personName = personType.addVariable({
            name: 'name',
            type: 'text',
          });
          const categoryVar = personType.addVariable({
            name: 'Category',
            type: 'categorical',
            options: [
              { label: 'Family', value: 1 },
              { label: 'Work', value: 2 },
            ],
          });
          const otherReason = personType.addVariable({
            name: 'otherReason',
            type: 'text',
          });
          nameVarId = personName.id;
          categoryVarId = categoryVar.id;
          otherVarId = otherReason.id;

          const stage = synth.addStage('CategoricalBin', {
            label: 'Categorise',
            subject: { entity: 'node', type: personType.id },
            initialNodes: { count: 3 },
          });
          stage.addPrompt({
            variable: categoryVar.id,
            otherVariable: otherReason.id,
            otherVariablePrompt: 'Please specify:',
            otherOptionLabel: 'Other',
          });

          synth.setNodeAttribute(0, personName.id, 'Alice');
          synth.setNodeAttribute(0, categoryVar.id, []);
          synth.setNodeAttribute(0, otherReason.id, null);
          synth.setNodeAttribute(1, personName.id, 'Bob');
          synth.setNodeAttribute(1, categoryVar.id, []);
          synth.setNodeAttribute(1, otherReason.id, null);
          synth.setNodeAttribute(2, personName.id, 'Carol');
          synth.setNodeAttribute(2, categoryVar.id, []);
          // Carol starts in the Other bin so the "move to a regular bin clears
          // otherVariable" assertion needs no prior dialog.
          synth.setNodeAttribute(2, otherReason.id, 'Pre-seeded other reason');

          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          const isOtherBin = (a: string) => a.includes('Category: Other');
          const readNode = async (name: string) => {
            const state = await protocol.getNetworkState(interview.interviewId);
            return state!.nodes.find(
              (n) => n[entityAttributesProperty][nameVarId] === name,
            )!;
          };

          // Initially Alice + Bob in the drawer; Carol already in Other.
          await expect(stage.categoricalBin.drawerToggle).toContainText(
            '2 unplaced',
          );
          expect(await stage.categoricalBin.getNodeCountInBin('Other')).toBe(1);

          // --- Submit flow: Alice into Other, fill the dialog, submit.
          await keyboardDropNode(
            page,
            stage.categoricalBin.getNodeInDrawer('Alice'),
            isOtherBin,
          );
          const dialog = page.getByRole('dialog');
          await expect(dialog.getByText('Please specify:')).toBeVisible();
          await dialog.getByRole('textbox').fill('Gym buddy');
          await page.getByTestId('dialog-submit').click();
          await expect(dialog).not.toBeVisible();

          const alice = await readNode('Alice');
          expect(alice[entityAttributesProperty][otherVarId]).toBe('Gym buddy');
          // Category was cleared (null) when the Other value was written.
          expect(
            alice[entityAttributesProperty][categoryVarId] ?? null,
          ).toBeNull();
          await expect(
            stage.categoricalBin.getNodeInDrawer('Alice'),
          ).toHaveCount(0);
          await expect
            .poll(() => stage.categoricalBin.getNodeCountInBin('Other'))
            .toBe(2);

          // --- Cancel flow: Bob into Other, cancel the dialog, no-op.
          await keyboardDropNode(
            page,
            stage.categoricalBin.getNodeInDrawer('Bob'),
            isOtherBin,
          );
          const cancelDialog = page.getByRole('dialog');
          await expect(cancelDialog).toBeVisible();
          await page.getByTestId('dialog-cancel').click();
          await expect(cancelDialog).not.toBeVisible();

          const bob = await readNode('Bob');
          expect(bob[entityAttributesProperty][otherVarId] ?? null).toBeNull();
          await expect(
            stage.categoricalBin.getNodeInDrawer('Bob'),
          ).toBeVisible();
          expect(await stage.categoricalBin.getNodeCountInBin('Other')).toBe(2);

          // --- Regular-bin drop clears otherVariable: move Carol out of Other.
          // Done manually (not via moveNodeBetweenBins) because that fixture
          // reads the first DnD live region, which is stale after the two
          // dialog drops above.
          await stage.categoricalBin.expandBin('Other');
          await keyboardDropNode(
            page,
            stage.categoricalBin.getNodeInBin('Carol', 'Other'),
            (a) => a.includes('Category: Family'),
          );
          await stage.categoricalBin.collapseBin('Other');
          const carol = await readNode('Carol');
          expect(
            carol[entityAttributesProperty][otherVarId] ?? null,
          ).toBeNull();
          expect(carol[entityAttributesProperty][categoryVarId]).toEqual([1]);
          expect(await stage.categoricalBin.getNodeCountInBin('Other')).toBe(1);
        },
      };
    })(),

    {
      id: 'other-option-label-dead-config',
      covers: ['other-option-label-without-other-variable-dead-config'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const personName = personType.addVariable({
          name: 'name',
          type: 'text',
        });
        const categoryVar = personType.addVariable({
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Family', value: 1 },
            { label: 'Work', value: 2 },
          ],
        });
        const stage = synth.addStage('CategoricalBin', {
          label: 'Categorise',
          subject: { entity: 'node', type: personType.id },
          initialNodes: { count: 2 },
        });
        stage.addPrompt({
          variable: categoryVar.id,
          otherOptionLabel: 'Other',
          // otherVariable intentionally omitted: useCategoricalBins only pushes
          // an Other bin when BOTH otherVariable AND otherOptionLabel are set,
          // so otherOptionLabel alone is a silent no-op.
        });

        synth.setNodeAttribute(0, personName.id, 'Alice');
        synth.setNodeAttribute(0, categoryVar.id, []);
        synth.setNodeAttribute(1, personName.id, 'Bob');
        synth.setNodeAttribute(1, categoryVar.id, []);

        return synth;
      },
      run: async ({ page, stage }) => {
        // No Other bin renders.
        await expect(
          page.getByRole('button', { name: /^Category Other/ }),
        ).toHaveCount(0);
        // Bin count matches the codebook's 2 options, not 3.
        await expect(page.locator('.catbin-item')).toHaveCount(2);
        // otherOptionLabel alone provides no way to categorise: both nodes
        // remain uncategorised in the drawer.
        await expect(stage.categoricalBin.drawerToggle).toContainText(
          '2 unplaced',
        );
      },
    },

    {
      id: 'bucket-sort-order-drawer',
      covers: ['prompts[].bucketSortOrder', 'prompts[].bucketSortOrder=*'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const personName = personType.addVariable({
          name: 'name',
          type: 'text',
        });
        const categoryVar = personType.addVariable({
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Family', value: 1 },
            { label: 'Work', value: 2 },
          ],
        });

        const stage = synth.addStage('CategoricalBin', {
          label: 'Categorise',
          subject: { entity: 'node', type: personType.id },
          initialNodes: { count: 3 },
        });
        // Two prompts on the SAME variable: prompt 1 sorts the drawer by name
        // ascending; prompt 2 by creation order (magic '*') descending.
        stage.addPrompt({
          variable: categoryVar.id,
          bucketSortOrder: [{ property: personName.id, direction: 'asc' }],
        });
        stage.addPrompt({
          variable: categoryVar.id,
          bucketSortOrder: [{ property: '*', direction: 'desc' }],
        });

        // Creation order: Carol(0), Alice(1), Bob(2).
        synth.setNodeAttribute(0, personName.id, 'Carol');
        synth.setNodeAttribute(0, categoryVar.id, []);
        synth.setNodeAttribute(1, personName.id, 'Alice');
        synth.setNodeAttribute(1, categoryVar.id, []);
        synth.setNodeAttribute(2, personName.id, 'Bob');
        synth.setNodeAttribute(2, categoryVar.id, []);

        return synth;
      },
      run: async ({ page, interview }) => {
        const drawerNodes = page
          .locator('main')
          .getByRole('button', { name: /^(Alice|Bob|Carol)$/ });
        await expect(drawerNodes).toHaveCount(3);

        // Prompt 1: name ascending.
        expect(await ariaLabelsInOrder(drawerNodes)).toEqual([
          'Alice',
          'Bob',
          'Carol',
        ]);

        await interview.nextButton.click();

        // Prompt 2: '*' + desc => reverse creation order (Carol,Alice,Bob) ->
        // Bob, Alice, Carol. (Pins observed behaviour; the plan's draft order
        // "Carol, Bob, Alice" does not match createSorter's _createdIndex.)
        await expect
          .poll(async () => (await ariaLabelsInOrder(drawerNodes)).join(','))
          .toBe('Bob,Alice,Carol');
      },
    },

    {
      id: 'bin-sort-order-within-bin',
      covers: ['prompts[].binSortOrder'],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const personName = personType.addVariable({
          name: 'name',
          type: 'text',
        });
        const categoryVar = personType.addVariable({
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Family', value: 1 },
            { label: 'Work', value: 2 },
          ],
        });

        const stage = synth.addStage('CategoricalBin', {
          label: 'Categorise',
          subject: { entity: 'node', type: personType.id },
          initialNodes: { count: 3 },
        });
        stage.addPrompt({
          variable: categoryVar.id,
          binSortOrder: [{ property: personName.id, direction: 'asc' }],
        });

        // All three pre-binned into Family (value 1).
        synth.setNodeAttribute(0, personName.id, 'Zed');
        synth.setNodeAttribute(0, categoryVar.id, [1]);
        synth.setNodeAttribute(1, personName.id, 'Amy');
        synth.setNodeAttribute(1, categoryVar.id, [1]);
        synth.setNodeAttribute(2, personName.id, 'Mia');
        synth.setNodeAttribute(2, categoryVar.id, [1]);

        return synth;
      },
      run: async ({ page, stage }) => {
        // The collapsed summary names the first sorted node (Amy), not the
        // first-created (Zed).
        await expect(page.locator('.catbin-summary')).toContainText(
          'Amy and 2 others',
        );

        await stage.categoricalBin.expandBin('Family');

        const options = page.locator('.catbin-expanded').getByRole('option');
        await expect(options).toHaveCount(3);
        expect(await ariaLabelsInOrder(options)).toEqual(['Amy', 'Mia', 'Zed']);
      },
    },

    ((): ScenarioDefinition => {
      let categoryVarId = '';
      let nameVarId = '';
      return {
        id: 'multi-value-and-empty-array-membership',
        covers: ['multi-value-membership', 'empty-array-treated-as-unset'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const personType = synth.addNodeType({ name: 'Person' });
          const personName = personType.addVariable({
            name: 'name',
            type: 'text',
          });
          const categoryVar = personType.addVariable({
            name: 'Category',
            type: 'categorical',
            options: [
              { label: 'Family', value: 1 },
              { label: 'Work', value: 2 },
              { label: 'School', value: 3 },
            ],
          });
          nameVarId = personName.id;
          categoryVarId = categoryVar.id;

          const stage = synth.addStage('CategoricalBin', {
            label: 'Categorise',
            subject: { entity: 'node', type: personType.id },
            initialNodes: { count: 3 },
          });
          stage.addPrompt({ variable: categoryVar.id });

          // node 0: multi-membership (matches Family AND Work).
          synth.setNodeAttribute(0, personName.id, 'Multi');
          synth.setNodeAttribute(0, categoryVar.id, [1, 2]);
          // node 1: empty array (unset).
          synth.setNodeAttribute(1, personName.id, 'Empty');
          synth.setNodeAttribute(1, categoryVar.id, []);
          // node 2: null (the builder cannot emit a truly-undefined attribute
          // under seedNetwork, so null stands in for the "no value" case — it
          // is treated identically to the empty array).
          synth.setNodeAttribute(2, personName.id, 'Unset');
          synth.setNodeAttribute(2, categoryVar.id, null);

          return synth;
        },
        run: async ({ interview, stage, protocol }) => {
          // The [1,2] node counts toward both bins simultaneously.
          expect(await stage.categoricalBin.getNodeCountInBin('Family')).toBe(
            1,
          );
          expect(await stage.categoricalBin.getNodeCountInBin('Work')).toBe(1);
          // Both unset representations sit in the drawer.
          await expect(stage.categoricalBin.drawerToggle).toContainText(
            '2 unplaced',
          );
          await expect(
            stage.categoricalBin.getNodeInDrawer('Empty'),
          ).toBeVisible();
          await expect(
            stage.categoricalBin.getNodeInDrawer('Unset'),
          ).toBeVisible();

          // Multi is pre-binned (not in the drawer), so re-home it from Family.
          await stage.categoricalBin.moveNodeBetweenBins(
            'Multi',
            'Family',
            'School',
          );

          const state = await protocol.getNetworkState(interview.interviewId);
          const multi = state!.nodes.find(
            (n) => n[entityAttributesProperty][nameVarId] === 'Multi',
          )!;
          expect(multi[entityAttributesProperty][categoryVarId]).toEqual([3]);
          expect(await stage.categoricalBin.getNodeCountInBin('Family')).toBe(
            0,
          );
          expect(await stage.categoricalBin.getNodeCountInBin('Work')).toBe(0);
        },
      };
    })(),

    ((): ScenarioDefinition => {
      let varAId = '';
      let nameVarId = '';
      return {
        id: 'bin-expand-collapse-interactions',
        covers: ['bin-expand-collapse'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const personType = synth.addNodeType({ name: 'Person' });
          const personName = personType.addVariable({
            name: 'name',
            type: 'text',
          });
          const varA = personType.addVariable({
            name: 'CategoryA',
            type: 'categorical',
            options: [
              { label: 'Family', value: 1 },
              { label: 'Work', value: 2 },
            ],
          });
          const varB = personType.addVariable({
            name: 'CategoryB',
            type: 'categorical',
            options: [
              { label: 'Yes', value: 1 },
              { label: 'No', value: 2 },
            ],
          });
          nameVarId = personName.id;
          varAId = varA.id;

          const stage = synth.addStage('CategoricalBin', {
            label: 'Categorise',
            subject: { entity: 'node', type: personType.id },
            initialNodes: { count: 2 },
          });
          // Second prompt so "next" changes the prompt, not the stage.
          stage.addPrompt({ variable: varA.id });
          stage.addPrompt({ variable: varB.id });

          synth.setNodeAttribute(0, personName.id, 'Placed');
          synth.setNodeAttribute(0, varA.id, [1]);
          synth.setNodeAttribute(0, varB.id, []);
          synth.setNodeAttribute(1, personName.id, 'Unplaced');
          synth.setNodeAttribute(1, varA.id, []);
          synth.setNodeAttribute(1, varB.id, []);

          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          const panel = page.locator('.catbin-expanded');

          // Click to expand.
          await stage.categoricalBin.expandBin('Family');
          expect(await stage.categoricalBin.isBinExpanded('Family')).toBe(true);
          await expect(panel).toBeVisible();

          // Escape collapses.
          await stage.categoricalBin.collapseBin('Family');
          expect(await stage.categoricalBin.isBinExpanded('Family')).toBe(
            false,
          );
          await expect(panel).toHaveCount(0);

          // Re-expand, then a document-level click (on the prompt) collapses.
          await stage.categoricalBin.expandBin('Family');
          await expect(panel).toBeVisible();
          await page.locator('[data-testid="prompt"]').first().click();
          await expect(panel).toHaveCount(0);

          // Re-expand and drop the uncategorised node onto the OPEN panel: the
          // write is identical to a circle drop.
          await stage.categoricalBin.expandBin('Family');
          await expect(panel).toBeVisible();
          await keyboardDropNode(
            page,
            stage.categoricalBin.getNodeInDrawer('Unplaced'),
            (a) => a.includes('Category: Family'),
          );
          await expect
            .poll(() => stage.categoricalBin.getNodeCountInBin('Family'))
            .toBe(2);

          const state = await protocol.getNetworkState(interview.interviewId);
          const unplaced = state!.nodes.find(
            (n) => n[entityAttributesProperty][nameVarId] === 'Unplaced',
          )!;
          expect(unplaced[entityAttributesProperty][varAId]).toEqual([1]);

          // Advancing the prompt resets the expanded bin.
          await interview.nextButton.click();
          await expect(stage.categoricalBin.drawerToggle).toContainText(
            '2 unplaced',
          );
          await expect(panel).toHaveCount(0);
        },
      };
    })(),

    ((): ScenarioDefinition => {
      let friendVarId = '';
      return {
        id: 'duplicate-labels-and-color-cycling',
        covers: [
          'duplicate-option-labels-index-keyed',
          'category-color-cycling',
        ],
        visual: true,
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const personType = synth.addNodeType({ name: 'Person' });
          const personName = personType.addVariable({
            name: 'name',
            type: 'text',
          });
          // Two options share the label 'Friend' but differ in value.
          const friendVar = personType.addVariable({
            name: 'FriendCat',
            type: 'categorical',
            options: [
              { label: 'Friend', value: 10 },
              { label: 'Friend', value: 20 },
            ],
          });
          // 12 distinct options drive colour cycling (10 colours in the cycle).
          const manyVar = personType.addVariable({
            name: 'ManyCat',
            type: 'categorical',
            options: Array.from({ length: 12 }, (_, i) => ({
              label: `Option ${i + 1}`,
              value: i + 1,
            })),
          });
          friendVarId = friendVar.id;

          const stage = synth.addStage('CategoricalBin', {
            label: 'Categorise',
            subject: { entity: 'node', type: personType.id },
            initialNodes: { count: 1 },
          });
          stage.addPrompt({ variable: friendVar.id });
          stage.addPrompt({ variable: manyVar.id });

          synth.setNodeAttribute(0, personName.id, 'Alex');
          synth.setNodeAttribute(0, friendVar.id, []);
          synth.setNodeAttribute(0, manyVar.id, []);

          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          // Both same-label bins render.
          await expect(
            page.getByRole('button', { name: /Category Friend/ }),
          ).toHaveCount(2);

          // Drop onto the SECOND 'Friend' bin (drop target 2). Bins are keyed
          // by index/value, not label, so this must write value 20 not 10.
          await keyboardDropNode(
            page,
            stage.categoricalBin.getNodeInDrawer('Alex'),
            (a) => a.includes('Category: Friend') && /Drop target 2 of/.test(a),
          );

          const state = await protocol.getNetworkState(interview.interviewId);
          expect(
            state!.nodes[0]![entityAttributesProperty][friendVarId],
          ).toEqual([20]);

          // Prompt 2: 12 bins, colours cycle (10-colour cycle => index 10 wraps
          // to index 0's colour; adjacent bins differ).
          await interview.nextButton.click();
          await expect(page.locator('.catbin-item')).toHaveCount(12);

          const catColorAt = (i: number) =>
            page
              .locator('.catbin-item')
              .nth(i)
              .evaluate((el) =>
                getComputedStyle(el).getPropertyValue('--cat-color').trim(),
              );
          expect(await catColorAt(10)).toBe(await catColorAt(0));
          expect(await catColorAt(0)).not.toBe(await catColorAt(1));
        },
      };
    })(),
  ],
};
