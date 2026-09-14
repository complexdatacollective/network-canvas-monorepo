import { expect, type Locator, type Page } from '@playwright/test';

// Inline emphasis spans, longest-delimiter first so `**bold**` is never read
// as two adjacent `*italic*` markers. Kept as a split pattern (capturing, so
// `String.split` returns the delimiters as their own segments) and a matching
// anchored test — deliberately NOT one global regex, whose `lastIndex` would
// carry between calls.
export const EMPHASIS_SPLIT = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/;
export const EMPHASIS_TEST = /^(?:\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)$/;

// One line of inline markdown. Only the emphasis markers need to arrive as
// real keystrokes — Tiptap converts `**bold**` / `_italic_` / `*italic*`
// through ProseMirror input rules, which fire on the closing character and
// are invisible to bulk insertion. Everything between them is plain prose
// that `insertText` places in one call.
//
// This is the difference between ~15,000 keystroke round trips across the
// spec and a few hundred: the whole-protocol build types 15kB of canonical
// copy, of which under 5% carries emphasis. It is also SAFER than typing
// everything, because bulk-inserted prose cannot trip an input rule it was
// never meant to (a sentence that happens to start `1. `, say).
// Correctness is not assumed — the final comparison re-parses every string,
// so a mis-typed mark fails the run loudly.
export async function typeInlineRun(page: Page, text: string): Promise<void> {
  for (const segment of text.split(EMPHASIS_SPLIT)) {
    if (!segment) continue;
    if (EMPHASIS_TEST.test(segment)) {
      await page.keyboard.type(segment);
    } else {
      await page.keyboard.insertText(segment);
    }
  }
}

/**
 * Writes one line of markdown into a rich-text box, whatever it held before.
 *
 * A markdown box is a Tiptap contenteditable, not an input, and two things
 * follow that a caller has to respect. The surrounding field renders before
 * ProseMirror has attached, so the box is waited for rather than filled into
 * whichever element happens to own focus. And emphasis has to be TYPED: the
 * document is what gets serialised, so `**Yes**` placed in bulk is four
 * literal asterisks the serializer escapes, while typed it becomes the bold
 * run the protocol holds.
 *
 * Used wherever a page object writes a value the interview renders as markdown
 * and the surface offers a box rather than an input — every option label
 * (`@codaco/protocol-builder`'s `OptionLabelField`) included.
 */
export async function writeRichText(
  box: Locator,
  markdown: string,
): Promise<void> {
  await expect(box).toBeEditable();
  // Whatever was there, gone — and through `fill` rather than a select-all,
  // because an empty box has nothing to select and the shortcut differs by
  // platform.
  await box.fill('');
  await box.click();
  await typeInlineRun(box.page(), markdown);
}
