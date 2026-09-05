import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { interviewerProductionLocales } from '~/i18n/locales';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';
import { interviewerCatalogs } from '~/locales/catalogs';

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

  it('refuses to start an interview on a protocol below the runtime schema version', () => {
    // The launch-time migration left this row behind; a session created from
    // it would be refused by the interview route, so no form is offered.
    render(<Harness protocol={{ ...makeProtocol([]), schemaVersion: 7 }} />);

    expect(screen.getByText(/could not be updated/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Case ID/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start interview' }),
    ).not.toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
  });
});

it('uses the chosen administration language for field-owned required validation', async () => {
  const user = userEvent.setup();
  render(
    <AppI18nProvider
      locale="es"
      locales={interviewerProductionLocales}
      messages={interviewerCatalogs.es}
    >
      <Harness protocol={makeProtocol(['Information'])} />
    </AppI18nProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'ID del caso' });
  await user.type(input, 'A');
  await user.clear(input);
  await user.tab();
  expect(
    await screen.findByText('El ID del caso es obligatorio'),
  ).toBeVisible();
  expect(input).toHaveAttribute('aria-invalid', 'true');
});
