import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

vi.mock('../File', () => ({
  default: ({
    showBrowser,
    onCloseBrowser,
    disabled,
    readOnly,
  }: {
    showBrowser?: boolean;
    onCloseBrowser?: () => void;
    disabled?: boolean;
    readOnly?: boolean;
  }) => (
    <div
      data-testid="file-picker"
      data-open={String(Boolean(showBrowser))}
      data-disabled={String(Boolean(disabled))}
      data-readonly={String(Boolean(readOnly))}
    >
      <button type="button" onClick={onCloseBrowser}>
        Close browser
      </button>
    </div>
  ),
}));

vi.mock('~/components/Thumbnail/Network', () => ({
  default: () => null,
}));

import ArchitectField from '../../ArchitectField';
import DataSource from '../DataSource';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

type DataSourceTestProps = {
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

const renderDataSource = (
  value: string,
  { disabled, readOnly, required }: DataSourceTestProps = {},
) => {
  storeApi = null;

  render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      <ArchitectField
        name="dataSource"
        label="Roster data"
        component={DataSource}
        canUseExisting
        initialValue={value}
        disabled={disabled}
        readOnly={readOnly}
        validation={required ? { required: true } : undefined}
      />
    </Form>,
  );

  return {
    getValue: () => {
      if (!storeApi) throw new Error('form store was not captured');
      return storeApi.getState().getFormValues().dataSource as
        | string
        | undefined;
    },
  };
};

describe('DataSource', () => {
  it('opens the network asset picker without changing the value prematurely', () => {
    const { getValue } = renderDataSource('existing');

    expect(screen.queryByTestId('file-picker')).toBeNull();
    fireEvent.click(
      screen.getByRole('radio', { name: 'Use a network data file' }),
    );

    expect(screen.getByTestId('file-picker')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(getValue()).toBe('existing');
  });

  it('switches an asset-backed field to the interview network', () => {
    const { getValue } = renderDataSource('network-asset-id');

    fireEvent.click(
      screen.getByRole('radio', {
        name: 'Use the network from the in-progress interview',
      }),
    );

    expect(getValue()).toBe('existing');
  });

  it('resets the controlled browser state when the picker closes', () => {
    renderDataSource('existing');
    fireEvent.click(
      screen.getByRole('radio', { name: 'Use a network data file' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close browser' }));

    expect(screen.queryByTestId('file-picker')).toBeNull();
  });

  it('takes its name from the call site rather than a hardcoded label', () => {
    renderDataSource('network-asset-id', { required: true });

    // Regression: every panel used to render an identical `aria-label="Data
    // source"`, so the choice could not be told apart between panels.
    expect(
      screen.queryByRole('radiogroup', { name: 'Data source' }),
    ).toBeNull();
    const group = screen.getByRole('radiogroup', { name: 'Roster data' });
    expect(group).toHaveAttribute('aria-required', 'true');
  });

  it('disables both source selection and the asset picker', () => {
    const { getValue } = renderDataSource('network-asset-id', {
      disabled: true,
    });
    const existingOption = screen.getByRole('radio', {
      name: 'Use the network from the in-progress interview',
    });

    expect(existingOption).toBeDisabled();
    expect(screen.getByTestId('file-picker')).toHaveAttribute(
      'data-disabled',
      'true',
    );
    fireEvent.click(existingOption);
    expect(getValue()).toBe('network-asset-id');
  });

  it('keeps both source selection and the asset picker read-only', () => {
    const { getValue } = renderDataSource('network-asset-id', {
      readOnly: true,
    });
    const group = screen.getByRole('radiogroup', { name: 'Roster data' });
    const existingOption = screen.getByRole('radio', {
      name: 'Use the network from the in-progress interview',
    });

    expect(group).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByTestId('file-picker')).toHaveAttribute(
      'data-readonly',
      'true',
    );
    fireEvent.click(existingOption);
    expect(getValue()).toBe('network-asset-id');
  });
});
