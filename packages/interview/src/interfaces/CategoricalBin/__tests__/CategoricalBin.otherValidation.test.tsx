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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import {
  asEntityAttributeReference,
  type Codebook,
  type Validation,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../../contract/types';
import protocol from '../../../store/modules/protocol';
import session, { type SessionState } from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import CategoricalBin from '../CategoricalBin';
import { getCatBinDropTargetId } from '../components/CategoricalBinItem';

const { celebrate, track } = vi.hoisted(() => ({
  celebrate: vi.fn(),
  track: vi.fn(),
}));

vi.mock('../../../hooks/useCelebrate', () => ({
  useCelebrate: () => celebrate,
}));

vi.mock('../../../analytics/useTrack', () => ({
  useTrack: () => track,
}));

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
    // jsdom has no real IntersectionObserver, and the DOM lib's
    // IntersectionObserverEntry/IntersectionObserver types carry many
    // properties (boundingClientRect, intersectionRatio, ...) this minimal
    // stub doesn't implement. This is the same narrow, established stub
    // pattern used package-wide (see SlidesForm.navigation.test.tsx and
    // NetworkComposer.inspector.test.tsx).
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

beforeEach(() => {
  celebrate.mockClear();
  track.mockClear();
});

const NODE_TYPE = 'person';
const CATEGORY_VARIABLE = 'category';
const OTHER_VARIABLE = 'otherReason';
const NOTE_VARIABLE = 'existingNote';
const COLLIDING_SIBLING_VARIABLE = 'otherVariable';
const STAGE_ID = 'categorical-bin-stage';
const PROMPT_ID = 'prompt-1';
const OTHER_PROMPT_TEXT = 'Please specify the other category';
const RESERVED_NOTE_VALUE = 'reserved-value';
// Only one categorical option is configured, so the bins array is
// [category option, other bin] — the other bin is always index 1 here.
const OTHER_BIN_INDEX = 1;

const node: NcNode = {
  [entityPrimaryKeyProperty]: 'node-1',
  type: NODE_TYPE,
  [entityAttributesProperty]: {
    [NOTE_VARIABLE]: RESERVED_NOTE_VALUE,
    [COLLIDING_SIBLING_VARIABLE]: RESERVED_NOTE_VALUE,
  },
};

function buildCodebook(
  otherValidation?: Validation,
  // Architect's "Create New Variable" dialog never sets `component` on a
  // variable created there — the schema permits this — so a component-less
  // otherVariable is the realistic (not synthetic-only) case the regression
  // test below exercises.
  omitOtherComponent = false,
): Codebook {
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
            // The schema's categoricalOptionsSchema requires >= 2 options at
            // runtime (an authoring-time zod refinement), but that minimum
            // isn't reflected in the static Variable type, and bins is fixed
            // to [category option, other bin] with the "other" bin at index 1
            // as long as there is exactly one option — matching
            // OTHER_BIN_INDEX below.
            options: [{ label: 'Family', value: 1 }],
          },
          [OTHER_VARIABLE]: {
            name: 'Other reason',
            type: 'text',
            ...(omitOtherComponent ? {} : { component: 'Text' }),
            ...(otherValidation ? { validation: otherValidation } : {}),
          },
          [NOTE_VARIABLE]: {
            name: 'Existing note',
            type: 'text',
            component: 'Text',
          },
          [COLLIDING_SIBLING_VARIABLE]: {
            name: 'Collision-prone sibling',
            type: 'text',
            component: 'Text',
          },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  };
}

type CategoricalBinStage = StageProps<'CategoricalBin'>['stage'];

function buildStage(): CategoricalBinStage {
  return {
    id: STAGE_ID,
    type: 'CategoricalBin',
    label: 'Categorise people',
    subject: { entity: 'node', type: NODE_TYPE },
    prompts: [
      {
        id: PROMPT_ID,
        text: 'Which category?',
        variable: asEntityAttributeReference(CATEGORY_VARIABLE),
        otherVariable: asEntityAttributeReference(OTHER_VARIABLE),
        otherVariablePrompt: OTHER_PROMPT_TEXT,
        otherOptionLabel: 'Other',
      },
    ],
  };
}

function buildSession(): SessionState {
  return {
    id: 'session',
    startTime: '2024-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2024-01-01T00:00:00.000Z',
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego',
        [entityAttributesProperty]: {},
      },
      nodes: [node],
      edges: [],
    },
  };
}

