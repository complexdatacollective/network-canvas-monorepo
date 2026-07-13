import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import type { SkipLogicDestination } from '@codaco/protocol-validation';

import SkipLogicDestinationField from '../SkipLogicDestinationField';

type FormValues = {
  skipLogic?: {
    destination?: SkipLogicDestination;
  };
};

const stages = [
  { id: 'source', label: 'Source' },
  { id: 'debrief', label: 'A deliberately long debrief stage label' },
];

const Harness = (_props: InjectedFormProps<FormValues>) => (
  <SkipLogicDestinationField
    stages={stages}
    stagePosition={0}
    isNewStage={false}
  />
);

const ReduxHarness = reduxForm<FormValues>({ form: 'edit-stage' })(Harness);

const setup = (destination?: SkipLogicDestination) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness
        initialValues={{ skipLogic: destination ? { destination } : {} }}
      />
    </Provider>,
  );

  const getDestination = () =>
    (store.getState().form['edit-stage']?.values as FormValues | undefined)
      ?.skipLogic?.destination;

  return { getDestination };
};

describe('SkipLogicDestinationField UI', () => {
  it('provides an accessible label and hint for an existing destination', () => {
    setup({ type: 'finish' });

    const trigger = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });
    expect(trigger).toHaveTextContent('End the interview');
    expect(trigger).toHaveAccessibleDescription(
      'Choose where the interview should continue. Only later stages can be selected.',
    );
  });

  it('stores a stage destination and clears it back to legacy behavior', async () => {
    const { getDestination } = setup();
    const trigger = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });

    fireEvent.click(trigger);
    const stageOption = await screen.findByRole('option', {
      name: 'Stage 2 — A deliberately long debrief stage label',
    });
    fireEvent.pointerDown(stageOption, { pointerType: 'mouse' });
    fireEvent.click(stageOption);
    await waitFor(() => {
      expect(getDestination()).toEqual({
        type: 'stage',
        stageId: 'debrief',
      });
    });

    fireEvent.blur(trigger);
    expect(getDestination()).toEqual({
      type: 'stage',
      stageId: 'debrief',
    });

    fireEvent.click(trigger);
    const nextOption = await screen.findByRole('option', {
      name: 'Next available stage',
    });
    fireEvent.pointerDown(nextOption, { pointerType: 'mouse' });
    fireEvent.click(nextOption);
    await waitFor(() => {
      expect(getDestination()).toBeUndefined();
    });
  });

  it('supports keyboard selection through the Fresco Base UI select', async () => {
    const { getDestination } = setup();
    const trigger = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const finishOption = await screen.findByRole('option', {
      name: 'End the interview',
    });
    finishOption.focus();
    fireEvent.keyDown(finishOption, { key: 'Enter' });

    await waitFor(() => {
      expect(getDestination()).toEqual({ type: 'finish' });
    });
  });
});
