import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type FinishHandler,
  getLastAvailableAuthoredStageIndex,
  type InterviewPayload,
} from '@codaco/interview';
import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  entityAttributesProperty,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

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

/**
 * Every protocol a preview receives is SCHEMA-PARSE OUTPUT (`StageEditor`
 * hands `validationResult.data` to `launchPreview`), and that is what supplies
 * the per-stage `synthetic` descriptors synthetic generation refuses to run
 * without. Fixtures therefore go through the real schema rather than being
 * hand-written with descriptors attached, so a descriptor the schema stops
 * supplying breaks these tests instead of hiding behind a literal.
 */
function makeProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [
      { id: 's1', type: 'Information', label: 'A', title: 'A', items: [] },
    ],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  });
}

/**
 * A protocol whose validation rules cannot all be satisfied *together*: the
 * stage collects six people, each of whom must pick exactly one of two options,
 * and every pick must be unique. The sixth person has nothing left to pick, so
 * generation refuses with the conflict list the preview's own screen renders.
 *
 * Every rule here is individually satisfiable, which is the point. A
 * single-variable contradiction (a minimum above its own maximum, say) is
 * refused by the schema itself, so it can never reach a preview —
 * `StageEditor` shows "Cannot Preview" and never opens the window. What
 * survives parsing and fails only once generation runs is a conflict like this
 * one, between rules and the number of entities they have to cover.
 */
function makeUnsatisfiableProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
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
        behaviours: { minNodes: 6, maxNodes: 6 },
        synthetic: { count: { distribution: 'constant', value: 6 } },
        form: {
          title: 'About this person',
          fields: [{ variable: 'var-pick', prompt: 'Pick one' }],
        },
      },
      // The stage the preview is launched from. The walk completes everything
      // before it, so the generator above is what runs into the conflict —
      // previewing the generator itself would stop on arrival, before a single
      // person had been named, and find nothing to refuse.
      { id: 's2', type: 'Information', label: 'I', title: 'I', items: [] },
    ],
    codebook: {
      node: {
        'node-1': {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            'var-pick': {
              name: 'Pick',
              type: 'categorical',
              component: 'CheckboxGroup',
              options: [
                { label: 'X', value: 'x' },
                { label: 'Y', value: 'y' },
              ],
              validation: { unique: true, minSelected: 1, maxSelected: 1 },
            },
          },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
  });
}

/**
 * A document that never went through the schema. The payload arrives over
 * postMessage carrying whatever the opener sent, and generation refuses a stage
 * with no `synthetic` descriptors rather than inventing defaults for it — so
 * this is what an unparsed protocol reaching the preview actually looks like,
 * and it must land on the generic failure screen rather than the conflict one.
 */
function makeUnbuildableProtocol() {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [
      { id: 'x', type: 'Information', label: 'X', title: 'X', items: [] },
    ],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };
}

function makeConsentRouteProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
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
            { variable: 'screening', prompt: 'Are you eligible?' },
            { variable: 'consent', prompt: 'Do you consent?' },
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
                  attribute: 'consent',
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
          fields: [{ variable: 'name', prompt: 'What is their name?' }],
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
            layout: { layoutVariable: 'layout' },
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
            name: { name: 'Name', type: 'text', component: 'Text' },
            layout: { name: 'Layout', type: 'layout' },
          },
        },
      },
      edge: {},
      ego: {
        variables: {
          screening: {
            name: 'Screening',
            type: 'boolean',
            component: 'Toggle',
          },
          consent: { name: 'Consent', type: 'boolean', component: 'Toggle' },
        },
      },
    },
    assetManifest: {},
  });
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

/** A synthetic preview of `makeUnsatisfiableProtocol`, launched from its
 * second stage so the generator before it actually runs. */
