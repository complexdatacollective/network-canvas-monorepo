import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

// The architect test setup mocks `useDialog` globally; this suite is about
// what the REAL dialog does with a rejected `onConfirm`.
vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

import EntityType from '../EntityType';

/**
 * The type half of #1392, which was fixed for variables and left here.
 *
 * `deleteTypeAsync` deleted whatever it was handed and always resolved, so the
 * only thing standing between an in-use node type and its deletion was the
 * row's `inUse` prop — a render-time snapshot. When that snapshot disagreed
 * with the store, the researcher confirmed a deletion, the dialog closed
 * reporting success, and every stage referencing the type was left pointing at
 * something that no longer existed.
 *
 * Two things have to hold, exactly as they do for variables: the thunk REJECTS
 * an in-use type, and the caller `.unwrap()`s so the rejection reaches the
 * dialog instead of being swallowed by a dispatch promise that resolves anyway.
 */

// person — the development protocol's main node type, referenced by its name
// generators and sociograms.
const PERSON = 'person_node_type';

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    protocolActions.setActiveProtocol(
      structuredClone(developmentProtocol) as unknown as CurrentProtocol,
    ),
  );
  return store;
};

describe('Codebook delete type confirmation', () => {
  it('keeps the dialog open and explains the refusal instead of reporting success', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <DialogProvider>
          {/* A stale snapshot: the store says this type IS used. */}
          <EntityType entity="node" type={PERSON} inUse={false} usage={[]} />
        </DialogProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete entity' }));

    const dialog = await screen.findByRole('dialog');
    expect(screen.getByTestId('dialog-primary')).toHaveTextContent(
      'Delete type',
    );

    fireEvent.click(screen.getByTestId('dialog-primary'));

    await waitFor(
      () => {
        expect(screen.getByRole('dialog')).toHaveTextContent(
          /in use and cannot be deleted/i,
        );
      },
      { timeout: 3000 },
    );
    expect(dialog).toBeInTheDocument();
    // The thing that actually matters: the type is still there.
    expect(getProtocol(store.getState())?.codebook.node).toHaveProperty(PERSON);
  });

  it('deletes a type nothing references', async () => {
    const store = makeStore();
    const unusedType = 'unused_node_type';
    const withUnusedType = structuredClone(
      developmentProtocol,
    ) as unknown as CurrentProtocol;
    withUnusedType.codebook.node = {
      ...withUnusedType.codebook.node,
      [unusedType]: {
        name: 'Unused',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    };
    store.dispatch(protocolActions.setActiveProtocol(withUnusedType));

    render(
      <Provider store={store}>
        <DialogProvider>
          <EntityType
            entity="node"
            type={unusedType}
            inUse={false}
            usage={[]}
          />
        </DialogProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete entity' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByTestId('dialog-primary'));

    await waitFor(() => {
      expect(getProtocol(store.getState())?.codebook.node).not.toHaveProperty(
        unusedType,
      );
    });
  });
});
