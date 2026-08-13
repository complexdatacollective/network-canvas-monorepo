import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getLastAvailableAuthoredStageIndex,
  type InterviewPayload,
} from '@codaco/interview';
import {
  DEFAULT_SYNTHETIC_SEED,
  generateNetwork,
} from '@codaco/protocol-utilities';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import type { PreviewPayload } from '../messages';

const { shellMock } = vi.hoisted(() => ({ shellMock: vi.fn() }));
vi.mock('@codaco/interview', async () => {
  const actual =
    await vi.importActual<typeof import('@codaco/interview')>(
      '@codaco/interview',
    );
  return {
    ...actual,
    Shell: (props: Record<string, unknown>) => {
      shellMock(props);
      return <div data-testid="shell-mounted" />;
    },
  };
});

vi.mock('~/utils/assetDB', () => ({
  assetDb: { assets: { get: vi.fn() } },
}));

import { PreviewHost } from '../PreviewHost';

function makeProtocol() {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [{ id: 's1', type: 'Information', label: 'A' }],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };
}

// A protocol whose validation rules cannot all be satisfied: minLength exceeds
// maxLength, so no value exists and generateNetwork throws
// SyntheticDataConstraintError.
function makeUnsatisfiableProtocol() {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [
      {
        id: 's1',
        type: 'NameGenerator',
        label: 'NG',
        subject: { entity: 'node', type: 'node-1' },
        prompts: [{ id: 'p1', text: 'Add people' }],
        behaviours: { minNodes: 1, maxNodes: 1 },
      },
    ],
    codebook: {
      node: {
        'node-1': {
          name: 'Person',
          variables: {
            'var-code': {
              name: 'Code',
              type: 'text',
              validation: { minLength: 24, maxLength: 10 },
            },
          },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
  };
}

// An unsupported stage type makes generateNetwork throw an ordinary error
// during buildSession.
function makeUnbuildableProtocol() {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [{ id: 'x', type: 'NotAStageType', label: 'X' }],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };
}

function makeConsentRouteProtocol(): CurrentProtocol {
  return {
    name: 'Consent route',
    description: '',
    schemaVersion: 8,
    stages: [
      {
        id: 'consent',
        type: 'EgoForm',
        label: 'Consent',
        introductionPanel: {
          title: 'Consent',
          text: 'Review the study information.',
        },
        form: {
          fields: [
            {
              variable: asEntityAttributeReference('screening'),
              prompt: 'Are you eligible?',
            },
            {
              variable: asEntityAttributeReference('consent'),
              prompt: 'Do you consent?',
            },
          ],
        },
      },
      {
        id: 'background',
        type: 'Information',
        label: 'Background',
        title: 'Background',
        items: [],
        skipLogic: {
          action: 'SKIP',
          filter: {
            rules: [
              {
                id: 'consent-refused',
                type: 'ego',
                options: {
                  attribute: asEntityAttributeReference('consent'),
                  operator: 'EXACTLY',
                  value: false,
                },
              },
            ],
          },
          destination: { type: 'finish' },
        },
      },
      {
        id: 'people',
        type: 'NameGenerator',
        label: 'People',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'people-prompt', text: 'Name people' }],
        behaviours: { minNodes: 4, maxNodes: 4 },
        form: {
          title: 'About this person',
          fields: [
            {
              variable: asEntityAttributeReference('name'),
              prompt: 'What is their name?',
            },
          ],
        },
      },
      {
        id: 'support',
        type: 'Sociogram',
        label: 'Exchanges of support',
        subject: { entity: 'node', type: 'person' },
        background: { concentricCircles: 3 },
        prompts: [
          {
            id: 'support-prompt',
            text: 'Place people',
            layout: {
              layoutVariable: asEntityAttributeReference('layout'),
            },
          },
        ],
      },
      {
        id: 'following',
        type: 'Information',
        label: 'Following stage',
        title: 'Following stage',
        items: [],
      },
    ],
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'Name', type: 'text' },
            layout: { name: 'Layout', type: 'layout' },
          },
        },
      },
      edge: {},
      ego: {
        variables: {
          screening: { name: 'Screening', type: 'boolean' },
          consent: { name: 'Consent', type: 'boolean' },
        },
      },
    },
    assetManifest: {},
  };
}

type TestPreviewPayload = Omit<PreviewPayload, 'protocol'> & {
  protocol: unknown;
};

