import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../../contract/types';
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

const lockedPayload = () =>
  ({
    session: {
      id: 'session-1',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localeOptions: [getLocaleMetadata('en')],
      network: {
        ego: {
          [entityPrimaryKeyProperty]: 'ego-1',
          [entityAttributesProperty]: {},
        },
        nodes: [],
        edges: [],
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
      requestedLocales={[]}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      navigationOrientation="horizontal"
    />,
  );
}

describe('the horizontal navigation bar beside answers that are locked', () => {
  it('offers the passphrase when one can open them', async () => {
    renderHorizontalInterview(lockedPayload());

    expect(
      (
        await screen.findAllByText(
          'Enter your passphrase to see and change them.',
          {
            exact: false,
          },
        )
      )[0],
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Passphrase' }),
    ).toBeInTheDocument();
  });
});
