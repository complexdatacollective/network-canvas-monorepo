import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { DEV_PROTOCOL_ASSETS_DIR } from '../helpers/protocol-paths.js';
import type { InterfaceScenarios } from './types.js';

export const nameGeneratorQuickAddScenarios: InterfaceScenarios = {
  interfaceType: 'NameGeneratorQuickAdd',
  scenarios: [
    {
      id: 'quick-add-core-flow',
      covers: ['quickAdd'],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Add contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Who do you know?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await stage.quickAdd.addNode('Alice');
        await stage.quickAdd.addNode('Bob');

        await expect(stage.getNode('Alice')).toBeVisible();
        await expect(stage.getNode('Bob')).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toHaveLength(2);
        const labels = network!.nodes.flatMap((n) =>
          Object.values(n[entityAttributesProperty]).filter(
            (v): v is string => typeof v === 'string',
          ),
        );
        expect(labels.toSorted()).toEqual(['Alice', 'Bob']);
        for (const node of network!.nodes) {
          expect(node.promptIDs).toHaveLength(1);
        }

        // Empty-submit validation: opening the input and pressing Enter with
        // nothing typed must not create a node and must surface the tooltip.
        const toggle = page.getByTestId('quick-add-toggle');
        const input = page.getByTestId('quick-add-input');
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
          await toggle.click();
        }
        await input.fill('');
        await input.press('Enter');
        await expect(
          page.getByText(/must enter a value before pressing enter/i),
        ).toBeVisible();
        const afterEmpty = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterEmpty?.nodes).toHaveLength(2);
      },
    },

    {
      id: 'prompts-and-label-dead-config',
      covers: ['prompts[].text', 'prompts[].id', 'label', 'interviewScript'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'My QuickAdd',
          interviewScript: 'SECRET-SCRIPT',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Who do you *trust*?' });
        stage.addPrompt({ text: 'Anyone else?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await expect(stage.getPrompt().locator('em')).toHaveText('trust');
        await expect(page.getByText('SECRET-SCRIPT')).toHaveCount(0);

        await stage.quickAdd.addNode('Carol');
        await expect(stage.getNode('Carol')).toBeVisible();

        // nextButton advances the prompt (not the stage) while more prompts
        // remain; the main list is prompt-scoped so Carol disappears.
        await interview.nextButton.click();
        await expect(stage.getPrompt('Anyone else?')).toBeVisible();
        await expect(stage.getNode('Carol')).not.toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toHaveLength(1);
        expect(network?.nodes[0]?.promptIDs).toHaveLength(1);

        // label is menu-only (the host mounts Shell without
        // allowStageNavigation, so no menu exists here); interviewScript is
        // never rendered anywhere. Both must be absent from the stage DOM.
        await expect(page.getByText('My QuickAdd')).toHaveCount(0);
        await expect(page.getByText('SECRET-SCRIPT')).toHaveCount(0);
      },
    },

    {
      id: 'prompt-additional-attributes-existing-panel',
      covers: [
        'prompts[].additionalAttributes',
        'panels[].dataSource=existing',
        'panels[].id',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const closeTie = person.addVariable({
          type: 'boolean',
          name: 'closeTie',
        });
        const estranged = person.addVariable({
          type: 'boolean',
          name: 'estranged',
        });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Alters',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({
          text: 'People close to you',
          additionalAttributes: [
            { variable: closeTie.id, value: true },
            { variable: estranged.id, value: false },
          ],
        });
        stage.addPrompt({
          text: 'People from your childhood',
          additionalAttributes: [{ variable: closeTie.id, value: true }],
        });
        stage.addPanel({ title: 'Already added', dataSource: 'existing' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // Prompt 1: additionalAttributes applied at creation (true AND false
        // must both be written, not the false one omitted).
        await stage.quickAdd.addNode('Alice');
        let network = await protocol.getNetworkState(interview.interviewId);
        const boolEntries = Object.entries(
          network!.nodes[0]![entityAttributesProperty],
        ).filter(([, v]) => typeof v === 'boolean');
        expect(
          boolEntries
            .map(([, v]) => v)
            .toSorted((a, b) => Number(a) - Number(b)),
        ).toEqual([false, true]);

        // Advance to prompt 2 (same stage — nextButton advances the prompt,
        // not the stage, while isLastPrompt is false).
        await interview.nextButton.click();
        await expect(
          stage.getPrompt('People from your childhood'),
        ).toBeVisible();
        await expect(
          stage.nodePanel.getNode('Already added', 'Alice'),
        ).toBeVisible();
        // Scoped to the main list: the panel now also shows an "Alice"
        // button, so a page-wide role query would be ambiguous.
        await expect(
          page.getByTestId('node-list').getByRole('button', { name: /^Alice/ }),
        ).toHaveCount(0);

        // Drop from the "existing" panel into the main list: the node gains
        // prompt 2's promptID and its additionalAttributes are re-applied
        // (closeTie stays true; estranged keeps its creation-time false —
        // prompt 2 doesn't set it).
        await stage.nodePanel.dragNodeToMainList('Already added', 'Alice');
        network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toHaveLength(1);
        expect(network?.nodes[0]?.promptIDs).toHaveLength(2);
        const boolAfterDrop = Object.entries(
          network!.nodes[0]![entityAttributesProperty],
        ).filter(([, v]) => typeof v === 'boolean');
        expect(
          boolAfterDrop
            .map(([, v]) => v)
            .toSorted((a, b) => Number(a) - Number(b)),
        ).toEqual([false, true]);
      },
    },

    {
      id: 'node-limits-and-panel-drag',
      covers: [
        'behaviours.minNodes',
        'behaviours.maxNodes',
        'behaviours.maxNodes-panel-drag',
      ],
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const setup = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Setup',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
          initialNodes: { count: 1, promptIndex: 0 },
        });
        setup.addPrompt({ text: 'Setup prompt' });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Limited',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
          behaviours: { minNodes: 1, maxNodes: 1 },
        });
        stage.addPrompt({ text: 'Add exactly one person' });
        stage.addPanel({ title: 'Prior contacts', dataSource: 'existing' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // minNodes blocks forward navigation while this stage has 0 nodes
        // (the seeded setup node belongs to the setup stage's prompt only).
        await interview.nextButton.click();
        await expect(page.getByText(/must create at least/i)).toBeVisible();
        let network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toHaveLength(1);

        await stage.quickAdd.addNode('Alice');
        await expect(page.getByText(/completed this task/i)).toBeVisible();
        expect(await interview.nextButtonHasPulse()).toBe(true);
        expect(await stage.quickAdd.isDisabled()).toBe(true);

        const panelOption = stage.nodePanel
          .getPanel('Prior contacts')
          .getByRole('option')
          .first();
        await expect(panelOption).toHaveAttribute('aria-disabled', 'true');

        const setupNodeName = await panelOption.textContent();
        await stage.nodePanel.expectDragNodeToMainListNoOp(
          'Prior contacts',
          setupNodeName!.trim(),
        );

        await expect(
          page.getByTestId('node-list').getByRole('option'),
        ).toHaveText(['Alice']);

        network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toHaveLength(2);
      },
    },

    {
      id: 'external-panels-load-error-titles',
      covers: ['panels[].dataSource=assetId', 'panels[].title'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        synth.addAsset({
          id: 'previous-interview',
          name: 'previousInterview.json',
          type: 'network',
          source: 'previousInterview.json',
        });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Import contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Add people from previous rounds' });
        stage.addPanel({
          title: 'Previous interview',
          dataSource: 'previous-interview',
        });
        stage.addPanel({
          title: 'Missing import',
          dataSource: 'never-registered',
        });
        return synth;
      },
      assets: [
        {
          assetId: 'previous-interview',
          name: 'previousInterview.json',
          type: 'network',
          source: 'previousInterview.json',
          localPath: path.join(
            DEV_PROTOCOL_ASSETS_DIR,
            'previousInterview.json',
          ),
        },
      ],
      run: async ({ page, stage, protocol, interview }) => {
        const panels = page.getByTestId('node-panel');
        await expect(panels).toHaveCount(2);
        const loadedPanel = panels.filter({ hasText: 'Previous interview' });
        const errorPanel = panels.filter({ hasText: 'Missing import' });
        await expect(loadedPanel).toBeVisible();

        // Loaded panel lists the external roster's people.
        await expect(
          loadedPanel.getByRole('option', { name: 'Barry' }),
        ).toBeVisible();

        // Error panel: an unresolvable asset id degrades quietly — the panel
        // stays collapsed (panels only auto-open when they have content) and
        // the error copy is rendered inside the collapsed body.
        await expect(errorPanel).toBeAttached();
        await expect(errorPanel).toBeHidden();
        await expect(
          errorPanel.getByText('External data could not be loaded.'),
        ).toBeAttached();

        // Keyboard-drag Barry into the main list: creates a real node.
        const barry = loadedPanel.getByRole('option', { name: 'Barry' });
        await barry.evaluate((el) => {
          if (el instanceof HTMLElement) el.focus();
        });
        await barry.press('Control+d');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await expect(stage.getNode('Barry')).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(
          network!.nodes.some((n) =>
            Object.values(n[entityAttributesProperty]).includes('Barry'),
          ),
        ).toBe(true);

        expect(await stage.quickAdd.isDisabled()).toBe(false);
      },
    },

    {
      id: 'subject-type-scoping',
      covers: ['subject.type'],
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const place = synth.addNodeType({ name: 'Place' });
        const placeName = place.addVariable({ type: 'text', name: 'name' });
        const person = synth.addNodeType({ name: 'Person' });
        const personName = person.addVariable({ type: 'text', name: 'name' });

        const setup = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Setup places',
          subject: { entity: 'node', type: place.id },
          quickAdd: placeName.id,
          initialNodes: { count: 2 }, // not tied to any prompt
        });
        setup.addPrompt({ text: 'Setup' });

        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'People',
          subject: { entity: 'node', type: person.id },
          quickAdd: personName.id,
          behaviours: { minNodes: 1 },
        });
        stage.addPrompt({ text: 'Add the people you know' });
        stage.addPanel({ title: 'Already added', dataSource: 'existing' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // 2 Place nodes exist but don't satisfy minNodes (Person-scoped) and
        // don't appear in the existing-panel (Person-scoped).
        await expect(
          stage.nodePanel.getPanel('Already added').getByRole('option'),
        ).toHaveCount(0);
        await interview.nextButton.click();
        await expect(page.getByText(/must create at least/i)).toBeVisible();

        await stage.quickAdd.addNode('Priya');
        const network = await protocol.getNetworkState(interview.interviewId);
        const priya = network!.nodes.find((n) =>
          Object.values(n[entityAttributesProperty]).includes('Priya'),
        );
        expect(priya).toBeDefined();
        expect(network?.nodes).toHaveLength(3); // 2 Place + 1 Person
        expect(
          network!.nodes.filter((n) => n.type === priya!.type),
        ).toHaveLength(1);
        expect(await interview.nextButtonHasPulse()).toBe(true);
      },
    },

    {
      id: 'codebook-styling-and-node-deletion',
      covers: [
        'codebook.node.color',
        'codebook.node.icon',
        'codebook.node.shape',
      ],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({
          name: 'Styled Person',
          color: 'node-color-seq-3',
          icon: 'add-a-place',
        });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const isSquare = person.addVariable({
          type: 'boolean',
          name: 'isSquare',
        });
        person.setShape({
          default: 'circle',
          dynamic: {
            variable: isSquare.id,
            type: 'discrete',
            map: [{ value: true, shape: 'square' }],
          },
        });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Styled contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({
          text: 'Add a contact',
          additionalAttributes: [{ variable: isSquare.id, value: true }],
        });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await page.getByTestId('quick-add-toggle').click();
        const circle = page.locator('[data-toggle-circle]');
        await expect(circle).toHaveClass(/rounded/);

        const circleColor = await circle.evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        );
        // Compare against --node-3 resolved through a probe element so both
        // sides normalize to the same rgb() serialization.
        const resolvedVarColor = await page.evaluate(() => {
          const probe = document.createElement('div');
          probe.style.backgroundColor = 'var(--node-3)';
          document.body.appendChild(probe);
          const rgb = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return rgb;
        });
        expect(circleColor).toBe(resolvedVarColor);

        await page.getByTestId('quick-add-input').fill('Dana');
        await page.getByTestId('quick-add-input').press('Enter');
        await expect(stage.getNode('Dana')).toBeVisible();

        await stage.deleteNode('Dana');
        const network = await protocol.getNetworkState(interview.interviewId);
        expect(
          network!.nodes.some((n) =>
            Object.values(n[entityAttributesProperty]).includes('Dana'),
          ),
        ).toBe(false);
      },
    },

    {
      id: 'encrypted-quick-add-variable',
      covers: ['codebook.variables.quickAdd.encrypted'],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({
          type: 'text',
          name: 'name',
          encrypted: true,
        });
        synth.setExperiments({ encryptedVariables: true });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Confidential contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Add a person (this will be encrypted)' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // Before a passphrase is set, quick-add is disabled.
        expect(await stage.quickAdd.isDisabled()).toBe(true);

        const lockButton = page.getByRole('button').filter({ hasText: '🔑' });
        await expect(lockButton).toBeVisible();
        await lockButton.click();

        await page
          .getByRole('textbox', { name: 'Passphrase' })
          .fill('correct horse battery');
        await page.getByRole('button', { name: 'Submit passphrase' }).click();

        await expect.poll(async () => stage.quickAdd.isDisabled()).toBe(false);
        await stage.quickAdd.addNode('Alice');
        await expect(stage.getNode('Alice')).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toHaveLength(1);
        const node = network!.nodes[0]!;
        const attrValues = Object.values(node[entityAttributesProperty]);
        // Ciphertext is a number[], never the plaintext string.
        expect(attrValues.some((v) => Array.isArray(v))).toBe(true);
        expect(attrValues).not.toContain('Alice');
        expect(node[entitySecureAttributesMeta]).toBeTruthy();
      },
    },
  ],
};
