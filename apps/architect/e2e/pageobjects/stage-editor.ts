import { expect, type Locator, type Page } from '@playwright/test';

// Verified against real source (not just the task brief's guesses):
// - `createNew`'s URL/query params match exactly how NewStageScreen.tsx
//   navigates (`params.set('type', ...)`, `params.set('insertAtIndex', ...)`,
//   `/protocol/stage/new?...`), and `/protocol/stage/:stageId` (Routes.tsx)
//   matches `stageId="new"` to StageEditorPage.
// - The stage-name input is a plain `<input aria-label="Stage name">`
//   (StageHeading.tsx's `HeadingInput`) — not wrapped by the `data-field-name`
//   seam (it's rendered via a bare redux-form `Field`, not `FrescoReduxField`),
//   so `getByRole('textbox', { name: 'Stage name' })` is the only way in.
// - `section()`/`field()` match the two seams the rest of the suite relies on:
//   `Section` (EditorLayout/Section.tsx) stamps `data-name={title}` on its
//   `<section>` when `title` is a string; `UnconnectedField`
//   (fresco-ui/form/Field/UnconnectedField.tsx) stamps
//   `data-field-name={name}` on every field rendered through
//   `FrescoReduxField` (Task 2's seam).
// - `expectNoIssues()`'s `getByTestId('issue')` is real: `Issues.tsx`'s issues
//   popover renders each flattened sync-validation error as
//   `<li data-testid="issue">`. That popover only mounts once a submit has
//   actually failed (`hasIssues && submitFailed`), so absence is trivially
//   true before any submit attempt — call this after `save()` (or a failed
//   submit) to make the assertion meaningful.
// - `save()`'s button: StageEditorNav.tsx's toolbar segment
//   `id: 'finished-editing', label: 'Finished Editing'` only pushes into the
//   toolbar when `hasUnsavedChanges` is true, and its `onClick` dispatches
//   `submit(formName)` (redux-form). StageEditor.tsx's `onSubmit` handler
//   navigates to `/protocol` only once redux-form's sync validators all pass
//   and the commit actually runs — so `waitForURL` after the click is a
//   genuine round-trip assertion, not just a click-and-hope.
// Inline emphasis spans, longest-delimiter first so `**bold**` is never read
// as two adjacent `*italic*` markers. Kept as a split pattern (capturing, so
// `String.split` returns the delimiters as their own segments) and a matching
// anchored test — deliberately NOT one global regex, whose `lastIndex` would
// carry between calls.
const EMPHASIS_SPLIT = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/;
const EMPHASIS_TEST = /^(?:\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)$/;

type MarkdownBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet' | 'ordered'; items: string[] };

// Split source markdown into typeable blocks: blank-line-separated
// paragraphs, plus bullet (`* `/`- `) and ordered (`1. `) list runs whose
// single-newline-separated lines all carry a marker.
function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map((block): MarkdownBlock => {
      const lines = block.split('\n');
      if (lines.every((line) => /^[*-] /.test(line))) {
        return {
          kind: 'bullet',
          items: lines.map((line) => line.replace(/^[*-] /, '')),
        };
      }
      if (lines.every((line) => /^\d+\. /.test(line))) {
        return {
          kind: 'ordered',
          items: lines.map((line) => line.replace(/^\d+\. /, '')),
        };
      }
      return { kind: 'paragraph', text: block };
    });
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
// never meant to (a sentence that happens to start `1. `, say). Correctness
// is not assumed — the final comparison re-parses every string, so a
// mis-typed mark fails the run loudly.
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

