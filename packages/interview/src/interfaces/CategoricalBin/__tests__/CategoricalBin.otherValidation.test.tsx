import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import CategoricalBin from '../CategoricalBin';
import { getCatBinDropTargetId } from '../components/CategoricalBinItem';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class ImmediateIntersectionObserver {
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  // jsdom implements window.scrollTo as a no-op that logs "Not implemented"
  // to the console; an invalid dialog submission's focus-management
  // (fresco-ui's focusFirstError) triggers it indirectly. Stub it so the
  // test's output stays clean.
  vi.stubGlobal('scrollTo', vi.fn());
});

const NODE_TYPE = 'person';
const CATEGORY_VARIABLE = 'category';
const OTHER_VARIABLE = 'otherReason';
const STAGE_ID = 'categorical-bin-stage';
const PROMPT_ID = 'prompt-1';
const OTHER_PROMPT_TEXT = 'Please specify the other category';
// Only one categorical option is configured, so the bins array is
// [category option, other bin] — the other bin is always index 1 here.
const OTHER_BIN_INDEX = 1;

const node: NcNode = {
  [entityPrimaryKeyProperty]: 'node-1',
  type: NODE_TYPE,
  [entityAttributesProperty]: {},
};

function buildCodebook(otherValidation?: Record<string, unknown>) {
  return {
    node: {
      [NODE_TYPE]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [CATEGORY_VARIABLE]: {
            name: 'Category',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [{ label: 'Family', value: 1 }],
          },
          [OTHER_VARIABLE]: {
            name: 'Other reason',
            type: 'text',
            component: 'Text',
            ...(otherValidation ? { validation: otherValidation } : {}),
          },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  };
}

function buildStage() {
  return {
    id: STAGE_ID,
    type: 'CategoricalBin',
    label: 'Categorise people',
    subject: { entity: 'node', type: NODE_TYPE },
    prompts: [
      {
        id: PROMPT_ID,
        text: 'Which category?',
        variable: CATEGORY_VARIABLE,
        otherVariable: OTHER_VARIABLE,
        otherVariablePrompt: OTHER_PROMPT_TEXT,
        otherOptionLabel: 'Other',
      },
    ],
  };
}

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  useEffect(() => {
    onStore(store);
  }, [store, onStore]);
  return null;
}

function renderCategoricalBin(otherValidation?: Record<string, unknown>) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'session',
        promptIndex: 0,
        network: {
          ego: { [entityAttributesProperty]: {} },
          nodes: [node],
          edges: [],
        },
      } as never,
      protocol: {
        id: 'protocol',
        hash: 'hash',
        schemaVersion: 8,
        codebook: buildCodebook(otherValidation),
        stages: [buildStage()],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  let dndStore: StoreApi<DndStore> | null = null;

  render(
    <Provider store={store}>
      <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
        <DialogProvider>
          <DndStoreProvider>
            <CaptureDndStore
              onStore={(s) => {
                dndStore = s;
              }}
            />
            {/* CategoricalBin never reads its props (destructures `_props`);
                these satisfy the type without any bearing on behaviour. */}
            <CategoricalBin
              stage={buildStage() as never}
              getNavigationHelpers={() => ({
                moveForward: () => {},
                moveBackward: () => {},
              })}
            />
          </DndStoreProvider>
        </DialogProvider>
      </CurrentStepProvider>
    </Provider>,
  );

  return { store, getDndStore: () => dndStore! };
}

/** Simulate dropping `node` onto the "other" bin by driving the dnd store
 * directly (mirrors the pattern used by NodeDrawer's tests), since a real
 * pointer-driven drag gesture is not reliable in jsdom. */
async function dropNodeIntoOtherBin(getDndStore: () => StoreApi<DndStore>) {
  const dropTargetId = getCatBinDropTargetId(
    STAGE_ID,
    PROMPT_ID,
    OTHER_BIN_INDEX,
  );

  act(() => {
    getDndStore().getState().startDrag(
      {
        id: node[entityPrimaryKeyProperty],
        type: 'NODE',
        metadata: node,
        _sourceZone: null,
      },
      { x: 0, y: 0, width: 10, height: 10 },
    );
  });

  await waitFor(() => {
    expect(
      getDndStore().getState().getDropTargetState(dropTargetId)?.canDrop,
    ).toBe(true);
  });

  act(() => {
    getDndStore().getState().setActiveDropTarget(dropTargetId);
    getDndStore().getState().endDrag();
  });
}

function getOtherAttribute(
  store: ReturnType<typeof renderCategoricalBin>['store'],
) {
  const updatedNode = store
    .getState()
    .session.network?.nodes.find(
      (candidate: NcNode) =>
        candidate[entityPrimaryKeyProperty] === node[entityPrimaryKeyProperty],
    );
  return updatedNode?.[entityAttributesProperty][OTHER_VARIABLE];
}

describe('CategoricalBin other-input honours codebook validation', () => {
  it('rejects an empty entry and an entry over maxLength when the codebook requires the field', async () => {
    const { store, getDndStore } = renderCategoricalBin({
      required: true,
      maxLength: 5,
    });

    await dropNodeIntoOtherBin(getDndStore);

    const input = await screen.findByRole('textbox');

    // Over maxLength (6 chars): rejected, dialog stays open, nothing written.
    fireEvent.change(input, { target: { value: 'abcdef' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await screen.findByTestId('otherVariable-field-error');
    expect(screen.getByTestId('dialog-submit')).toBeInTheDocument();
    expect(getOtherAttribute(store)).toBeUndefined();

    // Empty (violates required): also rejected.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await screen.findByTestId('otherVariable-field-error');
    expect(screen.getByTestId('dialog-submit')).toBeInTheDocument();
    expect(getOtherAttribute(store)).toBeUndefined();
  });

  it('accepts an empty submission when the codebook has no validation rules for the field', async () => {
    const { store, getDndStore } = renderCategoricalBin(undefined);

    await dropNodeIntoOtherBin(getDndStore);

    await screen.findByRole('textbox');
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() => {
      expect(screen.queryByTestId('dialog-submit')).not.toBeInTheDocument();
    });

    expect(getOtherAttribute(store)).toBeNull();
  });
});
