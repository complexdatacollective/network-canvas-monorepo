import { cleanup, render } from '@testing-library/react';
import type * as Nuqs from 'nuqs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  InterviewPayload,
  ProtocolLocaleChangeHandler,
  SyncHandler,
} from '@codaco/interview';
import { createInitialNetwork } from '@codaco/interview/contract';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';

import InterviewClient from '../InterviewClient';
import type { InterviewView } from '../mapInterviewPayload';

type ShellHandlers = {
  onSync: SyncHandler;
  onProtocolLocaleChange: ProtocolLocaleChangeHandler;
  openFinishedAsActive?: boolean;
};

const { shell } = vi.hoisted(() => ({ shell: vi.fn() }));
vi.mock('nuqs', async (importOriginal) => ({
  ...(await importOriginal<typeof Nuqs>()),
  useQueryState: () => [0, vi.fn()],
}));
// The handlers the client hands the Shell are what this test checks, so the
// Shell only records them.
vi.mock('@codaco/interview', () => ({
  Shell: (props: ShellHandlers) => {
    shell(props);
    return null;
  },
}));

const payload: InterviewPayload = {
  session: {
    id: 'finished-interview',
    startTime: '2026-10-01T00:00:00.000Z',
    finishTime: '2026-10-02T00:00:00.000Z',
    finishStageId: 'finish',
    exportTime: null,
    lastUpdated: '2026-10-02T00:00:00.000Z',
    network: createInitialNetwork(),
    localePreference: null,
    locale: 'en',
    localeOptions: [{ locale: 'en', label: 'English', direction: 'ltr' }],
  },
  protocol: {
    id: 'protocol-1',
    hash: 'protocol-hash',
    importedAt: '2026-10-01T00:00:00.000Z',
    name: 'Protocol',
    schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    codebook: { node: {}, edge: {} },
    localization: { defaultLocale: 'en', locales: ['en'] },
    assets: [],
    stages: [],
  },
};

function renderClient(view: InterviewView): ShellHandlers {
  render(
    <InterviewClient
      payload={payload}
      assetUrls={{}}
      initialStep={0}
      initialSyncRevision={0}
      requestedLocales={['en']}
      installationId="test-installation"
      disableAnalytics
      view={view}
    />,
  );
  const props = shell.mock.lastCall?.[0] as ShellHandlers | undefined;
  if (!props) throw new Error('The Shell was not rendered');
  return props;
}

/** Ask the Shell's handlers for one write each, as a store change would. */
async function writeThrough({ onSync, onProtocolLocaleChange }: ShellHandlers) {
  await onSync(
    payload.session.id,
    {
      id: payload.session.id,
      startTime: payload.session.startTime,
      finishTime: payload.session.finishTime,
      exportTime: payload.session.exportTime,
      lastUpdated: payload.session.lastUpdated,
      network: payload.session.network,
      localePreference: null,
      locale: 'en',
    },
    { immediate: true, unloading: false },
  );
  await onProtocolLocaleChange(payload.session.id, {
    locale: 'fr',
    localePreference: 'fr',
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  shell.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ success: true, applied: true, syncRevision: 1 }),
        { status: 200 },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('InterviewClient', () => {
  it('never writes from the completed view, whose network is empty', async () => {
    // A sync from this view would replace the stored network with the empty
    // one the reduced payload carries.
    const handlers = renderClient('completed');

    await writeThrough(handlers);

    expect(handlers.openFinishedAsActive).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<{ view: InterviewView; openFinishedAsActive: boolean }>([
    { view: 'active', openFinishedAsActive: false },
    { view: 'editable-finished', openFinishedAsActive: true },
  ])(
    'writes sync and language changes through for the $view view',
    async ({ view, openFinishedAsActive }) => {
      const handlers = renderClient(view);

      await writeThrough(handlers);

      expect(handlers.openFinishedAsActive).toBe(openFinishedAsActive);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        `/interview/${payload.session.id}/sync`,
        `/interview/${payload.session.id}/locale`,
      ]);
    },
  );
});
