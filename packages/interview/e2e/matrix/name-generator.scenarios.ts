import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { FilterSchema } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { SessionPayload } from '../../src/contract/types.js';
import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../helpers/fixtures');

type NetworkState = NonNullable<SessionPayload['network']>;

/** Find the first node whose attributes contain the given label value. */
function findNodeByLabel(network: NetworkState, label: string) {
  return network.nodes.find((node) =>
    Object.values(node[entityAttributesProperty]).includes(label),
  );
}

export const nameGeneratorScenarios: InterfaceScenarios = {
  interfaceType: 'NameGenerator',
  scenarios: [
    {
      id: 'add-node-basic-form',
      covers: [
        'type',
        'subject',
        'form',
        'form.title',
        'form.fields[].variable',
        'form.fields[].prompt',
        'form.fields[].hint',
        'form.fields[].showValidationHints',
        'form.fields[].id',
        'codebook: variable.validation',
        'codebook: node.icon / node.color / node.shape',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({
          name: 'Person',
          icon: 'add-a-person',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        });
        synth.addNodeType({ name: 'Organisation' }); // never used by this stage
        // A distinct name (redeclaring the auto-seeded "name" var would drop
        // the validation) that still contains "name", so getNodeLabel resolves
        // the node label from it (rule 2 of getNodeLabelAttribute).
        person.addVariable({
          id: 'person-name',
          name: 'personName',
          type: 'text',
          component: 'Text',
          validation: { required: true, minLength: 2 },
        });

        const stage = synth.addStage('NameGenerator', {
          label: 'My NG stage',
          subject: { entity: 'node', type: person.id },
          interviewScript:
            'Ask the participant to name people they discuss things with.',
          form: { title: 'Add a friend', fields: [] },
        });
        stage.addFormField({
          variable: 'person-name',
          component: 'Text',
          prompt: 'What is their name?',
          hint: 'First name is fine',
          showValidationHints: true,
        });
        stage.addPrompt({ text: 'Who do you spend free time with?' });
        return synth;
      },
      run: async ({ page, stage }) => {
        await stage.nameGenerator.openAddForm();
        await expect(
          page.getByRole('dialog', { name: 'Add a friend' }),
        ).toBeVisible();
        await expect(page.getByText('What is their name?')).toBeVisible();
        // hint text renders...
        await expect(page.getByText('First name is fine')).toBeVisible();
        // ...and showValidationHints renders the requirements checklist.
        await expect(
          page.getByText('Enter at least 2 characters.'),
        ).toBeVisible();

        // Below minLength: field error visible, dialog stays open on submit.
        await stage.form.fillText('person-name', 'A');
        await page.getByRole('button', { name: 'Finished' }).click();
        await expect(stage.form.getFieldError('person-name')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();

        // Meets minLength: submit succeeds.
        await stage.form.fillText('person-name', 'Al');
        await stage.nameGenerator.submitForm();

        const node = stage.getNode('Al');
        await expect(node).toBeVisible();
        // codebook colour/shape flow through to the rendered node.
        await expect(node).toHaveClass(/outline-node-3/);
        await expect(node).not.toHaveClass(/rounded-full/);

        // Only one node exists; Organisation is never offered as a subject.
        await expect(
          page.getByTestId('node-list').getByRole('option'),
        ).toHaveCount(1);

        // Dead/menu-only config: the host mounts Shell without
        // allowStageNavigation, so there is no stages menu — label renders
        // nowhere in the stage, and interviewScript is authoring-only.
        await expect(page.getByText('My NG stage')).toHaveCount(0);
        await expect(
          page.getByText(
            'Ask the participant to name people they discuss things with.',
          ),
        ).toHaveCount(0);
      },
    },

    {
      id: 'node-edit-and-unique-validation',
      covers: ['form.fields[].variable', 'codebook: variable.validation'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        person.addVariable({
          id: 'person-name',
          name: 'personName',
          type: 'text',
          component: 'Text',
          validation: { required: true, unique: true },
        });
        const stage = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
        });
        stage.addFormField({
          variable: 'person-name',
          component: 'Text',
          prompt: 'Their name',
        });
        stage.addPrompt({ text: 'Who do you know?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // First add: 'Bob'.
        await stage.nameGenerator.openAddForm();
        await stage.form.fillText('person-name', 'Bob');
        await stage.nameGenerator.submitForm();

        const afterAdd = await protocol.getNetworkState(interview.interviewId);
        expect(afterAdd?.nodes).toHaveLength(1);
        const bobUid = afterAdd!.nodes[0]![entityPrimaryKeyProperty];

        // Clicking the node opens the edit dialog populated with its value.
        await stage.getNode('Bob').click();
        const editDialog = page.getByRole('dialog');
        await expect(editDialog).toBeVisible();
        await expect(editDialog.getByRole('textbox')).toHaveValue('Bob');
        // Resubmitting the same value succeeds (currentEntityId exemption).
        await stage.nameGenerator.submitForm();
        const afterEdit = await protocol.getNetworkState(interview.interviewId);
        expect(afterEdit?.nodes).toHaveLength(1);
        expect(afterEdit!.nodes[0]![entityPrimaryKeyProperty]).toBe(bobUid);

        // A NEW node named 'Bob' is blocked by uniqueness.
        await stage.nameGenerator.openAddForm();
        await stage.form.fillText('person-name', 'Bob');
        await page.getByRole('button', { name: 'Finished' }).click();
        await expect(stage.form.getFieldError('person-name')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();
        const afterDup = await protocol.getNetworkState(interview.interviewId);
        expect(afterDup?.nodes).toHaveLength(1);
      },
    },

    {
      id: 'number-validation-coercion-and-delete',
      covers: ['codebook: variable.validation'],
      build: () => {
        const synth = new SyntheticInterview();
        // A named node type so the created node has a stable fallback label
        // (getNodeLabel returns the codebook name when no "name" var is set).
        const contact = synth.addNodeType({ name: 'Contact' });
        contact.addVariable({
          id: 'age',
          name: 'age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 0, maxValue: 120 },
        });
        const stage = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: contact.id },
          form: { title: 'Add a person', fields: [] },
        });
        stage.addFormField({
          variable: 'age',
          component: 'Number',
          prompt: 'Their age',
        });
        stage.addPrompt({ text: 'Who do you know?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // Above maxValue: submit blocked, no node created.
        await stage.nameGenerator.openAddForm();
        await stage.form.fillNumber('age', '200');
        await page.getByRole('button', { name: 'Finished' }).click();
        await expect(stage.form.getFieldError('age')).toBeVisible();
        const afterBlocked = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterBlocked?.nodes ?? []).toHaveLength(0);

        // Valid value: submit succeeds and stores a real number (coerced).
        await stage.form.fillNumber('age', '30');
        await stage.nameGenerator.submitForm();
        const afterAdd = await protocol.getNetworkState(interview.interviewId);
        expect(afterAdd?.nodes).toHaveLength(1);
        const storedAge = afterAdd!.nodes[0]![entityAttributesProperty].age;
        expect(typeof storedAge).toBe('number');
        expect(storedAge).toBe(30);

        // Bin drag deletes the node.
        await stage.deleteNode('Contact');
        const afterDelete = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDelete?.nodes ?? []).toHaveLength(0);
        await expect(
          page.getByTestId('node-list').getByRole('option'),
        ).toHaveCount(0);
      },
    },

    {
      id: 'all-field-components-and-parameters',
      covers: ['codebook: variable.component', 'codebook: variable.parameters'],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });

        person.addVariable({
          id: 'v-text',
          name: 'freeText',
          type: 'text',
          component: 'Text',
        });
        person.addVariable({
          id: 'v-area',
          name: 'notes',
          type: 'text',
          component: 'TextArea',
        });
        person.addVariable({
          id: 'v-num',
          name: 'age',
          type: 'number',
          component: 'Number',
        });
        person.addVariable({
          id: 'v-radio',
          name: 'agreement',
          type: 'ordinal',
          component: 'RadioGroup',
        });
        person.addVariable({
          id: 'v-check',
          name: 'contexts',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Family', value: 'family' },
            { label: 'Work', value: 'work' },
            { label: 'School', value: 'school' },
            { label: 'Neighborhood', value: 'neighborhood' },
            { label: 'Church', value: 'church' },
            { label: 'Gym', value: 'gym' },
            { label: 'Online', value: 'online' },
          ],
        });
        person.addVariable({
          id: 'v-bool',
          name: 'isActive',
          type: 'boolean',
          component: 'Boolean',
        });
        person.addVariable({
          id: 'v-vas',
          name: 'closeness',
          type: 'scalar',
          component: 'VisualAnalogScale',
          validation: { minValue: 0, maxValue: 100 },
          parameters: { minLabel: 'Not at all', maxLabel: 'Extremely' },
        });
        person.addVariable({
          id: 'v-date',
          name: 'birthYear',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year' },
        });
        person.addVariable({
          id: 'v-reldate',
          name: 'recentContact',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2026-07-13', before: 30, after: 0 },
        });

        const stage = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'About this person', fields: [] },
        });
        stage.addFormField({
          variable: 'v-text',
          component: 'Text',
          prompt: 'Free text',
        });
        stage.addFormField({
          variable: 'v-area',
          component: 'TextArea',
          prompt: 'Notes',
        });
        stage.addFormField({
          variable: 'v-num',
          component: 'Number',
          prompt: 'Age',
        });
        stage.addFormField({
          variable: 'v-radio',
          component: 'RadioGroup',
          prompt: 'Agreement',
        });
        stage.addFormField({
          variable: 'v-check',
          component: 'CheckboxGroup',
          prompt: 'Contexts',
        });
        stage.addFormField({
          variable: 'v-bool',
          component: 'Boolean',
          prompt: 'Active tie',
        });
        stage.addFormField({
          variable: 'v-vas',
          component: 'VisualAnalogScale',
          prompt: 'Closeness',
        });
        stage.addFormField({
          variable: 'v-date',
          component: 'DatePicker',
          prompt: 'Birth year',
        });
        stage.addFormField({
          variable: 'v-reldate',
          component: 'RelativeDatePicker',
          prompt: 'Recent contact',
        });
        stage.addPrompt({ text: 'Tell us about this person.' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await stage.nameGenerator.openAddForm();

        await stage.form.fillText('v-text', 'Hello there');
        await stage.form.fillText('v-area', 'A longer note about them.');
        await stage.form.fillNumber('v-num', '42');
        await stage.form.selectRadio('v-radio', 'Agree');

        // CheckboxGroup with 7 options renders every option (columns layout).
        const checkField = page.locator('[data-field-name="v-check"]');
        await expect(checkField.getByRole('checkbox')).toHaveCount(7);
        await stage.form.selectCheckbox('v-check', 'Family');

        // Boolean renders Yes/No as radios.
        await page
          .locator('[data-field-name="v-bool"]')
          .getByRole('radio', { name: 'Yes' })
          .click();

        // VisualAnalogScale parameters render as min/max labels.
        const vasField = page.locator('[data-field-name="v-vas"]');
        await expect(vasField.getByText('Not at all')).toBeVisible();
        await expect(vasField.getByText('Extremely')).toBeVisible();
        const slider = vasField.getByRole('slider');
        await slider.focus();
        for (let i = 0; i < 5; i++) {
          await slider.press('ArrowRight');
        }

        // Parameter-bearing datetime pickers render their field containers.
        await expect(page.locator('[data-field-name="v-date"]')).toBeVisible();
        await expect(
          page.locator('[data-field-name="v-reldate"]'),
        ).toBeVisible();

        await stage.nameGenerator.submitForm();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.nodes).toHaveLength(1);
        const attrs = network!.nodes[0]![entityAttributesProperty];

        expect(typeof attrs['v-text']).toBe('string');
        expect(typeof attrs['v-area']).toBe('string');
        expect(typeof attrs['v-num']).toBe('number');
        expect(typeof attrs['v-radio']).toBe('number');
        expect(Array.isArray(attrs['v-check'])).toBe(true);
        expect(attrs['v-bool']).toBe(true);
        const vas = attrs['v-vas'];
        expect(typeof vas).toBe('number');
        if (typeof vas === 'number') {
          expect(vas).toBeGreaterThanOrEqual(0);
          expect(vas).toBeLessThanOrEqual(100);
        }
      },
    },

    {
      id: 'multi-prompt-navigation-and-scoping',
      covers: ['prompts', 'prompts[].id', 'prompts[].text'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        person.addVariable({
          id: 'person-name',
          name: 'personName',
          type: 'text',
          component: 'Text',
        });
        const stage = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
        });
        stage.addFormField({
          variable: 'person-name',
          component: 'Text',
          prompt: 'Their name',
        });
        stage.addPrompt({
          text: 'Who do you talk to about important matters?',
        });
        stage.addPrompt({ text: 'Who do you turn to for help?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await stage.nameGenerator.openAddForm();
        await stage.form.fillText('person-name', 'Carol');
        await stage.nameGenerator.submitForm();

        await expect(
          stage.getPrompt('Who do you talk to about important matters?'),
        ).toBeVisible();
        await expect(stage.getNode('Carol')).toBeVisible();
        await expect(
          page.getByTestId('node-list').getByRole('option'),
        ).toHaveCount(1);

        // Click next directly: this advances the PROMPT (not the stage), so
        // interview.next() (which waits for a URL step change) would hang.
        await interview.nextButton.click();

        await expect(
          stage.getPrompt('Who do you turn to for help?'),
        ).toBeVisible();
        // Carol is prompt-scoped out of the main list on prompt 2.
        await expect(stage.getNode('Carol')).not.toBeVisible();
        await expect(
          page.getByTestId('node-list').getByRole('option'),
        ).toHaveCount(0);
        // The stage did not advance (still step 0, node-list still present).
        expect(page.url()).toContain('step=0');
        await expect(page.getByTestId('node-list')).toBeVisible();

        // Carol still exists, scoped to prompt 1 only.
        const network = await protocol.getNetworkState(interview.interviewId);
        const carol = findNodeByLabel(network!, 'Carol');
        expect(carol?.promptIDs).toHaveLength(1);
      },
    },

    {
      id: 'prompt-additional-attributes',
      covers: ['prompts[].additionalAttributes'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        person.addVariable({
          id: 'person-name',
          name: 'personName',
          type: 'text',
          component: 'Text',
        });
        person.addVariable({
          id: 'close-friend',
          name: 'closeFriend',
          type: 'boolean',
        });
        const stage = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
        });
        stage.addFormField({
          variable: 'person-name',
          component: 'Text',
          prompt: 'Their name',
        });
        stage.addPrompt({
          text: 'Who are your close friends?',
          additionalAttributes: [{ variable: 'close-friend', value: true }],
        });
        stage.addPrompt({ text: 'Who else do you know?' });
        return synth;
      },
      run: async ({ stage, protocol, interview }) => {
        // Prompt 1: Dana gets closeFriend = true.
        await stage.nameGenerator.openAddForm();
        await stage.form.fillText('person-name', 'Dana');
        await stage.nameGenerator.submitForm();

        // Advance to prompt 2 (prompt advance, not stage advance).
        await interview.nextButton.click();
        await expect(stage.getPrompt('Who else do you know?')).toBeVisible();

        // Prompt 2: Eve gets no additionalAttributes.
        await stage.nameGenerator.openAddForm();
        await stage.form.fillText('person-name', 'Eve');
        await stage.nameGenerator.submitForm();

        const network = await protocol.getNetworkState(interview.interviewId);
        const dana = findNodeByLabel(network!, 'Dana');
        const eve = findNodeByLabel(network!, 'Eve');
        expect(dana).toBeDefined();
        expect(eve).toBeDefined();

        // Dana carries the prompt-1 boolean; Eve does not (it stays at its
        // creation-time default of null — never the prompt-1 `true`).
        expect(dana![entityAttributesProperty]['close-friend']).toBe(true);
        expect(eve![entityAttributesProperty]['close-friend']).not.toBe(true);
      },
    },

    {
      id: 'min-nodes-behaviour',
      covers: ['behaviours', 'behaviours.minNodes'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        person.addVariable({
          id: 'person-name',
          name: 'personName',
          type: 'text',
          component: 'Text',
        });
        const stage = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
          behaviours: { minNodes: 2 },
        });
        stage.addFormField({
          variable: 'person-name',
          component: 'Text',
          prompt: 'Their name',
        });
        stage.addPrompt({ text: 'Who do you know?' });
        // A trailing stage so a successful advance is observable.
        synth.addInformationStage({
          label: 'Done',
          title: 'All done',
          items: [{ id: 'done-1', type: 'text', content: 'Thanks.' }],
        });
        return synth;
      },
      run: async ({ page, stage, interview }) => {
        // 0 nodes: forward navigation blocked with a destructive toast.
        await interview.nextButton.click();
        const toast = page.getByText(/must create at least/i);
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('2');
        expect(page.url()).toContain('step=0');
        await expect(page.getByTestId('node-list')).toBeVisible();

        // Add two nodes, then advancing succeeds.
        for (const name of ['Anna', 'Ben']) {
          await stage.nameGenerator.openAddForm();
          await stage.form.fillText('person-name', name);
          await stage.nameGenerator.submitForm();
        }

        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'All done' }),
        ).toBeVisible();
      },
    },

    {
      id: 'max-nodes-behaviour',
      covers: ['behaviours.maxNodes'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        person.addVariable({
          id: 'person-name',
          name: 'personName',
          type: 'text',
          component: 'Text',
        });
        const stage = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
          behaviours: { maxNodes: 2 },
        });
        stage.addFormField({
          variable: 'person-name',
          component: 'Text',
          prompt: 'Their name',
        });
        stage.addPrompt({ text: 'Who do you know?' });
        return synth;
      },
      run: async ({ page, stage, interview }) => {
        for (const name of ['Anna', 'Ben']) {
          await stage.nameGenerator.openAddForm();
          await stage.form.fillText('person-name', name);
          await stage.nameGenerator.submitForm();
        }

        // Add control disabled + desaturated once maxNodes reached.
        const addButton = page.getByRole('button', { name: 'Add a person' });
        await expect(addButton).toBeDisabled();
        await expect(page.locator('[data-toggle-circle]')).toHaveClass(
          /saturate-0/,
        );

        // Completion toast and the next button enters its ready (pulse) state.
        await expect(
          page.getByText(/You have completed this task/i),
        ).toBeVisible();
        expect(await interview.nextButtonHasPulse()).toBe(true);

        // Force-clicking the disabled add control opens no dialog.
        await addButton.click({ force: true });
        await expect(page.getByRole('dialog')).toHaveCount(0);
      },
    },

    {
      id: 'existing-panel-round-trip-and-edge-filter',
      covers: [
        'panels',
        'panels[].id',
        'panels[].title',
        'panels[].dataSource=existing',
        'panels[].filter',
      ],
      visual: true,
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const colleague = synth.addEdgeType({ name: 'Colleague' });

        const setup = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Setup',
          subject: { entity: 'node', type: person.id },
          initialNodes: { count: 3, promptIndex: 0 },
        });
        setup.addPrompt({ text: 'Setup prompt' });

        // One edge between the first two setup nodes so the panel's edge
        // EXISTS filter passes for exactly 2 of the 3 seeded nodes.
        synth.addEdges([[0, 1]], colleague.id);

        const ng = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
        });
        ng.addFormField({ component: 'Text', prompt: 'Name' });
        ng.addPrompt({ text: 'Who is on your team?' });
        ng.addPanel({
          title: 'Previous interview',
          dataSource: 'existing',
          filter: FilterSchema.parse({
            join: 'AND',
            rules: [
              {
                id: 'edge-exists',
                type: 'edge',
                options: { type: colleague.id, operator: 'EXISTS' },
              },
            ],
          }),
        });

        return synth;
      },
      run: async ({ stage, protocol, interview }) => {
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Previous interview'))
          .toBe(2);

        // Grab one of the two filtered-in nodes by reading the panel's DOM,
        // rather than hardcoding a faker-generated name.
        const panelNode = stage.nodePanel
          .getPanel('Previous interview')
          .getByRole('option')
          .first();
        const label = (await panelNode.textContent())!.trim();

        const before = await protocol.getNetworkState(interview.interviewId);
        const totalNodesBefore = before!.nodes.length;

        await stage.nodePanel.dragNodeToMainList('Previous interview', label);
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Previous interview'))
          .toBe(1);
        await expect(stage.getNode(label)).toBeVisible();

        const afterDragIn = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragIn!.nodes.length).toBe(totalNodesBefore); // no new node
        const movedNode = findNodeByLabel(afterDragIn!, label);
        expect(movedNode?.promptIDs).toHaveLength(2);

        await stage.nodePanel.dragNodeFromMainListToPanel(
          label,
          'Previous interview',
        );
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Previous interview'))
          .toBe(2);

        const afterDragBack = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragBack!.nodes.length).toBe(totalNodesBefore);
        const restoredNode = findNodeByLabel(afterDragBack!, label);
        expect(restoredNode?.promptIDs).toHaveLength(1);
      },
    },

    {
      id: 'external-panel-filtered-round-trip',
      covers: ['panels[].dataSource=asset(external)', 'panels[].filter'],
      build: () => {
        const synth = new SyntheticInterview();
        // addNodeType auto-seeds a "name" text var used for external-data
        // label mapping; the boolean drives the panel filter.
        const person = synth.addNodeType({ name: 'Person' });
        person.addVariable({
          id: 'is-colleague',
          name: 'isColleague',
          type: 'boolean',
        });
        // The required form field references a component-bearing variable (the
        // adapter drops the field-level component, so the codebook variable
        // must carry it). The form itself is never used in this scenario.
        const formVar = person.addVariable({
          id: 'note',
          name: 'note',
          type: 'text',
          component: 'Text',
        });

        const assetId = 'contacts-network';
        synth.addAsset({
          id: assetId,
          name: 'contacts',
          type: 'network',
          source: 'contacts.json',
        });

        const ng = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
        });
        ng.addFormField({
          variable: formVar.id,
          component: 'Text',
          prompt: 'Note',
        });
        ng.addPrompt({ text: 'Who from your contacts do you see most?' });
        ng.addPanel({
          title: 'Contacts file',
          dataSource: assetId,
          filter: FilterSchema.parse({
            join: 'AND',
            rules: [
              {
                id: 'is-colleague-rule',
                type: 'node',
                options: {
                  type: person.id,
                  attribute: 'is-colleague',
                  operator: 'EXACTLY',
                  value: true,
                },
              },
            ],
          }),
        });

        return synth;
      },
      assets: [
        {
          assetId: 'contacts-network',
          name: 'contacts',
          type: 'network',
          source: 'contacts.json',
          localPath: path.join(FIXTURES_DIR, 'contacts-network.json'),
        },
      ],
      run: async ({ stage, protocol, interview }) => {
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Contacts file'))
          .toBe(4);

        const before = await protocol.getNetworkState(interview.interviewId);
        const totalNodesBefore = before!.nodes.length;

        await stage.nodePanel.dragNodeToMainList('Contacts file', 'Alice');
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Contacts file'))
          .toBe(3);

        const afterDragIn = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragIn!.nodes.length).toBe(totalNodesBefore + 1);
        const alice = findNodeByLabel(afterDragIn!, 'Alice');
        expect(alice).toBeDefined();
        // The colleague attribute came across from the external record.
        expect(alice![entityAttributesProperty]['is-colleague']).toBe(true);

        await stage.nodePanel.dragNodeFromMainListToPanel(
          'Alice',
          'Contacts file',
        );
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Contacts file'))
          .toBe(4);

        // External drop-back deletes (contrast with the existing-panel case).
        const afterDragBack = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragBack!.nodes.length).toBe(totalNodesBefore);
      },
    },

    {
      id: 'external-panel-error-state',
      covers: ['panels[].dataSource=asset(external)'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        // The required form field references a component-bearing variable (the
        // adapter drops the field-level component, so the codebook variable
        // must carry it).
        const formVar = person.addVariable({
          id: 'note',
          name: 'note',
          type: 'text',
          component: 'Text',
        });
        const ng = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person', fields: [] },
        });
        ng.addFormField({
          variable: formVar.id,
          component: 'Text',
          prompt: 'Note',
        });
        ng.addPrompt({ text: 'Who do you know?' });
        // An asset id that is never registered — the panel degrades to its
        // error state instead of crashing.
        ng.addPanel({ title: 'Broken source', dataSource: 'unknown-asset-id' });
        return synth;
      },
      run: async ({ page, stage }) => {
        // An unresolvable asset id degrades quietly: with only this empty
        // errored panel, the panels rail fully collapses (zero-size, so
        // hidden), which drops its toggle button from the accessibility tree.
        // Locate the panel by its text rather than the fixture's role-based
        // getPanel, mirroring the observed collapsed behaviour.
        const panel = page
          .getByTestId('node-panel')
          .filter({ hasText: 'Broken source' });
        await expect(panel).toBeAttached();
        await expect(panel).toBeHidden();
        await expect(panel.getByText('Something went wrong')).toBeAttached();
        await expect(
          panel.getByText('External data could not be loaded.'),
        ).toBeAttached();

        // No crash: the main list is present and the add flow still works.
        await expect(page.getByTestId('node-list')).toBeVisible();
        await stage.nameGenerator.openAddForm();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
    },
  ],
};
