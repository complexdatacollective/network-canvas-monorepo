import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { ComponentType } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

// Every EgoForm renders `introductionPanel.title`/`.text` unconditionally
// (EgoForm.tsx:215-218), so each stage below supplies one.
const INTRO = {
  title: 'About you',
  text: 'Please answer the questions below.',
};

// Variable ids that build() creates and run() needs. `build`/`run` live in
// separate object-literal closures, so the id is stashed on a module-scoped
// `let` inside build() and read inside run() — the same pattern every other
// cross-closure scenario in this suite uses.
let megaTextVarId: string;
let megaTextAreaVarId: string;
let megaNumberVarId: string;
let megaVasVarId: string;
let megaBooleanVarId: string;
let megaToggleVarId: string;
let megaRadioVarId: string;
let megaLikertVarId: string;
let megaCheckboxVarId: string;
let megaToggleButtonVarId: string;
let megaDatePickerVarId: string;
let megaRelativeDatePickerVarId: string;

let optionsRadioVarId: string;
let optionsBooleanVarId: string;

let requiredNameVarId: string;
let lengthTextVarId: string;
let numericVarId: string;
let selectionVarId: string;

let equalityEmailVarId: string;
let equalityConfirmVarId: string;
let equalityNicknameVarId: string;

let comparisonStartVarId: string;
let comparisonEndVarId: string;

let focusFamilyVarIds: Record<string, string> = {};
let unansweredBooleanVarId: string;
let unansweredVasVarId: string;
let leakTargetVarId: string;
let leakDependentVarId: string;

let nudgeRequiredVarId: string;

let relativeDateVarId: string;
let prePopNameVarId: string;
let prePopSeededName: string;
let backNavAgeVarId: string;

