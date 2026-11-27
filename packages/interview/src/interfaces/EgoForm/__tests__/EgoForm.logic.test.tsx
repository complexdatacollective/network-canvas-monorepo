import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  dynamicValueNameFor,
  fieldBlockMarkdown,
  type LocalizationDeclaration,
  optionCaseKey,
} from '@codaco/protocol-validation';

import { testId, testVariableId } from '../../../__tests__/testIds';
import type { StageProps } from '../../../types';
import { renderEgoForm } from './renderEgoForm';

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

const STATUS = testVariableId('status');
const EMPLOYER = testVariableId('employer');
const NICKNAME = testVariableId('nickname');
const KIND = testVariableId('kind');
const BUSINESS = testVariableId('business');
const EMPLOYED = testId('option employed');
const STUDENT = testId('option student');
const SELF = testId('option self');
const EMPLOYEE = testId('option employee');
const FIELD = {
  status: testId('field status'),
  employer: testId('field employer'),
  nickname: testId('field nickname'),
  kind: testId('field kind'),
  business: testId('field business'),
};

const statusName = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: STATUS,
});

// The English form asks about work only of someone who is employed. Its
// Spanish form also asks for a nickname, which the English form does not.
const english = [
  '# About you',
  fieldBlockMarkdown(FIELD.status),
  `{${statusName}, select, missing {} ${optionCaseKey(EMPLOYED)} {## Your work\n\n${fieldBlockMarkdown(FIELD.employer)}} other {}}`,
].join('\n\n');
const spanish = [english, fieldBlockMarkdown(FIELD.nickname)].join('\n\n');

const stage = {
  id: 'ego-form',
  type: 'EgoForm',
  label: { en: 'About you', es: 'Sobre usted' },
  form: {
    content: { en: english, es: spanish },
    fields: [
      {
        id: FIELD.status,
        variable: STATUS,
        prompt: { en: 'What is your employment status?', es: '¿Situación?' },
      },
      {
        id: FIELD.employer,
        variable: EMPLOYER,
        prompt: { en: 'Who is your employer?', es: '¿Empleador?' },
      },
      {
        id: FIELD.nickname,
        variable: NICKNAME,
        prompt: { es: '¿Apodo?' },
      },
    ],
  },
} as unknown as StageProps<'EgoForm'>['stage'];

const kindName = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: KIND,
});

// The kind of work is asked only of someone who is employed, and the
// business's name only of someone who works for themselves. The second
// logic block reads the answer to a field that the first one can hide.
const chained = {
  ...stage,
  id: 'chained-ego-form',
  form: {
    content: {
      en: [
        fieldBlockMarkdown(FIELD.status),
        `{${statusName}, select, missing {} ${optionCaseKey(EMPLOYED)} {${fieldBlockMarkdown(FIELD.kind)}} other {}}`,
        `{${kindName}, select, missing {} ${optionCaseKey(SELF)} {${fieldBlockMarkdown(FIELD.business)}} other {}}`,
      ].join('\n\n'),
    },
    fields: [
      {
        id: FIELD.status,
        variable: STATUS,
        prompt: { en: 'What is your employment status?' },
      },
      { id: FIELD.kind, variable: KIND, prompt: { en: 'Kind of work?' } },
      {
        id: FIELD.business,
        variable: BUSINESS,
        prompt: { en: 'Business name?' },
      },
    ],
  },
} as unknown as StageProps<'EgoForm'>['stage'];

const egoVariables = {
  [STATUS]: {
    name: 'status',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [
      {
        id: EMPLOYED,
        value: 'employed',
        label: { en: 'Employed' },
      },
      { id: STUDENT, value: 'student', label: { en: 'Student' } },
    ],
  },
  [EMPLOYER]: { name: 'employer', type: 'text', component: 'Text' },
  [NICKNAME]: { name: 'nickname', type: 'text', component: 'Text' },
  [KIND]: {
    name: 'kind',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [
      { id: SELF, value: 'self', label: { en: 'Self-employed' } },
      {
        id: EMPLOYEE,
        value: 'employee',
        label: { en: 'Employee' },
      },
    ],
  },
  [BUSINESS]: { name: 'business', type: 'text', component: 'Text' },
};

const localization: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

const renderLogicForm = (
  stored: Record<string, unknown>,
  shownStage: StageProps<'EgoForm'>['stage'] = stage,
) => renderEgoForm({ stage: shownStage, egoVariables, stored, localization });

const employer = () =>
  screen.queryByRole('textbox', { name: /Who is your employer\?/ });

