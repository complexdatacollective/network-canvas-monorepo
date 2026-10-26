import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { getLocaleMetadata } from '@codaco/protocol-validation';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import { ContractProvider } from '../../../contract/context';
import type { InterviewPayload } from '../../../contract/types';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { ProtocolLocalizationProvider } from '../../../localization/ProtocolLocalizationProvider';
import { store as createStore } from '../../../store/store';
import { SyncFlushProvider } from '../../../store/SyncFlushContext';
import FinishSession from '../FinishSession';

const finishStage = {
  id: 'finish',
  type: 'FinishSession',
  mode: 'automatic',
  label: { en: 'Finish' },
  finishedContent: { en: '# Finished\n\nThank you.' },
  finishLabel: { en: 'Finish' },
  finishConfirmation: { en: 'Are you sure you want to finish the interview?' },
  finishFailed: { en: 'The interview could not be finished.' },
  outcome: 'completed',
} as const;

const payload = {
  session: {
    id: 'finish-automatic-session',
    startTime: '2026-10-07T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-10-07T00:00:00.000Z',
    network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
    localeOptions: [getLocaleMetadata('en')],
  },
  protocol: {
    id: 'finish-automatic-protocol',
    hash: 'finish-automatic-hash',
    importedAt: '2026-10-07T00:00:00.000Z',
    name: 'Automatic finish protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [finishStage],
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

describe('An automatic finish stage', () => {
  it('announces that the interview is being finished, into a live region already in place', async () => {
    const store = createStore(payload, { onSync: () => Promise.resolve() });
    render(
      <AnimationProvider disableAnimations reducedMotion="always">
        <InterviewI18nProvider requestedLocale="en">
          <ProtocolLocalizationProvider
            localization={payload.protocol.localization}
            localeOptions={payload.session.localeOptions}
            requestedLocales={['en']}
            localePreference={null}
            onLocalePreferenceChange={() => undefined}
          >
            <Provider store={store}>
              <AnalyticsContext.Provider
                value={{ track: vi.fn(), captureException: vi.fn() }}
              >
                <ContractProvider
                  // Still finishing for as long as the test looks.
                  onFinish={() => new Promise(() => undefined)}
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

    // The region is on screen, empty, before the words arrive in it.
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');

    await waitFor(() =>
      expect(region).toHaveTextContent('Finishing the interview…'),
    );
  });
});