export class StageEditor {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async createNew(type: string, insertAtIndex = 0): Promise<void> {
    await this.page.goto(
      `/protocol/stage/new?type=${type}&insertAtIndex=${insertAtIndex}`,
    );
    await this.page
      .locator('#boot-loader')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});
  }

  async setStageName(name: string): Promise<void> {
    const input = this.page.getByRole('textbox', { name: 'Stage name' });
    // Two-step fill: the auto-stage-name hook (StageEditor/autoStageName)
    // treats a label equal to its last GENERATED value as not-yet-owned — a
    // documented accepted limitation — and rewrites it when the subject or
    // content later changes (observed live: 'Quick Add Name Generator'
    // became 'Person Quick Add Name Generator' after the node type was
    // picked). Filling a differing sentinel first flips the hook's isCustom
    // latch, so the real name then sticks verbatim even when it matches a
    // generated label.
    await input.fill(`${name} (naming)`);
    await input.fill(name);
  }

  section(dataName: string): Locator {
    return this.page.locator(`[data-name="${dataName}"]`);
  }

  field(name: string): Locator {
    return this.page.locator(`[data-field-name="${name}"]`);
  }

  // Tiptap renders its contenteditable root with `role="textbox"` and either
  // `aria-label` or `aria-labelledby` (pointing at fresco-ui's own field
  // label, whose visible text equals the `label` prop the call site passed) —
  // see `RichTextEditorField` (fresco-ui/form/fields/RichTextEditor.tsx).
  // Either way Playwright's accessible-name computation resolves to the same
  // `ariaLabel` string, so a single role/name locator covers both cases.
  async fillRichText(ariaLabel: string, text: string): Promise<void> {
    const editor = this.page.getByRole('textbox', { name: ariaLabel });
    await editor.click();
    try {
      await editor.fill(text);
    } catch {
      // Tiptap intercepts real keystrokes via ProseMirror, not just a generic
      // `input` event — if `.fill()`'s synthetic event doesn't take, fall
      // back to genuine keystrokes.
      await this.page.keyboard.type(text);
    }
  }

  // Type canonical markdown into a Tiptap RichText editor the way a user
  // would: paragraphs separated by Enter, `* `/`- `/`1. ` prefixes triggering
  // the list input rules, Enter continuing list items, Enter-Enter exiting a
  // list. Inline `**bold**`/`_italic_`/`*italic*` markers convert through
  // Tiptap's mark input rules as typed. The SAVED string is the current
  // serializer's canonical form (`- ` bullets, renumbered ordered lists,
  // escaped punctuation), NOT the typed bytes — compare round-tripped
  // documents, not raw strings (see helpers/normalize-protocol.ts).
  async fillRichTextMarkdown(
    ariaLabel: string,
    markdown: string,
  ): Promise<void> {
    const box = this.page.getByRole('textbox', { name: ariaLabel });
    await box.click();
    let needsBlockBreak = false;
    // Type the TEXT a user would type, not the serialized escape: the one
    // backslash escape the canonical sample protocol contains (`\-`, an
    // escaped hyphen from its own serializer era) must be typed as a plain
    // hyphen — typing the backslash literally makes the serializer escape it
    // again (`\\\-`), which no longer parses to the same text. HTML entities
    // (`&quot;`, `&lt;`…) are typed literally on purpose: both sides parse
    // them to the same characters (verified by the build spike).
    for (const block of parseMarkdownBlocks(markdown.replaceAll('\\-', '-'))) {
      if (needsBlockBreak) {
        await this.page.keyboard.press('Enter');
      }
      if (block.kind === 'paragraph') {
        await typeInlineRun(this.page, block.text);
        needsBlockBreak = true;
        continue;
      }
      for (const [index, item] of block.items.entries()) {
        if (index === 0) {
          await this.page.keyboard.type(block.kind === 'bullet' ? '* ' : '1. ');
        } else {
          await this.page.keyboard.press('Enter');
        }
        await typeInlineRun(this.page, item);
      }
      // Exit the list: the first Enter opens an empty item, the second lifts
      // it out into a fresh paragraph — so the next block needs no break.
      await this.page.keyboard.press('Enter');
      await this.page.keyboard.press('Enter');
      needsBlockBreak = false;
    }
  }

  async expectNoIssues(): Promise<void> {
    await expect(this.page.getByTestId('issue')).toHaveCount(0);
  }

  async save(): Promise<void> {
    // "Finished Editing" only renders once the draft is dirty.
    await this.page.getByRole('button', { name: 'Finished Editing' }).click();
    await this.page.waitForURL(/\/protocol$/);
  }
}
