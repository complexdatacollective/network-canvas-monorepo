import type { FrameLocator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { clickWhenDeckSettles } from '../helpers/deck.js';

// Drives an interview inside the real app. Unlike packages/interview/e2e's
// InterviewFixture (which reads step from the ?step= URL), the app route has no
// step param — so next() reads the [data-stage-step] DOM attribute and waits for
// it to change.
//
// `root` is where the interview renders: the page itself, or the frame
// Interviewer 9 hosts Interviewer 8's interview in (the /v8/ suite).
export class InterviewNav {
  private page: Page;
  private root: Page | FrameLocator;

  constructor(page: Page, root: Page | FrameLocator = page) {
    this.page = page;
    this.root = root;
  }

  /** The same navigation, inside a frame of this page. */
  inFrame(frame: FrameLocator): InterviewNav {
    return new InterviewNav(this.page, frame);
  }

  private get stage() {
    return this.root.locator('[data-stage-step]');
  }

  async startNewSession(caseId: string): Promise<void> {
    // From an active deck card, "Start new interview" opens NewSessionForm.
    await clickWhenDeckSettles(
      this.root.getByRole('button', { name: 'Start new interview' }),
    );
    await this.root.getByTestId('new-session-case-id').fill(caseId);
    await this.root.getByTestId('new-session-submit').click();
    await expect(this.page).toHaveURL(/\/interview\//, { timeout: 15_000 });
    await this.waitForStage();
  }

  async waitForStage(): Promise<void> {
    await expect(this.root.locator('main[data-theme-interview]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(this.stage).toHaveAttribute('data-stage-step', /\d+/);
  }

  async next(): Promise<void> {
    const before = await this.stage.getAttribute('data-stage-step');
    await this.root.getByTestId('next-button').click();
    await expect
      .poll(async () => this.stage.getAttribute('data-stage-step'), {
        timeout: 20_000,
      })
      .not.toBe(before);
  }

  async back(): Promise<void> {
    const before = await this.stage.getAttribute('data-stage-step');
    await this.root.getByTestId('previous-button').click();
    await expect
      .poll(async () => this.stage.getAttribute('data-stage-step'), {
        timeout: 20_000,
      })
      .not.toBe(before);
  }

  // Exits an in-progress interview through the Shell's settings popover and its
  // confirm dialog, landing back on Home.
  async exitInterview(locale: 'en' | 'en-GB' | 'es' = 'en'): Promise<void> {
    await this.root.getByTestId('settings-button').click();
    await this.root.getByTestId('exit-button').click();
    const exitDialog = this.root.getByRole('dialog', {
      name:
        locale === 'es' ? '¿Salir de esta entrevista?' : 'Exit this interview?',
    });
    await expect(exitDialog).toBeVisible();
    await exitDialog
      .getByRole('button', {
        name: locale === 'es' ? 'Salir de la entrevista' : 'Exit interview',
      })
      .click();
    // In a frame, leaving is the host's to show.
    if (this.root === this.page) await expect(this.page).toHaveURL(/\/$/);
  }

  async fillEgoName(value: string): Promise<void> {
    const field = this.root.locator('[data-field-name="ego_name"] input');
    await field.fill(value);
    // Protocol-form fields (useProtocolForm.tsx) never pass validateOnChange
    // to fresco-ui's Field, so validation — and therefore isFormValid, which
    // gates the next-button's readiness pulse — only runs on blur, not on
    // every keystroke. .fill() leaves focus on the input, so without an
    // explicit blur the button never becomes ready.
    await field.blur();
  }

  async quickAddNode(name: string): Promise<void> {
    const toggle = this.root.getByTestId('quick-add-toggle');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click();
    }
    const input = this.root.getByTestId('quick-add-input');
    await input.fill(name);
    await input.press('Enter');
    await expect(this.root.getByRole('option', { name })).toBeVisible();
  }

  async finish(): Promise<void> {
    await expect(
      this.root.getByRole('heading', { name: 'Finish Interview' }),
    ).toBeVisible();
    await this.root.getByRole('button', { name: 'Finish' }).click();
    const dialog = this.root.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Finish Interview' }).click();
  }
}
