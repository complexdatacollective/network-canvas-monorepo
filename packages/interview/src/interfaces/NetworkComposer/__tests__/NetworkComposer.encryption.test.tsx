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
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import { setPassphrase, setPassphraseInvalid } from '../../../store/modules/ui';
import { interviewToastManager } from '../../../toast/interviewToastManager';
import type { BeforeNextFunction, StageProps } from '../../../types';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../Anonymisation/decryptionScope';
import {
  decryptData,
  generateSecureAttributes,
} from '../../Anonymisation/utils';
import NetworkComposer from '../NetworkComposer';

// Records when a list holding encrypted values has been decrypted, so a test
// can wait for stored values to be readable before relying on them.
const decryption = vi.hoisted(() => ({ ready: false }));
vi.mock('../../Anonymisation/useDecryptedNodes', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../Anonymisation/useDecryptedNodes')
    >();
  return {
    ...actual,
    useDecryptedNodes: (
      ...args: Parameters<typeof actual.useDecryptedNodes>
    ) => {
      const result = actual.useDecryptedNodes(...args);
      if (result.status === 'ready' && result.nodes !== args[0]) {
        decryption.ready = true;
      }
      return result;
    },
  };
});

// Holds every decryption while `held` is set, so a test can act while stored
// values are still being decrypted.
const decryptionGate = vi.hoisted(() => {
  const gate: { held?: Promise<void> } = {};
  return gate;
});
vi.mock('../../Anonymisation/utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../Anonymisation/utils')>();
  return {
    ...actual,
    decryptData: async (...args: Parameters<typeof actual.decryptData>) => {
      await decryptionGate.held;
      return actual.decryptData(...args);
    },
  };
});

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // The drawer's form errors animate into view.
  if (typeof window.IntersectionObserver === 'undefined') {
    vi.stubGlobal(
      'IntersectionObserver',
      class IntersectionObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
});

const NODE_TYPE = 'person';
const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';
const NOTES_VAR = 'var-notes';
const AGE_VAR = 'var-age';
const NODE_ID = 'node-a';
const PASSPHRASE = 'composer passphrase';

const encryptedText = (name: string): Variable => ({
  name,
  type: 'text',
  component: 'Text',
  encrypted: true,
});

const variables: Record<string, Variable> = {
  [QUICK_ADD_VAR]: encryptedText('name'),
  [LAYOUT_VAR]: { name: 'position', type: 'layout' },
  [NOTES_VAR]: encryptedText('notes'),
};

const uniqueNameVariables: Record<string, Variable> = {
  ...variables,
  [QUICK_ADD_VAR]: {
    name: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
    validation: { unique: true },
  },
};

const stage: StageProps<'NetworkComposer'>['stage'] = {
  id: 'nc1',
  type: 'NetworkComposer',
  label: 'Network Composer',
  subject: { entity: 'node', type: NODE_TYPE },
  layoutVariable: asEntityAttributeReference(LAYOUT_VAR),
  quickAdd: asEntityAttributeReference(QUICK_ADD_VAR),
  nodeForm: {
    fields: [
      {
        variable: asEntityAttributeReference(NOTES_VAR),
        component: 'Text',
        label: 'Notes',
      },
    ],
  },
  background: { concentricCircles: 4, skewedTowardCenter: true },
};

const ageVariables: Record<string, Variable> = {
  ...variables,
  [AGE_VAR]: { name: 'age', type: 'number', component: 'Number' },
};

const notesAndAgeStage: StageProps<'NetworkComposer'>['stage'] = {
  ...stage,
  nodeForm: {
    fields: [
      ...(stage.nodeForm?.fields ?? []),
      {
        variable: asEntityAttributeReference(AGE_VAR),
        component: 'Number',
        label: 'Age',
      },
    ],
  },
};

async function makeEncryptedNode({
  id = NODE_ID,
  name = 'Alice',
  notes = 'Met at work',
  position = { x: 0.3, y: 0.3 },
} = {}): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      {
        [QUICK_ADD_VAR]: name,
        [NOTES_VAR]: notes,
        [LAYOUT_VAR]: position,
      },
      variables,
      PASSPHRASE,
    );
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

