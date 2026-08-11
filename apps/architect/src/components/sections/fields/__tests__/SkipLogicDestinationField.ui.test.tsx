import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { SkipLogicDestination } from '@codaco/protocol-validation';

import SkipLogicDestinationField from '../SkipLogicDestinationField';

const stages = [
  { id: 'source', label: 'Source' },
  { id: 'debrief', label: 'A deliberately long debrief stage label' },
];

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const requireStore = () => {
  if (!storeApi) throw new Error('form store was not captured');
  return storeApi;
};

const setup = (destination?: SkipLogicDestination) => {
  storeApi = null;

  render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <SkipLogicDestinationField
        stages={stages}
        stagePosition={0}
        isNewStage={false}
      />
    </Form>,
  );

  if (destination) {
    requireStore()
      .getState()
      .setFieldValue('skipLogic.destination', destination);
  }

  const getDestination = () =>
    requireStore().getState().getFieldState('skipLogic.destination')?.value as
      | SkipLogicDestination
      | undefined;

  return { getDestination };
};

describe('SkipLogicDestinationField UI', () => {
  it('provides an accessible label and hint for an existing destination', async () => {
    setup({ type: 'finish' });

    const trigger = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });
    await waitFor(() => expect(trigger).toHaveTextContent('End the interview'));
    expect(trigger).toHaveAccessibleDescription(
      /Choose where the interview should continue\./,
    );
  });

  it('stores a stage destination and clears it back to the default route', async () => {
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
