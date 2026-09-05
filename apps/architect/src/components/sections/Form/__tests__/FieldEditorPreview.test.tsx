import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type * as ReactRedux from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import {
  useFormHasValue,
  useFormValue,
} from '@codaco/fresco-ui/form/hooks/useFormValue';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '~/i18n/preference';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mocks = vi.hoisted(() => ({
  variables: {
    age: {
      name: 'Age',
      type: 'number',
    },
  },
}));

vi.mock('react-redux', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRedux>()),
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubjectSelector: () => mocks.variables,
}));

vi.mock('~/selectors/protocol', () => ({
  getProtocol: () => undefined,
}));

import FieldEditorPreview from '../FieldEditorPreview';

const existingVariableMessage =
  'When selecting an existing attribute, changes you make to the input control or validation options will also change other uses of this attribute.';

const ParentResponseProbe = () => {
  const previewHasValue = useFormHasValue(['preview-value'], 'opaque');
  const values = useFormValue(['authoring-sentinel'], 'opaque');
  return (
    <>
      <Field
        name="authoring-sentinel"
        nameMode="opaque"
        label="Researcher sentinel"
        component={InputField}
        initialValue="Authored_Sentinel_Á1"
      />
      <output data-testid="parent-response">
        {JSON.stringify({
          previewHasValue: previewHasValue['preview-value'],
          sentinel: values['authoring-sentinel'],
        })}
      </output>
    </>
  );
};

const expectUnchangedParent = () => {
  expect(screen.getByTestId('parent-response').textContent).toBe(
    JSON.stringify({
      previewHasValue: false,
      sentinel: 'Authored_Sentinel_Á1',
    }),
  );
  expect(
    screen.getByRole('textbox', { name: 'Researcher sentinel' }),
  ).toHaveValue('Authored_Sentinel_Á1');
};

const renderPreview = (item: Record<string, unknown>) =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <FieldEditorPreview entity="node" type="person" item={item} />
    </Form>,
  );

