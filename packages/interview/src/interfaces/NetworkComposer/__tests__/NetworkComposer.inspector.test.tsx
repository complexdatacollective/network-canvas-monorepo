import { configureStore, type Middleware } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import type { AttributePatch } from '../../../store/entityAttributePatch';
import protocol from '../../../store/modules/protocol';
import session, { updateNode } from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type {
  BeforeNextFunction,
  RegisterBeforeNext,
  StageProps,
} from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import Inspector, { type InspectorProps } from '../Inspector';
import NetworkComposer from '../NetworkComposer';
import { composerWords, OVERTAKEN_EDIT_NOTICE } from './composerWords';

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }

  // SlidesForm uses IntersectionObserver via useScrolledToBottom; stub it so
  // the sentinel is immediately "visible" (intersection fires on observe).
  class MockIntersectionObserver {
    private callback: IntersectionObserverCallback;

    constructor(cb: IntersectionObserverCallback) {
      this.callback = cb;
    }

    // Reported once the observing component has mounted, as a browser does:
    // the drawer's form errors start an animation when they come into view.
    observe(target: Element) {
      queueMicrotask(() =>
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      );
    }

    unobserve() {}
    disconnect() {}
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

const NODE_TYPE = 'person';
const EDGE_TYPE = 'knows';
const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';
const NODE_NAME_VAR = 'var-name';
const EDGE_STRENGTH_VAR = 'var-strength';
const PROTOTYPE_VAR = '__proto__';

const nodeForm = {
  fields: [
    {
      variable: NODE_NAME_VAR,
      component: 'Text',
      label: { en: 'Full name' },
    },
  ],
};

const edgeForm = {
  fields: [
    {
      variable: EDGE_STRENGTH_VAR,
      component: 'Text',
      label: { en: 'Strength' },
    },
  ],
};

const stage = {
  id: 'nc1',
  type: 'NetworkComposer' as const,
  ...composerWords(),
  label: { en: 'Network Composer' },
  subject: { entity: 'node' as const, type: NODE_TYPE },
  layoutVariable: LAYOUT_VAR,
  quickAdd: QUICK_ADD_VAR,
  nodeForm,
  edges: [
    {
      subject: { entity: 'edge' as const, type: EDGE_TYPE },
      form: edgeForm,
    },
  ],
  background: {
    concentricCircles: 4,
    skewedTowardCenter: true,
  },
};

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: {
        [QUICK_ADD_VAR]: {
          name: 'name',
          label: 'Name',
          type: 'text' as const,
          component: 'Text' as const,
        },
        [LAYOUT_VAR]: {
          name: 'position',
          label: 'Position',
          type: 'layout' as const,
        },
        [NODE_NAME_VAR]: {
          name: 'Full name',
          label: 'Full name',
          type: 'text' as const,
          component: 'Text' as const,
        },
      },
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Knows',
      label: { en: 'Knows' },
      color: 'edge-color-seq-1',
      variables: {
        [EDGE_STRENGTH_VAR]: {
          name: 'Strength',
          label: 'Strength',
          type: 'text' as const,
          component: 'Text' as const,
        },
      },
    },
  },
  ego: { variables: {} },
};

const NODE_A_ID = 'node-a';
const NODE_B_ID = 'node-b';
const EDGE_ID = 'edge-ab';

function makePreloadedNodes() {
  return [
    {
      [entityPrimaryKeyProperty]: NODE_A_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Alice',
        [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
        [NODE_NAME_VAR]: 'Alice Smith',
      },
    },
    {
      [entityPrimaryKeyProperty]: NODE_B_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Bob',
        [LAYOUT_VAR]: { x: 0.7, y: 0.7 },
        [NODE_NAME_VAR]: 'Bob Jones',
      },
    },
  ];
}

function makePreloadedEdges() {
  return [
    {
      [entityPrimaryKeyProperty]: EDGE_ID,
      type: EDGE_TYPE,
      from: NODE_A_ID,
      to: NODE_B_ID,
      [entityAttributesProperty]: {
        [EDGE_STRENGTH_VAR]: 'strong',
      },
    },
  ];
}

