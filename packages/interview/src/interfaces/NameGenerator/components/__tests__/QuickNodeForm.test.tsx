import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import {
  asEntityAttributeReference,
  type Codebook,
  type Validation,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEncryptionHeader,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../../../contract/types';
import { writeSubmissionResult } from '../../../../forms/writeSubmissionResult';
import protocol from '../../../../store/modules/protocol';
import session, {
  addNode as addSessionNode,
  type SessionState,
} from '../../../../store/modules/session';
import ui from '../../../../store/modules/ui';
import type { StageProps } from '../../../../types';
import {
  encryptionFor,
  unlockWith,
} from '../../../Anonymisation/__tests__/encryptionFixtures';
import { generateSecureAttributes } from '../../../Anonymisation/utils';
import QuickNodeForm from '../QuickNodeForm';

vi.mock('../../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

// Records when a list holding encrypted values has been decrypted, so a test
// can wait for stored values to be readable before relying on them.
const decryption = vi.hoisted(() => ({ ready: false }));
vi.mock('../../../Anonymisation/useDecryptedNodes', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../Anonymisation/useDecryptedNodes')
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

const NODE_TYPE = 'person';
const TARGET_VARIABLE = 'name';
const SIBLING_VARIABLE = 'alias';
const STAGE_ID = 'quick-add-stage';
const PROMPT_ID = 'prompt-1';
const PASSPHRASE = 'quick add passphrase';

function buildCodebook(
  validation?: Validation,
  // Architect's "Create New Variable" dialog never sets `component` on a
  // variable created there — the schema permits this — so a component-less
  // quickAdd target is the realistic (not synthetic-only) case the
  // regression test below exercises.
  omitComponent = false,
  encrypted = false,
): Codebook {
  return {
    node: {
      [NODE_TYPE]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        icon: 'add-a-person',
        variables: {
          [TARGET_VARIABLE]: {
            name: 'Name',
            type: 'text',
            ...(omitComponent ? {} : { component: 'Text' }),
            ...(validation ? { validation } : {}),
            ...(encrypted ? { encrypted } : {}),
          },
          [SIBLING_VARIABLE]: {
            name: 'Flag',
            type: 'boolean',
            component: 'Toggle',
          },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  };
}

type QuickAddStage = StageProps<'NameGeneratorQuickAdd'>['stage'];

function buildStage(fixedSiblingValue?: boolean): QuickAddStage {
  return {
    id: STAGE_ID,
    type: 'NameGeneratorQuickAdd',
    label: 'Add people',
    subject: { entity: 'node', type: NODE_TYPE },
    quickAdd: asEntityAttributeReference(TARGET_VARIABLE),
    prompts: [
      {
        id: PROMPT_ID,
        text: 'Name the people in your network',
        ...(fixedSiblingValue === undefined
          ? {}
          : {
              additionalAttributes: [
                {
                  variable: asEntityAttributeReference(SIBLING_VARIABLE),
                  value: fixedSiblingValue,
                },
              ],
            }),
      },
    ],
  };
}

function buildSession(
  existingNodes: NcNode[] = [],
  encryption?: NcEncryptionHeader,
): SessionState {
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
      nodes: existingNodes,
      edges: [],
      ...(encryption ? { encryption } : {}),
    },
  };
}

function buildProtocol(
  validation?: Validation,
  omitComponent = false,
  fixedSiblingValue?: boolean,
  encrypted = false,
): ProtocolPayload {
  return {
    id: 'protocol',
    hash: 'hash',
    importedAt: '2024-01-01T00:00:00.000Z',
    assets: [],
    name: 'Test protocol',
    schemaVersion: 9,
    codebook: buildCodebook(validation, omitComponent, encrypted),
    stages: [buildStage(fixedSiblingValue)],
  };
}

async function renderQuickNodeForm({
  validation,
  omitComponent,
  fixedSiblingValue,
  existingNodes,
  encrypted,
  addNode,
}: {
  validation?: Validation;
  omitComponent?: boolean;
  fixedSiblingValue?: boolean;
  existingNodes?: NcNode[];
  encrypted?: boolean;
  addNode: (
    attributes: NcNode[typeof entityAttributesProperty],
  ) => Promise<FormSubmissionResult>;
}) {
  const encryption = encrypted ? await encryptionFor(PASSPHRASE) : undefined;
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: buildSession(existingNodes, encryption?.header),
      protocol: buildProtocol(
        validation,
        omitComponent,
        fixedSiblingValue,
        encrypted,
      ),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  if (encrypted) await unlockWith(store, PASSPHRASE);

  render(
    <Provider store={store}>
      <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
        <QuickNodeForm
          disabled={false}
          targetVariable={TARGET_VARIABLE}
          addNode={addNode}
        />
      </CurrentStepProvider>
    </Provider>,
  );

  return { store };
}

const openField = async () => {
  await userEvent.click(screen.getByTestId('quick-add-toggle'));
  return screen.findByTestId('quick-add-input');
};

const saved = async (): Promise<FormSubmissionResult> => ({ success: true });

describe('QuickNodeForm honours codebook validation', () => {
  it('honours optional requiredness alongside the other codebook rules', async () => {
    const addNode = vi.fn(saved);
    await renderQuickNodeForm({
      validation: { required: false, maxLength: 10 },
      addNode,
    });

    const input = await openField();

    // Over maxLength (11 chars): rejected, node not created.
    await userEvent.type(input, 'a very long name');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(addNode).not.toHaveBeenCalled();

    // Empty is accepted because the codebook explicitly makes it optional.
    await userEvent.clear(input);
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(addNode).toHaveBeenCalledTimes(1));
    expect(addNode).toHaveBeenCalledWith({ [TARGET_VARIABLE]: '' });
  });

  it('accepts an empty entry when the codebook has no validation rules', async () => {
    const addNode = vi.fn(saved);
    await renderQuickNodeForm({ validation: undefined, addNode });

    const input = await openField();

    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(addNode).toHaveBeenCalledTimes(1));
    expect(addNode).toHaveBeenCalledWith({ [TARGET_VARIABLE]: '' });
  });

  it('clears a successful value when adding the node updates the live validation context before submission finishes', async () => {
    let store: Awaited<ReturnType<typeof renderQuickNodeForm>>['store'];
    const addNode = vi.fn(
      async (attributes: NcNode[typeof entityAttributesProperty]) =>
        writeSubmissionResult(
          await store.dispatch(
            addSessionNode({
              type: NODE_TYPE,
              attributeData: attributes,
              currentStep: 0,
            }),
          ),
        ),
    );
    ({ store } = await renderQuickNodeForm({
      validation: undefined,
      addNode,
    }));

    const input = await openField();
    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(addNode).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().session.network.nodes).toHaveLength(1);
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        TARGET_VARIABLE
      ],
    ).toBe('Alice');
  });

  it('resolves a unique-across-the-network rule via the threaded validationContext, proving context reaches quick-add (no currentEntityId needed at creation)', async () => {
    const existingNode: NcNode = {
      [entityPrimaryKeyProperty]: 'existing-node',
      type: NODE_TYPE,
      [entityAttributesProperty]: { [TARGET_VARIABLE]: 'Alice' },
    };
    const addNode = vi.fn(saved);
    await renderQuickNodeForm({
      validation: { unique: true },
      existingNodes: [existingNode],
      addNode,
    });

    const input = await openField();

    // Duplicates the existing node's name: rejected, proving the validation
    // context (network) reached the field without throwing (unique's
    // implementation invariants on context being provided).
    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(addNode).not.toHaveBeenCalled();

    // A distinct value is accepted.
    await userEvent.clear(input);
    await userEvent.type(input, 'Bob');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(addNode).toHaveBeenCalledTimes(1));
    expect(addNode).toHaveBeenCalledWith({ [TARGET_VARIABLE]: 'Bob' });
  });

  it('still enforces validation for a component-less target variable (e.g. one created via Architect\'s "Create New Variable" dialog, which never sets `component`), without crashing', async () => {
    const addNode = vi.fn(saved);
    await renderQuickNodeForm({
      validation: { required: true },
      omitComponent: true,
      addNode,
    });

    const input = await openField();

    // Empty (violates required): rejected, node not created — proving
    // validation still applies even though the codebook variable carries no
    // `component`.
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(addNode).not.toHaveBeenCalled();

    // A valid value is accepted.
    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(addNode).toHaveBeenCalledTimes(1));
    expect(addNode).toHaveBeenCalledWith({ [TARGET_VARIABLE]: 'Alice' });
  });

  it('compares the target against prompt-fixed sibling attributes on the new node', async () => {
    const addNode = vi.fn(saved);
    await renderQuickNodeForm({
      validation: {
        sameAs: asEntityAttributeReference(SIBLING_VARIABLE),
      },
      fixedSiblingValue: true,
      addNode,
    });

    const input = await openField();

    await userEvent.type(input, 'true');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(addNode).not.toHaveBeenCalled();
  });
});

describe('QuickNodeForm with an encrypted target variable', () => {
  it('rejects a name another person already has', async () => {
    const { encryptedAttributes, secureAttributes } =
      await generateSecureAttributes(
        { [TARGET_VARIABLE]: 'Alice' },
        buildCodebook(undefined, false, true).node?.[NODE_TYPE]?.variables ??
          {},
        (await encryptionFor(PASSPHRASE)).key,
        'existing-node',
      );
    const existingNode: NcNode = {
      [entityPrimaryKeyProperty]: 'existing-node',
      type: NODE_TYPE,
      [entityAttributesProperty]: encryptedAttributes,
      [entitySecureAttributesMeta]: secureAttributes,
    };
    const addNode = vi.fn(saved);
    decryption.ready = false;
    await renderQuickNodeForm({
      validation: { unique: true },
      existingNodes: [existingNode],
      encrypted: true,
      addNode,
    });

    await waitFor(() => expect(decryption.ready).toBe(true));
    const input = await openField();
    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(addNode).not.toHaveBeenCalled();
  });
});
