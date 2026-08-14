// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlattenedErrors } from '../store/types';
import { focusFirstError } from './focusFirstError';

const errors: FlattenedErrors = {
  formErrors: [],
  fieldErrors: { dob: ['Required'] },
};

/**
 * Build a scroll container holding the errored field plus an unrelated input
 * outside it. jsdom doesn't implement scrolling, so scrollTo is stubbed.
 */
const setup = (
  fieldName = 'dob',
  fieldPath?: string,
  { focusable = true }: { focusable?: boolean } = {},
) => {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';

  const field = document.createElement('div');
  field.setAttribute('data-field-name', fieldName);
  if (fieldPath) field.setAttribute('data-field-path', fieldPath);
  const input = document.createElement('input');
  if (focusable) field.appendChild(input);
  scroller.appendChild(field);

  const otherInput = document.createElement('input');

  document.body.appendChild(scroller);
  document.body.appendChild(otherInput);

  scroller.scrollTo = vi.fn();

  return { scroller, field, input, otherInput };
};

describe('focusFirstError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('focuses the errored field synchronously, in the calling task', () => {
    const { input } = setup();

    focusFirstError(errors);

    // No timers advanced, no events dispatched: the whole point of the
    // rewrite is that focus never waits, so it can never rest on `body`.
    expect(document.activeElement).toBe(input);
  });

  it('focuses the field that comes first in the document, not first in the error map', () => {
    // Registration order (and so the error map's key order) is deliberately
    // the reverse of the render order here.
    const second = setup('dob', '["dob"]');
    const first = setup('name', '["name"]');
    // Put `name` above `dob` in the document.
    document.body.insertBefore(first.scroller, second.scroller);

    focusFirstError({
      formErrors: [],
      fieldErrors: { '["dob"]': ['Required'], '["name"]': ['Required'] },
    });

    expect(document.activeElement).toBe(first.input);
  });

  it('scrolls to a matched container that has no focusable child', () => {
    // Architect's whole-editor contradiction alert: `data-field-name` only,
    // no control inside it. It must still be scrolled into view.
    const { scroller } = setup('_contradiction', undefined, {
      focusable: false,
    });

    focusFirstError({
      formErrors: [],
      fieldErrors: { _contradiction: ['Contradictory rules'] },
    });

    expect(scroller.scrollTo).toHaveBeenCalled();
  });

  it('leaves focus alone when it already sits inside the errored field', () => {
    const { input } = setup();
    const focusSpy = vi.spyOn(input, 'focus');
    input.focus();
    focusSpy.mockClear();

    focusFirstError(errors);

    // Re-taking focus would reset an in-progress selection (a date segment,
    // a text caret) for no gain.
    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('takes focus from an unrelated control when submission is blocked', () => {
    const { input, otherInput } = setup();
    otherInput.focus();

    focusFirstError(errors);

    expect(document.activeElement).toBe(input);
  });

  it('does not throw when no errored field is in the DOM', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      focusFirstError({
        formErrors: [],
        fieldErrors: { missing: ['Required'] },
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('matches an opaque dotted field name without interpolating a selector', () => {
    const fieldName = 'favorite.color';
    const fieldPath = '["favorite.color"]';
    const { input } = setup(fieldName, fieldPath);

    focusFirstError({
      formErrors: [],
      fieldErrors: { [fieldPath]: ['Required'] },
    });

    expect(document.activeElement).toBe(input);
  });

  it('matches an unambiguous public field name when its path is canonicalized', () => {
    const fieldName = 'weight[kg]';
    const { input } = setup(fieldName, '["weight[kg]"]');

    focusFirstError({
      formErrors: [],
      fieldErrors: { [fieldName]: ['Required'] },
    });

    expect(document.activeElement).toBe(input);
  });

  it('does not guess between ambiguous public field names', () => {
    const first = setup('favorite.color', '["favorite.color"]');
    const second = setup('favorite.color', 'profile.favorite.color');

    focusFirstError({
      formErrors: [],
      fieldErrors: { 'favorite.color': ['Required'] },
    });

    expect(document.activeElement).not.toBe(first.input);
    expect(document.activeElement).not.toBe(second.input);
  });

  it('scrolls without animation when reduced motion is requested', () => {
    const { scroller } = setup();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, media: '' }),
    );

    focusFirstError(errors);

    expect(scroller.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    );
  });

  // Ported from #1383, which introduced operable-candidate selection. Several
  // Base UI primitives render a hidden proxy input beside their real control —
  // a Switch renders `<button role="switch">` followed by an `aria-hidden`,
  // `tabindex="-1"` checkbox. Focusing the proxy leaves no visible focus ring
  // and hands a screen reader a node marked as not existing.
  it('skips a hidden proxy input in favour of the control it stands for', () => {
    const { field } = setup();
    field.replaceChildren();

    const proxy = document.createElement('input');
    proxy.setAttribute('aria-hidden', 'true');
    proxy.setAttribute('tabindex', '-1');
    const control = document.createElement('button');
    control.setAttribute('role', 'switch');
    control.setAttribute('tabindex', '0');
    field.append(proxy, control);

    focusFirstError(errors);

    expect(document.activeElement).toBe(control);
  });

  it('skips a disabled control', () => {
    const { field } = setup();
    field.replaceChildren();

    const disabled = document.createElement('input');
    disabled.setAttribute('disabled', '');
    const enabled = document.createElement('input');
    field.append(disabled, enabled);

    focusFirstError(errors);

    expect(document.activeElement).toBe(enabled);
  });

  it('leaves focus alone when every candidate is hidden', () => {
    const { field, otherInput } = setup();
    field.replaceChildren();

    const proxy = document.createElement('input');
    proxy.setAttribute('aria-hidden', 'true');
    field.append(proxy);
    otherInput.focus();

    focusFirstError(errors);

    expect(document.activeElement).toBe(otherInput);
  });
});

