import { expect, test } from '../fixtures/test.js';
import { clickWhenDeckSettles } from '../helpers/deck.js';

// Passes the wizard's strength gate (length ≥ 12, all four character classes)
// and the vault's validatePassphrase.
const RECOVERY_PHRASE = 'Correct-Horse-Battery-42!';
// Also shape-valid, so a rejection exercises the failed DEK unwrap, not input
// validation.
const WRONG_PHRASE = 'Wrong-Horse-Battery-13!';

// All tests drive Chromium's CDP virtual authenticator (webauthn fixture);
// they run only under the chromium project, which is the only project matching
// this spec.
test.describe('biometric vault', () => {
  test('enrolment mints one passkey and dual-wraps the vault record', async ({
    webauthn,
    vault,
    page,
  }) => {
    await webauthn.install({ hasPrf: true });
    await vault.enrolBiometric(RECOVERY_PHRASE);

    // Wizard finished → Home unlocked.
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible({ timeout: 15_000 });

    // Exactly one credential was created on the authenticator (the enrolment
    // ceremony ran once and did not orphan extras).
    expect(await webauthn.credentialCount()).toBe(1);

    // The persisted record is the dual-wrapped biometric variant (the reader
    // throws on any other shape).
    const record = await vault.readPersistedBiometricVault();
    expect(record.webauthn.credentialId.length).toBeGreaterThan(0);
    expect(record.webauthn.prfSaltB64.length).toBeGreaterThan(0);
    // The recovery wrap is a real PBKDF2 envelope, independently wrapping the
    // same DEK — identical ciphertexts would mean the recovery slot re-used
    // the biometric wrap and could never be opened by the passphrase.
    expect(record.recovery.kdfIterations).toBeGreaterThanOrEqual(600_000);
    expect(record.recovery.wrappedDekB64).not.toBe(record.wrappedDekB64);
  });

  // A biometric-fails-then-biometric-succeeds sequence is deliberately absent:
  // once a UV-refused assertion fails, Chromium's virtual authenticator stays
  // blocked (like a real CTAP authenticator exhausting UV retries) — restoring
  // isUserVerified, reloading, or re-importing the credential onto a fresh
  // authenticator (which drops its PRF secret) cannot heal it. Biometric
  // unlock SUCCESS is covered by the auto-unlock test below; this test covers
  // the refusal staying locked and the recovery passphrase as the way out.
  test('a refused authenticator keeps the app locked; recovery still unlocks', async ({
    webauthn,
    vault,
    page,
  }) => {
    await webauthn.install({ hasPrf: true });
    await vault.enrolBiometric(RECOVERY_PHRASE);

    // Refuse user verification so every assertion (including the lock
    // screen's automatic attempt) is rejected by the authenticator.
    await webauthn.setUserVerified(false);
    await page.reload();

    // Reload dropped the in-memory DEK: the app re-locked, and the failed
    // automatic attempt must not have unlocked it.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();

    // The button carries this name only while no attempt is pending (during
    // one it is disabled and reads "Waiting for authenticator…"), so this
    // click cannot race the automatic attempt into an "already in progress"
    // error.
    await page.getByRole('button', { name: 'Unlock with biometrics' }).click();
    // The refusal is observed, not just inferred: the authenticator's
    // rejection surfaces in the unlock form's error alert…
    await expect(page.getByRole('alert')).toContainText(
      'Biometric authentication failed',
    );
    // …and the app is still locked.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();

    // The refusing sensor is exactly what the recovery passphrase exists for.
    await page.getByRole('button', { name: 'Recover with passphrase' }).click();
    await page.getByTestId('passphrase-input').fill(RECOVERY_PHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('the lock screen auto-unlocks via the platform authenticator', async ({
    webauthn,
    vault,
    page,
  }) => {
    await webauthn.install({ hasPrf: true });
    await vault.enrolBiometric(RECOVERY_PHRASE);

    await page.reload();
    // The lock screen attempts biometric unlock on mount, so a healthy
    // authenticator unlocks without any interaction. Not vacuous: the sibling
    // test above proves a reload with a refusing authenticator stays locked,
    // so reaching Home here required a successful PRF unlock.
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('the recovery passphrase unlocks after the passkey is lost', async ({
    webauthn,
    vault,
    interviewNav,
    page,
  }) => {
    await webauthn.install({ hasPrf: true });
    await vault.enrolBiometric(RECOVERY_PHRASE);

    // Install the sample protocol while the biometric session holds the DEK:
    // its stages are encrypted at rest under that key, giving the recovery
    // path below something real to decrypt.
    await page.getByRole('button', { name: 'Previous protocol' }).click();
    await clickWhenDeckSettles(
      page.getByRole('button', { name: 'Install sample protocol' }),
    );
    await expect(
      page.getByRole('button', { name: 'Start new interview' }),
    ).toBeVisible({ timeout: 15_000 });

    // Simulate losing the passkey (credential removed / device reset): the
    // credential disappears while the vault record — and its recovery wrap —
    // remain.
    await webauthn.clearCredentials();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Recover with passphrase' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recover with passphrase' }),
    ).toBeVisible();

    // A shape-valid but wrong passphrase fails the recovery unwrap and is
    // reported; the app stays locked.
    await page.getByTestId('passphrase-input').fill(WRONG_PHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect passphrase');

    // The correct recovery passphrase unlocks.
    await page.getByTestId('passphrase-input').fill(RECOVERY_PHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible({ timeout: 15_000 });

    // Prove the recovered DEK is the SAME key the biometric session held, not
    // merely a key that unwraps: start an interview from the protocol
    // installed before the passkey was lost — its stages render only if they
    // decrypt with the recovered DEK. (After the reload the installed
    // protocol is already the deck's active card.)
    await clickWhenDeckSettles(
      page.getByRole('button', { name: 'Start new interview' }),
    );
    await page.getByTestId('new-session-case-id').fill('biometric-recovery');
    await page.getByTestId('new-session-submit').click();

    // Entering an interview requires step-up auth; the passkey is gone there
    // too, so recovery is the step-up route as well.
    await expect(
      page.getByRole('heading', { name: 'Confirm your identity' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Recover with passphrase' }).click();
    await page.getByTestId('passphrase-input').fill(RECOVERY_PHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();

    await expect(page).toHaveURL(/\/interview\//, { timeout: 15_000 });
    await interviewNav.waitForStage();
  });

  test('enrolment fails fast when the authenticator cannot provide PRF', async ({
    webauthn,
    vault,
    page,
  }) => {
    // A platform authenticator that completes create() but cannot enable the
    // PRF extension — the shape enrolBiometric's fail-fast guards against.
    await webauthn.install({ hasPrf: false });
    await vault.attemptBiometricEnrolment(RECOVERY_PHRASE);

    // The specific fail-fast message, not the later "did not return a
    // biometric secret" read error: the check must reject at creation, before
    // prompting again.
    await expect(page.getByRole('alert')).toContainText(
      /can't create the biometric secret \(PRF\)/,
    );
    // The wizard refused to advance — the configure step is still shown…
    await expect(
      page.getByLabel('Recovery passphrase', { exact: true }),
    ).toBeVisible();
    // …and no vault record was written: a failed ceremony must not leave a
    // half-enrolled vault behind.
    expect(await vault.readPersistedVaultRaw()).toBeNull();
    // The ceremony minted a passkey before the PRF check could reject it; the
    // fail-fast drops that orphan again (signalUnknownCredential — which the
    // virtual authenticator honours, observably removing the credential).
    // Polled because the alert renders independently of the removal.
    await expect.poll(() => webauthn.credentialCount()).toBe(0);

    // The advertised fallback is actionable: Back returns to the method
    // picker with PIN still selectable.
    await page.getByTestId('wizard-back').click();
    await expect(page.locator('[data-value="pin"]')).toBeEnabled();
  });
});