function makeStore(
  includeEdges = false,
  stageForStore: object = stage,
  codebookForStore: object = codebook,
  extraMiddleware: Middleware[] = [],
) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: makePreloadedNodes(),
          edges: includeEdges ? makePreloadedEdges() : [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook: codebookForStore,
        stages: [stageForStore],
      } as never,
    },
    middleware: (g) =>
      g({ serializableCheck: false }).concat(...extraMiddleware),
  });
}

function renderInterface(
  store: ReturnType<typeof makeStore>,
  stageForProps: object = stage,
) {
  const handlers = new Map<string, BeforeNextFunction>();
  const registerBeforeNext: RegisterBeforeNext = (
    keyOrFn: string | BeforeNextFunction | null,
    maybeFn?: BeforeNextFunction | null,
  ) => {
    const key = typeof keyOrFn === 'string' ? keyOrFn : '__default__';
    const fn = typeof keyOrFn === 'string' ? (maybeFn ?? null) : keyOrFn;
    if (fn === null) {
      handlers.delete(key);
    } else {
      handlers.set(key, fn);
    }
  };

  const props: StageProps<'NetworkComposer'> = {
    stage: stageForProps as StageProps<'NetworkComposer'>['stage'],
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
          <DialogProvider>
            <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
              <StageMetadataContext.Provider value={registerBeforeNext}>
                <TestProtocolLocalization>{children}</TestProtocolLocalization>
              </StageMetadataContext.Provider>
            </CurrentStepProvider>
          </DialogProvider>
        </ContractProvider>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });

  // What pressing Next asks of the stage: whether it may be left.
  const leave = async () => {
    for (const handler of handlers.values()) {
      if ((await handler('forwards', 'step')) === false) return false;
    }
    return true;
  };
  return { leave };
}

/**
 * Simulates a tap on a node element (mirrors edges.test.tsx helper).
 */
function tapNode(nodeEl: HTMLElement) {
  fireEvent.pointerDown(nodeEl, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  });
  fireEvent.pointerUp(nodeEl, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  });
  // A still release is a tap: the browser follows it with a click on the
  // node, which Node's gesture recognizer lets through.
  fireEvent.click(nodeEl, { detail: 1 });
}

describe('NetworkComposer inspector — node', () => {
  it('tapping a node in Select mode opens the inspector with the node form', async () => {
    const store = makeStore();
    renderInterface(store);

    // Default tool is 'select', so no tool switching needed.
    const nodeA = await screen.findByRole('button', { name: /alice/i });

    act(() => {
      tapNode(nodeA);
    });

    // Inspector should appear with the node form field prompt.
    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });
  });

  it('editing a node field in the inspector auto-saves the value', async () => {
    const store = makeStore();
    renderInterface(store);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    // Change the field; the drawer persists valid edits automatically (no Save).
    const nameInput = await screen.findByLabelText(/full name/i);
    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });

    await waitFor(
      () => {
        const nodes = store.getState().session.network.nodes;
        const updatedNode = nodes.find(
          (n) => n[entityPrimaryKeyProperty] === NODE_A_ID,
        );
        expect(updatedNode?.[entityAttributesProperty]?.[NODE_NAME_VAR]).toBe(
          'Alice Updated',
        );
      },
      { timeout: 2000 },
    );
  });

  it('restarts autosave after each edit to an opaque __proto__ field', async () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );
    const prototypeStage = {
      ...stage,
      nodeForm: {
        fields: [
          {
            variable: PROTOTYPE_VAR,
            component: 'Text',
            label: { en: 'Prototype value' },
          },
        ],
      },
    };
    const prototypeCodebook = {
      ...codebook,
      node: {
        ...codebook.node,
        [NODE_TYPE]: {
          ...codebook.node[NODE_TYPE],
          variables: {
            ...codebook.node[NODE_TYPE].variables,
            [PROTOTYPE_VAR]: {
              component: 'Text',
              name: 'Prototype value',
              label: 'Prototype value',
              type: 'text',
            },
          },
        },
      },
    };
    const store = makeStore(false, prototypeStage, prototypeCodebook);
    renderInterface(store, prototypeStage);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });
    const input = await screen.findByLabelText('Prototype value');

    fireEvent.change(input, { target: { value: 'first value' } });
    await waitFor(
      () => {
        const node = store
          .getState()
          .session.network.nodes.find(
            (candidate) => candidate[entityPrimaryKeyProperty] === NODE_A_ID,
          );
        expect(node?.[entityAttributesProperty]?.[PROTOTYPE_VAR]).toBe(
          'first value',
        );
      },
      { timeout: 2000 },
    );

    fireEvent.change(input, { target: { value: 'final value' } });
    await waitFor(
      () => {
        const node = store
          .getState()
          .session.network.nodes.find(
            (candidate) => candidate[entityPrimaryKeyProperty] === NODE_A_ID,
          );
        const attributes = node?.[entityAttributesProperty];
        expect(Object.hasOwn(attributes ?? {}, PROTOTYPE_VAR)).toBe(true);
        expect(attributes?.[PROTOTYPE_VAR]).toBe('final value');
        expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
        expect(
          Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
        ).toEqual(prototypeDescriptor);
      },
      { timeout: 2000 },
    );
  });

  it('clicking Delete in the inspector removes the node', async () => {
    const store = makeStore();
    renderInterface(store);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      const nodes = store.getState().session.network.nodes;
      expect(
        nodes.find((n) => n[entityPrimaryKeyProperty] === NODE_A_ID),
      ).toBeUndefined();
    });
  });
});

