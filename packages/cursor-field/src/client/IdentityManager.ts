import type { CursorFieldConfig } from "../config";
import type { CursorId, SessionIdentity } from "../types";

export class IdentityManager {
	private identity: SessionIdentity | null = null;
	private readonly storageKey: string;
	private readonly persistSession: boolean;
	private readonly identityProvider?: CursorFieldConfig["identityProvider"];

	constructor(config: CursorFieldConfig) {
		this.storageKey = config.sessionStorageKey ?? "cursorfield_session";
		this.persistSession = config.persistSession ?? true;
		this.identityProvider = config.identityProvider;
	}

	async initialise(): Promise<SessionIdentity> {
		if (this.persistSession) {
			const stored = this.loadFromStorage();
			if (stored) {
				this.identity = stored;
			}
		}

		if (this.identityProvider) {
			try {
				const external = await this.identityProvider();
				if (external) {
					this.identity = {
						sessionId: this.identity?.sessionId ?? this.generateId(),
						externalId: external.externalId,
						displayName: external.displayName,
						provider: "custom",
					};
				}
			} catch {
				// Identity provider failed, fall back to anonymous
			}
		}

		if (!this.identity) {
			this.identity = {
				sessionId: this.generateId(),
				provider: "anonymous",
			};
		}

		if (this.persistSession) {
			this.saveToStorage(this.identity);
		}

		return this.identity;
	}

	getIdentity(): SessionIdentity | null {
		return this.identity;
	}

	getSessionId(): CursorId | null {
		return this.identity?.sessionId ?? null;
	}

	clearSession(): void {
		this.identity = null;
		if (this.persistSession) {
			try {
				localStorage.removeItem(this.storageKey);
			} catch {
				// localStorage may be unavailable
			}
		}
	}

	private generateId(): CursorId {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === "x" ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	private loadFromStorage(): SessionIdentity | null {
		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				return JSON.parse(stored) as SessionIdentity;
			}
		} catch {
			// localStorage may be unavailable or corrupted
		}
		return null;
	}

	private saveToStorage(identity: SessionIdentity): void {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(identity));
		} catch {
			// localStorage may be unavailable or full
		}
	}
}