function makeStore(
  nodes: NcNode[],
  withPassphrase: boolean,
  encryptionEnabled = true,
  nodeVariables = variables,
  composerStage = stage,
) {
  const store = createEncryptionStore(nodes, [composerStage], nodeVariables, {
    encryptionEnabled,
  });
  if (withPassphrase) store.dispatch(setPassphrase(PASSPHRASE));
  return store;
}

function renderComposer(
  store: ReturnType<typeof makeStore>,
  composerStage = stage,
) {
  const beforeNext = new Map<string, BeforeNextFunction>();
  function registerBeforeNext(fn: BeforeNextFunction | null): void;
  function registerBeforeNext(key: string, fn: BeforeNextFunction | null): void;
  function registerBeforeNext(
    keyOrFn: string | BeforeNextFunction | null,
    maybeFn?: BeforeNextFunction | null,
  ) {
    const key = typeof keyOrFn === 'string' ? keyOrFn : 'stage';
    const fn = typeof keyOrFn === 'string' ? maybeFn : keyOrFn;
    if (fn) beforeNext.set(key, fn);
    else beforeNext.delete(key);
  }
  const props: StageProps<'NetworkComposer'> = {
    stage: composerStage,
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
                {children}
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
    for (const handler of beforeNext.values()) {
      if ((await handler('forwards', 'step')) === false) return false;
    }
    return true;
  };
  return { leave };
}

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
  fireEvent.click(nodeEl, { detail: 1 });
}

async function readStored(node: NcNode | undefined, variable: string) {
  if (!node) throw new Error('Expected the node to exist');
  const value = node[entityAttributesProperty][variable];
  const secure = node[entitySecureAttributesMeta]?.[variable];
  if (!isNumberArray(value)) throw new Error('Expected a stored ciphertext');
  if (!secure) throw new Error('Expected secure-attribute metadata');
  return decryptData({ secureAttributes: secure, data: value }, PASSPHRASE);
}

const passphraseNotice = /enter your passphrase to see and change/i;

describe('NetworkComposer with encrypted variables', () => {
  it('asks for the passphrase and holds the add-node field until one is entered', async () => {
    const store = makeStore([], false);
    renderComposer(store);

    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull();
    expect(store.getState().session.network.nodes).toHaveLength(0);
  });

  it('holds the add-node field while the passphrase is not working', async () => {
    const store = makeStore([], true);
    store.dispatch(setPassphraseInvalid(true));
    renderComposer(store);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull();
  });

  it('stores a name added from the palette as ciphertext with its metadata', async () => {
    const store = makeStore([], true);
    renderComposer(store);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    const input = await screen.findByRole('textbox', { name: /name/i });
    act(() => {
      fireEvent.change(input, { target: { value: 'Alice' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [node] = store.getState().session.network.nodes;
    expect(node?.[entityAttributesProperty][QUICK_ADD_VAR]).not.toBe('Alice');
    expect(await readStored(node, QUICK_ADD_VAR)).toBe('Alice');
  });

  it('shows decrypted values in the drawer and saves edits encrypted', async () => {
    const store = makeStore([await makeEncryptedNode()], true);
    renderComposer(store);

    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });

    const notesInput = await screen.findByLabelText(/notes/i);
    expect(notesInput).toHaveProperty('value', 'Met at work');
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeTruthy();

    fireEvent.change(notesInput, { target: { value: 'Old friend' } });

    await waitFor(
      async () => {
        const [node] = store.getState().session.network.nodes;
        expect(await readStored(node, NOTES_VAR)).toBe('Old friend');
      },
      { timeout: 3000 },
    );
    expect(
      await readStored(
        store.getState().session.network.nodes[0],
        QUICK_ADD_VAR,
      ),
    ).toBe('Alice');
  });

  it('keeps encrypted values out of the drawer until the passphrase is entered', async () => {
    const store = makeStore([await makeEncryptedNode()], false);
    renderComposer(store);

    const nodeButton = await screen.findByRole('button', { name: /🔒/ });
    act(() => {
      tapNode(nodeButton);
    });

    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByLabelText(/notes/i)).toBeNull();
    expect(screen.queryByDisplayValue(/\d+,\d+,\d+/)).toBeNull();

    act(() => {
      store.dispatch(setPassphrase(PASSPHRASE));
    });

    const notesInput = await screen.findByLabelText(/notes/i);
    expect(notesInput).toHaveProperty('value', 'Met at work');
  });
});

/** The encrypted person, aged 40, with the given encryption metadata. */
async function makeAgedNode(
  keepMetadata: (variable: string) => boolean = () => true,
): Promise<NcNode> {
  const encrypted = await makeEncryptedNode();
  return {
    ...encrypted,
    [entityAttributesProperty]: {
      ...encrypted[entityAttributesProperty],
      [AGE_VAR]: 40,
    },
    [entitySecureAttributesMeta]: Object.fromEntries(
      Object.entries(encrypted[entitySecureAttributesMeta] ?? {}).filter(
        ([variable]) => keepMetadata(variable),
      ),
    ),
  };
}

function openAgedNodeDrawer(node: NcNode) {
  const store = makeStore([node], true, true, ageVariables, notesAndAgeStage);
  renderComposer(store, notesAndAgeStage);
  return store;
}

describe('NetworkComposer saving an edit in the drawer', () => {
  it('removes an answer the participant clears', async () => {
    const store = openAgedNodeDrawer(await makeAgedNode());

    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });
    const ageInput = await screen.findByLabelText(/age/i);
    expect(ageInput).toHaveProperty('value', '40');
    fireEvent.change(ageInput, { target: { value: '' } });

    await waitFor(
      () => {
        const [node] = store.getState().session.network.nodes;
        expect(node?.[entityAttributesProperty]).not.toHaveProperty(AGE_VAR);
      },
      { timeout: 3000 },
    );
  });

  it('keeps an answer the drawer cannot show when another answer is changed', async () => {
    // The notes are left without the metadata that decrypts them.
    const stored = await makeAgedNode((variable) => variable !== NOTES_VAR);
    const store = openAgedNodeDrawer(stored);

    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });
    const ageInput = await screen.findByLabelText(/age/i);
    expect(screen.getByLabelText(/notes/i)).toHaveProperty('value', '');
    fireEvent.change(ageInput, { target: { value: '41' } });

    await waitFor(
      () => {
        const [node] = store.getState().session.network.nodes;
        expect(node?.[entityAttributesProperty][AGE_VAR]).toBe(41);
      },
      { timeout: 3000 },
    );
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty][NOTES_VAR]).toEqual(
      stored[entityAttributesProperty][NOTES_VAR],
    );
  });
});

