import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { reducer as formReducer, startSubmit } from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@codaco/fresco-ui/dialogs/Dialog', () => ({
  default: ({
    closeDialog,
    dismissible,
    footer,
    children,
  }: {
    closeDialog: () => void;
    dismissible?: boolean;
    footer?: ReactNode;
    children?: ReactNode;
  }) => (
    <div data-testid="dialog" data-dismissible={String(dismissible)}>
      <button type="button" onClick={closeDialog}>
        Dismiss dialog
      </button>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock('./Form', () => ({
  default: ({ children }: { children?: ReactNode }) => <form>{children}</form>,
}));

import InlineEditScreen from './InlineEditScreen';

describe('InlineEditScreen', () => {
  it('prevents duplicate save and cancel side effects while submitting', () => {
    const store = configureStore({ reducer: { form: formReducer } });
    store.dispatch(startSubmit('edit-item') as unknown as UnknownAction);
    const onCancel = vi.fn();

    render(
      <Provider store={store}>
        <InlineEditScreen
          show
          form="edit-item"
          onSubmit={vi.fn()}
          onCancel={onCancel}
        />
      </Provider>,
    );

    expect(screen.getByTestId('dialog')).toHaveAttribute(
      'data-dismissible',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save and Close' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss dialog' }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
