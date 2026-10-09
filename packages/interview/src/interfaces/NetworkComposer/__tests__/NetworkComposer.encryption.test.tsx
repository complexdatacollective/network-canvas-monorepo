import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { WritesInFlightProvider } from '../../../store/WritesInFlightContext';
import type { RegisterBeforeNext, StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  outOfBoundsHeader,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
import { generateSecureAttributes } from '../../Anonymisation/utils';
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

// Records every decryption attempt, and holds each one while `held` is set so
// a test can act while stored values are still being decrypted.
const decryptionGate = vi.hoisted(() => {
  const gate: {
    held?: Promise<void>;
    attempts: { nodeId: string; variableId: string }[];
  } = { attempts: [] };
  return gate;
});
vi.mock('../../Anonymisation/encryptionFormat', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../Anonymisation/encryptionFormat')
    >();
  return {
    ...actual,
    decryptValue: async (...args: Parameters<typeof actual.decryptValue>) => {
      const [, , { nodeId, variableId }] = args;
      decryptionGate.attempts.push({ nodeId, variableId });
      await decryptionGate.held;
      return actual.decryptValue(...args);
    },
  };
});

// Holds back the result of the next encryption while `held` is set, so a
// test can make an earlier save slower than a later one, and refuses every
// encryption begun while `failing` is set. Counts every encryption begun and
// ended, so a test can wait for all of them.
const encryptionGate = vi.hoisted(() => {
  const gate: {
    held?: Promise<void>;
    failing: boolean;
    begun: number;
    ended: number;
  } = { failing: false, begun: 0, ended: 0 };
  return gate;
});
vi.mock('../../Anonymisation/utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../Anonymisation/utils')>();
  return {
    ...actual,
    generateSecureAttributes: async (
      ...args: Parameters<typeof actual.generateSecureAttributes>
    ) => {
      encryptionGate.begun += 1;
      const held = encryptionGate.held;
      encryptionGate.held = undefined;
      const failing = encryptionGate.failing;
      try {
        if (failing) throw new Error('Encryption refused');
        const result = await actual.generateSecureAttributes(...args);
        await held;
        return result;
      } finally {
        encryptionGate.ended += 1;
      }
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
const PLACE_VAR = 'var-place';
const GROUP_VAR = 'var-group';
const NODE_ID = 'node-a';
const PASSPHRASE = 'composer passphrase';

const encryptedText = (name: string): Variable => ({
  name,
  label: name,
  type: 'text',
  component: 'Text',
  encrypted: true,
});

const variables: Record<string, Variable> = {
  [QUICK_ADD_VAR]: encryptedText('name'),
  [LAYOUT_VAR]: { name: 'position', label: 'position', type: 'layout' },
  [NOTES_VAR]: encryptedText('notes'),
  [PLACE_VAR]: {
    name: 'place',
    label: 'place',
    type: 'text',
    component: 'Text',
  },
};

const uniqueNameVariables: Record<string, Variable> = {
  ...variables,
  [QUICK_ADD_VAR]: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
    validation: { unique: true },
  },
};

const stage: StageProps<'NetworkComposer'>['stage'] = {
  id: 'nc1',
  type: 'NetworkComposer',
  label: { en: 'Network Composer' },
  subject: { entity: 'node', type: NODE_TYPE },
  layoutVariable: asEntityAttributeReference(LAYOUT_VAR),
  quickAdd: asEntityAttributeReference(QUICK_ADD_VAR),
  nodeForm: {
    fields: [
      {
        variable: asEntityAttributeReference(NOTES_VAR),
        component: 'Text',
        label: { en: 'Notes' },
      },
      {
        variable: asEntityAttributeReference(PLACE_VAR),
        component: 'Text',
        label: { en: 'Place' },
      },
    ],
  },
  background: { concentricCircles: 4, skewedTowardCenter: true },
};

async function makeEncryptedNode(): Promise<NcNode> {
  const { key } = await encryptionFor(PASSPHRASE);
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      {
        [QUICK_ADD_VAR]: 'Alice',
        [NOTES_VAR]: 'Met at work',
        [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
      },
      variables,
      key,
      NODE_ID,
    );
  return {
    [entityPrimaryKeyProperty]: NODE_ID,
    type: NODE_TYPE,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

/** Alice's answers, copied onto another person, are still bound to Alice. */
async function makeCopiedNode(): Promise<NcNode> {
  return {
    ...(await makeEncryptedNode()),
    [entityPrimaryKeyProperty]: 'node-b',
  };
}

async function openCopiedNode(store: Store) {
  renderComposer(store);
  const nodeButton = await screen.findByRole('button', {
    name: 'Answer unavailable',
  });
  act(() => {
    tapNode(nodeButton);
  });
}

type Store = ReturnType<typeof createEncryptionStore>;

/**
 * An interview holding `nodes`. Unless `fresh`, its passphrase was chosen
 * earlier; its key is in force unless `locked`. A `refused` interview holds a
 * header no passphrase can open, as a damaged copy might.
 */
async function makeStore({
  nodes = [],
  locked = false,
  fresh = false,
  refused = false,
  nodeVariables = variables,
  composerStage = stage,
}: {
  nodes?: NcNode[];
  locked?: boolean;
  fresh?: boolean;
  refused?: boolean;
  nodeVariables?: Record<string, Variable>;
  composerStage?: StageProps<'NetworkComposer'>['stage'];
} = {}): Promise<Store> {
  const { header } = await encryptionFor(PASSPHRASE);
  const store = createEncryptionStore(nodes, [composerStage], nodeVariables, {
    header: fresh ? undefined : refused ? outOfBoundsHeader(header) : header,
  });
  if (!locked && !refused) await unlockWith(store, PASSPHRASE);
  return store;
}

function renderComposer(store: Store, composerStage = stage) {
  const registerBeforeNext: RegisterBeforeNext = vi.fn();
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
        <TestProtocolLocalization>
          <ContractProvider
            onFinish={vi.fn()}
            onRequestAsset={vi.fn()}
            flags={{ isE2E: false, isDevelopment: false }}
          >
            <DialogProvider>
              <WritesInFlightProvider
                writesSettled={store.writesSettled}
                trackWrite={store.trackWrite}
              >
                <CurrentStepProvider
                  currentStep={0}
                  onStepChange={() => undefined}
                >
                  <StageMetadataContext.Provider value={registerBeforeNext}>
                    {children}
                  </StageMetadataContext.Provider>
                </CurrentStepProvider>
              </WritesInFlightProvider>
            </DialogProvider>
          </ContractProvider>
        </TestProtocolLocalization>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });
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

// The stored value must be ciphertext, stored with only an IV beside it, that
// decrypts as this node's own answer.
async function readStored(node: NcNode | undefined, variable: string) {
  if (!node) throw new Error('Expected the node to exist');
  const stored = readEncryptedAttribute(node, variable, variables);
  if (stored?.status !== 'encrypted') {
    throw new Error('Expected a stored ciphertext');
  }
  expect(stored.value.nodeId).toBe(node[entityPrimaryKeyProperty]);
  expect(
    Object.keys(node[entitySecureAttributesMeta]?.[variable] ?? {}),
  ).toEqual(['iv']);
  const { key } = await encryptionFor(PASSPHRASE);
  return decryptValue(key, stored.value, stored.value);
}

async function addFromPalette(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /add node/i }));
  const input = await screen.findByRole('textbox', { name: /name/i });
  act(() => {
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  });
}

