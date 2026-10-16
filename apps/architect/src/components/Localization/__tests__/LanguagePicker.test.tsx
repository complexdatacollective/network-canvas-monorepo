import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FittedNames } from '../LanguagePicker';

const NAMES = ['English', 'Spanish', 'French', 'German', 'Dutch', 'Italian'];

// jsdom has no layout: give every character 8px and the list a fixed width.
const layOut = (listWidth: number) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
    listWidth,
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return (this.textContent ?? '').length * 8;
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
});