describe('NetworkComposer inspector — undo and redo with the drawer open', () => {
  const storedName = (store: ReturnType<typeof makeStore>) =>
    store
      .getState()
      .session.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === NODE_A_ID,
      )?.[entityAttributesProperty]?.[NODE_NAME_VAR];

  async function editAndSave(store: ReturnType<typeof makeStore>) {
    renderInterface(store);
    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });
    const nameInput = await screen.findByLabelText(/full name/i);
    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });
    await waitFor(() => expect(storedName(store)).toBe('Alice Updated'), {
      timeout: 2000,
    });
    return nameInput;
  }

  const pressUndo = (redo = false) =>
    act(async () => {
      fireEvent.keyDown(screen.getByTestId('network-composer'), {
        key: 'z',
        metaKey: true,
        shiftKey: redo,
      });
    });

  it('shows the answer an undo restores, and keeps it when the drawer closes', async () => {
    const store = makeStore();
    const nameInput = await editAndSave(store);

    await pressUndo();
    await waitFor(() => expect(storedName(store)).toBe('Alice Smith'));
    await waitFor(() => expect(nameInput).toHaveValue('Alice Smith'));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('inspector-panel')).toBeNull(),
    );
    expect(storedName(store)).toBe('Alice Smith');
  });

  it('keeps the edit available to redo once the drawer has caught up with the undo', async () => {
    const store = makeStore();
    const nameInput = await editAndSave(store);

    await pressUndo();
    await waitFor(() => expect(nameInput).toHaveValue('Alice Smith'));
    // Longer than the drawer waits before saving an edit.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));

    await pressUndo(true);
    await waitFor(() => expect(storedName(store)).toBe('Alice Updated'));
    await waitFor(() => expect(nameInput).toHaveValue('Alice Updated'));
  });
});

