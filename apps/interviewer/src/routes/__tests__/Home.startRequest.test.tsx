import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '~/lib/db/types';

// `?start=<protocolHash>` on Home: Interviewer 9 opens a schema 8 protocol's
// new-interview form here that way. It is an entry point of every build.

type DeckProps = {
  initialProtocolHash?: string;
  newSessionProtocolHash: string | null;
};

const mocks = vi.hoisted(() => ({
  deckProps: [] as DeckProps[],
  startRequest: null as string | null,
  takeStartRequest: vi.fn<() => string | null>(),
}));

vi.mock('~/lib/urlLaunchRequest', () => ({
  peekUrlStartRequest: () => mocks.startRequest,
  takeUrlStartRequest: () => mocks.takeStartRequest(),
}));

vi.mock('../useHomeData', () => ({
  useHomeData: () => ({
    protocols: [
      { hash: 'older', name: 'Older', importedAt: '2026-01-01T00:00:00.000Z' },
      {
        hash: 'newest',
        name: 'Newest',
        importedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    sessions: [],
    settings: DEFAULT_SETTINGS,
    reload: vi.fn(),
  }),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: vi.fn() }),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

vi.mock('~/lib/db/api', () => ({
  deleteProtocol: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('~/lib/protocol/useProtocolImport', () => ({
  useProtocolImport: () => ({ pendingImports: [], startImport: vi.fn() }),
}));

vi.mock('~/lib/pwa/useLaunchedProtocolImport', () => ({
  useLaunchedProtocolImport: vi.fn(),
}));

vi.mock('~/lib/pwa/useLaunchFailureToast', () => ({
  useLaunchFailureToast: vi.fn(),
}));

vi.mock('~/components/BrandHeader', () => ({ BrandHeader: () => null }));
vi.mock('~/components/DataView/DataView', () => ({ DataView: () => null }));
vi.mock('~/components/InstallBanner', () => ({ InstallBanner: () => null }));
vi.mock('~/components/ResumePill', () => ({ ResumePill: () => null }));
vi.mock('~/components/SettingsDialog', () => ({ SettingsDialog: () => null }));
vi.mock('~/components/StatusRow', () => ({ StatusRow: () => null }));
vi.mock('~/components/TopActionBar', () => ({ TopActionBar: () => null }));

vi.mock('~/components/ProtocolCarousel/ProtocolDeck', () => ({
  ProtocolDeck: (props: DeckProps) => {
    mocks.deckProps.push(props);
    return null;
  },
}));

import { HomeRoute } from '../Home';

beforeEach(() => {
  mocks.deckProps = [];
  mocks.startRequest = null;
  mocks.takeStartRequest.mockImplementation(() => {
    const hash = mocks.startRequest;
    mocks.startRequest = null;
    return hash;
  });
});

describe('HomeRoute ?start= request', () => {
  it('opens the new-interview form for the named protocol, placing the deck on it first', () => {
    mocks.startRequest = 'older';

    render(<HomeRoute />);

    expect(mocks.deckProps[0]?.initialProtocolHash).toBe('older');
    expect(mocks.deckProps.at(-1)).toMatchObject({
      initialProtocolHash: 'older',
      newSessionProtocolHash: 'older',
    });
    expect(mocks.takeStartRequest).toHaveBeenCalled();
  });

  it('ignores a protocol this device does not have, and does not ask again', () => {
    mocks.startRequest = 'unknown';

    const { rerender } = render(<HomeRoute />);
    rerender(<HomeRoute />);

    expect(mocks.deckProps.at(-1)).toMatchObject({
      initialProtocolHash: 'newest',
      newSessionProtocolHash: null,
    });
    expect(mocks.startRequest).toBeNull();
  });

  it('opens nothing without a request', () => {
    render(<HomeRoute />);

    expect(mocks.deckProps.at(-1)).toMatchObject({
      initialProtocolHash: 'newest',
      newSessionProtocolHash: null,
    });
  });
});
