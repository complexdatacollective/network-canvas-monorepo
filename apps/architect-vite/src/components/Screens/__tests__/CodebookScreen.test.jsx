import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import React from 'react';
import { createStore } from 'redux';
import { render } from '@testing-library/react';
import CodebookScreen from '../CodebookScreen';

const mockState = {
  protocol: {
    present: {
      stages: [],
    },
  },
};

const mockProps = {
  store: createStore(() => mockState),
};

describe('<CodebookScreen />', () => {
  it('can render', () => {
    const { container } = render(<CodebookScreen {...mockProps} />);

    expect(container).toMatchSnapshot();
  });
});