describe('NetworkComposer refusing to save without a working passphrase', () => {
  const notSaved = 'Your answers have not been saved.';

  it('keeps a name being typed when the passphrase stops working, and says why it was not added', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const store = makeStore([], true);
    renderComposer(store);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    const input = await screen.findByRole('textbox', { name: /name/i });
    fireEvent.change(input, { target: { value: 'Alice' } });
    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    expect(screen.getByRole('textbox', { name: /name/i })).toBe(input);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining(notSaved),
        }),
      ),
    );
    expect(input).toHaveValue('Alice');
    expect(store.getState().session.network.nodes).toHaveLength(0);
  });

  it('keeps an edit in the drawer it could not save, and says why', async () => {
    const stored = await makeEncryptedNode();
    const store = makeStore([stored], true);
    renderComposer(store);

    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });
    const notesInput = await screen.findByLabelText(/notes/i);
    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    fireEvent.change(notesInput, { target: { value: 'Old friend' } });

    expect(
      await screen.findByText(new RegExp(notSaved), {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(notesInput).toHaveValue('Old friend');
    expect(store.getState().session.network.nodes[0]).toBe(stored);
  });

  it('keeps an edit it could not save through a passphrase that cannot read it, then saves it once the right one is back', async () => {
    const stored = await makeEncryptedNode();
    const store = makeStore([stored], true);
    renderComposer(store);

    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });
    const notesInput = await screen.findByLabelText(/notes/i);
    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    fireEvent.change(notesInput, { target: { value: 'Old friend' } });
    expect(
      await screen.findByText(new RegExp(notSaved), {}, { timeout: 3000 }),
    ).toBeTruthy();

    // While the new passphrase is still being tried, the store would take a
    // write encrypted with it, so the drawer must not make one.
    let release: () => void = () => undefined;
    decryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });
    try {
      act(() => {
        store.dispatch(setPassphrase('another passphrase'));
      });
      await waitFor(() =>
        expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull(),
      );
      // Longer than the drawer waits before saving an edit.
      await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
      expect(store.getState().session.network.nodes[0]).toBe(stored);
    } finally {
      release();
      decryptionGate.held = undefined;
    }
    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(store.getState().session.network.nodes[0]).toBe(stored);

    act(() => {
      store.dispatch(setPassphrase(PASSPHRASE));
    });
    expect(await screen.findByRole('textbox', { name: /notes/i })).toHaveValue(
      'Old friend',
    );
    await waitFor(
      async () => {
        const [node] = store.getState().session.network.nodes;
        expect(await readStored(node, NOTES_VAR)).toBe('Old friend');
      },
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(screen.queryByText(new RegExp(notSaved))).toBeNull(),
    );
  });
});

