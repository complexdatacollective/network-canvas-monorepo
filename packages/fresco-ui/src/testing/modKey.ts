/**
 * The key a `Mod-` shortcut means on the platform the test runs on: Cmd
 * (`Meta`) on Apple platforms, `Control` everywhere else.
 *
 * The rich text editor's shortcuts (undo, redo and the rest of its keymap)
 * come from ProseMirror, which reads `Mod` this way from `navigator.platform`.
 * A play that sends `{Control>}z{/Control}` therefore undoes on Linux CI but
 * does nothing in a browser on a Mac. This applies the same test, so the
 * shortcut reaches the editor on both. In jsdom `navigator.platform` is empty,
 * so it is `Control` there, as it is for ProseMirror.
 */
const APPLE_PLATFORM = /Mac|iP(hone|[oa]d)/;

const modKey = (): 'Meta' | 'Control' =>
  typeof navigator !== 'undefined' && APPLE_PLATFORM.test(navigator.platform)
    ? 'Meta'
    : 'Control';

/**
 * Wraps a `userEvent.keyboard` sequence in the platform's `Mod` key:
 * `withMod('z')` is undo and `withMod('{Shift>}z{/Shift}')` is redo.
 */
export const withMod = (keys: string): string => {
  const key = modKey();
  return `{${key}>}${keys}{/${key}}`;
};