function unsatisfiablePayload(): TestPreviewPayload {
  return makePayload({
    protocol: makeUnsatisfiableProtocol(),
    startStage: 1,
    useSyntheticData: true,
  });
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

  it('runs the stages before the previewed one and leaves it untouched', async () => {
    render(<PreviewHost />);
    const protocol = CurrentProtocolSchema.parse({
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
          form: {
            title: 'About this person',
            fields: [{ variable: 'var-name', prompt: 'Their name?' }],
          },
        },
        {
          id: 's2',
          type: 'OrdinalBin',
          label: 'OB',
          subject: { entity: 'node', type: 'node-1' },
          prompts: [
            {
              id: 'p2',
              text: 'How close?',
              variable: 'var-ord',
              color: 'ord-color-seq-1',
            },
          ],
        },
      ],
      codebook: {
        node: {
          'node-1': {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              'var-name': { name: 'Name', type: 'text', component: 'Text' },
              'var-ord': {
                name: 'Closeness',
                type: 'ordinal',
                component: 'RadioGroup',
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
    });
    postPayload(
      openerStub,
      makePayload({ protocol, startStage: 1, useSyntheticData: true }),
    );

    await screen.findByTestId('shell-mounted');
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
    };
    const nodes = call.payload.session.network.nodes;
    // The name generator ran, so the bin has people to sort…
    expect(nodes.length).toBeGreaterThan(0);
    // …and the researcher arrives at it with every one of them still unplaced,
    // which is the whole point of previewing an interaction-driven interface:
    // pre-binned nodes would leave nothing to drag.
    expect(
      nodes.filter((n) =>
        Object.hasOwn(n[entityAttributesProperty], 'var-ord'),
      ),
    ).toEqual([]);
  });

  it('previews the same network every time it builds the same protocol', async () => {
    const protocol = makeConsentRouteProtocol();
    const networkFor = async () => {
      const view = render(<PreviewHost />);
      postPayload(
        openerStub,
        makePayload({ protocol, startStage: 3, useSyntheticData: true }),
      );
      await screen.findAllByTestId('shell-mounted');
      const call = shellMock.mock.calls.at(-1)?.[0] as {
        payload: InterviewPayload;
      };
      const { network } = call.payload.session;
      view.unmount();
      return network;
    };

    const first = await networkFor();
    // Guards the comparison below against passing on two empty networks.
    expect(first.nodes.length).toBeGreaterThan(0);
    // A fixed seed is what makes a preview a comparison: a researcher looking
    // at a change wants to see the change, not a fresh draw either side of it.
    expect(await networkFor()).toEqual(first);
  });

  it('disables skip routing across a synthetic preview when Respect skip logic is off', async () => {
    const protocol = makeConsentRouteProtocol();

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
    // The consent stage ran, so an answer to it exists — and the walk carried
    // on past a route that answer would have ended, because generation for a
    // preview is strictly sequential.
    expect(
      call.payload.session.network.ego[entityAttributesProperty],
    ).toHaveProperty('consent');
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
  });

  it('preserves routing but force-shows the selected stage when Respect skip logic is on', async () => {
    const protocol = makeConsentRouteProtocol();

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
      call.payload.session.network.ego[entityAttributesProperty],
    ).toHaveProperty('consent');
    expect(call.payload.protocol.stages[1]).toHaveProperty('skipLogic');
    expect(call.initialStageOverrideIndex).toBe(3);
  });

  it('seeds finalized stageMetadata from a FamilyPedigree the walk completed', async () => {
    render(<PreviewHost />);
    // Previewed from the stage AFTER the pedigree: the walk stops on arrival
    // at the stage the researcher asked for, so a pedigree previewed from
    // itself is one the participant has not started — it is the earlier stages
    // that run, and it is their finalized state that has to survive.
    const protocol = CurrentProtocolSchema.parse({
      name: 'T',
      description: '',
      schemaVersion: 8,
      stages: [
        {
          id: 'fp',
          type: 'FamilyPedigree',
          label: 'Family',
          nodeConfig: {
            type: 'family-member',
            nodeLabelVariable: 'name',
            egoVariable: 'isEgo',
            relationshipVariable: 'relationship',
            biologicalSexVariable: 'biologicalSex',
          },
          edgeConfig: {
            type: 'family-edge',
            relationshipTypeVariable: 'relationshipType',
            isActiveVariable: 'isActive',
            isGestationalCarrierVariable: 'isGestationalCarrier',
            gameteRoleVariable: 'gameteRole',
          },
          framing: { mode: 'fixed', value: 'gamete' },
          boundaries: {
            requireGrandparents: 'required',
            requireChildrenContributors: 'off',
          },
          censusPrompt: 'Build your family.',
          nominationPrompts: [
            {
              id: 'condition-prompt',
              text: 'Who has this?',
              variable: 'condition',
            },
          ],
        },
        {
          id: 'after',
          type: 'Information',
          label: 'After',
          title: 'After',
          items: [],
        },
      ],
      codebook: {
        node: {
          'family-member': {
            name: 'Family member',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              name: {
                name: 'name',
                type: 'text',
                component: 'Text',
                validation: { unique: true },
              },
              isEgo: { name: 'isEgo', type: 'boolean' },
              relationship: { name: 'relationship', type: 'text' },
              biologicalSex: {
                name: 'biologicalSex',
                type: 'categorical',
                options: BIOLOGICAL_SEX_OPTIONS,
              },
              condition: { name: 'condition', type: 'boolean' },
            },
          },
        },
        edge: {
          'family-edge': {
            name: 'Family edge',
            color: 'edge-color-seq-1',
            variables: {
              relationshipType: {
                name: 'relationshipType',
                type: 'categorical',
                options: RELATIONSHIP_TYPE_OPTIONS,
              },
              isActive: { name: 'isActive', type: 'boolean' },
              isGestationalCarrier: {
                name: 'isGestationalCarrier',
                type: 'boolean',
              },
              gameteRole: {
                name: 'gameteRole',
                type: 'categorical',
                options: GAMETE_ROLE_OPTIONS,
              },
            },
          },
        },
        ego: {},
      },
      assetManifest: {},
    });
    postPayload(
      openerStub,
      makePayload({ protocol, startStage: 1, useSyntheticData: true }),
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
    postPayload(openerStub, unsatisfiablePayload());

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Person: Pick/)).toBeInTheDocument();
    expect(
      screen.getByText(/only 2 distinct values are possible/i),
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
    postPayload(openerStub, unsatisfiablePayload());

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('drops the rule conflicts when a later rebuild fails for another reason', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, unsatisfiablePayload());
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
    expect(
      screen.queryByText(/only 2 distinct values are possible/i),
    ).toBeNull();
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

    postPayload(openerStub, unsatisfiablePayload());

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only 2 distinct values are possible/i),
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
    postPayload(openerStub, unsatisfiablePayload());
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

    postPayload(openerStub, unsatisfiablePayload());

    expect(
      await screen.findByText(/protocol can't be previewed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only 2 distinct values are possible/i),
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

  /**
   * Issue #1398: the Shell was handed a `noopFinish`, so confirming Finish
   * Interview closed the dialog back onto the identical Finish screen — no
   * completed state, no next action, and Finish repeatable forever.
   *
   * The Shell is mocked in this file, so these drive the contract's `onFinish`
   * directly. What the real dialog does either side of that call (its copy,
   * where focus lands once Base UI tears it down, and that Finish is gone
   * afterwards) is `e2e/specs/preview-finish.spec.ts`.
   */
  describe('finishing the preview', () => {
    const lastShellProps = () =>
      shellMock.mock.calls.at(-1)?.[0] as {
        onFinish: FinishHandler;
        finishConfirmationDescription?: string;
        payload: InterviewPayload;
      };

    async function finishInterview() {
      const { onFinish, payload } = lastShellProps();
      await act(async () => {
        await onFinish(payload.session.id, new AbortController().signal);
      });
      return payload.session.id;
    }

    async function mountFinishedPreview() {
      render(<PreviewHost />);
      postPayload(openerStub, makePayload());
      await screen.findByTestId('shell-mounted');
      return finishInterview();
    }

    it('replaces the interview with a completed state the finish cannot repeat', async () => {
      await mountFinishedPreview();

      expect(
        screen.getByRole('heading', { name: /preview finished/i }),
      ).toBeInTheDocument();
      // The Finish screen and its button live inside the Shell, so unmounting
      // it is what makes a second confirmation unreachable.
      expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
    });

    it('moves focus to the completion heading and describes it with what happened to the responses', async () => {
      await mountFinishedPreview();

      const heading = screen.getByRole('heading', {
        name: /preview finished/i,
      });
      // The Finish button the researcher activated unmounted with the Shell,
      // so without this focus would be left on <body>.
      expect(heading).toHaveFocus();

      // A focused bare heading announces only its own text. The sentence that
      // matters — that nothing was saved — has to reach the accessible
      // description to be spoken with it.
      const describedBy = heading.getAttribute('aria-describedby') ?? '';
      expect(describedBy).not.toBe('');
      expect(document.getElementById(describedBy)).toHaveTextContent(
        /nothing was saved/i,
      );
    });

    it('asks the finish confirmation to state that a preview is never saved', async () => {
      render(<PreviewHost />);
      postPayload(openerStub, makePayload());
      await screen.findByTestId('shell-mounted');

      // Without this the Shell falls back to the participant default
      // ("…satisfied with your responses"), which promises a permanence the
      // preview never had.
      expect(lastShellProps().finishConfirmationDescription).toMatch(
        /nothing is saved/i,
      );
    });

    it('restarts into a fresh session when the researcher starts the preview again', async () => {
      const finishedSessionId = await mountFinishedPreview();
      openerStub.postMessage.mockClear();

      fireEvent.click(
        screen.getByRole('button', { name: /start the preview again/i }),
      );

      // The restart re-runs the handshake rather than reviving the finished
      // run, and shows neither the completed screen nor the spent interview
      // while it waits.
      expect(openerStub.postMessage).toHaveBeenCalledWith(
        { type: 'preview:ready' },
        window.location.origin,
      );
      expect(
        screen.queryByRole('heading', { name: /preview finished/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();

      postPayload(openerStub, makePayload());
      expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
      expect(lastShellProps().payload.session.id).not.toBe(finishedSessionId);
    });

    it('shows the ended-preview screen, not the completed one, once Architect has closed', async () => {
      const { rerender } = render(<PreviewHost />);
      postPayload(openerStub, makePayload());
      await screen.findByTestId('shell-mounted');
      await finishInterview();
      expect(
        screen.getByRole('heading', { name: /preview finished/i }),
      ).toBeInTheDocument();

      Object.defineProperty(window, 'opener', {
        value: null,
        configurable: true,
      });
      rerender(<PreviewHost />);

      // "Start the preview again" needs an opener to hand the payload back, so
      // a completed run must not keep offering it after Architect has gone.
      expect(screen.getByText(/preview has ended/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: /preview finished/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /start the preview again/i }),
      ).not.toBeInTheDocument();
    });
  });
});