const passphraseNotice = /enter your passphrase to see and change/i;

describe('NetworkComposer with encrypted variables', () => {
  it('asks for the passphrase and holds the add-node field until one is entered', async () => {
    const store = await makeStore({ fresh: true, locked: true });
    renderComposer(store);

    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull();
    expect(store.getState().session.network.nodes).toHaveLength(0);
  });

  it('holds the add-node field in a resumed interview until the passphrase is entered again', async () => {
    const store = await makeStore({ locked: true });
    renderComposer(store);

    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull();

    await act(() => unlockWith(store, PASSPHRASE));

    expect(await screen.findByRole('textbox', { name: /name/i })).toBeTruthy();
    expect(screen.queryByText(passphraseNotice)).toBeNull();
  });

  it('stores a name added from the palette as ciphertext bound to the new node', async () => {
    const store = await makeStore();
    renderComposer(store);

    await addFromPalette('Alice');

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [node] = store.getState().session.network.nodes;
    expect(node?.[entityAttributesProperty][QUICK_ADD_VAR]).not.toBe('Alice');
    expect(await readStored(node, QUICK_ADD_VAR)).toBe('Alice');
  });

  it('puts an undone node back under its own id on redo, with its name still readable and shown', async () => {
    const store = await makeStore();
    renderComposer(store);

    await addFromPalette('Alice');
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [created] = store.getState().session.network.nodes;

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toEqual([]);
    });
    expect(screen.queryByRole('button', { name: /alice/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [restored] = store.getState().session.network.nodes;
    expect(restored?.[entityPrimaryKeyProperty]).toBe(
      created?.[entityPrimaryKeyProperty],
    );
    expect(await readStored(restored, QUICK_ADD_VAR)).toBe('Alice');
    expect(await screen.findByRole('button', { name: /alice/i })).toBeTruthy();
  });

  it('shows decrypted values in the drawer and saves edits encrypted', async () => {
    const store = await makeStore({ nodes: [await makeEncryptedNode()] });
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
    const store = await makeStore({
      nodes: [await makeEncryptedNode()],
      locked: true,
    });
    renderComposer(store);

    const nodeButton = await screen.findByRole('button', { name: /🔒/ });
    act(() => {
      tapNode(nodeButton);
    });

    expect(await screen.findByText(passphraseNotice)).toBeTruthy();
    expect(screen.queryByLabelText(/notes/i)).toBeNull();
    expect(screen.queryByDisplayValue(/\d+,\d+,\d+/)).toBeNull();

    await act(() => unlockWith(store, PASSPHRASE));

    const notesInput = await screen.findByLabelText(/notes/i);
    expect(notesInput).toHaveProperty('value', 'Met at work');
  });

  it('shows the answers of a person that cannot be read as unavailable, once, without asking for the passphrase again', async () => {
    decryptionGate.attempts.length = 0;
    const store = await makeStore({ nodes: [await makeCopiedNode()] });
    await openCopiedNode(store);

    const notesInput = await screen.findByLabelText(
      /notes/i,
      {},
      { timeout: 3000 },
    );
    expect(notesInput).toHaveValue('Answer unavailable');
    expect(notesInput).toHaveAttribute('readonly');
    expect(notesInput).toHaveAccessibleDescription(/cannot be shown here/);
    expect(
      screen.getByRole('heading', { name: 'Answer unavailable' }),
    ).toBeTruthy();
    expect(screen.queryByText(passphraseNotice)).toBeNull();
    expect(screen.queryByDisplayValue(/\d+,\d+,\d+/)).toBeNull();

    const attemptsOn = (variableId: string) =>
      decryptionGate.attempts.filter(
        (attempt) =>
          attempt.nodeId === 'node-b' && attempt.variableId === variableId,
      );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(attemptsOn(QUICK_ADD_VAR)).toHaveLength(1);
    expect(attemptsOn(NOTES_VAR)).toHaveLength(1);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('keeps the answers that cannot be read when the drawer saves a change to another answer', async () => {
    const copied = await makeCopiedNode();
    const store = await makeStore({ nodes: [copied] });
    await openCopiedNode(store);

    const place = await screen.findByRole(
      'textbox',
      { name: 'Place' },
      { timeout: 3000 },
    );
    fireEvent.change(place, { target: { value: 'Work' } });

    await waitFor(
      () =>
        expect(
          store.getState().session.network.nodes[0]?.[entityAttributesProperty][
            PLACE_VAR
          ],
        ).toBe('Work'),
      { timeout: 3000 },
    );
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty]).toEqual({
      ...copied[entityAttributesProperty],
      [PLACE_VAR]: 'Work',
    });
    expect(saved?.[entitySecureAttributesMeta]).toEqual(
      copied[entitySecureAttributesMeta],
    );
  });

  it('saves a new answer over one that cannot be read, keeping the field and its focus once saved', async () => {
    const store = await makeStore({ nodes: [await makeCopiedNode()] });
    await openCopiedNode(store);

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Enter a new answer' },
        { timeout: 3000 },
      ),
    );
    const notesInput = screen.getByLabelText(/notes/i);
    expect(notesInput).toHaveValue('');
    expect(notesInput).toHaveFocus();
    fireEvent.change(notesInput, { target: { value: 'Old friend' } });

    await waitFor(
      async () => {
        const [node] = store.getState().session.network.nodes;
        expect(await readStored(node, NOTES_VAR)).toBe('Old friend');
      },
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(screen.queryByText(/will replace the earlier one/)).toBeNull(),
    );
    expect(screen.getByLabelText(/notes/i)).toBe(notesInput);
    expect(notesInput).toHaveFocus();
    expect(notesInput).toHaveValue('Old friend');
  });
});

