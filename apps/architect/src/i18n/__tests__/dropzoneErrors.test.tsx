import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Dropzone from '~/components/Form/Dropzone/Dropzone';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  { name: 'library rejection', type: 'text/plain' },
  { name: 'additional extension validation', type: 'application/octet-stream' },
])(
  'reformats the stored $name with the current locale and preserves import refusal',
  async ({ type }) => {
    const onDrop = vi.fn(() => Promise.resolve());
    const accepts = ['.json', '.csv', '.geojson'];
    render(
      <ArchitectI18nProvider>
        <Dropzone accepts={accepts} onDrop={onDrop} />
      </ArchitectI18nProvider>,
    );
    const file = new File(['Authored content'], 'Research_Á.txt', { type });
    const control = screen.getByRole('button', { name: 'Upload file' });
    fireEvent.drop(control, {
      dataTransfer: {
        files: [file],
        items: [{ kind: 'file', type, getAsFile: () => file }],
        types: ['Files'],
      },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'This resource type does not support these extensions: .txt. Supported extensions: .json, .csv, and .geojson.',
    );
    expect(control).toHaveAttribute('aria-describedby', alert.id);
    expect(onDrop).not.toHaveBeenCalled();
    act(() => {
      localStorage.setItem(ARCHITECT_LOCALE_KEY, 'es');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ARCHITECT_LOCALE_KEY,
          newValue: 'es',
        }),
      );
    });
    expect(alert).toHaveTextContent(
      'Este tipo de recurso no admite estas extensiones: .txt. Extensiones admitidas: .json, .csv y .geojson.',
    );
    expect(control).toHaveAccessibleName('Subir archivo');
    expect(control).toHaveAttribute('aria-describedby', alert.id);
    expect(onDrop).not.toHaveBeenCalled();
    expect(file.name).toBe('Research_Á.txt');
    expect(accepts).toEqual(['.json', '.csv', '.geojson']);

    // A subsequent supported file still follows the normal import path.
    const acceptedFile = new File(['{}'], 'Research_Á.json', {
      type: 'application/octet-stream',
    });
    fireEvent.drop(control, {
      dataTransfer: {
        files: [acceptedFile],
        items: [
          {
            kind: 'file',
            type: acceptedFile.type,
            getAsFile: () => acceptedFile,
          },
        ],
        types: ['Files'],
      },
    });
    await waitFor(() =>
      expect(onDrop).toHaveBeenCalledExactlyOnceWith([acceptedFile]),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  },
);