describe('NetworkComposer leaving the stage with the drawer open', () => {
  const notSaved = /Your answers have not been saved/;

  async function openDrawer(store: ReturnType<typeof makeStore>) {
    const { leave } = renderComposer(store);
    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });
    const notesInput = await screen.findByLabelText(/notes/i);
    await waitFor(() => expect(notesInput).toHaveValue('Met at work'));
    return { leave, notesInput };
  }

  it('leaves without asking or saving when nothing was changed', async () => {
    const stored = await makeEncryptedNode();
    const store = makeStore([stored], true);
    const { leave } = await openDrawer(store);

    await expect(leave()).resolves.toBe(true);
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).toBeNull();
    expect(store.getState().session.network.nodes[0]).toBe(stored);
  });

  it('saves an edit made too recently to have been saved yet', async () => {
    const store = makeStore([await makeEncryptedNode()], true);
    const { leave, notesInput } = await openDrawer(store);

    fireEvent.change(notesInput, { target: { value: 'Old friend' } });
    let left: Promise<boolean> | undefined;
    act(() => {
      left = leave();
    });

    await expect(left).resolves.toBe(true);
    expect(
      screen.queryByRole('dialog', { name: 'Discard changes?' }),
    ).toBeNull();
    expect(
      await readStored(store.getState().session.network.nodes[0], NOTES_VAR),
    ).toBe('Old friend');
  });

  it('asks before leaving an edit it could not save, and stays when the participant keeps it', async () => {
    const stored = await makeEncryptedNode();
    const store = makeStore([stored], true);
    const { leave, notesInput } = await openDrawer(store);

    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    fireEvent.change(notesInput, { target: { value: 'Old friend' } });
    let left: Promise<boolean> | undefined;
    act(() => {
      left = leave();
    });

    const warning = await screen.findByRole('dialog', {
      name: 'Discard changes?',
    });
    expect(warning).toHaveTextContent(notSaved);
    fireEvent.click(screen.getByRole('button', { name: 'Keep changes' }));

    await expect(left).resolves.toBe(false);
    expect(notesInput).toHaveValue('Old friend');
    expect(store.getState().session.network.nodes[0]).toBe(stored);
  });

  it('asks before leaving an edit hidden while another passphrase is tried', async () => {
    const stored = await makeEncryptedNode();
    const store = makeStore([stored], true);
    const { leave, notesInput } = await openDrawer(store);

    fireEvent.change(notesInput, { target: { value: 'Old friend' } });
    // The store would take a write encrypted with a passphrase still being
    // tried, so leaving must not save the hidden edit with it.
    let release: () => void = () => undefined;
    decryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });
    try {
      act(() => {
        store.dispatch(setPassphrase('another passphrase'));
      });
      await waitFor(() =>
        expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull(),
      );
      let left: Promise<boolean> | undefined;
      act(() => {
        left = leave();
      });

      const warning = await screen.findByRole('dialog', {
        name: 'Discard changes?',
      });
      expect(warning).toHaveTextContent(notSaved);
      fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

      await expect(left).resolves.toBe(true);
      expect(store.getState().session.network.nodes[0]).toBe(stored);
    } finally {
      release();
      decryptionGate.held = undefined;
    }
  });

  it('asks before leaving an invalid edit, saying it is invalid', async () => {
    const stored = await makeEncryptedNode();
    const store = makeStore([stored], true, true, {
      ...variables,
      [NOTES_VAR]: {
        name: 'notes',
        type: 'text',
        component: 'Text',
        encrypted: true,
        validation: { required: true },
      },
    });
    const { leave, notesInput } = await openDrawer(store);

    fireEvent.change(notesInput, { target: { value: '' } });
    let left: Promise<boolean> | undefined;
    act(() => {
      left = leave();
    });

    const warning = await screen.findByRole('dialog', {
      name: 'Discard changes?',
    });
    expect(warning).toHaveTextContent(/invalid data/);
    fireEvent.click(screen.getByRole('button', { name: 'Keep changes' }));

    await expect(left).resolves.toBe(false);
    expect(store.getState().session.network.nodes[0]).toBe(stored);
  });
});

