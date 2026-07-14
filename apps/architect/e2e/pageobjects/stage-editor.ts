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
export class StageEditor {
  constructor(private readonly page: Page) {}

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

  async expectNoIssues(): Promise<void> {
    await expect(this.page.getByTestId('issue')).toHaveCount(0);
  }

  async save(): Promise<void> {
    // "Finished Editing" only renders once the draft is dirty.
    await this.page.getByRole('button', { name: 'Finished Editing' }).click();
    await this.page.waitForURL(/\/protocol$/);
  }
}
