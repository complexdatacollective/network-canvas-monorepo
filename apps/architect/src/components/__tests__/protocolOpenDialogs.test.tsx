import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { ProtocolOpenResult } from '~/ducks/modules/userActions/userActions';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import { showProtocolOpenResultDialog } from '../protocolOpenDialogs';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

const bundled = vi.hoisted(() => ({
  current: null as { version: string; path: '/v8/' } | null,
}));

vi.mock('~/utils/legacyArchitect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/legacyArchitect')>()),
  getBundledLegacyArchitect: () => bundled.current,
}));

const result: ProtocolOpenResult = {
  status: 'migration-required',
  protocolSchemaVersion: 7,
  targetSchemaVersion: 9,
  migrationNotes: [],
};

const approve = vi.fn(async () => {});
const keep = vi.fn(async () => {});

const openWith = async (offerKeep: boolean) => {
  function Launcher() {
    const { openDialog } = useDialog();
    return (
      <button
        onClick={() => {
          void showProtocolOpenResultDialog({
            result,
            openDialog,
            onApproveMigration: approve,
            onKeepLegacy: offerKeep ? keep : undefined,
          });
        }}
      >
        Open protocol
      </button>
    );
  }
  render(
    <ArchitectI18nProvider>
      <DialogProvider>
        <Launcher />
      </DialogProvider>
    </ArchitectI18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open protocol' }));
  return await screen.findByRole('dialog');
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  bundled.current = null;
  approve.mockClear();
  keep.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the migration-required dialog', () => {
  it('offers to keep editing in Architect 8 when it is bundled, leading with the upgrade', async () => {
    bundled.current = { version: '8.5.0', path: '/v8/' };
    const dialog = await openWith(true);

    expect(
      within(dialog).getByRole('heading', {
        name: 'How do you want to open this protocol?',
      }),
    ).toBeVisible();
    // Schema 7 is kept as schema 8: Architect 8 upgrades it itself.
    expect(dialog).toHaveTextContent('schema version 7');
    expect(dialog).toHaveTextContent(
      'You can also keep editing it as a schema 8 protocol in Architect 8',
    );
    const upgrade = within(dialog).getByRole('button', {
      name: 'Upgrade to schema 9',
    });
    await waitFor(() => expect(upgrade).toHaveFocus());

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Keep editing as schema 8' }),
    );

    await waitFor(() => expect(keep).toHaveBeenCalledOnce());
    expect(approve).not.toHaveBeenCalled();
  });

  it('upgrades on the primary action', async () => {
    bundled.current = { version: '8.5.0', path: '/v8/' };
    const dialog = await openWith(true);

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Upgrade to schema 9' }),
    );

    await waitFor(() => expect(approve).toHaveBeenCalledOnce());
    expect(keep).not.toHaveBeenCalled();
  });

  it('offers only the upgrade when Architect 8 is not bundled', async () => {
    const dialog = await openWith(true);

    expect(
      within(dialog).getByRole('heading', { name: 'Upgrade to continue' }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('button', {
        name: 'Keep editing as schema 8',
      }),
    ).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Architect 8');
  });

  it('offers only the upgrade when the caller has nothing to keep', async () => {
    bundled.current = { version: '8.5.0', path: '/v8/' };
    const dialog = await openWith(false);

    expect(
      within(dialog).queryByRole('button', {
        name: 'Keep editing as schema 8',
      }),
    ).not.toBeInTheDocument();
  });

  it('does nothing when cancelled', async () => {
    bundled.current = { version: '8.5.0', path: '/v8/' };
    const dialog = await openWith(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(approve).not.toHaveBeenCalled();
    expect(keep).not.toHaveBeenCalled();
  });
});
