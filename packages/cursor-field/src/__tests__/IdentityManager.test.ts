import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityManager } from "../client/IdentityManager";

const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
	};
})();

Object.defineProperty(globalThis, "localStorage", {
	value: localStorageMock,
});

describe("IdentityManager", () => {
	beforeEach(() => {
		localStorageMock.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("initialise", () => {
		it("should generate anonymous session when no stored session", async () => {
			const manager = new IdentityManager({ partyHost: "test.com" });
			const identity = await manager.initialise();

			expect(identity.sessionId).toBeDefined();
			expect(identity.sessionId).toMatch(/^[a-f0-9-]{36}$/);
			expect(identity.provider).toBe("anonymous");
		});

		it("should persist session to localStorage", async () => {
			const manager = new IdentityManager({ partyHost: "test.com" });
			await manager.initialise();

			const stored = localStorage.getItem("cursorfield_session");
			expect(stored).not.toBeNull();
		});

		it("should restore session from localStorage", async () => {
			const existingSession = {
				sessionId: "existing-session-id",
				provider: "anonymous",
			};
			localStorage.setItem("cursorfield_session", JSON.stringify(existingSession));

			const manager = new IdentityManager({ partyHost: "test.com" });
			const identity = await manager.initialise();

			expect(identity.sessionId).toBe("existing-session-id");
		});

		it("should use custom storage key", async () => {
			const manager = new IdentityManager({
				partyHost: "test.com",
				sessionStorageKey: "custom_key",
			});
			await manager.initialise();

			const stored = localStorage.getItem("custom_key");
			expect(stored).not.toBeNull();
		});

		it("should not persist when persistSession is false", async () => {
			const manager = new IdentityManager({
				partyHost: "test.com",
				persistSession: false,
			});
			await manager.initialise();

			const stored = localStorage.getItem("cursorfield_session");
			expect(stored).toBeNull();
		});

		it("should use identity provider when available", async () => {
			const identityProvider = vi.fn().mockResolvedValue({
				externalId: "external-123",
				displayName: "Test User",
			});

			const manager = new IdentityManager({
				partyHost: "test.com",
				identityProvider,
			});
			const identity = await manager.initialise();

			expect(identityProvider).toHaveBeenCalled();
			expect(identity.externalId).toBe("external-123");
			expect(identity.displayName).toBe("Test User");
			expect(identity.provider).toBe("custom");
		});

		it("should fall back to anonymous if identity provider returns null", async () => {
			const identityProvider = vi.fn().mockResolvedValue(null);

			const manager = new IdentityManager({
				partyHost: "test.com",
				identityProvider,
			});
			const identity = await manager.initialise();

			expect(identity.provider).toBe("anonymous");
		});

		it("should fall back to anonymous if identity provider throws", async () => {
			const identityProvider = vi.fn().mockRejectedValue(new Error("Provider failed"));

			const manager = new IdentityManager({
				partyHost: "test.com",
				identityProvider,
			});
			const identity = await manager.initialise();

			expect(identity.provider).toBe("anonymous");
		});
	});

	describe("getIdentity", () => {
		it("should return null before initialisation", () => {
			const manager = new IdentityManager({ partyHost: "test.com" });
			expect(manager.getIdentity()).toBeNull();
		});

		it("should return identity after initialisation", async () => {
			const manager = new IdentityManager({ partyHost: "test.com" });
			await manager.initialise();

			expect(manager.getIdentity()).not.toBeNull();
		});
	});

	describe("getSessionId", () => {
		it("should return null before initialisation", () => {
			const manager = new IdentityManager({ partyHost: "test.com" });
			expect(manager.getSessionId()).toBeNull();
		});

		it("should return session ID after initialisation", async () => {
			const manager = new IdentityManager({ partyHost: "test.com" });
			await manager.initialise();

			expect(manager.getSessionId()).toMatch(/^[a-f0-9-]{36}$/);
		});
	});

	describe("clearSession", () => {
		it("should clear identity and storage", async () => {
			const manager = new IdentityManager({ partyHost: "test.com" });
			await manager.initialise();

			manager.clearSession();

			expect(manager.getIdentity()).toBeNull();
			expect(localStorage.getItem("cursorfield_session")).toBeNull();
		});
	});
});
