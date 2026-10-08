import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';
import {
  asEntityAttributeReference,
  type Codebook,
  type FormField,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../contract/types';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import { generateSecureAttributes } from '../../interfaces/Anonymisation/utils';
import protocol from '../../store/modules/protocol';
import session, {
  restoreNode,
  type SessionState,
} from '../../store/modules/session';
import ui, { setPassphrase } from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';
const NAME_VAR = 'name';
const NICKNAME_VAR = 'nickname';
const NOTES_VAR = 'notes';
const SECRET_VAR = 'secret';
const PET_TYPE = 'pet';
const NODE_ID = 'node-1';
const PASSPHRASE = 'protocol form passphrase';

const variables: Record<string, Variable> = {
  [NAME_VAR]: {
    name: 'name',
    label: 'Name',
    type: 'text',
    component: 'Text',
    encrypted: true,
    validation: { unique: true },
  },
  [NICKNAME_VAR]: {
    name: 'nickname',
    label: 'Nickname',
    type: 'text',
    component: 'Text',
    validation: { differentFrom: asEntityAttributeReference(NAME_VAR) },
  },
  [NOTES_VAR]: {
    name: 'notes',
    label: 'Notes',
    type: 'text',
    component: 'Text',
  },
  [SECRET_VAR]: {
    name: 'secret',
    label: 'Secret',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
};

const petVariables: Record<string, Variable> = {
  [NAME_VAR]: {
    name: 'name',
    label: 'Name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
};

const codebook: Codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables,
    },
    [PET_TYPE]: {
      name: 'Pet',
      label: { en: 'Pet' },
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: petVariables,
    },
  },
  edge: {},
  ego: { variables: {} },
};

function fieldFor(variable: string): FormField[] {
  return [
    {
      variable: asEntityAttributeReference(variable),
      prompt: { en: 'Answer' },
    },
  ];
}

async function encryptedNode(
  attributes: Record<string, string> = { [NAME_VAR]: 'Alice' },
  {
    id = NODE_ID,
    type = NODE_TYPE,
    passphrase = PASSPHRASE,
  }: { id?: string; type?: string; passphrase?: string } = {},
): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      attributes,
      type === PET_TYPE ? petVariables : variables,
      passphrase,
    );
  return {
    [entityPrimaryKeyProperty]: id,
    type,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

function makeStore(
  nodes: NcNode[],
  passphrase: string | null,
  encryptionEnabled = true,
) {
  const sessionState: SessionState = {
    id: 'session',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    promptIndex: 0,
    localePreference: null,
    locale: null,
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego',
        [entityAttributesProperty]: {},
      },
      nodes,
      edges: [],
    },
  };
  const protocolState: ProtocolPayload = {
    id: 'protocol',
    hash: 'hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    name: 'Encrypted form protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    experiments: { encryptedVariables: encryptionEnabled },
    codebook,
    stages: [
      {
        id: 'stage-1',
        type: 'NameGenerator',
        label: { en: 'Name the people you know' },
        subject: { entity: 'node', type: NODE_TYPE },
        form: {
          title: { en: 'Add a person' },
          fields: fieldFor(NOTES_VAR),
        },
        prompts: [{ id: 'prompt-1', text: { en: 'Name the people you know' } }],
      },
    ],
  };
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: { session: sessionState, protocol: protocolState },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  if (passphrase) store.dispatch(setPassphrase(passphrase));
  return store;
}

