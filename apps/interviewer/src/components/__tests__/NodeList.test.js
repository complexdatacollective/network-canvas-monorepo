/* eslint-disable @codaco/spellcheck/spell-checker */
import { vi } from 'vitest';

/* eslint-disable @codaco/spellcheck/spell-checker */

import { shallow } from 'enzyme';
import React from 'react';
import { createStore } from 'redux';
import NodeList from '../NodeList';

vi.mock('@codaco/ui/lib/utils/CSSVariables');

const mockStore = createStore(() => ({ droppable: { activeZones: [] }, draggable: { draggingFromIds: {} } }));

describe('NodeList component', () => {
  it('renders ok', () => {
    const component = shallow(<NodeList id="foo" listId="foo_bar" store={mockStore} />);

    expect(component).toMatchSnapshot();
  });
});