describe('NetworkComposer under an encryption header no passphrase can open', () => {
  it('shows each protected answer as unavailable, without asking for a passphrase, and saves the others', async () => {
    const person = await makeEncryptedNode();
    const store = await makeStore({ nodes: [person], refused: true });
    renderComposer(store);

    const nodeButton = await screen.findByRole('button', {
      name: 'Answer unavailable',
    });
    act(() => {
      tapNode(nodeButton);
    });

    const notesInput = await screen.findByLabelText(/notes/i);
    expect(notesInput).toHaveValue('Answer unavailable');
    expect(notesInput).toHaveAttribute('readonly');
    expect(notesInput).toHaveAccessibleDescription(
      /cannot be shown or saved in this interview/,
    );
    expect(
      screen.queryByRole('button', { name: 'Enter a new answer' }),
    ).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'Place' }), {
      target: { value: 'Work' },
    });

    await waitFor(() =>
      expect(
        store.getState().session.network.nodes[0]?.[entityAttributesProperty][
          PLACE_VAR
        ],
      ).toBe('Work'),
    );
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty]).toEqual({
      ...person[entityAttributesProperty],
      [PLACE_VAR]: 'Work',
    });
    expect(saved?.[entitySecureAttributesMeta]).toEqual(
      person[entitySecureAttributesMeta],
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});

