import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';

vi.mock('../../../hooks/useAssetUrl', () => ({
  useAssetUrl: () => ({ url: null, isLoading: false, error: null }),
}));

// Records whether the canvas lights each node, and still draws the node.
const lit = vi.hoisted(() => new Map<string, boolean>());
vi.mock('../../../canvas/CanvasNode', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../canvas/CanvasNode')>();
  const RecordingNode = (
    props: React.ComponentProps<typeof actual.default>,
  ) => {
    lit.set(props.node[entityPrimaryKeyProperty], props.highlighted ?? false);
    return <actual.default {...props} />;
  };
  return { default: RecordingNode };
});

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
const CLOSE = testVariableId('person-close');
const BUSY = testVariableId('place-busy');
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
      variables: {
        [NAME]: { name: 'name', type: 'text' as const },
        [CLOSE]: { name: 'close', type: 'boolean' as const },
      },
    },
    [PLACE]: {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'square' as const },
      variables: {
        [PLACE_NAME]: { name: 'name', type: 'text' as const },
        [BUSY]: { name: 'busy', type: 'boolean' as const },
      },
    },
  },
  edge: {},
  layouts: { [LAYOUT]: { name: 'map' } },
  ego: { variables: {} },
};

const node = (
  id: string,
  type: string,
  attributes: Record<string, string | boolean | { x: number; y: number }>,
) => ({
  [entityPrimaryKeyProperty]: id,
  type,
  [entityAttributesProperty]: attributes,
});

function renderNarrative(
  narrative: StageProps<'Narrative'>['stage'] = stage,
  extraNodes: ReturnType<typeof node>[] = [],
) {
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
            ...extraNodes,
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
        stages: [narrative],
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
      stage={narrative}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
    { wrapper: Wrapper },
  );
  return store;
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

  it('Narrative shows only nodes of its two subject types that hold the preset layout', async () => {
    renderNarrative(
      { ...stage, subject: { entity: 'node', types: [PERSON, PLACE] } },
      [
        node('office', testTypeId('organisation'), {
          [LAYOUT]: { x: 0.5, y: 0.2 },
        }),
      ],
    );

    await waitFor(() => {
      expect(screen.getByText('Alex')).toBeInTheDocument();
    });
    expect(screen.getByText('Park')).toBeInTheDocument();
    expect(screen.queryByText('Blair')).not.toBeInTheDocument();
    expect(lit.has('office')).toBe(false);
  });

  it('one switch lights matching nodes of every type with an attribute in the entry', async () => {
    lit.clear();
    const attribute = (name: string, type: string, variable: string) => ({
      id: testId(name),
      type,
      variable,
    });
    renderNarrative(
      {
        ...stage,
        subject: { entity: 'node', types: [PERSON, PLACE] },
        presets: [
          {
            id: testId('preset'),
            label: { en: 'View' },
            layout: LAYOUT,
            highlight: [
              {
                id: testId('entry-close'),
                label: { en: 'Close or busy' },
                attributes: [
                  attribute('close-person', PERSON, CLOSE),
                  attribute('close-place', PLACE, BUSY),
                ],
              },
              {
                id: testId('entry-person'),
                label: { en: 'Close people' },
                attributes: [attribute('only-person', PERSON, CLOSE)],
              },
            ],
          },
        ],
      },
      [
        node('casey', PERSON, { [CLOSE]: true, [LAYOUT]: { x: 0.2, y: 0.7 } }),
        node('cafe', PLACE, { [BUSY]: true, [LAYOUT]: { x: 0.8, y: 0.2 } }),
      ],
    );

    await waitFor(() => expect(lit.get('cafe')).toBe(true));
    expect(lit.get('casey')).toBe(true);
    expect(lit.get('alex')).toBe(false);
    expect(lit.get('park')).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: 'Close people' }));

    await waitFor(() => expect(lit.get('cafe')).toBe(false));
    expect(lit.get('casey')).toBe(true);
  });

  it('repositioning a node on a Narrative writes nothing to the layout', async () => {
    const store = renderNarrative({
      ...stage,
      behaviours: { allowRepositioning: true },
    });
    const alex = await screen.findByRole('button', { name: 'Alex' });
    expect(alex.style.left).toBe('30%');

    fireEvent.keyDown(alex, { key: 'ArrowRight' });

    // The node moves on the canvas, but the stored layout keeps its place.
    await waitFor(() => expect(alex.style.left).not.toBe('30%'));
    const stored = store
      .getState()
      .session.network.nodes.find(
        (entry) => entry[entityPrimaryKeyProperty] === 'alex',
      );
    expect(stored?.[entityAttributesProperty][LAYOUT]).toEqual({
      x: 0.3,
      y: 0.3,
    });
  });

  it('free-draw is offered when the stage allows it', async () => {
    renderNarrative({ ...stage, behaviours: { freeDraw: true } });
    expect(
      await screen.findByRole('button', { name: 'Toggle drawing' }),
    ).toBeInTheDocument();
  });

  it('free-draw is not offered when the stage does not allow it', async () => {
    renderNarrative();
    await screen.findByText('Alex');
    expect(
      screen.queryByRole('button', { name: 'Toggle drawing' }),
    ).not.toBeInTheDocument();
  });
});
