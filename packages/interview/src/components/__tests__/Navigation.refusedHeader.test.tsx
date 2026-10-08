import { act, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEncryptionHeader,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../../contract/types';
import {
  encryptionFor,
  outOfBoundsHeader,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import Shell from '../../Shell';

vi.mock('../../hooks/useMediaQuery', () => ({ default: () => false }));

vi.mock('../../interfaces', async () => {
  const { default: PassphraseNotice } =
    await import('../../interfaces/Anonymisation/PassphraseNotice');
  const LockedInterface = () => <PassphraseNotice status="locked" />;

  return { default: () => LockedInterface };
});

globalThis.BASE_UI_ANIMATIONS_DISABLED = true;

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

const payloadWith = (encryption?: NcEncryptionHeader) =>
  ({
    session: {
      id: 'session-1',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localePreference: null,
      locale: null,
      localeOptions: [getLocaleMetadata('en')],
      network: {
        ego: {
          [entityPrimaryKeyProperty]: 'ego-1',
          [entityAttributesProperty]: {},
        },
        nodes: [],
        edges: [],
        ...(encryption ? { encryption } : {}),
      },
    },
    protocol: {
      id: 'protocol-1',
      hash: 'protocol-hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Locked answers protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: { ego: { variables: {} }, node: {}, edge: {} },
      assets: [],
      stages: [
        {
          id: 'locked-stage',
          type: 'Information',
          label: { en: 'Locked stage' },
          title: { en: 'Locked stage' },
          items: [],
        },
      ],
    },
  }) satisfies InterviewPayload;

function renderHorizontalInterview(payload: InterviewPayload) {
  render(
    <Shell
      payload={payload}
      onSync={() => Promise.resolve()}
      onProtocolLocaleChange={() => Promise.resolve()}
      requestedLocales={[]}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      navigationOrientation="horizontal"
    />,
  );
}

// Lets a passphrase request the stage made reach the navigation bar, so one
// that would only arrive late is not missed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('the horizontal navigation bar beside answers that are locked', () => {
  it('offers the passphrase when one can open them', async () => {
    renderHorizontalInterview(payloadWith());

    expect(
      await screen.findByText('Enter your passphrase to see and change them.', {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Enter your Passphrase' }),
    ).toBeInTheDocument();
  });

  it('offers no passphrase, and says the answers are unavailable, when none can open them', async () => {
    const { header } = await encryptionFor('pw');
    renderHorizontalInterview(payloadWith(outOfBoundsHeader(header)));

    expect(
      await screen.findByText(
        'Answers protected by a passphrase cannot be shown or saved in this interview.',
        { exact: false },
      ),
    ).toBeInTheDocument();
    await settle();

    expect(
      screen.queryByRole('button', { name: 'Enter your Passphrase' }),
    ).not.toBeInTheDocument();
  });
});
