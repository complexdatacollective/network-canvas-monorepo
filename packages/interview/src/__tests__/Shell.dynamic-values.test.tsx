import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import {
  asEntityAttributeReference,
  getLocaleMetadata,
} from '@codaco/protocol-validation';
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
  const { useState: useStateMock } = await import('react');
  // An Information stage with a control that makes it throw while it shows
  // its resolved text.
  function Throws(props: ComponentProps<typeof Information>) {
    const [broken, setBroken] = useStateMock(false);
    if (broken) throw new Error('stage failed');
    return (
      <>
        <Information {...props} />
        <button type="button" onClick={() => setBroken(true)}>
          Break the stage
        </button>
      </>
    );
  }
  return {
    default: (type: string) =>
      type === 'FinishSession'
        ? FinishSession
        : type === 'EgoForm'
          ? EgoForm
          : type === 'Throws'
            ? Throws
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

const BODY =
  'Thanks for **joining**{name, select, missing {.} other {, {name}.}} [Your page]({name, select, missing {https://example.com} other {https://example.com/{name}}}): {nickname, select, missing {none} other {{nickname}}}';

const information = {
  id: 'welcome',
  type: 'Information' as const,
  label: { en: 'Welcome' },
  dynamicValues: {
    name: { path: 'ego.name' },
    nickname: { path: 'ego.nickname' },
  },
  content: { en: `# ${GREETING.en}\n\n${BODY}` },
};

const finishStage = {
  id: 'finish',
  type: 'FinishSession' as const,
  mode: 'confirmation' as const,
  label: { en: 'Finish' },
  content: { en: '# All done\n\nThank you.' },
  finishedContent: { en: 'This interview is finished.' },
  finishLabel: { en: 'Finish' },
  finishConfirmation: { en: 'Finish this interview?' },
  finishFailed: { en: 'The interview could not be finished.' },
  outcome: 'completed' as const,
};

function makePayload({
  name,
  nickname,
}: {
  name?: string;
  nickname?: string;
}): InterviewPayload {
  return {
    session: {
      id: 'dynamic-values-session',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localeOptions: [getLocaleMetadata('en')],
      network: {
        ego: {
          [entityPrimaryKeyProperty]: 'ego',
          [entityAttributesProperty]: {
            ...(name !== undefined && { name }),
            ...(nickname !== undefined && { nickname }),
          },
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
          variables: {
            name: { name: 'name', type: 'text' },
            nickname: { name: 'nickname', type: 'text' },
          },
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
  onSync = () => Promise.resolve(),
  onFinish = () => Promise.resolve(),
}: {
  payload: InterviewPayload;
  posthogClient?: unknown;
  disableAnalytics: boolean;
  onSync?: ComponentProps<typeof Shell>['onSync'];
  onFinish?: ComponentProps<typeof Shell>['onFinish'];
}) {
  const [step, setStep] = useState(0);
  return (
    <Shell
      payload={payload}
      currentStep={step}
      onStepChange={setStep}
      onSync={onSync}
      requestedLocales={['en']}
      onFinish={onFinish}
      onRequestAsset={() => Promise.resolve('blob://asset')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics={disableAnalytics}
      posthogClient={posthogClient as never}
    />
  );
}

function renderShell(
  payload: InterviewPayload,
  analytics: Omit<ComponentProps<typeof Host>, 'payload'> = {
    disableAnalytics: true,
  },
) {
  return render(<Host payload={payload} {...analytics} />, {
    wrapper: WithoutMotion,
  });
}

describe('dynamic values in a stage’s text', () => {
  it('shows the participant’s value, marked out and announced as a dynamic value', async () => {
    renderShell(makePayload({ name: 'Ada', nickname: 'C-17' }));

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName('Welcome, Ada');
    expect(heading).toHaveTextContent('Welcome, Ada');
    expect(heading.querySelector('[data-dynamic-value]')).not.toBeNull();
    expect(screen.getByText('joining').tagName).toBe('STRONG');
    expect(screen.getAllByText('C-17', { exact: false })).not.toHaveLength(0);
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
      makePayload({ name: HOSTILE_NAME, nickname: 'x)(javascript:alert(1)' }),
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
      makePayload({ name: HOSTILE_NAME, nickname: 'LEAK_SENTINEL_CASE' }),
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

  it('shows the corrected value when the participant goes back and returns', async () => {
    const payload = makePayload({ name: 'Ada' });
    payload.protocol.stages = [
      {
        id: 'about-you',
        type: 'EgoForm',
        label: { en: 'About you' },
        introductionPanel: { title: { en: 'About you' } },
        form: {
          fields: [
            {
              id: 'field-1',
              variable: 'name',
              prompt: { en: 'What is your name?' },
            },
          ],
        },
      },
      information,
      finishStage,
    ] as InterviewPayload['protocol']['stages'];
    payload.protocol.codebook.ego = {
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
      },
    } as InterviewPayload['protocol']['codebook']['ego'];
    renderShell(payload);

    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'What is your name?' });
    await user.click(screen.getByTestId('next-button'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome, Ada' }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('previous-button'));
    const name = await screen.findByRole('textbox', {
      name: 'What is your name?',
    });
    await user.clear(name);
    await user.type(name, 'Grace');
    await user.click(screen.getByTestId('next-button'));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome, Grace' }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Ada');
  });

  it('never persists or hands on the text a value was shown in', async () => {
    const stored = 'PERSIST_SENTINEL_Q7';
    const synced: unknown[] = [];
    const finished: unknown[] = [];
    renderShell(makePayload({ name: stored }), {
      disableAnalytics: true,
      onSync: (...args) => {
        synced.push(args);
        return Promise.resolve();
      },
      onFinish: (...args) => {
        finished.push(args);
        return Promise.resolve();
      },
    });
    const user = userEvent.setup();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: `Welcome, ${stored}`,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId('next-button'));
    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(synced.length).toBeGreaterThan(0));

    const persisted = JSON.stringify([
      synced,
      finished,
      Object.entries(localStorage),
      Object.entries(sessionStorage),
    ]);
    // The stored attribute is network data and is allowed where it is kept.
    expect(persisted).toContain(stored);
    expect(persisted).not.toContain(`Welcome, ${stored}`);
    expect(persisted).not.toContain(`joining, ${stored}`);
    expect(persisted).not.toContain('Thanks for');
  });

  it('never sends a value to analytics or the console when a stage showing it fails', async () => {
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
    const payload = makePayload({
      name: HOSTILE_NAME,
      nickname: 'LEAK_SENTINEL_CASE',
    });
    payload.protocol.stages = [
      { ...information, type: 'Throws' },
      finishStage,
    ] as InterviewPayload['protocol']['stages'];
    renderShell(payload, { posthogClient: client, disableAnalytics: false });

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('LEAK_SENTINEL');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Break the stage' }));

    await waitFor(() => expect(client.captureException).toHaveBeenCalled());
    expect(
      screen.getByRole('heading', { level: 1, name: 'There was an error' }),
    ).toBeInTheDocument();
    const sent = JSON.stringify([
      client.capture.mock.calls,
      client.register.mock.calls,
      client.captureException.mock.calls.map(([error, properties]) => [
        error instanceof Error
          ? [error.name, error.message, error.stack]
          : error,
        properties,
      ]),
      ...consoleCalls.map((spy) =>
        spy.mock.calls.map((call) =>
          call.map((argument) =>
            argument instanceof Error
              ? [argument.name, argument.message, argument.stack]
              : argument,
          ),
        ),
      ),
    ]);
    expect(sent).toContain('stage failed');
    expect(sent).not.toContain('LEAK_SENTINEL');
  });

  it('shows a form’s earlier answer in a later question as it is typed', async () => {
    const payload = makePayload({ name: 'Ada' });
    payload.protocol.stages = [
      {
        id: 'about-you',
        type: 'EgoForm',
        label: { en: 'About you' },
        dynamicValues: { name: { path: 'ego.name' } },
        introductionPanel: { title: { en: 'About you' } },
        form: {
          fields: [
            {
              id: 'field-1',
              variable: 'name',
              prompt: { en: 'What is your name?' },
            },
            {
              id: 'field-2',
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
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number', component: 'Number' },
      },
    } as InterviewPayload['protocol']['codebook']['ego'];
    renderShell(payload);

    // The question's accessible name announces the value it shows.
    expect(
      await screen.findByRole('spinbutton', {
        name: 'How old are you, Ada?',
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
        name: 'How old are you, Grace?',
      }),
    ).toBeInTheDocument();
  });

  it('keeps a question’s markdown when it shows a value', async () => {
    const payload = makePayload({ name: 'Ada' });
    payload.protocol.stages = [
      {
        id: 'about-you',
        type: 'EgoForm',
        label: { en: 'About you' },
        dynamicValues: { name: { path: 'ego.name' } },
        introductionPanel: { title: { en: 'About you' } },
        form: {
          fields: [
            {
              id: 'field-1',
              variable: 'age',
              prompt: {
                en: '**How old are you**{name, select, missing {?} other {, {name}?}}',
              },
            },
          ],
        },
      },
      finishStage,
    ] as InterviewPayload['protocol']['stages'];
    payload.protocol.codebook.ego = {
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number', component: 'Number' },
      },
    } as InterviewPayload['protocol']['codebook']['ego'];
    renderShell(payload);

    const age = await screen.findByRole('spinbutton', {
      name: 'How old are you, Ada?',
    });
    expect(age).toBeInTheDocument();
    expect(screen.getByText('How old are you').tagName).toBe('STRONG');
    expect(document.body).not.toHaveTextContent('**');
  });

  it('names a question in a validation message as it reads on screen', async () => {
    const payload = makePayload({ name: 'Ada' });
    payload.protocol.stages = [
      {
        id: 'about-you',
        type: 'EgoForm',
        label: { en: 'About you' },
        dynamicValues: { name: { path: 'ego.name' } },
        introductionPanel: { title: { en: 'About you' } },
        form: {
          fields: [
            {
              id: 'field-1',
              variable: 'name',
              prompt: { en: 'What is your name?' },
            },
            {
              id: 'field-2',
              variable: 'age',
              prompt: {
                en: '{name, select, missing {How old are you?} other {How old are you, {name}?}}',
              },
            },
            {
              id: 'field-3',
              variable: 'guess',
              prompt: { en: 'Guess an age' },
            },
          ],
        },
      },
      finishStage,
    ] as InterviewPayload['protocol']['stages'];
    payload.protocol.codebook.ego = {
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number', component: 'Number' },
        guess: {
          name: 'guess',
          type: 'number',
          component: 'Number',
          validation: { differentFrom: asEntityAttributeReference('age') },
        },
      },
    } as InterviewPayload['protocol']['codebook']['ego'];
    renderShell(payload);

    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', {
      name: 'What is your name?',
    });
    await user.clear(name);
    await user.type(name, 'Grace');
    await user.type(
      await screen.findByRole('spinbutton', {
        name: 'How old are you, Grace?',
      }),
      '30',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: /Guess an age/ }),
      '30',
    );
    await user.click(screen.getByTestId('next-button'));

    // The stored name is Ada; the question on screen names Grace.
    expect(
      (
        await screen.findAllByText(
          /Your answer must be different from your answer to 'How old are you, Grace\?'/,
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('keeps a value out of the description a block gives its file', async () => {
    const payload = makePayload({ name: HOSTILE_NAME });
    payload.protocol.assets = [
      { assetId: 'portrait', name: 'Portrait', type: 'image' },
    ] as InterviewPayload['protocol']['assets'];
    payload.protocol.stages = [
      {
        ...information,
        content: {
          en: '# Welcome\n\n![Portrait of {name}](asset:portrait)\n\nBelow the portrait.',
        },
      },
      finishStage,
    ] as InterviewPayload['protocol']['stages'];
    renderShell(payload);

    const image = await screen.findByRole('img');
    // The researcher's words describe the picture; the participant's answer
    // is never part of an attribute.
    expect(image.getAttribute('alt')).toBe('Portrait of');
    expect(document.body.innerHTML).not.toContain('LEAK_SENTINEL');
    expect(screen.getByText('Below the portrait.')).toBeInTheDocument();
  });

  it('shows an option’s label as the text its markdown reads', async () => {
    const payload = makePayload({});
    payload.protocol.stages = [
      {
        ...information,
        dynamicValues: {
          ...information.dynamicValues,
          colour: { path: 'ego.colour' },
        },
        content: {
          en: `# {colour, select, missing {No colour} other {Favourite: {colour}}}\n\n${BODY}`,
        },
      },
      finishStage,
    ] as InterviewPayload['protocol']['stages'];
    payload.protocol.codebook.ego = {
      variables: {
        ...payload.protocol.codebook.ego?.variables,
        colour: {
          name: 'colour',
          type: 'categorical',
          options: [{ label: { en: '**Deep** _red_' }, value: 'red' }],
        },
      },
    } as InterviewPayload['protocol']['codebook']['ego'];
    payload.session.network.ego[entityAttributesProperty] = {
      colour: ['red'],
    };
    renderShell(payload);

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Favourite: Deep red');
  });
});