describe('NetworkComposer moving the selection off an edit in the drawer', () => {
  const notSaved = /Your answers have not been saved/;
  const discardDialog = { name: 'Discard changes?' };

  const makeNodes = async () => [
    await makeEncryptedNode(),
    await makeEncryptedNode({
      id: 'node-b',
      name: 'Bob',
      notes: 'Neighbour',
      position: { x: 0.6, y: 0.6 },
    }),
  ];

  async function openAlice(store: ReturnType<typeof makeStore>) {
    renderComposer(store);
    const alice = await screen.findByRole('button', { name: /alice/i });
    await screen.findByRole('button', { name: /bob/i });
    act(() => {
      tapNode(alice);
    });
    const notesInput = await screen.findByLabelText(/notes/i);
    await waitFor(() => expect(notesInput).toHaveValue('Met at work'));
    return notesInput;
  }

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
    'saves an edit made too recently to have been saved yet before %s',
    async (_, move) => {
      const store = makeStore(await makeNodes(), true);
      const notesInput = await openAlice(store);

      fireEvent.change(notesInput, { target: { value: 'Old friend' } });
      act(move);

      await waitFor(async () =>
        expect(
          await readStored(
            store.getState().session.network.nodes[0],
            NOTES_VAR,
          ),
        ).toBe('Old friend'),
      );
      await waitFor(() =>
        expect(screen.queryByDisplayValue('Old friend')).toBeNull(),
      );
      expect(screen.queryByRole('dialog', discardDialog)).toBeNull();
    },
  );

  it.each(moves)(
    'asks before %s away from an edit it could not save, and stays when the participant keeps it',
    async (_, move) => {
      const nodes = await makeNodes();
      const store = makeStore(nodes, true);
      const notesInput = await openAlice(store);

      act(() => {
        store.dispatch(setPassphraseInvalid(true));
      });
      fireEvent.change(notesInput, { target: { value: 'Old friend' } });
      act(move);

      const warning = await screen.findByRole('dialog', discardDialog);
      expect(warning).toHaveTextContent(notSaved);
      fireEvent.click(screen.getByRole('button', { name: 'Keep changes' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog', discardDialog)).toBeNull(),
      );
      expect(screen.getByLabelText(/notes/i)).toHaveValue('Old friend');
      expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull();
      expect(store.getState().session.network.nodes[0]).toBe(nodes[0]);
    },
  );

  it('moves on once the participant agrees to discard an edit it could not save', async () => {
    const nodes = await makeNodes();
    const store = makeStore(nodes, true);
    const notesInput = await openAlice(store);

    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    fireEvent.change(notesInput, { target: { value: 'Old friend' } });
    act(() => {
      tapNode(screen.getByRole('button', { name: /bob/i }));
    });

    await screen.findByRole('dialog', discardDialog);
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() =>
      expect(screen.queryByDisplayValue('Old friend')).toBeNull(),
    );
    expect(store.getState().session.network.nodes[0]).toBe(nodes[0]);
  });

  it('asks before closing the drawer on an edit hidden while another passphrase is tried', async () => {
    const nodes = await makeNodes();
    const store = makeStore(nodes, true);
    const notesInput = await openAlice(store);

    fireEvent.change(notesInput, { target: { value: 'Old friend' } });
    let release: () => void = () => undefined;
    decryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });
    try {
      act(() => {
        store.dispatch(setPassphrase('another passphrase'));
      });
      await waitFor(() =>
        expect(screen.queryByRole('textbox', { name: /notes/i })).toBeNull(),
      );
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      });

      const warning = await screen.findByRole('dialog', discardDialog);
      expect(warning).toHaveTextContent(notSaved);
      fireEvent.click(screen.getByRole('button', { name: 'Keep changes' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', discardDialog)).toBeNull(),
      );
    } finally {
      release();
      decryptionGate.held = undefined;
    }

    act(() => {
      store.dispatch(setPassphrase(PASSPHRASE));
    });
    expect(await screen.findByRole('textbox', { name: /notes/i })).toHaveValue(
      'Old friend',
    );
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
    'deletes the person %s without asking about an edit it could not save',
    async (_, remove) => {
      const store = makeStore(await makeNodes(), true, true, {
        ...variables,
        [NOTES_VAR]: {
          name: 'notes',
          type: 'text',
          component: 'Text',
          encrypted: true,
          validation: { required: true },
        },
      });
      const notesInput = await openAlice(store);

      fireEvent.change(notesInput, { target: { value: '' } });
      act(remove);

      await waitFor(() =>
        expect(store.getState().session.network.nodes).toHaveLength(1),
      );
      act(() => {
        tapNode(screen.getByRole('button', { name: /bob/i }));
      });
      expect(await screen.findByDisplayValue('Neighbour')).toBeTruthy();
      expect(screen.queryByRole('dialog', discardDialog)).toBeNull();
    },
  );
});

