import type { Page } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

/**
 * Read the current DnD accessibility announcement from the live region.
 * Mirrors the private helper in stage-fixture.ts: the DnD system appends a
 * `div[role="status"][aria-live="polite"]` to document.body with text like
 * "Drop target 1 of 3: Container for the value 'Very close'".
 */
async function readDropAnnouncement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const regions = document.querySelectorAll(
      'body > div[role="status"][aria-live="polite"]',
    );
    for (const el of regions) {
      const text = el.textContent?.trim() ?? '';
      if (text.includes('Drop target')) {
        return text;
      }
    }
    return '';
  });
}

export const ordinalBinScenarios: InterfaceScenarios = {
  interfaceType: 'OrdinalBin',
  scenarios: [
    (() => {
      // Shared across build()/run() via closure: both variable ids are
      // generated inside build() and read back inside run() to look up
      // network attributes (entityAttributesProperty is keyed by variable
      // UUID, never by the human-readable variable name).
      let nameVarId = '';
      let closenessVarId = '';
      const aliceUid = 'n-Alice';
      return {
        id: 'core-binning-and-bin-derivation',
        covers: [
          'type',
          'id',
          'label',
          'interviewScript',
          'prompts[].id',
          'prompts[].text',
          'prompts[].variable',
          'codebook.ordinalOptions',
        ],
        smoke: true,
        visual: true,
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: '**Very** close', value: 3 },
            ],
          });
          nameVarId = nameVar.id;
          closenessVarId = closeness.id;
          const stage = synth.addStage('OrdinalBin', {
            label: 'Rate Closeness',
            interviewScript: 'Read this prompt aloud before starting.',
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({
            text: 'How close are you to *these* people?',
            variable: closeness.id,
          });
          for (const name of ['Alice', 'Bob', 'Carol']) {
            synth.addManualNode(stage.id, person.id, `n-${name}`, {
              [nameVar.id]: name,
              [closeness.id]: null,
            });
          }
          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          // Bins derived from codebook options: count, order, markdown label
          const bins = page.locator('[data-testid^="ordinal-bin-"]');
          await expect(bins).toHaveCount(3);
          await expect(
            page.getByRole('heading', { level: 4, name: 'Not close' }),
          ).toBeVisible();
          await expect(
            page
              .locator('[data-testid="ordinal-bin-2"]')
              .locator('strong', { hasText: 'Very' }),
          ).toBeVisible();

          // Prompt text markdown
          await expect(page.locator('[data-testid="prompt"] em')).toHaveText(
            'these',
          );

          // Core drag + network write. The "**Very** close" bin's DnD
          // announcement carries the raw markdown label ("Container for the
          // value '**Very** close'"), so keyboard-DnD target matching can't
          // resolve it — bin the node in a plain-label bin instead.
          await stage.ordinalBin.dragNodeToBin('Alice', 'Close');
          expect(await stage.ordinalBin.isNodeInBin('Alice', 'Close')).toBe(
            true,
          );
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(2);

          const network = await protocol.getNetworkState(interview.interviewId);
          const alice = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === aliceUid,
          );
          expect(alice?.[entityAttributesProperty][nameVarId]).toBe('Alice');
          expect(alice?.[entityAttributesProperty][closenessVarId]).toBe(2);

          // Dead config: label/interviewScript never render in the stage region
          await expect(page.getByText('Rate Closeness')).toHaveCount(0);
          await expect(
            page.getByText('Read this prompt aloud before starting.'),
          ).toHaveCount(0);
        },
      };
    })(),
    (() => {
      // Bob is seeded already binned (value 1); Carol stays unplaced. Both var
      // ids are captured for the post-move network assertion.
      let closenessVarId = '';
      const bobUid = 'n-bob';
      return {
        id: 'rebinning-noop-and-drawer-no-unplace',
        covers: ['prompts[].variable'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          closenessVarId = closeness.id;
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });
          synth.addManualNode(stage.id, person.id, bobUid, {
            [nameVar.id]: 'Bob',
            [closeness.id]: 1,
          });
          synth.addManualNode(stage.id, person.id, 'n-carol', {
            [nameVar.id]: 'Carol',
            [closeness.id]: null,
          });
          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          // Bob starts in "Not close" (value 1). Re-bin him twice; each drop
          // rewrites his attribute to the destination bin's value.
          await stage.ordinalBin.moveNodeBetweenBins(
            'Bob',
            'Not close',
            'Very close',
          );
          let network = await protocol.getNetworkState(interview.interviewId);
          let bob = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === bobUid,
          );
          expect(bob?.[entityAttributesProperty][closenessVarId]).toBe(3);

          await stage.ordinalBin.moveNodeBetweenBins(
            'Bob',
            'Very close',
            'Close',
          );
          await expect(
            stage.ordinalBin.getNodeInBin('Bob', 'Close'),
          ).toHaveCount(1);
          network = await protocol.getNetworkState(interview.interviewId);
          bob = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === bobUid,
          );
          expect(bob?.[entityAttributesProperty][closenessVarId]).toBe(2);

          // The drawer is mounted without a dropTarget (OrdinalBin.tsx:80), so
          // walking every drop target while dragging Carol never announces the
          // drawer as a destination — only the bins do.
          const carol = stage.ordinalBin.getNodeInDrawer('Carol');
          await carol.evaluate((el) => {
            if (el instanceof HTMLElement) {
              el.focus();
            }
          });
          await carol.press('Control+d');
          const announcements: string[] = [];
          for (let i = 0; i < 6; i++) {
            await page.keyboard.press('ArrowRight');
            announcements.push(await readDropAnnouncement(page));
          }
          await page.keyboard.press('Escape');

          for (const announcement of announcements) {
            expect(announcement).not.toContain('Drawer');
          }
          expect(
            announcements.some((a) => a.includes('Container for the value')),
          ).toBe(true);
        },
      };
    })(),
    (() => {
      // Dana is unplaced (null); Erin holds an out-of-range value (99) that
      // matches no option, so she is also treated as unplaced.
      const danaUid = 'n-dana';
      const erinUid = 'n-erin';
      let closenessVarId = '';
      return {
        id: 'unplaced-out-of-range-and-readiness',
        covers: ['prompts[].variable'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          closenessVarId = closeness.id;
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });
          synth.addManualNode(stage.id, person.id, danaUid, {
            [nameVar.id]: 'Dana',
            [closeness.id]: null,
          });
          synth.addManualNode(stage.id, person.id, erinUid, {
            [nameVar.id]: 'Erin',
            [closeness.id]: 99,
          });
          return synth;
        },
        run: async ({ interview, stage, protocol }) => {
          // Both nodes read as unplaced: null and out-of-range alike.
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(2);
          await expect(stage.ordinalBin.getNodeInDrawer('Dana')).toBeVisible();
          await expect(stage.ordinalBin.getNodeInDrawer('Erin')).toBeVisible();
          expect(await interview.nextButtonHasPulse()).toBe(false);

          await stage.ordinalBin.dragNodeToBin('Dana', 'Close');
          // Still one unplaced (Erin) — not ready yet.
          expect(await interview.nextButtonHasPulse()).toBe(false);

          await stage.ordinalBin.dragNodeToBin('Erin', 'Not close');
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(0);
          expect(await interview.nextButtonHasPulse()).toBe(true);

          const network = await protocol.getNetworkState(interview.interviewId);
          const dana = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === danaUid,
          );
          const erin = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === erinUid,
          );
          expect(dana?.[entityAttributesProperty][closenessVarId]).toBe(2);
          expect(erin?.[entityAttributesProperty][closenessVarId]).toBe(1);
        },
      };
    })(),
    (() => {
      // The Availability variable id is generated inside build() and read back
      // inside run() for the negative-value network assertion.
      let availabilityVarId = '';
      const frankUid = 'n-frank';
      return {
        id: 'missing-value-bin',
        covers: ['codebook.ordinalOptions'],
        visual: true,
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          const availability = person.addVariable({
            name: 'Availability',
            type: 'ordinal',
            options: [
              { label: 'N/A', value: -1 },
              { label: 'Low', value: 1 },
              { label: 'Medium', value: 2 },
              { label: 'High', value: 3 },
            ],
          });
          availabilityVarId = availability.id;
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });
          stage.addPrompt({
            text: 'Rate availability',
            variable: availability.id,
          });
          synth.addManualNode(stage.id, person.id, frankUid, {
            [nameVar.id]: 'Frank',
            [closeness.id]: null,
            [availability.id]: null,
          });
          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          // Advance from prompt 1 (Closeness) to prompt 2 (Availability). Prompt
          // advancement dispatches updatePrompt without changing the URL step,
          // so nextButton.click() is used (interview.next() waits on a step
          // change that only fires on stage transitions).
          await interview.nextButton.click();
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Rate availability',
          );

          // Bins render in authored option order, so the N/A bin (value -1) is
          // ordinal-bin-0. Its accent element gets the flat bg-surface-2 class
          // instead of the color-mix gradient (OrdinalBinItem.tsx:142-148).
          const naAccent = page
            .locator('[data-testid="ordinal-bin-0"] > div')
            .first();
          await expect(naAccent).toHaveClass(/bg-surface-2/);
          const lowAccent = page
            .locator('[data-testid="ordinal-bin-1"] > div')
            .first();
          await expect(lowAccent).not.toHaveClass(/bg-surface-2/);
          const mediumAccent = page
            .locator('[data-testid="ordinal-bin-2"] > div')
            .first();
          await expect(mediumAccent).not.toHaveClass(/bg-surface-2/);
          const highAccent = page
            .locator('[data-testid="ordinal-bin-3"] > div')
            .first();
          await expect(highAccent).not.toHaveClass(/bg-surface-2/);

          await stage.ordinalBin.dragNodeToBin('Frank', 'N/A');
          expect(await stage.ordinalBin.isNodeInBin('Frank', 'N/A')).toBe(true);

          const network = await protocol.getNetworkState(interview.interviewId);
          const frank = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === frankUid,
          );
          expect(frank?.[entityAttributesProperty][availabilityVarId]).toBe(-1);
        },
      };
    })(),
    (() => {
      // Two prompts on two different ordinal variables of the same subject. Var
      // ids are captured for network assertions; the node is looked up by uid.
      let closenessVarId = '';
      let availabilityVarId = '';
      const ginaUid = 'n-gina';
      return {
        id: 'multi-prompt-pips-navigation',
        covers: ['prompts'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          const availability = person.addVariable({
            name: 'Availability',
            type: 'ordinal',
            options: [
              { label: 'Low', value: 1 },
              { label: 'Medium', value: 2 },
              { label: 'High', value: 3 },
            ],
          });
          closenessVarId = closeness.id;
          availabilityVarId = availability.id;
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });
          stage.addPrompt({
            text: 'Rate availability',
            variable: availability.id,
          });
          synth.addManualNode(stage.id, person.id, ginaUid, {
            [nameVar.id]: 'Gina',
            [closeness.id]: null,
            [availability.id]: null,
          });
          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Rate closeness',
          );
          // Two prompts render two navigation pips.
          await expect(page.locator('[data-active]')).toHaveCount(2);
          await stage.ordinalBin.dragNodeToBin('Gina', 'Very close');

          // Advance the prompt (not the stage): nextButton.click() because the
          // URL step does not change on prompt advances.
          await interview.nextButton.click();
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Rate availability',
          );
          // Bins re-rendered for the new variable's options.
          await expect(
            page.getByRole('heading', { level: 4, name: 'Low' }),
          ).toBeVisible();
          // Gina is unplaced again: her Availability attribute is still null.
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(1);

          let network = await protocol.getNetworkState(interview.interviewId);
          let gina = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === ginaUid,
          );
          expect(gina?.[entityAttributesProperty][closenessVarId]).toBe(3);
          expect(
            gina?.[entityAttributesProperty][availabilityVarId],
          ).toBeNull();

          await stage.ordinalBin.dragNodeToBin('Gina', 'High');
          // Last prompt: nextButton now advances the stage, changing the URL
          // step, so interview.next() is the correct wait here.
          await interview.next();
          network = await protocol.getNetworkState(interview.interviewId);
          gina = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === ginaUid,
          );
          expect(gina?.[entityAttributesProperty][closenessVarId]).toBe(3);
          expect(gina?.[entityAttributesProperty][availabilityVarId]).toBe(3);
        },
      };
    })(),
    (() => {
      return {
        id: 'prompt-color-variants',
        covers: ['prompts[].color'],
        visual: true,
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          // Prompt 1 omits `color`. resolveOrdinalBinPrompt auto-assigns
          // ORDINAL_COLORS[0] === 'ord-color-seq-1' for the first OrdinalBin
          // prompt on a fresh builder — the same value prompt 2 sets
          // explicitly — so an unset color renders identically to explicit
          // 'ord-color-seq-1'.
          stage.addPrompt({ text: 'Prompt one', variable: closeness.id });
          stage.addPrompt({
            text: 'Prompt two',
            variable: closeness.id,
            color: 'ord-color-seq-1',
          });
          // Prompt 3: a different palette value resolves to a different colour.
          // The schema (prompts.ts) restricts `color` to the ten ord-color-seq
          // enum values, so an out-of-palette string is rejected at build time
          // and can never reach the interface.
          stage.addPrompt({
            text: 'Prompt three',
            variable: closeness.id,
            color: 'ord-color-seq-5',
          });
          synth.addManualNode(stage.id, person.id, 'n-ivy', {
            [nameVar.id]: 'Ivy',
          });
          return synth;
        },
        run: async ({ page, interview }) => {
          const accent = page
            .locator('[data-testid="ordinal-bin-0"] > div')
            .first();
          const readPromptColor = () =>
            accent.evaluate((el) =>
              getComputedStyle(el).getPropertyValue('--prompt-color').trim(),
            );

          // `--prompt-color` is set to `var(--ord-N)` by a utility class;
          // getComputedStyle resolves the reference to the concrete color, so
          // assertions compare resolved colors rather than the literal var().
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Prompt one',
          );
          await expect(accent).toBeVisible();
          const promptOneColor = await readPromptColor();
          expect(promptOneColor).not.toBe('');

          // Prompt 2 (explicit ord-color-seq-1) resolves identically to the
          // auto-assigned prompt 1.
          await interview.nextButton.click();
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Prompt two',
          );
          await expect(accent).toBeVisible();
          const promptTwoColor = await readPromptColor();
          expect(promptTwoColor).toBe(promptOneColor);

          // Prompt 3 (ord-color-seq-5) resolves to a different color.
          await interview.nextButton.click();
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Prompt three',
          );
          await expect(accent).toBeVisible();
          const promptThreeColor = await readPromptColor();
          expect(promptThreeColor).not.toBe('');
          expect(promptThreeColor).not.toBe(promptOneColor);
        },
      };
    })(),
    (() => {
      // bucketSortOrder governs the drawer (prompt 1); binSortOrder governs the
      // in-bin order (prompt 2). No var-id capture needed — assertions read the
      // rendered DOM order.
      return {
        id: 'sort-orders-bucket-and-bin',
        covers: ['prompts[].bucketSortOrder', 'prompts[].binSortOrder'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          // Prompt 1 sorts the unplaced drawer by name descending.
          stage.addPrompt({
            text: 'Sort bucket',
            variable: closeness.id,
            bucketSortOrder: [{ property: nameVar.id, direction: 'desc' }],
          });
          // Prompt 2 (same variable) sorts each bin's nodes by name ascending.
          stage.addPrompt({
            text: 'Sort bins',
            variable: closeness.id,
            binSortOrder: [{ property: nameVar.id, direction: 'asc' }],
          });
          // Four unplaced nodes seeded in creation order Dana, Alice, Carol,
          // Bob (only name set, Closeness null).
          for (const name of ['Dana', 'Alice', 'Carol', 'Bob']) {
            synth.addManualNode(
              stage.id,
              person.id,
              `n-${name.toLowerCase()}`,
              {
                [nameVar.id]: name,
                [closeness.id]: null,
              },
            );
          }
          // Three nodes pre-assigned to the "Close" bin (value 2).
          for (const name of ['Zed', 'Ann', 'Mia']) {
            synth.addManualNode(
              stage.id,
              person.id,
              `n-${name.toLowerCase()}`,
              {
                [nameVar.id]: name,
                [closeness.id]: 2,
              },
            );
          }
          return synth;
        },
        run: async ({ page, interview, stage }) => {
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Sort bucket',
          );

          // Prompt 1: the four unplaced nodes are drawer buttons (role=button);
          // the three pre-binned nodes render as options inside "Close". Read
          // the drawer order via the name-scoped buttons.
          const drawerButtons = page.getByRole('button', {
            name: /^(Alice|Bob|Carol|Dana)$/,
          });
          await expect(drawerButtons).toHaveCount(4);
          const drawerOrder = await drawerButtons.evaluateAll((els) =>
            els.map((el) => el.getAttribute('aria-label')),
          );
          expect(drawerOrder).toEqual(['Dana', 'Carol', 'Bob', 'Alice']);

          // Advance to prompt 2 (same stage) — prompt advance, not stage.
          await interview.nextButton.click();
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Sort bins',
          );

          const closeOrder = await stage.ordinalBin
            .getBinNodeList('Close')
            .getByRole('option')
            .evaluateAll((els) =>
              els.map((el) => el.getAttribute('aria-label')),
            );
          expect(closeOrder).toEqual(['Ann', 'Mia', 'Zed']);
        },
      };
    })(),
    (() => {
      let closenessVarId = '';
      const graceUid = 'n-ineligible-1';
      return {
        id: 'subject-and-filter-scoping',
        covers: ['subject', 'filter'],
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const place = synth.addNodeType({ name: 'Place' });
          const personName = person.addVariable({ name: 'name', type: 'text' });
          const placeName = place.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          closenessVarId = closeness.id;
          const eligible = person.addVariable({
            name: 'eligible',
            type: 'boolean',
          });
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
            filter: {
              rules: [
                {
                  type: 'node',
                  id: 'eligible-only',
                  options: {
                    // The node type owning the referenced attribute; the
                    // attribute reference cannot be resolved without it.
                    type: person.id,
                    attribute: eligible.id,
                    operator: 'EXACTLY',
                    value: true,
                  },
                },
              ],
            },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });

          synth.addManualNode(stage.id, person.id, 'n-eligible-1', {
            [personName.id]: 'Eve',
            [closeness.id]: null,
            [eligible.id]: true,
          });
          synth.addManualNode(stage.id, person.id, 'n-eligible-2', {
            [personName.id]: 'Frank',
            [closeness.id]: null,
            [eligible.id]: true,
          });
          synth.addManualNode(stage.id, person.id, graceUid, {
            [personName.id]: 'Grace',
            [closeness.id]: null,
            [eligible.id]: false,
          });
          synth.addManualNode(stage.id, person.id, 'n-ineligible-2', {
            [personName.id]: 'Heidi',
            [closeness.id]: null,
            [eligible.id]: false,
          });
          synth.addManualNode(stage.id, place.id, 'n-place-1', {
            [placeName.id]: 'Library',
          });
          synth.addManualNode(stage.id, place.id, 'n-place-2', {
            [placeName.id]: 'Park',
          });
          return synth;
        },
        run: async ({ interview, stage, protocol }) => {
          // Only the two eligible Person nodes are drawn — Place nodes are never
          // counted; ineligible Persons are filtered out before subject-type
          // scoping.
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(2);

          await stage.ordinalBin.dragNodeToBin('Eve', 'Close');
          await stage.ordinalBin.dragNodeToBin('Frank', 'Very close');

          // Readiness ignores the filtered-out and off-subject nodes.
          expect(await interview.nextButtonHasPulse()).toBe(true);

          const network = await protocol.getNetworkState(interview.interviewId);
          const grace = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === graceUid,
          );
          expect(grace?.[entityAttributesProperty][closenessVarId]).toBeNull();
          // All 6 seeded nodes (4 Person + 2 Place) survive in the shared
          // network — the stage filter/subject only affect what renders and
          // what blocks readiness, never what's persisted.
          expect(network?.nodes).toHaveLength(6);
        },
      };
    })(),
    (() => {
      let closenessVarId = '';
      const hanaUid = 'n-hana';
      return {
        id: 'portrait-layout',
        covers: [],
        chromiumOnly: true,
        seedNetwork: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          closenessVarId = closeness.id;
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });
          synth.addManualNode(stage.id, person.id, hanaUid, {
            [nameVar.id]: 'Hana',
            [closeness.id]: null,
          });
          return synth;
        },
        run: async ({ page, interview, stage, protocol }) => {
          const closeListbox = stage.ordinalBin.getBinNodeList('Close');

          // Portrait: NodeList threads orientation="horizontal" to the listbox,
          // which renders the horizontal scroll variant.
          await page.setViewportSize({ width: 500, height: 900 });
          await expect(closeListbox).toHaveClass(/overflow-x-auto/);

          await stage.ordinalBin.dragNodeToBin('Hana', 'Close');
          const network = await protocol.getNetworkState(interview.interviewId);
          const hana = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === hanaUid,
          );
          expect(hana?.[entityAttributesProperty][closenessVarId]).toBe(2);

          // Landscape: the same bin's listbox flips to the vertical variant.
          await page.setViewportSize({ width: 1280, height: 800 });
          await expect(closeListbox).toHaveClass(/overflow-auto/);
          await expect(closeListbox).not.toHaveClass(/overflow-x-auto/);
        },
      };
    })(),
  ],
};
