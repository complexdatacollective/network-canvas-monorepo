import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';
import type { ProtocolWithCounts } from '~/lib/db/types';

import type { DeckEntry } from '../deckEntries';
import type { LegacyCardActions } from '../DeckSlotCard';
import { ProtocolDeck } from '../ProtocolDeck';

// The real deck and carousel; each card is reduced to a button that runs the
// carousel's activation (navigate to it, or run its action when active).
vi.mock('../DeckSlotCard', () => ({
  DeckSlotCard: ({
    entry,
    isActive,
    activate,
  }: {
    entry: DeckEntry;
    isActive: boolean;
    activate: () => void;
  }) =>
    entry.kind === 'protocol' || entry.kind === 'legacy' ? (
      <button aria-current={isActive ? 'true' : undefined} onClick={activate}>
        {entry.kind === 'legacy' ? 'Schema 8: ' : ''}
        {entry.protocol.name}
      </button>
    ) : null,
}));

const makeProtocol = (name: string): ProtocolWithCounts => ({
  id: name,
  hash: `hash-${name}`,
  name,
  schemaVersion: 9,
  importedAt: '2026-09-05T00:00:00.000Z',
  codebook: {},
  sessionCount: 0,
  protocol: {
    name,
    description: '',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {},
    stages: [],
  },
});

const legacyProtocol: LegacyProtocolSummary = {
  id: 'row',
  hash: 'legacy-hash',
  name: 'Alpha',
  schemaVersion: 8,
  importedAt: '2025-01-01T00:00:00.000Z',
  sessionCount: 0,
};

const makeLegacy = (
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

const noop = () => {};

const renderDeck = (props: Partial<Parameters<typeof ProtocolDeck>[0]> = {}) =>
  render(
    <ProtocolDeck
      protocols={[makeProtocol('Bravo'), makeProtocol('Charlie')]}
      sessions={[]}
      onImportFile={noop}
      onStartInterview={noop}
      onDeleteProtocol={noop}
      legacyProtocols={[legacyProtocol]}
      {...props}
    />,
  );

describe('ProtocolDeck with schema 8 protocols', () => {
  it('starts a schema 8 interview through the legacy actions', async () => {
    const legacy = makeLegacy();
    const onStartInterview = vi.fn();
    renderDeck({ legacy, onStartInterview });

    const card = await screen.findByRole('button', {
      name: 'Schema 8: Alpha',
    });
    await waitFor(() => expect(card).toHaveAttribute('aria-current', 'true'));
    await userEvent.click(card);

    expect(legacy.onStart).toHaveBeenCalledWith(legacyProtocol);
    expect(onStartInterview).not.toHaveBeenCalled();
  });

  it('starts nothing from a schema 8 card when Interviewer 8 is not bundled', async () => {
    const legacy = makeLegacy({ interviewer: null, offline: 'not-bundled' });
    renderDeck({ legacy });

    const card = await screen.findByRole('button', {
      name: 'Schema 8: Alpha',
    });
    await waitFor(() => expect(card).toHaveAttribute('aria-current', 'true'));
    await userEvent.click(card);

    expect(legacy.onStart).not.toHaveBeenCalled();
  });

  it('brings a requested protocol to the front once it is in the deck', async () => {
    const view = renderDeck({ legacy: makeLegacy() });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Schema 8: Alpha' }),
      ).toHaveAttribute('aria-current', 'true'),
    );

    // Asked for before the copy is listed (the reload is still running).
    const focusRequest = { protocolHash: 'hash-Delta' };
    view.rerender(
      <ProtocolDeck
        protocols={[makeProtocol('Bravo'), makeProtocol('Charlie')]}
        sessions={[]}
        onImportFile={noop}
        onStartInterview={noop}
        onDeleteProtocol={noop}
        legacyProtocols={[legacyProtocol]}
        legacy={makeLegacy()}
        focusRequest={focusRequest}
      />,
    );
    view.rerender(
      <ProtocolDeck
        protocols={[
          makeProtocol('Bravo'),
          makeProtocol('Charlie'),
          makeProtocol('Delta'),
        ]}
        sessions={[]}
        onImportFile={noop}
        onStartInterview={noop}
        onDeleteProtocol={noop}
        legacyProtocols={[legacyProtocol]}
        legacy={makeLegacy()}
        focusRequest={focusRequest}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delta' })).toHaveAttribute(
        'aria-current',
        'true',
      ),
    );
  });
});
