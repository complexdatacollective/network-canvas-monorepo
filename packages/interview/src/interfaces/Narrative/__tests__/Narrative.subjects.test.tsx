import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';

vi.mock('../../../hooks/useAssetUrl', () => ({
  useAssetUrl: () => ({ url: null, isLoading: false, error: null }),
}));

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewQueryClientProvider } from '../../../contexts/InterviewQueryClientProvider';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import Narrative from '../Narrative';

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const NAME = testVariableId('person-name');
const PLACE_NAME = testVariableId('place-name');
const LAYOUT = testId('shared-layout');

const stage: StageProps<'Narrative'>['stage'] = {
  id: testId('narrative'),
  type: 'Narrative',
  label: { en: 'Narrative' },
  subject: { entity: 'node', types: [PERSON] },
  presets: [{ id: testId('preset'), label: { en: 'View' }, layout: LAYOUT }],
  background: { concentricCircles: 3 },
};

const codebook = {
  node: {
    [PERSON]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: { [NAME]: { name: 'name', type: 'text' as const } },
    },
    [PLACE]: {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'square' as const },
      variables: { [PLACE_NAME]: { name: 'name', type: 'text' as const } },
    },
  },
  edge: {},
  layouts: { [LAYOUT]: { name: 'map' } },
  ego: { variables: {} },
};

const node = (
  id: string,
  type: string,
  attributes: Record<string, string | { x: number; y: number }>,
) => ({
  [entityPrimaryKeyProperty]: id,
  type,
  [entityAttributesProperty]: attributes,
});

function renderNarrative() {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: [
            node('alex', PERSON, {
              [NAME]: 'Alex',
              [LAYOUT]: { x: 0.3, y: 0.3 },
            }),
            node('blair', PERSON, { [NAME]: 'Blair' }),
            node('park', PLACE, {
              [PLACE_NAME]: 'Park',
              [LAYOUT]: { x: 0.6, y: 0.6 },
            }),
          ],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook,
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  const registerBeforeNext: RegisterBeforeNext = vi.fn();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <InterviewQueryClientProvider protocolKey="test-protocol">
          <ContractProvider
            onFinish={vi.fn()}
            onRequestAsset={vi.fn()}
            flags={{ isE2E: false, isDevelopment: false }}
          >
            <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
              <StageMetadataContext.Provider value={registerBeforeNext}>
                <DndStoreProvider>
                  <TestProtocolLocalization>
                    {children}
                  </TestProtocolLocalization>
                </DndStoreProvider>
              </StageMetadataContext.Provider>
            </CurrentStepProvider>
          </ContractProvider>
        </InterviewQueryClientProvider>
      </Provider>
    );
  }

  render(
    <Narrative
      stage={stage}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
    { wrapper: Wrapper },
  );
}

describe('Narrative', () => {
  it('Narrative shows only nodes of its subject types that hold the preset layout', async () => {
    renderNarrative();

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    expect(screen.queryByText('Blair')).not.toBeInTheDocument();
    expect(screen.queryByText('Park')).not.toBeInTheDocument();
  });
});
