import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimelineReducer from '~/ducks/middleware/timeline';
import activeProtocolReducer, {
  setActiveProtocol,
  updateProtocolDescription,
  updateProtocolName,
} from '~/ducks/modules/activeProtocol';

import ProtocolInfoCard from '../ProtocolInfoCard';

vi.mock('@codaco/art', () => ({
  Pattern: () => <div data-testid="protocol-pattern" />,
}));

type MockMotionProps = HTMLAttributes<HTMLDivElement> & {
  animate?: unknown;
  initial?: unknown;
  transition?: unknown;
  children?: ReactNode;
};

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      animate: _animate,
      initial: _initial,
      transition: _transition,
      ...props
    }: MockMotionProps) => <div {...props} />,
  },
  useReducedMotion: () => true,
}));

const protocol: CurrentProtocol = {
  name: 'Original protocol',
  description: 'Original description',
  schemaVersion: 8,
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
};

const createTestStore = () =>
  configureStore({
    reducer: {
      activeProtocol: createTimelineReducer(activeProtocolReducer),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

const renderCard = () => {
  const store = createTestStore();
  store.dispatch(setActiveProtocol(protocol));

  render(
    <Provider store={store}>
      <ProtocolInfoCard />
    </Provider>,
  );

  return store;
};

describe('ProtocolInfoCard', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/protocol');
  });

  it('normalizes newlines and commits the protocol name on Enter or blur', () => {
    const store = renderCard();
    const name = screen.getByRole('textbox', {
      name: 'Protocol name',
    }) as HTMLTextAreaElement;

    fireEvent.change(name, { target: { value: '  Renamed\nprotocol  ' } });
    expect(name).toHaveValue('  Renamed protocol  ');

    name.focus();
    fireEvent.keyDown(name, { key: 'Enter', code: 'Enter' });

    expect(document.activeElement).not.toBe(name);
    expect(store.getState().activeProtocol.present?.name).toBe(
      'Renamed protocol',
    );

    fireEvent.change(name, { target: { value: '  Blur commit  ' } });
    fireEvent.blur(name);

    expect(store.getState().activeProtocol.present?.name).toBe('Blur commit');
  });

  it('rolls a blank protocol name back to the stored value', () => {
    const store = renderCard();
    const name = screen.getByRole('textbox', {
      name: 'Protocol name',
    });

    fireEvent.change(name, { target: { value: ' \n ' } });
    fireEvent.blur(name);

    expect(name).toHaveValue('Original protocol');
    expect(store.getState().activeProtocol.present?.name).toBe(
      'Original protocol',
    );
  });

  it('commits the description on blur and synchronizes real external changes', () => {
    const store = renderCard();
    const description = screen.getByRole('textbox', {
      name: 'Protocol description',
    });

    fireEvent.change(description, {
      target: { value: 'A description still being edited' },
    });

    act(() => {
      store.dispatch(updateProtocolName({ name: 'External name update' }));
    });

    expect(description).toHaveValue('A description still being edited');

    fireEvent.blur(description);
    expect(store.getState().activeProtocol.present?.description).toBe(
      'A description still being edited',
    );

    act(() => {
      store.dispatch(
        updateProtocolDescription({ description: 'External description' }),
      );
    });

    expect(description).toHaveValue('External description');
  });
});
