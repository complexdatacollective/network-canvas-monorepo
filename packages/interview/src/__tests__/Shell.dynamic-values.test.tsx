import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';

vi.mock('../interfaces', async () => {
  const { default: Information } =
    await import('../interfaces/Information/Information');
  const { default: FinishSession } =
    await import('../interfaces/FinishSession/FinishSession');
  const { default: EgoForm } = await import('../interfaces/EgoForm/EgoForm');
  return {
    default: (type: string) =>
      type === 'FinishSession'
        ? FinishSession
        : type === 'EgoForm'
          ? EgoForm
          : Information,
  };
});

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('IntersectionObserver', ResizeObserverStub);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A name a participant could type, built to break out of the text it is
 * shown in if it were ever parsed: markdown emphasis, a link, raw HTML and
 * message syntax. It also stands in for any value that must not leak.
 */
const HOSTILE_NAME =
  'LEAK_SENTINEL **bold** [link](https://example.com) <img src=x onerror=alert(1)> {name}';

const GREETING = {
  en: '{name, select, missing {Welcome} other {Welcome, {name}}}',
};

const information = {
  id: 'welcome',
  type: 'Information' as const,
  label: { en: 'Welcome' },
  title: GREETING,
  dynamicValues: {
    name: { path: 'ego.name' },
    caseId: { path: 'interview.caseId' },
  },
  items: [
    {
      id: 'body',
      type: 'text' as const,
      content: {
        en: 'Thanks for **joining**{name, select, missing {.} other {, {name}.}} [Your case]({caseId, select, missing {https://example.com} other {https://example.com/{caseId}}}): {caseId, select, missing {none} other {{caseId}}}',
      },
    },
  ],
};

const finishStage = {
  id: 'finish',
  type: 'FinishSession' as const,
  label: { en: 'Finish' },
  title: { en: 'All done' },
  content: { en: 'Thank you.' },
  finishLabel: { en: 'Finish' },
  finishConfirmation: { en: 'Finish this interview?' },
  finishedNotice: { en: 'This interview is finished.' },
  finishFailed: { en: 'The interview could not be finished.' },
  outcome: 'completed' as const,
};

function makePayload({
  name,
  caseId,
}: {
  name?: string;
  caseId?: string;
}): InterviewPayload {
  return {
    session: {
      id: 'dynamic-values-session',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localeOptions: [getLocaleMetadata('en')],
      ...(caseId !== undefined && { caseId }),
      network: {
        ego: {
          [entityPrimaryKeyProperty]: 'ego',
          [entityAttributesProperty]: name === undefined ? {} : { name },
        },
        nodes: [],
        edges: [],
      },
    },
    protocol: {
      id: 'dynamic-values-protocol',
      hash: 'dynamic-values-hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Dynamic values protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        ego: {
          variables: { name: { name: 'name', label: 'Name', type: 'text' } },
        },
        node: {},
        edge: {},
      },
      assets: [],
      stages: [information, finishStage],
    },
  } as InterviewPayload;
}

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

/** A host that follows the interview's own navigation. */
function Host({
  payload,
  posthogClient,
  disableAnalytics,
}: {
  payload: InterviewPayload;
  posthogClient?: unknown;
  disableAnalytics: boolean;
}) {
  const [step, setStep] = useState(0);
  return (
    <Shell
      payload={payload}
      currentStep={step}
      onStepChange={setStep}
      onSync={() => Promise.resolve()}
      requestedLocales={['en']}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics={disableAnalytics}
      posthogClient={posthogClient as never}
    />
  );
}

function renderShell(
  payload: InterviewPayload,
  analytics: { posthogClient?: unknown; disableAnalytics: boolean } = {
    disableAnalytics: true,
  },
) {
  return render(<Host payload={payload} {...analytics} />, {
    wrapper: WithoutMotion,
  });
}

