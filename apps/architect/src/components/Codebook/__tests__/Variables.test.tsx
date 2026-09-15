import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import Variables from '../Variables';

const PERSON = 'person_node_type';
// person.last_name, from the development protocol's codebook.
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

const renderVariables = () =>
  render(
    <Provider store={makeStore()}>
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
    </Provider>,
  );

describe('Codebook attribute table', () => {
  /**
   * The orbiting gradient border marks the one attribute an attribute picker
   * is currently holding. A codebook row only lists attributes, so a pill here
   * that took the animated treatment read as a picker selection that was never
   * made.
   */
  it('gives the name cell the static border, not the animated picker one', () => {
    renderVariables();

    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: last_name',
    });

    expect(pill).toHaveClass('bg-(--variable-pill-accent)');
    expect(pill).not.toHaveClass('variable-pill-effect-border');
  });
});
