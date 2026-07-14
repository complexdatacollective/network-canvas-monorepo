import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { SlidesFormFixture } from '../fixtures/slides-form-fixture.js';
import type { InterfaceScenarios } from './types.js';

const HEADER_SELECTOR =
  '[data-stage-section="form"] .sticky.top-0 button[aria-label]';

export const alterFormScenarios: InterfaceScenarios = {
  interfaceType: 'AlterForm',
  scenarios: [
    {
      id: 'intro-panel-and-mode-switch',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'subject',
        'introductionPanel',
      ],
      smoke: true,
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nickname = person.addVariable({
          id: 'nickname',
          name: 'Nickname',
          type: 'text',
          component: 'Text',
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          label: 'Menu-only label',
          interviewScript: 'Ask gently',
          introductionPanel: {
            title: 'About Each Person',
            text: 'Please give **details** about each person.',
          },
        });
        alterForm.addFormField({
          variable: nickname.id,
          component: 'Text',
          prompt: 'Nickname',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {
          [nickname.id]: 'Ada',
        });
        synth.addManualNode(alterForm.id, person.id, 'p2', {
          [nickname.id]: 'Grace',
        });
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview }) => {
        const slides = new SlidesFormFixture(page);

        await expect(
          page.getByRole('heading', { name: 'About Each Person' }),
        ).toBeVisible();
        // Markdown renders as elements, not literal syntax.
        await expect(
          page.locator('strong', { hasText: 'details' }),
        ).toBeVisible();
        // label is menu-only (no stages menu here); interviewScript never renders.
        await expect(page.getByText('Menu-only label')).toHaveCount(0);
        await expect(page.getByText('Ask gently')).toHaveCount(0);

        await interview.dismissIntro();
        await expect(
          page.locator('[data-stage-section="form"][data-stage-ready="true"]'),
        ).toBeVisible();
        await expect(slides.getCurrentItemLabel()).resolves.not.toBeNull();

        // Backwards from the first slide returns to the intro panel.
        await slides.previousSlide();
        await expect(slides.isOnIntro()).resolves.toBe(true);
      },
    },

    {
      id: 'slide-iteration-subject-and-persistence',
      covers: [
        'subject',
        'form',
        'form.fields[].variable',
        'form.fields[].prompt',
        'codebook.nodeType.colorAndShape',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({
          name: 'Person',
          color: 'node-color-seq-3',
        });
        // Dedupe-resolves to the auto-seeded "name" text variable so each
        // node gets a distinct header label (used to detect slide advance).
        const personName = person.addVariable({ name: 'name', type: 'text' });
        const nickname = person.addVariable({
          id: 'nickname',
          name: 'Nickname',
          type: 'text',
          component: 'Text',
        });
        const place = synth.addNodeType({ name: 'Place' });
        const placeName = place.addVariable({ name: 'name', type: 'text' });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: nickname.id,
          component: 'Text',
          prompt: 'Nickname',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {
          [personName.id]: 'Ada',
        });
        synth.addManualNode(alterForm.id, person.id, 'p2', {
          [personName.id]: 'Grace',
        });
        // A Place node proves subject scoping: it never appears as a slide.
        synth.addManualNode(alterForm.id, place.id, 'place1', {
          [placeName.id]: 'Office',
        });
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();
        const label1 = await slides.getCurrentItemLabel();
        expect(label1).toBe('Ada');

        // Header reflects codebook color-seq-3 + default circle shape.
        const header = page.locator(HEADER_SELECTOR);
        await expect(header).toHaveClass(/outline-node-3/);
        await expect(header).toHaveClass(/rounded-full/);

        await stage.form.fillText('nickname', 'Ziggy');
        await slides.nextSlide(label1);

        // Slide 2 (Grace): its own nickname is unset.
        await expect(
          page.locator('[data-field-name="nickname"] input'),
        ).toHaveValue('');

        // Back to slide 1: Ada's typed value was persisted and restored.
        await slides.previousSlide();
        await expect(
          page.locator('[data-field-name="nickname"] input'),
        ).toHaveValue('Ziggy');

        await slides.nextSlide('Ada');
        await stage.form.fillText('nickname', 'Moss');
        // The third advance leaves the stage: only 2 Person slides exist.
        await slides.nextSlide('Grace');
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const nodes = state?.nodes ?? [];
        const ada = nodes.find((n) => n[entityPrimaryKeyProperty] === 'p1');
        const grace = nodes.find((n) => n[entityPrimaryKeyProperty] === 'p2');
        const office = nodes.find(
          (n) => n[entityPrimaryKeyProperty] === 'place1',
        );
        expect(ada?.attributes.nickname).toBe('Ziggy');
        expect(grace?.attributes.nickname).toBe('Moss');
        expect(office?.attributes).not.toHaveProperty('nickname');
      },
    },

    {
      id: 'required-hint-and-validation-hints',
      covers: [
        'variable.validation.required',
        'form.fields[].hint',
        'form.fields[].showValidationHints',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const fullName = person.addVariable({
          id: 'fullName',
          name: 'FullName',
          type: 'text',
          component: 'Text',
          validation: { required: true },
        });
        const nickname = person.addVariable({
          id: 'nickname',
          name: 'Nickname',
          type: 'text',
          component: 'Text',
          validation: { minLength: 5 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: fullName.id,
          component: 'Text',
          prompt: 'Full name',
        });
        alterForm.addFormField({
          variable: nickname.id,
          component: 'Text',
          prompt: 'Nickname',
          hint: 'What friends call them',
          showValidationHints: true,
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // The plain hint and the validation-summary both render up front.
        await expect(page.getByText('What friends call them')).toBeVisible();
        await expect(
          page.getByText('Enter at least 5 characters.'),
        ).toBeVisible();

        // Submitting with the required field empty is blocked and stays put.
        const labelBefore = await slides.getCurrentItemLabel();
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('fullName')).toBeVisible();
        await expect(page.locator('[data-stage-section="form"]')).toBeVisible();
        await expect(slides.getCurrentItemLabel()).resolves.toBe(labelBefore);
        // focusFirstError moves focus into the required field (deferred).
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                !!document.activeElement?.closest(
                  '[data-field-name="fullName"]',
                ),
            ),
          )
          .toBe(true);

        await stage.form.fillText('fullName', 'Ada Lovelace');
        await slides.nextSlide(labelBefore);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
      },
    },

    {
      id: 'length-and-numeric-validation',
      covers: [
        'variable.validation.minLength',
        'variable.validation.maxLength',
        'variable.validation.minValue',
        'variable.validation.maxValue',
        'variable.type',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const bio = person.addVariable({
          id: 'bio',
          name: 'Bio',
          type: 'text',
          component: 'TextArea',
          validation: { minLength: 5, maxLength: 200 },
        });
        const age = person.addVariable({
          id: 'age',
          name: 'Age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 1, maxValue: 120 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: bio.id,
          component: 'TextArea',
          prompt: 'Bio',
        });
        alterForm.addFormField({
          variable: age.id,
          component: 'Number',
          prompt: 'Age',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        await stage.form.fillText('bio', 'abc');
        await stage.form.fillNumber('age', '200');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('bio')).toBeVisible();
        await expect(stage.form.getFieldError('age')).toBeVisible();
        await expect(page.locator('[data-stage-section="form"]')).toBeVisible();

        await stage.form.fillText('bio', 'A longer bio');
        await stage.form.fillNumber('age', '42');
        const label = await slides.getCurrentItemLabel();
        await slides.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state?.nodes[0]?.attributes ?? {};
        expect(attrs.bio).toBe('A longer bio');
        expect(typeof attrs.bio).toBe('string');
        expect(attrs.age).toBe(42);
        expect(typeof attrs.age).toBe('number');
      },
    },

    {
      id: 'categorical-min-max-selected',
      covers: [
        'variable.validation.minSelected',
        'variable.validation.maxSelected',
        'variable.options',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const interests = person.addVariable({
          id: 'interests',
          name: 'Interests',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Reading', value: 'reading' },
            { label: 'Sport', value: 'sport' },
            { label: 'Music', value: 'music' },
            { label: 'Art', value: 'art' },
          ],
          validation: { minSelected: 1, maxSelected: 2 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: interests.id,
          component: 'CheckboxGroup',
          prompt: 'Interests',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        await stage.form.selectCheckbox('interests', 'Reading');
        await stage.form.selectCheckbox('interests', 'Sport');
        await stage.form.selectCheckbox('interests', 'Music');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('interests')).toBeVisible();

        // Deselect Music to satisfy maxSelected: 2.
        const music = page
          .locator('[data-field-name="interests"]')
          .getByRole('checkbox', { name: 'Music', exact: true });
        await music.click();
        await expect(music).not.toBeChecked();

        const label = await slides.getCurrentItemLabel();
        await slides.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        // Categorical values persist as an array of the selected option values.
        expect(state?.nodes[0]?.attributes.interests).toEqual([
          'reading',
          'sport',
        ]);
      },
    },

    {
      id: 'cross-entity-unique-sameas-differentfrom',
      covers: [
        'variable.validation.unique',
        'variable.validation.sameAs',
        'variable.validation.differentFrom',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const personName = person.addVariable({ name: 'name', type: 'text' });
        const codeName = person.addVariable({
          id: 'codeName',
          name: 'CodeName',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        });
        const fieldA = person.addVariable({
          id: 'fieldA',
          name: 'FieldA',
          type: 'text',
          component: 'Text',
        });
        const fieldB = person.addVariable({
          id: 'fieldB',
          name: 'FieldB',
          type: 'text',
          component: 'Text',
          validation: { differentFrom: fieldA.id },
        });
        const fieldC = person.addVariable({
          id: 'fieldC',
          name: 'FieldC',
          type: 'text',
          component: 'Text',
          validation: { sameAs: fieldA.id },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: codeName.id,
          component: 'Text',
          prompt: 'Code name',
        });
        alterForm.addFormField({
          variable: fieldA.id,
          component: 'Text',
          prompt: 'Field A',
        });
        alterForm.addFormField({
          variable: fieldB.id,
          component: 'Text',
          prompt: 'Field B',
        });
        alterForm.addFormField({
          variable: fieldC.id,
          component: 'Text',
          prompt: 'Field C',
        });
        // Distinct labels so slide advancement is observable.
        synth.addManualNode(alterForm.id, person.id, 'p1', {
          [personName.id]: 'Ada',
        });
        synth.addManualNode(alterForm.id, person.id, 'p2', {
          [personName.id]: 'Grace',
        });
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();
        const label1 = await slides.getCurrentItemLabel();

        // Slide 1: satisfy sameAs/differentFrom, pick a codeName.
        await stage.form.fillText('codeName', 'same');
        await stage.form.fillText('fieldA', 'alpha');
        await stage.form.fillText('fieldB', 'beta'); // differs from fieldA: OK
        await stage.form.fillText('fieldC', 'alpha'); // sameAs fieldA: OK
        await slides.nextSlide(label1);

        // Slide 2: reuse codeName 'same' (blocked by unique), and violate
        // differentFrom/sameAs.
        await stage.form.fillText('codeName', 'same');
        await stage.form.fillText('fieldA', 'alpha');
        await stage.form.fillText('fieldB', 'alpha'); // == fieldA: violates differentFrom
        await stage.form.fillText('fieldC', 'zzz'); // != fieldA: violates sameAs
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('codeName')).toBeVisible();
        await expect(stage.form.getFieldError('fieldB')).toBeVisible();
        await expect(stage.form.getFieldError('fieldC')).toBeVisible();

        // Fix all three.
        await stage.form.fillText('codeName', 'different');
        await stage.form.fillText('fieldB', 'gamma');
        await stage.form.fillText('fieldC', 'alpha');
        await slides.nextSlide(await slides.getCurrentItemLabel());

        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
        const state = await protocol.getNetworkState(interview.interviewId);
        const [n1, n2] = state?.nodes ?? [];
        expect(n1?.attributes.codeName).toBe('same');
        expect(n2?.attributes.codeName).toBe('different');
        expect(n2?.attributes.fieldB).toBe('gamma');
        expect(n2?.attributes.fieldC).toBe('alpha');
      },
    },

    {
      id: 'comparator-validation-greaterthan-family',
      covers: [
        'variable.validation.greaterThanVariable',
        'variable.validation.greaterThanOrEqualToVariable',
        'variable.validation.lessThanVariable',
        'variable.validation.lessThanOrEqualToVariable',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const start = person.addVariable({
          id: 'start',
          name: 'Start',
          type: 'number',
          component: 'Number',
        });
        const end = person.addVariable({
          id: 'end',
          name: 'End',
          type: 'number',
          component: 'Number',
          validation: { greaterThanVariable: 'start' },
        });
        const floor = person.addVariable({
          id: 'floor',
          name: 'Floor',
          type: 'number',
          component: 'Number',
        });
        const ceiling = person.addVariable({
          id: 'ceiling',
          name: 'Ceiling',
          type: 'number',
          component: 'Number',
          validation: { greaterThanOrEqualToVariable: 'floor' },
        });
        const cap = person.addVariable({
          id: 'cap',
          name: 'Cap',
          type: 'number',
          component: 'Number',
          validation: { lessThanVariable: 'end' },
        });
        const capEq = person.addVariable({
          id: 'capEq',
          name: 'CapEqual',
          type: 'number',
          component: 'Number',
          validation: { lessThanOrEqualToVariable: 'end' },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        for (const [variable, prompt] of [
          [start.id, 'Start'],
          [end.id, 'End'],
          [floor.id, 'Floor'],
          [ceiling.id, 'Ceiling'],
          [cap.id, 'Cap'],
          [capEq.id, 'Cap equal'],
        ] as const) {
          alterForm.addFormField({ variable, component: 'Number', prompt });
        }
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // end < start and ceiling < floor are invalid; cap/capEq are valid
        // (both already below end).
        await stage.form.fillNumber('start', '10');
        await stage.form.fillNumber('end', '5');
        await stage.form.fillNumber('floor', '10');
        await stage.form.fillNumber('ceiling', '9');
        await stage.form.fillNumber('cap', '3');
        await stage.form.fillNumber('capEq', '5');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('end')).toBeVisible();
        await expect(stage.form.getFieldError('ceiling')).toBeVisible();
        await expect(stage.form.getFieldError('cap')).toHaveCount(0);
        await expect(stage.form.getFieldError('capEq')).toHaveCount(0);

        await stage.form.fillNumber('end', '15');
        await stage.form.fillNumber('ceiling', '10');
        const label = await slides.getCurrentItemLabel();
        await slides.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state?.nodes[0]?.attributes ?? {};
        for (const [key, value] of [
          ['start', 10],
          ['end', 15],
          ['floor', 10],
          ['ceiling', 10],
          ['cap', 3],
          ['capEq', 5],
        ] as const) {
          expect(attrs[key]).toBe(value);
          expect(typeof attrs[key]).toBe('number');
        }
      },
    },

    {
      id: 'kitchen-sink-components-and-ready-state',
      covers: [
        'variable.component',
        'variable.parameters.vas',
        'variable.parameters.datePicker',
        'variable.parameters.relativeDatePicker',
        'readyStateScrollGating',
      ],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const text = person.addVariable({
          id: 'text',
          name: 'Text',
          type: 'text',
          component: 'Text',
        });
        const textArea = person.addVariable({
          id: 'textArea',
          name: 'Bio',
          type: 'text',
          component: 'TextArea',
        });
        const number = person.addVariable({
          id: 'number',
          name: 'Age',
          type: 'number',
          component: 'Number',
        });
        const boolean = person.addVariable({
          id: 'boolean',
          name: 'Confirmed',
          type: 'boolean',
          component: 'Boolean',
        });
        const toggle = person.addVariable({
          id: 'toggle',
          name: 'Consent',
          type: 'boolean',
          component: 'Toggle',
        });
        const radio = person.addVariable({
          id: 'radio',
          name: 'Closeness',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Not close', value: 1 },
            { label: 'Close', value: 2 },
            { label: 'Very close', value: 3 },
          ],
        });
        const likert = person.addVariable({
          id: 'likert',
          name: 'Frequency',
          type: 'ordinal',
          component: 'LikertScale',
          options: [
            { label: 'Rarely', value: 1 },
            { label: 'Sometimes', value: 2 },
            { label: 'Often', value: 3 },
          ],
        });
        const checkbox = person.addVariable({
          id: 'checkbox',
          name: 'Interests',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Reading', value: 'reading' },
            { label: 'Sport', value: 'sport' },
          ],
        });
        const toggleButtons = person.addVariable({
          id: 'toggleButtons',
          name: 'Traits',
          type: 'categorical',
          component: 'ToggleButtonGroup',
          options: [
            { label: 'Kind', value: 'kind' },
            { label: 'Funny', value: 'funny' },
          ],
        });
        const vas = person.addVariable({
          id: 'vas',
          name: 'ClosenessScale',
          type: 'scalar',
          component: 'VisualAnalogScale',
          parameters: { minLabel: 'Not at all', maxLabel: 'Extremely' },
          validation: { minValue: 20, maxValue: 80 },
        });
        const datePicker = person.addVariable({
          id: 'datePicker',
          name: 'MetOn',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month' },
        });
        const relativeDatePicker = person.addVariable({
          id: 'relativeDatePicker',
          name: 'LastContact',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2026-01-01', before: 30, after: 0 },
        });

        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: text.id,
          component: 'Text',
          prompt: 'Text',
        });
        alterForm.addFormField({
          variable: textArea.id,
          component: 'TextArea',
          prompt: 'Bio',
        });
        alterForm.addFormField({
          variable: number.id,
          component: 'Number',
          prompt: 'Age',
        });
        alterForm.addFormField({
          variable: boolean.id,
          component: 'Boolean',
          prompt: 'Confirmed',
        });
        alterForm.addFormField({
          variable: toggle.id,
          component: 'Toggle',
          prompt: 'Consent',
        });
        alterForm.addFormField({
          variable: radio.id,
          component: 'RadioGroup',
          prompt: 'Closeness',
        });
        alterForm.addFormField({
          variable: likert.id,
          component: 'LikertScale',
          prompt: 'Frequency',
        });
        alterForm.addFormField({
          variable: checkbox.id,
          component: 'CheckboxGroup',
          prompt: 'Interests',
        });
        alterForm.addFormField({
          variable: toggleButtons.id,
          component: 'ToggleButtonGroup',
          prompt: 'Traits',
        });
        alterForm.addFormField({
          variable: vas.id,
          component: 'VisualAnalogScale',
          prompt: 'Closeness scale',
        });
        alterForm.addFormField({
          variable: datePicker.id,
          component: 'DatePicker',
          prompt: 'Met on',
        });
        alterForm.addFormField({
          variable: relativeDatePicker.id,
          component: 'RelativeDatePicker',
          prompt: 'Last contact',
        });

        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();

        // VAS physical bounds mirror validation.minValue/maxValue.
        const vasSlider = page
          .locator('[data-field-name="vas"]')
          .getByRole('slider');
        await expect(vasSlider).toHaveAttribute('min', '20');
        await expect(vasSlider).toHaveAttribute('max', '80');
        await expect(page.getByText('Not at all')).toBeVisible();
        await expect(page.getByText('Extremely')).toBeVisible();

        // Not scrolled to the bottom yet: no pulse.
        expect(await interview.nextButtonHasPulse()).toBe(false);

        await stage.form.fillText('text', 'Hello');
        await stage.form.fillText('textArea', 'A bio');
        await stage.form.fillNumber('number', '42');
        await stage.form.selectRadio('boolean', 'Yes');
        // Toggle: fresco-ui ToggleField renders role="switch".
        await page
          .locator('[data-field-name="toggle"]')
          .getByRole('switch')
          .click();
        await stage.form.selectRadio('radio', 'Very close');
        await stage.form.selectLikert('likert', 'Often');
        await stage.form.selectCheckbox('checkbox', 'Reading');
        await stage.form.selectToggleButton('toggleButtons', 'Kind');

        // VAS -> max via keyboard (End), same pattern as selectLikert.
        await vasSlider.focus();
        await vasSlider.press('End');
        // Blur explicitly so the VAS validate-on-blur commits before the next
        // field is touched. The store's setFieldValue re-dispatches sibling
        // validations it supersedes (formStore.ts), but that capture only sees
        // validations that have already STARTED — leaving the blur to the
        // DatePicker selectOption below (which focuses the <select> and
        // dispatches its change in one synchronous task) still races on
        // Firefox/WebKit and can leave the vas field isValid=false with no
        // error, so the ready pulse never appears.
        await vasSlider.blur();

        // Month-resolution DatePicker: two native <select>s (year, then month).
        const dateSelects = page
          .locator('[data-field-name="datePicker"]')
          .locator('select');
        await dateSelects.nth(0).selectOption('2024');
        await dateSelects.nth(1).selectOption('06');

        await stage.form.fillDate('relativeDatePicker', '2025-12-15');

        // Date fields register invalid until they validate (formStore.ts:138),
        // and validation runs on blur (useField.ts:274). selectOption does not
        // leave the DatePicker's <select> focused and nothing follows the
        // RelativeDatePicker, so neither blurs naturally — focus then blur each
        // so the whole form reads valid (a prerequisite for the pulse).
        await dateSelects.nth(1).focus();
        await dateSelects.nth(1).blur();
        await page
          .locator('[data-field-name="relativeDatePicker"] input')
          .blur();

        // Scroll the slide's ScrollArea to the bottom so the
        // useScrolledToBottom sentinel intersects, satisfying the
        // scroll-gated ready state.
        await page
          .locator('[data-stage-section="form"] section')
          .last()
          .evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });

        await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

        const label = await slides.getCurrentItemLabel();
        await slides.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state?.nodes[0]?.attributes ?? {};
        expect(attrs.text).toBe('Hello');
        expect(attrs.textArea).toBe('A bio');
        expect(attrs.number).toBe(42);
        expect(typeof attrs.number).toBe('number');
        expect(attrs.boolean).toBe(true);
        expect(attrs.toggle).toBe(true);
        expect(attrs.radio).toBe(3);
        expect(attrs.likert).toBe(3);
        expect(attrs.checkbox).toEqual(['reading']);
        expect(attrs.toggleButtons).toEqual(['kind']);
        expect(attrs.vas).toBe(80);
        expect(attrs.datePicker).toBe('2024-06');
        expect(attrs.relativeDatePicker).toBe('2025-12-15');
      },
    },

    {
      id: 'backwards-nav-discard-and-autosave',
      covers: ['backNav.discardDialog', 'backNav.autosave'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const personName = person.addVariable({ name: 'name', type: 'text' });
        const age = person.addVariable({
          id: 'age',
          name: 'Age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 0, maxValue: 120 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: age.id,
          component: 'Number',
          prompt: 'Age',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {
          [personName.id]: 'Ada',
          [age.id]: 30,
        });
        synth.addManualNode(alterForm.id, person.id, 'p2', {
          [personName.id]: 'Grace',
          [age.id]: 40,
        });
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.dismissIntro();
        const label1 = await slides.getCurrentItemLabel();
        await slides.nextSlide(label1); // slide 1 (Ada, valid) -> slide 2 (Grace)

        // Slide 2: enter an invalid value, go back — expect the discard dialog.
        await stage.form.fillNumber('age', '999');
        const dialog = await slides.previousSlideExpectingDiscardDialog();
        await expect(
          dialog.getByRole('heading', { name: 'Discard changes?' }),
        ).toBeVisible();

        // Cancel: stays on slide 2, typed value intact.
        await slides.discardCancelButton.click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('[data-field-name="age"] input')).toHaveValue(
          '999',
        );

        // Go back again and confirm this time.
        await slides.previousSlideExpectingDiscardDialog();
        await slides.discardConfirmButton.click();
        await expect(slides.getCurrentItemLabel()).resolves.toBe(label1);

        let state = await protocol.getNetworkState(interview.interviewId);
        expect(state?.nodes[1]?.attributes.age).toBe(40); // invalid 999 NOT persisted

        // Forward again, enter a VALID value, go back (autosave, no dialog).
        await slides.nextSlide(label1);
        await stage.form.fillNumber('age', '55');
        await slides.previousSlide();
        await expect(slides.isOnIntro()).resolves.toBe(false);
        await expect(slides.getCurrentItemLabel()).resolves.toBe(label1);

        state = await protocol.getNetworkState(interview.interviewId);
        expect(state?.nodes[1]?.attributes.age).toBe(55); // valid dirty value autosaved
      },
    },

    {
      id: 'empty-item-list-short-circuit',
      covers: ['emptyItemShortCircuit'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const name = person.addVariable({
          id: 'personLabel',
          name: 'Label',
          type: 'text',
          component: 'Text',
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: name.id,
          component: 'Text',
          prompt: 'Label',
        });
        // Intentionally no addManualNode calls: zero Person nodes exist.
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview }) => {
        // No subject-type nodes: the stage passes straight through on next.
        // The form section never paints (AlterForm returns null then
        // moveForward()s), so dismissIntro()'s wait for it would never
        // resolve — advance with next() and observe the following stage.
        await expect(page.locator('[data-stage-section="form"]')).toHaveCount(
          0,
        );
        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
        await expect(page.locator('[data-stage-section="form"]')).toHaveCount(
          0,
        );
      },
    },

    {
      id: 'encrypted-variable-with-anonymisation',
      covers: ['variable.encrypted'],
      slow: true,
      seedNetwork: true,
      // Start on the AlterForm (step 1) so neither auto aria snapshot lands on
      // the Anonymisation stage, whose EncryptedBackground renders unseeded
      // random names (Math.random, EncryptedBackground.tsx) that would make the
      // snapshot flaky. The passphrase is set by navigating back to step 0.
      currentStep: 1,
      build: () => {
        const synth = new SyntheticInterview();
        synth.setExperiments({ encryptedVariables: true });
        const person = synth.addNodeType({ name: 'Person' });
        const secret = person.addVariable({
          id: 'secret',
          name: 'Secret',
          type: 'text',
          component: 'Text',
          encrypted: true,
        });
        synth.addStage('Anonymisation');
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: secret.id,
          component: 'Text',
          prompt: 'Secret',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);

        // Set the passphrase on the Anonymisation stage (step 0), then return.
        await interview.goto(0);
        await page
          .getByRole('textbox', { name: 'Passphrase', exact: true })
          .fill('correct horse battery staple');
        await page
          .getByRole('textbox', { name: 'Confirm Passphrase' })
          .fill('correct horse battery staple');
        await page.getByRole('button', { name: 'Submit' }).click();
        await expect(
          page.getByText('Passphrase set successfully!'),
        ).toBeVisible();
        await interview.next(); // -> AlterForm (step 1)

        await interview.dismissIntro();
        await stage.form.fillText('secret', 'Secret');
        await slides.nextSlide(await slides.getCurrentItemLabel());
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        // The stored value is ciphertext (a number[]), never the plaintext.
        expect(state?.nodes[0]?.attributes.secret).not.toBe('Secret');
      },
    },
  ],
};
