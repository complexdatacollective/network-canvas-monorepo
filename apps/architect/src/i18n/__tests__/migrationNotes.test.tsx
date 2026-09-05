import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { getMigrationInfo } from '@codaco/protocol-validation';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import type { ProtocolOpenResult } from '~/ducks/modules/userActions/userActions';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('translates the open migration notes while retaining schema identifiers and approval semantics', async () => {
  const result: ProtocolOpenResult = {
    status: 'migration-required',
    protocolSchemaVersion: 4,
    targetSchemaVersion: 5,
    migrationNotes: getMigrationInfo(4, 5).notes,
  };
  const original = structuredClone(result);
  const approve = vi.fn(async () => {});
  function Launcher() {
    const { openDialog } = useDialog();
    return (
      <button
        onClick={() => {
          void showProtocolOpenResultDialog({
            result,
            openDialog,
            onApproveMigration: approve,
          });
        }}
      >
        Open migration
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
  fireEvent.click(screen.getByRole('button', { name: 'Open migration' }));
  const dialog = await screen.findByRole('dialog');
  const english =
    'Add new validation options for form fields: unique, sameAs, and differentFrom.';
  await waitFor(() => expect(dialog).toHaveTextContent(english));
  expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThan(1);
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: 'es',
      }),
    );
  });
  expect(
    await within(dialog).findByRole('heading', {
      name: 'Actualizar para continuar',
    }),
  ).toBeVisible();
  await waitFor(() =>
    expect(dialog).toHaveTextContent(
      'Añadir nuevas opciones de validación para los campos de formulario: unique, sameAs y differentFrom.',
    ),
  );
  expect(dialog).not.toHaveTextContent(english);
  for (const identifier of ['unique', 'sameAs', 'differentFrom']) {
    expect(
      within(dialog).getByText(identifier, { selector: 'code' }),
    ).toBeVisible();
  }
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(approve).not.toHaveBeenCalled();
  expect(result).toEqual(original);
  fireEvent.click(screen.getByRole('button', { name: 'Open migration' }));
  const reopened = await screen.findByRole('dialog');
  fireEvent.click(
    within(reopened).getByRole('button', { name: 'Crear copia actualizada' }),
  );
  await waitFor(() => expect(approve).toHaveBeenCalledExactlyOnceWith());
  expect(result).toEqual(original);
});
