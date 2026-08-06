import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import type { Stage } from '@codaco/protocol-validation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import StageForm, { STAGE_FORM_ID } from '../StageForm';
import { useStageFormContext } from '../stageFormContext';

const committedStage = {
  id: 'stage-1',
  type: 'Information',
  label: 'Stage one',
} as unknown as Stage;

const SubmitFailedProbe = () => {
  const { submitFailed } = useStageFormContext();
  return <span data-testid="submit-failed">{String(submitFailed)}</span>;
};

const renderStageForm = ({
  onSubmit,
  required = false,
  initialValue = 'Stage one',
}: {
  onSubmit: FormSubmitHandler;
  required?: boolean;
  initialValue?: string;
}) => {
  const store = configureStore({
    reducer: { stageEditorDraft },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <StageForm
        stageId="stage-1"
        interfaceType="Information"
        committedStage={committedStage}
        onSubmit={onSubmit}
      >
        <SubmitFailedProbe />
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue={initialValue}
          required={required}
        />
      </StageForm>
    </Provider>,
  );
};

describe('StageForm', () => {
  beforeAll(() => {
    // jsdom implements no element scrolling; the invalid-submit path scrolls
    // the first field with an error into view.
    Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo'];
  });

  it('renders a form element carrying the stage form id', () => {
    const { container } = renderStageForm({
      onSubmit: vi.fn(() => ({ success: true as const })),
    });

    const form = container.querySelector('form');
    expect(form).toHaveAttribute('id', STAGE_FORM_ID);
    expect(form).toHaveAttribute('novalidate');
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue(
      'Stage one',
    );
  });

  it('submits the registered field values', async () => {
    const onSubmit = vi.fn(() => ({ success: true as const }));
    const { container } = renderStageForm({ onSubmit });

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ label: 'Stage one' });
    });
    expect(screen.getByTestId('submit-failed')).toHaveTextContent('false');
  });

  it('records a failed submit and does not call the submit handler', async () => {
    const onSubmit = vi.fn(() => ({ success: true as const }));
    const { container } = renderStageForm({
      onSubmit,
      required: true,
      initialValue: '',
    });

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('submit-failed')).toHaveTextContent('true');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
