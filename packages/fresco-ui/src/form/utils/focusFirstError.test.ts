// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlattenedErrors } from '../store/types';
import { focusFirstError } from './focusFirstError';

const errors: FlattenedErrors = {
  formErrors: [],
  fieldErrors: { dob: ['Required'] },
};

/**
 * Build a scroll container holding the errored field plus an unrelated
 * input outside it. jsdom doesn't implement scrolling, so scrollTo is
 * stubbed and scrollend is dispatched manually where needed.
 */
const setup = () => {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';

  const field = document.createElement('div');
  field.setAttribute('data-field-name', 'dob');
  const input = document.createElement('input');
  field.appendChild(input);
  scroller.appendChild(field);

  const otherInput = document.createElement('input');

  document.body.appendChild(scroller);
  document.body.appendChild(otherInput);

  scroller.scrollTo = vi.fn();

  return { scroller, input, otherInput };
};

describe('focusFirstError', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('focuses the first errored field via the timeout fallback when no scrollend fires', () => {
    const { input } = setup();

    focusFirstError(errors);
    vi.advanceTimersByTime(800);

    expect(document.activeElement).toBe(input);
  });

  it('focuses exactly once when scrollend fires before the fallback', () => {
    const { scroller, input } = setup();
    const focusSpy = vi.spyOn(input, 'focus');

    focusFirstError(errors);
    scroller.dispatchEvent(new Event('scrollend'));

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);

    vi.advanceTimersByTime(800);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('does not steal focus when focus has moved since invocation', () => {
    const { input, otherInput } = setup();
    const focusSpy = vi.spyOn(input, 'focus');

    focusFirstError(errors);
    // Simulate the user clicking into another control before the
    // deferred focus fires.
    otherInput.focus();
    vi.advanceTimersByTime(800);

    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(otherInput);
  });
});