describe('NetworkComposer while the encryptedVariables experiment is off', () => {
  it('stores a name added from the palette as plaintext without asking for a passphrase', async () => {
    const store = makeStore([], false, false);
    renderComposer(store);

    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    const input = await screen.findByRole('textbox', { name: /name/i });
    expect(screen.queryByText(passphraseNotice)).toBeNull();
    act(() => {
      fireEvent.change(input, { target: { value: 'Alice' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [node] = store.getState().session.network.nodes;
    expect(node?.[entityAttributesProperty][QUICK_ADD_VAR]).toBe('Alice');
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('edits values in the drawer and saves them as plaintext without a passphrase', async () => {
    const store = makeStore(
      [
        {
          [entityPrimaryKeyProperty]: NODE_ID,
          type: NODE_TYPE,
          [entityAttributesProperty]: {
            [QUICK_ADD_VAR]: 'Alice',
            [NOTES_VAR]: 'Met at work',
            [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
          },
        },
      ],
      false,
      false,
    );
    renderComposer(store);

    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });

    const notesInput = await screen.findByLabelText(/notes/i);
    expect(notesInput).toHaveProperty('value', 'Met at work');
    fireEvent.change(notesInput, { target: { value: 'Old friend' } });

    await waitFor(
      () => {
        const [node] = store.getState().session.network.nodes;
        expect(node?.[entityAttributesProperty][NOTES_VAR]).toBe('Old friend');
      },
      { timeout: 3000 },
    );
    expect(
      store.getState().session.network.nodes[0]?.[entitySecureAttributesMeta],
    ).toBeUndefined();
  });
});

describe('NetworkComposer validating an encrypted name', () => {
  it('rejects a name another person already has', async () => {
    decryption.ready = false;
    const store = makeStore(
      [await makeEncryptedNode()],
      true,
      true,
      uniqueNameVariables,
    );
    renderComposer(store);

    await waitFor(() => expect(decryption.ready).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    const input = await screen.findByRole('textbox', { name: /name/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(store.getState().session.network.nodes).toHaveLength(1);
  });

  it('rejects a duplicate name without a passphrase while the experiment is off', async () => {
    const store = makeStore(
      [
        {
          [entityPrimaryKeyProperty]: NODE_ID,
          type: NODE_TYPE,
          [entityAttributesProperty]: {
            [QUICK_ADD_VAR]: 'Alice',
            [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
          },
        },
      ],
      false,
      false,
      uniqueNameVariables,
    );
    renderComposer(store);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    const input = await screen.findByRole('textbox', { name: /name/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(store.getState().session.network.nodes).toHaveLength(1);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('waits for the stored names before checking one submitted while they are being decrypted', async () => {
    let release: () => void = () => undefined;
    decryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });
    try {
      decryption.ready = false;
      const store = makeStore(
        [await makeEncryptedNode()],
        true,
        true,
        uniqueNameVariables,
      );
      renderComposer(store);

      fireEvent.click(screen.getByRole('button', { name: /add node/i }));
      const input = await screen.findByRole('textbox', { name: /name/i });
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Alice' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      });

      expect(decryption.ready).toBe(false);
      expect(store.getState().session.network.nodes).toHaveLength(1);

      await act(async () => release());
      await waitFor(() =>
        expect(input).toHaveAttribute('aria-invalid', 'true'),
      );
      expect(store.getState().session.network.nodes).toHaveLength(1);
    } finally {
      release();
      decryptionGate.held = undefined;
    }
  });
});
