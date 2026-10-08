import type { Locator, Page } from '@playwright/test';

import { FormFixture } from './stage-fixture.js';

const RELEASE_KEY_DERIVATION_EVENT = 'e2e:release-key-derivation';

const SUCCESS_MESSAGES = {
  chosen: 'Passphrase set successfully! Click "Next" to continue.',
  verified: 'Passphrase accepted! Click "Next" to continue.',
  earlier:
    'You have already entered your passphrase. Click "Next" to continue.',
};

type SuccessMode = keyof typeof SUCCESS_MESSAGES;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Fixture for Anonymisation stages and the passphrase prompter.
 *
 * The stage renders an inline passphrase form over an animated
 * EncryptionBackground. In an interview without a passphrase it asks for one
 * to be chosen (Passphrase + Confirm Passphrase, with length rules); once one
 * has been chosen, a remounted interview asks for it again (one Passphrase
 * field and a line saying it was chosen earlier). Once the key is in force the
 * form is replaced by a success alert. When a later stage needs the key and it
 * is not in force, the shared PassphrasePrompter (🔑 button + dialog) appears
 * in the navigation, in both the vertical rail and the horizontal bar, in the
 * same choose or verify mode.
 *
 * Locators cite packages/interview/src/interfaces/Anonymisation/Anonymisation.tsx
 * and packages/interview/src/components/PassphrasePrompter.tsx.
 *
 * Owned by the Anonymisation matrix scenarios; instantiated directly in each
 * scenario's run() rather than hung off StageFixture.
 */
export class AnonymisationFixture {
  readonly page: Page;
  private readonly form: FormFixture;

  constructor(page: Page) {
    this.page = page;
    this.form = new FormFixture(page);
  }

  /**
   * Passphrase field — `Field name="passphrase"`, rendered both by the stage's
   * own form and by the PassphrasePrompter dialog, which is why the prompter
   * has no separate accessor: this locates whichever is present.
   */
  passphraseField(): Locator {
    return this.form.field('passphrase').locator('input');
  }

  /** Confirm field — `Field name="passphrase-2"`, only while choosing. */
  confirmField(): Locator {
    return this.form.field('passphrase-2').locator('input');
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
   * The stage's submit button, with visible text "Continue". Matched by its
   * type + visible text rather than its accessible name, because the
   * aria-label="Submit" overrides the "Continue" text for accessible-name
   * lookups.
   */
  submitButton(): Locator {
    return this.page.locator('button[type="submit"]', { hasText: 'Continue' });
  }

  async submit(): Promise<void> {
    await this.submitButton().click();
  }

  /**
   * The success alert shown once the interview's key is in force, worded for
   * how it came into force: chosen on the stage, the passphrase chosen earlier
   * entered again on it, or entered before the stage was reached. With no
   * mode it matches whichever is shown.
   */
  successAlert(mode?: SuccessMode): Locator {
    return this.page.getByText(
      mode === undefined
        ? new RegExp(
            Object.values(SUCCESS_MESSAGES).map(escapeRegExp).join('|'),
          )
        : SUCCESS_MESSAGES[mode],
    );
  }

  /**
   * The line the stage shows in place of the choosing form when a passphrase
   * was chosen earlier in this interview and has to be entered again.
   */
  chosenEarlierNotice(): Locator {
    return this.page.getByText(
      'You chose a passphrase earlier in this interview. Enter it to continue.',
    );
  }

  /** The live status line shown while an entered passphrase is checked. */
  checkingStatus(): Locator {
    return this.page
      .getByRole('status')
      .filter({ hasText: 'Checking your passphrase…' });
  }

  /** Field-level error for the passphrase field. */
  passphraseError(): Locator {
    return this.page.getByTestId('passphrase-field-error');
  }

  /** Field-level error for the confirm field. */
  confirmError(): Locator {
    return this.page.getByTestId('passphrase-2-field-error');
  }

  /**
   * Reveal the masked passphrase field — PasswordField renders one "Show
   * password" toggle per field, so target the first (the passphrase field's
   * own toggle).
   */
  async togglePasswordVisibility(): Promise<void> {
    await this.page
      .getByRole('button', { name: 'Show password' })
      .first()
      .click();
  }

  /**
   * The 🔑 PassphrasePrompter button in the navigation. Only rendered while
   * a screen needs the interview's key and it is not in force.
   */
  prompterButton(): Locator {
    return this.page.getByRole('button', {
      name: 'Enter your passphrase',
      exact: true,
    });
  }

  /**
   * The prompter dialog, titled "Choose a passphrase" in an interview without
   * one and "Enter your passphrase" in one that has one.
   */
  prompterDialog(
    name: 'Choose a passphrase' | 'Enter your passphrase',
  ): Locator {
    return this.page.getByRole('dialog', { name, exact: true });
  }

  prompterSubmitButton(): Locator {
    return this.page.getByRole('button', { name: 'Submit passphrase' });
  }

  async openPrompter(): Promise<void> {
    await this.prompterButton().click();
    await this.page.getByRole('dialog').waitFor({ state: 'visible' });
  }

  /** Enter a passphrase in the prompter's verify mode and submit it. */
  async submitPrompterPassphrase(value: string): Promise<void> {
    await this.passphraseField().fill(value);
    await this.prompterSubmitButton().click();
  }

  /** Choose a passphrase in the prompter's choose mode and submit it. */
  async choosePrompterPassphrase(value: string): Promise<void> {
    await this.fillPassphrase(value);
    await this.prompterSubmitButton().click();
  }

  /**
   * Holds every key derivation the page starts until the returned function is
   * called, so the "checking" state that otherwise lasts only as long as one
   * PBKDF2 derivation can be observed deterministically.
   */
  async holdKeyDerivation(): Promise<() => Promise<void>> {
    await this.page.evaluate((eventName) => {
      const subtle = crypto.subtle;
      const deriveKey = subtle.deriveKey;
      const released = new Promise<void>((resolve) => {
        window.addEventListener(eventName, () => resolve(), { once: true });
      });
      Object.defineProperty(subtle, 'deriveKey', {
        configurable: true,
        value: async (...args: unknown[]) => {
          await released;
          return Reflect.apply(deriveKey, subtle, args);
        },
      });
    }, RELEASE_KEY_DERIVATION_EVENT);

    return async () => {
      await this.page.evaluate((eventName) => {
        window.dispatchEvent(new Event(eventName));
      }, RELEASE_KEY_DERIVATION_EVENT);
    };
  }
}
