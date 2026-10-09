import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { getLocaleMetadata } from '@codaco/protocol-validation';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import { ContractProvider } from '../../../contract/context';
import type { FinishHandler, InterviewPayload } from '../../../contract/types';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { ProtocolLocalizationProvider } from '../../../localization/ProtocolLocalizationProvider';
import { store as createStore } from '../../../store/store';
import { SyncFlushProvider } from '../../../store/SyncFlushContext';
import FinishSession from '../FinishSession';

const finishStage = {
  id: 'finish',
  type: 'FinishSession',
  label: { en: 'Finish' },
  title: { en: 'All done' },
  content: { en: 'Thank you for taking part.' },
  finishLabel: { en: 'Finish' },
  finishConfirmation: { en: 'Finish this interview?' },
  finishedNotice: { en: 'This interview is finished.' },
  finishFailed: { en: 'The interview could not be finished.' },
  outcome: 'completed',
} as const;

const payload = {
  session: {
    id: 'finish-analytics-session',
    startTime: '2026-10-07T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-10-07T00:00:00.000Z',
    network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
    localePreference: null,
    locale: null,
    localeOptions: [getLocaleMetadata('en')],
  },
  protocol: {
    id: 'finish-analytics-protocol',
    hash: 'finish-analytics-hash',
    importedAt: '2026-10-07T00:00:00.000Z',
    name: 'Finish analytics protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [
      {
        id: 'one',
        type: 'Information',
        label: { en: 'One' },
        title: { en: 'One' },
        items: [],
      },
      {
        id: 'two',
        type: 'Information',
        label: { en: 'Two' },
        title: { en: 'Two' },
        items: [],
      },
      finishStage,
    ],
  },
} satisfies InterviewPayload;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

function renderFinish(onFinish: FinishHandler) {
  const tracker = { track: vi.fn(), captureException: vi.fn() };
  const store = createStore(payload, {
    onSync: () => Promise.resolve(),
    onProtocolLocaleChange: () => Promise.resolve(),
  });
  render(
    <AnimationProvider disableAnimations reducedMotion="always">
      <InterviewI18nProvider requestedLocale="en">
        <ProtocolLocalizationProvider
          localization={payload.protocol.localization}
          localeOptions={payload.session.localeOptions}
          requestedLocales={['en']}
          localePreference={null}
          recordedLocale={null}
          onLocalePreferenceChange={() => undefined}
          onLocaleRecorded={() => undefined}
        >
          <Provider store={store}>
            <AnalyticsContext.Provider value={tracker}>
              <ContractProvider
                onFinish={onFinish}
                onRequestAsset={() => Promise.resolve('')}
              >
                <SyncFlushProvider flush={() => Promise.resolve(true)}>
                  <DialogProvider>
                    <FinishSession
                      stage={finishStage}
                      getNavigationHelpers={() => ({
                        moveForward: () => undefined,
                        moveBackward: () => undefined,
                      })}
                    />
                  </DialogProvider>
                </SyncFlushProvider>
              </ContractProvider>
            </AnalyticsContext.Provider>
          </Provider>
        </ProtocolLocalizationProvider>
      </InterviewI18nProvider>
    </AnimationProvider>,
  );
  return tracker;
}

const finishedCalls = (tracker: { track: ReturnType<typeof vi.fn> }) =>
  tracker.track.mock.calls.filter(([name]) => name === 'interview_finished');

describe('FinishSession analytics', () => {
  it('reports the interview finished once the host has finished it', async () => {
    const tracker = renderFinish(() => Promise.resolve());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(finishedCalls(tracker)).toEqual([]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(finishedCalls(tracker)).toEqual([
        // Every stage the protocol defines, its finish stage included.
        ['interview_finished', { stage_count: 3 }],
      ]);
    });
  });

  it('reports nothing when the host refuses to finish', async () => {
    const tracker = renderFinish(() =>
      Promise.reject(new Error('the host refused')),
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    expect(
      await within(dialog).findByText(/could not be finished/),
    ).toBeVisible();
    expect(finishedCalls(tracker)).toEqual([]);
  });
});
