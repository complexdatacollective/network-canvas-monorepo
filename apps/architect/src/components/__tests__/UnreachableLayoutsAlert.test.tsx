import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { developmentProtocol } from '~/templates/development-protocol';

import UnreachableLayoutsAlert from '../UnreachableLayoutsAlert';

const renderAlert = (protocol: typeof developmentProtocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(protocolActions.setActiveProtocol(structuredClone(protocol)));
  return render(
    <Provider store={store}>
      <UnreachableLayoutsAlert />
    </Provider>,
  );
};

describe('the timeline warning about layouts with no positions for some nodes', () => {
  it('names the stage, the layout and the node types', () => {
    // The development protocol's Narrative shows anotherLayout, in which no
    // stage places people.
    renderAlert(developmentProtocol);

    expect(
      screen.getByText('Some nodes will have no position in a layout'),
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Narrative shows the layout “anotherLayout”, in which no stage places person nodes.',
    );
  });

  it('shows nothing once a stage places those nodes in the layout', () => {
    const protocol = structuredClone(developmentProtocol);
    const anotherLayout = Object.entries(protocol.codebook.layouts ?? {}).find(
      ([, layout]) => layout.name === 'anotherLayout',
    )?.[0];
    const composer = protocol.stages.find(
      (stage) => stage.type === 'NetworkComposer',
    );
    if (composer?.type !== 'NetworkComposer' || anotherLayout === undefined) {
      throw new Error('The protocol has no Network Composer or anotherLayout.');
    }
    composer.layout = anotherLayout;

    const { container } = renderAlert(protocol);

    expect(container).toBeEmptyDOMElement();
  });
});
