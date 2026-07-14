import type { Locator, Page } from '@playwright/test';

/**
 * Fixture for Anonymisation stages.
 *
 * The stage renders an inline passphrase form (two PasswordFields plus a
 * "Continue" submit) over an animated EncryptionBackground; once a passphrase
 * is set the form is replaced by a success alert. When a later stage needs to
 * decrypt an encrypted variable without a passphrase in memory, the shared
 * PassphrasePrompter (🔑/⚠️ button + overlay) appears in the vertical nav.
 *
 * Locators cite packages/interview/src/interfaces/Anonymisation/Anonymisation.tsx
 * and packages/interview/src/components/PassphrasePrompter.tsx.
 *
 * Owned by the Anonymisation matrix scenarios; instantiated directly in each
 * scenario's run() rather than hung off StageFixture.
 */
export class AnonymisationFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Passphrase field — Field name="passphrase" (Anonymisation.tsx:131-140). */
  passphraseField(): Locator {
    return this.page.locator('[data-field-name="passphrase"] input');
  }

  /** Confirm field — Field name="passphrase-2" (Anonymisation.tsx:141-150). */
  confirmField(): Locator {
    return this.page.locator('[data-field-name="passphrase-2"] input');
  }

  /** Fill both passphrase fields with the same value. */
  async fillPassphrase(value: string): Promise<void> {
    await this.passphraseField().fill(value);
    await this.confirmField().fill(value);
  }

  /** Fill the two fields with different values, to trigger the sameAs mismatch. */
  async fillMismatched(first: string, second: string): Promise<void> {
    await this.passphraseField().fill(first);
    await this.confirmField().fill(second);
  }

  /**
   * Submit button — SubmitButton with visible text "Continue"
   * (Anonymisation.tsx:151-159). Matched by its type + visible text rather
   * than its accessible name, because the aria-label="Submit" overrides the
   * "Continue" text for accessible-name lookups.
   */
  submitButton(): Locator {
    return this.page.locator('button[type="submit"]', { hasText: 'Continue' });
  }

  async submit(): Promise<void> {
    await this.submitButton().click();
  }

  /** Success alert — Alert variant="success" (Anonymisation.tsx:112-117). */
  successAlert(): Locator {
    return this.page.getByText('Passphrase set successfully!');
  }

  /** Field-level error for the passphrase field (FieldErrors.tsx:26). */
  passphraseError(): Locator {
    return this.page.getByTestId('passphrase-field-error');
  }

  /** Field-level error for the confirm field (FieldErrors.tsx:26). */
  confirmError(): Locator {
    return this.page.getByTestId('passphrase-2-field-error');
  }

  /**
   * Reveal the masked passphrase field — PasswordField.tsx:52-58 renders one
   * "Show password" toggle per field, so target the first (the passphrase
   * field's own toggle).
   */
  async togglePasswordVisibility(): Promise<void> {
    await this.page
      .getByRole('button', { name: 'Show password' })
      .first()
      .click();
  }

  /**
   * The 🔑/⚠️ PassphrasePrompter button in the vertical nav
   * (PassphrasePrompter.tsx:70-90). Only rendered when a passphrase is
   * required and not currently set/valid.
   */
  prompterButton(): Locator {
    return this.page.getByRole('button').filter({ hasText: /🔑|⚠️/ });
  }

  async openPrompter(): Promise<void> {
    await this.prompterButton().click();
    await this.page
      .getByRole('dialog', { name: 'Enter your Passphrase' })
      .waitFor({ state: 'visible' });
  }

  /** Passphrase overlay input — PassphrasePrompter.tsx:169-176 (name="passphrase"). */
  prompterPassphraseField(): Locator {
    return this.page.locator('[data-field-name="passphrase"] input');
  }

  async submitPrompterPassphrase(value: string): Promise<void> {
    await this.prompterPassphraseField().fill(value);
    await this.page.getByRole('button', { name: 'Submit passphrase' }).click();
  }
}
