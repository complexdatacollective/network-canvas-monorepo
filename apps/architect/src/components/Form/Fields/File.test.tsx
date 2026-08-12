import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

vi.mock('../../AssetBrowser/AssetBrowserWindow', () => ({
  default: ({
    show,
    onSelect,
    onCancel,
  }: {
    show: boolean;
    onSelect: (id: string) => void;
    onCancel: () => void;
  }) =>
    show ? (
      <div role="dialog" aria-label="Resource library">
        <button type="button" onClick={() => onSelect('asset-1')}>
          Choose asset
        </button>
        <button type="button" onClick={onCancel}>
          Cancel library
        </button>
      </div>
    ) : null,
}));

import ArchitectField from '../ArchitectField';
import FileInput from './File';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const setup = () => {
  storeApi = null;

  render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <ArchitectField
        name="resource"
        label="Background image"
        component={FileInput}
        validation={{ required: true }}
      >
        {(id: string) => <span>Selected {id}</span>}
      </ArchitectField>
    </Form>,
  );

  return {
    getResource: () => {
      if (!storeApi) throw new Error('form store was not captured');
      return storeApi.getState().getFormValues().resource as string | undefined;
    },
  };
};

describe('File field', () => {
  it('uses shared field semantics and persists a selected asset', () => {
    const { getResource } = setup();

    expect(
      screen.getByRole('group', { name: 'Background image' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Background image' }),
    ).toHaveAccessibleDescription(/Required/);

    fireEvent.click(screen.getByRole('button', { name: 'Select resource' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose asset' }));

    expect(getResource()).toBe('asset-1');
    expect(screen.getByText('Selected asset-1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the current value when resource selection is cancelled', () => {
    const { getResource } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Select resource' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel library' }));

    expect(getResource()).toBeUndefined();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
