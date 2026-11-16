/* eslint-env jest */

import { mount } from 'enzyme';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetFormSyncErrors = vi.fn(() => () => ({}));

vi.mock('redux-form', () => ({
  getFormSyncErrors: mockGetFormSyncErrors,
}));

// Import Issues after mock is set up
const { default: Issues } = await import('../Issues');

const mockIssues = {
  foo: 'bar',
  baz: [
    {
      buzz: 'foo',
      beep: 'boop',
    },
  ],
};

const mockProps = {
  form: 'test',
  show: true,
  hideIssues: () => {},
};

const mockStore = createStore(() => ({}));

describe('<Issues />', () => {
  beforeEach(() => {
    mockGetFormSyncErrors.mockReset();
    mockGetFormSyncErrors.mockReturnValue(() => ({}));
  });

  it('renders issues from object', () => {
    mockGetFormSyncErrors.mockReturnValue(() => mockIssues);

    const component = mount(
      <Provider store={mockStore}>
        <Issues {...mockProps} show />
      </Provider>,
    );

    expect(component.find('li.issues__issue').length).toBe(3);
  });
});
