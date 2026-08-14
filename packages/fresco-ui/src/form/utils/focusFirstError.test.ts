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
const setup = (fieldName = 'dob', fieldPath?: string) => {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';

  const field = document.createElement('div');
  field.setAttribute('data-field-name', fieldName);
  if (fieldPath) field.setAttribute('data-field-path', fieldPath);
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
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('focuses the first errored field via the timeout fallback when no scrollend fires', () => {
    const { input } = setup();

    focusFirstError(errors);
    vi.advanceTimersByTime(800);

    expect(document.activeElement).toBe(input);
  });

  // Several Base UI primitives render a hidden proxy input beside their real
  // control — a Switch renders `<button role="switch">` followed by an
  // `aria-hidden`, `tabindex="-1"` checkbox. Focusing the proxy leaves no
  // visible focus ring and hands a screen reader a node marked as not
  // existing, so the first genuinely operable candidate is taken instead.
  it('skips a hidden proxy input in favour of the control it stands for', () => {
    const { scroller } = setup();
    const field = scroller.firstElementChild;
    field?.replaceChildren();

    const proxy = document.createElement('input');
    proxy.setAttribute('aria-hidden', 'true');
    proxy.setAttribute('tabindex', '-1');
    const control = document.createElement('button');
    control.setAttribute('role', 'switch');
    control.setAttribute('tabindex', '0');
    field?.append(proxy, control);

    focusFirstError(errors);
    vi.advanceTimersByTime(800);

    expect(document.activeElement).toBe(control);
  });

  it('skips a disabled control', () => {
    const { scroller } = setup();
    const field = scroller.firstElementChild;
    field?.replaceChildren();

    const disabled = document.createElement('input');
    disabled.setAttribute('disabled', '');
    const enabled = document.createElement('input');
    field?.append(disabled, enabled);

    focusFirstError(errors);
    vi.advanceTimersByTime(800);

    expect(document.activeElement).toBe(enabled);
  });

  it('leaves focus alone when every candidate is hidden', () => {
    const { scroller, otherInput } = setup();
    const field = scroller.firstElementChild;
    field?.replaceChildren();

    const proxy = document.createElement('input');
    proxy.setAttribute('aria-hidden', 'true');
    field?.append(proxy);
    otherInput.focus();

    focusFirstError(errors);
    vi.advanceTimersByTime(800);

    expect(document.activeElement).toBe(otherInput);
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

  it('does not rely on the global document when the fallback fires', () => {
    const { input } = setup();

    focusFirstError(errors);
    vi.stubGlobal('document', undefined);

    expect(() => vi.advanceTimersByTime(800)).not.toThrow();

    vi.unstubAllGlobals();
    expect(document.activeElement).toBe(input);
  });

  it('does not focus a field that detaches before the fallback fires', () => {
    const { input } = setup();
    const focusSpy = vi.spyOn(input, 'focus');

    focusFirstError(errors);
    input.remove();
    vi.advanceTimersByTime(800);

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('matches an opaque dotted field name without interpolating a selector', () => {
    const fieldName = 'favorite.color';
    const fieldPath = '["favorite.color"]';
    const { input } = setup(fieldName, fieldPath);

    focusFirstError({
      formErrors: [],
      fieldErrors: { [fieldPath]: ['Required'] },
    });
    vi.advanceTimersByTime(800);

    expect(document.activeElement).toBe(input);
  });

  it('matches an unambiguous public field name when its path is canonicalized', () => {
    const fieldName = 'weight[kg]';
    const { input } = setup(fieldName, '["weight[kg]"]');

    focusFirstError({
      formErrors: [],
      fieldErrors: { [fieldName]: ['Required'] },
    });
    vi.advanceTimersByTime(800);

    expect(document.activeElement).toBe(input);
  });

  it('does not guess between ambiguous public field names', () => {
    const first = setup('favorite.color', '["favorite.color"]');
    const second = setup('favorite.color', 'profile.favorite.color');

    focusFirstError({
      formErrors: [],
      fieldErrors: { 'favorite.color': ['Required'] },
    });
    vi.advanceTimersByTime(800);

    expect(document.activeElement).not.toBe(first.input);
    expect(document.activeElement).not.toBe(second.input);
  });
});
