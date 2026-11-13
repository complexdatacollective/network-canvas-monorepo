import type { HTMLAttributes, HTMLInputTypeAttribute } from 'react';

/**
 * Values written left to right in every language, and often starting with a
 * digit or a symbol, which has no direction of its own: `+1 555-0100`,
 * `-3.5`, `a.b@example.org`, a password. Laid out by their first letter they
 * would take the interface's direction whenever they start without one, and
 * a right-to-left interface would scramble them.
 */
const LEFT_TO_RIGHT_TYPES: ReadonlySet<HTMLInputTypeAttribute> = new Set([
  'email',
  'number',
  'password',
  'tel',
  'url',
]);

const LEFT_TO_RIGHT_MODES: ReadonlySet<
  NonNullable<HTMLAttributes<HTMLElement>['inputMode']>
> = new Set(['decimal', 'email', 'numeric', 'tel', 'url']);

/** Inputs a person types free text into. Every other type the browser draws. */
const TEXT_TYPES: ReadonlySet<HTMLInputTypeAttribute> = new Set([
  'search',
  'text',
]);

type TextEntry = {
  /** The input's `type`; leave it out for a `<textarea>` or an editor. */
  type?: HTMLInputTypeAttribute;
  inputMode?: HTMLAttributes<HTMLElement>['inputMode'];
  /** A direction the caller already knows, such as its text's language's. */
  dir?: string;
};

export type TextEntryDirection = {
  dir: string | undefined;
  className: string | undefined;
};

/**
 * How a box someone types into lays out its text, from what the box is for:
 *
 * 1. a `dir` the caller gives wins, untouched: the caller knows the text's
 *    language (a translation into Arabic is right to left whatever is typed);
 * 2. a value written left to right in every language (`LEFT_TO_RIGHT_TYPES`,
 *    or a text input declared numeric, email, phone or URL by `inputMode`)
 *    is fixed left to right, and still sits on the interface's side;
 * 3. free text (`text`, `search`, a `<textarea>`, an editor) follows its own
 *    first letter, line by line (`text-own-direction`);
 * 4. any other input (date, time, colour, range, file …) is left to the
 *    browser, which draws it.
 *
 * A host that draws its own `<input>`, `<textarea>` or editable element calls
 * this too, so every box follows one rule (the `direction/text-entry` lint
 * rule asks for it).
 */
export function textEntryDirection({
  type,
  inputMode,
  dir,
}: TextEntry): TextEntryDirection {
  if (dir !== undefined) return { dir, className: undefined };
  if (
    (type !== undefined && LEFT_TO_RIGHT_TYPES.has(type)) ||
    (inputMode !== undefined && LEFT_TO_RIGHT_MODES.has(inputMode))
  ) {
    return { dir: 'ltr', className: 'text-match-parent' };
  }
  if (type === undefined || TEXT_TYPES.has(type)) {
    return { dir: undefined, className: 'text-own-direction' };
  }
  return { dir: undefined, className: undefined };
}
