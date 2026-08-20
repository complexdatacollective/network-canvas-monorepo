import { fireEvent, render, screen } from '@testing-library/react';
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
        initialValue={destination}
      />
    </Form>,
  );

  const getDestination = () =>
    requireStore().getState().getFieldState('skipLogic.destination')?.value as
      | SkipLogicDestination
      | undefined;

  return { getDestination };
};

describe('SkipLogicDestinationField UI', () => {
  it('uses an accessible native select and displays an existing destination', () => {
    setup({ type: 'finish' });

    const select = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });

    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue('route:finish');
    expect(select).toHaveAccessibleDescription(
      /Choose where the interview should continue\./,
    );
  });

  it('stores a stage destination and clears it back to the default route', () => {
    const { getDestination } = setup();
    const select = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });

    fireEvent.change(select, {
      target: { value: 'route:stage:debrief' },
    });
    expect(getDestination()).toEqual({
      type: 'stage',
      stageId: 'debrief',
    });

    fireEvent.change(select, {
      target: { value: 'route:next' },
    });
    expect(getDestination()).toBeUndefined();
  });

  it('stores the finish destination selected by the native control', () => {
    const { getDestination } = setup();
    const select = screen.getByRole('combobox', {
      name: 'When this stage is skipped',
    });

    fireEvent.change(select, {
      target: { value: 'route:finish' },
    });
    expect(getDestination()).toEqual({ type: 'finish' });
  });
});
