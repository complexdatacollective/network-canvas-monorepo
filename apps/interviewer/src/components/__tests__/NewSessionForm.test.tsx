import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

const openDialog = vi.fn();
const createSession = vi.fn();
const getSettings = vi.fn();
const requireFreshUnlock = vi.fn();
const setAuthorizedInterviewId = vi.fn();
let online = true;

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog, closeDialog: vi.fn(), confirm: vi.fn() }),
}));
vi.mock('~/lib/net/OnlineStatusProvider', () => ({
  useOnline: () => online,
}));
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({ requireFreshUnlock, setAuthorizedInterviewId }),
}));
vi.mock('~/lib/db/api', () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  getSettings: () => getSettings(),
}));
vi.mock('@codaco/interview', () => ({
  createInitialNetwork: () => ({ nodes: [], edges: [], ego: {} }),
}));

import { NewSessionForm } from '../NewSessionForm';

function makeProtocol(stageTypes: string[]): ProtocolWithCounts {
  const stages = stageTypes.map((type, index) => ({
    id: `stage-${index}`,
    type,
    label: type,
  }));
  const protocol = {
    name: 'Test',
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages,
  } as unknown as CurrentProtocol;
  return {
    id: 'test',
    hash: 'hash',
    name: 'Test',
    schemaVersion: 8,
    importedAt: '2026-07-01T00:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

const session: StoredSession = {
  id: 'session-1',
} as unknown as StoredSession;

function Harness({ protocol }: { protocol: ProtocolWithCounts }): ReactNode {
  return (
    <NewSessionForm
      protocol={protocol}
      onCreated={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

describe('NewSessionForm offline warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online = true;
    getSettings.mockResolvedValue({ requireUnlockOnEnter: false });
    createSession.mockResolvedValue(session);
  });

  it('warns before starting an internet-requiring session while offline and creates the session when the researcher proceeds', async () => {
    online = false;
    openDialog.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'choice', intent: 'warning' }),
    );
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
  });

  it('does not create the session when the researcher declines the offline warning', async () => {
    online = false;
    openDialog.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(createSession).not.toHaveBeenCalled();
  });

  it('does not warn when online even for an internet-requiring protocol', async () => {
    online = true;
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('does not warn offline when the protocol does not require internet', async () => {
    online = false;
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['NameGenerator'])} />);

    await user.type(screen.getByLabelText(/Case ID/), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(openDialog).not.toHaveBeenCalled();
  });
});
