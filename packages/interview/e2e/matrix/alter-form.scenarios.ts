import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { SlidesFormFixture } from '../fixtures/slides-form-fixture.js';
import { e2eVariableId } from '../helpers/codebook-ids.js';
import type { InterfaceScenarios } from './types.js';

// The ids of the variables these scenarios name.
const AGE = e2eVariableId('age');
const BIO = e2eVariableId('bio');
const BOOLEAN = e2eVariableId('boolean');
const CAP = e2eVariableId('cap');
const CAP_EQ = e2eVariableId('capEq');
const CEILING = e2eVariableId('ceiling');
const CHECKBOX = e2eVariableId('checkbox');
const CLOSENESS = e2eVariableId('closeness');
const CODE_NAME = e2eVariableId('codeName');
const DATE_PICKER = e2eVariableId('datePicker');
const END = e2eVariableId('end');
const FIELD_A = e2eVariableId('fieldA');
const FIELD_B = e2eVariableId('fieldB');
const FIELD_C = e2eVariableId('fieldC');
const FLOOR = e2eVariableId('floor');
const FULL_NAME = e2eVariableId('fullName');
const INTERESTS = e2eVariableId('interests');
const LIKERT = e2eVariableId('likert');
const NICKNAME = e2eVariableId('nickname');
const NUMBER = e2eVariableId('number');
const PERSON_LABEL = e2eVariableId('personLabel');
const RADIO = e2eVariableId('radio');
const RELATIVE_DATE_PICKER = e2eVariableId('relativeDatePicker');
const SECRET = e2eVariableId('secret');
const START = e2eVariableId('start');
const TEXT = e2eVariableId('text');
const TEXT_AREA = e2eVariableId('textArea');
const TOGGLE = e2eVariableId('toggle');
const TOGGLE_BUTTONS = e2eVariableId('toggleButtons');
const TRUST = e2eVariableId('trust');
const VAS = e2eVariableId('vas');

const HEADER_SELECTOR =
  '[data-stage-section="form"] [data-slide-header] button[aria-label]';

