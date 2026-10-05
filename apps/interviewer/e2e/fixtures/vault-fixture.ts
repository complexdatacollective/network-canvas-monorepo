import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Mirrors VAULT_STORAGE_KEY in src/lib/vault/vaultStore.ts (e2e code does not
// import app source).
const VAULT_STORAGE_KEY = 'interviewer:vault';

// The biometric variant of the persisted VaultRecord (vaultStore.ts): one DEK
// dual-wrapped under the PRF-derived KEK (`wrappedDekB64`) and under a
// recovery-passphrase KEK (`recovery.wrappedDekB64`).
export type PersistedBiometricVault = {
  version: number;
  mode: 'biometric';
  webauthn: { credentialId: string; prfSaltB64: string };
  wrappedDekB64: string;
  recovery: {
    kdfSaltB64: string;
    kdfIterations: number;
    wrappedDekB64: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPersistedBiometricVault(
  value: unknown,
): value is PersistedBiometricVault {
  if (!isRecord(value)) return false;
  const { webauthn, recovery } = value;
  return (
    typeof value.version === 'number' &&
    value.mode === 'biometric' &&
    typeof value.wrappedDekB64 === 'string' &&
    isRecord(webauthn) &&
    typeof webauthn.credentialId === 'string' &&
    typeof webauthn.prfSaltB64 === 'string' &&
    isRecord(recovery) &&
    typeof recovery.kdfSaltB64 === 'string' &&
    typeof recovery.kdfIterations === 'number' &&
    typeof recovery.wrappedDekB64 === 'string'
  );
}

// Enrols a real vault by driving the setup wizard (a valid unlockable record
// requires real crypto — it cannot be hand-seeded), and unlocks via LockScreen.
export class VaultFixture {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private async typeSegmented(
    fieldName: string,
    digits: string,
  ): Promise<void> {
    const inputs = this.page
      .getByTestId(`segmented-code-${fieldName}`)
      .locator('input');
    for (let i = 0; i < digits.length; i++) {
      await inputs.nth(i).fill(digits[i] ?? '');
    }
  }

  // Drives the shared /welcome wizard flow, deferring only the two
  // method-specific steps (picking the method at step 2, filling its fields at
  // step 3) so enrolPin/enrolPassphrase can't drift apart if the wizard changes.
  // Confirmed steps (headed run): 0 intro → 1 securing-data → 2 method
  // → 3 configure → 4 behaviour → 5 analytics(Finish). "Get started" opens the
  // dialog at step 0.
  private async runWizard(
    selectMethod: () => Promise<void>,
    configure: () => Promise<void>,
  ): Promise<void> {
    await this.page.goto('/welcome');
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByTestId('wizard-next').click(); // 0 → 1
    await this.page.getByTestId('wizard-next').click(); // 1 → 2 (method)
    await selectMethod();
    await this.page.getByTestId('wizard-next').click(); // 2 → 3 (configure)
    await configure();
    await this.page.getByTestId('wizard-next').click(); // 3 → 4 (behaviour)
    await this.page.getByTestId('wizard-next').click(); // 4 → 5 (analytics)
    await this.page.getByTestId('wizard-next').click(); // 5 → Finish
    // Wizard completes → redirect to Home unlocked.
    await expect(this.page).toHaveURL(/\/$/, { timeout: 15_000 });
  }

  async enrolPin(pin: string): Promise<void> {
    await this.runWizard(
      // Step 2: pick PIN (option carries data-value="pin").
      () => this.page.locator('[data-value="pin"]').click(),
      // Step 3: enter + confirm PIN, affirm no-recovery.
      async () => {
        await this.typeSegmented('pin', pin);
        await this.typeSegmented('pin-confirm', pin);
        await this.page
          .getByRole('checkbox', { name: /I understand there is no recovery/ })
          .check();
      },
    );
  }

  async enrolPassphrase(phrase: string): Promise<void> {
    await this.runWizard(
      () => this.page.locator('[data-value="passphrase"]').click(),
      // Step3PassphraseConfigure labels its fields "Enter passphrase" /
      // "Confirm passphrase" (not the field name), and Next stays disabled
      // until the no-recovery checkbox is also checked.
      async () => {
        await this.page
          .getByLabel('Enter passphrase', { exact: true })
          .fill(phrase);
        await this.page
          .getByLabel('Confirm passphrase', { exact: true })
          .fill(phrase);
        await this.page
          .getByRole('checkbox', { name: /I understand there is no recovery/ })
          .check();
      },
    );
  }

  // Step 2's biometric option is a real disabled <button> until the app's
  // availability check (IsUVPAA) resolves against the virtual authenticator;
  // Playwright's click actionability waits for it to become enabled.
  private async selectBiometricMethod(): Promise<void> {
    await this.page.locator('[data-value="biometric"]').click();
  }

  // Step3BiometricConfigure labels its fields "Recovery passphrase" /
  // "Confirm recovery passphrase"; exact matching keeps the first from also
  // matching the confirm field's label.
  private async fillRecoveryPassphrase(phrase: string): Promise<void> {
    await this.page
      .getByLabel('Recovery passphrase', { exact: true })
      .fill(phrase);
    await this.page
      .getByLabel('Confirm recovery passphrase', { exact: true })
      .fill(phrase);
  }

  // Requires a PRF-capable virtual authenticator (WebAuthnFixture.install with
  // hasPrf: true) — clicking Next on the configure step runs the real
  // create() + PRF-read ceremonies against it.
  async enrolBiometric(recoveryPhrase: string): Promise<void> {
    await this.runWizard(
      () => this.selectBiometricMethod(),
      () => this.fillRecoveryPassphrase(recoveryPhrase),
    );
  }

  // Drives the wizard to the biometric configure step and clicks Next (which
  // runs the enrolment ceremony), WITHOUT asserting wizard completion — for
  // specs that exercise enrolment failure.
  async attemptBiometricEnrolment(recoveryPhrase: string): Promise<void> {
    await this.page.goto('/welcome');
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByTestId('wizard-next').click(); // 0 → 1
    await this.page.getByTestId('wizard-next').click(); // 1 → 2 (method)
    await this.selectBiometricMethod();
    await this.page.getByTestId('wizard-next').click(); // 2 → 3 (configure)
    await this.fillRecoveryPassphrase(recoveryPhrase);
    await this.page.getByTestId('wizard-next').click(); // 3 → enrolment runs
  }

  // The raw localStorage vault slot: null means no vault record exists.
  async readPersistedVaultRaw(): Promise<string | null> {
    return this.page.evaluate(
      (key) => window.localStorage.getItem(key),
      VAULT_STORAGE_KEY,
    );
  }

  // Reads the persisted vault record and asserts it is the biometric variant,
  // throwing with the actual content otherwise so a mis-shaped record fails
  // the test loudly instead of comparing undefineds.
  async readPersistedBiometricVault(): Promise<PersistedBiometricVault> {
    const raw = await this.readPersistedVaultRaw();
    if (raw === null) {
      throw new Error('No vault record is persisted in localStorage');
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedBiometricVault(parsed)) {
      throw new Error(`Persisted vault is not a biometric record: ${raw}`);
    }
    return parsed;
  }

  async unlockPin(pin: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    // PIN auto-submits on completion — there is no manual fallback: the
    // unlock-submit button is disabled until the code is complete, and once
    // complete the form submits itself (clicking the disabled button would just
    // hang). If a submit is ever missed, the caller's unlock assertion (e.g.
    // "Sample Protocol" visible) fails loudly rather than passing silently.
    await this.typeSegmented('pin', pin);
  }

  async confirmPin(pin: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Confirm your identity' }),
    ).toBeVisible();
    await this.typeSegmented('pin', pin);
  }

  async unlockPassphrase(phrase: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await this.page.getByTestId('passphrase-input').fill(phrase);
    await this.page.getByTestId('unlock-submit').click();
  }
}