describe('NetworkComposer validating an encrypted name', () => {
  it('rejects a name another person already has', async () => {
    decryption.ready = false;
    const store = await makeStore({
      nodes: [await makeEncryptedNode()],
      nodeVariables: uniqueNameVariables,
    });
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

  const groupedVariables: Record<string, Variable> = {
    ...uniqueNameVariables,
    [GROUP_VAR]: {
      name: 'team',
      label: 'team',
      type: 'categorical',
      options: [{ value: 'red', label: { en: 'Team Red' } }],
    },
  };
  const groupedStage: StageProps<'NetworkComposer'>['stage'] = {
    ...stage,
    convexHullVariable: asEntityAttributeReference(GROUP_VAR),
  };

  // Submits `name` while the stored names are still being decrypted, so it
  // is checked only once `release` is called.
  async function submitWhileDecrypting(name: string) {
    let release: () => void = () => undefined;
    decryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });
    const store = await makeStore({
      nodes: [await makeEncryptedNode()],
      nodeVariables: groupedVariables,
      composerStage: groupedStage,
    });
    renderComposer(store, groupedStage);

    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    const input = await screen.findByRole('textbox', { name: /name/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });
    return { store, input, release };
  }

  it('keeps the field open while a name is checked and added', async () => {
    const { store, input, release } = await submitWhileDecrypting('Bob');
    try {
      await act(async () => {
        fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
      });
      fireEvent.click(screen.getByRole('button', { name: /^select$/i }));
      fireEvent.click(screen.getByRole('button', { name: /groups/i }));
      fireEvent.click(await screen.findByRole('button', { name: /team red/i }));
      expect(screen.getByRole('button', { name: /add node/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(input).toBeInTheDocument();

      await act(async () => release());
      await waitFor(() =>
        expect(store.getState().session.network.nodes).toHaveLength(2),
      );
      expect(input).toBeInTheDocument();
    } finally {
      release();
      decryptionGate.held = undefined;
    }
  });

  it.each([
    ['stored once the person is added', 'Bob', true],
    ['not stored when the name is refused', 'Alice', false],
  ])(
    'counts a name being checked as being saved, %s',
    async (_outcome, name, stored) => {
      const { store, release } = await submitWhileDecrypting(name);
      try {
        const settling = store.writesSettled();
        expect(settling).toBeDefined();

        await act(async () => release());
        let allStored: boolean | undefined;
        await act(async () => {
          allStored = await settling;
        });
        expect(allStored).toBe(stored);
      } finally {
        release();
        decryptionGate.held = undefined;
      }
    },
  );

  it('waits for the stored names before checking one submitted while they are being decrypted', async () => {
    let release: () => void = () => undefined;
    decryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });
    try {
      decryption.ready = false;
      const store = await makeStore({
        nodes: [await makeEncryptedNode()],
        nodeVariables: uniqueNameVariables,
      });
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

describe('NetworkComposer saving edits in the order they were made', () => {
  afterEach(() => {
    encryptionGate.held = undefined;
    encryptionGate.failing = false;
  });

  function holdNextEncryption() {
    const begunBefore = encryptionGate.begun;
    let release: () => void = () => undefined;
    encryptionGate.held = new Promise((resolve) => {
      release = resolve;
    });
    return { begun: () => encryptionGate.begun > begunBefore, release };
  }

  // Every encryption begun has ended and its write has been applied.
  async function allSaved() {
    await waitFor(() =>
      expect(encryptionGate.ended).toBe(encryptionGate.begun),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  async function openAlice(store: Store) {
    renderComposer(store);
    const nodeButton = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeButton);
    });
    const notesInput = await screen.findByLabelText(/notes/i);
    await waitFor(() => expect(notesInput).toHaveValue('Met at work'));
    return notesInput;
  }

  it.each([
    ['stores the latest edit', 'Old friend'],
    ['keeps an answer put back', 'Met at work'],
  ])(
    '%s when an earlier save is still encrypting its answers',
    async (_case, latest) => {
      const store = await makeStore({ nodes: [await makeEncryptedNode()] });
      const notesInput = await openAlice(store);
      const earlier = holdNextEncryption();

      fireEvent.change(notesInput, { target: { value: 'First' } });
      await waitFor(() => expect(earlier.begun()).toBe(true), {
        timeout: 2000,
      });
      fireEvent.change(notesInput, { target: { value: latest } });
      // Long enough for a later save that did not wait for the earlier one to
      // be stored first.
      await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
      earlier.release();

      await allSaved();
      expect(
        await readStored(store.getState().session.network.nodes[0], NOTES_VAR),
      ).toBe(latest);
      expect(screen.getByLabelText(/notes/i)).toHaveValue(latest);
    },
  );

  it('keeps the drawer open on an answer put back until it is saved, and asks when it cannot be', async () => {
    const store = await makeStore({ nodes: [await makeEncryptedNode()] });
    const notesInput = await openAlice(store);
    const earlier = holdNextEncryption();

    fireEvent.change(notesInput, { target: { value: 'Old friend' } });
    await waitFor(() => expect(earlier.begun()).toBe(true), {
      timeout: 2000,
    });
    encryptionGate.failing = true;
    fireEvent.change(notesInput, { target: { value: 'Met at work' } });
    // Long enough for the autosave to ask for the answer put back.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    earlier.release();

    expect(
      await screen.findByRole('dialog', { name: 'Discard changes?' }),
    ).toHaveTextContent('An error occurred while submitting the form.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Discard changes?' }),
      ).toBeNull(),
    );
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Met at work');
    expect(
      await readStored(store.getState().session.network.nodes[0], NOTES_VAR),
    ).toBe('Old friend');
  });

  const pressUndo = () =>
    act(async () => {
      fireEvent.keyDown(screen.getByTestId('network-composer'), {
        key: 'z',
        metaKey: true,
      });
    });

  const storedNotes = (store: Store) =>
    readStored(store.getState().session.network.nodes[0], NOTES_VAR);

  it('applies an undo pressed while an edit is being saved to that edit', async () => {
    const store = await makeStore({ nodes: [await makeEncryptedNode()] });
    const notesInput = await openAlice(store);
    const saving = holdNextEncryption();

    fireEvent.change(notesInput, { target: { value: 'First' } });
    await waitFor(() => expect(saving.begun()).toBe(true), { timeout: 2000 });
    await pressUndo();
    saving.release();

    await allSaved();
    await waitFor(() => expect(notesInput).toHaveValue('Met at work'));
    // Long enough for an answer the form wrongly showed again to be saved.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    await allSaved();
    expect(await storedNotes(store)).toBe('Met at work');
  });

  it('lets Undo be pressed while the first edit is being saved, and applies it to that edit', async () => {
    const store = await makeStore({ nodes: [await makeEncryptedNode()] });
    const notesInput = await openAlice(store);
    const saving = holdNextEncryption();

    fireEvent.change(notesInput, { target: { value: 'First' } });
    await waitFor(() => expect(saving.begun()).toBe(true), { timeout: 2000 });
    const undo = screen.getByRole('button', { name: 'Undo' });
    // Toolbar controls stay focusable and say they are disabled this way.
    expect(undo).not.toHaveAttribute('aria-disabled', 'true');
    act(() => {
      fireEvent.click(undo);
    });
    saving.release();

    await allSaved();
    await waitFor(() => expect(notesInput).toHaveValue('Met at work'));
    expect(await storedNotes(store)).toBe('Met at work');
  });

  it('keeps an edit an undo overtook while its save waited its turn, without saving it', async () => {
    const store = await makeStore({ nodes: [await makeEncryptedNode()] });
    const notesInput = await openAlice(store);
    const first = holdNextEncryption();

    fireEvent.change(notesInput, { target: { value: 'First' } });
    await waitFor(() => expect(first.begun()).toBe(true), { timeout: 2000 });
    fireEvent.change(notesInput, { target: { value: 'Second' } });
    // Long enough for the second save to be asked for, and to wait for the
    // first.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    await pressUndo();
    first.release();

    await allSaved();
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    await allSaved();
    expect(await storedNotes(store)).toBe('Met at work');
    expect(notesInput).toHaveValue('Second');
  });

  it('does not save back an answer an undo replaced while a save waited its turn', async () => {
    const store = await makeStore({ nodes: [await makeEncryptedNode()] });
    const notesInput = await openAlice(store);
    const place = screen.getByLabelText(/place/i);
    const storedCiphertext = () =>
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        NOTES_VAR
      ];
    const original = storedCiphertext();
    const first = holdNextEncryption();

    fireEvent.change(notesInput, { target: { value: 'First' } });
    await waitFor(() => expect(first.begun()).toBe(true), { timeout: 2000 });
    fireEvent.change(place, { target: { value: 'Lisbon' } });
    // Long enough for the second save, which also carries the notes, to be
    // asked for and to wait for the first.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    await pressUndo();
    first.release();

    await allSaved();
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    await allSaved();
    // What the undo put back, not the same answer saved again over it.
    expect(storedCiphertext()).toEqual(original);
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        PLACE_VAR
      ],
    ).toBe('Lisbon');
    expect(notesInput).toHaveValue('Met at work');
  });

  it('deletes a person only once an edit being saved is stored, so undo and redo keep the answer', async () => {
    const store = await makeStore({ nodes: [await makeEncryptedNode()] });
    const notesInput = await openAlice(store);
    const aliceNotes = () =>
      readStored(
        store
          .getState()
          .session.network.nodes.find(
            (node) => node[entityPrimaryKeyProperty] === NODE_ID,
          ),
        NOTES_VAR,
      );
    const aliceExists = () =>
      store
        .getState()
        .session.network.nodes.some(
          (node) => node[entityPrimaryKeyProperty] === NODE_ID,
        );
    const pressRedo = () =>
      act(async () => {
        fireEvent.keyDown(screen.getByTestId('network-composer'), {
          key: 'z',
          metaKey: true,
          shiftKey: true,
        });
      });
    const saving = holdNextEncryption();

    fireEvent.change(notesInput, { target: { value: 'First' } });
    await waitFor(() => expect(saving.begun()).toBe(true), { timeout: 2000 });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    });
    // Shown as gone, and so out of reach, while the deletion waits its turn.
    expect(aliceExists()).toBe(true);
    expect(screen.queryByRole('button', { name: /alice/i })).toBeNull();
    saving.release();
    await allSaved();
    await waitFor(() => expect(aliceExists()).toBe(false));

    // Undoing the deletion puts back the answer that was being saved.
    await pressUndo();
    await waitFor(() => expect(aliceExists()).toBe(true));
    expect(await aliceNotes()).toBe('First');

    await pressUndo();
    await waitFor(async () => expect(await aliceNotes()).toBe('Met at work'));
    await pressRedo();
    await waitFor(async () => expect(await aliceNotes()).toBe('First'));
  });
});

