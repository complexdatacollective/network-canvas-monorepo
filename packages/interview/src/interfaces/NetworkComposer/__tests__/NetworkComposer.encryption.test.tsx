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
import type { RegisterBeforeNext, StageProps } from '../../../types';
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

async function makeEncryptedNode(): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      {
        [QUICK_ADD_VAR]: 'Alice',
        [NOTES_VAR]: 'Met at work',
        [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
      },
      variables,
      PASSPHRASE,
    );
  return {
    [entityPrimaryKeyProperty]: NODE_ID,
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
) {
  const store = createEncryptionStore(nodes, [stage], nodeVariables, {
    encryptionEnabled,
  });
  if (withPassphrase) store.dispatch(setPassphrase(PASSPHRASE));
  return store;
}

function renderComposer(store: ReturnType<typeof makeStore>) {
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
});
