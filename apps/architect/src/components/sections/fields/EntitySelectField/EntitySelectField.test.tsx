import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirm = vi.fn();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm }),
}));

vi.mock('~/components/Dialog/NewTypeDialog', () => ({
  default: ({
    show,
    onComplete,
  }: {
    show: boolean;
    onComplete: (id?: string) => void;
  }) =>
    show ? (
      <button type="button" onClick={() => onComplete('new-person')}>
        Complete new type
      </button>
    ) : null,
}));

import { EntitySelectControl } from './EntitySelectField';

const store = configureStore({
  reducer: {
    activeProtocol: () => ({
      present: {
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              shape: { default: 'circle' },
              variables: {},
            },
            place: {
              name: 'Place',
              color: 'node-color-seq-2',
              shape: { default: 'square' },
              variables: {},
            },
          },
          edge: {},
          ego: { variables: {} },
        },
        stages: [],
      },
    }),
  },
});

const renderControl = (
  props: Partial<ComponentProps<typeof EntitySelectControl>> = {},
) => {
  const onChange = vi.fn();
  render(
    <Provider store={store}>
      <EntitySelectControl
        id="entity-type"
        entityType="node"
        value="person"
        onChange={onChange}
        {...props}
      />
    </Provider>,
  );
  return onChange;
};

describe('EntitySelectControl', () => {
  beforeEach(() => {
    confirm.mockReset();
  });

  it('exposes selectable entity types as a radio group', () => {
    const onChange = renderControl({ required: true });

    expect(
      screen.getByRole('radiogroup', { name: 'Node type options' }),
    ).toBeRequired();
    expect(
      screen.getByRole('radio', { name: 'Select node Person' }),
    ).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Place' }));
    expect(onChange).toHaveBeenCalledWith('place');
  });

  it('waits for confirmation before replacing an existing type', () => {
    confirm.mockImplementation(({ onConfirm }: { onConfirm: () => void }) => {
      onConfirm();
      return Promise.resolve(true);
    });
    const onChange = renderControl({ promptBeforeChange: 'Existing data.' });

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Place' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('place');
  });

  it('creates and selects a new entity type', () => {
    const onChange = renderControl();

    fireEvent.click(
      screen.getByRole('button', { name: 'Create new node type' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete new type' }));

    expect(onChange).toHaveBeenCalledWith('new-person');
  });
});