describe('NetworkComposer inspector — undo and redo changing what the drawer shows', () => {
  const NICKNAME_VAR = 'var-nickname';
  const GROUP_VAR = 'var-group';

  const twoQuestionStage = {
    ...stage,
    nodeForm: {
      fields: [
        ...nodeForm.fields,
        { variable: NICKNAME_VAR, prompt: { en: 'Nickname' } },
      ],
    },
  };
  const groupStage = {
    ...twoQuestionStage,
    convexHullVariable: GROUP_VAR,
    nodeForm: {
      fields: [
        ...twoQuestionStage.nodeForm.fields,
        { variable: GROUP_VAR, prompt: { en: 'Team' } },
      ],
    },
  };
  const personType = codebook.node[NODE_TYPE];
  const twoQuestionCodebook = {
    ...codebook,
    node: {
      [NODE_TYPE]: {
        ...personType,
        variables: {
          ...personType.variables,
          [NICKNAME_VAR]: {
            name: 'Nickname',
            label: 'Nickname',
            type: 'text' as const,
            component: 'Text' as const,
          },
          [GROUP_VAR]: {
            name: 'Team',
            label: 'Team',
            type: 'categorical' as const,
            component: 'CheckboxGroup' as const,
            options: [
              { value: 'red', label: { en: 'Team Red' } },
              { value: 'blue', label: { en: 'Team Blue' } },
            ],
          },
        },
      },
    },
  };

  const stored = (store: ReturnType<typeof makeStore>, variable: string) =>
    store
      .getState()
      .session.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === NODE_A_ID,
      )?.[entityAttributesProperty]?.[variable];

  async function openAlice(stageForTest: object = twoQuestionStage) {
    const store = makeStore(false, stageForTest, twoQuestionCodebook);
    renderInterface(store, stageForTest);
    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });
    return {
      store,
      fullName: await screen.findByLabelText(/full name/i),
      nickname: await screen.findByLabelText(/nickname/i),
    };
  }

  const press = (key: 'undo' | 'redo') =>
    act(async () => {
      fireEvent.keyDown(screen.getByTestId('network-composer'), {
        key: 'z',
        metaKey: true,
        shiftKey: key === 'redo',
      });
    });

  // Longer than the drawer waits before saving an edit, so any save it
  // would make has been made.
  const autosaveWindow = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 600)));

  // Saves an edit to the full name, then changes it again and presses undo
  // before the drawer has saved the second edit. The undo puts back the
  // answer from before the first edit.
  async function overtakeEdit() {
    const opened = await openAlice();
    const { store, fullName } = opened;
    fireEvent.change(fullName, { target: { value: 'Alice Updated' } });
    await waitFor(
      () => expect(stored(store, NODE_NAME_VAR)).toBe('Alice Updated'),
      { timeout: 2000 },
    );
    fireEvent.change(fullName, { target: { value: 'Alice Draft' } });
    await press('undo');
    await waitFor(() =>
      expect(stored(store, NODE_NAME_VAR)).toBe('Alice Smith'),
    );
    return opened;
  }

  it('keeps an answer an undo put back when another question is then changed', async () => {
    const { store, fullName, nickname } = await openAlice();
    fireEvent.change(fullName, { target: { value: 'Alice Updated' } });
    await waitFor(
      () => expect(stored(store, NODE_NAME_VAR)).toBe('Alice Updated'),
      { timeout: 2000 },
    );

    await press('undo');
    await waitFor(() => expect(fullName).toHaveValue('Alice Smith'));
    fireEvent.change(nickname, { target: { value: 'Al' } });
    await waitFor(() => expect(stored(store, NICKNAME_VAR)).toBe('Al'), {
      timeout: 2000,
    });

    await autosaveWindow();
    expect(stored(store, NODE_NAME_VAR)).toBe('Alice Smith');
    expect(fullName).toHaveValue('Alice Smith');
  });

  it('shows a group membership an undo removed, and does not save it back', async () => {
    const store = makeStore(false, groupStage, twoQuestionCodebook);
    renderInterface(store, groupStage);
    fireEvent.click(screen.getByRole('button', { name: /groups/i }));
    fireEvent.click(await screen.findByRole('button', { name: /team red/i }));
    act(() => {
      tapNode(screen.getByRole('button', { name: /alice/i }));
    });
    await waitFor(() => expect(stored(store, GROUP_VAR)).toEqual(['red']));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^select$/i }));
    });
    act(() => {
      tapNode(screen.getByRole('button', { name: /alice/i }));
    });
    const teamRed = await screen.findByRole('checkbox', { name: /team red/i });
    expect(teamRed).toBeChecked();

    await press('undo');
    await waitFor(() => expect(stored(store, GROUP_VAR)).toBeUndefined());
    await waitFor(() => expect(teamRed).not.toBeChecked());

    fireEvent.change(screen.getByLabelText(/nickname/i), {
      target: { value: 'Al' },
    });
    await waitFor(() => expect(stored(store, NICKNAME_VAR)).toBe('Al'), {
      timeout: 2000,
    });
    expect(stored(store, GROUP_VAR)).toBeUndefined();
  });

  it('keeps an unsaved edit an undo overtook on screen, without saving it over the undo', async () => {
    const { store, fullName } = await overtakeEdit();

    await autosaveWindow();
    expect(fullName).toHaveValue('Alice Draft');
    expect(stored(store, NODE_NAME_VAR)).toBe('Alice Smith');
  });

  it('saves the other questions without saving an edit an undo overtook', async () => {
    const { store, fullName, nickname } = await overtakeEdit();

    fireEvent.change(nickname, { target: { value: 'Al' } });
    await waitFor(() => expect(stored(store, NICKNAME_VAR)).toBe('Al'), {
      timeout: 2000,
    });
    await autosaveWindow();
    expect(stored(store, NODE_NAME_VAR)).toBe('Alice Smith');
    expect(fullName).toHaveValue('Alice Draft');
  });

  it('saves an edit an undo overtook once the participant changes that question again', async () => {
    const { store, fullName } = await overtakeEdit();
    await autosaveWindow();

    fireEvent.change(fullName, { target: { value: 'Alice Draft Again' } });
    await waitFor(
      () => expect(stored(store, NODE_NAME_VAR)).toBe('Alice Draft Again'),
      { timeout: 2000 },
    );
  });

  it('saves an edit an undo overtook once a redo puts back the answer it was made from', async () => {
    const { store, fullName } = await overtakeEdit();
    await autosaveWindow();

    await press('redo');
    await waitFor(
      () => expect(stored(store, NODE_NAME_VAR)).toBe('Alice Draft'),
      { timeout: 2000 },
    );
    expect(fullName).toHaveValue('Alice Draft');
  });

  it('asks before closing the drawer on an edit an undo overtook, and keeps it when the participant keeps their changes', async () => {
    const { store, fullName } = await overtakeEdit();
    await autosaveWindow();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(
      await screen.findByText(/undo or redo changed an answer/i),
    ).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    await waitFor(() =>
      expect(screen.queryByText(/undo or redo changed an answer/i)).toBeNull(),
    );
    expect(fullName).toHaveValue('Alice Draft');
    expect(screen.getByTestId('inspector-panel')).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    const discard = await screen.findByRole('button', {
      name: 'Discard changes',
    });
    act(() => {
      fireEvent.click(discard);
    });
    await waitFor(() =>
      expect(screen.queryByTestId('inspector-panel')).toBeNull(),
    );
    expect(stored(store, NODE_NAME_VAR)).toBe('Alice Smith');
  });

  it('undoes every question changed in one undo step', async () => {
    const { store, fullName, nickname } = await openAlice();
    fireEvent.change(fullName, { target: { value: 'Alice Updated' } });
    await waitFor(
      () => expect(stored(store, NODE_NAME_VAR)).toBe('Alice Updated'),
      { timeout: 2000 },
    );
    fireEvent.change(nickname, { target: { value: 'Al' } });
    await waitFor(() => expect(stored(store, NICKNAME_VAR)).toBe('Al'), {
      timeout: 2000,
    });

    await press('undo');
    await waitFor(() =>
      expect(stored(store, NODE_NAME_VAR)).toBe('Alice Smith'),
    );
    await autosaveWindow();
    expect(stored(store, NICKNAME_VAR)).toBeUndefined();
    expect(nickname).toHaveValue('');

    await press('redo');
    await waitFor(() => expect(stored(store, NICKNAME_VAR)).toBe('Al'));
    expect(stored(store, NODE_NAME_VAR)).toBe('Alice Updated');
  });

  it('builds what it saves from the answers shown when the save is made', async () => {
    const store = makeStore(false, twoQuestionStage, twoQuestionCodebook);
    const builds: (() => AttributePatch | null)[] = [];
    const inspector = (attributes: Record<string, string>) => (
      <Provider store={store}>
        <TestProtocolLocalization>
          <ContractProvider
            onFinish={vi.fn()}
            onRequestAsset={vi.fn()}
            flags={{ isE2E: false, isDevelopment: false }}
          >
            <DialogProvider>
              <CurrentStepProvider
                currentStep={0}
                onStepChange={() => undefined}
              >
                <StageMetadataContext.Provider value={vi.fn()}>
                  <Inspector
                    entityId={NODE_A_ID}
                    overtakenEditNotice={OVERTAKEN_EDIT_NOTICE}
                    // The fixture's loose stage shape, as the interface is given.
                    form={
                      twoQuestionStage.nodeForm as unknown as InspectorProps['form']
                    }
                    subject={{ entity: 'node', type: NODE_TYPE }}
                    attributes={attributes}
                    // The save is asked for, but made only when the test says.
                    onSave={async (_id, build) => {
                      builds.push(build);
                    }}
                    onDelete={vi.fn()}
                    guardDraft={() => () => undefined}
                  />
                </StageMetadataContext.Provider>
              </CurrentStepProvider>
            </DialogProvider>
          </ContractProvider>
        </TestProtocolLocalization>
      </Provider>
    );
    const { rerender } = render(inspector({ [NODE_NAME_VAR]: 'Alice Smith' }));

    fireEvent.change(await screen.findByLabelText(/nickname/i), {
      target: { value: 'Al' },
    });
    await waitFor(() => expect(builds).toHaveLength(1), { timeout: 2000 });

    // An undo changes the full name, which the participant has not touched,
    // after the save was asked for and before it is made.
    rerender(inspector({ [NODE_NAME_VAR]: 'Alice Undone' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Alice Undone'),
    );

    expect(builds[0]?.()).toEqual({ set: { [NICKNAME_VAR]: 'Al' }, unset: [] });
  });

  it('keeps an unsaved edit of a relationship an undo overtook, without saving it over the undo', async () => {
    const store = makeStore(true);
    renderInterface(store);
    const storedStrength = () =>
      store
        .getState()
        .session.network.edges.find(
          (e) => e[entityPrimaryKeyProperty] === EDGE_ID,
        )?.[entityAttributesProperty]?.[EDGE_STRENGTH_VAR];

    await clickEdge(EDGE_ID);
    const strength = await screen.findByLabelText(/strength/i);
    fireEvent.change(strength, { target: { value: 'weak' } });
    await waitFor(() => expect(storedStrength()).toBe('weak'), {
      timeout: 2000,
    });
    fireEvent.change(strength, { target: { value: 'medium' } });
    await press('undo');
    await waitFor(() => expect(storedStrength()).toBe('strong'));

    await autosaveWindow();
    expect(strength).toHaveValue('medium');
    expect(storedStrength()).toBe('strong');
  });
});

