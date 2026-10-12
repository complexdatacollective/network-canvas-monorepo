import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openDroppedFileFlow, openRejectedDropFlow } from '../fileActions';
import { FileDropzone } from '../FileDropzone';

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({}),
}));

vi.mock('../fileActions', () => ({
  openDroppedFileFlow: vi.fn(),
  openRejectedDropFlow: vi.fn(),
}));

const openDroppedMock = vi.mocked(openDroppedFileFlow);
const openRejectedMock = vi.mocked(openRejectedDropFlow);

const svg = (name: string) =>
  new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], name, {
    type: 'image/svg+xml',
  });

// React only acts on `act`-wrapped updates in a test environment.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

// Drives the real react-dropzone through a drop event, so the assertions
// cover how the library splits a drop into accepted and rejected files.
async function drop(files: File[]) {
  const target = container.querySelector(
    '[data-testid="canvas"]',
  )?.parentElement;
  if (!target) throw new Error('dropzone root not found');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      items: files.map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    },
  });
  await act(async () => {
    target.dispatchEvent(event);
    // react-dropzone resolves the dropped files asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  openDroppedMock.mockReset();
  openRejectedMock.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <FileDropzone>
        <div data-testid="canvas" />
      </FileDropzone>,
    );
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('<FileDropzone />', () => {
  it('opens a single dropped SVG', async () => {
    const file = svg('background.svg');
    await drop([file]);

    expect(openDroppedMock).toHaveBeenCalledTimes(1);
    expect(openDroppedMock.mock.calls[0]?.[1]).toBe(file);
    expect(openRejectedMock).not.toHaveBeenCalled();
  });

  it('opens nothing and explains a drop of several SVGs', async () => {
    await drop([svg('first.svg'), svg('second.svg')]);

    expect(openRejectedMock).toHaveBeenCalledWith(
      expect.anything(),
      'too-many-files',
    );
    expect(openDroppedMock).not.toHaveBeenCalled();
  });

  it('explains a drop of a file that is not an SVG', async () => {
    await drop([new File(['x'], 'photo.png', { type: 'image/png' })]);

    expect(openRejectedMock).toHaveBeenCalledWith(expect.anything(), 'not-svg');
    expect(openDroppedMock).not.toHaveBeenCalled();
  });
});
