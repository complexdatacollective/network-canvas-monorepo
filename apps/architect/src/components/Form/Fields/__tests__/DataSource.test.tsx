import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../File', () => ({
  default: ({
    showBrowser,
    onCloseBrowser,
    disabled,
    readOnly,
    required,
  }: {
    showBrowser?: boolean;
    onCloseBrowser?: () => void;
    disabled?: boolean;
    readOnly?: boolean;
    required?: boolean;
  }) => (
    <div
      data-testid="file-picker"
      data-open={String(Boolean(showBrowser))}
      data-disabled={String(Boolean(disabled))}
      data-readonly={String(Boolean(readOnly))}
      data-required={String(Boolean(required))}
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

import DataSource from '../DataSource';

const DataSourceField = DataSource as unknown as ComponentType<
  Record<string, unknown>
>;

type DataSourceTestProps = {
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

const renderDataSource = (value: string, props: DataSourceTestProps = {}) => {
  const onChange = vi.fn();
  const onBlur = vi.fn();
  const onFocus = vi.fn();
  render(
    <DataSourceField
      canUseExisting
      {...props}
      input={{
        name: 'dataSource',
        value,
        onChange,
        onBlur,
        onFocus,
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }}
      meta={{}}
    />,
  );
  return { onBlur, onChange, onFocus };
};

describe('DataSource', () => {
  it('opens the network asset picker without changing the value prematurely', () => {
    const { onChange } = renderDataSource('existing');

    expect(screen.queryByTestId('file-picker')).toBeNull();
    fireEvent.click(
      screen.getByRole('radio', { name: 'Use a network data file' }),
    );

    expect(screen.getByTestId('file-picker')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches an asset-backed field to the interview network', () => {
    const { onChange } = renderDataSource('network-asset-id');

    fireEvent.click(
      screen.getByRole('radio', {
        name: 'Use the network from the in-progress interview',
      }),
    );

    expect(onChange).toHaveBeenCalledWith('existing');
  });

  it('resets the controlled browser state when the picker closes', () => {
    renderDataSource('existing');
    fireEvent.click(
      screen.getByRole('radio', { name: 'Use a network data file' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close browser' }));

    expect(screen.queryByTestId('file-picker')).toBeNull();
  });

  it('forwards required semantics and Redux focus metadata', () => {
    const { onBlur, onFocus } = renderDataSource('network-asset-id', {
      required: true,
    });
    const group = screen.getByRole('radiogroup', { name: 'Data source' });
    const existingOption = screen.getByRole('radio', {
      name: 'Use the network from the in-progress interview',
    });

    expect(group).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('file-picker')).toHaveAttribute(
      'data-required',
      'true',
    );

    fireEvent.focus(existingOption);
    fireEvent.blur(existingOption);

    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalledWith('network-asset-id');
  });

  it('disables both source selection and the asset picker', () => {
    const { onChange } = renderDataSource('network-asset-id', {
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
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps both source selection and the asset picker read-only', () => {
    const { onChange } = renderDataSource('network-asset-id', {
      readOnly: true,
    });
    const group = screen.getByRole('radiogroup', { name: 'Data source' });
    const existingOption = screen.getByRole('radio', {
      name: 'Use the network from the in-progress interview',
    });

    expect(group).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByTestId('file-picker')).toHaveAttribute(
      'data-readonly',
      'true',
    );
    fireEvent.click(existingOption);
    expect(onChange).not.toHaveBeenCalled();
  });
});