describe('dynamic values in a stage’s text', () => {
  it('shows the participant’s value, marked out and announced as a dynamic value', async () => {
    renderShell(makePayload({ name: 'Ada', caseId: 'C-17' }));

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName('Welcome, Dynamic value: Ada');
    expect(heading).toHaveTextContent('Welcome, Ada');
    expect(heading.querySelector('[data-dynamic-value]')).not.toBeNull();
    expect(screen.getByText('joining').tagName).toBe('STRONG');
    expect(
      screen.getAllByText('Dynamic value: C-17', { exact: false }),
    ).not.toHaveLength(0);
  });

  it('shows the version for a missing value as ordinary text', async () => {
    renderShell(makePayload({}));

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName('Welcome');
    expect(document.querySelector('[data-dynamic-value]')).toBeNull();
    expect(screen.getByText(/: none$/)).toBeInTheDocument();
  });

  it('never lets a value become markdown, HTML or a link destination', async () => {
    renderShell(
      makePayload({ name: HOSTILE_NAME, caseId: 'x)(javascript:alert(1)' }),
    );

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(`Welcome, ${HOSTILE_NAME}`);
    // The only emphasis and link are the ones the researcher wrote.
    expect(document.querySelectorAll('strong')).toHaveLength(1);
    expect(document.querySelector('img')).toBeNull();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://example.com/');
  });

  it('never sends a value to analytics or the console', async () => {
    const client = {
      capture: vi.fn(),
      register: vi.fn(),
      captureException: vi.fn(),
    };
    const consoleCalls = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );

    renderShell(
      makePayload({ name: HOSTILE_NAME, caseId: 'LEAK_SENTINEL_CASE' }),
      {
        posthogClient: client,
        disableAnalytics: false,
      },
    );
    await screen.findByRole('heading', { level: 1 });
    await userEvent.setup().click(screen.getByTestId('next-button'));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'All done' }),
      ).toBeInTheDocument(),
    );

    expect(client.capture).toHaveBeenCalled();
    const sent = JSON.stringify([
      client.capture.mock.calls,
      client.register.mock.calls,
      client.captureException.mock.calls,
      ...consoleCalls.map((spy) => spy.mock.calls),
    ]);
    expect(sent).not.toContain('LEAK_SENTINEL');
  });

  it('shows a form’s earlier answer in a later question as it is typed', async () => {
    const payload = makePayload({ name: 'Ada' });
    payload.protocol.stages = [
      {
        id: 'about-you',
        type: 'EgoForm',
        label: { en: 'About you' },
        introductionPanel: { title: { en: 'About you' } },
        dynamicValues: { name: { path: 'ego.name' } },
        form: {
          fields: [
            { variable: 'name', prompt: { en: 'What is your name?' } },
            {
              variable: 'age',
              prompt: {
                en: '{name, select, missing {How old are you?} other {How old are you, {name}?}}',
              },
            },
          ],
        },
      },
      finishStage,
    ] as InterviewPayload['protocol']['stages'];
    payload.protocol.codebook.ego = {
      variables: {
        name: { name: 'name', label: 'Name', type: 'text', component: 'Text' },
        age: { name: 'age', label: 'Age', type: 'number', component: 'Number' },
      },
    } as InterviewPayload['protocol']['codebook']['ego'];
    renderShell(payload);

    // The question's accessible name announces the value it shows.
    expect(
      await screen.findByRole('spinbutton', {
        name: 'How old are you, Dynamic value: Ada?',
      }),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    const name = screen.getByRole('textbox', { name: 'What is your name?' });
    await user.clear(name);
    expect(
      await screen.findByRole('spinbutton', { name: 'How old are you?' }),
    ).toBeInTheDocument();
    await user.type(name, 'Grace');
    expect(
      await screen.findByRole('spinbutton', {
        name: 'How old are you, Dynamic value: Grace?',
      }),
    ).toBeInTheDocument();
  });
});
