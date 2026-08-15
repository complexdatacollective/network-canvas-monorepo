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

import Variables from '../Variables';

/**
 * #1392: the Codebook's delete confirmation reported success for a deletion
 * that never happened.
 *
 * Two independent causes, both covered here. The thunk refused an in-use
 * variable by RESOLVING `false`, and the dialog took a resolved promise as
 * done; and the caller dispatched without `.unwrap()`, so even a rejected
 * thunk arrives as a resolved dispatch promise. Either one alone puts the
 * researcher back on a Codebook that still contains the variable they were
 * told had gone.
 *
 * A row's `inUse` is a render-time snapshot, so a row CAN be clickable while
 * the store says the variable is used — that is exactly the state driven here.
 */

const PERSON = 'person_node_type';
// person.last_name — in use in the development protocol via prompt sort keys.
const LAST_NAME = '0ff25001-a2b8-46de-82a9-53143aa00d10';

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

describe('Codebook delete confirmation', () => {
  it('keeps the dialog open and explains the refusal instead of reporting success', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <DialogProvider>
          <Variables
            entity="node"
            type={PERSON}
            variables={[
              {
                id: LAST_NAME,
                name: 'last_name',
                component: 'Text',
                inUse: false,
                usage: [],
              },
            ]}
          />
        </DialogProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete variable' }));

    const dialog = await screen.findByRole('dialog');
    // The identifier lives in the body, not in the action label — the label is
    // a fixed, localisable string that cannot blow the dialog's width open.
    expect(screen.getByTestId('dialog-primary')).toHaveTextContent(
      'Delete variable',
    );
    expect(dialog).toHaveTextContent('last_name');

    fireEvent.click(screen.getByTestId('dialog-primary'));

    await waitFor(
      () => {
        expect(screen.getByRole('dialog')).toHaveTextContent(
          /in use and cannot be deleted/i,
        );
      },
      { timeout: 3000 },
    );
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(
      getProtocol(store.getState())?.codebook.node?.[PERSON]?.variables,
    ).toHaveProperty(LAST_NAME);
  });
});