describe('NetworkComposer side panel checking an answer against a protected one', () => {
  // Only the notes are protected, so the side panel opens without the
  // passphrase, but its place is checked against them.
  const comparingVariables: Record<string, Variable> = {
    ...variables,
    [QUICK_ADD_VAR]: {
      name: 'name',
      label: 'name',
      type: 'text',
      component: 'Text',
    },
    [PLACE_VAR]: {
      name: 'place',
      label: 'place',
      type: 'text',
      component: 'Text',
      validation: { differentFrom: asEntityAttributeReference(NOTES_VAR) },
    },
  };
  const comparingStage: StageProps<'NetworkComposer'>['stage'] = {
    ...stage,
    nodeForm: {
      fields: [
        {
          variable: asEntityAttributeReference(PLACE_VAR),
          component: 'Text',
          label: { en: 'Place' },
        },
      ],
    },
  };

  async function makeNodeWithProtectedNotes(): Promise<NcNode> {
    const { key } = await encryptionFor(PASSPHRASE);
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        {
          [QUICK_ADD_VAR]: 'Alice',
          [NOTES_VAR]: 'Met at work',
          [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
        },
        comparingVariables,
        key,
        NODE_ID,
      );
    return {
      [entityPrimaryKeyProperty]: NODE_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: encryptedAttributes,
      [entitySecureAttributesMeta]: secureAttributes,
    };
  }

  it.each([
    [
      'says the passphrase is needed to save the answer',
      true,
      'Your answers have not been saved. Enter your passphrase, then try again.',
    ],
    [
      'says the answer is invalid once the passphrase is in force',
      false,
      /invalid data/,
    ],
  ])('%s before discarding it on closing', async (_case, locked, reason) => {
    const store = await makeStore({
      nodes: [await makeNodeWithProtectedNotes()],
      locked,
      nodeVariables: comparingVariables,
      composerStage: comparingStage,
    });
    renderComposer(store, comparingStage);

    act(() => {
      tapNode(screen.getByRole('button', { name: 'Alice' }));
    });
    const placeInput = await screen.findByLabelText(/place/i);
    fireEvent.change(placeInput, { target: { value: 'Met at work' } });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    const dialog = await screen.findByRole('dialog', {
      name: 'Discard changes?',
    });
    expect(dialog).toHaveTextContent(reason);
    expect(dialog).not.toHaveTextContent(
      locked ? /invalid data/ : /Enter your passphrase/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Discard changes?' }),
      ).toBeNull(),
    );
    expect(screen.getByLabelText(/place/i)).toHaveValue('Met at work');
  });
});
