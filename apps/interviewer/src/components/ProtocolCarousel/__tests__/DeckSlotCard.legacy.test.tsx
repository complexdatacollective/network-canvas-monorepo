import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';

import { DeckSlotCard, type LegacyCardActions } from '../DeckSlotCard';

vi.mock('../../NewSessionForm', () => ({
  NewSessionForm: () => null,
}));

const protocol: LegacyProtocolSummary = {
  id: 'legacy-row',
  hash: 'legacy-hash',
  name: 'Wave One',
  schemaVersion: 8,
  importedAt: '2025-05-20T10:00:00.000Z',
  description: 'The first wave.',
  sessionCount: 3,
};

const noop = () => {};

const makeActions = (
  overrides: Partial<LegacyCardActions> = {},
): LegacyCardActions => ({
  interviewer: { version: '8.5.0', path: '/v8/' },
  offline: 'ready',
  onStart: vi.fn(),
  onOpenInInterviewer: vi.fn(),
  onUpgrade: vi.fn(),
  onShowInfo: vi.fn(),
  ...overrides,
});

const renderCard = (
  legacy: LegacyCardActions,
  { upgraded = false, activate = noop } = {},
) =>
  render(
    <DeckSlotCard
      entry={{ kind: 'legacy', protocol, upgraded }}
      isActive
      activate={activate}
      sessionCount={protocol.sessionCount}
      onDeleteProtocol={noop}
      onDismissSample={noop}
      onInstallSample={noop}
      onInstallDevelopment={noop}
      legacy={legacy}
    />,
  );

const openMenu = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: 'Actions for Wave One' }),
  );
  return screen.findByRole('menu');
};

describe('DeckSlotCard for a schema 8 protocol', () => {
  it('shows its actual schema and starts its interviews in Interviewer 8', async () => {
    const activate = vi.fn();
    renderCard(makeActions(), { activate });

    expect(screen.getByText('Wave One')).toBeInTheDocument();
    expect(screen.getByText('Schema 8')).toBeInTheDocument();
    expect(screen.queryByText('Has an upgraded copy')).not.toBeInTheDocument();
    expect(screen.queryByText('Not ready offline')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Start new interview' }),
    );
    expect(activate).toHaveBeenCalledTimes(1);
    // Its interviews are Interviewer 8's: the count leads to its data view.
    expect(screen.getByRole('link', { name: '3 interviews' })).toHaveAttribute(
      'href',
      '/v8/data',
    );
  });

  it('offers Open, Upgrade and Info, and never Delete', async () => {
    const legacy = makeActions();
    renderCard(legacy);

    expect(
      screen.queryByRole('button', { name: 'Delete Protocol' }),
    ).not.toBeInTheDocument();
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Open in Interviewer 8', 'Upgrade to schema 9', 'Info']);

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Upgrade to schema 9' }),
    );
    expect(legacy.onUpgrade).toHaveBeenCalledWith(protocol);
  });

  it('says when an upgraded copy exists', () => {
    renderCard(makeActions(), { upgraded: true });
    expect(screen.getByText('Has an upgraded copy')).toBeInTheDocument();
  });

  it('says when Interviewer 8 is not ready offline yet', () => {
    renderCard(makeActions({ offline: 'not-ready' }));
    expect(screen.getByText('Not ready offline')).toBeInTheDocument();
  });

  it('is unavailable, with only Upgrade and Info, when Interviewer 8 is not bundled', async () => {
    renderCard(makeActions({ interviewer: null, offline: 'not-bundled' }));

    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start new interview' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Interviewer 8 is not included in this version/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('3 interviews')).toBeInTheDocument();

    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Upgrade to schema 9', 'Info']);
  });
});
