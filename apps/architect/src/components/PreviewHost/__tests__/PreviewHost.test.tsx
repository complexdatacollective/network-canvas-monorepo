import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  getLastAvailableAuthoredStageIndex,
  InterviewI18nProvider,
  type SessionSnapshot,
} from '@codaco/interview';
import {
  DEFAULT_SYNTHETIC_SEED,
  generateNetwork,
} from '@codaco/protocol-utilities';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
  getLocaleMetadata,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';
import { architectProductionLocales } from '~/i18n/locales';
import { ARCHITECT_LOCALE_KEY } from '~/i18n/preference';

import type { PreviewPayload } from '../messages';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

type ShellProps = ComponentProps<typeof import('@codaco/interview').Shell>;

const { shellMock } = vi.hoisted(() => ({
  shellMock: vi.fn<(props: ShellProps) => void>(),
}));
vi.mock('@codaco/interview', async () => {
  const actual =
    await vi.importActual<typeof import('@codaco/interview')>(
      '@codaco/interview',
    );
  return {
    ...actual,
    Shell: (props: ShellProps) => {
      shellMock(props);
      return (
        <div data-testid="shell-mounted">
          <actual.InterviewI18nProvider
            requestedLocale={props.requestedLocales}
            localePreference={props.payload.session.localePreference}
          >
            <span data-testid="shell-finish-description">
              {props.finishConfirmationDescription}
            </span>
          </actual.InterviewI18nProvider>
        </div>
      );
    },
  };
});

vi.mock('~/utils/assetDB', () => ({
  assetDb: { assets: { get: vi.fn() } },
}));

import { PreviewHost } from '../PreviewHost';

function QueuePreviewConfirmation({
  description,
  onConfirm,
}: {
  description: ReactNode;
  onConfirm: () => void;
}) {
  const { confirm } = useDialog();
  return (
    <button
      onClick={() =>
        void confirm({
          title: 'Preview confirmation proof',
          description,
          confirmLabel: 'Confirm preview proof',
          onConfirm,
        })
      }
    >
      Open preview confirmation
    </button>
  );
}

const ENGLISH_ONLY = { defaultLocale: 'en', locales: ['en'] };

function makeProtocol(localization = ENGLISH_ONLY) {
  const text = (value: string) =>
    Object.fromEntries(localization.locales.map((locale) => [locale, value]));
  return {
    name: 'T',
    description: '',
    schemaVersion: 9,
    localization,
    stages: [
      {
        id: 's1',
        type: 'Information',
        label: text('A'),
        title: text('A'),
        items: [],
      },
    ],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };
}

function lastShellProps(): ShellProps {
  const props = shellMock.mock.calls.at(-1)?.[0];
  if (!props) throw new Error('The Shell has not rendered.');
  return props;
}

