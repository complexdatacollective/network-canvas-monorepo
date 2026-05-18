import { randomBytes, webcrypto } from "node:crypto";
import { closeDatabase, openDatabase } from "../db/service";
import {
	CURRENT_VAULT_VERSION,
	deleteVault,
	isVaultConfigured,
	readVault,
	type VaultRecord,
	writeVault,
} from "./vaultStore";

type WebCryptoKey = webcrypto.CryptoKey;
type WebBufferSource = ArrayBufferView | ArrayBuffer;

const KEY_LEN_BYTES = 32;
const IV_BYTES = 12;

let unlockedKeyHex: string | null = null;

function bytesToHex(b: Buffer): string {
	return b.toString("hex");
}

function bufToB64(b: Buffer | Uint8Array): string {
	const buf = b instanceof Buffer ? b : Buffer.from(b);
	return buf.toString("base64");
}

function b64ToBuf(b64: string): Buffer {
	return Buffer.from(b64, "base64");
}

async function importKekFromBytes(raw: Buffer): Promise<WebCryptoKey> {
	const sized = raw.length === KEY_LEN_BYTES ? raw : Buffer.from(raw.subarray(0, KEY_LEN_BYTES));
	return webcrypto.subtle.importKey("raw", sized, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function aesEncrypt(key: WebCryptoKey, plaintext: WebBufferSource): Promise<{ iv: Buffer; ciphertext: Buffer }> {
	const iv = randomBytes(IV_BYTES);
	const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
	return { iv, ciphertext: Buffer.from(ct) };
}

async function aesDecrypt(key: WebCryptoKey, iv: WebBufferSource, ciphertext: WebBufferSource): Promise<Buffer> {
	const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return Buffer.from(pt);
}

export async function status(): Promise<{
	configured: boolean;
	locked: boolean;
	credentialIdB64?: string;
	saltB64?: string;
}> {
	const record = readVault();
	return {
		configured: isVaultConfigured(),
		locked: unlockedKeyHex === null,
		credentialIdB64: record?.credentialIdB64,
		saltB64: record?.saltB64,
	};
}

// WebAuthn PRF derives a KEK that unwraps a random DEK; envelope encryption
// keeps re-enrolment cheap (no full DB re-encrypt).
export async function setup(args: {
	credentialIdB64: string;
	saltB64: string;
	prfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!args.prfOutputB64) {
		return { ok: false, message: "WebAuthn PRF extension is required and was not provided" };
	}
	if (isVaultConfigured()) {
		return { ok: false, message: "Vault already configured" };
	}
	try {
		const dek = randomBytes(KEY_LEN_BYTES);
		const prf = b64ToBuf(args.prfOutputB64);
		const kek = await importKekFromBytes(prf);
		const wrapped = await aesEncrypt(kek, dek);
		const record: VaultRecord = {
			version: CURRENT_VAULT_VERSION,
			credentialIdB64: args.credentialIdB64,
			saltB64: args.saltB64,
			wrapIvB64: bufToB64(wrapped.iv),
			wrapCiphertextB64: bufToB64(wrapped.ciphertext),
		};
		writeVault(record);
		const hex = bytesToHex(dek);
		openDatabase(hex);
		unlockedKeyHex = hex;
		return { ok: true };
	} catch (cause) {
		return { ok: false, message: cause instanceof Error ? cause.message : String(cause) };
	}
}

export async function unlock(args: { prfOutputB64: string }): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!args.prfOutputB64) {
		return { ok: false, message: "WebAuthn PRF extension is required and was not provided" };
	}
	const record = readVault();
	if (!record) return { ok: false, message: "Vault not configured" };
	try {
		const prf = b64ToBuf(args.prfOutputB64);
		const kek = await importKekFromBytes(prf);
		let dek: Buffer;
		try {
			dek = await aesDecrypt(kek, b64ToBuf(record.wrapIvB64), b64ToBuf(record.wrapCiphertextB64));
		} catch {
			return { ok: false, message: "Authenticator unwrap failed" };
		}
		const hex = bytesToHex(dek);
		openDatabase(hex);
		unlockedKeyHex = hex;
		return { ok: true };
	} catch (cause) {
		return { ok: false, message: cause instanceof Error ? cause.message : String(cause) };
	}
}

export async function lock(): Promise<void> {
	closeDatabase();
	unlockedKeyHex = null;
}

// Unwraps the DEK with the current PRF, re-wraps with the new PRF, then writes
// the new VaultRecord. The old record persists until the new wrap succeeds.
export async function reEnrol(args: {
	currentPrfOutputB64: string;
	nextCredentialIdB64: string;
	nextSaltB64: string;
	nextPrfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!args.currentPrfOutputB64 || !args.nextPrfOutputB64) {
		return { ok: false, message: "WebAuthn PRF extension is required and was not provided" };
	}
	const record = readVault();
	if (!record) return { ok: false, message: "Vault not configured" };
	try {
		const currentKek = await importKekFromBytes(b64ToBuf(args.currentPrfOutputB64));
		let dek: Buffer;
		try {
			dek = await aesDecrypt(currentKek, b64ToBuf(record.wrapIvB64), b64ToBuf(record.wrapCiphertextB64));
		} catch {
			return { ok: false, message: "Current authenticator unwrap failed" };
		}
		const nextKek = await importKekFromBytes(b64ToBuf(args.nextPrfOutputB64));
		const wrapped = await aesEncrypt(nextKek, dek);
		const next: VaultRecord = {
			version: CURRENT_VAULT_VERSION,
			credentialIdB64: args.nextCredentialIdB64,
			saltB64: args.nextSaltB64,
			wrapIvB64: bufToB64(wrapped.iv),
			wrapCiphertextB64: bufToB64(wrapped.ciphertext),
		};
		writeVault(next);
		return { ok: true };
	} catch (cause) {
		return { ok: false, message: cause instanceof Error ? cause.message : String(cause) };
	}
}

export async function revoke(): Promise<void> {
	await lock();
	deleteVault();
}
