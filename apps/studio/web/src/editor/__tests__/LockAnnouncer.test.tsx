// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LockAnnouncer from '../LockAnnouncer.tsx';

const spoken = (container: HTMLElement) =>
  container.querySelector('output[aria-live="polite"]')?.textContent;

const settle = () => act(() => vi.advanceTimersByTimeAsync(1000));

function announcer(access: 'pending' | 'editing' | 'readOnly' | undefined) {
  return <LockAnnouncer name="Welcome" access={access} />;
}

describe('the editing lock announcement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a polite region that is there, empty, before anything changes', () => {
    const { container } = render(announcer('pending'));

    const region = container.querySelector('output');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(spoken(container)).toBe('');
  });

  it('says nothing for a screen that opens and becomes editable', async () => {
    const { container, rerender } = render(announcer(undefined));
    await settle();
    rerender(announcer('pending'));
    await settle();
    rerender(announcer('editing'));
    await settle();

    expect(spoken(container)).toBe('');
  });

  it('says a screen somebody else holds is read-only when it opens that way', async () => {
    const { container, rerender } = render(announcer('pending'));
    await settle();
    rerender(announcer('readOnly'));
    await settle();

    expect(spoken(container)).toBe(
      'Welcome is read-only, because somebody else is editing it.',
    );
  });

  it('says when the researcher loses the screen they were editing', async () => {
    const { container, rerender } = render(announcer('editing'));
    await settle();
    expect(spoken(container)).toBe('');

    rerender(announcer('readOnly'));
    await settle();

    expect(spoken(container)).toBe(
      'You can no longer edit Welcome. It is now read-only.',
    );
  });

  it('still calls it a loss when the screen was editable only briefly', async () => {
    const { container, rerender } = render(announcer('pending'));
    await settle();
    rerender(announcer('editing'));
    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender(announcer('readOnly'));
    await settle();

    expect(spoken(container)).toBe(
      'You can no longer edit Welcome. It is now read-only.',
    );
  });

  it('does not say it again when only the screen’s name changes', async () => {
    const { container, rerender } = render(announcer('editing'));
    await settle();
    rerender(announcer('readOnly'));
    await settle();
    const first = spoken(container);

    rerender(<LockAnnouncer name="Welcome, renamed" access="readOnly" />);
    await settle();

    expect(spoken(container)).toBe(first);
  });

  it('says when editing is possible again', async () => {
    const { container, rerender } = render(announcer('editing'));
    await settle();
    rerender(announcer('readOnly'));
    await settle();

    rerender(announcer('editing'));
    await settle();

    expect(spoken(container)).toBe('You can edit Welcome again.');
  });

  it('waits for the change to settle, and says nothing of a change that undid itself', async () => {
    const { container, rerender } = render(announcer('editing'));
    await settle();

    rerender(announcer('readOnly'));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(spoken(container)).toBe('');
    rerender(announcer('editing'));
    await settle();

    expect(spoken(container)).toBe('');
  });
});
