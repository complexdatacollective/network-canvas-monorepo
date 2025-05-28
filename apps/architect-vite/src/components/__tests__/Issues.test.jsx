import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { createStore } from 'redux';
import { Provider } from 'react-redux';
import { getFormSyncErrors } from 'redux-form';
import Issues from '../Issues';

vi.mock('redux-form');

// Mock the useSelector hook to avoid selector issues
vi.mock('react-redux', async () => {
  const actual = await vi.importActual('react-redux');
  return {
    ...actual,
    useSelector: vi.fn(() => ({})),
  };
});

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
  it('will render', () => {
    const { container } = render(
      <Provider store={mockStore}>
        <Issues {...mockProps} />
      </Provider>
    );

    expect(container).toMatchSnapshot();
  });

  it('renders issues from object', () => {
    getFormSyncErrors.mockImplementationOnce(() => () => mockIssues);

    const { container } = render(
      <Provider store={mockStore}>
        <Issues
          {...mockProps}
          show
        />
      </Provider>
    );

    const issueElements = container.querySelectorAll('li.issues__issue');
    expect(issueElements).toHaveLength(3);
  });
});
