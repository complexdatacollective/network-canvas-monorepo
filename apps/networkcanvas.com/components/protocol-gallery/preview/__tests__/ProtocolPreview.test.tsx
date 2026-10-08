import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineAppLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { InterviewPayload } from '@codaco/interview';
import { locales } from '~/lib/i18n/locales';
import { loadLocaleMessages } from '~/lib/i18n/messages';
import { renderWithIntl } from '~/test/renderWithIntl';

import { type CompletionLabels, ProtocolPreview } from '../ProtocolPreview';

type ShellProps = ComponentProps<typeof import('@codaco/interview').Shell>;

const shellProps: ShellProps[] = [];
const lastShellProps = () => {
  const props = shellProps.at(-1);
  if (props === undefined) throw new Error('the Shell was never rendered');
  return props;
};

// The interview's interface languages, as the Shell declares them: its English
// is plain `en`.
const interviewLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'de', label: 'Deutsch', direction: 'ltr' },
  { locale: 'fr', label: 'Français', direction: 'ltr' },
]);
let initialInterviewLocale = 'en';

// Like the Shell, chooses its own interface language, apart from the page's,
// and can change it while it runs.
function MockShell(props: ShellProps) {
  shellProps.push(props);
  const [locale, setLocale] = useState(initialInterviewLocale);
  return (
    <AppI18nProvider
      locale={locale}
      locales={interviewLocales}
      messages={{}}
      manageDocument={false}
    >
      <div data-testid="shell" data-session={props.payload.session.id}>
        <button type="button" onClick={() => setLocale('fr')}>
          Switch the interview to French
        </button>
        <button
          type="button"
          onClick={() =>
            void props.onFinish(
              props.payload.session.id,
              { stageId: 'finish', outcome: 'completed' },
              new AbortController().signal,
            )
          }
        >
          Finish in the Shell
        </button>
        {props.completedActions?.map((action, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <button key={index} type="button" onClick={action.onAction}>
            {action.label}
          </button>
        ))}
      </div>
    </AppI18nProvider>
  );
}

// The Shell's own completed state (the finish stage's text, the notice, and
// the host's actions) is covered by the interview package. Here it stands in
// for the real one, so the test can see whether the gallery keeps it mounted
// and what it offers there.
vi.mock('@codaco/interview', () => ({ Shell: MockShell }));

vi.mock('@codaco/interview/contract', () => ({
  createAssetUrlOwner: () => ({
    closed: false,
    release: () => undefined,
    resolve: () => Promise.resolve(''),
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

let sessions = 0;
vi.mock('~/lib/protocolPreview', () => ({
  installPreviewProtocol: () =>
    Promise.resolve({
      ok: true,
      install: { protocol: {}, assets: new Map(), migrated: false },
    }),
  createPreviewPayload: (): InterviewPayload => {
    sessions += 1;
    return {
      session: { id: `session-${sessions}` },
      protocol: {},
    } as unknown as InterviewPayload;
  },
}));

const BACK_HREF = '/en-US/protocols/example';
const WAVES = [
  {
    wave: 1,
    protocolFilename: 'example.netcanvas',
    protocolPath: '/protocols/example.netcanvas',
  },
];

// As the page loads them: every site language's labels.
const COMPLETION_LABELS = Object.fromEntries(
  locales.map((locale) => {
    const { ProtocolGallery } = loadLocaleMessages(locale) as {
      ProtocolGallery: {
        preview: { restart: string; backToProtocol: string };
      };
    };
    return [
      locale,
      {
        restart: ProtocolGallery.preview.restart,
        backToProtocol: ProtocolGallery.preview.backToProtocol,
      },
    ];
  }),
) as CompletionLabels;

beforeEach(() => {
  initialInterviewLocale = 'en';
  shellProps.length = 0;
  sessions = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3])))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderPreview = async (
  pageLocale?: Parameters<typeof renderWithIntl>[1],
) => {
  renderWithIntl(
    <ProtocolPreview
      waves={WAVES}
      backHref={BACK_HREF}
      completionLabels={COMPLETION_LABELS}
    />,
    pageLocale,
  );
  return screen.findByTestId('shell');
};

const actionNames = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent)
    .filter((name) => !/Shell|Switch/.test(name ?? ''));

describe('<ProtocolPreview />', () => {
  it('keeps the interview on screen once it is finished, so its completed state shows', async () => {
    const shell = await renderPreview();
    expect(shell).toHaveAttribute('data-session', 'session-1');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Finish in the Shell' }),
      );
    });

    expect(screen.getByTestId('shell')).toHaveAttribute(
      'data-session',
      'session-1',
    );
    expect(
      screen.queryByRole('heading', { name: 'Preview finished' }),
    ).toBeNull();
  });

  it('offers starting again, then going back, on the completed state', async () => {
    await renderPreview();

    expect(lastShellProps().completedActions).toHaveLength(2);
    expect(actionNames()).toEqual([
      'Start the preview again',
      'Back to the protocol',
    ]);
  });

  it('labels those actions in the interview’s language, not the page’s', async () => {
    initialInterviewLocale = 'de';
    await renderPreview('fr');

    expect(actionNames()).toEqual([
      'Vorschau neu starten',
      'Zurück zum Protokoll',
    ]);
  });

  it('relabels those actions when the interview changes language', async () => {
    await renderPreview();

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch the interview to French' }),
    );

    expect(actionNames()).toEqual(['Relancer l’aperçu', 'Retour au protocole']);
  });

  it('starts a new interview when the preview is started again', async () => {
    await renderPreview();

    fireEvent.click(
      screen.getByRole('button', { name: 'Start the preview again' }),
    );

    expect(screen.getByTestId('shell')).toHaveAttribute(
      'data-session',
      'session-2',
    );
    expect(lastShellProps().currentStep).toBe(0);
  });

  it('goes back to the protocol', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await renderPreview();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to the protocol' }),
    );

    expect(assign).toHaveBeenCalledWith(BACK_HREF);
  });
});
