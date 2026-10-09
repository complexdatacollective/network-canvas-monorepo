import { expect, type Locator, type Page } from '@playwright/test';

// Inline emphasis spans, longest-delimiter first so `**bold**` is never read
// as two adjacent `*italic*` markers. Kept as a split pattern (capturing, so
// `String.split` returns the delimiters as their own segments) and a matching
// anchored test — deliberately NOT one global regex, whose `lastIndex` would
// carry between calls.
const EMPHASIS_SPLIT = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/;
const EMPHASIS_TEST = /^(?:\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)$/;

// The characters the canonical sample protocol writes as HTML character
// references (an older serializer's `&quot;`/`&#39;`, and `&lt;`/`&gt;`
// around a placeholder). Deliberately short: a reference outside it throws
// rather than being typed as literal text the comparison would then miss.
const NAMED_REFERENCES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

const CHARACTER_REFERENCE = /&(?:#(\d+)|#[xX]([\da-fA-F]+)|([A-Za-z]+));/g;

/**
 * The characters a researcher types for markdown that writes some of them as
 * HTML character references: `&lt;IRB&gt;` is typed `<IRB>`, `&#39;` is
 * typed `'`.
 *
 * A reference is markdown's spelling of a character, not something anyone
 * types. Typed literally, `&lt;` is the four characters `&`, `l`, `t`, `;`,
 * which the editor correctly stores as that text (`\&lt;`) — so the protocol
 * built from the canonical file would no longer say what the canonical file
 * says.
 */
export function decodeCharacterReferences(markdown: string): string {
  return markdown.replace(
    CHARACTER_REFERENCE,
    (
      reference: string,
      decimal: string | undefined,
      hex: string | undefined,
      name: string | undefined,
    ) => {
      if (decimal !== undefined) {
        return String.fromCodePoint(Number.parseInt(decimal, 10));
      }
      if (hex !== undefined) {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      const character = name === undefined ? undefined : NAMED_REFERENCES[name];
      if (character === undefined) {
        throw new Error(
          `no typed character is known for the reference ${reference}; add it to NAMED_REFERENCES`,
        );
      }
      return character;
    },
  );
}

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
