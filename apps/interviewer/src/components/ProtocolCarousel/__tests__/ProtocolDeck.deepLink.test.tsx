import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';
import type { ProtocolWithCounts, StoredSessionLite } from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';
import { interviewerCatalogSource } from '~/locales/catalogs';

import type { DeckCarouselHandle } from '../DeckCarousel';
import type { DeckEntry } from '../deckEntries';
import { ProtocolDeck } from '../ProtocolDeck';

const { jumpTo } = vi.hoisted(() => ({ jumpTo: vi.fn() }));

// The real carousel, with its imperative handle observed.
vi.mock('../DeckCarousel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../DeckCarousel')>();
  const { useImperativeHandle, useRef } = await import('react');
  function ObservedDeckCarousel({
    ref,
    ...props
  }: ComponentProps<typeof actual.DeckCarousel>) {
    const inner = useRef<DeckCarouselHandle | null>(null);
    useImperativeHandle(
      ref,
      () => ({
        jumpTo: (index: number) => {
          jumpTo(index);
          inner.current?.jumpTo(index);
        },
      }),
      [],
    );
    return <actual.DeckCarousel ref={inner} {...props} />;
  }
  return { ...actual, DeckCarousel: ObservedDeckCarousel };
});

// The per-card interview-start form is not part of this test.
vi.mock('../DeckSlotCard', () => ({
  DeckSlotCard: ({
    entry,
    isActive,
  }: {
    entry: DeckEntry;
    isActive: boolean;
  }) =>
    entry.kind === 'protocol' ? (
      <button aria-current={isActive ? 'true' : undefined}>
        {entry.protocol.name}
      </button>
    ) : null,
}));

const makeProtocol = (
  name: string,
  importedAt: string,
): ProtocolWithCounts => ({
  id: name,
  hash: name,
  name,
  schemaVersion: 9,
  importedAt,
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

const alpha = makeProtocol('Alpha', '2026-09-01T00:00:00.000Z');
const bravo = makeProtocol('Bravo', '2026-09-02T00:00:00.000Z');
const charlie = makeProtocol('Charlie', '2026-09-03T00:00:00.000Z');
const delta = makeProtocol('Delta', '2026-09-04T00:00:00.000Z');
const sessions: StoredSessionLite[] = [];
const pendingImports: PendingImport[] = [];
const noop = () => {};

function Harness({ protocols }: { protocols: ProtocolWithCounts[] }) {
  return (
    <AppI18nProvider
      locale="en"
      locales={interviewerProductionLocales}
      messages={interviewerCatalogSource.peek('en')}
    >
      <ProtocolDeck
        protocols={protocols}
        sessions={sessions}
        initialProtocolHash="Bravo"
        pendingImports={pendingImports}
        onImportFile={noop}
        onStartInterview={noop}
        onDeleteProtocol={noop}
      />
    </AppI18nProvider>
  );
}

const activeName = () =>
  screen
    .getAllByRole('button', { name: /^(Alpha|Bravo|Charlie|Delta)$/ })
    .find((button) => button.getAttribute('aria-current') === 'true')
    ?.textContent;

describe('ProtocolDeck deep link', () => {
  it('jumps once to the linked protocol when it arrives, and leaves the user’s later choice alone', async () => {
    jumpTo.mockClear();
    const view = render(<Harness protocols={[]} />);
    // The carousel mounts once the section has been measured; the linked
    // protocol is not in the deck yet, so nothing jumps.
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'Protocol deck' }),
      ).toBeTruthy(),
    );
    expect(jumpTo).not.toHaveBeenCalled();

    view.rerender(<Harness protocols={[alpha, bravo, charlie]} />);
    await waitFor(() => expect(activeName()).toBe('Bravo'));
    // The protocols lead the deck (the import card comes last), so Bravo is
    // its second slot.
    expect(jumpTo).toHaveBeenCalledExactlyOnceWith(1);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(activeName()).toBe('Charlie'));

    view.rerender(<Harness protocols={[alpha, bravo, charlie, delta]} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delta' })).toBeTruthy(),
    );
    expect(activeName()).toBe('Charlie');
    expect(jumpTo).toHaveBeenCalledOnce();
  });
});