async function clickEdge(edgeId: string) {
  const edgeLine = await waitFor(() => {
    const el = document.querySelector(`line[data-edge-id="${edgeId}"]`);
    expect(el).not.toBeNull();
    return el as Element;
  });
  act(() => {
    fireEvent.click(edgeLine);
  });
}

describe('NetworkComposer inspector — edge', () => {
  it('clicking an edge in Select mode opens the inspector with the edge form', async () => {
    const store = makeStore(true);
    renderInterface(store);

    await clickEdge(EDGE_ID);

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });
  });

  it('editing an edge field in the inspector auto-saves the value', async () => {
    const store = makeStore(true);
    renderInterface(store);

    await clickEdge(EDGE_ID);

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    const strengthInput = await screen.findByLabelText(/strength/i);
    fireEvent.change(strengthInput, { target: { value: 'weak' } });

    await waitFor(
      () => {
        const edges = store.getState().session.network.edges;
        const edge = edges.find((e) => e[entityPrimaryKeyProperty] === EDGE_ID);
        expect(edge?.[entityAttributesProperty]?.[EDGE_STRENGTH_VAR]).toBe(
          'weak',
        );
      },
      { timeout: 2000 },
    );
  });

  it('clicking Delete in the inspector removes the edge', async () => {
    const store = makeStore(true);
    renderInterface(store);

    await clickEdge(EDGE_ID);

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      expect(
        edges.find((e) => e[entityPrimaryKeyProperty] === EDGE_ID),
      ).toBeUndefined();
    });
  });
});

