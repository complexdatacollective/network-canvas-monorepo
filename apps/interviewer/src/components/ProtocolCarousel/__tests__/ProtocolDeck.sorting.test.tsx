import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';
import type { ProtocolWithCounts, StoredSessionLite } from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';
import { interviewerCatalogs } from '~/locales/catalogs';

import type { DeckEntry } from '../deckEntries';
import { ProtocolDeck } from '../ProtocolDeck';

// Keep the real deck/carousel, keyed selection and memo dependencies. The
// per-card interview-start form is not part of this read-only ordering test.
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
    entry.kind === 'protocol' ? (
      <button aria-current={isActive ? 'true' : undefined} onClick={activate}>
        {entry.protocol.name}
      </button>
    ) : null,
}));

const protocols: ProtocolWithCounts[] = ['Ñandú', 'Nube'].map((name) => ({
  id: name,
  hash: name,
  name,
  schemaVersion: 8,
  importedAt: '2026-09-05T00:00:00.000Z',
  codebook: {},
  sessionCount: 0,
  protocol: {
    name,
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  },
}));
const sessions: StoredSessionLite[] = [];
const pendingImports: PendingImport[] = [];
const noop = () => {};

describe('ProtocolDeck active-locale sorting', () => {
  it('reorders the actual carousel on locale change while preserving the active protocol identity', async () => {
    const user = userEvent.setup();
    const start = vi.fn();
    function Harness({ locale }: { locale: 'en' | 'es' }) {
      return (
        <AppI18nProvider
          locale={locale}
          locales={interviewerProductionLocales}
          messages={interviewerCatalogs[locale]}
        >
          <ProtocolDeck
            protocols={protocols}
            sessions={sessions}
            pendingImports={pendingImports}
            onImportFile={noop}
            onStartInterview={start}
            onDeleteProtocol={noop}
          />
        </AppI18nProvider>
      );
    }
    const view = render(<Harness locale="en" />);
    const names = () =>
      screen
        .getAllByRole('button', { name: /^(Ñandú|Nube)$/ })
        .map((button) => button.textContent);
    await waitFor(() => expect(names()).toEqual(['Ñandú', 'Nube']));
    expect(screen.getByRole('button', { name: 'Ñandú' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    view.rerender(<Harness locale="es" />);
    await waitFor(() => expect(names()).toEqual(['Nube', 'Ñandú']));
    expect(screen.getByRole('button', { name: 'Ñandú' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Ñandú' }));
    expect(start).toHaveBeenCalledExactlyOnceWith('Ñandú');
    view.rerender(<Harness locale="en" />);
    await waitFor(() => expect(names()).toEqual(['Ñandú', 'Nube']));
  });
});
