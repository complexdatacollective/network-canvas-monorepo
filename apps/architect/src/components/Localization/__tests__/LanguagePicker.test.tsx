import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { FittedNames } from '../LanguagePicker';

const NAMES = ['English', 'Spanish', 'French', 'German', 'Dutch', 'Italian'];

// jsdom has no layout: give every character 8px and the list a fixed width.
const layOut = (listWidth: number, characterWidth = 8) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
    listWidth,
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return (this.textContent ?? '').length * characterWidth;
    },
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FittedNames', () => {
  it('names every language when they all fit', () => {
    layOut(1000);
    render(<FittedNames names={NAMES} />);
    expect(
      screen.getByText('English, Spanish, French, German, Dutch, and Italian'),
    ).toBeInTheDocument();
  });

  it('names as many as fit and counts the rest', () => {
    // "English, Spanish, and 4 others" is 30 characters, 240px.
    layOut(250);
    render(<FittedNames names={NAMES} />);
    expect(
      screen.getByText('English, Spanish, and 4 others'),
    ).toBeInTheDocument();
  });

  it('always names at least one language', () => {
    layOut(10);
    render(<FittedNames names={NAMES} />);
    expect(screen.getByText('English and 5 others')).toBeInTheDocument();
  });

  it('fits again once the web font has loaded', async () => {
    let fontsLoaded = () => {};
    const ready = new Promise<void>((resolve) => {
      fontsLoaded = resolve;
    });
    // jsdom has no FontFaceSet.
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready },
    });
    onTestFinished(() => {
      Reflect.deleteProperty(document, 'fonts');
    });
    layOut(250);
    render(<FittedNames names={NAMES} />);
    // Let the stubbed ResizeObserver deliver its first observation.
    await act(async () => {});
    expect(
      screen.getByText('English, Spanish, and 4 others'),
    ).toBeInTheDocument();

    // The web font is narrower than the fallback.
    layOut(250, 4);
    await act(async () => {
      fontsLoaded();
      await ready;
    });
    expect(
      screen.getByText('English, Spanish, French, German, Dutch, and Italian'),
    ).toBeInTheDocument();
  });
});