describe('NetworkComposer inspector — leaving an edit', () => {
  const storedName = (store: ReturnType<typeof makeStore>, nodeId: string) =>
    store
      .getState()
      .session.network.nodes.find(
        (n) => n[entityPrimaryKeyProperty] === nodeId,
      )?.[entityAttributesProperty]?.[NODE_NAME_VAR];

  const requiredNameCodebook = {
    ...codebook,
    node: {
      [NODE_TYPE]: {
        ...codebook.node[NODE_TYPE],
        variables: {
          ...codebook.node[NODE_TYPE].variables,
          [NODE_NAME_VAR]: {
            ...codebook.node[NODE_TYPE].variables[NODE_NAME_VAR],
            validation: { required: true },
          },
        },
      },
    },
  };

  async function openAlice(store: ReturnType<typeof makeStore>) {
    const { leave } = renderInterface(store);
    act(() => {
      tapNode(screen.getByRole('button', { name: /alice/i }));
    });
    const nameInput = await screen.findByLabelText(/full name/i);
    await waitFor(() => expect(nameInput).toHaveValue('Alice Smith'));
    return { leave, nameInput };
  }

  it('leaves the stage without asking or saving when nothing was changed', async () => {
    const store = makeStore();
    const before = store.getState().session.network;
    const { leave } = await openAlice(store);

    await expect(leave()).resolves.toBe(true);
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).toBeNull();
    expect(store.getState().session.network).toBe(before);
  });

  it('saves an edit made too recently for the autosave when the stage is left', async () => {
    const store = makeStore();
    const { leave, nameInput } = await openAlice(store);

    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });
    let left: Promise<boolean> | undefined;
    act(() => {
      left = leave();
    });

    await expect(left).resolves.toBe(true);
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).toBeNull();
    expect(storedName(store, NODE_A_ID)).toBe('Alice Updated');
  });

  it('asks before leaving the stage with an invalid edit, and stays when it is kept', async () => {
    const store = makeStore(false, stage, requiredNameCodebook);
    const before = store.getState().session.network;
    const { leave, nameInput } = await openAlice(store);

    fireEvent.change(nameInput, { target: { value: '' } });
    let left: Promise<boolean> | undefined;
    act(() => {
      left = leave();
    });

    const warning = await screen.findByRole('dialog', {
      name: 'Discard changes?',
    });
    expect(warning).toHaveTextContent(/invalid data/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(left).resolves.toBe(false);
    expect(nameInput).toHaveValue('');
    expect(store.getState().session.network).toBe(before);
  });

  const discardDialog = { name: 'Discard changes?' };

  const moves: [string, () => void][] = [
    [
      'tapping another person',
      () => tapNode(screen.getByRole('button', { name: /bob/i })),
    ],
    [
      'tapping the background',
      () => {
        const canvas = screen.getByRole('application');
        const at = { button: 0, clientX: 5, clientY: 5, pointerId: 1 };
        fireEvent.pointerDown(canvas, at);
        fireEvent.pointerUp(canvas, at);
      },
    ],
    [
      'closing the drawer',
      () => fireEvent.click(screen.getByRole('button', { name: 'Close' })),
    ],
    [
      'choosing another tool',
      () => fireEvent.click(screen.getByRole('button', { name: /add node/i })),
    ],
  ];

  it.each(moves)(
    'saves an edit made too recently for the autosave before %s',
    async (_, move) => {
      const store = makeStore();
      const { nameInput } = await openAlice(store);

      fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });
      act(move);

      await waitFor(() =>
        expect(storedName(store, NODE_A_ID)).toBe('Alice Updated'),
      );
      await waitFor(() =>
        expect(screen.queryByDisplayValue('Alice Updated')).toBeNull(),
      );
      expect(screen.queryByRole('dialog', discardDialog)).toBeNull();
    },
  );

  it.each(moves)(
    'asks before %s away from an invalid edit, and stays when it is kept',
    async (_, move) => {
      const store = makeStore(false, stage, requiredNameCodebook);
      const before = store.getState().session.network;
      const { nameInput } = await openAlice(store);

      fireEvent.change(nameInput, { target: { value: '' } });
      act(move);

      expect(
        await screen.findByRole('dialog', discardDialog),
      ).toHaveTextContent(/invalid data/);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog', discardDialog)).toBeNull(),
      );
      expect(screen.getAllByRole('textbox')).toEqual([
        screen.getByLabelText(/full name/i),
      ]);
      expect(screen.getByLabelText(/full name/i)).toHaveValue('');
      expect(store.getState().session.network).toBe(before);
    },
  );

  it('moves on once the participant agrees to discard an invalid edit', async () => {
    const store = makeStore(false, stage, requiredNameCodebook);
    const before = store.getState().session.network;
    const { nameInput } = await openAlice(store);

    fireEvent.change(nameInput, { target: { value: '' } });
    act(() => {
      tapNode(screen.getByRole('button', { name: /bob/i }));
    });
    await screen.findByRole('dialog', discardDialog);
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(await screen.findByDisplayValue('Bob Jones')).toBeTruthy();
    expect(store.getState().session.network).toBe(before);
  });

  const deletes: [string, () => void][] = [
    [
      'from the drawer',
      () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })),
    ],
    [
      'with the Delete key',
      () =>
        fireEvent.keyDown(screen.getByTestId('network-composer'), {
          key: 'Delete',
        }),
    ],
  ];

  it.each(deletes)(
    'deletes the person %s without asking about an invalid edit',
    async (_, remove) => {
      const store = makeStore(false, stage, requiredNameCodebook);
      const { nameInput } = await openAlice(store);

      fireEvent.change(nameInput, { target: { value: '' } });
      act(remove);

      await waitFor(() =>
        expect(store.getState().session.network.nodes).toHaveLength(1),
      );
      act(() => {
        tapNode(screen.getByRole('button', { name: /bob/i }));
      });
      expect(await screen.findByDisplayValue('Bob Jones')).toBeTruthy();
      expect(screen.queryByRole('dialog', discardDialog)).toBeNull();
    },
  );

  it('asks before moving off an edit the store refused, and saves it once the store takes it', async () => {
    const refusing = { on: true };
    const refuseNodeUpdates: Middleware = () => (next) => (action) => {
      if (refusing.on && updateNode.fulfilled.match(action)) {
        throw new Error('Refused');
      }
      return next(action);
    };
    const store = makeStore(false, stage, codebook, [refuseNodeUpdates]);
    const { nameInput } = await openAlice(store);

    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });
    expect(
      await screen.findByText(
        'An error occurred while submitting the form.',
        {},
        { timeout: 2000 },
      ),
    ).toBeTruthy();

    act(() => {
      tapNode(screen.getByRole('button', { name: /bob/i }));
    });
    expect(await screen.findByRole('dialog', discardDialog)).toHaveTextContent(
      'An error occurred while submitting the form.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', discardDialog)).toBeNull(),
    );
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Alice Updated');
    expect(storedName(store, NODE_A_ID)).toBe('Alice Smith');

    refusing.on = false;
    act(() => {
      tapNode(screen.getByRole('button', { name: /bob/i }));
    });
    expect(await screen.findByDisplayValue('Bob Jones')).toBeTruthy();
    expect(storedName(store, NODE_A_ID)).toBe('Alice Updated');
  });

  it('keeps the answer an undo puts back when the drawer then closes', async () => {
    const store = makeStore();
    const { nameInput } = await openAlice(store);

    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });
    await waitFor(
      () => expect(storedName(store, NODE_A_ID)).toBe('Alice Updated'),
      { timeout: 2000 },
    );
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('network-composer'), {
        key: 'z',
        metaKey: true,
      });
    });
    await waitFor(() =>
      expect(storedName(store, NODE_A_ID)).toBe('Alice Smith'),
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('inspector-panel')).toBeNull(),
    );
    expect(storedName(store, NODE_A_ID)).toBe('Alice Smith');
  });
});

describe('NetworkComposer inspector — no attributes', () => {
  it('opens the drawer with only its Delete action when the node has no form', async () => {
    const stageNoForm = { ...stage, nodeForm: undefined };
    const store = makeStore(false, stageNoForm);
    renderInterface(store, stageNoForm);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeTruthy();
    // A node with a form would render its field; here there is none, and no
    // sentence stands in for it.
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
    expect(screen.queryByText(/no attributes to edit/i)).toBeNull();
  });
});
