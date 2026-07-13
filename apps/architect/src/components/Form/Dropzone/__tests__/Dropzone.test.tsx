import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Dropzone from '../Dropzone';

const dropFile = (target: HTMLElement, file: File) =>
  fireEvent.drop(target, {
    dataTransfer: {
      files: [file],
      items: [
        {
          kind: 'file',
          type: file.type,
          getAsFile: () => file,
        },
      ],
      types: ['Files'],
    },
  });

describe('Dropzone', () => {
  it('is a named, focusable upload control', () => {
    render(<Dropzone accepts={['.json']} onDrop={vi.fn()} />);

    const dropzone = screen.getByRole('button', { name: 'Upload file' });
    expect(dropzone).toHaveAttribute('tabindex', '0');
    expect(dropzone).toHaveClass('focusable');
  });

  it('announces rejected file types and links the error to the control', async () => {
    render(<Dropzone accepts={['.json']} onDrop={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: 'Upload file' });

    dropFile(dropzone, new File(['text'], 'notes.txt', { type: 'text/plain' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/does not support \.txt/i);
    expect(dropzone).toHaveAttribute('aria-describedby', alert.id);
  });

  it('exposes busy state and reports import failures', async () => {
    let rejectImport: ((reason: Error) => void) | undefined;
    const onDrop = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectImport = reject;
        }),
    );
    render(<Dropzone accepts={['.json']} onDrop={onDrop} />);
    const dropzone = screen.getByRole('button', { name: 'Upload file' });

    dropFile(
      dropzone,
      new File(['{}'], 'data.json', { type: 'application/octet-stream' }),
    );

    await waitFor(() => expect(onDrop).toHaveBeenCalledOnce());
    expect(dropzone).toHaveAttribute('aria-busy', 'true');
    rejectImport?.(new Error('Import failed'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Import failed');
    expect(dropzone).not.toHaveAttribute('aria-busy');
  });

  it('does not accept files while disabled', () => {
    const onDrop = vi.fn(() => Promise.resolve());
    render(<Dropzone accepts={['.json']} onDrop={onDrop} disabled />);
    const dropzone = screen.getByRole('button', { name: 'Upload file' });

    expect(dropzone).toHaveAttribute('aria-disabled', 'true');
    dropFile(
      dropzone,
      new File(['{}'], 'data.json', { type: 'application/octet-stream' }),
    );
    expect(onDrop).not.toHaveBeenCalled();
  });
});
