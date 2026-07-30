import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

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

import { CurrentStepProvider } from '../../../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../../../contract/types';
import protocol from '../../../../store/modules/protocol';
import session, {
  addNode as addSessionNode,
  type SessionState,
} from '../../../../store/modules/session';
import ui from '../../../../store/modules/ui';
import type { StageProps } from '../../../../types';
import QuickNodeForm from '../QuickNodeForm';

vi.mock('../../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

const NODE_TYPE = 'person';
const TARGET_VARIABLE = 'name';
const SIBLING_VARIABLE = 'alias';
const STAGE_ID = 'quick-add-stage';
const PROMPT_ID = 'prompt-1';

function buildCodebook(
  validation?: Validation,
  // Architect's "Create New Variable" dialog never sets `component` on a
  // variable created there — the schema permits this — so a component-less
  // quickAdd target is the realistic (not synthetic-only) case the
  // regression test below exercises.
  omitComponent = false,
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

function buildSession(existingNodes: NcNode[] = []): SessionState {
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
    },
  };
}

function buildProtocol(
  validation?: Validation,
  omitComponent = false,
  fixedSiblingValue?: boolean,
): ProtocolPayload {
  return {
    id: 'protocol',
    hash: 'hash',
    importedAt: '2024-01-01T00:00:00.000Z',
    assets: [],
    name: 'Test protocol',
    schemaVersion: 8,
    codebook: buildCodebook(validation, omitComponent),
    stages: [buildStage(fixedSiblingValue)],
  };
}

function renderQuickNodeForm({
  validation,
  omitComponent,
  fixedSiblingValue,
  existingNodes,
  addNode,
}: {
  validation?: Validation;
  omitComponent?: boolean;
  fixedSiblingValue?: boolean;
  existingNodes?: NcNode[];
  addNode: (
    attributes: NcNode[typeof entityAttributesProperty],
  ) => Promise<void>;
}) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: buildSession(existingNodes),
      protocol: buildProtocol(validation, omitComponent, fixedSiblingValue),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

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

describe('QuickNodeForm honours codebook validation', () => {
  it('keeps the special writer required while honoring the other codebook rules', async () => {
    const addNode = vi.fn(async () => {});
    renderQuickNodeForm({
      validation: { required: false, maxLength: 10 },
      addNode,
    });

    const input = await openField();

    // Over maxLength (11 chars): rejected, node not created.
    await userEvent.type(input, 'a very long name');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(addNode).not.toHaveBeenCalled();

    // Empty (violates required): also rejected.
    await userEvent.clear(input);
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(addNode).not.toHaveBeenCalled();
  });

  it('requires an entry when the codebook has no validation rules', async () => {
    const addNode = vi.fn(async () => {});
    renderQuickNodeForm({ validation: undefined, addNode });

    const input = await openField();

    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(input).not.toBeDisabled());
    expect(addNode).not.toHaveBeenCalled();

    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(addNode).toHaveBeenCalledTimes(1));
    expect(addNode).toHaveBeenCalledWith({ [TARGET_VARIABLE]: 'Alice' });
  });

  it('clears a successful value when adding the node updates the live validation context before submission finishes', async () => {
    let store: ReturnType<typeof renderQuickNodeForm>['store'];
    const addNode = vi.fn(
      async (attributes: NcNode[typeof entityAttributesProperty]) => {
        await store
          .dispatch(
            addSessionNode({
              type: NODE_TYPE,
              attributeData: attributes,
              currentStep: 0,
            }),
          )
          .unwrap();
      },
    );
    ({ store } = renderQuickNodeForm({
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
    const addNode = vi.fn(async () => {});
    renderQuickNodeForm({
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
    const addNode = vi.fn(async () => {});
    renderQuickNodeForm({
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
    const addNode = vi.fn(async () => {});
    renderQuickNodeForm({
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
