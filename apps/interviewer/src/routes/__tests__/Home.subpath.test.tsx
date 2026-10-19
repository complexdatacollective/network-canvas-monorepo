import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '~/lib/db/types';

// Home as Interviewer 8 shows it inside Interviewer 9's deploy (a /v8/ build),
// against the same Home at the root.

const mocks = vi.hoisted(() => ({
  isSubpath: true,
  location: '/',
  deckProps: [] as Array<{ showSampleCard?: boolean }>,
  bannerProps: [] as Array<{ inert?: boolean }>,
}));

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return mocks.isSubpath;
  },
}));

vi.mock('../useHomeData', () => ({
  useHomeData: () => ({
    protocols: [],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS, sampleProtocolDismissed: false },
    reload: vi.fn(),
  }),
}));

vi.mock('wouter', () => ({
  useLocation: () => [mocks.location, vi.fn()],
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
// The banner decides for itself whether the build shows it; Home decides
// where it goes.
vi.mock('~/components/Interviewer8Banner', () => ({
  Interviewer8Banner: (props: { inert?: boolean }) => {
    mocks.bannerProps.push(props);
    return null;
  },
}));
vi.mock('~/components/ResumePill', () => ({ ResumePill: () => null }));
vi.mock('~/components/SettingsDialog', () => ({ SettingsDialog: () => null }));
vi.mock('~/components/StatusRow', () => ({ StatusRow: () => null }));
vi.mock('~/components/TopActionBar', () => ({ TopActionBar: () => null }));

vi.mock('~/components/ProtocolCarousel/ProtocolDeck', () => ({
  ProtocolDeck: (props: { showSampleCard?: boolean }) => {
    mocks.deckProps.push(props);
    return null;
  },
}));

import { HomeRoute } from '../Home';

const lastDeckProps = () => mocks.deckProps.at(-1);

beforeEach(() => {
  mocks.isSubpath = true;
  mocks.location = '/';
  mocks.deckProps = [];
  mocks.bannerProps = [];
});

describe('HomeRoute sample protocol card', () => {
  it('is offered at the root while the researcher has not dismissed it', () => {
    mocks.isSubpath = false;
    render(<HomeRoute />);

    expect(lastDeckProps()?.showSampleCard).toBe(true);
  });

  // Interviewer 9 has its own, schema 9 sample.
  it('is never offered by Interviewer 8 inside Interviewer 9', () => {
    render(<HomeRoute />);

    expect(lastDeckProps()?.showSampleCard).toBe(false);
  });
});

describe('HomeRoute Interviewer 8 banner', () => {
  it.each(['/', '/data'])('is placed on the %s view', (location) => {
    mocks.location = location;
    render(<HomeRoute />);

    expect(mocks.bannerProps.at(-1)).toEqual({ inert: false });
  });
});