function makePayload(
  overrides: Partial<TestPreviewPayload> = {},
): TestPreviewPayload {
  return {
    type: 'preview:payload',
    protocol: makeProtocol(),
    protocolId: 'protocol-1',
    startStage: 0,
    useSyntheticData: false,
    respectSkipLogic: false,
    memoryAssets: [],
    ...overrides,
  };
}

function postPayload(
  source: unknown,
  data: unknown,
  origin = window.location.origin,
) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        source: source as MessageEventSource,
        origin,
      }),
    );
  });
}

describe('PreviewHost', () => {
  let originalOpener: Window | null;
  let openerStub: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    originalOpener = window.opener;
    openerStub = { postMessage: vi.fn() };
    Object.defineProperty(window, 'opener', {
      value: openerStub,
      configurable: true,
    });
    shellMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, 'opener', {
      value: originalOpener,
      configurable: true,
    });
  });

  it('posts preview:ready to the opener on mount', () => {
    render(<PreviewHost />);
    expect(openerStub.postMessage).toHaveBeenCalledWith(
      { type: 'preview:ready' },
      window.location.origin,
    );
  });

  it('mounts Shell with the payload after receiving preview:payload', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload());

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
      currentStep: number;
      onStepChange: (step: number) => void;
    };
    expect(call.payload.protocol.name).toBe('T');
    expect(call.payload.session.network.nodes).toEqual([]);
    // Shell goes read-only if currentStep is provided without onStepChange — both must be wired.
    expect(call.currentStep).toBe(0);
    expect(typeof call.onStepChange).toBe('function');
  });

  it('always enables stage navigation in Architect preview', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload());

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      allowStageNavigation: boolean;
    };
    expect(call.allowStageNavigation).toBe(true);
  });

  it('enables interview development tools in Architect preview', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload());

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      flags?: { isDevelopment?: boolean };
    };
    expect(call.flags?.isDevelopment).toBe(true);
  });

  it('initialises currentStep from payload.startStage', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ startStage: 3 }));

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as { currentStep: number };
    expect(call.currentStep).toBe(3);
  });

  it('passes a one-stage initial override without removing skip logic', async () => {
    render(<PreviewHost />);
    const baseProtocol = makeProtocol();
    const protocol = {
      ...baseProtocol,
      stages: [
        {
          ...baseProtocol.stages[0],
          skipLogic: {
            action: 'SKIP',
            filter: { join: 'AND', rules: [] },
          },
        },
      ],
    };
    postPayload(
      openerStub,
      makePayload({ protocol, startStage: 0, respectSkipLogic: true }),
    );

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
      initialStageOverrideIndex?: number;
    };
    expect(call.initialStageOverrideIndex).toBe(0);
    expect(call.payload.protocol.stages[0]).toHaveProperty('skipLogic');
  });

  it('omits the initial override when skip logic is disabled', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ respectSkipLogic: false }));

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      initialStageOverrideIndex?: number;
    };
    expect(call.initialStageOverrideIndex).toBeUndefined();
  });

  it('seeds a synthetic network when useSyntheticData is true', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ useSyntheticData: true }));

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
      currentStep: number;
    };
    expect(call.currentStep).toBe(0);
  });

  it('leaves the previewed stage partially complete in synthetic data', async () => {
    render(<PreviewHost />);
    const protocol = {
      name: 'T',
      description: '',
      schemaVersion: 8,
      stages: [
        {
          id: 's1',
          type: 'NameGenerator',
          label: 'NG',
          subject: { entity: 'node', type: 'node-1' },
          prompts: [{ id: 'p1', text: 'Add people' }],
          behaviours: { minNodes: 4, maxNodes: 8 },
        },
        {
          id: 's2',
          type: 'OrdinalBin',
          label: 'OB',
          subject: { entity: 'node', type: 'node-1' },
          prompts: [{ id: 'p2', text: 'How close?', variable: 'var-ord' }],
        },
      ],
      codebook: {
        node: {
          'node-1': {
            variables: {
              'var-ord': {
                name: 'Closeness',
                type: 'ordinal',
                options: [
                  { label: 'Low', value: 1 },
                  { label: 'High', value: 2 },
                ],
              },
            },
          },
        },
        edge: {},
        ego: {},
      },
      assetManifest: {},
    };
    postPayload(
      openerStub,
      makePayload({ protocol, startStage: 1, useSyntheticData: true }),
    );

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
    };
    const nodes = call.payload.session.network.nodes;
    expect(nodes.length).toBeGreaterThan(0);
    const unplaced = nodes.filter(
      (n) => !Object.hasOwn(n[entityAttributesProperty], 'var-ord'),
    );
    const placed = nodes.filter((n) =>
      Object.hasOwn(n[entityAttributesProperty], 'var-ord'),
    );
    expect(unplaced.length).toBeGreaterThan(0);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('disables skip routing across a synthetic preview when Respect skip logic is off', async () => {
    const protocol = makeConsentRouteProtocol();
    const initial = generateNetwork({
      codebook: protocol.codebook,
      stages: protocol.stages,
      seed: DEFAULT_SYNTHETIC_SEED,
      inProgressStageIndex: 3,
    });
    expect(initial.network.ego[entityAttributesProperty].consent).toBe(false);

    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValue(DEFAULT_SYNTHETIC_SEED / 100_000);
    try {
      render(<PreviewHost />);
      postPayload(
        openerStub,
        makePayload({
          protocol,
          startStage: 3,
          useSyntheticData: true,
          respectSkipLogic: false,
        }),
      );

      await screen.findByTestId('shell-mounted');
      const call = shellMock.mock.calls.at(-1)?.[0] as {
        payload: InterviewPayload;
        currentStep?: number;
        initialStageOverrideIndex?: number;
      };

      expect(call.currentStep).toBe(3);
      expect(
        call.payload.session.network.ego[entityAttributesProperty].consent,
      ).toBe(false);
      expect(
        call.payload.protocol.stages.every(
          (stage) => !Object.hasOwn(stage, 'skipLogic'),
        ),
      ).toBe(true);
      expect(call.payload.protocol.stages[4]?.id).toBe('following');
      expect(
        getLastAvailableAuthoredStageIndex(
          call.payload.protocol.stages,
          call.payload.session.network,
        ),
      ).toBe(4);
      expect(call.initialStageOverrideIndex).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('preserves routing but force-shows the selected stage when Respect skip logic is on', async () => {
    const protocol = makeConsentRouteProtocol();
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValue(DEFAULT_SYNTHETIC_SEED / 100_000);
    try {
      render(<PreviewHost />);
      postPayload(
        openerStub,
        makePayload({
          protocol,
          startStage: 3,
          useSyntheticData: true,
          respectSkipLogic: true,
        }),
      );

      await screen.findByTestId('shell-mounted');
      const call = shellMock.mock.calls.at(-1)?.[0] as {
        payload: InterviewPayload;
        initialStageOverrideIndex?: number;
      };

      expect(
        call.payload.session.network.ego[entityAttributesProperty].consent,
      ).toBe(false);
      expect(call.payload.protocol.stages[1]).toHaveProperty('skipLogic');
      expect(
        getLastAvailableAuthoredStageIndex(
          call.payload.protocol.stages,
          call.payload.session.network,
        ),
      ).toBe(0);
      expect(call.initialStageOverrideIndex).toBe(3);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('seeds finalized stageMetadata for a synthetic FamilyPedigree', async () => {
    render(<PreviewHost />);
    const protocol = {
      name: 'T',
      description: '',
      schemaVersion: 8,
      stages: [
        {
          id: 'fp',
          type: 'FamilyPedigree',
          label: 'Family',
          nodeConfig: { type: 'node-1' },
          edgeConfig: { type: 'edge-1' },
        },
      ],
      codebook: {
        node: { 'node-1': { variables: {} } },
        edge: { 'edge-1': { variables: {} } },
        ego: {},
      },
      assetManifest: {},
    };
    postPayload(
      openerStub,
      makePayload({ protocol, startStage: 0, useSyntheticData: true }),
    );

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
    };
    const metadata = call.payload.session.stageMetadata?.['0'] as
      | { isNetworkCommitted?: boolean; nodes?: unknown[]; edges?: unknown[] }
      | undefined;
    expect(metadata).toEqual(
      expect.objectContaining({ isNetworkCommitted: true }),
    );
    expect(metadata?.nodes?.length).toBeGreaterThanOrEqual(7);
    expect(metadata?.edges?.length).toBeGreaterThan(0);
  });

  it('shows an error fallback when payload processing throws', async () => {
    render(<PreviewHost />);
    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnbuildableProtocol(),
        useSyntheticData: true,
      }),
    );

    expect(
      await screen.findByText(/couldn't build the preview/i),
    ).toBeInTheDocument();
    expect(shellMock).not.toHaveBeenCalled();
  });

  it('names the conflicting variables and offers no retry when generation is unsatisfiable', async () => {
    render(<PreviewHost />);
    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnsatisfiableProtocol(),
        useSyntheticData: true,
      }),
    );

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Person/)).toBeInTheDocument();
    expect(screen.getByText(/Code/)).toBeInTheDocument();
    expect(
      screen.getByText(/minLength 24 exceeds maxLength 10/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
    expect(shellMock).not.toHaveBeenCalled();
  });

  it('clears a stale preview when a later rebuild is unsatisfiable', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ useSyntheticData: false }));
    await screen.findByTestId('shell-mounted');

    shellMock.mockClear();
    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnsatisfiableProtocol(),
        useSyntheticData: true,
      }),
    );

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('drops the rule conflicts when a later rebuild fails for another reason', async () => {
    render(<PreviewHost />);
    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnsatisfiableProtocol(),
        useSyntheticData: true,
      }),
    );
    await screen.findByText(/protocol can't be previewed/i);

    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnbuildableProtocol(),
        useSyntheticData: true,
      }),
    );

    expect(
      await screen.findByText(/couldn't build the preview/i),
    ).toBeInTheDocument();
    // The earlier failure's conflicts must not survive: they describe rules the
    // second build never even reached, so telling the user to edit them is wrong.
    expect(
      screen.queryByText(/protocol can't be previewed/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/minLength 24 exceeds maxLength 10/i)).toBeNull();
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('drops a generic failure when a later rebuild is unsatisfiable', async () => {
    render(<PreviewHost />);
    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnbuildableProtocol(),
        useSyntheticData: true,
      }),
    );
    await screen.findByText(/couldn't build the preview/i);

    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnsatisfiableProtocol(),
        useSyntheticData: true,
      }),
    );

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/minLength 24 exceeds maxLength 10/i),
    ).toBeInTheDocument();
    // The generic screen's retry can only fail the same way here, so no part of
    // it may survive alongside the conflict list.
    expect(
      screen.queryByText(/couldn't build the preview/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('shows the preview once a corrected protocol arrives', async () => {
    render(<PreviewHost />);
    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnsatisfiableProtocol(),
        useSyntheticData: true,
      }),
    );
    await screen.findByText(/protocol can't be previewed/i);

    postPayload(openerStub, makePayload());

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(
      screen.queryByText(/protocol can't be previewed/i),
    ).not.toBeInTheDocument();
  });

  it('ignores payload messages from a non-opener source', () => {
    render(<PreviewHost />);
    postPayload({}, makePayload());
    expect(shellMock).not.toHaveBeenCalled();
  });

  it('ignores payload messages from a different origin', () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload(), 'https://attacker.example');
    expect(shellMock).not.toHaveBeenCalled();
  });

  it('renders the preview-ended fallback when window.opener is null', () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      configurable: true,
    });
    render(<PreviewHost />);
    expect(screen.getByText(/preview has ended/i)).toBeInTheDocument();
  });

  it('shows a timeout fallback if the payload never arrives', () => {
    vi.useFakeTimers();
    try {
      render(<PreviewHost />);
      expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(
        screen.getByText(/couldn't reach the architect tab/i),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports the rule conflicts when a payload arrives after the timeout', async () => {
    vi.useFakeTimers();
    try {
      render(<PreviewHost />);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(
        screen.getByText(/couldn't reach the architect tab/i),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }

    postPayload(
      openerStub,
      makePayload({
        protocol: makeUnsatisfiableProtocol(),
        useSyntheticData: true,
      }),
    );

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/minLength 24 exceeds maxLength 10/i),
    ).toBeInTheDocument();
    // Architect answered, so blaming the connection hides the rules the user
    // can actually correct.
    expect(
      screen.queryByText(/couldn't reach the architect tab/i),
    ).not.toBeInTheDocument();
  });

  it('shows the preview when a payload arrives after the timeout and builds', async () => {
    vi.useFakeTimers();
    try {
      render(<PreviewHost />);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(
        screen.getByText(/couldn't reach the architect tab/i),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }

    postPayload(openerStub, makePayload());

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't reach the architect tab/i),
    ).not.toBeInTheDocument();
  });

  it('re-posts preview:ready when the user clicks Try again', () => {
    vi.useFakeTimers();
    try {
      render(<PreviewHost />);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      openerStub.postMessage.mockClear();

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(openerStub.postMessage).toHaveBeenCalledWith(
        { type: 'preview:ready' },
        window.location.origin,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
