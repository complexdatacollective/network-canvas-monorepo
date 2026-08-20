// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlattenedErrors } from '../store/types';
import { focusFirstError, resolveFieldErrorTarget } from './focusFirstError';

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

  it('focuses a control-less container on EVERY failed submit, not just the first', () => {
    // The container fallback works by stamping `tabindex="-1"` on the
    // container. The operability predicate it is gated on REJECTS
    // `tabindex="-1"` — it was written to reject Base UI's hidden proxy
    // inputs — so after the first submit the container disqualifies itself
    // from its own mechanism and every later submit leaves focus on <body>.
    // A blocked dialog stays open, so the second submit is the common case,
    // not the edge one.
    const { field } = setup('_contradiction', undefined, { focusable: false });
    const failedSubmit = () => {
      focusFirstError({
        formErrors: [],
        fieldErrors: { _contradiction: ['Contradictory rules'] },
      });
    };

    failedSubmit();
    expect(document.activeElement).toBe(field);

    // The submit button that held focus is disabled for the submit and the
    // browser blurs it, so focus is genuinely lost between attempts.
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    failedSubmit();
    expect(document.activeElement).toBe(field);
    expect(document.activeElement).not.toBe(document.body);
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

  // The case a real Base UI Switch presents: its operable control is a BARE
  // `<button role="switch">` carrying no tabindex of its own, so the native
  // control and tabindex tiers see only the aria-hidden proxy beside it. #1383
  // stopped at those tiers and therefore focused nothing at all; a form that
  // refuses to submit has to put focus somewhere the researcher can act, so the
  // button tier now reaches the real control.
  it('focuses a bare role="switch" button that carries no tabindex', () => {
    const { field } = setup();
    field.replaceChildren();

    const proxy = document.createElement('input');
    proxy.setAttribute('type', 'checkbox');
    proxy.setAttribute('aria-hidden', 'true');
    proxy.setAttribute('tabindex', '-1');
    const control = document.createElement('button');
    control.setAttribute('role', 'switch');
    field.append(proxy, control);

    focusFirstError(errors);

    expect(document.activeElement).toBe(control);
    // The two ways this can regress: back to the proxy a screen reader is told
    // does not exist, or to nowhere at all.
    expect(document.activeElement).not.toBe(proxy);
    expect(document.activeElement).not.toBe(document.body);
  });

  // Replaces #1383's "leaves focus alone when every candidate is hidden".
  // Leaving focus where it was is what this whole function exists to stop: the
  // submission was refused, and the researcher has to be told where. With no
  // operable control anywhere in the field, the container carrying the error
  // message is the only honest destination.
  it('falls back to the container when a field holds nothing but a hidden proxy', () => {
    const { field, otherInput } = setup();
    field.replaceChildren();

    const proxy = document.createElement('input');
    proxy.setAttribute('aria-hidden', 'true');
    field.append(proxy);
    otherInput.focus();

    focusFirstError(errors);

    expect(document.activeElement).toBe(field);
    expect(document.activeElement).not.toBe(proxy);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBe(otherInput);
  });

  // The container fallback must never outrank a real control. Architect's
  // whole-editor contradiction alert is a `data-field-name` container with
  // nothing focusable in it, and it renders ABOVE every field — so if the
  // fallback competed on equal terms it would win document order and park the
  // researcher on a heading with every offending control still to find by hand.
  it('prefers a later field with a real control over an earlier control-less container', () => {
    const alert = setup('_contradiction', undefined, { focusable: false });
    const withControl = setup('dob', '["dob"]');
    document.body.insertBefore(alert.scroller, withControl.scroller);

    focusFirstError({
      formErrors: [],
      fieldErrors: {
        '["dob"]': ['Required'],
        '_contradiction': ['Contradictory rules'],
      },
    });

    expect(document.activeElement).toBe(withControl.input);
    // ...while the scroll still goes to the topmost problem.
    expect(alert.scroller.scrollTo).toHaveBeenCalled();
    // And the alert is left exactly as it was found — a predicate that made
    // containers focusable while merely inspecting them would stamp this one.
    expect(alert.field).not.toHaveAttribute('tabindex');
  });

  it('focuses exactly once per call', () => {
    const { input } = setup();
    const focusSpy = vi.spyOn(input, 'focus');

    focusFirstError(errors);

    expect(focusSpy).toHaveBeenCalledTimes(1);
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
  afterEach(() => {
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

    expect(document.activeElement).toBe(field.querySelector('#picker'));
  });

  it('prefers a native control over a button that precedes it', () => {
    // The tiers are queried separately precisely so this stays true: a single
    // comma-list selector answers in document order and would hand the error to
    // the button.
    const { field } = setupComposite((container) => {
      container.innerHTML = `
        <button type="button" id="helper">Explain this</button>
        <input id="control" />
      `;
    });

    focusFirstError(errors);

    expect(document.activeElement).toBe(field.querySelector('#control'));
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

    expect(document.activeElement).toBe(field.querySelector('#real'));
    expect(document.activeElement).not.toBe(field.querySelector('#proxy'));
  });

  it('falls back to the field container when nothing inside it can take focus', () => {
    const { field } = setupComposite((container) => {
      container.innerHTML = `<p>Nothing focusable here</p>`;
    });

    focusFirstError(errors);

    expect(document.activeElement).toBe(field);
    expect(field).toHaveAttribute('tabindex', '-1');
  });

  it('leaves focus alone rather than focusing an inert control', () => {
    // An inert subtree cannot take focus, so `focus()` on something inside one
    // is a silent no-op that would strand focus on `<body>`. Marking the
    // container focusable instead would permanently mutate a background element
    // a dialog has deliberately taken out of play.
    const { field } = setupComposite((container) => {
      container.innerHTML = `<input id="control" />`;
    });
    field.setAttribute('inert', '');

    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();

    focusFirstError(errors);

    expect(document.activeElement).toBe(outside);
    expect(field).not.toHaveAttribute('tabindex');
  });

  it('still moves focus when the submit button that had it was disabled', () => {
    // Submitting disables the submit button, which the browser blurs — leaving
    // `document.activeElement` on `<body>` by the time the errors commit. That
    // is focus being LOST, not the researcher moving it, and it must not read
    // as "leave focus where it is".
    const { field } = setupComposite((container) => {
      container.innerHTML = `<input id="control" />`;
    });

    const submit = document.createElement('button');
    document.body.appendChild(submit);
    submit.focus();
    // The browser blurs the button BECAUSE it is being disabled; jsdom refuses
    // to blur an already-disabled element, so the two steps go in this order.
    submit.blur();
    submit.disabled = true;
    expect(document.activeElement).toBe(document.body);

    focusFirstError(errors);

    expect(document.activeElement).toBe(field.querySelector('#control'));
  });
});

/**
 * Architect's Issues panel lists every message and lets the researcher pick
 * one. It knows which field they picked, so it needs the same answer
 * `focusFirstError` would give for that field alone — otherwise a click
 * scrolls somewhere and leaves focus on the button that was clicked.
 */
describe('resolveFieldErrorTarget', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('resolves the field a name points at, not whichever field is first', () => {
    const first = setupComposite((container) => {
      container.innerHTML = `<input id="first" />`;
    });
    first.field.setAttribute('data-field-path', 'introductionPanel.title');

    const second = setupComposite((container) => {
      container.innerHTML = `<div contenteditable="true" id="second"></div>`;
    });
    second.field.setAttribute('data-field-path', 'introductionPanel.text');

    expect(resolveFieldErrorTarget('introductionPanel.text')).toBe(
      second.field.querySelector('#second'),
    );
  });

  it('honours a field that nominates its own control', () => {
    // The variable picker's "Select variable" button: the control that
    // actually resolves the error, and not the first button in the field.
    const { field } = setupComposite((container) => {
      container.innerHTML = `
        <button type="button">Remove</button>
        <button type="button" data-field-focus-target>Select variable</button>
      `;
    });

    expect(resolveFieldErrorTarget('dob')).toBe(
      field.querySelector('[data-field-focus-target]'),
    );
  });

  it('reaches a Base UI switch past its aria-hidden proxy input', () => {
    const { field } = setupComposite((container) => {
      container.innerHTML = `
        <button type="button" role="switch" aria-checked="false"></button>
        <input type="checkbox" aria-hidden="true" tabindex="-1" />
      `;
    });

    expect(resolveFieldErrorTarget('dob')).toBe(
      field.querySelector('[role="switch"]'),
    );
  });

  it('falls back to the field container when it owns no control', () => {
    // Architect's whole-editor contradiction alert is a container with an
    // error and nothing operable inside it. Focus still has to land on it,
    // or the researcher is sent nowhere.
    const { field } = setupComposite((container) => {
      container.innerHTML = `<p>This attribute cannot be saved</p>`;
    });

    expect(resolveFieldErrorTarget('dob')).toBe(field);
    expect(field.getAttribute('tabindex')).toBe('-1');
  });

  it('keeps answering with that container once it has been stamped', () => {
    // #1391's Issues panel calls this on every row click. The stamp the first
    // call leaves behind must not make the second call answer "nowhere" — that
    // would kill the panel's focus hand-off for the whole session.
    const { field } = setupComposite((container) => {
      container.innerHTML = `<p>This attribute cannot be saved</p>`;
    });

    expect(resolveFieldErrorTarget('dob')).toBe(field);
    expect(resolveFieldErrorTarget('dob')).toBe(field);
  });

  it('answers undefined for a field that is not in the DOM', () => {
    setupComposite((container) => {
      container.innerHTML = `<input />`;
    });

    expect(resolveFieldErrorTarget('nothing.here')).toBeUndefined();
  });

  it('prefers a field inside the given root over an identically named one outside it', () => {
    const background = setupComposite((container) => {
      container.innerHTML = `<input id="background" />`;
    });
    background.field.setAttribute('data-field-path', 'dob');

    const dialog = document.createElement('div');
    const dialogField = document.createElement('div');
    dialogField.setAttribute('data-field-path', 'dob');
    dialogField.innerHTML = `<input id="dialog" />`;
    dialog.appendChild(dialogField);
    document.body.appendChild(dialog);

    expect(resolveFieldErrorTarget('dob', dialog)).toBe(
      dialogField.querySelector('#dialog'),
    );
  });
});