export const alterFormScenarios: InterfaceScenarios = {
  interfaceType: 'AlterForm',
  scenarios: [
    {
      id: 'opens-on-first-item-and-back-leaves-stage',
      covers: ['type', 'id', 'label', 'interviewScript', 'subject'],
      smoke: true,
      visual: true,
      seedNetwork: true,
      currentStep: 1,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nickname = person.addVariable({
          id: NICKNAME,
          name: 'Nickname',
          type: 'text',
          component: 'Text',
        });
        synth.addInformationStage({ title: 'Previous stage' });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          label: 'Menu-only label',
          interviewScript: 'Ask gently',
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        const slides = new SlidesFormFixture(page);

        // The stage opens directly on the first person's questions.
        await interview.waitForForm();
        await expect(slides.getCurrentItemLabel()).resolves.not.toBeNull();
        await expect(stage.form.field(NICKNAME).locator('input')).toBeVisible();
        // label is menu-only (no stages menu here); interviewScript never renders.
        await expect(page.getByText('Menu-only label')).toHaveCount(0);
        await expect(page.getByText('Ask gently')).toHaveCount(0);

        // Backwards from the first slide leaves the stage.
        await slides.previousSlide();
        await expect(page).toHaveURL(/step=0/);
        await expect(
          page.getByRole('heading', { name: 'Previous stage' }),
        ).toBeVisible();
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
          id: NICKNAME,
          name: 'Nickname',
          type: 'text',
          component: 'Text',
        });
        const place = synth.addNodeType({ name: 'Place' });
        const placeName = place.addVariable({ name: 'name', type: 'text' });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();
        const label1 = await slides.getCurrentItemLabel();
        expect(label1).toBe('Ada');

        // Header reflects codebook color-seq-3 + default circle shape.
        const header = page.locator(HEADER_SELECTOR);
        await expect(header).toHaveClass(/outline-node-3/);
        await expect(header).toHaveClass(/rounded-full/);

        await stage.form.fillText(NICKNAME, 'Ziggy');
        await slides.nextSlide(label1);

        // Slide 2 (Grace): its own nickname is unset.
        await expect(stage.form.field(NICKNAME).locator('input')).toHaveValue(
          '',
        );

        // Back to slide 1: Ada's typed value was persisted and restored.
        await slides.previousSlide();
        await expect(stage.form.field(NICKNAME).locator('input')).toHaveValue(
          'Ziggy',
        );

        await slides.nextSlide('Ada');
        await stage.form.fillText(NICKNAME, 'Moss');
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
        expect(ada?.attributes[NICKNAME]).toBe('Ziggy');
        expect(grace?.attributes[NICKNAME]).toBe('Moss');
        expect(office?.attributes).not.toHaveProperty(NICKNAME);
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
          id: FULL_NAME,
          name: 'FullName',
          type: 'text',
          component: 'Text',
          validation: { required: true },
        });
        const nickname = person.addVariable({
          id: NICKNAME,
          name: 'Nickname',
          type: 'text',
          component: 'Text',
          validation: { minLength: 5 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();

        // The plain hint and the validation-summary both render up front.
        await expect(page.getByText('What friends call them')).toBeVisible();
        await expect(
          page.getByText('Enter at least 5 characters.'),
        ).toBeVisible();

        // Submitting with the required field empty is blocked and stays put.
        const labelBefore = await slides.getCurrentItemLabel();
        await interview.nextButton.click();
        await expect(stage.form.getFieldError(FULL_NAME)).toBeVisible();
        await expect(page.locator('[data-stage-section="form"]')).toBeVisible();
        await expect(slides.getCurrentItemLabel()).resolves.toBe(labelBefore);
        // focusFirstError moves focus into the required field on the commit
        // that renders the error (#1385) — read it immediately, since a
        // polling assertion would also pass on the deferred focus that used to
        // leave the participant on `document.body` for up to two seconds.
        expect(await stage.form.focusIsInside(FULL_NAME)).toBe(true);

        await stage.form.fillText(FULL_NAME, 'Ada Lovelace');
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
          id: BIO,
          name: 'Bio',
          type: 'text',
          component: 'TextArea',
          validation: { minLength: 5, maxLength: 200 },
        });
        const age = person.addVariable({
          id: AGE,
          name: 'Age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 1, maxValue: 120 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();

        await stage.form.fillText(BIO, 'abc');
        await stage.form.fillNumber(AGE, '200');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError(BIO)).toBeVisible();
        await expect(stage.form.getFieldError(AGE)).toBeVisible();
        await expect(page.locator('[data-stage-section="form"]')).toBeVisible();

        await stage.form.fillText(BIO, 'A longer bio');
        await stage.form.fillNumber(AGE, '42');
        const label = await slides.getCurrentItemLabel();
        await slides.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state?.nodes[0]?.attributes ?? {};
        expect(attrs[BIO]).toBe('A longer bio');
        expect(typeof attrs[BIO]).toBe('string');
        expect(attrs[AGE]).toBe(42);
        expect(typeof attrs[AGE]).toBe('number');
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
          id: INTERESTS,
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
        });
        alterForm.addFormField({
          variable: interests.id,
          component: 'CheckboxGroup',
          prompt: 'Interests',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();

        await stage.form.selectCheckbox(INTERESTS, 'Reading');
        await stage.form.selectCheckbox(INTERESTS, 'Sport');
        await stage.form.selectCheckbox(INTERESTS, 'Music');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError(INTERESTS)).toBeVisible();

        // Deselect Music to satisfy maxSelected: 2.
        const music = stage.form
          .field(INTERESTS)
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
        expect(state?.nodes[0]?.attributes[INTERESTS]).toEqual([
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
          id: CODE_NAME,
          name: 'CodeName',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        });
        const fieldA = person.addVariable({
          id: FIELD_A,
          name: 'FieldA',
          type: 'text',
          component: 'Text',
        });
        const fieldB = person.addVariable({
          id: FIELD_B,
          name: 'FieldB',
          type: 'text',
          component: 'Text',
          validation: { differentFrom: fieldA.id },
        });
        const fieldC = person.addVariable({
          id: FIELD_C,
          name: 'FieldC',
          type: 'text',
          component: 'Text',
          validation: { sameAs: fieldA.id },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();
        const label1 = await slides.getCurrentItemLabel();

        // Slide 1: satisfy sameAs/differentFrom, pick a codeName.
        await stage.form.fillText(CODE_NAME, 'same');
        await stage.form.fillText(FIELD_A, 'alpha');
        await stage.form.fillText(FIELD_B, 'beta'); // differs from fieldA: OK
        await stage.form.fillText(FIELD_C, 'alpha'); // sameAs fieldA: OK
        await slides.nextSlide(label1);

        // Slide 2: reuse codeName 'same' (blocked by unique), and violate
        // differentFrom/sameAs.
        await stage.form.fillText(CODE_NAME, 'same');
        await stage.form.fillText(FIELD_A, 'alpha');
        await stage.form.fillText(FIELD_B, 'alpha'); // == fieldA: violates differentFrom
        await stage.form.fillText(FIELD_C, 'zzz'); // != fieldA: violates sameAs
        await interview.nextButton.click();
        await expect(stage.form.getFieldError(CODE_NAME)).toBeVisible();
        await expect(stage.form.getFieldError(FIELD_B)).toBeVisible();
        await expect(stage.form.getFieldError(FIELD_C)).toBeVisible();

        // Fix all three.
        await stage.form.fillText(CODE_NAME, 'different');
        await stage.form.fillText(FIELD_B, 'gamma');
        await stage.form.fillText(FIELD_C, 'alpha');
        await slides.nextSlide(await slides.getCurrentItemLabel());

        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
        const state = await protocol.getNetworkState(interview.interviewId);
        const [n1, n2] = state?.nodes ?? [];
        expect(n1?.attributes[CODE_NAME]).toBe('same');
        expect(n2?.attributes[CODE_NAME]).toBe('different');
        expect(n2?.attributes[FIELD_B]).toBe('gamma');
        expect(n2?.attributes[FIELD_C]).toBe('alpha');
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
          id: START,
          name: 'Start',
          type: 'number',
          component: 'Number',
        });
        const end = person.addVariable({
          id: END,
          name: 'End',
          type: 'number',
          component: 'Number',
          validation: { greaterThanVariable: START },
        });
        const floor = person.addVariable({
          id: FLOOR,
          name: 'Floor',
          type: 'number',
          component: 'Number',
        });
        const ceiling = person.addVariable({
          id: CEILING,
          name: 'Ceiling',
          type: 'number',
          component: 'Number',
          validation: { greaterThanOrEqualToVariable: FLOOR },
        });
        const cap = person.addVariable({
          id: CAP,
          name: 'Cap',
          type: 'number',
          component: 'Number',
          validation: { lessThanVariable: END },
        });
        const capEq = person.addVariable({
          id: CAP_EQ,
          name: 'CapEqual',
          type: 'number',
          component: 'Number',
          validation: { lessThanOrEqualToVariable: END },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();

        // end < start and ceiling < floor are invalid; cap/capEq are valid
        // (both already below end).
        await stage.form.fillNumber(START, '10');
        await stage.form.fillNumber(END, '5');
        await stage.form.fillNumber(FLOOR, '10');
        await stage.form.fillNumber(CEILING, '9');
        await stage.form.fillNumber(CAP, '3');
        await stage.form.fillNumber(CAP_EQ, '5');
        await interview.nextButton.click();
        await expect(stage.form.getFieldError(END)).toBeVisible();
        await expect(stage.form.getFieldError(CEILING)).toBeVisible();
        await expect(stage.form.getFieldError(CAP)).toHaveCount(0);
        await expect(stage.form.getFieldError(CAP_EQ)).toHaveCount(0);

        await stage.form.fillNumber(END, '15');
        await stage.form.fillNumber(CEILING, '10');
        const label = await slides.getCurrentItemLabel();
        await slides.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state?.nodes[0]?.attributes ?? {};
        for (const [key, value] of [
          [START, 10],
          [END, 15],
          [FLOOR, 10],
          [CEILING, 10],
          [CAP, 3],
          [CAP_EQ, 5],
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
          id: TEXT,
          name: 'Text',
          type: 'text',
          component: 'Text',
        });
        const textArea = person.addVariable({
          id: TEXT_AREA,
          name: 'Bio',
          type: 'text',
          component: 'TextArea',
        });
        const number = person.addVariable({
          id: NUMBER,
          name: 'Age',
          type: 'number',
          component: 'Number',
        });
        const boolean = person.addVariable({
          id: BOOLEAN,
          name: 'Confirmed',
          type: 'boolean',
          component: 'Boolean',
        });
        const toggle = person.addVariable({
          id: TOGGLE,
          name: 'Consent',
          type: 'boolean',
          component: 'Toggle',
        });
        const radio = person.addVariable({
          id: RADIO,
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
          id: LIKERT,
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
          id: CHECKBOX,
          name: 'Interests',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Reading', value: 'reading' },
            { label: 'Sport', value: 'sport' },
          ],
        });
        const toggleButtons = person.addVariable({
          id: TOGGLE_BUTTONS,
          name: 'Traits',
          type: 'categorical',
          component: 'ToggleButtonGroup',
          options: [
            { label: 'Kind', value: 'kind' },
            { label: 'Funny', value: 'funny' },
          ],
        });
        const vas = person.addVariable({
          id: VAS,
          name: 'ClosenessScale',
          type: 'scalar',
          component: 'VisualAnalogScale',
          parameters: { minLabel: 'Not at all', maxLabel: 'Extremely' },
        });
        const datePicker = person.addVariable({
          id: DATE_PICKER,
          name: 'MetOn',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month' },
        });
        const relativeDatePicker = person.addVariable({
          id: RELATIVE_DATE_PICKER,
          name: 'LastContact',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2026-01-01', before: 30, after: 0 },
        });

        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();

        // Scalar values use the protocol's normalized 0-1 range.
        const vasSlider = stage.form.field(VAS).getByRole('slider');
        await expect(vasSlider).toHaveAttribute('min', '0');
        await expect(vasSlider).toHaveAttribute('max', '1');
        await expect(page.getByText('Not at all')).toBeVisible();
        await expect(page.getByText('Extremely')).toBeVisible();

        // Not scrolled to the bottom yet: no pulse.
        await interview.expectNotReadyToContinue();

        await stage.form.fillText(TEXT, 'Hello');
        await stage.form.fillText(TEXT_AREA, 'A bio');
        await stage.form.fillNumber(NUMBER, '42');
        await stage.form.selectRadio(BOOLEAN, 'Yes');
        // Toggle: fresco-ui ToggleField renders role="switch".
        await stage.form.field(TOGGLE).getByRole('switch').click();
        await stage.form.selectRadio(RADIO, 'Very close');
        await stage.form.selectLikert(LIKERT, 'Often');
        await stage.form.selectCheckbox(CHECKBOX, 'Reading');
        await stage.form.selectToggleButton(TOGGLE_BUTTONS, 'Kind');

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
        const dateSelects = stage.form.field(DATE_PICKER).locator('select');
        await dateSelects.nth(0).selectOption('2024');
        await dateSelects.nth(1).selectOption('06');

        await stage.form.fillDate(RELATIVE_DATE_PICKER, '2025-12-15');

        // Date fields register invalid until they validate (formStore.ts:138),
        // and validation runs on blur (useField.ts:274). selectOption does not
        // leave the DatePicker's <select> focused and nothing follows the
        // RelativeDatePicker, so neither blurs naturally — focus then blur each
        // so the whole form reads valid (a prerequisite for the pulse).
        await dateSelects.nth(1).focus();
        await dateSelects.nth(1).blur();
        await stage.form.field(RELATIVE_DATE_PICKER).locator('input').blur();

        // Scroll the slide's ScrollArea to the bottom so the
        // useScrolledToBottom sentinel intersects, satisfying the
        // scroll-gated ready state.
        await page
          .locator('[data-stage-section="form"] section')
          .last()
          .evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });

        await interview.expectReadyToContinue();

        const label = await slides.getCurrentItemLabel();
        await slides.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state?.nodes[0]?.attributes ?? {};
        expect(attrs[TEXT]).toBe('Hello');
        expect(attrs[TEXT_AREA]).toBe('A bio');
        expect(attrs[NUMBER]).toBe(42);
        expect(typeof attrs[NUMBER]).toBe('number');
        expect(attrs[BOOLEAN]).toBe(true);
        expect(attrs[TOGGLE]).toBe(true);
        expect(attrs[RADIO]).toBe(3);
        expect(attrs[LIKERT]).toBe(3);
        expect(attrs[CHECKBOX]).toEqual(['reading']);
        expect(attrs[TOGGLE_BUTTONS]).toEqual(['kind']);
        expect(attrs[VAS]).toBe(1);
        expect(attrs[DATE_PICKER]).toBe('2024-06');
        expect(attrs[RELATIVE_DATE_PICKER]).toBe('2025-12-15');
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
          id: AGE,
          name: 'Age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 0, maxValue: 120 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
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
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();
        const label1 = await slides.getCurrentItemLabel();
        await slides.nextSlide(label1); // slide 1 (Ada, valid) -> slide 2 (Grace)

        // Slide 2: enter an invalid value, go back — expect the discard dialog.
        await stage.form.fillNumber(AGE, '999');
        const dialog = await slides.previousSlideExpectingDiscardDialog();
        await expect(
          dialog.getByRole('heading', { name: 'Discard changes?' }),
        ).toBeVisible();

        // Cancel: stays on slide 2, typed value intact.
        await slides.discardCancelButton.click();
        await expect(dialog).toBeHidden();
        await expect(stage.form.field(AGE).locator('input')).toHaveValue('999');

        // Go back again and confirm this time.
        await slides.previousSlideExpectingDiscardDialog();
        await slides.discardConfirmButton.click();
        await expect(slides.getCurrentItemLabel()).resolves.toBe(label1);

        let state = await protocol.getNetworkState(interview.interviewId);
        expect(state?.nodes[1]?.attributes[AGE]).toBe(40); // invalid 999 NOT persisted

        // Forward again, enter a VALID value, go back (autosave, no dialog).
        await slides.nextSlide(label1);
        await stage.form.fillNumber(AGE, '55');
        await slides.previousSlide();
        await expect(slides.getCurrentItemLabel()).resolves.toBe(label1);

        state = await protocol.getNetworkState(interview.interviewId);
        expect(state?.nodes[1]?.attributes[AGE]).toBe(55); // valid dirty value autosaved
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
          id: PERSON_LABEL,
          name: 'Label',
          type: 'text',
          component: 'Text',
        });
        synth.addInformationStage({ title: 'Previous stage' });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
        });
        alterForm.addFormField({
          variable: name.id,
          component: 'Text',
          prompt: 'Label',
        });
        // Intentionally no addManualNode calls: zero Person nodes exist.
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview }) => {
        // No subject-type nodes: navigation passes the form stage (step 1)
        // in both directions, so its form section never paints.
        await interview.next();
        await expect(page).toHaveURL(/step=2/);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
        await expect(page.locator('[data-stage-section="form"]')).toHaveCount(
          0,
        );

        await page.getByTestId('previous-button').click();
        await expect(page).toHaveURL(/step=0/);
        await expect(
          page.getByRole('heading', { name: 'Previous stage' }),
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
        const person = synth.addNodeType({ name: 'Person' });
        const secret = person.addVariable({
          id: SECRET,
          name: 'Secret',
          type: 'text',
          component: 'Text',
          encrypted: true,
        });
        synth.addStage('Anonymisation');
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
        });
        alterForm.addFormField({
          variable: secret.id,
          component: 'Text',
          prompt: 'Secret',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage' });
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
        await expect(page.getByText('Passphrase accepted!')).toBeVisible();
        await interview.next(); // -> AlterForm (step 1)

        await interview.waitForForm();
        await stage.form.fillText(SECRET, 'Secret');
        await slides.nextSlide(await slides.getCurrentItemLabel());
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        // The stored value is ciphertext (a number[]) with the metadata to
        // decrypt it alongside, never the plaintext.
        const state = await protocol.getNetworkState(interview.interviewId);
        const node = state?.nodes[0];
        const stored = node?.[entityAttributesProperty][SECRET];
        expect(Array.isArray(stored)).toBe(true);
        expect(node?.[entitySecureAttributesMeta]?.[SECRET]).toBeDefined();

        // Returning to the form decrypts the answer back into its field.
        await page.getByTestId('previous-button').click();
        await interview.waitForForm();
        await expect(stage.form.field(SECRET).locator('input')).toHaveValue(
          'Secret',
        );
        await slides.nextSlide(await slides.getCurrentItemLabel());
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
      },
    },

    {
      id: 'moves-on-once-the-form-is-answered',
      covers: ['form', 'form.fields[].variable'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const personName = person.addVariable({ name: 'name', type: 'text' });
        const options = [
          { label: 'Not close', value: 1 },
          { label: 'Very close', value: 2 },
        ];
        const closeness = person.addVariable({
          id: CLOSENESS,
          name: 'Closeness',
          type: 'ordinal',
          component: 'RadioGroup',
          options,
        });
        const trust = person.addVariable({
          id: TRUST,
          name: 'Trust',
          type: 'ordinal',
          component: 'RadioGroup',
          options,
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
        });
        alterForm.addFormField({
          variable: closeness.id,
          component: 'RadioGroup',
          prompt: 'How close are you?',
        });
        alterForm.addFormField({
          variable: trust.id,
          component: 'RadioGroup',
          prompt: 'How much do you trust them?',
        });
        synth.addManualNode(alterForm.id, person.id, 'p1', {
          [personName.id]: 'Ada',
        });
        synth.addManualNode(alterForm.id, person.id, 'p2', {
          [personName.id]: 'Grace',
        });
        synth.addInformationStage({ title: 'Next stage' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const slides = new SlidesFormFixture(page);
        await interview.waitForForm();
        await expect(slides.getCurrentItemLabel()).resolves.toBe('Ada');

        // A question still waiting keeps the person on screen. Nothing marks
        // a move that never happens, so this waits out the pause before a
        // move (350ms) with room to spare.
        await stage.form.selectRadio(CLOSENESS, 'Very close');
        await page.waitForTimeout(800);
        await expect(slides.getCurrentItemLabel()).resolves.toBe('Ada');

        // Answering the last one moves on to the next person by itself.
        await stage.form.selectRadio(TRUST, 'Not close');
        await expect.poll(() => slides.getCurrentItemLabel()).toBe('Grace');
        await expect(page).toHaveURL(/step=0/);

        // The last person's answers leave the stage, as Next would.
        await stage.form.selectRadio(TRUST, 'Very close');
        await stage.form.selectRadio(CLOSENESS, 'Not close');
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const nodes = state?.nodes ?? [];
        const ada = nodes.find((n) => n[entityPrimaryKeyProperty] === 'p1');
        const grace = nodes.find((n) => n[entityPrimaryKeyProperty] === 'p2');
        expect(ada?.attributes).toMatchObject({
          [CLOSENESS]: 2,
          [TRUST]: 1,
        });
        expect(grace?.attributes).toMatchObject({
          [CLOSENESS]: 1,
          [TRUST]: 2,
        });
      },
    },
  ],
};