export const egoFormScenarios: InterfaceScenarios = {
  interfaceType: 'EgoForm',
  scenarios: [
    {
      id: 'intro-panel-and-field-structure',
      covers: [
        'introductionPanel.title',
        'introductionPanel.text',
        'form.fields-ordering-and-prompt',
        'form.fields[].hint',
        'form.fields[].id',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', {
          label: 'INTERNAL LABEL',
          interviewScript: 'SCRIPT TEXT',
          introductionPanel: {
            title: 'About You',
            text: '## Section\n- item one',
          },
        });
        // Auto-created variables would take the prompt as their codebook name,
        // which violates VariableNameSchema (no spaces/`?`), so give each field
        // an explicit variable with a clean name.
        const nameVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'name',
        });
        stage.addFormField({
          variable: nameVar.id,
          component: 'Text',
          prompt: 'Name?',
          hint: 'Legal name',
        });
        const ageVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'age',
        });
        stage.addFormField({
          variable: ageVar.id,
          component: 'Number',
          prompt: 'Age?',
        });
        const aloneVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Toggle',
          name: 'alone',
        });
        stage.addFormField({
          variable: aloneVar.id,
          component: 'Toggle',
          prompt: 'Alone?',
        });
        return synth;
      },
      run: async ({ page }) => {
        // introductionPanel renders as real markdown elements, not raw
        // `##`/`-` text (EgoForm.tsx:215-218, ALLOWED_MARKDOWN_SECTION_TAGS).
        await expect(
          page.getByRole('heading', { level: 1, name: 'About You' }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Section' }),
        ).toBeVisible();
        // A `listitem` has no accessible name from its content, so filter by
        // text instead of matching on name.
        await expect(
          page.getByRole('listitem').filter({ hasText: 'item one' }),
        ).toBeVisible();

        // Each field renders inside its own container (BaseField.tsx:62-83, the
        // `data-field-name` wrapper), in declaration order.
        const fieldContainers = page.locator('[data-field-name]');
        await expect(fieldContainers).toHaveCount(3);
        await expect(fieldContainers).toContainText([
          'Name?',
          'Age?',
          'Alone?',
        ]);

        // The Text field's hint renders inside its own container
        // (BaseField.tsx:84-89).
        await expect(
          fieldContainers.nth(0).getByText('Legal name'),
        ).toBeVisible();

        // `label`/`interviewScript` are author-facing only, never rendered to
        // participants.
        await expect(page.getByText('INTERNAL LABEL')).toHaveCount(0);
        await expect(page.getByText('SCRIPT TEXT')).toHaveCount(0);
      },
    },

    {
      id: 'field-mega-all-components',
      covers: [
        'component=Text',
        'component=TextArea',
        'component=Number',
        'component=VisualAnalogScale',
        'component=Boolean',
        'component=Toggle',
        'component=RadioGroup',
        'component=LikertScale',
        'component=CheckboxGroup',
        'component=ToggleButtonGroup',
        'component=DatePicker',
        'DatePicker.parameters(type/min/max)',
        'component=RelativeDatePicker',
        'egoVariable.readOnly',
        'egoVariable.name-fallback-label',
      ],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', {
          introductionPanel: {
            title: 'About You',
            text: 'Answer every question below.',
          },
        });

        const textVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'megaText',
        });
        megaTextVarId = textVar.id;
        stage.addFormField({
          variable: textVar.id,
          component: 'Text',
          prompt: 'What is your name?',
        });

        const textAreaVar = synth.addEgoVariable({
          type: 'text',
          component: 'TextArea',
          name: 'megaTextArea',
        });
        megaTextAreaVarId = textAreaVar.id;
        stage.addFormField({
          variable: textAreaVar.id,
          component: 'TextArea',
          prompt: 'Describe yourself briefly.',
        });

        const numberVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'megaNumber',
        });
        megaNumberVarId = numberVar.id;
        stage.addFormField({
          variable: numberVar.id,
          component: 'Number',
          prompt: 'How old are you?',
        });

        const vasVar = synth.addEgoVariable({
          type: 'scalar',
          component: 'VisualAnalogScale',
          name: 'megaVas',
        });
        megaVasVarId = vasVar.id;
        stage.addFormField({
          variable: vasVar.id,
          component: 'VisualAnalogScale',
          prompt: 'How happy are you right now?',
        });

        const booleanVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Boolean',
          name: 'megaBoolean',
        });
        megaBooleanVarId = booleanVar.id;
        stage.addFormField({
          variable: booleanVar.id,
          component: 'Boolean',
          prompt: 'Are you currently employed?',
        });

        const toggleVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Toggle',
          name: 'megaToggle',
        });
        megaToggleVarId = toggleVar.id;
        stage.addFormField({
          variable: toggleVar.id,
          component: 'Toggle',
          prompt: 'Do you live alone?',
        });

        // Explicit numeric options so the selected value is unambiguous —
        // base-ui stringifies the selection internally but RadioGroupField
        // maps it back to the original typed option.value (RadioGroup.tsx:191-197).
        const radioVar = synth.addEgoVariable({
          type: 'ordinal',
          component: 'RadioGroup',
          name: 'megaRadio',
          options: [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
            { label: 'Three', value: 3 },
            { label: 'Four', value: 4 },
          ],
        });
        megaRadioVarId = radioVar.id;
        stage.addFormField({
          variable: radioVar.id,
          component: 'RadioGroup',
          prompt: 'How many siblings do you have?',
        });

        // Default ordinal options (constants.ts:22-28): Strongly disagree(1)..
        // Strongly agree(5).
        const likertVar = synth.addEgoVariable({
          type: 'ordinal',
          component: 'LikertScale',
          name: 'megaLikert',
        });
        megaLikertVarId = likertVar.id;
        stage.addFormField({
          variable: likertVar.id,
          component: 'LikertScale',
          prompt: 'How would you rate your overall health?',
        });

        // Default categorical options (constants.ts:30-35):
        // family/work/school/neighborhood.
        const checkboxVar = synth.addEgoVariable({
          type: 'categorical',
          component: 'CheckboxGroup',
          name: 'megaCheckbox',
        });
        megaCheckboxVarId = checkboxVar.id;
        stage.addFormField({
          variable: checkboxVar.id,
          component: 'CheckboxGroup',
          prompt: 'Which languages do you speak?',
        });

        const toggleButtonVar = synth.addEgoVariable({
          type: 'categorical',
          component: 'ToggleButtonGroup',
          name: 'megaToggleButton',
        });
        megaToggleButtonVarId = toggleButtonVar.id;
        stage.addFormField({
          variable: toggleButtonVar.id,
          component: 'ToggleButtonGroup',
          prompt: 'What is your highest education level?',
        });

        // `parameters` exercises DatePicker.parameters(type/min/max) — a wide
        // range so the fixed fill value below is always in-bounds
        // (DatePicker.tsx:105-112 parses min/max into year/month bounds).
        const datePickerVar = synth.addEgoVariable({
          type: 'datetime',
          component: 'DatePicker',
          name: 'megaDatePicker',
          parameters: { type: 'full', min: '1900-01-01', max: '2026-12-31' },
        });
        megaDatePickerVarId = datePickerVar.id;
        stage.addFormField({
          variable: datePickerVar.id,
          component: 'DatePicker',
          prompt: 'What is your date of birth?',
        });

        // Wide anchor/before/after range — the range-validation edges are
        // exercised by the dedicated relative-date-range-validation scenario,
        // not here.
        const relativeDatePickerVar = synth.addEgoVariable({
          type: 'datetime',
          component: 'RelativeDatePicker',
          name: 'megaRelativeDatePicker',
          parameters: { anchor: '2026-07-01', before: 10000, after: 10000 },
        });
        megaRelativeDatePickerVarId = relativeDatePickerVar.id;
        stage.addFormField({
          variable: relativeDatePickerVar.id,
          component: 'RelativeDatePicker',
          prompt: 'When did you last see a doctor?',
        });

        // Somewhere to advance to so the autosubmit-on-forward-nav persists.
        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const field = (prompt: string) =>
          page.locator('[data-field-name]', { hasText: prompt });

        await page.getByLabel('What is your name?').fill('Jordan');
        await page
          .getByLabel('Describe yourself briefly.')
          .fill('A brief bio about myself.');
        await page.getByLabel('How old are you?').fill('42');

        // VisualAnalogScale: keyboard-only. Dragging is unreliable because the
        // thumb's pixel position depends on layout (VisualAnalogScale.tsx). `End`
        // jumps the slider to its max (value 1).
        const vasSlider = field('How happy are you right now?').getByRole(
          'slider',
        );
        await vasSlider.focus();
        await vasSlider.press('End');

        // Boolean renders each option as a `role=radio` button with an explicit
        // `data-value` (Boolean.tsx:202-221).
        await page.getByRole('radio', { name: 'No' }).click();

        // Toggle resolves to a `role=switch` via its `id` (ToggleField.tsx).
        await page.getByLabel('Do you live alone?').click();

        await page.getByRole('radio', { name: 'Two' }).click();

        // LikertScale: same keyboard approach as VisualAnalogScale. `End` selects
        // the last option (index 4, value 5, "Strongly agree").
        const likertSlider = field(
          'How would you rate your overall health?',
        ).getByRole('slider');
        await likertSlider.focus();
        await likertSlider.press('End');

        // CheckboxGroup: each option is a `role=checkbox` (CheckboxGroup.tsx).
        // Scope by field container — both CheckboxGroup and ToggleButtonGroup use
        // the same default categorical option labels on this stage.
        const checkboxGroup = field('Which languages do you speak?');
        await checkboxGroup.getByRole('checkbox', { name: 'Family' }).click();
        await checkboxGroup.getByRole('checkbox', { name: 'Work' }).click();

        // ToggleButtonGroup: also exposes each option as a `role=checkbox` via
        // Base UI's `Checkbox.Root` (ToggleButtonGroup.tsx:177-216).
        const toggleButtonGroup = field(
          'What is your highest education level?',
        );
        await toggleButtonGroup
          .getByRole('checkbox', { name: 'School' })
          .click();

        await field('What is your date of birth?')
          .locator('input[type="date"]')
          .fill('2005-06-15');
        await field('When did you last see a doctor?')
          .locator('input[type="date"]')
          .fill('2026-06-01');

        await interview.next();

        const state = await protocol.getNetworkState(interview.interviewId);
        const egoAttributes = state?.ego[entityAttributesProperty];

        expect(egoAttributes?.[megaTextVarId]).toBe('Jordan');
        expect(egoAttributes?.[megaTextAreaVarId]).toBe(
          'A brief bio about myself.',
        );
        expect(egoAttributes?.[megaNumberVarId]).toBe(42);
        expect(egoAttributes?.[megaVasVarId]).toBe(1);
        expect(egoAttributes?.[megaBooleanVarId]).toBe(false);
        expect(egoAttributes?.[megaToggleVarId]).toBe(true);
        expect(egoAttributes?.[megaRadioVarId]).toBe(2);
        expect(egoAttributes?.[megaLikertVarId]).toBe(5);
        expect(egoAttributes?.[megaCheckboxVarId]).toEqual(['family', 'work']);
        expect(egoAttributes?.[megaToggleButtonVarId]).toEqual(['school']);
        expect(egoAttributes?.[megaDatePickerVarId]).toBe('2005-06-15');
        expect(egoAttributes?.[megaRelativeDatePickerVarId]).toBe('2026-06-01');

        // `egoVariable.readOnly` (Architect editors only — the locked-codebook
        // flag has no interview-runtime effect) and
        // `egoVariable.name-fallback-label` (unreachable: EgoForm's field always
        // carries a `prompt`, so the codebook-name fallback in
        // selectFieldMetadataFromVariables, forms.ts:123, never triggers) are
        // both declared-dead per the option inventory and are not exercised
        // here by design.
      },
    },

    {
      id: 'options-configuration',
      covers: [
        'RadioGroup-auto-columns->6-options',
        'Boolean-custom-options',
        'Boolean-options[].negative',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });

        // 7 ordinal options (> 6) turns on the columns layout
        // (useProtocolForm.tsx:268-276).
        const radioVar = synth.addEgoVariable({
          type: 'ordinal',
          component: 'RadioGroup',
          name: 'siblingCount',
          options: [
            { label: 'Zero', value: 0 },
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
            { label: 'Three', value: 3 },
            { label: 'Four', value: 4 },
            { label: 'Five', value: 5 },
            { label: 'Six', value: 6 },
          ],
        });
        optionsRadioVarId = radioVar.id;
        stage.addFormField({
          variable: radioVar.id,
          component: 'RadioGroup',
          prompt: 'How many siblings do you have?',
        });

        const booleanVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Boolean',
          name: 'agreement',
          options: [
            { label: 'Sure', value: true },
            { label: 'Nope', value: false, negative: true },
          ],
        });
        optionsBooleanVarId = booleanVar.id;
        stage.addFormField({
          variable: booleanVar.id,
          component: 'Boolean',
          prompt: 'Do you agree to take part?',
        });

        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const radioGroup = page.locator('[data-field-name]', {
          hasText: 'How many siblings do you have?',
        });
        // All 7 options render.
        await expect(radioGroup.getByRole('radio')).toHaveCount(7);
        // > 6 options switches on the container-query columns layout
        // (orientationVariants useColumns → `grid-cols-*` classes).
        await expect(radioGroup.locator('[class*="grid-cols"]')).toHaveCount(1);

        // Select the 4th option (value 3).
        await page.getByRole('radio', { name: 'Three' }).click();

        // Boolean custom labels render as `role=radio` with `data-value`
        // (Boolean.tsx:202-221).
        const sure = page.getByRole('radio', { name: 'Sure' });
        const nope = page.getByRole('radio', { name: 'Nope' });
        await expect(sure).toHaveAttribute('data-value', 'true');
        await expect(nope).toHaveAttribute('data-value', 'false');
        await expect(nope).toHaveAttribute('data-negative', 'true');
        await expect(sure).not.toHaveAttribute('data-negative');
        await nope.click();

        await interview.next();

        const state = await protocol.getNetworkState(interview.interviewId);
        const egoAttributes = state?.ego[entityAttributesProperty];
        // Ordinal radio persists the typed option value (not an array).
        expect(egoAttributes?.[optionsRadioVarId]).toBe(3);
        expect(egoAttributes?.[optionsBooleanVarId]).toBe(false);
      },
    },

    {
      id: 'required-validation-and-pulse',
      covers: [
        'validation.required',
        'ready-for-next-pulse',
        'validation.requiredAcceptsNull',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });

        const nameVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'fullName',
          validation: { required: true },
        });
        requiredNameVarId = nameVar.id;
        stage.addFormField({
          variable: nameVar.id,
          component: 'Text',
          prompt: 'Name?',
        });
        const ageVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'age',
        });
        stage.addFormField({
          variable: ageVar.id,
          component: 'Number',
          prompt: 'Age?',
        });
        const aloneVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Toggle',
          name: 'alone',
        });
        stage.addFormField({
          variable: aloneVar.id,
          component: 'Toggle',
          prompt: 'Alone?',
        });

        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        // Pulse is driven by form validity: a required-empty field registers
        // invalid (formStore.ts:138), so no pulse before any input.
        expect(await interview.nextButtonHasPulse()).toBe(false);

        const nameError = page.getByTestId(`${requiredNameVarId}-field-error`);

        // Empty submit is blocked: validateForm marks the required field
        // dirty+blurred so its error renders (formStore.ts:443), and the step
        // does not change.
        await interview.nextButton.click();
        await expect(nameError).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        // Filling the (now-blurred) field validates on change → form valid →
        // pulse appears (EgoForm.tsx:192-199).
        await page.getByLabel('Name?').fill('Ada');
        await expect
          .poll(async () => interview.nextButtonHasPulse())
          .toBe(true);

        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          requiredNameVarId,
          'Ada',
        );

        // `validation.requiredAcceptsNull` is declared but consumed nowhere
        // (validation.ts:7) — there is no schema key to attach it to a
        // variable, so it can only be documented, not exercised.
      },
    },

    {
      id: 'length-validation',
      covers: ['validation.minLength/maxLength'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });
        const textVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'code',
          validation: { minLength: 3, maxLength: 5 },
        });
        lengthTextVarId = textVar.id;
        stage.addFormField({
          variable: textVar.id,
          component: 'Text',
          prompt: 'Enter a short code',
        });
        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const codeField = page.getByLabel('Enter a short code');
        const codeError = page.getByTestId(`${lengthTextVarId}-field-error`);

        await codeField.fill('ab'); // too short
        await interview.nextButton.click();
        await expect(codeError).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        await codeField.fill('abcdef'); // too long
        await interview.nextButton.click();
        await expect(codeError).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        await codeField.fill('abcd'); // in range
        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          lengthTextVarId,
          'abcd',
        );
      },
    },

    {
      id: 'numeric-range-validation',
      covers: ['validation.minValue/maxValue'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });
        const numberVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'age',
          validation: { minValue: 0, maxValue: 120 },
        });
        numericVarId = numberVar.id;
        stage.addFormField({
          variable: numberVar.id,
          component: 'Number',
          prompt: 'How old are you?',
        });
        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const ageField = page.getByLabel('How old are you?');
        const ageError = page.getByTestId(`${numericVarId}-field-error`);

        await ageField.fill('150'); // above max
        await interview.nextButton.click();
        await expect(ageError).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        await ageField.fill('35');
        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        // Number fields coerce to a real number before persisting
        // (coerceFormValues).
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          numericVarId,
          35,
        );
      },
    },

    {
      id: 'selection-count-validation',
      covers: ['validation.minSelected/maxSelected'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });
        const checkboxVar = synth.addEgoVariable({
          type: 'categorical',
          component: 'CheckboxGroup',
          name: 'contexts',
          validation: { minSelected: 2, maxSelected: 3 },
        });
        selectionVarId = checkboxVar.id;
        stage.addFormField({
          variable: checkboxVar.id,
          component: 'CheckboxGroup',
          prompt: 'Where do you know them from?',
        });
        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const group = page.locator('[data-field-name]', {
          hasText: 'Where do you know them from?',
        });
        const error = page.getByTestId(`${selectionVarId}-field-error`);

        // 1 selected → below minSelected. (An empty selection is `required`'s
        // job; minSelected only fires for 0 < length < min, functions.ts:465-479.)
        await group.getByRole('checkbox', { name: 'Family' }).click();
        await interview.nextButton.click();
        await expect(error).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        // 4 selected → above maxSelected.
        await group.getByRole('checkbox', { name: 'Work' }).click();
        await group.getByRole('checkbox', { name: 'School' }).click();
        await group.getByRole('checkbox', { name: 'Neighborhood' }).click();
        await interview.nextButton.click();
        await expect(error).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        // Back to 3 selected → within range.
        await group.getByRole('checkbox', { name: 'Neighborhood' }).click();
        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        // Categorical values persist as an array of the remaining option values.
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          selectionVarId,
          ['family', 'work', 'school'],
        );
      },
    },

    {
      id: 'cross-field-equality-validation',
      covers: ['validation.sameAs', 'validation.differentFrom'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });

        // Not `required` on purpose: a required field's label text carries a
        // trailing " *", which would break the exact getByLabel below.
        const emailVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'email',
        });
        equalityEmailVarId = emailVar.id;
        stage.addFormField({
          variable: emailVar.id,
          component: 'Text',
          prompt: 'Email address',
        });

        const confirmVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'emailConfirm',
          validation: { sameAs: emailVar.id },
        });
        equalityConfirmVarId = confirmVar.id;
        stage.addFormField({
          variable: confirmVar.id,
          component: 'Text',
          prompt: 'Confirm email address',
        });

        const nicknameVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'nickname',
          validation: { differentFrom: emailVar.id },
        });
        equalityNicknameVarId = nicknameVar.id;
        stage.addFormField({
          variable: nicknameVar.id,
          component: 'Text',
          prompt: 'Choose a nickname',
        });

        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        // `exact` avoids "Email address" substring-matching "Confirm email
        // address".
        const emailField = page.getByLabel('Email address', { exact: true });
        const confirmField = page.getByLabel('Confirm email address', {
          exact: true,
        });
        const nicknameField = page.getByLabel('Choose a nickname', {
          exact: true,
        });
        const confirmError = page.getByTestId(
          `${equalityConfirmVarId}-field-error`,
        );
        const nicknameError = page.getByTestId(
          `${equalityNicknameVarId}-field-error`,
        );

        await emailField.fill('alice@example.com');
        await confirmField.fill('bob@example.com'); // mismatch → sameAs error
        await nicknameField.fill('alice@example.com'); // equal → differentFrom

        await interview.nextButton.click();
        await expect(confirmError).toBeVisible();
        await expect(nicknameError).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        await confirmField.fill('alice@example.com'); // now matches
        await nicknameField.fill('ally'); // now differs

        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          equalityEmailVarId,
          'alice@example.com',
        );
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          equalityConfirmVarId,
          'alice@example.com',
        );
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          equalityNicknameVarId,
          'ally',
        );
      },
    },

    {
      id: 'cross-field-comparison-validation',
      covers: ['validation.greaterThanVariable-family'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });

        const startVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'startAge',
        });
        comparisonStartVarId = startVar.id;
        stage.addFormField({
          variable: startVar.id,
          component: 'Number',
          prompt: 'Age when it started',
        });

        const endVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'endAge',
          validation: { greaterThanVariable: startVar.id },
        });
        comparisonEndVarId = endVar.id;
        stage.addFormField({
          variable: endVar.id,
          component: 'Number',
          prompt: 'Age when it ended',
        });

        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const startField = page.getByLabel('Age when it started');
        const endField = page.getByLabel('Age when it ended');
        const endError = page.getByTestId(`${comparisonEndVarId}-field-error`);

        await startField.fill('30');
        await endField.fill('20'); // not greater than start
        await interview.nextButton.click();
        await expect(endError).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        await endField.fill('40');
        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          comparisonStartVarId,
          30,
        );
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          comparisonEndVarId,
          40,
        );
      },
    },

    /**
     * Issue #1385: a blocked submission moved focus to `document.body` and
     * only sometimes recovered. The issue reported NumberInput as a working
     * exception; it was not — every family behaved the same way. Driving each
     * family in turn as the FIRST invalid control pins that, so neither the
     * regression nor the "one family is different" story can come back.
     */
    {
      id: 'required-error-focus',
      covers: ['invalid-submit-focuses-first-invalid-control'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });
        focusFamilyVarIds = {};

        const families: {
          key: string;
          name: string;
          component: ComponentType;
          type:
            | 'text'
            | 'number'
            | 'boolean'
            | 'scalar'
            | 'ordinal'
            | 'datetime';
          prompt: string;
          options?: { label: string; value: number }[];
        }[] = [
          {
            key: 'text',
            name: 'textAnswer',
            component: 'Text',
            type: 'text',
            prompt: 'Text question',
          },
          {
            key: 'textarea',
            name: 'textAreaAnswer',
            component: 'TextArea',
            type: 'text',
            prompt: 'Long text question',
          },
          {
            key: 'number',
            name: 'numberAnswer',
            component: 'Number',
            type: 'number',
            prompt: 'Number question',
          },
          {
            key: 'radio',
            name: 'radioAnswer',
            component: 'RadioGroup',
            type: 'ordinal',
            prompt: 'Radio question',
            options: [
              { label: 'Alpha', value: 1 },
              { label: 'Beta', value: 2 },
            ],
          },
          {
            key: 'boolean',
            name: 'booleanAnswer',
            component: 'Toggle',
            type: 'boolean',
            prompt: 'Boolean question',
          },
          {
            key: 'vas',
            name: 'vasAnswer',
            component: 'VisualAnalogScale',
            type: 'scalar',
            prompt: 'Scale question',
          },
          {
            key: 'date',
            name: 'dateAnswer',
            component: 'DatePicker',
            type: 'datetime',
            prompt: 'Date question',
          },
          {
            key: 'relativeDate',
            name: 'relativeDateAnswer',
            component: 'RelativeDatePicker',
            type: 'datetime',
            prompt: 'Relative date question',
          },
        ];

        for (const family of families) {
          const variable = synth.addEgoVariable({
            type: family.type,
            component: family.component,
            name: family.name,
            validation: { required: true },
            ...(family.options ? { options: family.options } : {}),
          });
          focusFamilyVarIds[family.key] = variable.id;
          stage.addFormField({
            variable: variable.id,
            component: family.component,
            prompt: family.prompt,
          });
        }

        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        const focusIsInside = (fieldName: string) =>
          page.evaluate(
            (name) =>
              !!document.activeElement?.closest(`[data-field-name="${name}"]`),
            fieldName,
          );

        // Each pass answers the topmost unanswered question, so the NEXT
        // family becomes the first invalid control on the following submit.
        const order = [
          'text',
          'textarea',
          'number',
          'radio',
          'boolean',
          'vas',
          'date',
          'relativeDate',
        ] as const;

        for (const key of order) {
          const fieldName = focusFamilyVarIds[key]!;
          await interview.nextButton.click();
          await expect(stage.form.getFieldError(fieldName)).toBeVisible();
          // Read focus immediately: an `expect(locator).toBeFocused()` would
          // retry for seconds and pass on the deferred focus this fixes.
          expect(await focusIsInside(fieldName)).toBe(true);

          const field = page.locator(`[data-field-name="${fieldName}"]`);
          switch (key) {
            case 'text':
            case 'textarea':
              await stage.form.fillText(fieldName, 'An answer');
              break;
            case 'number':
              await stage.form.fillNumber(fieldName, '7');
              break;
            case 'radio':
              await stage.form.selectRadio(fieldName, 'Alpha');
              break;
            case 'boolean':
              await stage.form.selectRadio(fieldName, 'Yes');
              break;
            case 'vas':
              await field.getByRole('slider').press('ArrowRight');
              break;
            case 'date':
            case 'relativeDate':
              // Today: a RelativeDatePicker's default window is anchored on
              // the interview date, so a fixed past date falls outside it.
              await field
                .locator('input[type="date"]')
                .fill(new Date().toISOString().slice(0, 10));
              break;
          }
          await expect(stage.form.getFieldError(fieldName)).toBeHidden();
        }

        await interview.next();
        await expect(page).toHaveURL(/step=1/);
      },
    },

    /**
     * Issue #1385: a required Toggle rendered a definite "off" and a required
     * VAS announced its resting midpoint, so both looked answered while
     * `required` refused to let the participant continue.
     */
    {
      id: 'required-unanswered-state',
      covers: ['required-boolean-renders-as-unselected-choice'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });

        const booleanVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Toggle',
          name: 'livesAlone',
          validation: { required: true },
        });
        unansweredBooleanVarId = booleanVar.id;
        stage.addFormField({
          variable: booleanVar.id,
          component: 'Toggle',
          prompt: 'Do you live alone?',
        });

        const vasVar = synth.addEgoVariable({
          type: 'scalar',
          component: 'VisualAnalogScale',
          name: 'happiness',
          validation: { required: true },
        });
        unansweredVasVarId = vasVar.id;
        stage.addFormField({
          variable: vasVar.id,
          component: 'VisualAnalogScale',
          prompt: 'How happy are you right now?',
        });

        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const booleanField = page.locator(
          `[data-field-name="${unansweredBooleanVarId}"]`,
        );
        const vasField = page.locator(
          `[data-field-name="${unansweredVasVarId}"]`,
        );

        // A required boolean is a choice with a genuine unselected state, not
        // a switch that can only say true or false.
        await expect(booleanField.getByRole('switch')).toHaveCount(0);
        const choices = booleanField.getByRole('radio');
        await expect(choices).toHaveCount(2);
        for (const choice of await choices.all()) {
          await expect(choice).toHaveAttribute('aria-checked', 'false');
        }

        // The scale says so out loud rather than announcing its resting point.
        await expect(vasField.getByRole('slider')).toHaveAttribute(
          'aria-valuetext',
          'No value chosen yet',
        );
        await expect(vasField.locator('[data-unanswered]')).toHaveCount(1);

        // What is shown, what is stored, and what validation says all agree.
        await interview.nextButton.click();
        await expect(
          stage.form.getFieldError(unansweredBooleanVarId),
        ).toBeVisible();
        await expect(
          stage.form.getFieldError(unansweredVasVarId),
        ).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        await stage.form.selectRadio(unansweredBooleanVarId, 'No');
        await vasField.getByRole('slider').press('Enter');
        await expect(vasField.getByRole('slider')).not.toHaveAttribute(
          'aria-valuetext',
          'No value chosen yet',
        );

        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        // A deliberate "No" is recorded as false — distinguishable from the
        // silence that blocked the participant a moment ago.
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          unansweredBooleanVarId,
          false,
        );
      },
    },

    /**
     * Issue #1385: comparison copy named the codebook variable, and an
     * unanswered field collected both the required error and a comparison
     * error about a value it did not have.
     */
    {
      id: 'comparison-error-copy',
      covers: ['comparison-copy-uses-authored-prompt'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });

        const targetVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'runtimeNumber',
        });
        leakTargetVarId = targetVar.id;
        stage.addFormField({
          variable: targetVar.id,
          component: 'Number',
          prompt: 'How many years have you lived here?',
        });

        const dependentVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'runtimeNumberHigher',
          validation: {
            required: true,
            greaterThanVariable: targetVar.id,
          },
        });
        leakDependentVarId = dependentVar.id;
        stage.addFormField({
          variable: dependentVar.id,
          component: 'Number',
          prompt: 'How many years do you expect to stay?',
        });

        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        const dependentError = stage.form.getFieldError(leakDependentVarId);

        // Unanswered: exactly one message, the required one.
        await stage.form.fillNumber(leakTargetVarId, '5');
        await interview.nextButton.click();
        await expect(dependentError).toBeVisible();
        await expect(dependentError.locator('li')).toHaveCount(0);
        await expect(dependentError).toHaveText(
          'You must answer this question before continuing.',
        );

        // Answered but too small: the comparison message names the question
        // the participant was asked, never the codebook variable.
        await stage.form.fillNumber(leakDependentVarId, '2');
        await interview.nextButton.click();
        await expect(dependentError).toHaveText(
          "Your answer must be greater than your answer to 'How many years have you lived here?'.",
        );
        await expect(dependentError).not.toContainText('runtimeNumber');

        await stage.form.fillNumber(leakDependentVarId, '9');
        await interview.next();
        await expect(page).toHaveURL(/step=1/);
      },
    },

    {
      id: 'validation-hints-summary',
      covers: [
        'showValidationHints-summary',
        'form.fields[].showValidationHints',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });

        const nameVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'fullName',
          validation: { required: true, minLength: 2 },
        });
        stage.addFormField({
          variable: nameVar.id,
          component: 'Text',
          prompt: 'Name?',
          showValidationHints: true,
        });

        // Sibling field with showValidationHints unset → no summary region.
        const ageVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'age',
        });
        stage.addFormField({
          variable: ageVar.id,
          component: 'Number',
          prompt: 'Age?',
        });
        return synth;
      },
      run: async ({ page }) => {
        // The Text field's hint region (BaseField.tsx:84-89) carries the
        // generated requirement text from makeValidationHints (useField.ts).
        const nameHint = page
          .locator('[data-field-name]', { hasText: 'Name?' })
          .locator('[id$="-hint"]');
        await expect(nameHint).toBeVisible();
        await expect(nameHint).not.toBeEmpty();

        // The Number field has no hint and no summary, so no hint region renders.
        await expect(
          page
            .locator('[data-field-name]', { hasText: 'Age?' })
            .locator('[id$="-hint"]'),
        ).toHaveCount(0);
      },
    },

    {
      id: 'relative-date-range-validation',
      covers: [
        'RelativeDatePicker.parameters(anchor/before/after)-range-validation',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });
        // anchor 2026-07-01, before 30 days, after 0 → valid window is
        // 2026-06-01 .. 2026-07-01. useProtocolForm pre-computes these into
        // Field-level min/max validators (useProtocolForm.tsx:323-341).
        const dateVar = synth.addEgoVariable({
          type: 'datetime',
          component: 'RelativeDatePicker',
          name: 'lastVisit',
          parameters: { anchor: '2026-07-01', before: 30, after: 0 },
        });
        relativeDateVarId = dateVar.id;
        stage.addFormField({
          variable: dateVar.id,
          component: 'RelativeDatePicker',
          prompt: 'When did you last visit?',
        });
        synth.addInformationStage({ title: 'Done', text: 'Thank you.' });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const dateInput = page
          .locator('[data-field-name]', { hasText: 'When did you last visit?' })
          .locator('input[type="date"]');
        const error = page.getByTestId(`${relativeDateVarId}-field-error`);

        // 2026-05-02 is ~60 days before the anchor, below the computed min.
        await dateInput.fill('2026-05-02');
        await interview.nextButton.click();
        await expect(error).toBeVisible();
        await expect(page).toHaveURL(/step=0/);

        await dateInput.fill('2026-06-15'); // in range
        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          relativeDateVarId,
          '2026-06-15',
        );
      },
    },

    {
      id: 'pre-population-from-ego-attributes',
      covers: ['pre-population-from-ego-attributes'],
      // The only EgoForm scenario whose subject is the seeded network itself.
      // Every other one opens on a form nobody has answered, which is what
      // buildSyntheticPayload hands a scenario that does not ask for this.
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nameVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'fullName',
        });
        prePopNameVarId = nameVar.id;
        const stage = synth.addStage('EgoForm', {
          introductionPanel: {
            title: 'About You',
            text: 'Please confirm your details.',
          },
        });
        stage.addFormField({
          variable: nameVar.id,
          component: 'Text',
          prompt: 'What is your name?',
        });
        synth.addInformationStage({ title: 'Next', text: 'Continue.' });

        // Read back from the same builder the runner installs, so run()
        // expects the seeded value itself rather than a copy of it. A network
        // that stopped answering ego fails here, at build, rather than as an
        // unexplained empty field.
        const seeded =
          synth.getNetwork().ego[entityAttributesProperty][prePopNameVarId];
        if (typeof seeded !== 'string' || seeded === '') {
          throw new Error(
            `Expected the generated network to answer ego variable "${prePopNameVarId}", got ${String(seeded)}`,
          );
        }
        prePopSeededName = seeded;
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const nameField = page.getByLabel('What is your name?');

        // What the scenario is named for: the field mounts holding the value
        // the seeded network's ego already carries, read through
        // getEgoAttributes (EgoForm.tsx:89-96).
        await expect(nameField).toHaveValue(prePopSeededName);

        // And pre-populates the same way from a value the participant entered.
        // Navigate away — autosubmit persists it — then return in-app, with no
        // reload, so the mount reads it back off the live store.
        await nameField.fill('Bob');
        await interview.next();
        await expect(page).toHaveURL(/step=1/);

        await page.getByTestId('previous-button').click();
        await expect(page).toHaveURL(/step=0/);
        await expect(nameField).toHaveValue('Bob');

        await nameField.fill('Carol');
        await interview.next();
        await expect(page).toHaveURL(/step=1/);
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          prePopNameVarId,
          'Carol',
        );
      },
    },

    {
      id: 'backwards-nav-discard-and-autosubmit',
      covers: ['backwards-nav-discard-and-autosubmit'],
      currentStep: 1,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Before',
          text: 'Placeholder stage so Back has somewhere to land.',
        });
        const stage = synth.addStage('EgoForm', { introductionPanel: INTRO });
        const ageVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'age',
          validation: { required: true, maxValue: 10 },
        });
        backNavAgeVarId = ageVar.id;
        stage.addFormField({
          variable: ageVar.id,
          component: 'Number',
          prompt: 'How old are you?',
        });
        synth.addInformationStage({
          title: 'After',
          text: 'Placeholder stage after EgoForm.',
        });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const ageField = page.getByLabel('How old are you?');
        const ageError = page.getByTestId(`${backNavAgeVarId}-field-error`);

        // (a) dirty + invalid: 99 > maxValue 10.
        await ageField.fill('99');
        await ageField.blur();
        await expect(ageError).toBeVisible();

        await page.getByTestId('previous-button').click(); // Navigation.tsx:257
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Discard changes?')).toBeVisible(); // EgoForm.tsx:104
        await page.getByTestId('dialog-cancel').click(); // "Keep changes"
        await expect(dialog).toBeHidden();
        // still on the EgoForm stage with the invalid value retained
        await expect(ageField).toHaveValue('99');

        await page.getByTestId('previous-button').click();
        await expect(dialog.getByText('Discard changes?')).toBeVisible();
        await page.getByTestId('dialog-primary').click(); // "Discard changes"
        await expect(dialog).toBeHidden();
        // moved back to the Information stage; discarded value never persisted
        await expect(
          page.getByRole('heading', { name: 'Before' }),
        ).toBeVisible();
        const stateAfterDiscard = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(
          stateAfterDiscard?.ego[entityAttributesProperty][backNavAgeVarId] ??
            null,
        ).toBeNull();

        // (b) fresh visit, dirty + valid: silent autosubmit on Back.
        await interview.goto(1);
        const freshAge = page.getByLabel('How old are you?');
        await freshAge.fill('5');
        await freshAge.blur();
        // Wait for the field to validate as valid (pulse appears) so beforeNext
        // sees a valid form and autosubmits instead of prompting.
        await expect
          .poll(async () => interview.nextButtonHasPulse())
          .toBe(true);
        await page.getByTestId('previous-button').click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(
          page.getByRole('heading', { name: 'Before' }),
        ).toBeVisible();
        await protocol.waitForEgoAttribute(
          interview.interviewId,
          backNavAgeVarId,
          5,
        );
      },
    },

    /**
     * Issue #1385: the guidance callout competed with the errors it was
     * covering. Errors now suppress it outright, for as long as they stand.
     */
    {
      id: 'scroll-nudge-yields-to-errors',
      covers: ['scroll-nudge-suppressed-by-errors'],
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', {
          introductionPanel: {
            title: 'About You',
            text: 'This form has enough fields to overflow the viewport.',
          },
        });
        // Enough fields to overflow the viewport, so the nudge is armed at all
        // (useScrolledToBottom latches immediately on a form that fits).
        for (let index = 0; index < 9; index += 1) {
          const variable = synth.addEgoVariable({
            type: 'text',
            component: 'TextArea',
            name: `answer${index}`,
            ...(index === 0 ? { validation: { required: true } } : {}),
          });
          if (index === 0) nudgeRequiredVarId = variable.id;
          stage.addFormField({
            variable: variable.id,
            component: 'TextArea',
            prompt: `Question ${index + 1}`,
          });
        }
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
        await page.reload();
        await page.waitForFunction(() => typeof window.__test !== 'undefined');
        await expect(
          page.getByRole('heading', { level: 1, name: 'About You' }),
        ).toBeVisible();

        const nudge = page.getByRole('button', {
          name: 'Scroll to see more questions',
        });
        await page.clock.fastForward('00:15');
        await expect(nudge).toBeVisible();

        // A blocked submission replaces the guidance with the error.
        await interview.nextButton.click();
        await expect(
          stage.form.getFieldError(nudgeRequiredVarId),
        ).toBeVisible();
        await expect(nudge).toBeHidden();

        // And it stays away while the error stands, however long the
        // participant sits with it.
        await page.clock.fastForward('00:30');
        await expect(nudge).toBeHidden();

        // Once the question is answered, guidance can return.
        await stage.form.fillText(nudgeRequiredVarId, 'An answer');
        await expect(stage.form.getFieldError(nudgeRequiredVarId)).toBeHidden();
        await page.clock.fastForward('00:15');
        await expect(nudge).toBeVisible();
      },
    },

    {
      id: 'scroll-nudge-inactivity',
      covers: [
        'scroll-nudge-15s-inactivity',
        'scroll-nudge-never-obscures-content',
      ],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', {
          introductionPanel: {
            title: 'About You',
            text: 'This form has enough fields to overflow the viewport.',
          },
        });
        // Enough fields to overflow the viewport so the scroll sentinel does
        // not intersect on mount (which would latch hasScrolledToBottom and
        // suppress the nudge — useScrolledToBottom.ts).
        const presets: {
          component: ComponentType;
          prompt: string;
          name: string;
        }[] = [
          { component: 'Text', prompt: 'What is your name?', name: 'name' },
          { component: 'Number', prompt: 'How old are you?', name: 'age' },
          {
            component: 'TextArea',
            prompt: 'Describe yourself briefly.',
            name: 'bio',
          },
          { component: 'Toggle', prompt: 'Do you live alone?', name: 'alone' },
          {
            component: 'Boolean',
            prompt: 'Are you currently employed?',
            name: 'employed',
          },
          {
            component: 'RadioGroup',
            prompt: 'What is your highest education level?',
            name: 'education',
          },
          {
            component: 'CheckboxGroup',
            prompt: 'Which languages do you speak?',
            name: 'languages',
          },
          {
            component: 'LikertScale',
            prompt: 'How would you rate your overall health?',
            name: 'health',
          },
          {
            component: 'VisualAnalogScale',
            prompt: 'How happy are you right now?',
            name: 'happiness',
          },
        ];
        for (const preset of presets) {
          // Explicit variable so the codebook name is schema-valid (the prompt
          // would not be).
          const variable = synth.addEgoVariable({
            component: preset.component,
            name: preset.name,
          });
          stage.addFormField({
            variable: variable.id,
            component: preset.component,
            prompt: preset.prompt,
          });
        }
        return synth;
      },
      run: async ({ page }) => {
        // The 15s nudge timer is scheduled in a mount effect (EgoForm.tsx:78-85).
        // Install the clock, then reload so the timer is scheduled under the
        // fake clock (the interview survives the reload via sessionStorage).
        await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
        await page.reload();
        await page.waitForFunction(() => typeof window.__test !== 'undefined');
        await expect(
          page.getByRole('heading', { level: 1, name: 'About You' }),
        ).toBeVisible();

        // The nudge is a button whose accessible name comes from its heading
        // text (the chevrons are aria-hidden).
        const nudge = page.getByRole('button', {
          name: 'Scroll to see more questions',
        });
        await expect(nudge).toBeHidden();

        await page.clock.fastForward('00:15'); // 15s — EgoForm.tsx:83
        await expect(nudge).toBeVisible();

        // Issue #1385: the callout used to float over the bottom of the scroll
        // region and covered whatever happened to be there. It now takes its
        // own row below the scroller, so nothing can be underneath it — at the
        // top of the form or part-way down it.
        const overlappedText = async () => {
          const box = await nudge.boundingBox();
          if (!box) throw new Error('Scroll guidance has no box to measure');
          const candidates = await page
            .locator('main label, main [data-testid$="-field-error"]')
            .all();
          const hits: string[] = [];
          for (const candidate of candidates) {
            if (!(await candidate.isVisible())) continue;
            const rect = await candidate.boundingBox();
            if (!rect) continue;
            const overlaps =
              rect.x < box.x + box.width &&
              rect.x + rect.width > box.x &&
              rect.y < box.y + box.height &&
              rect.y + rect.height > box.y;
            if (overlaps) hits.push((await candidate.textContent()) ?? '');
          }
          return hits;
        };

        expect(await overlappedText()).toEqual([]);
        await page.mouse.wheel(0, 400);
        expect(await overlappedText()).toEqual([]);
        await page.mouse.wheel(0, -400);

        // Clicking scrolls to the bottom; the sentinel intersects and
        // hasScrolledToBottom latches permanently (useScrolledToBottom.ts:21-48),
        // so the nudge never reappears even after another 15s.
        await nudge.click();
        await expect(nudge).toBeHidden();
        await page.clock.fastForward('00:15');
        await expect(nudge).toBeHidden();
      },
    },
  ],
};
