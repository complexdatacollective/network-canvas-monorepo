import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { v4 as uuid } from 'uuid';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { timelineActions } from '~/ducks/middleware/timeline';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

// The architect test setup mocks `useDialog` globally; these cases are about
// what the REAL dialog puts in front of the researcher.
vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

import EntityType from '../EntityType';
import Variables from '../Variables';

/**
 * #1400: the stage, variable and type delete confirmations all told the
 * researcher the deletion "cannot be undone". Every one of those actions is
 * inside the protocol timeline (`ducks/modules/root.ts` admits `stages/`,
 * `codebook/` and `assetManifest/`), so the toolbar's Undo puts all of them
 * back — the copy was simply false, and a researcher who believed it lost work
 * they never had to lose.
 *
 * These cases assert both halves together: the sentence the dialog shows, and
 * that the sentence is true. A copy assertion on its own would keep passing if
 * a later change took the action out of the timeline.
 *
 * Coverage note. The stage dialog is covered end to end in
 * `e2e/specs/timeline.spec.ts` ("restores a deleted stage…"), where the real
 * toolbar Undo is clicked; mounting `Timeline` here would need a router and the
 * reorder machinery for no extra confidence. The resource dialog
 * (`AssetBrowser.tsx`) already carried this sentence — it is where the wording
 * used here comes from (#1396) — and is left alone. `Home/LibraryPanel.tsx`'s
 * two "This cannot be undone." dialogs are deliberately NOT in this family:
 * they delete protocols and app data from the device, outside any protocol
 * timeline, and are correct as they stand.
 */

const UNDO_PROMISE =
  'You can restore it with Undo while this protocol remains open.';

const PERSON = 'person_node_type';

// A variable and a type invented for this suite, so neither can be in use by a
// stage — `deleteVariableAsync` refuses a used variable, and the type's delete
// control is disabled while it is used.
const SPARE_VARIABLE = uuid();
const SPARE_TYPE = uuid();

const makeStore = () => {
  const protocol = structuredClone(
    developmentProtocol,
  ) as unknown as CurrentProtocol;

  const personVariables = protocol.codebook.node?.[PERSON]?.variables;
  if (!personVariables) throw new Error('fixture is missing the person type');
  personVariables[SPARE_VARIABLE] = { name: 'spare_variable', type: 'text' };

  const nodeTypes = protocol.codebook.node;
  const personType = nodeTypes?.[PERSON];
  if (!nodeTypes || !personType) throw new Error('fixture has no node types');
  // Cloned from the fixture's own person type rather than hand-authored, so
  // this stays a valid node definition (shape, icon, colour) without this
  // suite having to restate the schema.
  nodeTypes[SPARE_TYPE] = {
    ...structuredClone(personType),
    name: 'Spare',
    variables: {},
  };

  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(protocolActions.setActiveProtocol(protocol));
  return store;
};

// The action the toolbar's Undo ends up dispatching. `undoWithNavigation`
// wraps it with tab-ownership and route-restoration concerns, neither of which
// has anything to say about whether the deletion itself is reversible.
const undo = (store: ReturnType<typeof makeStore>) =>
  store.dispatch(timelineActions.undo());

describe('Codebook delete confirmations', () => {
  it('promises Undo for a variable, and Undo brings the variable back', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <DialogProvider>
          <Variables
            entity="node"
            type={PERSON}
            variables={[
              {
                id: SPARE_VARIABLE,
                name: 'spare_variable',
                component: 'Text',
                inUse: false,
                usage: [],
              },
            ]}
          />
        </DialogProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete attribute' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(UNDO_PROMISE);
    expect(dialog).not.toHaveTextContent(/cannot be undone/i);

    fireEvent.click(screen.getByTestId('dialog-primary'));

    await waitFor(() => {
      expect(
        getProtocol(store.getState())?.codebook.node?.[PERSON]?.variables,
      ).not.toHaveProperty(SPARE_VARIABLE);
    });

    undo(store);

    expect(
      getProtocol(store.getState())?.codebook.node?.[PERSON]?.variables,
    ).toHaveProperty(SPARE_VARIABLE);
  });

  it('promises Undo for a type, and Undo brings the type back', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <DialogProvider>
          <EntityType
            entity="node"
            type={SPARE_TYPE}
            usage={[]}
            inUse={false}
          />
        </DialogProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete entity' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(UNDO_PROMISE);
    expect(dialog).not.toHaveTextContent(/cannot be undone/i);

    fireEvent.click(screen.getByTestId('dialog-primary'));

    await waitFor(() => {
      expect(getProtocol(store.getState())?.codebook.node).not.toHaveProperty(
        SPARE_TYPE,
      );
    });

    undo(store);

    expect(getProtocol(store.getState())?.codebook.node).toHaveProperty(
      SPARE_TYPE,
    );
  });
});
