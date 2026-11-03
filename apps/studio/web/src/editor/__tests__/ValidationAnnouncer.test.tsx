// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ValidationAnnouncer from '../ValidationAnnouncer.tsx';

/** What the page's polite live regions say, as a screen reader would hear it. */
const spoken = (container: HTMLElement) =>
  container.querySelector('output[aria-live="polite"]')?.textContent;

const settle = () => act(() => vi.advanceTimersByTimeAsync(1000));

describe('the validation count announcement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a polite region that is there before it has anything to say', () => {
    const { container } = render(<ValidationAnnouncer problemCount={3} />);

    expect(container.querySelector('output')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(spoken(container)).toBe('');
  });

  it('says nothing for the count the editor opened with', async () => {
    const { container } = render(<ValidationAnnouncer problemCount={3} />);
    await settle();

    expect(spoken(container)).toBe('');
  });

  it('says nothing while the protocol is being checked or cannot be', async () => {
    const { container, rerender } = render(
      <ValidationAnnouncer problemCount={undefined} />,
    );
    await settle();
    rerender(<ValidationAnnouncer problemCount={2} />);
    await settle();
    rerender(<ValidationAnnouncer problemCount={undefined} />);
    await settle();

    expect(spoken(container)).toBe('');
  });

  it('announces a changed count only once it has stopped changing', async () => {
    const { container, rerender } = render(
      <ValidationAnnouncer problemCount={1} />,
    );
    await settle();

    rerender(<ValidationAnnouncer problemCount={2} />);
    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender(<ValidationAnnouncer problemCount={5} />);
    await act(() => vi.advanceTimersByTimeAsync(200));
    // Still changing: the researcher has heard nothing about 2 or 5.
    expect(spoken(container)).toBe('');

    await settle();
    expect(spoken(container)).toBe('5 validation problems.');
  });

  it('says so when the last problem is gone', async () => {
    const { container, rerender } = render(
      <ValidationAnnouncer problemCount={1} />,
    );
    await settle();

    rerender(<ValidationAnnouncer problemCount={0} />);
    await settle();

    expect(spoken(container)).toBe('No validation problems.');
  });
});