// A protocol whose validation rules cannot all be satisfied: minLength exceeds
// maxLength, so no value exists and generateNetwork throws
// SyntheticDataConstraintError.
function makeUnsatisfiableProtocol() {
  return {
    name: 'T',
    description: '',
    schemaVersion: 9,
    localization: ENGLISH_ONLY,
    stages: [
      {
        id: 's1',
        type: 'NameGenerator',
        label: { en: 'NG' },
        subject: { entity: 'node', type: 'node-1' },
        prompts: [{ id: 'p1', text: { en: 'Add people' } }],
        behaviours: { minNodes: 1, maxNodes: 1 },
      },
    ],
    codebook: {
      node: {
        'node-1': {
          name: 'Person',
          label: { en: 'Person' },
          variables: {
            'var-code': {
              name: 'Code',
              label: 'Code',
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
    schemaVersion: 9,
    localization: ENGLISH_ONLY,
    stages: [{ id: 'x', type: 'NotAStageType', label: { en: 'X' } }],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };
}

function makeConsentRouteProtocol(): CurrentProtocol {
  return {
    name: 'Consent route',
    description: '',
    schemaVersion: 9,
    localization: ENGLISH_ONLY,
    stages: [
      {
        id: 'consent',
        type: 'EgoForm',
        label: { en: 'Consent' },
        introductionPanel: {
          title: { en: 'Consent' },
          text: { en: 'Review the study information.' },
        },
        form: {
          fields: [
            {
              variable: asEntityAttributeReference('screening'),
              prompt: { en: 'Are you eligible?' },
            },
            {
              variable: asEntityAttributeReference('consent'),
              prompt: { en: 'Do you consent?' },
            },
          ],
        },
      },
      {
        id: 'background',
        type: 'Information',
        label: { en: 'Background' },
        title: { en: 'Background' },
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
        label: { en: 'People' },
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'people-prompt', text: { en: 'Name people' } }],
        behaviours: { minNodes: 4, maxNodes: 4 },
        form: {
          title: { en: 'About this person' },
          fields: [
            {
              variable: asEntityAttributeReference('name'),
              prompt: { en: 'What is their name?' },
            },
          ],
        },
      },
      {
        id: 'support',
        type: 'Sociogram',
        label: { en: 'Exchanges of support' },
        subject: { entity: 'node', type: 'person' },
        background: { concentricCircles: 3 },
        prompts: [
          {
            id: 'support-prompt',
            text: { en: 'Place people' },
            layout: {
              layoutVariable: asEntityAttributeReference('layout'),
            },
          },
        ],
      },
      {
        id: 'following',
        type: 'Information',
        label: { en: 'Following stage' },
        title: { en: 'Following stage' },
        items: [],
      },
    ],
    codebook: {
      node: {
        person: {
          name: 'Person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'Name', label: 'Name', type: 'text' },
            layout: {
              name: 'Layout',
              label: 'Layout',
              type: 'layout',
            },
          },
        },
      },
      edge: {},
      ego: {
        variables: {
          screening: {
            name: 'Screening',
            label: 'Screening',
            type: 'boolean',
          },
          consent: {
            name: 'Consent',
            label: 'Consent',
            type: 'boolean',
          },
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
    const call = lastShellProps();
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
    const call = lastShellProps();
    expect(call.allowStageNavigation).toBe(true);
  });

  it('enables interview development tools in Architect preview', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload());

    await screen.findByTestId('shell-mounted');
    const call = lastShellProps();
    expect(call.flags?.isDevelopment).toBe(true);
  });

  it('initialises currentStep from payload.startStage', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ startStage: 3 }));

    await screen.findByTestId('shell-mounted');
    const call = lastShellProps();
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
    const call = lastShellProps();
    expect(call.initialStageOverrideIndex).toBe(0);
    expect(call.payload.protocol.stages[0]).toHaveProperty('skipLogic');
  });

  it('omits the initial override when skip logic is disabled', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ respectSkipLogic: false }));

    await screen.findByTestId('shell-mounted');
    const call = lastShellProps();
    expect(call.initialStageOverrideIndex).toBeUndefined();
  });

  it('seeds a synthetic network when useSyntheticData is true', async () => {
    render(<PreviewHost />);
    postPayload(openerStub, makePayload({ useSyntheticData: true }));

    await screen.findByTestId('shell-mounted');
    const call = lastShellProps();
    expect(call.currentStep).toBe(0);
  });

  it('leaves the previewed stage partially complete in synthetic data', async () => {
    render(<PreviewHost />);
    const protocol = {
      name: 'T',
      description: '',
      schemaVersion: 9,
      localization: ENGLISH_ONLY,
      stages: [
        {
          id: 's1',
          type: 'NameGenerator',
          label: { en: 'NG' },
          subject: { entity: 'node', type: 'node-1' },
          prompts: [{ id: 'p1', text: { en: 'Add people' } }],
          behaviours: { minNodes: 4, maxNodes: 8 },
        },
        {
          id: 's2',
          type: 'OrdinalBin',
          label: { en: 'OB' },
          subject: { entity: 'node', type: 'node-1' },
          prompts: [
            { id: 'p2', text: { en: 'How close?' }, variable: 'var-ord' },
          ],
        },
      ],
      codebook: {
        node: {
          'node-1': {
            label: { en: 'Person' },
            variables: {
              'var-ord': {
                name: 'Closeness',
                label: 'Closeness',
                type: 'ordinal',
                options: [
                  { label: { en: 'Low' }, value: 1 },
                  { label: { en: 'High' }, value: 2 },
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
    const call = lastShellProps();
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
      const call = lastShellProps();

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
      const call = lastShellProps();

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
      screen.getByText(
        'The minimum exceeds the maximum, so no answer is allowed. Adjust these limits.',
      ),
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
    expect(
      screen.queryByText(
        'The minimum exceeds the maximum, so no answer is allowed. Adjust these limits.',
      ),
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
      screen.getByText(
        'The minimum exceeds the maximum, so no answer is allowed. Adjust these limits.',
      ),
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
      screen.getByText(
        'The minimum exceeds the maximum, so no answer is allowed. Adjust these limits.',
      ),
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

  describe('preview language', () => {
    const ENGLISH_AND_FRENCH = { defaultLocale: 'en', locales: ['en', 'fr'] };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function openPreview(
      protocol: unknown,
      browserLanguages: readonly string[] = ['en-US'],
      startStage = 0,
    ) {
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(browserLanguages);
      render(<PreviewHost />);
      postPayload(openerStub, makePayload({ protocol, startStage }));
      await screen.findByTestId('shell-mounted');
      return screen.getByRole('combobox', { name: 'Preview language' });
    }

    it('lists every language the protocol declares, each named in itself', async () => {
      const control = await openPreview(
        makeProtocol({ defaultLocale: 'en', locales: ['en', 'fr', 'und'] }),
      );

      const options = within(control).getAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual([
        getLocaleMetadata('en').label,
        getLocaleMetadata('fr').label,
        'Unspecified language',
      ]);
      // An unspecified language has no name of its own, so its option keeps
      // the page's language.
      expect(options.map((option) => option.getAttribute('lang'))).toEqual([
        'en',
        'fr',
        null,
      ]);
      expect(control).toBeEnabled();
    });

    it('lists the languages alphabetically by their own names, whatever order the protocol declares them in', async () => {
      const control = await openPreview(
        makeProtocol({ defaultLocale: 'fr', locales: ['fr', 'en', 'de'] }),
      );

      expect(
        within(control)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(
        ['de', 'en', 'fr'].map((locale) => getLocaleMetadata(locale).label),
      );
    });

    it('starts on the language the interview chooses from the browser', async () => {
      const control = await openPreview(makeProtocol(ENGLISH_AND_FRENCH), [
        'fr-CA',
        'en-US',
      ]);

      expect(control).toHaveValue('fr');
      expect(lastShellProps().requestedLocales).toEqual(['fr-CA', 'en-US']);
      expect(lastShellProps().payload.session.localePreference).toBeNull();
    });

    it('names the only language of a single-language protocol without offering a switch', async () => {
      const control = await openPreview(makeProtocol());

      expect(control).toHaveValue('en');
      expect(control).toBeDisabled();
      expect(within(control).getAllByRole('option')).toHaveLength(1);
    });

    it('states the chosen language to the interview ahead of the browser’s, without restarting it', async () => {
      const control = await openPreview(makeProtocol(ENGLISH_AND_FRENCH));
      const { payload } = lastShellProps();

      fireEvent.change(control, { target: { value: 'fr' } });

      expect(control).toHaveValue('fr');
      expect(lastShellProps().requestedLocales).toEqual(['fr', 'en-US']);
      expect(lastShellProps().payload).toBe(payload);
    });

    it('follows the language a language chooser stage states', async () => {
      const control = await openPreview(makeProtocol(ENGLISH_AND_FRENCH));
      const { onProtocolLocaleChange, payload } = lastShellProps();

      await act(() =>
        onProtocolLocaleChange(payload.session.id, {
          locale: 'fr',
          localePreference: 'fr',
        }),
      );

      expect(control).toHaveValue('fr');
    });

    it('re-creates the interview where it is when the toolbar replaces a chooser-stated language', async () => {
      const control = await openPreview(
        makeProtocol(ENGLISH_AND_FRENCH),
        ['en-US'],
        2,
      );
      const { onProtocolLocaleChange, onSync, payload } = lastShellProps();
      await act(() =>
        onProtocolLocaleChange(payload.session.id, {
          locale: 'fr',
          localePreference: 'fr',
        }),
      );
      const synced: SessionSnapshot = {
        ...payload.session,
        promptIndex: 1,
        localePreference: 'fr',
        locale: 'fr',
        network: {
          ...payload.session.network,
          ego: {
            ...payload.session.network.ego,
            [entityAttributesProperty]: { mood: 'calm' },
          },
        },
      };
      await act(() =>
        onSync(payload.session.id, synced, {
          immediate: false,
          unloading: false,
        }),
      );

      fireEvent.change(control, { target: { value: 'en' } });

      const rebuilt = lastShellProps();
      expect(control).toHaveValue('en');
      expect(rebuilt.payload.protocol).toBe(payload.protocol);
      expect(rebuilt.payload.session).toEqual({
        ...synced,
        promptIndex: 0,
        localePreference: null,
        localeOptions: payload.session.localeOptions,
      });
      expect(rebuilt.currentStep).toBe(2);
      expect(rebuilt.requestedLocales).toEqual(['en', 'en-US']);
    });

    it('states an unspecified language through the interview’s own preference', async () => {
      const control = await openPreview(
        makeProtocol({ defaultLocale: 'und', locales: ['und', 'fr'] }),
        ['fr-CA'],
      );
      expect(control).toHaveValue('fr');
      const { payload } = lastShellProps();

      fireEvent.change(control, { target: { value: 'und' } });

      expect(control).toHaveValue('und');
      expect(lastShellProps().payload.session).toEqual({
        ...payload.session,
        promptIndex: 0,
        localePreference: 'und',
      });
      // A requested `und` would set the interview's own wording in English.
      expect(lastShellProps().requestedLocales).toEqual(['fr-CA']);
    });
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
      expect(screen.getByTestId('shell-finish-description')).toHaveTextContent(
        /nothing is saved/i,
      );
    });

    it('asks the interview for the browser’s languages, never Architect’s, and words the preview copy in the interview’s language', async () => {
      const languages = vi
        .spyOn(navigator, 'languages', 'get')
        .mockReturnValue(['es-MX', 'en-US']);
      localStorage.setItem(ARCHITECT_LOCALE_KEY, 'en-GB');
      try {
        render(
          <ArchitectI18nProvider>
            <PreviewHost />
          </ArchitectI18nProvider>,
        );
        postPayload(openerStub, makePayload());
        await screen.findByTestId('shell-mounted');
        const initialPayload = lastShellProps().payload;
        expect(lastShellProps().requestedLocales).toEqual(['es-MX', 'en-US']);
        expect(document.documentElement.lang).toBe('en-GB');
        const description = screen.getByTestId('shell-finish-description');
        expect(description).toHaveTextContent(
          'Esto es una vista previa, así que no se guarda nada. Al finalizar se cierra esta prueba del protocolo, y puedes iniciarla de nuevo después.',
        );

        act(() => {
          localStorage.setItem(ARCHITECT_LOCALE_KEY, 'de');
          window.dispatchEvent(
            new StorageEvent('storage', {
              key: ARCHITECT_LOCALE_KEY,
              newValue: 'de',
            }),
          );
        });

        expect(document.documentElement.lang).toBe('de');
        expect(lastShellProps().requestedLocales).toEqual(['es-MX', 'en-US']);
        expect(lastShellProps().payload).toBe(initialPayload);
        expect(screen.getByTestId('shell-finish-description')).toBe(
          description,
        );
        expect(description).toHaveTextContent(
          'Esto es una vista previa, así que no se guarda nada.',
        );
      } finally {
        languages.mockRestore();
        localStorage.removeItem(ARCHITECT_LOCALE_KEY);
      }
    });

    it('keeps the actual queued preview confirmation subscribed to its independent interface language', async () => {
      const preview = render(<PreviewHost />);
      postPayload(openerStub, makePayload());
      await screen.findByTestId('shell-mounted');
      // Capture the actual production node before a different provider renders
      // it. React elements do not retain the context where they were created.
      const description = lastShellProps().finishConfirmationDescription;
      expect(description).toBeDefined();
      preview.unmount();
      const finish = vi.fn();
      const content = (locale: string) => (
        <AppI18nProvider locale="en-GB" locales={architectProductionLocales}>
          <InterviewI18nProvider requestedLocale={locale}>
            <DialogProvider>
              <QueuePreviewConfirmation
                description={description}
                onConfirm={finish}
              />
            </DialogProvider>
          </InterviewI18nProvider>
        </AppI18nProvider>
      );
      const queued = render(content('en'));
      fireEvent.click(
        screen.getByRole('button', { name: 'Open preview confirmation' }),
      );
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(
        'This is a preview, so nothing is saved.',
      );
      queued.rerender(content('es-MX'));
      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(dialog).toHaveTextContent(
        'Esto es una vista previa, así que no se guarda nada. Al finalizar se cierra esta prueba del protocolo, y puedes iniciarla de nuevo después.',
      );
      expect(document.documentElement.lang).toBe('en-GB');
      queued.rerender(content('en-GB'));
      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(dialog).toHaveTextContent(
        'This is a preview, so nothing is saved. Finishing ends this run of the protocol, and you can start it again afterwards.',
      );
      expect(document.documentElement.lang).toBe('en-GB');
      expect(finish).not.toHaveBeenCalled();
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Confirm preview proof' }),
      );
      await waitFor(() =>
        expect(finish).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal)),
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
