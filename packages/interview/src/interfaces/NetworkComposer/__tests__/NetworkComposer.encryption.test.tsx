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
}: {
  nodes?: NcNode[];
  locked?: boolean;
  fresh?: boolean;
  refused?: boolean;
  nodeVariables?: Record<string, Variable>;
} = {}): Promise<Store> {
  const { header } = await encryptionFor(PASSPHRASE);
  const store = createEncryptionStore(nodes, [stage], nodeVariables, {
    header: fresh ? undefined : refused ? outOfBoundsHeader(header) : header,
  });
  if (!locked && !refused) await unlockWith(store, PASSPHRASE);
  return store;
}

function renderComposer(store: Store) {
  const registerBeforeNext: RegisterBeforeNext = vi.fn();
  const props: StageProps<'NetworkComposer'> = {
    stage,
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
              <CurrentStepProvider
                currentStep={0}
                onStepChange={() => undefined}
              >
                <StageMetadataContext.Provider value={registerBeforeNext}>
                  {children}
                </StageMetadataContext.Provider>
              </CurrentStepProvider>
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
