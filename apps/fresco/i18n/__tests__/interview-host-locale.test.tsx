import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type * as Nuqs from 'nuqs';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { InterviewPayload } from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import InterviewClient from '~/app/(interview)/interview/[interviewId]/InterviewClient';
import ParticipantLayout from '~/app/(interview)/layout';
import { FrescoI18nProvider } from '~/i18n/FrescoI18nProvider';
import LanguageSetting from '~/i18n/LanguageSetting';
import type { FrescoI18nInitialization } from '~/i18n/resolve';

const { shell, updateLocale, refresh } = vi.hoisted(() => ({
  shell: vi.fn(),
  updateLocale: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('~/actions/locale', () => ({ updateLocale }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace: vi.fn() }),
}));
vi.mock('nuqs', async (importOriginal) => ({
  ...(await importOriginal<typeof Nuqs>()),
  useQueryState: () => [0, vi.fn()],
}));
vi.mock('~/app/(interview)/_components/EndSessionRecording', () => ({
  default: () => null,
}));
// This test checks the real Fresco host seam. It does not assert the mocked
// Shell's runtime behavior: real package negotiation and temporary menu choices
// require the separate Shell tests and compiled Fresco browser workflow.
vi.mock('@codaco/interview', () => ({
  Shell: (props: {
    requestedLocale?: string;
    payload: InterviewPayload;
    onLocaleChange?: unknown;
  }) => {
    shell(props);
    return (
      <div
        data-testid="shell-request"
        data-requested-locale={props.requestedLocale}
      >
        <h2>{props.payload.protocol.name}</h2>
        <pre>{JSON.stringify(props.payload.session.network)}</pre>
      </div>
    );
  },
}));

const payload: InterviewPayload = {
  session: {
    id: 'locale-host-interview',
    startTime: '2026-09-06T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-09-06T00:00:00.000Z',
    network: {
      ego: { _uid: 'ego', attributes: { original: 'Ana & <literal>' } },
      nodes: [],
      edges: [],
    },
  },
  protocol: {
    id: 'locale-host-protocol',
    hash: 'original-protocol-hash',
    importedAt: '2026-09-06T00:00:00.000Z',
    name: 'Protocol **authored** name',
    schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [
      {
        id: 'authored',
        type: 'Information',
        label: 'Original stage label',
        title: 'Pregunta original',
        items: [],
      },
    ],
  },
};
const originalPayload = structuredClone(payload);
const spanish: FrescoI18nInitialization = {
  locale: 'es',
  preference: 'es',
  userId: 'alice',
  requested: ['en-GB'],
};

function ParticipantChrome() {
  const intl = useAppIntl();
  return (
    <button type="button">{intl.formatMessage(commonMessages.continue)}</button>
  );
}
function Host({ initial = spanish }: { initial?: FrescoI18nInitialization }) {
  return (
    <FrescoI18nProvider initial={initial}>
      <LanguageSetting />
      <ParticipantLayout>
        <ParticipantChrome />
        <InterviewClient
          payload={payload}
          assetUrls={{}}
          initialStep={0}
          initialSyncRevision={0}
          installationId="test-installation"
          disableAnalytics
        />
      </ParticipantLayout>
    </FrescoI18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateLocale.mockResolvedValue({ success: true });
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: ['en-GB'],
  });
});

describe('Fresco passes its resolved host request to the interview package', () => {
  it('crosses the participant content boundary and follows account or automatic changes without rewriting the payload', async () => {
    const view = render(<Host />);
    expect(screen.getByTestId('shell-request')).toHaveAttribute(
      'data-requested-locale',
      'es',
    );
    expect(
      screen.getByRole('button', { name: 'Continue' }).closest('[lang]'),
    ).toHaveAttribute('lang', 'en');
    expect(shell).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestedLocale: 'es', payload }),
    );
    // Omitting this callback keeps a participant menu choice out of the
    // researcher preference persistence path.
    expect(shell.mock.lastCall?.[0]).not.toHaveProperty('onLocaleChange');
    expect(shell.mock.lastCall?.[0]).not.toHaveProperty('localePreference');
    expect(updateLocale).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Idioma' }), {
      target: { value: '__automatic' },
    });
    expect(screen.getByTestId('shell-request')).toHaveAttribute(
      'data-requested-locale',
      'en-GB',
    );
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith(null, 'alice'),
    );
    expect(
      screen.getByRole('heading', { name: 'Protocol **authored** name' }),
    ).toBeInTheDocument();
    expect(shell).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload }),
    );

    view.rerender(
      <Host
        initial={{
          locale: 'en',
          preference: null,
          userId: 'bob',
          requested: ['en'],
        }}
      />,
    );
    expect(screen.getByTestId('shell-request')).toHaveAttribute(
      'data-requested-locale',
      'en',
    );
    expect(shell).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestedLocale: 'en', payload }),
    );
    expect(updateLocale).toHaveBeenCalledTimes(1);
    expect(payload).toEqual(originalPayload);
  });

  it('hydrates the serialized Spanish request despite a British browser preference', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Host />);
    document.body.append(container);
    expect(container.querySelector('[data-requested-locale]')).toHaveAttribute(
      'data-requested-locale',
      'es',
    );
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, <Host />, { onRecoverableError });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[data-requested-locale]')).toHaveAttribute(
      'data-requested-locale',
      'es',
    );
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(updateLocale).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
