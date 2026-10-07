import { configureStore } from '@reduxjs/toolkit';
import { renderHook, waitFor } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

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
import { generateSecureAttributes } from '../../interfaces/Anonymisation/utils';
import protocol from '../../store/modules/protocol';
import session, { type SessionState } from '../../store/modules/session';
import ui, { setPassphrase } from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';
const NAME_VAR = 'name';
const NICKNAME_VAR = 'nickname';
const NOTES_VAR = 'notes';
const NODE_ID = 'node-1';
const PASSPHRASE = 'protocol form passphrase';

const variables: Record<string, Variable> = {
  [NAME_VAR]: {
    name: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
    validation: { unique: true },
  },
  [NICKNAME_VAR]: {
    name: 'nickname',
    type: 'text',
    component: 'Text',
    validation: { differentFrom: asEntityAttributeReference(NAME_VAR) },
  },
  [NOTES_VAR]: { name: 'notes', type: 'text', component: 'Text' },
};

const codebook: Codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables,
    },
  },
  edge: {},
  ego: { variables: {} },
};

function fieldFor(variable: string): FormField[] {
  return [{ variable: asEntityAttributeReference(variable), prompt: 'Answer' }];
}

async function encryptedNode(): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { [NAME_VAR]: 'Alice' },
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

function makeStore(nodes: NcNode[], withPassphrase: boolean) {
  const sessionState: SessionState = {
    id: 'session',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    promptIndex: 0,
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
    codebook,
    stages: [
      {
        id: 'stage-1',
        type: 'NameGenerator',
        label: 'Name the people you know',
        subject: { entity: 'node', type: NODE_TYPE },
        form: { title: 'Add a person', fields: fieldFor(NOTES_VAR) },
        prompts: [{ id: 'prompt-1', text: 'Name the people you know' }],
      },
    ],
  };
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: { session: sessionState, protocol: protocolState },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  if (withPassphrase) store.dispatch(setPassphrase(PASSPHRASE));
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
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
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

/** The value the first field's validators see for the stored person. */
function validatedValue(fieldComponents: ReactNode, variable: string) {
  const element = Array.isArray(fieldComponents)
    ? fieldComponents[0]
    : fieldComponents;
  if (!isValidElement(element) || !isRecord(element.props)) return undefined;
  const { validationContext } = element.props;
  if (!isRecord(validationContext) || !isRecord(validationContext.network)) {
    return undefined;
  }
  const { nodes } = validationContext.network;
  if (!Array.isArray(nodes)) return undefined;
  const node: unknown = nodes.find(
    (candidate: unknown) =>
      isRecord(candidate) && candidate[entityPrimaryKeyProperty] === NODE_ID,
  );
  if (!isRecord(node) || !isRecord(node[entityAttributesProperty])) {
    return undefined;
  }
  return node[entityAttributesProperty][variable];
}

describe('useProtocolForm validating against encrypted values', () => {
  it.each([
    ['`unique` on an encrypted variable', NAME_VAR, undefined],
    ['`differentFrom` naming an encrypted variable', NICKNAME_VAR, NODE_ID],
  ])(
    'compares %s with the plaintext of the stored value',
    async (_rule, variable, currentEntityId) => {
      const store = makeStore([await encryptedNode()], true);
      const { result } = renderForm(store, variable, currentEntityId);

      await waitFor(() => {
        expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
          'Alice',
        );
      });
    },
  );

  it('leaves a form that compares with no encrypted value on the stored network', async () => {
    const node = await encryptedNode();
    const store = makeStore([node], false);
    const { result } = renderForm(store, NOTES_VAR, NODE_ID);

    expect(validatedValue(result.current.fieldComponents, NAME_VAR)).toBe(
      node[entityAttributesProperty][NAME_VAR],
    );
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
