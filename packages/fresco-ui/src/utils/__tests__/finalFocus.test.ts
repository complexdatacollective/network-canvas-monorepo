import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  asFinalFocusTarget,
  holdsFocus,
  isUsableFinalFocusTarget,
} from '../finalFocus';

/**
 * The two questions this module answers are deliberately different, and the
 * difference is the point: "is anything holding focus?" (state) admits any
 * focusable element, while "may I hand Base UI this as a return target?"
 * (destination) additionally requires an `HTMLElement`, because that is what
 * Base UI's `finalFocus` accepts.
 *
 * Conflating them is a real defect, not a tidiness issue: an `<a href>` or a
 * `tabindex` inside an inline `<svg>` focuses as an `SVGElement`. Asking the
 * destination question about live focus reports that researcher's focused
 * control as "nothing is focused", and the caller then moves focus off them.
 */
const svg = (inner: string) => {
  const host = document.createElement('div');
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  document.body.append(host);
  return host;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('holdsFocus — the STATE question', () => {
  it('counts a focusable SVG element as holding focus', () => {
    const host = svg('<a href="#x"><text>Open</text></a>');
    const link = host.querySelector('a');

    expect(link).not.toBeNull();
    // The whole reason the two predicates cannot be one.
    expect(link instanceof HTMLElement).toBe(false);
    expect(holdsFocus(link)).toBe(true);
  });

  it('counts an ordinary element as holding focus', () => {
    const button = document.createElement('button');
    document.body.append(button);

    expect(holdsFocus(button)).toBe(true);
  });

  it('does not count the places the browser parks focus', () => {
    expect(holdsFocus(document.body)).toBe(false);
    expect(holdsFocus(document.documentElement)).toBe(false);
    expect(holdsFocus(null)).toBe(false);
    expect(holdsFocus(undefined)).toBe(false);
  });

  it('does not count a detached element', () => {
    expect(holdsFocus(document.createElement('button'))).toBe(false);
  });
});

describe('asFinalFocusTarget — the DESTINATION question', () => {
  it('refuses an SVG element, which Base UI cannot accept', () => {
    const host = svg('<a href="#x"><text>Open</text></a>');

    // Correct here, and precisely what makes it wrong for the state question.
    expect(asFinalFocusTarget(host.querySelector('a'))).toBeNull();
  });

  it('accepts a connected HTMLElement', () => {
    const button = document.createElement('button');
    document.body.append(button);

    expect(asFinalFocusTarget(button)).toBe(button);
  });

  it('refuses body, documentElement and a detached node', () => {
    expect(asFinalFocusTarget(document.body)).toBeNull();
    expect(asFinalFocusTarget(document.documentElement)).toBeNull();
    expect(asFinalFocusTarget(document.createElement('button'))).toBeNull();
  });
});

describe('the two predicates share one set of rejections', () => {
  // isUsableFinalFocusTarget composes holdsFocus rather than restating it, so
  // the body/documentElement/disconnected rules cannot drift between them.
  it.each([
    ['body', () => document.body],
    ['documentElement', () => document.documentElement],
    ['a detached element', () => document.createElement('div')],
  ])('both reject %s', (_label, get) => {
    const node = get() as HTMLElement;

    expect(holdsFocus(node)).toBe(false);
    expect(isUsableFinalFocusTarget(node)).toBe(false);
  });
});

/**
 * The door closed behind the seam.
 *
 * Four places in this repo independently wrote "is focus parked on `<body>` or
 * `<html>`?" — `ModalPopup`, `DialogProvider`, `focusFirstError` and (in
 * Architect) `RouteFocus` — and they did not agree: some admitted any focusable
 * element, some only `HTMLElement`s, some checked `isConnected` and some did
 * not. A comment asking the next author to use `holdsFocus` cannot make that
 * true; this can.
 *
 * Scoped to the pair, not to `documentElement` alone: `inertOthers` rejects
 * `<html>` for an unrelated reason (making it focusable would turn it into a
 * tab stop) and is not asking about focus state at all. It is the PROXIMITY of
 * `activeElement` to `documentElement` that identifies a hand-rolled copy.
 */
describe('parked-focus checks', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const ALLOWED = ['utils/finalFocus.ts'];
  const WINDOW = 400;

  /** Whether `source` compares the active element against the document root. */
  const handRolled = (source: string) => {
    const collapsed = source.replace(/\s+/g, ' ');
    const at = (needle: string) => {
      const found: number[] = [];
      for (
        let index = collapsed.indexOf(needle);
        index !== -1;
        index = collapsed.indexOf(needle, index + 1)
      ) {
        found.push(index);
      }
      return found;
    };
    const roots = at('documentElement');
    return at('activeElement').some((active) =>
      roots.some((root) => Math.abs(root - active) < WINDOW),
    );
  };

  const sourceFiles = readdirSync(SRC, {
    recursive: true,
    encoding: 'utf-8',
  }).filter((entry) => /\.tsx?$/.test(entry));

  it('finds the package source to scan', () => {
    // Without this, a bad SRC path would make the assertion below vacuous.
    expect(sourceFiles.length).toBeGreaterThan(200);
    expect(sourceFiles).toContain(join('utils', 'finalFocus.ts'));
  });

  it('has no hand-rolled parked-focus check outside this module', () => {
    const offenders = sourceFiles.filter((entry) => {
      const posix = entry.split('\\').join('/');
      if (ALLOWED.includes(posix)) return false;
      if (posix === relative(SRC, fileURLToPath(import.meta.url))) return false;
      return handRolled(readFileSync(join(SRC, entry), 'utf-8'));
    });
    expect(offenders).toEqual([]);
  });

  it('would catch one if it came back', () => {
    // The oracle above is a negative assertion, so prove it can fire — this is
    // `focusFirstError`'s own copy, exactly as it read before the conversion.
    expect(
      handRolled(`
        const active = ownerDocument.activeElement;
        const focusWasLost =
          active === null ||
          active === ownerDocument.body ||
          active === ownerDocument.documentElement;
      `),
    ).toBe(true);
  });
});
