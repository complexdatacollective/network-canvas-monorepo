import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';

import { ProtocolDeck } from '../ProtocolDeck';

const noop = () => {};

// jsdom has no layout, so report a section height: the deck renders its cards
// (and with them the import card's file input) only once it has been measured.
class SizedResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const size = { blockSize: 800, inlineSize: 1200 };
    const entry: ResizeObserverEntry = {
      target,
      borderBoxSize: [size],
      contentBoxSize: [size],
      devicePixelContentBoxSize: [size],
      contentRect: target.getBoundingClientRect(),
    };
    this.callback([entry], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', SizedResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const netcanvas = (name: string) => new File(['{}'], name);

// Drives the real react-dropzone through the import card's file input, so the
// assertions cover how the library splits a selection into accepted and
// rejected files.
async function selectFiles(files: File[]) {
  const onImportFile = vi.fn();
  render(
    <AppI18nProvider locale="en" locales={interviewerProductionLocales}>
      <ProtocolDeck
        protocols={[]}
        sessions={[]}
        pendingImports={[]}
        onImportFile={onImportFile}
        onStartInterview={noop}
        onDeleteProtocol={noop}
      />
    </AppI18nProvider>,
  );
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('import file input not found');
  await act(async () => {
    fireEvent.change(input, { target: { files } });
    // react-dropzone resolves the selected files asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return onImportFile;
}

describe('ProtocolDeck protocol import', () => {
  it('imports a single .netcanvas file', async () => {
    const file = netcanvas('study.netcanvas');
    const onImportFile = await selectFiles([file]);

    expect(onImportFile).toHaveBeenCalledExactlyOnceWith(file);
  });

  it('imports nothing when several .netcanvas files arrive at once', async () => {
    const onImportFile = await selectFiles([
      netcanvas('first.netcanvas'),
      netcanvas('second.netcanvas'),
    ]);

    expect(onImportFile).not.toHaveBeenCalled();
  });
});
