import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';
import { CurrentStepProvider } from '~/contexts/CurrentStepContext';
import { StageMetadataContext } from '~/contexts/StageMetadataContext';
import { ContractProvider } from '~/contract/context';
import protocol from '~/store/modules/protocol';
import session from '~/store/modules/session';
import ui from '~/store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '~/types';

import NetworkComposer from '../NetworkComposer';

// jsdom has no Worker, and automatic mode would otherwise construct the shared
// auto-layout worker. These tests cover the metadata-driven layout toggle, not
// the simulation, so stub the engine out.
vi.mock('~/canvas/useAutoLayout', () => ({
  useAutoLayout: () => ({
    isRunning: false,
    start: vi.fn(),
    stop: vi.fn(),
    reheat: vi.fn(),
    moveNode: vi.fn(),
    releaseNode: vi.fn(),
    simulationEnabled: false,
    toggleSimulation: vi.fn(),
  }),
}));

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const NODE_TYPE = 'person';
const EDGE_TYPE = 'knows';
const LAYOUT_VAR = 'xy_position';
const QUICK_ADD_VAR = 'var-quick-add';

const makeStage = (defaultEnabled: boolean) => ({
  id: 'nc1',
  type: 'NetworkComposer' as const,
  label: 'Network Composer',
  subject: { entity: 'node' as const, type: NODE_TYPE },
  layoutVariable: LAYOUT_VAR,
  quickAdd: QUICK_ADD_VAR,
  edges: [{ subject: { entity: 'edge' as const, type: EDGE_TYPE } }],
  behaviours: { automaticLayout: defaultEnabled },
});

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: {
        [QUICK_ADD_VAR]: { name: 'name', type: 'text' as const },
        [LAYOUT_VAR]: { name: 'position', type: 'layout' as const },
      },
    },
  },
  edge: {
    [EDGE_TYPE]: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
  },
  ego: { variables: {} },
};

function renderInterface({
  defaultEnabled = false,
  stageMetadata,
}: {
  defaultEnabled?: boolean;
  stageMetadata?: Record<number, unknown>;
} = {}) {
  const stage = makeStage(defaultEnabled);
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        stageMetadata,
        network: {
          nodes: [],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook,
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  const props: StageProps<'NetworkComposer'> = {
    stage: stage as StageProps<'NetworkComposer'>['stage'],
    getNavigationHelpers: () => ({
      moveForward: vi.fn(),
      moveBackward: vi.fn(),
    }),
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <ContractProvider
          onFinish={vi.fn()}
          onRequestAsset={vi.fn()}
          flags={{ isE2E: false, isDevelopment: false }}
        >
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            <StageMetadataContext.Provider
              value={vi.fn() as unknown as RegisterBeforeNext}
            >
              {children}
            </StageMetadataContext.Provider>
          </CurrentStepProvider>
        </ContractProvider>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });

  return { store };
}

const layoutMode = () =>
  screen.getByTestId('network-composer').getAttribute('data-layout-mode');
// Automatic layout is a switch (a ToggleField), not a tool button.
const layoutSwitch = () =>
  screen.getByRole('switch', { name: 'Automatic layout' });

describe('NetworkComposer automatic layout', () => {
  it('defaults to manual when defaultEnabled is false and there is no metadata', () => {
    renderInterface({ defaultEnabled: false });
    expect(layoutMode()).toBe('MANUAL');
    expect(layoutSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('starts in automatic mode when defaultEnabled is true', () => {
    renderInterface({ defaultEnabled: true });
    expect(layoutMode()).toBe('AUTOMATIC');
    expect(layoutSwitch().getAttribute('aria-checked')).toBe('true');
  });

  it('lets stage metadata override the schema default', () => {
    // Default is on, but the participant previously switched it off — metadata wins.
    renderInterface({
      defaultEnabled: true,
      stageMetadata: { 0: { automaticLayout: false } },
    });
    expect(layoutMode()).toBe('MANUAL');
    expect(layoutSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('falls back to the default when persisted metadata is malformed', () => {
    // A non-boolean (or otherwise malformed) value must not be treated as
    // enabled, and must not throw on the `in` operator.
    renderInterface({
      defaultEnabled: false,
      stageMetadata: { 0: { automaticLayout: 'yes' } as unknown },
    });
    expect(layoutMode()).toBe('MANUAL');
    expect(layoutSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('persists the participant toggle to stage metadata', () => {
    const { store } = renderInterface({ defaultEnabled: false });
    fireEvent.click(layoutSwitch());
    const metadata = store.getState().session.stageMetadata as
      | Record<number, unknown>
      | undefined;
    expect(metadata?.[0]).toEqual({ automaticLayout: true });
    expect(layoutMode()).toBe('AUTOMATIC');
  });
});
