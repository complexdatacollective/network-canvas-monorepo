import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InterviewPayload } from '@codaco/interview';
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
    skipLogicBypassed: false,
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

  it('mounts Shell with the payload after receiving preview:payload', () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload());

    expect(screen.getByTestId('shell-mounted')).toBeInTheDocument();
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

  it('always enables stage navigation in Architect preview', () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload());

    const call = shellMock.mock.calls.at(-1)?.[0] as {
      allowStageNavigation: boolean;
    };
    expect(call.allowStageNavigation).toBe(true);
  });

  it('initialises currentStep from payload.startStage', () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ startStage: 3 }));

    const call = shellMock.mock.calls.at(-1)?.[0] as { currentStep: number };
    expect(call.currentStep).toBe(3);
  });

  it('seeds a synthetic network when useSyntheticData is true', () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ useSyntheticData: true }));

    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
      currentStep: number;
    };
    expect(call.currentStep).toBe(0);
  });

  it('leaves the previewed stage partially complete in synthetic data', () => {
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

    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
    };
    const nodes = call.payload.session.network.nodes;
    expect(nodes.length).toBeGreaterThan(0);
    const unplaced = nodes.filter(
      (n) => n[entityAttributesProperty]['var-ord'] === null,
    );
    const placed = nodes.filter(
      (n) => n[entityAttributesProperty]['var-ord'] !== null,
    );
    expect(unplaced.length).toBeGreaterThan(0);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('seeds finalized stageMetadata for a synthetic FamilyPedigree', () => {
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

    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
    };
    expect(call.payload.session.stageMetadata).toEqual({
      '0': { isNetworkCommitted: true },
    });
  });

  it('shows an error fallback when payload processing throws', () => {
    render(<PreviewHost />);
    const protocol = {
      name: 'T',
      description: '',
      schemaVersion: 8,
      // An unsupported stage type makes generateNetwork throw during buildSession.
      stages: [{ id: 'x', type: 'NotAStageType', label: 'X' }],
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: {},
    };
    postPayload(openerStub, makePayload({ protocol, useSyntheticData: true }));

    expect(screen.getByText(/couldn't build the preview/i)).toBeInTheDocument();
    expect(shellMock).not.toHaveBeenCalled();
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
