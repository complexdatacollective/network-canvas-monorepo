import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pickProtocolFile } from '../pickFile';

describe('pickProtocolFile (browser input)', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = document.createElement('input');
    vi.spyOn(input, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue(input);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not constrain accept to application/zip (breaks iOS Files picker)', async () => {
    const pending = pickProtocolFile();
    // accept must not force the zip mime; either empty or extension-only is fine.
    expect(input.accept).not.toContain('application/zip');
    // Resolve the pending promise so it doesn't leak.
    input.oncancel?.(new Event('cancel'));
    await pending;
  });

  it('resolves to the selected file', async () => {
    const file = new File([new Uint8Array()], 'study.netcanvas');
    const pending = pickProtocolFile();
    Object.defineProperty(input, 'files', { value: [file], writable: true });
    input.onchange?.(new Event('change'));
    await expect(pending).resolves.toEqual({
      name: 'study.netcanvas',
      file,
    });
  });

  it('resolves null on cancel', async () => {
    const pending = pickProtocolFile();
    input.oncancel?.(new Event('cancel'));
    await expect(pending).resolves.toBeNull();
  });

  // Safari (notably installed/standalone PWAs) can suspend or GC a file input
  // that is not in the document while the system picker is open, so change/
  // cancel never fire (#886).
  it('is attached to the document when clicked, and detached after selection', async () => {
    let connectedAtClick = false;
    vi.spyOn(input, 'click').mockImplementation(() => {
      connectedAtClick = input.isConnected;
    });
    const file = new File([new Uint8Array()], 'study.netcanvas');
    const pending = pickProtocolFile();
    expect(connectedAtClick).toBe(true);
    Object.defineProperty(input, 'files', { value: [file], writable: true });
    input.onchange?.(new Event('change'));
    await pending;
    expect(input.isConnected).toBe(false);
  });

  it('detaches from the document after cancel', async () => {
    const pending = pickProtocolFile();
    input.oncancel?.(new Event('cancel'));
    await pending;
    expect(input.isConnected).toBe(false);
  });
});