describe('EgoForm logic', () => {
  it('shows a question as soon as an answer on the form reveals it', async () => {
    renderLogicForm({});
    expect(employer()).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Your work' })).toBeNull();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Employed' }));

    expect(
      await screen.findByRole('heading', { name: 'Your work' }),
    ).toBeVisible();
    expect(employer()).toBeVisible();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));
    await waitFor(() => expect(employer()).toBeNull());
  });

  it('clears the answer to a question that logic hides when the form is submitted', async () => {
    const { egoAttributes, submit } = renderLogicForm({
      [STATUS]: ['employed'],
      [EMPLOYER]: 'Acme',
      [NICKNAME]: 'Ada',
    });
    expect(await screen.findByDisplayValue('Acme')).toBeVisible();

    // No longer employed: the employer question is hidden.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Student' }));
    await waitFor(() => expect(employer()).toBeNull());

    submit();

    await waitFor(() => expect(egoAttributes()?.[STATUS]).toEqual(['student']));
    expect(egoAttributes()).not.toHaveProperty(EMPLOYER);
    // Only the Spanish form asks for a nickname, so the English form leaves
    // it as it is.
    expect(egoAttributes()?.[NICKNAME]).toBe('Ada');
  });

  it('keeps the answer to a question that is still shown', async () => {
    const { egoAttributes, submit } = renderLogicForm({
      [STATUS]: ['employed'],
      [EMPLOYER]: 'Acme',
    });
    expect(await screen.findByDisplayValue('Acme')).toBeVisible();

    submit();

    await waitFor(() =>
      expect(egoAttributes()?.[STATUS]).toEqual(['employed']),
    );
    expect(egoAttributes()?.[EMPLOYER]).toBe('Acme');
  });

  it('leaves the answer to a question that only the earlier language’s form asks when the participant changes language and moves on', async () => {
    // Mounted in Spanish, whose form asks for a nickname, then shown in
    // English, whose form does not: moving on submits the English form,
    // which does not hide the nickname but does not ask it either.
    const { egoAttributes, moveForward, showLanguage } = renderEgoForm({
      stage,
      egoVariables,
      stored: { [STATUS]: ['student'], [NICKNAME]: 'Ada' },
      localization,
      locale: 'es',
    });
    expect(await screen.findByDisplayValue('Ada')).toBeVisible();

    showLanguage('en');
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Apodo/ })).toBeNull(),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));
    expect(
      await screen.findByRole('heading', { name: 'Your work' }),
    ).toBeVisible();

    await moveForward();

    await waitFor(() =>
      expect(egoAttributes()?.[STATUS]).toEqual(['student', 'employed']),
    );
    expect(egoAttributes()?.[NICKNAME]).toBe('Ada');
  });

  describe('an answer to a hidden question', () => {
    const business = () =>
      screen.queryByRole('textbox', { name: /Business name\?/ });

    it('never shows the question that it would reveal, nor keeps its answer, when typed before it was hidden', async () => {
      const { egoAttributes, submit } = renderLogicForm({}, chained);

      fireEvent.click(
        await screen.findByRole('checkbox', { name: 'Employed' }),
      );
      fireEvent.click(
        await screen.findByRole('checkbox', { name: 'Self-employed' }),
      );
      const name = await waitFor(() => {
        const found = business();
        expect(found).not.toBeNull();
        return found as HTMLElement;
      });
      fireEvent.change(name, { target: { value: 'Acme' } });
      expect(await screen.findByDisplayValue('Acme')).toBeVisible();

      // No longer employed: the kind of work is hidden, and with it the
      // business's name, which only its answer showed.
      fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('checkbox', { name: 'Self-employed' }),
        ).toBeNull(),
      );
      expect(business()).toBeNull();

      submit();

      await waitFor(() => expect(egoAttributes()?.[STATUS]).toEqual([]));
      expect(egoAttributes()).not.toHaveProperty(KIND);
      expect(egoAttributes()).not.toHaveProperty(BUSINESS);
    });

    it('never shows the question that it would reveal, nor keeps its answer, when it is stored', async () => {
      const { egoAttributes, submit } = renderLogicForm(
        { [STATUS]: ['employed'], [KIND]: ['self'], [BUSINESS]: 'Acme' },
        chained,
      );
      expect(await screen.findByDisplayValue('Acme')).toBeVisible();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('checkbox', { name: 'Self-employed' }),
        ).toBeNull(),
      );
      expect(business()).toBeNull();

      submit();

      await waitFor(() => expect(egoAttributes()?.[STATUS]).toEqual([]));
      expect(egoAttributes()).not.toHaveProperty(KIND);
      expect(egoAttributes()).not.toHaveProperty(BUSINESS);
    });

    it('shows both questions again, with their answers, when the first answer is given again', async () => {
      renderLogicForm(
        { [STATUS]: ['employed'], [KIND]: ['self'], [BUSINESS]: 'Acme' },
        chained,
      );
      expect(await screen.findByDisplayValue('Acme')).toBeVisible();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));
      await waitFor(() => expect(business()).toBeNull());
      fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));

      expect(await screen.findByDisplayValue('Acme')).toBeVisible();
    });
  });

  // A rule on a question that is shown can name a question that logic hides.
  // The hidden question has no answer while it is hidden, as submitting
  // saves it: its stored answer, which submitting clears, is never compared
  // with in its place.
  describe('a rule that compares with a hidden question', () => {
    const CONFIRM = testVariableId('confirm employer');
    const confirmField = testId('field confirm employer');
    const comparing = (rule: 'sameAs' | 'differentFrom') => ({
      stage: {
        ...stage,
        id: `${rule}-ego-form`,
        form: {
          content: {
            en: [english, fieldBlockMarkdown(confirmField)].join('\n\n'),
          },
          fields: [
            ...stage.form.fields,
            {
              id: confirmField,
              variable: CONFIRM,
              prompt: { en: 'Type the name again' },
            },
          ],
        },
      } as unknown as StageProps<'EgoForm'>['stage'],
      egoVariables: {
        ...egoVariables,
        [CONFIRM]: {
          name: 'confirm_employer',
          type: 'text',
          component: 'Text',
          validation: { [rule]: EMPLOYER },
        },
      },
    });
    const confirm = () =>
      screen.getByRole('textbox', { name: /Type the name again/ });

    it.each([
      // Matching the hidden employer's stored name would be required.
      ['sameAs', 'Globex'],
      // Differing from the hidden employer's stored name would be required.
      ['differentFrom', 'Acme'],
    ] as const)(
      'ignores the stored answer of the question that %s names',
      async (rule, given) => {
        const { egoAttributes, submit, isReadyForNext } = renderEgoForm({
          ...comparing(rule),
          stored: {
            [STATUS]: ['student'],
            [EMPLOYER]: 'Acme',
            [CONFIRM]: given,
          },
          localization,
        });
        expect(await screen.findByDisplayValue(given)).toBe(confirm());
        expect(employer()).toBeNull();

        // Next lights up: every answer on screen passes its checks. It
        // starts unlit, so this waits for the check of the answers.
        await waitFor(() => expect(isReadyForNext()).toBe(true));

        submit();

        await waitFor(() =>
          expect(egoAttributes()).not.toHaveProperty(EMPLOYER),
        );
        expect(egoAttributes()?.[CONFIRM]).toBe(given);
      },
    );

    it('does not require an answer to a hidden question', async () => {
      const { egoAttributes, submit, isReadyForNext } = renderEgoForm({
        stage,
        egoVariables: {
          ...egoVariables,
          [EMPLOYER]: {
            name: 'employer',
            type: 'text',
            component: 'Text',
            validation: { required: true },
          },
        },
        stored: { [STATUS]: ['employed'] },
        localization,
      });
      // Shown and unanswered, the required question keeps Next unlit.
      await waitFor(() => expect(employer()).not.toBeNull());
      await waitFor(() => expect(isReadyForNext()).toBe(false));

      fireEvent.click(screen.getByRole('checkbox', { name: 'Employed' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Student' }));
      await waitFor(() => expect(employer()).toBeNull());
      await waitFor(() => expect(isReadyForNext()).toBe(true));

      submit();

      await waitFor(() =>
        expect(egoAttributes()?.[STATUS]).toEqual(['student']),
      );
      expect(egoAttributes()).not.toHaveProperty(EMPLOYER);
    });

    it('compares with the answer while the question is shown', async () => {
      const { egoAttributes, submit, isReadyForNext } = renderEgoForm({
        ...comparing('sameAs'),
        stored: { [STATUS]: ['employed'], [EMPLOYER]: 'Acme' },
        localization,
      });
      expect(await screen.findByDisplayValue('Acme')).toBeVisible();
      fireEvent.change(confirm(), { target: { value: 'Globex' } });

      submit();

      expect(
        (await screen.findAllByText(/must be the same as your answer to/))
          .length,
      ).toBeGreaterThan(0);
      expect(isReadyForNext()).toBe(false);
      expect(egoAttributes()).not.toHaveProperty(CONFIRM);
    });
  });
});
