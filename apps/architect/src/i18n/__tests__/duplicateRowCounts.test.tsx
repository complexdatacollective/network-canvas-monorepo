import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import AutoFileDrop from '~/components/Form/AutoFileDrop';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');
const imports = vi.hoisted(() => ({
  result: { id: 'authored-resource-id', duplicateCount: 12345 },
  dispatch: vi.fn(),
}));
// The file importer has its own data tests. Keep the real accepted-drop path,
// warning construction, queued dialog, AppMessage, and locale subscription.
vi.mock('~/ducks/hooks', () => ({ useAppDispatch: () => imports.dispatch }));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  imports.dispatch
    .mockReset()
    .mockReturnValue({ unwrap: () => Promise.resolve(imports.result) });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('reformats a queued duplicate-row warning without importing twice or changing the filename', async () => {
  const onDrop = vi.fn();
  render(
    <ArchitectI18nProvider>
      <DialogProvider>
        <AutoFileDrop type="network" onDrop={onDrop} />
      </DialogProvider>
    </ArchitectI18nProvider>,
  );
  const file = new File(['name\nResearch_name'], 'Research_Á.csv', {
    type: 'text/csv',
  });
  fireEvent.drop(screen.getByRole('button', { name: 'Upload file' }), {
    dataTransfer: {
      files: [file],
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      types: ['Files'],
    },
  });
  const dialog = await screen.findByRole('dialog', {
    name: 'Warning: Research_Á.csv contains duplicate rows',
  });
  expect
    .soft(dialog)
    .toHaveTextContent('The file contains 12,345 duplicate rows.');
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
  expect(dialog).toHaveTextContent(
    'El archivo contiene 12.345 filas duplicadas.',
  );
  expect(dialog).toHaveTextContent('Research_Á.csv');
  await waitFor(() =>
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(['authored-resource-id']),
  );
  expect(imports.dispatch).toHaveBeenCalledTimes(1);
  expect(file.name).toBe('Research_Á.csv');
});