/**
 * A field whose only operable control is not a native form control.
 *
 * The selector used to be `input, textarea, select, [tabindex]:not([tabindex="-1"])`,
 * which matches nothing inside Architect's variable picker (a `<fieldset>` and a
 * `<button>`) — so submitting an incomplete new field rendered its errors and
 * then left focus on `<body>`.
 */
const setupComposite = (build: (field: HTMLElement) => void) => {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  scroller.scrollTo = vi.fn();

  const field = document.createElement('div');
  field.setAttribute('data-field-path', 'dob');
  build(field);
  scroller.appendChild(field);
  document.body.appendChild(scroller);

  return { field };
};

describe('focusFirstError target selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('focuses a button when the field has no native form control', () => {
    const { field } = setupComposite((container) => {
      container.innerHTML = `
        <fieldset><p>No variable selected</p></fieldset>
        <button type="button">Select variable</button>
      `;
    });

    focusFirstError(errors);
    vi.advanceTimersByTime(900);

    expect(document.activeElement).toBe(field.querySelector('button'));
  });

  it('prefers the control a field nominates over the first one in document order', () => {
    const { field } = setupComposite((container) => {
      container.innerHTML = `
        <fieldset><button type="button" id="pill">Edit variable name</button></fieldset>
        <button type="button" id="picker" data-field-focus-target="">Change variable</button>
      `;
    });

    focusFirstError(errors);
    vi.advanceTimersByTime(900);

    expect(document.activeElement).toBe(field.querySelector('#picker'));
  });

  it('skips a hidden proxy control in favour of the operable one', () => {
    // Base UI's Switch renders `<button role="switch">` followed by an
    // aria-hidden, tabindex="-1" proxy checkbox.
    const { field } = setupComposite((container) => {
      container.innerHTML = `
        <button type="button" role="switch" id="real">Toggle</button>
        <input type="checkbox" aria-hidden="true" tabindex="-1" id="proxy" />
      `;
    });

    focusFirstError(errors);
    vi.advanceTimersByTime(900);

    expect(document.activeElement).toBe(field.querySelector('#real'));
  });

  it('falls back to the field container when nothing inside it can take focus', () => {
    const { field } = setupComposite((container) => {
      container.innerHTML = `<p>Nothing focusable here</p>`;
    });

    focusFirstError(errors);
    vi.advanceTimersByTime(900);

    expect(document.activeElement).toBe(field);
    expect(field).toHaveAttribute('tabindex', '-1');
  });

  it('still moves focus when the submit button that had it was disabled', () => {
    // Submitting disables the submit button, which the browser blurs — leaving
    // `document.activeElement` on `<body>`. That is focus being LOST, not the
    // user moving it, and it must not cancel the move to the invalid field.
    const { field } = setupComposite((container) => {
      container.innerHTML = `<input id="control" />`;
    });

    const submit = document.createElement('button');
    document.body.appendChild(submit);
    submit.focus();
    expect(document.activeElement).toBe(submit);

    focusFirstError(errors);
    submit.disabled = true;
    submit.blur();

    vi.advanceTimersByTime(900);

    expect(document.activeElement).toBe(field.querySelector('#control'));
  });
});