function renderForm(
  store: ReturnType<typeof makeStore>,
  variable: string,
  currentEntityId?: string,
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <TestProtocolLocalization>
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            {children}
          </CurrentStepProvider>
        </TestProtocolLocalization>
      </Provider>
    );
  }
  return renderHook(
    () => useProtocolForm({ fields: fieldFor(variable), currentEntityId }),
    { wrapper: Wrapper },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validationContextOf(fieldComponents: ReactNode) {
  const element = Array.isArray(fieldComponents)
    ? fieldComponents[0]
    : fieldComponents;
  if (!isValidElement(element) || !isRecord(element.props)) return undefined;
  const { validationContext } = element.props;
  return isRecord(validationContext) ? validationContext : undefined;
}

/** A stored person's value in a network the validators compare with. */
function valueIn(network: unknown, variable: string, nodeId = NODE_ID) {
  if (!isRecord(network)) return undefined;
  const { nodes } = network;
  if (!Array.isArray(nodes)) return undefined;
  const node: unknown = nodes.find(
    (candidate: unknown) =>
      isRecord(candidate) && candidate[entityPrimaryKeyProperty] === nodeId,
  );
  if (!isRecord(node) || !isRecord(node[entityAttributesProperty])) {
    return undefined;
  }
  return node[entityAttributesProperty][variable];
}

/** The value the first field's validators see for a stored person. */
function validatedValue(
  fieldComponents: ReactNode,
  variable: string,
  nodeId = NODE_ID,
) {
  return valueIn(
    validationContextOf(fieldComponents)?.network,
    variable,
    nodeId,
  );
}

/** What a validation run of the first field gets from `resolveNetwork`. */
async function resolvedNetwork(fieldComponents: ReactNode): Promise<unknown> {
  const resolveNetwork = validationContextOf(fieldComponents)?.resolveNetwork;
  if (typeof resolveNetwork !== 'function') {
    throw new Error('Expected the field to resolve its network');
  }
  const resolved: unknown = await resolveNetwork();
  return resolved;
}

describe('useProtocolForm validating against encrypted values', () => {
  it.each([
    ['`unique` on an encrypted variable', NAME_VAR, undefined],
    ['`differentFrom` naming an encrypted variable', NICKNAME_VAR, NODE_ID],
  ])(
    'compares %s with the plaintext of the stored value',
    async (_rule, variable, currentEntityId) => {
      const store = makeStore([await encryptedNode()], PASSPHRASE);
      const { result } = renderForm(store, variable, currentEntityId);

      await waitFor(() => {
        expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
          'Alice',
        );
      });
    },
  );

  it('fails validation with the reason, rather than comparing with ciphertext, until a passphrase is entered', async () => {
    const store = makeStore([await encryptedNode()], null);
    const { result } = renderForm(store, NICKNAME_VAR, NODE_ID);

    await expect(
      resolvedNetwork(result.current.fieldComponents),
    ).rejects.toThrow(
      createMessageError(runtimeMessages.protectedAnswersNotSaved),
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('fails validation with the reason when the passphrase cannot decrypt the compared values', async () => {
    const store = makeStore([await encryptedNode()], 'not the passphrase');
    const { result } = renderForm(store, NICKNAME_VAR, NODE_ID);

    await expect(
      resolvedNetwork(result.current.fieldComponents),
    ).rejects.toThrow(createMessageError(runtimeMessages.decryptRetry));
    await waitFor(() =>
      expect(store.getState().ui.passphraseInvalid).toBe(true),
    );
    await expect(
      resolvedNetwork(result.current.fieldComponents),
    ).rejects.toThrow(createMessageError(runtimeMessages.decryptRetry));
  });

  it('compares with the values its rules need when other saved values cannot be decrypted', async () => {
    const store = makeStore(
      [
        await encryptedNode(),
        // Saved under another passphrase: an answer no rule here compares
        // with, and a pet, whose names are not the people's.
        await encryptedNode(
          { [SECRET_VAR]: 'kept to themselves' },
          { id: 'node-2', passphrase: 'an older passphrase' },
        ),
        await encryptedNode(
          { [NAME_VAR]: 'Rex' },
          { id: 'pet-1', type: PET_TYPE, passphrase: 'an older passphrase' },
        ),
      ],
      PASSPHRASE,
    );
    const { result } = renderForm(store, NAME_VAR);

    await waitFor(() => {
      expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
        'Alice',
      );
    });
    expect(
      validationContextOf(result.current.fieldComponents)?.resolveNetwork,
    ).toBeUndefined();
    expect(store.getState().ui.passphraseInvalid).toBe(false);
  });

  it("reads a rule's named variable only on the person being edited", async () => {
    const store = makeStore(
      [
        await encryptedNode(),
        await encryptedNode(
          { [NAME_VAR]: 'Bob' },
          { id: 'node-2', passphrase: 'an older passphrase' },
        ),
      ],
      PASSPHRASE,
    );
    const { result } = renderForm(store, NICKNAME_VAR, NODE_ID);

    await waitFor(() => {
      expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
        'Alice',
      );
    });
    expect(
      validationContextOf(result.current.fieldComponents)?.resolveNetwork,
    ).toBeUndefined();
    expect(store.getState().ui.passphraseInvalid).toBe(false);
  });

  it("reads nobody's stored answer for a rule that names a variable on a new person", async () => {
    const store = makeStore([await encryptedNode()], null);
    const { result } = renderForm(store, NICKNAME_VAR);

    expect(
      validationContextOf(result.current.fieldComponents)?.resolveNetwork,
    ).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('compares with a person added while the comparison waited for decryption', async () => {
    const store = makeStore([await encryptedNode()], PASSPHRASE);
    const bob = await encryptedNode({ [NAME_VAR]: 'Bob' }, { id: 'node-2' });
    const { result } = renderForm(store, NAME_VAR);

    const resolving = resolvedNetwork(result.current.fieldComponents);
    act(() => {
      store.dispatch(restoreNode(bob));
    });
    const resolved = await resolving;

    expect(valueIn(resolved, NAME_VAR, 'node-2')).toBe('Bob');
  });

  it('reads the compared values again with a passphrase entered while the comparison waited', async () => {
    const store = makeStore([await encryptedNode()], PASSPHRASE);
    const { result } = renderForm(store, NICKNAME_VAR, NODE_ID);

    const resolving = resolvedNetwork(result.current.fieldComponents);
    act(() => {
      store.dispatch(setPassphrase('a passphrase entered meanwhile'));
    });

    await expect(resolving).rejects.toThrow(
      createMessageError(runtimeMessages.decryptRetry),
    );
  });

  it('compares with the values that a passphrase entered while the comparison waited can read', async () => {
    const store = makeStore([await encryptedNode()], 'not the passphrase');
    const { result } = renderForm(store, NICKNAME_VAR, NODE_ID);

    const resolving = resolvedNetwork(result.current.fieldComponents);
    act(() => {
      store.dispatch(setPassphrase(PASSPHRASE));
    });

    expect(valueIn(await resolving, NAME_VAR)).toBe('Alice');
  });

  it("compares `unique` with everyone else's answers, not the edited person's own", async () => {
    const store = makeStore(
      [
        await encryptedNode(
          { [NAME_VAR]: 'Alice' },
          { passphrase: 'an older passphrase' },
        ),
        await encryptedNode({ [NAME_VAR]: 'Bob' }, { id: 'node-2' }),
      ],
      PASSPHRASE,
    );
    const { result } = renderForm(store, NAME_VAR, NODE_ID);

    await waitFor(() => {
      expect(
        validatedValue(result.current.fieldComponents, NAME_VAR, 'node-2'),
      ).toBe('Bob');
    });
    expect(
      validationContextOf(result.current.fieldComponents)?.resolveNetwork,
    ).toBeUndefined();
    expect(store.getState().ui.passphraseInvalid).toBe(false);
  });

  it('leaves a form that compares with no encrypted value on the stored network', async () => {
    const node = await encryptedNode();
    const store = makeStore([node], null);
    const { result } = renderForm(store, NOTES_VAR, NODE_ID);

    expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
      node[entityAttributesProperty][NAME_VAR],
    );
    expect(
      validationContextOf(result.current.fieldComponents)?.resolveNetwork,
    ).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('compares with the stored values, without asking for a passphrase, while the experiment is off', async () => {
    const node = await encryptedNode();
    const store = makeStore([node], null, false);
    const { result } = renderForm(store, NAME_VAR);

    expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
      node[entityAttributesProperty][NAME_VAR],
    );
    expect(
      validationContextOf(result.current.fieldComponents)?.resolveNetwork,
    ).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