function buildProtocol(
  otherValidation?: Validation,
  omitOtherComponent = false,
): ProtocolPayload {
  return {
    id: 'protocol',
    hash: 'hash',
    importedAt: '2024-01-01T00:00:00.000Z',
    assets: [],
    name: 'Test protocol',
    schemaVersion: 8,
    codebook: buildCodebook(otherValidation, omitOtherComponent),
    stages: [buildStage()],
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

function renderCategoricalBin(
  otherValidation?: Validation,
  omitOtherComponent = false,
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: buildSession(),
      protocol: buildProtocol(otherValidation, omitOtherComponent),
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
              stage={buildStage()}
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

async function waitForDialogToClose() {
  // DialogProvider deliberately keeps a closing dialog mounted for 500ms.
  // The full workspace CI run heavily contends this jsdom worker, so allow the
  // transition the same kind of headroom as the suite's 20s test timeout.
  await waitFor(
    () => {
      expect(screen.queryByTestId('dialog-submit')).not.toBeInTheDocument();
    },
    { timeout: 10_000 },
  );
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

    await screen.findByTestId(`${OTHER_VARIABLE}-field-error`);
    expect(screen.getByTestId('dialog-submit')).toBeInTheDocument();
    expect(getOtherAttribute(store)).toBeUndefined();

    // Empty (violates required): also rejected.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await screen.findByTestId(`${OTHER_VARIABLE}-field-error`);
    expect(screen.getByTestId('dialog-submit')).toBeInTheDocument();
    expect(getOtherAttribute(store)).toBeUndefined();
  });

  it('accepts an empty submission when the codebook has no validation rules and places the node in Other', async () => {
    const { store, getDndStore } = renderCategoricalBin(undefined);

    await dropNodeIntoOtherBin(getDndStore);

    await screen.findByRole('textbox');
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitForDialogToClose();

    expect(getOtherAttribute(store)).toBe('');
    expect(
      screen.getByRole('button', { name: 'Category Other, 1 items' }),
    ).toBeInTheDocument();
    expect(celebrate).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('node_binned', {
      node_id: node[entityPrimaryKeyProperty],
      node_type: node.type,
      bin_index: OTHER_BIN_INDEX,
    });
  });

  it('returns a cancelled drop to the drawer without success feedback or analytics', async () => {
    const { store, getDndStore } = renderCategoricalBin(undefined);

    await dropNodeIntoOtherBin(getDndStore);
    await screen.findByRole('textbox');
    await act(async () => {
      fireEvent.click(screen.getByTestId('dialog-cancel'));
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    await waitForDialogToClose();

    expect(getOtherAttribute(store)).toBeUndefined();
    expect(
      screen.getByRole('button', { name: RESERVED_NOTE_VALUE }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Category Other, 0 items' }),
    ).toBeInTheDocument();
    expect(celebrate).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('rejects a value matching a sibling attribute on the same node and accepts a distinct one, proving validationContext (network + currentEntityId) reaches the dialog Field', async () => {
    const { store, getDndStore } = renderCategoricalBin({
      differentFrom: asEntityAttributeReference(NOTE_VARIABLE),
    });

    await dropNodeIntoOtherBin(getDndStore);

    const input = await screen.findByRole('textbox');

    // Matches the node's existing `existingNote` attribute: rejected without
    // validationContext (differentFrom has nothing to compare against, since
    fireEvent.change(input, { target: { value: RESERVED_NOTE_VALUE } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await screen.findByTestId(`${OTHER_VARIABLE}-field-error`);
    expect(screen.getByTestId('dialog-submit')).toBeInTheDocument();
    expect(getOtherAttribute(store)).toBeUndefined();

    // A distinct value is accepted and written.
    fireEvent.change(input, { target: { value: 'a genuinely new reason' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitForDialogToClose();

    expect(getOtherAttribute(store)).toBe('a genuinely new reason');
  });

  it('resolves a reference to a sibling literally named otherVariable instead of comparing the dialog answer with itself', async () => {
    const { store, getDndStore } = renderCategoricalBin({
      differentFrom: asEntityAttributeReference(COLLIDING_SIBLING_VARIABLE),
    });

    await dropNodeIntoOtherBin(getDndStore);

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: RESERVED_NOTE_VALUE } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await screen.findByTestId(`${OTHER_VARIABLE}-field-error`);
    expect(getOtherAttribute(store)).toBeUndefined();

    fireEvent.change(input, { target: { value: 'a distinct reason' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitForDialogToClose();

    expect(getOtherAttribute(store)).toBe('a distinct reason');
  });

  it('still enforces validation for a component-less otherVariable (e.g. one created via Architect\'s "Create New Variable" dialog, which never sets `component`), without crashing', async () => {
    const { store, getDndStore } = renderCategoricalBin(
      { required: true },
      true,
    );

    await dropNodeIntoOtherBin(getDndStore);

    const input = await screen.findByRole('textbox');

    // Empty (violates required): rejected, dialog stays open, nothing
    // written — proving validation still applies even though the codebook
    // variable carries no `component`.
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await screen.findByTestId(`${OTHER_VARIABLE}-field-error`);
    expect(screen.getByTestId('dialog-submit')).toBeInTheDocument();
    expect(getOtherAttribute(store)).toBeUndefined();

    // A valid value is accepted and written.
    fireEvent.change(input, { target: { value: 'a genuinely new reason' } });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitForDialogToClose();

    expect(getOtherAttribute(store)).toBe('a genuinely new reason');
  });
});
