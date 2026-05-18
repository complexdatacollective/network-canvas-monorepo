import { isElectron } from "../platform/platform";
import * as electronAuth from "./electron";
import * as vaultMetadata from "./vaultMetadata";
import { authenticatePasskey, createPasskey, fromBase64, isWebAuthnAvailable, toBase64 } from "./webauthn";

const PASSKEY_USER_ID = new TextEncoder().encode("interviewer-v7:device");
const PASSKEY_USER_NAME = "Network Canvas Interviewer";

// Non-Electron renderers hold the unlock flag in sessionStorage, not in a
// module-level variable: a page reload (Vite HMR escalation, F5, etc.) wipes
// module state and would otherwise re-show the LockScreen on every dev save.
// sessionStorage clears when the tab / Capacitor process is killed, which
// matches the spec's "re-lock on app close" requirement.
const WEB_UNLOCK_KEY = "interviewer-v7:web-unlocked";

function readWebUnlocked(): boolean {
	if (typeof window === "undefined") return false;
	return window.sessionStorage.getItem(WEB_UNLOCK_KEY) === "1";
}

function writeWebUnlocked(value: boolean): void {
	if (typeof window === "undefined") return;
	if (value) {
		window.sessionStorage.setItem(WEB_UNLOCK_KEY, "1");
	} else {
		window.sessionStorage.removeItem(WEB_UNLOCK_KEY);
	}
}

export function isAuthenticatorSupported(): boolean {
	if (!isWebAuthnAvailable()) return false;
	// Electron's WebAuthn implementation requires a signed binary plus entitlements +
	// app.configureWebAuthn before navigator.credentials.create()/get() will surface a
	// platform-authenticator prompt; in unsigned dev builds the call hangs silently.
	if (isElectron && !window.electronAPI?.isPackaged) return false;
	return true;
}

export async function status(): Promise<AuthStatus> {
	if (isElectron) return electronAuth.status();
	const metadata = await vaultMetadata.read();
	return {
		configured: metadata !== null,
		locked: metadata !== null && !readWebUnlocked(),
		credentialIdB64: metadata?.credentialIdB64,
		saltB64: metadata?.saltB64,
	};
}

export async function enrol(signal?: AbortSignal): Promise<{ ok: boolean; message?: string }> {
	if (!isWebAuthnAvailable()) {
		return { ok: false, message: "This browser does not support WebAuthn" };
	}
	const salt = new Uint8Array(32);
	crypto.getRandomValues(salt);
	const result = await createPasskey({
		userId: PASSKEY_USER_ID,
		userName: PASSKEY_USER_NAME,
		salt,
		signal,
	});
	if (!result.ok) {
		return { ok: false, message: result.error };
	}
	const credentialIdB64 = toBase64(result.enrolment.credentialId);
	const saltB64 = toBase64(salt);
	if (isElectron) {
		return electronAuth.setup({
			credentialIdB64,
			saltB64,
			prfOutputB64: toBase64(result.enrolment.prfOutput),
		});
	}
	await vaultMetadata.write({ credentialIdB64, saltB64 });
	writeWebUnlocked(true);
	return { ok: true };
}

export async function unlock(signal?: AbortSignal): Promise<{ ok: boolean; message?: string }> {
	const metadata = await vaultMetadata.read();
	const s = isElectron ? await electronAuth.status() : null;
	const credentialIdB64 = isElectron ? s?.credentialIdB64 : metadata?.credentialIdB64;
	const saltB64 = isElectron ? s?.saltB64 : metadata?.saltB64;
	if (!credentialIdB64 || !saltB64) {
		return { ok: false, message: "No authenticator enrolled" };
	}
	const result = await authenticatePasskey({
		credentialId: fromBase64(credentialIdB64),
		salt: fromBase64(saltB64),
		signal,
	});
	if (!result.ok) return { ok: false, message: result.error };
	if (isElectron) {
		return electronAuth.unlock({ prfOutputB64: toBase64(result.enrolment.prfOutput) });
	}
	writeWebUnlocked(true);
	return { ok: true };
}

export async function lock(): Promise<void> {
	if (isElectron) {
		await electronAuth.lock();
		return;
	}
	writeWebUnlocked(false);
}

export async function reEnrol(signal?: AbortSignal): Promise<{ ok: boolean; message?: string }> {
	if (!isWebAuthnAvailable()) {
		return { ok: false, message: "This browser does not support WebAuthn" };
	}
	const current = isElectron ? await electronAuth.status() : null;
	const metadata = isElectron ? null : await vaultMetadata.read();
	const currentCredentialIdB64 = isElectron ? current?.credentialIdB64 : metadata?.credentialIdB64;
	const currentSaltB64 = isElectron ? current?.saltB64 : metadata?.saltB64;
	if (!currentCredentialIdB64 || !currentSaltB64) {
		return { ok: false, message: "No authenticator enrolled" };
	}

	const currentAuth = await authenticatePasskey({
		credentialId: fromBase64(currentCredentialIdB64),
		salt: fromBase64(currentSaltB64),
		signal,
	});
	if (!currentAuth.ok) return { ok: false, message: currentAuth.error };

	const nextSalt = new Uint8Array(32);
	crypto.getRandomValues(nextSalt);
	const next = await createPasskey({
		userId: PASSKEY_USER_ID,
		userName: PASSKEY_USER_NAME,
		salt: nextSalt,
		signal,
	});
	if (!next.ok) return { ok: false, message: next.error };

	const nextCredentialIdB64 = toBase64(next.enrolment.credentialId);
	const nextSaltB64 = toBase64(nextSalt);
	if (isElectron) {
		return electronAuth.reEnrol({
			currentPrfOutputB64: toBase64(currentAuth.enrolment.prfOutput),
			nextCredentialIdB64,
			nextSaltB64,
			nextPrfOutputB64: toBase64(next.enrolment.prfOutput),
		});
	}
	await vaultMetadata.write({ credentialIdB64: nextCredentialIdB64, saltB64: nextSaltB64 });
	writeWebUnlocked(true);
	return { ok: true };
}

export async function revoke(): Promise<void> {
	if (isElectron) {
		await electronAuth.revoke();
		return;
	}
	await vaultMetadata.clear();
	writeWebUnlocked(false);
}
