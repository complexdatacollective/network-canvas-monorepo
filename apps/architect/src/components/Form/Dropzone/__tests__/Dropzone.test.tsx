import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
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

  it('stays in the tab order while an import is running', async () => {
    // The control disables itself for the duration of an import, and
    // react-dropzone answers a disabled dropzone by omitting `tabIndex`
    // altogether. Taking a FOCUSED control out of the tab order makes the
    // browser drop focus to `<body>` mid-import — which is why dismissing the
    // resulting error dialog left nothing focused, and why Tab afterwards
    // restarted from the top of the page.
    //
    // The tab stop is what this test can measure. jsdom does NOT blur an
    // element when its tabindex is removed, so asserting `document.activeElement`
    // here would pass whether or not the control kept its tab stop — the focus
    // consequence is asserted in a real browser by the `dismissing an import
    // error returns focus to the upload control` e2e spec.
    const onDrop = vi.fn(() => new Promise<void>(() => undefined));
    render(<Dropzone accepts={['.json']} onDrop={onDrop} />);
    const dropzone = screen.getByRole('button', { name: 'Upload file' });
    dropzone.focus();

    dropFile(
      dropzone,
      new File(['{}'], 'data.json', { type: 'application/octet-stream' }),
    );

    await waitFor(() => expect(dropzone).toHaveAttribute('aria-busy', 'true'));
    expect(dropzone).toHaveAttribute('tabindex', '0');
  });

  it('stays in the tab order while disabled', () => {
    // `aria-disabled`, not `disabled`: a control that announces itself as
    // unavailable should still be reachable, so a researcher can find where
    // resources are added and hear why they cannot add one right now.
    render(<Dropzone accepts={['.json']} onDrop={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Upload file' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('hands the control itself to a caller through rootRef', () => {
    // What a dialog raised from `onDrop` names as its focus-return target: a
    // dropped file activates nothing, so there is no opener to go back to.
    const rootRef = createRef<HTMLElement>();
    render(<Dropzone accepts={['.json']} onDrop={vi.fn()} rootRef={rootRef} />);

    expect(rootRef.current).toBe(
      screen.getByRole('button', { name: 'Upload file' }),
    );
  });
});