describe('FieldEditorPreview', () => {
  it('shows the existing-variable notice in the preview pane', () => {
    renderPreview({ variable: 'age' });

    const preview = screen.getByRole('region', {
      name: 'Interactive preview',
    });

    expect(preview).toHaveTextContent(existingVariableMessage);
  });

  it('does not show the notice while creating a variable', () => {
    renderPreview({
      variable: 'New variable',
      _createNewVariable: 'New variable',
    });

    expect(screen.queryByText(existingVariableMessage)).not.toBeInTheDocument();
  });

  it('previews the committed parameters before the editor registers any', () => {
    // The dialog opens before the input-control section mounts, and the form
    // holds `parameters` only as a tree of leaves — so until one of those
    // leaves registers, the committed item is the only parameters there are.
    renderPreview({
      variable: 'satisfaction',
      component: 'VisualAnalogScale',
      parameters: { minLabel: 'Not at all', maxLabel: 'Completely' },
    });

    expect(screen.getByText('Not at all')).toBeVisible();
    expect(screen.getByText('Completely')).toBeVisible();
  });

  it('keeps the participant field and its failed validation in English while researcher controls switch languages', async () => {
    const item = {
      component: 'Text',
      validation: { required: true },
      hint: 'Authored_Hint_Á1',
    };
    const original = structuredClone(item);
    const submitAuthoring = vi.fn(() => ({ success: true as const }));
    render(
      <ArchitectI18nProvider>
        <Form onSubmit={submitAuthoring}>
          <FieldEditorPreview entity="node" type="person" item={item} />
        </Form>
      </ArchitectI18nProvider>,
    );
    const field = screen.getByRole('textbox', {
      name: 'Your question will appear here.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check response' }));
    expect(
      await screen.findByText(
        'You must answer this question before continuing.',
      ),
    ).toBeVisible();
    act(() => {
      localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ARCHITECT_LOCALE_KEY,
          newValue: 'es',
        }),
      );
    });
    const researcherPreview = screen.getByRole('region', {
      name: 'Vista previa interactiva',
    });
    expect(
      within(researcherPreview).getByRole('button', {
        name: 'Comprobar respuesta',
      }),
    ).toBeVisible();
    expect(field).toHaveAccessibleName('Your question will appear here.');
    expect(
      screen.getByText('You must answer this question before continuing.'),
    ).toBeVisible();
    expect(screen.getByText('Authored_Hint_Á1')).toBeVisible();
    expect(field.closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(field.closest('[dir]')).toHaveAttribute('dir', 'ltr');
    expect(document.documentElement).toHaveAttribute('lang', 'es');
    fireEvent.change(field, { target: { value: 'Authored_Response_Á1' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Comprobar respuesta' }),
    );
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'false'));
    expect(field).toHaveValue('Authored_Response_Á1');
    expect(item).toEqual(original);
    expect(submitAuthoring).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 'form' as const, fieldName: 'prompt' },
    { mode: 'composer' as const, fieldName: 'label' },
  ])(
    'preserves the authored $fieldName and tested response under Spanish',
    async ({ mode, fieldName }) => {
      localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
      const item = {
        component: 'Text',
        [fieldName]: 'Research_Question_Á1',
        validation: { required: true },
      };
      const original = structuredClone(item);
      const submitAuthoring = vi.fn(() => ({ success: true as const }));
      render(
        <ArchitectI18nProvider>
          <Form onSubmit={submitAuthoring}>
            <ParentResponseProbe />
            <FieldEditorPreview
              entity="node"
              type="person"
              mode={mode}
              item={item}
            />
          </Form>
        </ArchitectI18nProvider>,
      );
      const field = screen.getByRole('textbox', {
        name: 'Research_Question_Á1',
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Comprobar respuesta' }),
      );
      expect(
        await screen.findByText(
          'You must answer this question before continuing.',
        ),
      ).toBeVisible();
      expectUnchangedParent();
      fireEvent.change(field, { target: { value: 'Research_Response_Á1' } });
      fireEvent.click(
        screen.getByRole('button', { name: 'Comprobar respuesta' }),
      );
      await waitFor(() =>
        expect(field).toHaveAttribute('aria-invalid', 'false'),
      );
      expect(field).toHaveValue('Research_Response_Á1');
      expectUnchangedParent();
      expect(item).toEqual(original);
      expect(submitAuthoring).not.toHaveBeenCalled();
      expect(document.documentElement).toHaveAttribute('lang', 'es');
    },
  );

  it('keeps an actual participant scale popup inside the English DOM and portal boundary', async () => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    const item = {
      component: 'VisualAnalogScale',
      prompt: 'Research_Scale_Á1',
      parameters: { minLabel: 'Research_Min', maxLabel: 'Research_Max' },
    };
    const original = structuredClone(item);
    render(
      <ArchitectI18nProvider>
        <Form onSubmit={() => ({ success: true })}>
          <ParentResponseProbe />
          <FieldEditorPreview entity="node" type="person" item={item} />
        </Form>
      </ArchitectI18nProvider>,
    );
    const slider = screen.getByRole('slider', { name: 'Research_Scale_Á1' });
    fireEvent.keyDown(slider, { key: 'Enter' });
    const popup = await screen.findByTestId('scale-value-popover');
    expect(popup).toHaveTextContent(/^50%$/);
    expect(popup.closest('[lang]')).toHaveAttribute('lang', 'en');
    expect(popup.closest('[dir]')).toHaveAttribute('dir', 'ltr');
    expect(slider.closest('[lang]')?.contains(popup)).toBe(true);
    expect(slider).toHaveValue('0.5');
    expect(
      screen
        .getByRole('button', { name: 'Comprobar respuesta' })
        .closest('[lang]'),
    ).toHaveAttribute('lang', 'es');
    expect(document.documentElement).toHaveAttribute('lang', 'es');
    expectUnchangedParent();
    expect(item).toEqual(original);
  });
});
