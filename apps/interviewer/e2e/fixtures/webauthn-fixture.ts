import type { CDPSession, Page } from '@playwright/test';

// Drives Chromium's CDP virtual-authenticator environment (the WebAuthn
// domain) so specs can enrol and unlock the biometric vault without any OS
// credential UI. CDP is Chromium-only; only the `chromium` project runs the
// biometric specs.
//
// Behaviour pinned by probing this repo's Playwright Chromium (v151):
// - An internal-transport authenticator with `hasPrf: true` and user
//   verification makes `isUserVerifyingPlatformAuthenticatorAvailable()`
//   report true (the wizard's availability gate), reports `prf.enabled: true`
//   at create(), and returns deterministic 32-byte PRF outputs from get().
// - With `hasPrf: false` the create() ceremony still succeeds but reports
//   `prf.enabled: false` — exactly the authenticator shape the vault's
//   enrolment fail-fast guards against.
// - `setUserVerified(false)` and `clearCredentials()` make the next assertion
//   reject immediately with NotAllowedError.
// - Removing the LAST virtual authenticator makes WebAuthn requests hang
//   forever (Chromium waits for an authenticator to appear), so a lost
//   credential is simulated with `clearCredentials()`, never by removing the
//   authenticator.
export class WebAuthnFixture {
  private page: Page;
  private client: CDPSession | null = null;
  private authenticatorId: string | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  // Install a virtual platform authenticator. Call before the app page loads
  // so the setup wizard's availability check already sees it. `hasPrf: true`
  // models a PRF-capable platform authenticator (iCloud Keychain, Windows
  // Hello); `hasPrf: false` models one that cannot derive the vault's secret
  // (e.g. Chrome's macOS profile authenticator).
  async install({ hasPrf }: { hasPrf: boolean }): Promise<void> {
    if (this.authenticatorId !== null) {
      throw new Error('A virtual authenticator is already installed');
    }
    this.client = await this.page.context().newCDPSession(this.page);
    await this.client.send('WebAuthn.enable');
    const { authenticatorId } = await this.client.send(
      'WebAuthn.addVirtualAuthenticator',
      {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          hasPrf,
          automaticPresenceSimulation: true,
        },
      },
    );
    this.authenticatorId = authenticatorId;
  }

  private installed(): { client: CDPSession; authenticatorId: string } {
    if (this.client === null || this.authenticatorId === null) {
      throw new Error('Call install() before using the virtual authenticator');
    }
    return { client: this.client, authenticatorId: this.authenticatorId };
  }

  // Whether user verification succeeds. With `false`, the vault's
  // UV-required assertions fail immediately — a deterministic stand-in for
  // "the biometric sensor rejected the user".
  async setUserVerified(isUserVerified: boolean): Promise<void> {
    const { client, authenticatorId } = this.installed();
    await client.send('WebAuthn.setUserVerified', {
      authenticatorId,
      isUserVerified,
    });
  }

  // Delete every credential while keeping the authenticator present —
  // simulates the enrolled passkey being lost (device reset, credential
  // removed) so assertions fail fast instead of hanging.
  async clearCredentials(): Promise<void> {
    const { client, authenticatorId } = this.installed();
    await client.send('WebAuthn.clearCredentials', { authenticatorId });
  }

  async credentialCount(): Promise<number> {
    const { client, authenticatorId } = this.installed();
    const { credentials } = await client.send('WebAuthn.getCredentials', {
      authenticatorId,
    });
    return credentials.length;
  }
}
