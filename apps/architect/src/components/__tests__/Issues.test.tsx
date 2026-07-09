import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { getFormSyncErrors, hasSubmitFailed } from 'redux-form';
import { describe, expect, it, type Mock, vi } from 'vitest';

import { SegmentedToolbar } from '@codaco/fresco-ui/SegmentedToolbar';

import { useIssuesToolbarSegment } from '../Issues';

vi.mock('redux-form');

const mockIssues = {
  foo: 'bar',
  baz: [
    {
      buzz: 'foo',
      beep: 'boop',
    },
  ],
};

const mockStore = configureStore({
  reducer: {
    form: () => ({}),
  },
});

function IssuesHarness() {
  const { segment } = useIssuesToolbarSegment();
  return segment ? (
    <SegmentedToolbar label="Stage editor actions" items={[segment]} />
  ) : null;
}

describe('<Issues />', () => {
  it('will render', () => {
    (getFormSyncErrors as Mock).mockReturnValue(() => ({}));
    (hasSubmitFailed as Mock).mockReturnValue(() => false);

    const { container } = render(
      <Provider store={mockStore}>
        <IssuesHarness />
      </Provider>,
    );

    expect(container).toMatchSnapshot();
  });

  it('renders issues from object', async () => {
    (getFormSyncErrors as Mock).mockReturnValue(() => mockIssues);
    (hasSubmitFailed as Mock).mockReturnValue(() => true);

    render(
      <Provider store={mockStore}>
        <IssuesHarness />
      </Provider>,
    );

    // Popover content lives in a portal mounted to document.body, and opens
    // automatically on mount because submitFailed + hasIssues.
    expect(await screen.findAllByTestId('issue')).toHaveLength(3);
  });
});
