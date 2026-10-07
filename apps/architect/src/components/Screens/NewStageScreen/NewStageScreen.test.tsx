import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol from '~/ducks/modules/activeProtocol';

import NewStageScreen from './NewStageScreen';

vi.mock('@codaco/protocol-builder/interfaces/StageTypeImage', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/protocol', vi.fn()],
}));

beforeAll(() => {
  // jsdom does not implement scrollIntoView, which the highlight effect calls.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('NewStageScreen', () => {
  // Encrypted attributes are part of every protocol, so there is no per-protocol
  // switch that hides this interface from the picker.
  it('offers the Anonymisation interface', () => {
    const store = configureStore({
      reducer: { activeProtocol: createTimeline(activeProtocol) },
    });

    render(
      <Provider store={store}>
        <NewStageScreen insertAtIndex={0} open onOpenChange={vi.fn()} />
      </Provider>,
    );

    expect(
      screen.getByRole('button', { name: 'Anonymisation Interface' }),
    ).toBeInTheDocument();
  });
});
