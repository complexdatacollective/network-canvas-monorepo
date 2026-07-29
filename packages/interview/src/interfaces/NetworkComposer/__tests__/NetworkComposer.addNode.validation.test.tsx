import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Codebook, Validation } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '../../../types';
import NetworkComposer from '../NetworkComposer';

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const NODE_TYPE = 'person';
const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';

function buildStage() {
  return {
    id: 'nc1',
    type: 'NetworkComposer' as const,
    label: 'Network Composer',
    subject: { entity: 'node' as const, type: NODE_TYPE },
    layoutVariable: LAYOUT_VAR,
    quickAdd: QUICK_ADD_VAR,
    background: {
      concentricCircles: 4,
      skewedTowardCenter: true,
    },
  };
}

// Architect's "Create New Variable" dialog never sets `component` on a
// variable created there — the schema permits this — so a component-less
// quickAdd target is the realistic (not synthetic-only) case one of the
// tests below exercises.
function buildCodebook(
  validation?: Validation,
  omitComponent = false,
): Codebook {
  return {
    node: {
      [NODE_TYPE]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          [QUICK_ADD_VAR]: {
            name: 'Name',
            type: 'text',
            ...(omitComponent ? {} : { component: 'Text' }),
            ...(validation ? { validation } : {}),
          },
          [LAYOUT_VAR]: { name: 'position', type: 'layout' },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  };
}

function renderInterface({
  validation,
  omitComponent,
  existingNames = [],
}: {
  validation?: Validation;
  omitComponent?: boolean;
  existingNames?: string[];
} = {}) {
  const stage = buildStage();
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: existingNames.map((name, index) => ({
            [entityPrimaryKeyProperty]: `node-${index}`,
            type: NODE_TYPE,
            [entityAttributesProperty]: {
              [QUICK_ADD_VAR]: name,
              [LAYOUT_VAR]: { x: 0.5, y: 0.5 },
            },
          })),
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook: buildCodebook(validation, omitComponent),
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  const registerBeforeNext: RegisterBeforeNext = vi.fn();

  const props: StageProps<'NetworkComposer'> = {
    stage: stage as StageProps<'NetworkComposer'>['stage'],
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
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            <StageMetadataContext.Provider value={registerBeforeNext}>
              {children}
            </StageMetadataContext.Provider>
          </CurrentStepProvider>
        </ContractProvider>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });

  return { store };
}

async function openAddInput() {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
  });
  return screen.findByRole('textbox', { name: /name/i });
}

describe('NetworkComposer quick-add honours codebook validation', () => {
  it('rejects an empty entry and an entry over maxLength when the codebook requires the field', async () => {
    const { store } = renderInterface({
      validation: { required: true, maxLength: 10 },
    });

    const input = await openAddInput();

    // Over maxLength (17 chars): rejected, node not created.
    await userEvent.type(input, 'a very long name');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });

    // Empty (violates required): also rejected.
    await userEvent.clear(input);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });
  });

  it("is a no-op on an empty submission when the codebook has no validation rules (pins today's pre-existing behaviour, unrelated to codebook validation — no runtime fallback to required)", async () => {
    const { store } = renderInterface({ validation: undefined });

    const input = await openAddInput();

    // No text typed: submitting an empty, rule-less field creates nothing —
    // the pre-existing guard against blank quick-add entries, independent of
    // whatever the codebook does or doesn't require.
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });

    // A non-empty entry still works normally for a rule-less variable.
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      const nodes = store.getState().session.network.nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.[entityAttributesProperty]?.[QUICK_ADD_VAR]).toBe(
        'Alice',
      );
    });
  });

  it('still enforces validation for a component-less target variable (e.g. one created via Architect\'s "Create New Variable" dialog, which never sets `component`), without crashing', async () => {
    const { store } = renderInterface({
      validation: { required: true },
      omitComponent: true,
    });

    const input = await openAddInput();

    // Empty (violates required): rejected, node not created — proving
    // validation still applies even though the codebook variable carries no
    // `component`.
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });

    // A valid value is accepted.
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      const nodes = store.getState().session.network.nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.[entityAttributesProperty]?.[QUICK_ADD_VAR]).toBe(
        'Alice',
      );
    });
  });

  it('validates the trimmed value that quick-add persists', async () => {
    const { store } = renderInterface({
      validation: { unique: true },
      existingNames: ['Alice'],
    });

    const input = await openAddInput();
    await userEvent.type(input, ' Alice ');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => expect(input).toHaveValue('Alice'));
    expect(store.getState().session.network.nodes).toHaveLength(1);
  });

  it('starts the next required quick-add entry without showing a stale validation error', async () => {
    const { store } = renderInterface({
      validation: { required: true },
    });

    const input = await openAddInput();
    await userEvent.type(input, 'Alice');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
      expect(input).toHaveValue('');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(
      screen.queryByText('You must answer this question before continuing.'),
    ).not.toBeInTheDocument();
  });
});
