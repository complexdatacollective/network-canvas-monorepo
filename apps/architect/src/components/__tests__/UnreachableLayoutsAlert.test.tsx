import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import {
  protocolShowingUnplacedLayout,
  protocolWithReachableLayouts,
} from '~/templates/__tests__/layoutReadFixtures';

import UnreachableLayoutsAlert from '../UnreachableLayoutsAlert';

const renderAlert = (protocol: CurrentProtocol) => {
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

const SENTENCE =
  'Narrative shows the layout “shownOnlyLayout”, in which no stage places person nodes.';

describe('the timeline warning about layouts with no positions for some nodes', () => {
  it('names the stage, the layout and the node types', () => {
    renderAlert(protocolShowingUnplacedLayout().protocol);

    expect(
      screen.getByText('Some nodes will have no position in a layout'),
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent(SENTENCE);
  });

  it('lists a stage and layout once when several presets show the layout', () => {
    renderAlert(protocolShowingUnplacedLayout(2).protocol);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('listitem')).toHaveTextContent(SENTENCE);
  });

  it('shows nothing when a stage places those nodes in every layout shown', () => {
    const { container } = renderAlert(protocolWithReachableLayouts());

    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing once a stage places those nodes in the layout', () => {
    const { protocol } = protocolShowingUnplacedLayout();
    const composer = protocol.stages.find(
      (stage) => stage.type === 'NetworkComposer',
    );
    if (composer?.type !== 'NetworkComposer') {
      throw new Error('The protocol has no Network Composer.');
    }
    const narrativeLayouts = protocol.stages.flatMap((stage) =>
      stage.type === 'Narrative'
        ? stage.presets.map((preset) => preset.layout)
        : [],
    );
    // The Composer places people in the layout the last preset shows; the
    // first Sociogram still places them in the one the first preset shows.
    composer.layout = narrativeLayouts.at(-1) ?? composer.layout;

    const { container } = renderAlert(protocol);

    expect(container).toBeEmptyDOMElement();
  });
});
