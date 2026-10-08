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
import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { InterviewPayload } from '@codaco/interview';
import { loadInterviewCatalog } from '@codaco/interview/catalog';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import InterviewClient from '~/app/(interview)/interview/[interviewId]/InterviewClient';
import ParticipantLayout from '~/app/(interview)/layout';
import { FrescoI18nProvider } from '~/i18n/FrescoI18nProvider';
import FrescoLocaleSwitcher from '~/i18n/FrescoLocaleSwitcher';
import type { FrescoI18nInitialization } from '~/i18n/resolve';
import { frescoCatalogSource } from '~/src/locales/catalogs';

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
// The layout also exports its page metadata, which reads the request on the
// server; none of that runs when the layout renders.
vi.mock('~/i18n/server', () => ({ getServerIntl: vi.fn() }));
vi.mock('~/app/(interview)/_components/EndSessionRecording', () => ({
  default: () => null,
}));
// This test checks the real Fresco host seam. It does not assert the mocked
// Shell's runtime behavior: protocol language negotiation belongs to the
// package's own Shell tests.
vi.mock('@codaco/interview', () => ({
  Shell: (props: {
    requestedLocales: readonly string[];
    payload: InterviewPayload;
    onProtocolLocaleChange: unknown;
  }) => {
    shell(props);
    return (
      <div
        data-testid="shell-request"
        data-requested-locales={props.requestedLocales.join(' ')}
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
    localePreference: null,
    locale: null,
    localeOptions: [
      { locale: 'en', label: 'English', direction: 'ltr' },
      { locale: 'fr-CA', label: 'français (Canada)', direction: 'ltr' },
    ],
  },
  protocol: {
    id: 'locale-host-protocol',
    hash: 'original-protocol-hash',
    importedAt: '2026-09-06T00:00:00.000Z',
    name: 'Protocol **authored** name',
    schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    localization: { defaultLocale: 'en', locales: ['en', 'fr-CA'] },
    assets: [],
    stages: [
      {
        id: 'authored',
        type: 'Information',
        label: { 'en': 'Original stage label', 'fr-CA': 'Étape originale' },
        title: { 'en': 'Original question', 'fr-CA': 'Question originale' },
        items: [],
      },
    ],
  },
};
const originalPayload = structuredClone(payload);
// The catalogs the root layout delivers with each request below, and British
// English loaded up front for the switch to Automatic.
const en = await frescoCatalogSource.load('en');
const es = await frescoCatalogSource.load('es');
await frescoCatalogSource.load('en-GB');
// What the interview page loads on the server for a Spanish request.
const interviewCatalog = await loadInterviewCatalog('es');

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
// What the page negotiated from the request's Accept-Language header.
const serializedRequest = ['fr-CA', 'en'];

function Host({
  initial = spanish,
  messages = es,
}: {
  initial?: FrescoI18nInitialization;
  messages?: CatalogMessages;
}) {
  return (
    <FrescoI18nProvider initial={initial} messages={messages}>
      <FrescoLocaleSwitcher />
      <ParticipantLayout>
        <ParticipantChrome />
        <InterviewClient
          payload={payload}
          assetUrls={{}}
          initialStep={0}
          initialSyncRevision={0}
          requestedLocales={serializedRequest}
          installationId="test-installation"
          disableAnalytics
          catalog={interviewCatalog}
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

describe('Fresco hands the interview the request’s languages, never its own', () => {
  it('passes the serialized request through unchanged by the Fresco interface language or the browser', async () => {
    const view = render(<Host />);
    expect(screen.getByTestId('shell-request')).toHaveAttribute(
      'data-requested-locales',
      'fr-CA en',
    );
    // Participant chrome outside the interview follows the Fresco language;
    // the wrapper declares none of its own.
    expect(
      screen
        .getByRole('button', { name: 'Continuar' })
        .closest('[data-theme-interview]'),
    ).not.toHaveAttribute('lang');
    expect(shell).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestedLocales: serializedRequest,
        catalog: interviewCatalog,
        payload,
        onProtocolLocaleChange: expect.any(Function),
      }),
    );
    const props = shell.mock.lastCall?.[0];
    expect(props).not.toHaveProperty('requestedLocale');
    expect(props).not.toHaveProperty('onLocaleChange');
    expect(props).not.toHaveProperty('localePreference');
    expect(props).not.toHaveProperty('allowLanguageSelection');

    fireEvent.click(
      screen.getByRole('combobox', { name: /^Idioma de la interfaz/ }),
    );
    fireEvent.click(await screen.findByRole('option', { name: /^Automático/ }));
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith(null, 'alice'),
    );
    expect(screen.getByTestId('shell-request')).toHaveAttribute(
      'data-requested-locales',
      'fr-CA en',
    );
    expect(
      screen.getByRole('heading', { name: 'Protocol **authored** name' }),
    ).toBeInTheDocument();

    view.rerender(
      <Host
        initial={{
          locale: 'en',
          preference: null,
          userId: 'bob',
          requested: ['en'],
        }}
        messages={en}
      />,
    );
    expect(screen.getByTestId('shell-request')).toHaveAttribute(
      'data-requested-locales',
      'fr-CA en',
    );
    expect(shell).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestedLocales: serializedRequest, payload }),
    );
    expect(updateLocale).toHaveBeenCalledTimes(1);
    expect(payload).toEqual(originalPayload);
  });

  it('hydrates the serialized request despite different browser languages', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Host />);
    document.body.append(container);
    expect(container.querySelector('[data-requested-locales]')).toHaveAttribute(
      'data-requested-locales',
      'fr-CA en',
    );
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, <Host />, { onRecoverableError });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[data-requested-locales]')).toHaveAttribute(
      'data-requested-locales',
      'fr-CA en',
    );
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(updateLocale).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
