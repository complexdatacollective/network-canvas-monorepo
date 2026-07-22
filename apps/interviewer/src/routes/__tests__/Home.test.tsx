import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts, StoredSessionLite } from '~/lib/db/types';
import { DEFAULT_SETTINGS } from '~/lib/db/types';

const { useHomeDataMock } = vi.hoisted(() => ({
  useHomeDataMock: vi.fn(),
}));

vi.mock('../useHomeData', () => ({
  useHomeData: useHomeDataMock,
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
  useProtocolImport: () => ({
    pendingImports: [],
    startImport: vi.fn(),
  }),
}));

vi.mock('~/lib/pwa/useLaunchedProtocolImport', () => ({
  useLaunchedProtocolImport: vi.fn(),
}));

vi.mock('~/lib/pwa/useLaunchFailureToast', () => ({
  useLaunchFailureToast: vi.fn(),
}));

vi.mock('~/components/BrandHeader', () => ({
  BrandHeader: () => null,
}));

vi.mock('~/components/DataView/DataView', () => ({
  DataView: () => null,
}));

vi.mock('~/components/InstallBanner', () => ({
  InstallBanner: () => null,
}));

type ProtocolDeckMockProps = {
  newSessionProtocolHash?: string | null;
  onStartInterview: (protocolHash: string) => void;
  onCancelNewSession?: () => void;
};

vi.mock('~/components/ProtocolCarousel/ProtocolDeck', () => ({
  ProtocolDeck: ({
    newSessionProtocolHash,
    onStartInterview,
    onCancelNewSession,
  }: ProtocolDeckMockProps) =>
    newSessionProtocolHash ? (
      <button type="button" onClick={onCancelNewSession}>
        Cancel new interview
      </button>
    ) : (
      <button type="button" onClick={() => onStartInterview('protocol-hash')}>
        Start new interview
      </button>
    ),
}));

vi.mock('~/components/ResumePill', () => ({
  ResumePill: () => <div>Resume last interview</div>,
}));

vi.mock('~/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('~/components/StatusRow', () => ({
  StatusRow: () => null,
}));

vi.mock('~/components/TopActionBar', () => ({
  TopActionBar: () => null,
}));

import { HomeRoute } from '../Home';

const protocolDefinition: CurrentProtocol = {
  name: 'Test protocol',
  description: 'A test protocol.',
  schemaVersion: 8,
  codebook: {},
  stages: [],
};

const protocol: ProtocolWithCounts = {
  id: 'protocol-id',
  hash: 'protocol-hash',
  name: protocolDefinition.name,
  description: protocolDefinition.description,
  schemaVersion: protocolDefinition.schemaVersion,
  codebook: protocolDefinition.codebook,
  protocol: protocolDefinition,
  importedAt: '2026-07-17T09:00:00.000Z',
  sessionCount: 1,
};

const resumableSession: StoredSessionLite = {
  id: 'session-id',
  protocolHash: protocol.hash,
  protocolName: protocol.name,
  caseId: 'P01',
  startedAt: '2026-07-17T09:30:00.000Z',
  lastUpdatedAt: '2026-07-17T10:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 1,
  statusKind: 'in-progress',
  progressPercent: 25,
};

describe('HomeRoute resume notification', () => {
  beforeEach(() => {
    useHomeDataMock.mockReturnValue({
      protocols: [protocol],
      sessions: [resumableSession],
      settings: DEFAULT_SETTINGS,
      reload: vi.fn(),
    });
  });

  it('uses compact page insets by default and increases them at laptop width', () => {
    const { container } = render(<HomeRoute />);
    const header = container.querySelector('header');

    expect(header).toHaveClass('px-6', 'pt-4', 'laptop:px-11', 'laptop:pt-9');
    expect(header).not.toHaveClass(
      'pt-6',
      'tablet-landscape:px-11',
      'tablet-landscape:pt-4',
      'tablet-landscape:pt-9',
    );
  });

  it('hides while the case ID form is active and returns when it closes', async () => {
    render(<HomeRoute />);

    expect(screen.getByText('Resume last interview')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Start new interview' }),
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Resume last interview'),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel new interview' }),
    );

    expect(
      await screen.findByText('Resume last interview'),
    ).toBeInTheDocument();
  });
});
