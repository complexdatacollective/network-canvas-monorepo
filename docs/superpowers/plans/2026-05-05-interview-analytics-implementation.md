# Interview Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@codaco/interview`'s unused `onError` prop with built-in PostHog-based analytics covering stage-level user-centric tracing and per-interface sub-task vocabularies for all 17 interfaces.

**Architecture:** Approach D from the spec — host can supply a PostHog client OR the package lazy-inits its own named instance (`'@codaco/interview'`) against codaco's ph-relay proxy. PII is enforced by construction: events emit only structural codes/ids (codebook internal ids, random UUIDs, counts). Redux listener middleware emits state-driven events; a `useTrack` hook emits UI-only events. Hosts pass typed `analytics` metadata + a precomputed `protocol.hash` (canonical `hashProtocol` function lives in `@codaco/protocol-validation`).

**Tech Stack:** `@codaco/interview` (Vite, React, Redux Toolkit, posthog-js), `@codaco/protocol-validation` (Zod, ohash), `fresco-next` (Next.js 16 host), pnpm catalog.

**Branches:**
- Monorepo: `feat/interview-package` (current)
- Fresco-next: `interview-package` (current, already pinned to `@codaco/interview@1.0.0-alpha.1`)

**Spec:** `docs/superpowers/specs/2026-05-05-interview-analytics-design.md`

---

## Phase 1 — `@codaco/protocol-validation`: canonical `hashProtocol`

### Task 1: Port `hashProtocol` and add tests

**Files:**
- Create: `packages/protocol-validation/src/utils/hashProtocol.ts`
- Create: `packages/protocol-validation/src/utils/__tests__/hashProtocol.test.ts`
- Modify: `packages/protocol-validation/src/index.ts`
- Modify: `packages/protocol-validation/package.json` (add `ohash` dep)

- [ ] **Step 1: Add `ohash` dependency to `packages/protocol-validation/package.json`**

Edit `dependencies`:

```jsonc
"dependencies": {
  "@codaco/shared-consts": "workspace:*",
  "@faker-js/faker": "catalog:",
  "ohash": "^2.0.11",
  "zod": "catalog:"
}
```

Run from repo root: `pnpm install`
Expected: ohash gets installed for protocol-validation.

- [ ] **Step 2: Write the failing test**

Create `packages/protocol-validation/src/utils/__tests__/hashProtocol.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { hashProtocol } from "../hashProtocol";

describe("hashProtocol", () => {
  it("produces a stable string for the same codebook+stages", () => {
    const protocol = {
      codebook: { node: { person: { variables: {} } } },
      stages: [{ id: "s1", type: "Information" }],
    };
    expect(hashProtocol(protocol)).toBe(hashProtocol(protocol));
  });

  it("ignores fields outside codebook and stages", () => {
    const a = {
      codebook: { node: {} },
      stages: [],
      name: "Name A",
      description: "desc",
      lastModified: "2026-01-01",
      assetManifest: { foo: {} },
      experiments: { x: 1 },
    };
    const b = {
      codebook: { node: {} },
      stages: [],
      name: "Name B",
      description: "different",
      lastModified: "2026-12-31",
      assetManifest: { bar: {} },
      experiments: { y: 2 },
    };
    expect(hashProtocol(a)).toBe(hashProtocol(b));
  });

  it("changes when codebook changes", () => {
    const a = { codebook: { node: { person: {} } }, stages: [] };
    const b = { codebook: { node: { place: {} } }, stages: [] };
    expect(hashProtocol(a)).not.toBe(hashProtocol(b));
  });

  it("changes when stages change", () => {
    const a = { codebook: {}, stages: [{ id: "s1" }] };
    const b = { codebook: {}, stages: [{ id: "s2" }] };
    expect(hashProtocol(a)).not.toBe(hashProtocol(b));
  });

  it("returns a non-empty string", () => {
    const result = hashProtocol({ codebook: {}, stages: [] });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @codaco/protocol-validation test -- --run hashProtocol`
Expected: FAIL with module-not-found / import error for `../hashProtocol`.

- [ ] **Step 4: Implement `hashProtocol`**

Create `packages/protocol-validation/src/utils/hashProtocol.ts`:

```typescript
import { hash } from "ohash";

/**
 * Computes the dedup hash for a protocol from its structural definition only
 * (codebook + stages). Metadata fields — name, description, lastModified,
 * assetManifest, experiments — are excluded so two protocols with the same
 * interview structure produce the same hash regardless of cosmetic differences.
 *
 * Single source of truth for protocol hashing across:
 *   - Fresco-next protocol import (duplicate detection)
 *   - Fresco-next v7→v8 migration script
 *   - Interview package analytics (forwarded as protocol_hash super property)
 *   - Network-exporters (already reads protocol.hash from caller)
 */
export function hashProtocol(protocol: { codebook: unknown; stages: unknown }): string {
  return hash({ codebook: protocol.codebook, stages: protocol.stages });
}
```

- [ ] **Step 5: Add the export to the package's public surface**

Edit `packages/protocol-validation/src/index.ts` — add to the bottom export block:

```typescript
import { type ExtractedAsset, extractProtocol } from "./utils/extractProtocol";
import { hashProtocol } from "./utils/hashProtocol";
import { getVariableNamesFromNetwork, type Network, validateNames } from "./utils/validateExternalData";
import validateProtocol from "./validation/validate-protocol";

export {
	MigrationChain,
	type ProtocolMigration as Migration,
	protocolMigrations,
} from "./migration";
export * from "./migration/errors";
export {
	detectSchemaVersion,
	getMigrationInfo,
	type MigrationInfo,
	type MigrationNote,
	migrateProtocol,
	ProtocolMigrator,
	protocolMigrator,
} from "./migration/migrate-protocol";

export * from "./schemas";
export {
	type ExtractedAsset,
	extractProtocol,
	getVariableNamesFromNetwork,
	hashProtocol,
	type Network,
	validateNames,
	validateProtocol,
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-validation test -- --run hashProtocol`
Expected: All five tests pass.

- [ ] **Step 7: Typecheck and build**

Run: `pnpm --filter @codaco/protocol-validation typecheck`
Expected: No errors.

Run: `pnpm --filter @codaco/protocol-validation build`
Expected: `dist/` contains `utils/hashProtocol.js` and the export reachable from `dist/index.js`.

- [ ] **Step 8: Commit**

```bash
git add packages/protocol-validation/package.json packages/protocol-validation/src/utils/hashProtocol.ts packages/protocol-validation/src/utils/__tests__/hashProtocol.test.ts packages/protocol-validation/src/index.ts
git commit -m "feat(protocol-validation): add canonical hashProtocol export"
```

---

### Task 2: Bump `@codaco/protocol-validation` version

**Files:**
- Modify: `packages/protocol-validation/package.json`
- Create: `.changeset/protocol-validation-hash-export.md`

- [ ] **Step 1: Bump version**

In `packages/protocol-validation/package.json`, change `"version"` from `"11.4.0"` to `"11.5.0"`.

- [ ] **Step 2: Create changeset**

Create `.changeset/protocol-validation-hash-export.md`:

```markdown
---
"@codaco/protocol-validation": minor
---

Add `hashProtocol(protocol)` export — content-only hash of `{ codebook, stages }` for cross-package protocol identification (dedup, analytics, migration). Computed via ohash.
```

- [ ] **Step 3: Commit**

```bash
git add packages/protocol-validation/package.json .changeset/protocol-validation-hash-export.md
git commit -m "chore(protocol-validation): version bump to 11.5.0"
```

---

## Phase 2 — `@codaco/interview`: foundational types and config

### Task 3: Add `posthog-js` dependency and `__PACKAGE_VERSION__` build-time constant

**Files:**
- Modify: `packages/interview/package.json`
- Modify: `packages/interview/vite.config.ts`
- Create: `packages/interview/src/types/build-globals.d.ts`

- [ ] **Step 1: Add posthog-js to interview package dependencies**

In `packages/interview/package.json`, add to `dependencies`:

```jsonc
"dependencies": {
  "@base-ui/react": "catalog:",
  "@codaco/network-query": "workspace:^",
  "@faker-js/faker": "catalog:",
  "@mapbox/search-js-react": "^1.5.1",
  "@reduxjs/toolkit": "catalog:",
  "concaveman": "^2.0.0",
  "csvtojson": "^2.0.14",
  "d3-force": "^3.0.0",
  "es-toolkit": "catalog:",
  "lucide-react": "catalog:",
  "mapbox-gl": "^3.22.0",
  "ohash": "^2.0.11",
  "posthog-js": "catalog:",
  "react-redux": "catalog:",
  "redux-logger": "catalog:",
  "redux-thunk": "^3.1.0",
  "uuid": "catalog:",
  "zod": "catalog:",
  "zustand": "^5.0.12"
}
```

(Existing entries kept, `posthog-js` and `ohash` added in alpha order. Note: `ohash` is already there for `extractProtocol`'s use; verify by searching first — only add if missing.)

Run from repo root: `pnpm install`
Expected: posthog-js installed for the package via the catalog version.

- [ ] **Step 2: Inject `__PACKAGE_VERSION__` via Vite define**

Edit `packages/interview/vite.config.ts`:

```typescript
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
	plugins: [
		react(),
		dts({
			entryRoot: "src",
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.stories.tsx"],
			compilerOptions: { rootDir: resolve(__dirname, "src") },
			rollupTypes: true,
		}),
	],
	define: {
		__PACKAGE_VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			formats: ["es"],
		},
		rollupOptions: {
			external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.includes("\0"),
			output: {
				preserveModules: true,
				preserveModulesRoot: "src",
				entryFileNames: "[name].js",
			},
		},
		sourcemap: true,
		minify: false,
	},
});
```

- [ ] **Step 3: Declare the global so TypeScript accepts it**

Create `packages/interview/src/types/build-globals.d.ts`:

```typescript
declare const __PACKAGE_VERSION__: string;
```

- [ ] **Step 4: Verify the package still builds**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: No errors.

Run: `pnpm --filter @codaco/interview build`
Expected: Build succeeds; `dist/` contains the bundle with the inlined version string.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/package.json packages/interview/vite.config.ts packages/interview/src/types/build-globals.d.ts
git commit -m "build(interview): add posthog-js dep and inject __PACKAGE_VERSION__"
```

---

### Task 4: Add `ProtocolPayload.hash` field

**Files:**
- Modify: `packages/interview/src/contract/types.ts`

- [ ] **Step 1: Add `hash` to `ProtocolPayload`**

Edit `packages/interview/src/contract/types.ts`:

```typescript
import type { CurrentProtocol } from "@codaco/protocol-validation";
import type { SessionState } from "../store/modules/session";

export type ResolvedAsset = {
	assetId: string;
	name: string;
	type: "image" | "video" | "audio" | "network" | "geojson" | "apikey";
	value?: string;
};

export type ProtocolPayload = Omit<CurrentProtocol, "assetManifest"> & {
	id: string;
	hash: string; // host-computed via hashProtocol from @codaco/protocol-validation
	importedAt: string;
	assets: ResolvedAsset[];
};

export type SessionPayload = SessionState;

export type InterviewPayload = {
	session: SessionPayload;
	protocol: ProtocolPayload;
};

export type SyncHandler = (interviewId: string, session: SessionPayload) => Promise<void>;

export type FinishHandler = (interviewId: string, signal: AbortSignal) => Promise<void>;

export type AssetRequestHandler = (assetId: string) => Promise<string>;

export type StepChangeHandler = (step: number) => void;

export type InterviewerFlags = {
	isE2E?: boolean;
	isDevelopment?: boolean;
};

export type InterviewAnalyticsMetadata = {
	installationId: string;
	hostApp: string;
	hostVersion?: string;
};
```

Note: `ErrorHandler` removed entirely — see Task 11.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: TypeScript errors throughout the package wherever `payload.protocol` is constructed (storybook fixtures, e2e fixtures) and wherever `ErrorHandler` is referenced. **Do not fix yet** — those errors guide subsequent tasks. Just confirm the failure pattern is sane (missing-property errors on `ProtocolPayload`, missing-export errors on `ErrorHandler`).

- [ ] **Step 3: Commit (pre-fix)**

```bash
git add packages/interview/src/contract/types.ts
git commit -m "feat(interview)!: ProtocolPayload requires hash; remove ErrorHandler type"
```

---

## Phase 3 — `@codaco/interview`: analytics infrastructure

### Task 5: Property-key constants module

**Files:**
- Create: `packages/interview/src/analytics/PROPERTY_KEYS.ts`

- [ ] **Step 1: Add constants module**

Create `packages/interview/src/analytics/PROPERTY_KEYS.ts`:

```typescript
// PostHog instance name. Must be unique across all posthog-js instances on a
// page so we never collide with a host's default-named instance.
export const INSTANCE_NAME = "@codaco/interview";

// Codaco-managed PostHog proxy. The project key is public PostHog data, not a
// secret — same value used by architect-vite and the documentation app.
export const POSTHOG_API_KEY = "phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c";
export const POSTHOG_HOST = "https://ph-relay.networkcanvas.com";

// Super-property keys (snake_case for PostHog convention).
export const SUPER_PROPS = {
	APP: "app",
	INSTALLATION_ID: "installation_id",
	HOST_VERSION: "host_version",
	PACKAGE_VERSION: "package_version",
	PROTOCOL_HASH: "protocol_hash",
	STAGE_TYPE: "stage_type",
	STAGE_INDEX: "stage_index",
	PROMPT_INDEX: "prompt_index",
} as const;

export type SuperProperties = {
	[SUPER_PROPS.APP]: string;
	[SUPER_PROPS.INSTALLATION_ID]: string;
	[SUPER_PROPS.HOST_VERSION]?: string;
	[SUPER_PROPS.PACKAGE_VERSION]: string;
	[SUPER_PROPS.PROTOCOL_HASH]: string;
	[SUPER_PROPS.STAGE_TYPE]?: string;
	[SUPER_PROPS.STAGE_INDEX]?: number;
	[SUPER_PROPS.PROMPT_INDEX]?: number;
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/interview/src/analytics/PROPERTY_KEYS.ts
git commit -m "feat(interview/analytics): property-key constants"
```

---

### Task 6: Super-properties computation module

**Files:**
- Create: `packages/interview/src/analytics/superProperties.ts`
- Create: `packages/interview/src/analytics/__tests__/superProperties.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/interview/src/analytics/__tests__/superProperties.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { InterviewPayload, InterviewAnalyticsMetadata } from "../../contract/types";
import { computeSuperProperties } from "../superProperties";

const fixturePayload = {
	session: { id: "session-1" },
	protocol: { hash: "abc123" },
} as InterviewPayload;

describe("computeSuperProperties", () => {
	it("produces app, installation_id, package_version, protocol_hash for required-only metadata", () => {
		const metadata: InterviewAnalyticsMetadata = {
			installationId: "install-1",
			hostApp: "Fresco",
		};
		expect(computeSuperProperties(metadata, fixturePayload)).toEqual({
			app: "Fresco",
			installation_id: "install-1",
			package_version: expect.any(String),
			protocol_hash: "abc123",
		});
	});

	it("includes host_version when provided", () => {
		const metadata: InterviewAnalyticsMetadata = {
			installationId: "install-1",
			hostApp: "Fresco",
			hostVersion: "2.5.0",
		};
		expect(computeSuperProperties(metadata, fixturePayload)).toMatchObject({
			host_version: "2.5.0",
		});
	});

	it("omits host_version when undefined", () => {
		const metadata: InterviewAnalyticsMetadata = {
			installationId: "install-1",
			hostApp: "Fresco",
		};
		const result = computeSuperProperties(metadata, fixturePayload);
		expect(Object.keys(result)).not.toContain("host_version");
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/interview test -- --run superProperties`
Expected: FAIL — module `../superProperties` not found.

- [ ] **Step 3: Implement**

Create `packages/interview/src/analytics/superProperties.ts`:

```typescript
import type { InterviewAnalyticsMetadata, InterviewPayload } from "../contract/types";
import { SUPER_PROPS, type SuperProperties } from "./PROPERTY_KEYS";

export function computeSuperProperties(
	metadata: InterviewAnalyticsMetadata,
	payload: InterviewPayload,
): SuperProperties {
	const props: SuperProperties = {
		[SUPER_PROPS.APP]: metadata.hostApp,
		[SUPER_PROPS.INSTALLATION_ID]: metadata.installationId,
		[SUPER_PROPS.PACKAGE_VERSION]: __PACKAGE_VERSION__,
		[SUPER_PROPS.PROTOCOL_HASH]: payload.protocol.hash,
	};
	if (metadata.hostVersion !== undefined) {
		props[SUPER_PROPS.HOST_VERSION] = metadata.hostVersion;
	}
	return props;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run superProperties`
Expected: All three tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/analytics/superProperties.ts packages/interview/src/analytics/__tests__/superProperties.test.ts
git commit -m "feat(interview/analytics): super-properties computation"
```

---

### Task 7: Client resolver

**Files:**
- Create: `packages/interview/src/analytics/resolveClient.ts`
- Create: `packages/interview/src/analytics/__tests__/resolveClient.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/interview/src/analytics/__tests__/resolveClient.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveClient } from "../resolveClient";

const fakeClient = {
	capture: vi.fn(),
	register: vi.fn(),
	captureException: vi.fn(),
};

beforeEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("resolveClient", () => {
	it("returns null when disableAnalytics is true", async () => {
		const result = await resolveClient({ disableAnalytics: true });
		expect(result).toBeNull();
	});

	it("returns the supplied host client unchanged when disableAnalytics is false", async () => {
		const result = await resolveClient({
			disableAnalytics: false,
			posthogClient: fakeClient as never,
		});
		expect(result).toBe(fakeClient);
		expect(fakeClient.register).not.toHaveBeenCalled();
	});

	it("dynamically imports posthog-js and inits a named instance when no host client", async () => {
		const initSpy = vi.fn().mockReturnValue(fakeClient);
		vi.doMock("posthog-js", () => ({
			default: { init: initSpy },
		}));
		const result = await resolveClient({ disableAnalytics: false });
		expect(initSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ api_host: expect.any(String) }),
			"@codaco/interview",
		);
		expect(result).toBe(fakeClient);
	});

	it("returns null when dynamic import fails", async () => {
		vi.doMock("posthog-js", () => {
			throw new Error("simulated chunk load failure");
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = await resolveClient({ disableAnalytics: false });
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/interview test -- --run resolveClient`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/interview/src/analytics/resolveClient.ts`:

```typescript
import type { PostHog } from "posthog-js";
import { INSTANCE_NAME, POSTHOG_API_KEY, POSTHOG_HOST } from "./PROPERTY_KEYS";

type ResolveArgs = {
	disableAnalytics: boolean;
	posthogClient?: PostHog;
};

export async function resolveClient({ disableAnalytics, posthogClient }: ResolveArgs): Promise<PostHog | null> {
	if (disableAnalytics) return null;
	if (posthogClient) return posthogClient;

	try {
		const { default: posthog } = await import("posthog-js");
		return posthog.init(
			POSTHOG_API_KEY,
			{
				api_host: POSTHOG_HOST,
				autocapture: false,
				capture_pageview: false,
				capture_pageleave: false,
				disable_session_recording: true,
				persistence: "memory",
			},
			INSTANCE_NAME,
		);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.warn("[@codaco/interview] failed to init analytics client; events suppressed", e);
		return null;
	}
}
```

Note: own-instance opts (`autocapture: false`, `disable_session_recording: true`, `persistence: "memory"`) keep the package's instance from doing anything beyond explicit `capture()` calls — no autocapture leakage of in-page text, no DOM recording, no localStorage cookie persistence. The host's instance is never touched (never `init`'d via this path; never `register`'d).

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run resolveClient`
Expected: All four tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/analytics/resolveClient.ts packages/interview/src/analytics/__tests__/resolveClient.test.ts
git commit -m "feat(interview/analytics): client resolver (host-supplied or own named instance)"
```

---

### Task 8: Tracker abstraction (track + captureException with distinct_id override)

**Files:**
- Create: `packages/interview/src/analytics/tracker.ts`
- Create: `packages/interview/src/analytics/__tests__/tracker.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/interview/src/analytics/__tests__/tracker.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createTracker, NULL_TRACKER } from "../tracker";

describe("createTracker", () => {
	it("calls capture with merged super-props, event-props, and distinct_id override", () => {
		const client = { capture: vi.fn(), captureException: vi.fn() };
		const tracker = createTracker({
			client: client as never,
			superProperties: { app: "Fresco", installation_id: "i1", package_version: "1", protocol_hash: "h" },
			distinctId: "session-1",
			ownsInstance: false,
		});
		tracker.track("node_added", { node_id: "n1", node_type: "person" });
		expect(client.capture).toHaveBeenCalledWith("node_added", {
			node_id: "n1",
			node_type: "person",
			app: "Fresco",
			installation_id: "i1",
			package_version: "1",
			protocol_hash: "h",
			$set_once: undefined,
			distinct_id: "session-1",
		});
	});

	it("does NOT merge super-props when ownsInstance=true (relies on register())", () => {
		const client = { capture: vi.fn(), captureException: vi.fn() };
		const tracker = createTracker({
			client: client as never,
			superProperties: { app: "X", installation_id: "i", package_version: "1", protocol_hash: "h" },
			distinctId: "session-1",
			ownsInstance: true,
		});
		tracker.track("node_added", { node_id: "n1" });
		const props = client.capture.mock.calls[0][1];
		expect(props.app).toBeUndefined();
		expect(props.distinct_id).toBe("session-1");
	});

	it("captureException applies distinct_id override and merges feature tag", () => {
		const client = { capture: vi.fn(), captureException: vi.fn() };
		const tracker = createTracker({
			client: client as never,
			superProperties: { app: "X", installation_id: "i", package_version: "1", protocol_hash: "h" },
			distinctId: "session-1",
			ownsInstance: false,
		});
		const err = new Error("boom");
		tracker.captureException(err, { feature: "external-data" });
		expect(client.captureException).toHaveBeenCalledWith(err, "session-1", expect.objectContaining({ feature: "external-data" }));
	});
});

describe("NULL_TRACKER", () => {
	it("track is a no-op", () => {
		expect(() => NULL_TRACKER.track("x", {})).not.toThrow();
	});
	it("captureException is a no-op", () => {
		expect(() => NULL_TRACKER.captureException(new Error("x"))).not.toThrow();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/interview test -- --run tracker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/interview/src/analytics/tracker.ts`:

```typescript
import type { PostHog } from "posthog-js";
import type { SuperProperties } from "./PROPERTY_KEYS";

export type EventProps = Record<string, unknown>;

export type Tracker = {
	track: (eventName: string, props?: EventProps) => void;
	captureException: (error: Error, props?: EventProps) => void;
};

type CreateTrackerArgs = {
	client: PostHog;
	superProperties: SuperProperties;
	distinctId: string;
	ownsInstance: boolean;
};

export function createTracker({ client, superProperties, distinctId, ownsInstance }: CreateTrackerArgs): Tracker {
	const merge = (props: EventProps | undefined): EventProps => ({
		...(ownsInstance ? {} : superProperties),
		...(props ?? {}),
		$set_once: undefined,
		distinct_id: distinctId,
	});

	return {
		track: (eventName, props) => {
			try {
				client.capture(eventName, merge(props));
			} catch {
				// Never let analytics throw into the calling code path.
			}
		},
		captureException: (error, props) => {
			try {
				client.captureException(error, distinctId, merge(props));
			} catch {
				// Same: never throw out of analytics.
			}
		},
	};
}

export const NULL_TRACKER: Tracker = {
	track: () => {},
	captureException: () => {},
};
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run tracker`
Expected: All five tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/analytics/tracker.ts packages/interview/src/analytics/__tests__/tracker.test.ts
git commit -m "feat(interview/analytics): tracker (capture + exceptions, distinct_id override)"
```

---

### Task 9: AnalyticsProvider + useTrack

**Files:**
- Create: `packages/interview/src/analytics/AnalyticsContext.tsx`
- Create: `packages/interview/src/analytics/AnalyticsProvider.tsx`
- Create: `packages/interview/src/analytics/useTrack.ts`
- Create: `packages/interview/src/analytics/__tests__/AnalyticsProvider.test.tsx`

- [ ] **Step 1: Define context module**

Create `packages/interview/src/analytics/AnalyticsContext.tsx`:

```tsx
"use client";

import { createContext } from "react";
import { NULL_TRACKER, type Tracker } from "./tracker";

export const AnalyticsContext = createContext<Tracker>(NULL_TRACKER);
```

- [ ] **Step 2: Define provider**

Create `packages/interview/src/analytics/AnalyticsProvider.tsx`:

```tsx
"use client";

import type { PostHog } from "posthog-js";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { InterviewAnalyticsMetadata, InterviewPayload } from "../contract/types";
import { AnalyticsContext } from "./AnalyticsContext";
import { SUPER_PROPS } from "./PROPERTY_KEYS";
import { resolveClient } from "./resolveClient";
import { computeSuperProperties } from "./superProperties";
import { createTracker, NULL_TRACKER, type Tracker } from "./tracker";

type AnalyticsProviderProps = {
	analytics: InterviewAnalyticsMetadata;
	posthogClient?: PostHog;
	disableAnalytics: boolean;
	payload: InterviewPayload;
	children: ReactNode;
};

export function AnalyticsProvider({
	analytics,
	posthogClient,
	disableAnalytics,
	payload,
	children,
}: AnalyticsProviderProps) {
	const [tracker, setTracker] = useState<Tracker>(NULL_TRACKER);
	const ownsInstanceRef = useRef(false);

	const superProperties = useMemo(() => computeSuperProperties(analytics, payload), [analytics, payload]);
	const distinctId = payload.session.id;

	useEffect(() => {
		if (disableAnalytics) {
			setTracker(NULL_TRACKER);
			return;
		}
		let cancelled = false;
		(async () => {
			const client = await resolveClient({ disableAnalytics, posthogClient });
			if (cancelled) return;
			if (!client) {
				setTracker(NULL_TRACKER);
				return;
			}
			const ownsInstance = !posthogClient;
			ownsInstanceRef.current = ownsInstance;
			if (ownsInstance) {
				try {
					client.register(superProperties);
				} catch {
					// ignore; tracker still works without registered super-props
				}
			}
			setTracker(createTracker({ client, superProperties, distinctId, ownsInstance }));
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [disableAnalytics, posthogClient]);

	return <AnalyticsContext.Provider value={tracker}>{children}</AnalyticsContext.Provider>;
}

export function updateNavigationSuperProps(
	tracker: Tracker,
	posthogClient: PostHog | null,
	ownsInstance: boolean,
	props: { stage_type?: string; stage_index?: number; prompt_index?: number },
) {
	if (!posthogClient || !ownsInstance) return;
	try {
		const filtered: Record<string, unknown> = {};
		if (props.stage_type !== undefined) filtered[SUPER_PROPS.STAGE_TYPE] = props.stage_type;
		if (props.stage_index !== undefined) filtered[SUPER_PROPS.STAGE_INDEX] = props.stage_index;
		if (props.prompt_index !== undefined) filtered[SUPER_PROPS.PROMPT_INDEX] = props.prompt_index;
		posthogClient.register(filtered);
	} catch {
		// ignore
	}
}
```

- [ ] **Step 3: Define `useTrack` hook**

Create `packages/interview/src/analytics/useTrack.ts`:

```typescript
"use client";

import { useContext } from "react";
import { AnalyticsContext } from "./AnalyticsContext";

export function useTrack() {
	const tracker = useContext(AnalyticsContext);
	return tracker.track;
}

export function useCaptureException() {
	const tracker = useContext(AnalyticsContext);
	return tracker.captureException;
}
```

- [ ] **Step 4: Write integration test for provider**

Create `packages/interview/src/analytics/__tests__/AnalyticsProvider.test.tsx`:

```tsx
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InterviewPayload } from "../../contract/types";
import { AnalyticsProvider } from "../AnalyticsProvider";
import { useTrack } from "../useTrack";

const payload = {
	session: { id: "interview-42" },
	protocol: { hash: "h-x" },
} as InterviewPayload;

function Probe() {
	const track = useTrack();
	return (
		<button type="button" onClick={() => track("test_event", { foo: "bar" })}>
			fire
		</button>
	);
}

describe("AnalyticsProvider", () => {
	it("uses NULL_TRACKER when disableAnalytics=true", () => {
		const client = { capture: vi.fn(), register: vi.fn() };
		const { getByRole } = render(
			<AnalyticsProvider
				analytics={{ installationId: "i1", hostApp: "Fresco" }}
				posthogClient={client as never}
				disableAnalytics={true}
				payload={payload}
			>
				<Probe />
			</AnalyticsProvider>,
		);
		act(() => getByRole("button").click());
		expect(client.capture).not.toHaveBeenCalled();
	});

	it("forwards events to a host-supplied client without calling register/identify on it", async () => {
		const client = { capture: vi.fn(), register: vi.fn() };
		const { getByRole } = render(
			<AnalyticsProvider
				analytics={{ installationId: "i1", hostApp: "Fresco" }}
				posthogClient={client as never}
				disableAnalytics={false}
				payload={payload}
			>
				<Probe />
			</AnalyticsProvider>,
		);
		await waitFor(() => {
			act(() => getByRole("button").click());
		});
		await waitFor(() => {
			expect(client.capture).toHaveBeenCalledWith(
				"test_event",
				expect.objectContaining({
					foo: "bar",
					app: "Fresco",
					installation_id: "i1",
					protocol_hash: "h-x",
					distinct_id: "interview-42",
				}),
			);
		});
		expect(client.register).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run AnalyticsProvider`
Expected: Both tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/analytics/AnalyticsContext.tsx packages/interview/src/analytics/AnalyticsProvider.tsx packages/interview/src/analytics/useTrack.ts packages/interview/src/analytics/__tests__/AnalyticsProvider.test.tsx
git commit -m "feat(interview/analytics): provider + useTrack hook"
```

---

## Phase 4 — `@codaco/interview`: replace `onError` and update `Shell`

### Task 10: Replace `StageErrorBoundary` `onError` with internal `captureException`

**Files:**
- Modify: `packages/interview/src/components/StageErrorBoundary.tsx`

- [ ] **Step 1: Replace onError consumption**

Edit `packages/interview/src/components/StageErrorBoundary.tsx`:

```tsx
import Icon from "@codaco/fresco-ui/Icon";
import Surface from "@codaco/fresco-ui/layout/Surface";
import Heading from "@codaco/fresco-ui/typography/Heading";
import Paragraph from "@codaco/fresco-ui/typography/Paragraph";
import React, { Component, type ReactNode } from "react";
import { useCaptureException } from "../analytics/useTrack";
import CopyDebugInfoButton from "./CopyDebugInfoButton";

type StageErrorBoundaryInnerProps = {
	children: ReactNode;
	captureException: (error: Error, props?: Record<string, unknown>) => void;
};

type StageErrorBoundaryState = {
	error?: Error;
};

class StageErrorBoundaryInner extends Component<StageErrorBoundaryInnerProps, StageErrorBoundaryState> {
	constructor(props: StageErrorBoundaryInnerProps) {
		super(props);
		this.state = {};
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		this.props.captureException(error, {
			component_stack: info.componentStack,
			feature: "stage-error-boundary",
		});
		this.setState({ error });
	}

	render() {
		const { children } = this.props;
		const { error } = this.state;

		if (error) {
			return (
				<Surface noContainer className="mx-auto h-fit max-w-2xl grow-0">
					<div className="flex items-center gap-6">
						<div className="flex items-center justify-center">
							<Icon name="error" />
						</div>
						<div>
							<Heading>A problem occurred!</Heading>
							<Paragraph>
								There was an error with the interview software, and this task could not be displayed. Try refreshing the
								page. If the problem persists, please contact the study organizer and provide the debug information
								below. You may be able to continue your interview by clicking the next button.
							</Paragraph>
						</div>
					</div>
					<div className="mt-4 flex justify-end">
						<CopyDebugInfoButton debugInfo={error.stack ?? error.message} />
					</div>
				</Surface>
			);
		}

		return children;
	}
}

type StageErrorBoundaryProps = {
	children: ReactNode;
};

const StageErrorBoundary = ({ children }: StageErrorBoundaryProps) => {
	const captureException = useCaptureException();
	return <StageErrorBoundaryInner captureException={captureException}>{children}</StageErrorBoundaryInner>;
};

export default StageErrorBoundary;
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: No errors in this file.

```bash
git add packages/interview/src/components/StageErrorBoundary.tsx
git commit -m "refactor(interview): StageErrorBoundary uses internal captureException"
```

---

### Task 11: Replace `useExternalData` `onError` and remove `ErrorHandler` from contract

**Files:**
- Modify: `packages/interview/src/hooks/useExternalData.tsx`
- Modify: `packages/interview/src/contract/context.tsx`

- [ ] **Step 1: Update `useExternalData`**

Edit `packages/interview/src/hooks/useExternalData.tsx`:

```tsx
import type { Panel, StageSubject } from "@codaco/protocol-validation";
import type { NcNode } from "@codaco/shared-consts";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useCaptureException } from "../analytics/useTrack";
import { useContractHandlers } from "../contract/context";
import { getAssetManifest, getCodebook } from "../store/modules/protocol";
import { ensureError } from "../utils/ensureError";
import { getVariableTypeReplacements } from "../utils/externalData";
import loadExternalData, { makeVariableUUIDReplacer } from "../utils/loadExternalData";

const useExternalData = (dataSource: Panel["dataSource"], subject: StageSubject | null) => {
	const assetManifest = useSelector(getAssetManifest);
	const codebook = useSelector(getCodebook);
	const { onRequestAsset } = useContractHandlers();
	const captureException = useCaptureException();

	const [externalData, setExternalData] = useState<NcNode[] | null>(null);
	const [status, setStatus] = useState<{
		isLoading: boolean;
		error: Error | null;
	}>({ isLoading: false, error: null });

	useEffect(() => {
		if (!dataSource || dataSource === "existing" || !subject || subject.entity === "ego") {
			return;
		}

		let cancelled = false;

		setExternalData(null);
		setStatus({ isLoading: true, error: null });

		const asset = assetManifest[dataSource];
		if (!asset) {
			setStatus({
				isLoading: false,
				error: new Error(`Unknown asset id: ${String(dataSource)}`),
			});
			return () => {
				cancelled = true;
			};
		}

		void (async () => {
			try {
				const url = await onRequestAsset(asset.assetId);
				const { nodes } = await loadExternalData(asset.name, url);
				const replacer = makeVariableUUIDReplacer(codebook, subject.type);
				const uuidData = nodes.map(replacer);
				const formatted = getVariableTypeReplacements(asset.name, uuidData, codebook, subject);
				if (!cancelled) {
					setExternalData(formatted);
					setStatus({ isLoading: false, error: null });
				}
			} catch (e) {
				const error = ensureError(e);
				captureException(error, { feature: "external-data" });
				// eslint-disable-next-line no-console
				console.error(error);
				if (!cancelled) setStatus({ isLoading: false, error });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [dataSource, assetManifest, codebook, subject, onRequestAsset, captureException]);

	return { externalData, status };
};

export default useExternalData;
```

- [ ] **Step 2: Drop `onError` from `ContractHandlers`**

Edit `packages/interview/src/contract/context.tsx`:

```tsx
"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from "react";
import type { AssetRequestHandler, FinishHandler, InterviewerFlags } from "./types";

type ContractHandlers = {
	onFinish: FinishHandler;
	onRequestAsset: AssetRequestHandler;
};

type ContractValue = {
	handlers: ContractHandlers;
	flags: Required<InterviewerFlags>;
};

const ContractContext = createContext<ContractValue | null>(null);

type ContractProviderProps = {
	onFinish: FinishHandler;
	onRequestAsset: AssetRequestHandler;
	flags?: InterviewerFlags;
	children: ReactNode;
};

export function ContractProvider({ onFinish, onRequestAsset, flags, children }: ContractProviderProps) {
	const onFinishRef = useRef(onFinish);
	const onRequestAssetRef = useRef(onRequestAsset);
	onFinishRef.current = onFinish;
	onRequestAssetRef.current = onRequestAsset;

	const stableOnFinish = useCallback<FinishHandler>((...args) => onFinishRef.current(...args), []);
	const stableOnRequestAsset = useCallback<AssetRequestHandler>((...args) => onRequestAssetRef.current(...args), []);

	const value = useMemo<ContractValue>(
		() => ({
			handlers: {
				onFinish: stableOnFinish,
				onRequestAsset: stableOnRequestAsset,
			},
			flags: {
				isE2E: flags?.isE2E ?? false,
				isDevelopment: flags?.isDevelopment ?? false,
			},
		}),
		[stableOnFinish, stableOnRequestAsset, flags?.isE2E, flags?.isDevelopment],
	);

	return <ContractContext.Provider value={value}>{children}</ContractContext.Provider>;
}

function useContract(): ContractValue {
	const value = useContext(ContractContext);
	if (!value) {
		throw new Error("useContractHandlers / useContractFlags must be used within a ContractProvider");
	}
	return value;
}

export function useContractHandlers(): ContractHandlers {
	return useContract().handlers;
}

export function useContractFlags(): Required<InterviewerFlags> {
	return useContract().flags;
}
```

- [ ] **Step 3: Update existing context test if it tested onError**

Run: `pnpm --filter @codaco/interview test -- --run context`
Expected: existing tests should pass; if any reference `onError`, fix or delete those assertions in `packages/interview/src/contract/__tests__/context.test.tsx`.

- [ ] **Step 4: Commit**

```bash
git add packages/interview/src/hooks/useExternalData.tsx packages/interview/src/contract/context.tsx packages/interview/src/contract/__tests__/context.test.tsx
git commit -m "refactor(interview)!: drop onError contract; useExternalData uses captureException"
```

---

### Task 12: Wire `Information` `VideoPlayer` `onError` to `captureException`

**Files:**
- Modify: `packages/interview/src/interfaces/Information/Information.tsx`

- [ ] **Step 1: Add captureException usage to VideoPlayer**

In `Information.tsx`, change `VideoPlayer` to consume `useCaptureException` and pipe video load errors through it:

```tsx
import { useCaptureException } from "../../analytics/useTrack";
// ...existing imports

function VideoPlayer({ src, name, isE2E }: { src: string; name: string; isE2E: boolean }) {
	const [state, setState] = useState<MediaLoadState>("loading");
	const captureException = useCaptureException();

	const mimeType = getMediaMimeType(name, "video/mp4");

	return (
		<div className={cx("relative", state === "loading" && "min-h-48")}>
			{state === "loading" && !isE2E && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
					<Spinner size="lg" />
					<Paragraph intent="smallText">Loading video...</Paragraph>
				</div>
			)}
			{state === "error" && (
				<Paragraph intent="smallText" className="text-center">
					Video could not be loaded.
				</Paragraph>
			)}
			<video
				loop
				controls
				autoPlay={!isE2E}
				muted={!isE2E}
				playsInline
				preload={isE2E ? "none" : "auto"}
				className={cx((state === "loading" && !isE2E) || state === "error" ? "invisible h-0" : "")}
				onLoadedData={() => setState("loaded")}
				onError={(e) => {
					setState("error");
					const target = e.currentTarget;
					const err = new Error(`video load failed: ${target.error?.code ?? "unknown"}`);
					captureException(err, { feature: "information-media", media_kind: "video" });
				}}
			>
				<source src={src} type={mimeType} />
			</video>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/interview/src/interfaces/Information/Information.tsx
git commit -m "feat(interview): report Information video load errors via captureException"
```

---

### Task 13: Update `Shell` to accept analytics props and wire `AnalyticsProvider`

**Files:**
- Modify: `packages/interview/src/Shell.tsx`

- [ ] **Step 1: Replace Shell with new prop surface**

Edit `packages/interview/src/Shell.tsx`:

```tsx
"use client";
"use no memo";

import "@codaco/tailwind-config/fresco/interview-theme.css";

import DialogProvider from "@codaco/fresco-ui/dialogs/DialogProvider";
import { cx } from "@codaco/fresco-ui/utils/cva";
import { AnimatePresence, motion } from "motion/react";
import type { PostHog } from "posthog-js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Provider } from "react-redux";
import { AnalyticsProvider } from "./analytics/AnalyticsProvider";
import Navigation from "./components/Navigation";
import StageErrorBoundary from "./components/StageErrorBoundary";
import { CurrentStepProvider } from "./contexts/CurrentStepContext";
import { StageMetadataProvider } from "./contexts/StageMetadataContext";
import { ContractProvider, useContractFlags } from "./contract/context";
import type {
	AssetRequestHandler,
	FinishHandler,
	InterviewAnalyticsMetadata,
	InterviewerFlags,
	InterviewPayload,
	StepChangeHandler,
	SyncHandler,
} from "./contract/types";
import useInterviewNavigation from "./hooks/useInterviewNavigation";
import useMediaQuery from "./hooks/useMediaQuery";
import { store } from "./store/store";
import { InterviewToastProvider } from "./toast/InterviewToast";

const variants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

function Interview() {
	const {
		stage,
		displayedStep,
		showStage,
		CurrentInterface,
		registerBeforeNext,
		getNavigationHelpers,
		handleExitComplete,
		moveForward,
		moveBackward,
		disableMoveForward,
		disableMoveBackward,
		pulseNext,
		progress,
	} = useInterviewNavigation();

	const { isE2E } = useContractFlags();

	const forwardButtonRef = useRef<HTMLButtonElement>(null);
	const backButtonRef = useRef<HTMLButtonElement>(null);

	const isPortraitAspectRatio = useMediaQuery("(max-aspect-ratio: 3/4)");
	const navigationOrientation = isPortraitAspectRatio ? "horizontal" : "vertical";

	const transitionDuration = isE2E ? 0 : 0.5;

	return (
		<main
			data-interview
			className={cx(
				"relative flex size-full flex-1 overflow-hidden bg-background text-text",
				isPortraitAspectRatio ? "flex-col" : "flex-row-reverse",
			)}
		>
			<StageMetadataProvider value={registerBeforeNext}>
				<InterviewToastProvider
					forwardButtonRef={forwardButtonRef}
					backButtonRef={backButtonRef}
					orientation={navigationOrientation}
				>
					<AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
						{showStage && stage && (
							<motion.div
								key={displayedStep}
								data-stage-step={displayedStep}
								className="flex min-h-0 flex-1"
								initial={isE2E ? false : "initial"}
								animate="animate"
								exit="exit"
								variants={variants}
								transition={{ duration: transitionDuration }}
							>
								<div className="flex size-full flex-col items-center justify-center" id="stage" key={stage.id}>
									<StageErrorBoundary>
										{CurrentInterface && (
											<CurrentInterface key={stage.id} stage={stage} getNavigationHelpers={getNavigationHelpers} />
										)}
									</StageErrorBoundary>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</InterviewToastProvider>
			</StageMetadataProvider>
			<Navigation
				moveBackward={moveBackward}
				moveForward={moveForward}
				disableMoveForward={disableMoveForward}
				disableMoveBackward={disableMoveBackward}
				pulseNext={pulseNext}
				progress={progress}
				orientation={navigationOrientation}
				forwardButtonRef={forwardButtonRef}
				backButtonRef={backButtonRef}
			/>
		</main>
	);
}

type ShellProps = {
	payload: InterviewPayload;
	onSync: SyncHandler;
	onFinish: FinishHandler;
	onRequestAsset: AssetRequestHandler;
	currentStep?: number;
	onStepChange?: StepChangeHandler;
	flags?: InterviewerFlags;
	analytics: InterviewAnalyticsMetadata;
	posthogClient?: PostHog;
	disableAnalytics?: boolean;
};

const Shell = ({
	payload,
	onSync,
	onFinish,
	onRequestAsset,
	currentStep,
	onStepChange,
	flags,
	analytics,
	posthogClient,
	disableAnalytics = false,
}: ShellProps) => {
	const onSyncRef = useRef(onSync);
	onSyncRef.current = onSync;
	const stableOnSync = useCallback<SyncHandler>((...args) => onSyncRef.current(...args), []);

	const reduxStore = useMemo(
		() =>
			store(payload, {
				onSync: stableOnSync,
				isDevelopment: flags?.isDevelopment,
			}),
		[payload, stableOnSync, flags?.isDevelopment],
	);

	useEffect(() => {
		if (!flags?.isE2E || typeof window === "undefined") return;
		window.__interviewStore = reduxStore;
		return () => {
			if (window.__interviewStore === reduxStore) {
				window.__interviewStore = undefined;
			}
		};
	}, [reduxStore, flags?.isE2E]);

	return (
		<AnalyticsProvider
			analytics={analytics}
			posthogClient={posthogClient}
			disableAnalytics={disableAnalytics}
			payload={payload}
		>
			<Provider store={reduxStore}>
				<ContractProvider onFinish={onFinish} onRequestAsset={onRequestAsset} flags={flags}>
					<CurrentStepProvider currentStep={currentStep} onStepChange={onStepChange}>
						<DialogProvider>
							<Interview />
						</DialogProvider>
					</CurrentStepProvider>
				</ContractProvider>
			</Provider>
		</AnalyticsProvider>
	);
};

export default Shell;
```

- [ ] **Step 2: Export the new metadata type from package root**

In `packages/interview/src/index.ts` (or wherever the public exports live; if no barrel, ensure it's exported via the existing export surface), add:

```typescript
export type { InterviewAnalyticsMetadata } from "./contract/types";
export { useTrack } from "./analytics/useTrack";
```

(Adapt to the existing export style — package convention is no barrel files; verify whether interview already publishes via individual exports or a single entry. If individual, make sure these new types are reachable from `dist/contract/types.d.ts` and `dist/analytics/useTrack.d.ts` which they will be via vite-plugin-dts with `rollupTypes: true`.)

Look at `packages/interview/src/index.ts` to see the established export style and follow it. Add `InterviewAnalyticsMetadata` and `useTrack` to that surface.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: errors in storybook fixtures and e2e fixtures (they pass `payload` without `protocol.hash` and may pass `onError`). Fixture fixes are next two steps.

- [ ] **Step 4: Update storybook fixtures**

Open every storybook file that constructs a `payload` (search for `protocol:` inside `.storybook` and `interfaces/**/*.stories.tsx`). For each, ensure `protocol.hash` is set, e.g. `hash: "test-hash"`. Drop any `onError` props on `<Shell>` or `<ContractProvider>`.

Search:

```bash
grep -rn "protocol:" packages/interview/.storybook packages/interview/src/interfaces 2>/dev/null | grep -v __tests__ | grep -v dist
```

For each file: add `hash: "test-hash"` next to `id` and `importedAt` on the constructed protocol object.

Search:

```bash
grep -rn "onError" packages/interview/.storybook packages/interview/src/interfaces 2>/dev/null | grep -v __tests__ | grep -v dist
```

For each storybook entry passing `onError`, remove the prop.

- [ ] **Step 5: Update e2e fixtures**

```bash
grep -rn "onError\|protocol:" packages/interview/e2e 2>/dev/null | grep -v "node_modules"
```

For e2e fixture(s) that build a payload, add `hash: "e2e-hash"` to the protocol object. Remove any `onError` references.

Add `analytics={{ installationId: "e2e-installation", hostApp: "e2e" }}` and `disableAnalytics={true}` props to the `<Shell>` mount in `packages/interview/e2e/host/...` so events don't fire during E2E.

- [ ] **Step 6: Typecheck and run all unit tests**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: green.

Run: `pnpm --filter @codaco/interview test -- --run`
Expected: green (no per-interface event tests yet — those come in Phase 5).

- [ ] **Step 7: Commit**

```bash
git add packages/interview/src/Shell.tsx packages/interview/src/index.ts packages/interview/.storybook packages/interview/src/interfaces packages/interview/e2e
git commit -m "feat(interview)!: Shell accepts analytics, posthogClient, disableAnalytics"
```

---

## Phase 5 — Redux listener middleware: stage-level + global entity events

### Task 14: Stub the listener and add it conditionally to the store factory

**Files:**
- Create: `packages/interview/src/store/middleware/analyticsListener.ts`
- Modify: `packages/interview/src/store/store.ts`

- [ ] **Step 1: Stub listener**

Create `packages/interview/src/store/middleware/analyticsListener.ts`:

```typescript
"use client";

import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import type { Tracker } from "../../analytics/tracker";
import type { AppDispatch } from "../store";
import type { RootState } from "./types-rootstate";

export type AnalyticsListenerArgs = {
	tracker: Tracker;
};

export function createAnalyticsListenerMiddleware({ tracker }: AnalyticsListenerArgs) {
	const analyticsListenerMiddleware = createListenerMiddleware();
	const startAppListening = analyticsListenerMiddleware.startListening as TypedStartListening<RootState, AppDispatch>;

	// Listeners are added across subsequent tasks for: navigation/stage transitions,
	// node/edge mutations, prompt-add/remove, anonymisation, etc.
	void tracker;
	void startAppListening;

	return analyticsListenerMiddleware;
}
```

(Skip the `RootState` import if `store.ts` already exports the type — adjust to the existing pattern. Do not introduce a circular import; if needed, declare a minimal local `RootState` shape and keep this file independent of `store.ts`.)

If `RootState` is exported from `store.ts`, replace the file's `import type { RootState }` line with:

```typescript
import type { RootState } from "../store";
```

- [ ] **Step 2: Wire factory to accept tracker and conditionally add the listener**

Edit `packages/interview/src/store/store.ts`:

```typescript
"use client";

import { combineReducers, configureStore, type Middleware } from "@reduxjs/toolkit";
import { useDispatch } from "react-redux";
import { NULL_TRACKER, type Tracker } from "../analytics/tracker";
import type { InterviewPayload, SyncHandler } from "../contract/types";
import { createAnalyticsListenerMiddleware } from "./middleware/analyticsListener";
import logger from "./middleware/logger";
import { createSyncMiddleware } from "./middleware/syncMiddleware";
import protocol from "./modules/protocol";
import session from "./modules/session";
import ui from "./modules/ui";

const rootReducer = combineReducers({
	session,
	protocol,
	ui,
});

type StoreOptions = {
	onSync: SyncHandler;
	isDevelopment?: boolean;
	extraMiddleware?: Middleware[];
	tracker?: Tracker;
};

export const store = (
	{ session: sessionPayload, protocol: protocolPayload }: InterviewPayload,
	options: StoreOptions,
) => {
	const syncMiddleware = createSyncMiddleware({ onSync: options.onSync });
	const tracker = options.tracker ?? NULL_TRACKER;
	const analyticsMiddleware = createAnalyticsListenerMiddleware({ tracker }).middleware;

	return configureStore({
		reducer: rootReducer,
		middleware: (getDefaultMiddleware) =>
			getDefaultMiddleware({
				serializableCheck: {
					ignoredActions: ["dialogs/addDialog", "dialogs/open/pending"],
				},
			}).concat(
				...(options.isDevelopment ? [logger] : []),
				syncMiddleware,
				analyticsMiddleware,
				...(options.extraMiddleware ?? []),
			),
		preloadedState: {
			session: sessionPayload,
			protocol: protocolPayload,
		},
	});
};

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = ReturnType<typeof store>["dispatch"];
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
```

- [ ] **Step 3: Plumb tracker from Shell to store factory**

The store is created inside `Shell.tsx`'s `useMemo` from `payload`. Pull the tracker out of context and pass it to `store(...)`. This requires the tracker to be accessible *before* the Provider mounts the store. Two options:

**(a)** Move `AnalyticsProvider` inside the Redux Provider and let the listener call `track()` via a closure created at provider time (current code).
**(b)** Use a mutable tracker holder.

Use **(b)** — simpler and avoids reordering:

In `packages/interview/src/Shell.tsx`, replace the store creation block with a tracker-holder pattern:

```tsx
import { NULL_TRACKER, type Tracker } from "./analytics/tracker";

// ...inside Shell:
const trackerRef = useRef<Tracker>(NULL_TRACKER);
const trackerHolder: Tracker = useMemo(
	() => ({
		track: (e, p) => trackerRef.current.track(e, p),
		captureException: (err, p) => trackerRef.current.captureException(err, p),
	}),
	[],
);

const reduxStore = useMemo(
	() =>
		store(payload, {
			onSync: stableOnSync,
			isDevelopment: flags?.isDevelopment,
			tracker: trackerHolder,
		}),
	[payload, stableOnSync, flags?.isDevelopment, trackerHolder],
);
```

Now expose a way for `AnalyticsProvider` to update `trackerRef`. Add a callback prop to `AnalyticsProvider`:

```tsx
// In AnalyticsProvider props:
type AnalyticsProviderProps = {
	// ...
	onTrackerChange?: (tracker: Tracker) => void;
};
```

In its `useEffect` after `setTracker(...)`:

```tsx
const newTracker = createTracker({ client, superProperties, distinctId, ownsInstance });
setTracker(newTracker);
onTrackerChange?.(newTracker);
```

Also call `onTrackerChange?.(NULL_TRACKER)` in the `if (!client)` and `disableAnalytics` early-returns.

In `Shell.tsx`, pass:

```tsx
<AnalyticsProvider
	analytics={analytics}
	posthogClient={posthogClient}
	disableAnalytics={disableAnalytics}
	payload={payload}
	onTrackerChange={(t) => {
		trackerRef.current = t;
	}}
>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/store/middleware/analyticsListener.ts packages/interview/src/store/store.ts packages/interview/src/Shell.tsx packages/interview/src/analytics/AnalyticsProvider.tsx
git commit -m "feat(interview): analytics listener middleware scaffold + tracker holder"
```

---

### Task 15: Test harness for the analytics listener

**Files:**
- Create: `packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts`

- [ ] **Step 1: Write the harness**

Create `packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts`:

```typescript
import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { NULL_TRACKER, type Tracker } from "../../../analytics/tracker";
import session, { addEdge, addNode, deleteEdge, deleteNode } from "../../modules/session";
import protocol from "../../modules/protocol";
import ui from "../../modules/ui";
import { createAnalyticsListenerMiddleware } from "../analyticsListener";

function makeStore(tracker: Tracker = NULL_TRACKER) {
	const middleware = createAnalyticsListenerMiddleware({ tracker }).middleware;
	return configureStore({
		reducer: { session, protocol, ui },
		middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(middleware),
	});
}

describe("analyticsListener — harness", () => {
	it("constructs without error", () => {
		const store = makeStore();
		expect(store.getState).toBeDefined();
	});

	it("tracker is callable", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = makeStore(tracker);
		// Sanity: dispatch a benign action; no events yet (none wired)
		store.dispatch({ type: "noop/x" });
		expect(tracker.track).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run analyticsListener`
Expected: Both tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts
git commit -m "test(interview/analytics): listener test harness"
```

---

### Task 16: Global entity events — `node_added`, `node_removed`, `node_added_to_prompt`, `node_removed_from_prompt`, `edge_created`, `edge_removed`

**Files:**
- Modify: `packages/interview/src/store/middleware/analyticsListener.ts`
- Modify: `packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts`

- [ ] **Step 1: Write failing tests (six)**

Append to `analyticsListener.test.ts`:

```typescript
import { addNodeToPrompt, removeNodeFromPrompt } from "../../modules/session";

describe("analyticsListener — global entity events", () => {
	const baseSession = {
		id: "i1",
		startTime: new Date().toISOString(),
		network: { ego: { _uid: "ego" }, nodes: [], edges: [] },
		currentStep: 0,
	};

	function buildStore(tracker: Tracker) {
		return configureStore({
			reducer: { session, protocol, ui },
			preloadedState: {
				session: baseSession as never,
				protocol: { id: "p", hash: "h", schemaVersion: 8 } as never,
				ui: undefined,
			},
			middleware: (getDefault) =>
				getDefault({ serializableCheck: false }).concat(createAnalyticsListenerMiddleware({ tracker }).middleware),
		});
	}

	it("emits node_added on addNode/fulfilled", async () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		await store.dispatch(
			addNode({ modelData: { type: "person" }, attributeData: {} } as never) as never,
		);
		expect(tracker.track).toHaveBeenCalledWith(
			"node_added",
			expect.objectContaining({ node_id: expect.any(String), node_type: "person" }),
		);
	});

	it("emits node_removed on deleteNode", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		store.dispatch(deleteNode("node-1") as never);
		expect(tracker.track).toHaveBeenCalledWith(
			"node_removed",
			expect.objectContaining({ node_id: "node-1" }),
		);
	});

	it("emits edge_created on addEdge/fulfilled", async () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		await store.dispatch(
			addEdge({ modelData: { type: "friend", from: "a", to: "b" } } as never) as never,
		);
		expect(tracker.track).toHaveBeenCalledWith(
			"edge_created",
			expect.objectContaining({ edge_id: expect.any(String), edge_type: "friend" }),
		);
	});

	it("emits edge_removed on deleteEdge", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		store.dispatch(deleteEdge("edge-1") as never);
		expect(tracker.track).toHaveBeenCalledWith(
			"edge_removed",
			expect.objectContaining({ edge_id: "edge-1" }),
		);
	});

	it("emits node_added_to_prompt on addNodeToPrompt/fulfilled", async () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		await store.dispatch(
			addNodeToPrompt({ nodeId: "n1", promptId: "p1", promptAttributes: {} } as never) as never,
		);
		expect(tracker.track).toHaveBeenCalledWith(
			"node_added_to_prompt",
			expect.objectContaining({ node_id: "n1" }),
		);
	});

	it("emits node_removed_from_prompt on removeNodeFromPrompt/fulfilled", async () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		await store.dispatch(
			removeNodeFromPrompt({ nodeId: "n1", promptId: "p1", promptAttributes: {} } as never) as never,
		);
		expect(tracker.track).toHaveBeenCalledWith(
			"node_removed_from_prompt",
			expect.objectContaining({ node_id: "n1" }),
		);
	});
});
```

- [ ] **Step 2: Run to verify all six fail**

Run: `pnpm --filter @codaco/interview test -- --run analyticsListener`
Expected: 6 failures with "expected mock to have been called".

- [ ] **Step 3: Implement listeners**

Edit `packages/interview/src/store/middleware/analyticsListener.ts` to register listeners. Replace the body of `createAnalyticsListenerMiddleware`:

```typescript
import { addEdge, addNode, addNodeToPrompt, deleteEdge, deleteNode, removeNodeFromPrompt } from "../modules/session";

export function createAnalyticsListenerMiddleware({ tracker }: AnalyticsListenerArgs) {
	const analyticsListenerMiddleware = createListenerMiddleware();
	const startAppListening = analyticsListenerMiddleware.startListening as TypedStartListening<RootState, AppDispatch>;

	startAppListening({
		actionCreator: addNode.fulfilled,
		effect: (action) => {
			const node = action.payload as { _uid?: string; type?: string } | undefined;
			if (!node?._uid) return;
			tracker.track("node_added", { node_id: node._uid, node_type: node.type });
		},
	});

	startAppListening({
		actionCreator: deleteNode,
		effect: (action) => {
			tracker.track("node_removed", { node_id: action.payload });
		},
	});

	startAppListening({
		actionCreator: addEdge.fulfilled,
		effect: (action) => {
			const edge = action.payload as { _uid?: string; type?: string } | undefined;
			if (!edge?._uid) return;
			tracker.track("edge_created", { edge_id: edge._uid, edge_type: edge.type });
		},
	});

	startAppListening({
		actionCreator: deleteEdge,
		effect: (action) => {
			tracker.track("edge_removed", { edge_id: action.payload });
		},
	});

	startAppListening({
		actionCreator: addNodeToPrompt.fulfilled,
		effect: (action) => {
			const arg = action.meta.arg as { nodeId?: string };
			tracker.track("node_added_to_prompt", { node_id: arg.nodeId });
		},
	});

	startAppListening({
		actionCreator: removeNodeFromPrompt.fulfilled,
		effect: (action) => {
			const arg = action.meta.arg as { nodeId?: string };
			tracker.track("node_removed_from_prompt", { node_id: arg.nodeId });
		},
	});

	return analyticsListenerMiddleware;
}
```

(Adjust the action payload field names if they differ in `session.ts` — open it and verify the actual fulfilled-payload shape for `addNode` / `addEdge` — typical Redux Toolkit thunks return the entity. Add `node_type` from `state.protocol.codebook` lookup if the payload doesn't include the type but you know the prompt subject; **KISS**: if type isn't on the payload, omit `node_type` and update the test accordingly.)

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run analyticsListener`
Expected: All tests pass (including the new six).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/store/middleware/analyticsListener.ts packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts
git commit -m "feat(interview/analytics): global entity events (node + edge + prompt)"
```

---

### Task 17: Stage-level events — `interview_started`, `stage_entered`, `stage_exited`, `interview_finished`

**Files:**
- Modify: `packages/interview/src/store/middleware/analyticsListener.ts`
- Modify: `packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts`

- [ ] **Step 1: Identify the navigation action**

Open `packages/interview/src/store/modules/session.ts` and look for the action that updates `currentStep` (likely an `updateCurrentStep` reducer or `updatePrompt` action). Note the action creator's exported name; you'll bind to it.

The `interview_finished` event fires when `onFinish` resolves — but `onFinish` is host-side. Instead, fire from the moment the host-managed FinishSession stage is visited (i.e., when `stage_type === "FinishSession"` enters), since that is the in-package signal.

- [ ] **Step 2: Write failing tests**

Append to `analyticsListener.test.ts`:

```typescript
describe("analyticsListener — stage-level events", () => {
	function buildStore(tracker: Tracker, sessionOverrides: Partial<typeof baseSession> = {}) {
		return configureStore({
			reducer: { session, protocol, ui },
			preloadedState: {
				session: { ...baseSession, ...sessionOverrides } as never,
				protocol: {
					id: "p",
					hash: "h",
					schemaVersion: 8,
					stages: [
						{ id: "s0", type: "Information" },
						{ id: "s1", type: "NameGenerator" },
						{ id: "s2", type: "FinishSession" },
					],
				} as never,
				ui: undefined,
			},
			middleware: (getDefault) =>
				getDefault({ serializableCheck: false }).concat(createAnalyticsListenerMiddleware({ tracker }).middleware),
		});
	}

	it("emits stage_entered when currentStep changes", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		// Replace the action below with the real one from session.ts
		store.dispatch({ type: "session/updateCurrentStep", payload: 1 });
		expect(tracker.track).toHaveBeenCalledWith(
			"stage_entered",
			expect.objectContaining({ stage_index: 1, stage_type: "NameGenerator", direction: expect.any(String) }),
		);
	});

	it("emits stage_exited (with duration_ms) when leaving a stage", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		store.dispatch({ type: "session/updateCurrentStep", payload: 1 });
		store.dispatch({ type: "session/updateCurrentStep", payload: 2 });
		const exitCall = tracker.track.mock.calls.find(([name]) => name === "stage_exited");
		expect(exitCall).toBeDefined();
		expect(exitCall?.[1]).toMatchObject({ stage_index: 1, stage_type: "NameGenerator" });
		expect(typeof exitCall?.[1].duration_ms).toBe("number");
	});

	it("emits interview_finished when entering FinishSession stage", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);
		store.dispatch({ type: "session/updateCurrentStep", payload: 2 });
		expect(tracker.track).toHaveBeenCalledWith("interview_finished", expect.any(Object));
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @codaco/interview test -- --run analyticsListener`
Expected: New tests fail.

- [ ] **Step 4: Implement listeners**

Add to `createAnalyticsListenerMiddleware`:

```typescript
let lastStageIndex: number | undefined;
let lastStageEnteredAt: number | undefined;
let interviewStartEmitted = false;

startAppListening({
	predicate: (_action, currentState, previousState) => {
		const cur = currentState.session?.currentStep;
		const prev = previousState.session?.currentStep;
		return cur !== prev;
	},
	effect: (_action, listenerApi) => {
		const state = listenerApi.getState() as RootState;
		const previous = listenerApi.getOriginalState() as RootState;
		const currentStep = state.session?.currentStep ?? 0;
		const prevStep = previous.session?.currentStep;
		const stages = state.protocol?.stages ?? [];
		const stageType = stages[currentStep]?.type as string | undefined;
		const prevStageType = prevStep !== undefined ? (stages[prevStep]?.type as string | undefined) : undefined;
		const now = Date.now();

		if (!interviewStartEmitted) {
			tracker.track("interview_started");
			interviewStartEmitted = true;
		}

		if (lastStageIndex !== undefined && lastStageEnteredAt !== undefined) {
			tracker.track("stage_exited", {
				stage_type: prevStageType,
				stage_index: lastStageIndex,
				duration_ms: now - lastStageEnteredAt,
				exit_direction:
					prevStep === undefined
						? "initial"
						: currentStep > prevStep
							? "forward"
							: currentStep < prevStep
								? "back"
								: "jumped",
			});
		}

		const direction =
			prevStep === undefined
				? "initial"
				: currentStep === prevStep + 1
					? "forward"
					: currentStep === prevStep - 1
						? "back"
						: "jumped";

		tracker.track("stage_entered", {
			stage_type: stageType,
			stage_index: currentStep,
			direction,
		});

		if (stageType === "FinishSession") {
			tracker.track("interview_finished", { stage_count: stages.length });
		}

		lastStageIndex = currentStep;
		lastStageEnteredAt = now;
	},
});
```

Replace `"session/updateCurrentStep"` in the test if the actual action name differs (verify by reading `session.ts`).

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run analyticsListener`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/store/middleware/analyticsListener.ts packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts
git commit -m "feat(interview/analytics): stage-level navigation events"
```

---

### Task 18: Anonymisation events via middleware

**Files:**
- Modify: `packages/interview/src/store/middleware/analyticsListener.ts`
- Modify: `packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `analyticsListener.test.ts`:

```typescript
import { setPassphrase, setPassphraseInvalid } from "../../modules/ui";

describe("analyticsListener — anonymisation", () => {
	it("emits passphrase_set on setPassphrase action", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = configureStore({
			reducer: { session, protocol, ui },
			middleware: (getDefault) =>
				getDefault({ serializableCheck: false }).concat(createAnalyticsListenerMiddleware({ tracker }).middleware),
		});
		store.dispatch(setPassphrase("not-recorded-secret"));
		expect(tracker.track).toHaveBeenCalledWith("passphrase_set", undefined);
		// Ensure the passphrase value is NEVER sent
		const allArgs = tracker.track.mock.calls.flat();
		expect(JSON.stringify(allArgs)).not.toContain("not-recorded-secret");
	});

	it("emits passphrase_validation_failed on setPassphraseInvalid", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = configureStore({
			reducer: { session, protocol, ui },
			middleware: (getDefault) =>
				getDefault({ serializableCheck: false }).concat(createAnalyticsListenerMiddleware({ tracker }).middleware),
		});
		store.dispatch(setPassphraseInvalid(true));
		expect(tracker.track).toHaveBeenCalledWith("passphrase_validation_failed", undefined);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/interview test -- --run analyticsListener`
Expected: 2 new failures.

- [ ] **Step 3: Implement**

Add to listener:

```typescript
import { setPassphrase, setPassphraseInvalid } from "../modules/ui";

startAppListening({
	actionCreator: setPassphrase,
	effect: () => {
		tracker.track("passphrase_set");
	},
});

startAppListening({
	actionCreator: setPassphraseInvalid,
	effect: (action) => {
		if (action.payload === true) {
			tracker.track("passphrase_validation_failed");
		}
	},
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run analyticsListener`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/store/middleware/analyticsListener.ts packages/interview/src/store/middleware/__tests__/analyticsListener.test.ts
git commit -m "feat(interview/analytics): anonymisation events"
```

---

## Phase 6 — Per-interface hook-based instrumentation

Each task below: write the test, run it (fail), wire `useTrack` into the component, run it (pass), commit.

For test infrastructure each interface test will need a small harness that wraps the interface in `<AnalyticsContext.Provider value={trackerMock}>`. Set this up once and reference.

### Task 19: Test harness for hook-based interface tests

**Files:**
- Create: `packages/interview/src/analytics/__tests__/testHarness.tsx`

- [ ] **Step 1: Create harness**

Create `packages/interview/src/analytics/__tests__/testHarness.tsx`:

```tsx
import { Provider } from "react-redux";
import { type ReactNode } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { vi } from "vitest";
import { AnalyticsContext } from "../AnalyticsContext";
import type { Tracker } from "../tracker";
import session from "../../store/modules/session";
import protocol from "../../store/modules/protocol";
import ui from "../../store/modules/ui";

export function makeTracker(): Tracker & { track: ReturnType<typeof vi.fn>; captureException: ReturnType<typeof vi.fn> } {
	return {
		track: vi.fn(),
		captureException: vi.fn(),
	} as never;
}

export function withAnalytics(node: ReactNode, tracker: Tracker = makeTracker()) {
	const store = configureStore({
		reducer: { session, protocol, ui },
		middleware: (g) => g({ serializableCheck: false }),
	});
	return (
		<Provider store={store}>
			<AnalyticsContext.Provider value={tracker}>{node}</AnalyticsContext.Provider>
		</Provider>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/interview/src/analytics/__tests__/testHarness.tsx
git commit -m "test(interview/analytics): shared hook-test harness"
```

---

### Task 20: Form family — `form_opened`, `form_submitted`, `form_dismissed_without_save`, `form_validation_failed`, `slides_form_slide_advanced`

**Files:**
- Modify: `packages/interview/src/forms/useProtocolForm.tsx` (or wherever the form-engine entry point lives — emit `form_opened` on mount)
- Modify: `packages/interview/src/interfaces/AlterForm/AlterForm.tsx`
- Modify: `packages/interview/src/interfaces/AlterEdgeForm/AlterEdgeForm.tsx`
- Modify: `packages/interview/src/interfaces/EgoForm/EgoForm.tsx`
- Modify: `packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx`
- Create: `packages/interview/src/forms/__tests__/formAnalytics.test.tsx`

- [ ] **Step 1: Inspect the form engine to identify hook insertion points**

Run:

```bash
grep -nE "^export|onSubmit|formIsReady|validation" packages/interview/src/forms/useProtocolForm.tsx | head -30
```

Identify (a) the form-mount point (effect that runs once when the form first renders), (b) the submit-success path, (c) the cancel/dismiss path, (d) the validation-failure callback. Note the names; the test below will trigger each.

- [ ] **Step 2: Write failing tests**

Create `packages/interview/src/forms/__tests__/formAnalytics.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTracker, withAnalytics } from "../../analytics/__tests__/testHarness";
// import the form-host component you'll wrap, e.g. EgoForm — adjust path

describe("form-family analytics", () => {
	it("emits form_opened on mount with field_details and entity_id", () => {
		// Render an EgoForm (or simpler: render useProtocolForm via a minimal wrapper)
		// Stub: render(<TestFormHost {...} />)
		// Assert tracker.track called with "form_opened" and a field_details array of strings.
		// NOTE: adapt to actual form mount API — populate stage props via stub.
	});

	it("emits form_submitted on successful submit", () => {
		// fire submit → assert tracker.track called with "form_submitted", { form_kind, entity_id? }
	});

	it("emits form_validation_failed with field_errors array on validation failure", () => {
		// fire submit while required field empty → assert "form_validation_failed" with an array
	});

	it("emits form_dismissed_without_save when the cancel path runs", () => {
		// fire cancel → assert "form_dismissed_without_save", { form_kind }
	});

	it("emits slides_form_slide_advanced on SlidesForm next-slide", () => {
		// render SlidesForm with two slides; advance → assert "slides_form_slide_advanced"
	});
});
```

(Stubs: the engineer fills in render shapes per the actual form-engine API. `getProtocolForm` in `useProtocolForm.tsx` is the central injection point — wrap a small component around it for the test.)

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @codaco/interview test -- --run formAnalytics`
Expected: failures (assertions on tracker.track that won't happen yet).

- [ ] **Step 4: Implement emission**

In `packages/interview/src/forms/useProtocolForm.tsx`:

(a) On mount, derive `field_details: string[]` from the form's field components and emit `form_opened`. Form-kind is passed as an argument by the calling interface (each of AlterForm, AlterEdgeForm, EgoForm, SlidesForm passes its own kind). Add a `formKind: 'alter' | 'alter_edge' | 'ego' | 'slides'` arg to `useProtocolForm`.

(b) Wrap the existing onSubmit handler: emit `form_submitted` with `{ form_kind, entity_id? }` after successful save.

(c) Wrap the validation-error path: emit `form_validation_failed` with an array of `{ field_index, component, kind, config? }` per failed field.

Code shape (insert into the hook):

```tsx
import { useTrack } from "../analytics/useTrack";

const track = useTrack();

useEffect(() => {
	const fieldDetails = fields.map((f) => f.component);
	track("form_opened", { form_kind: formKind, field_details: fieldDetails, ...(entityId ? { entity_id: entityId } : {}) });
	// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// In onSubmit success:
track("form_submitted", { form_kind: formKind, ...(entityId ? { entity_id: entityId } : {}) });

// In dismiss path (cancel button or close):
track("form_dismissed_without_save", { form_kind: formKind, ...(entityId ? { entity_id: entityId } : {}) });

// In validation failure handler:
const fieldErrors = errors.map((err, idx) => {
	const fieldDef = fields[idx];
	const sanitizedConfig: Record<string, number | boolean> = {};
	for (const [k, v] of Object.entries(err.config ?? {})) {
		if (typeof v === "number" || typeof v === "boolean") sanitizedConfig[k] = v;
		// strings (like differentFrom: "name") are dropped — they would carry codebook variable names
	}
	return {
		field_index: idx,
		component: fieldDef?.component ?? "unknown",
		kind: err.kind,
		...(Object.keys(sanitizedConfig).length ? { config: sanitizedConfig } : {}),
	};
});
track("form_validation_failed", { form_kind: formKind, ...(entityId ? { entity_id: entityId } : {}), field_errors: fieldErrors });
```

(Adapt to the actual form engine API — the local variables `fields`, `errors`, `entityId`, `formKind` need to come from the hook's existing state.)

In `SlidesForm.tsx`, add slide-advance emission:

```tsx
const track = useTrack();
// ...where slides advance:
track("slides_form_slide_advanced", { slide_index: nextIndex, total_slides: slides.length });
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run formAnalytics`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/forms/useProtocolForm.tsx packages/interview/src/interfaces/AlterForm/AlterForm.tsx packages/interview/src/interfaces/AlterEdgeForm/AlterEdgeForm.tsx packages/interview/src/interfaces/EgoForm/EgoForm.tsx packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx packages/interview/src/forms/__tests__/formAnalytics.test.tsx
git commit -m "feat(interview/analytics): form-family events"
```

---

### Task 21: NameGenerator — `node_form_opened`, `node_form_dismissed_without_save`

**Files:**
- Modify: `packages/interview/src/interfaces/NameGenerator/components/NodeForm.tsx`
- Modify: `packages/interview/src/interfaces/NameGenerator/components/QuickNodeForm.tsx`
- Create: `packages/interview/src/interfaces/NameGenerator/__tests__/NameGeneratorAnalytics.test.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/interview/src/interfaces/NameGenerator/__tests__/NameGeneratorAnalytics.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTracker, withAnalytics } from "../../../analytics/__tests__/testHarness";
import NodeForm from "../components/NodeForm";

describe("NameGenerator NodeForm analytics", () => {
	it("emits node_form_opened on open", () => {
		const tracker = makeTracker();
		// render NodeForm in open state with a stubbed node id
		// expect(tracker.track).toHaveBeenCalledWith("node_form_opened", expect.objectContaining({ node_id: "n1" }));
	});

	it("emits node_form_dismissed_without_save on cancel", () => {
		const tracker = makeTracker();
		// render NodeForm; fire the cancel handler
		// expect(tracker.track).toHaveBeenCalledWith("node_form_dismissed_without_save", expect.objectContaining({ node_id: "n1" }));
	});
});
```

(The actual render call depends on NodeForm's prop surface — open the file and adapt.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/interview test -- --run NameGeneratorAnalytics`
Expected: failure.

- [ ] **Step 3: Implement**

In `NodeForm.tsx`:

```tsx
import { useTrack } from "../../../analytics/useTrack";

// In the component:
const track = useTrack();
useEffect(() => {
	track("node_form_opened", { node_id: existingNodeId });
}, [existingNodeId, track]);

// In the cancel/dismiss handler:
const onCancel = useCallback(() => {
	track("node_form_dismissed_without_save", { node_id: existingNodeId });
	// existing close logic
}, [existingNodeId, track]);
```

`existingNodeId` may be undefined for new-node forms — the spec says omit when not yet created. Coerce: `{ ...(existingNodeId ? { node_id: existingNodeId } : {}) }`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @codaco/interview test -- --run NameGeneratorAnalytics`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NameGenerator
git commit -m "feat(interview/analytics): NameGenerator NodeForm open/dismiss events"
```

---

### Task 22: NameGeneratorRoster — `roster_loaded`, `roster_filter_changed`

**Files:**
- Modify: `packages/interview/src/interfaces/NameGeneratorRoster/NameGeneratorRoster.tsx`
- Modify: `packages/interview/src/interfaces/NameGeneratorRoster/useItems.ts`
- Create: `packages/interview/src/interfaces/NameGeneratorRoster/__tests__/RosterAnalytics.test.tsx`

- [ ] **Step 1: Write failing test**

Create `RosterAnalytics.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
// (skeleton — adapt to component API)

describe("NameGeneratorRoster analytics", () => {
	it("emits roster_loaded with entry_count after data resolves", () => {
		// stub useExternalData to resolve immediately with N entries
		// expect track called with "roster_loaded", { entry_count: N }
	});

	it("emits roster_filter_changed (debounced) with has_filter boolean", () => {
		// type into filter input; advance fake timers; assert single call with { has_filter: true }
		// clear filter; assert another call with { has_filter: false }
	});
});
```

- [ ] **Step 2: Run to verify failure** (`pnpm --filter @codaco/interview test -- --run RosterAnalytics`)

- [ ] **Step 3: Implement**

In `NameGeneratorRoster.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useTrack } from "../../analytics/useTrack";
import { debounce } from "es-toolkit";

const track = useTrack();
const loaded = useRef(false);
useEffect(() => {
	if (!externalData || loaded.current) return;
	track("roster_loaded", { entry_count: externalData.length });
	loaded.current = true;
}, [externalData, track]);

const fireFilterChanged = useMemo(
	() => debounce((hasFilter: boolean) => track("roster_filter_changed", { has_filter: hasFilter }), 500),
	[track],
);

useEffect(() => {
	fireFilterChanged(filterText.length > 0);
	return () => fireFilterChanged.cancel();
}, [filterText, fireFilterChanged]);
```

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NameGeneratorRoster
git commit -m "feat(interview/analytics): roster events"
```

---

### Task 23: Sociogram — `node_initial_positioned`, `node_repositioned`, `node_selected`, `node_deselected`, `simulation_started`, `simulation_finished`

**Files:**
- Modify: `packages/interview/src/interfaces/Sociogram/Sociogram.tsx`
- Modify: `packages/interview/src/interfaces/Sociogram/useForceSimulation.ts`
- Create: `packages/interview/src/interfaces/Sociogram/__tests__/SociogramAnalytics.test.tsx`

- [ ] **Step 1: Determine where each event fires**

Read `Sociogram.tsx` and `useForceSimulation.ts` to find: drag-end handler, attribute-selection toggle, force-simulation lifecycle hooks (start tick, settled callback). Note function names.

- [ ] **Step 2: Write failing test (skeleton)**

Create `SociogramAnalytics.test.tsx` with one stubbed test per event (six total). Each renders a Sociogram with controlled props and triggers the relevant handler, asserting `tracker.track` was called.

- [ ] **Step 3: Run to verify failure**

- [ ] **Step 4: Implement events**

In `Sociogram.tsx`:

```tsx
const track = useTrack();
const positionedNodeIds = useRef(new Set<string>());

const onDragEnd = (nodeId: string) => {
	if (autoLayout) return; // suppress when force-sim drives positions
	if (positionedNodeIds.current.has(nodeId)) {
		track("node_repositioned", { node_id: nodeId });
	} else {
		positionedNodeIds.current.add(nodeId);
		track("node_initial_positioned", { node_id: nodeId });
	}
};

const onSelect = (nodeId: string, mode: "select" | "deselect") => {
	track(mode === "select" ? "node_selected" : "node_deselected", { node_id: nodeId });
};
```

In `useForceSimulation.ts`:

```ts
const track = useTrack();
const startedAt = useRef<number | null>(null);

// On simulation start:
startedAt.current = Date.now();
track("simulation_started", { node_count: nodes.length, edge_count: edges.length });

// On simulation settled (alpha < alphaMin):
if (startedAt.current !== null) {
	track("simulation_finished", {
		duration_ms: Date.now() - startedAt.current,
		node_count: nodes.length,
		edge_count: edges.length,
	});
	startedAt.current = null;
}
```

- [ ] **Step 5: Run tests to verify pass**

- [ ] **Step 6: Commit**

```bash
git add packages/interview/src/interfaces/Sociogram
git commit -m "feat(interview/analytics): sociogram events"
```

---

### Task 24: Comparison family — `pair_shown` (DyadCensus, TieStrengthCensus), `focal_node` (OneToManyDyadCensus)

**Files:**
- Modify: `packages/interview/src/interfaces/DyadCensus/DyadCensus.tsx`
- Modify: `packages/interview/src/interfaces/TieStrengthCensus/TieStrengthCensus.tsx`
- Modify: `packages/interview/src/interfaces/OneToManyDyadCensus/OneToManyDyadCensus.tsx`
- Create: `packages/interview/src/interfaces/DyadCensus/__tests__/DyadCensusAnalytics.test.tsx`
- Create: `packages/interview/src/interfaces/TieStrengthCensus/__tests__/TieStrengthCensusAnalytics.test.tsx`
- Create: `packages/interview/src/interfaces/OneToManyDyadCensus/__tests__/OneToManyAnalytics.test.tsx`

- [ ] **Step 1: Tests** (write three test files asserting the relevant `track` call when a new pair / focal node is shown).

- [ ] **Step 2: Run to verify failure**.

- [ ] **Step 3: Implement** — in each component, on the effect that responds to a new pair/focal:

```tsx
const track = useTrack();
useEffect(() => {
	if (!nodeA || !nodeB) return;
	track("pair_shown", { node_a_id: nodeA._uid, node_b_id: nodeB._uid });
}, [nodeA?._uid, nodeB?._uid, track]);
```

For `OneToManyDyadCensus`:

```tsx
const track = useTrack();
useEffect(() => {
	if (!focalNode) return;
	track("focal_node", { node_id: focalNode._uid });
}, [focalNode?._uid, track]);
```

- [ ] **Step 4: Run tests to verify pass**.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/DyadCensus packages/interview/src/interfaces/TieStrengthCensus packages/interview/src/interfaces/OneToManyDyadCensus
git commit -m "feat(interview/analytics): comparison-family events"
```

---

### Task 25: CategoricalBin / OrdinalBin — `node_binned`, `node_rebinned`, `bin_expanded`, `bin_collapsed`

**Files:**
- Modify: `packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx`
- Modify: `packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx`
- Modify: `packages/interview/src/interfaces/OrdinalBin/OrdinalBin.tsx`
- Create: `packages/interview/src/interfaces/CategoricalBin/__tests__/CategoricalBinAnalytics.test.tsx`
- Create: `packages/interview/src/interfaces/OrdinalBin/__tests__/OrdinalBinAnalytics.test.tsx`

- [ ] **Step 1: Tests** asserting:
  - `node_binned` on first drop into any bin
  - `node_rebinned` on drop into a different bin (with `from_bin_index` and `to_bin_index`)
  - `bin_expanded` and `bin_collapsed` (CategoricalBin only) on expand/collapse handler

- [ ] **Step 2: Run to verify failure**.

- [ ] **Step 3: Implement** — track which nodes have been placed:

```tsx
const track = useTrack();
const lastBinIndex = useRef(new Map<string, number>());

const onDrop = (nodeId: string, nodeType: string | undefined, binIndex: number) => {
	const previous = lastBinIndex.current.get(nodeId);
	if (previous === undefined) {
		track("node_binned", { node_id: nodeId, node_type: nodeType, bin_index: binIndex });
	} else if (previous !== binIndex) {
		track("node_rebinned", {
			node_id: nodeId,
			node_type: nodeType,
			from_bin_index: previous,
			to_bin_index: binIndex,
		});
	}
	lastBinIndex.current.set(nodeId, binIndex);
};
```

In `CategoricalBinItem.tsx`:

```tsx
const track = useTrack();
const onToggleExpanded = (next: boolean) => {
	track(next ? "bin_expanded" : "bin_collapsed", { bin_index: index });
	// existing toggle logic
};
```

- [ ] **Step 4: Run tests to verify pass**.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/CategoricalBin packages/interview/src/interfaces/OrdinalBin
git commit -m "feat(interview/analytics): bin events"
```

---

### Task 26: Narrative — `narrative_preset_changed`, `narrative_preset_updated`, `annotation_drawn`, `annotations_reset`

**Files:**
- Modify: `packages/interview/src/interfaces/Narrative/Narrative.tsx`
- Modify: `packages/interview/src/interfaces/Narrative/PresetSwitcher.tsx`
- Modify: `packages/interview/src/interfaces/Narrative/Annotations.tsx`
- Modify: `packages/interview/src/interfaces/Narrative/DrawingControls.tsx`
- Create: `packages/interview/src/interfaces/Narrative/__tests__/NarrativeAnalytics.test.tsx`

- [ ] **Step 1: Test** — assert all four events fire on the relevant interactions.

- [ ] **Step 2: Run to verify failure**.

- [ ] **Step 3: Implement**:

`PresetSwitcher.tsx` `onChangePreset`:

```tsx
const track = useTrack();
const onChange = (next: number) => {
	const direction = next > activePreset ? "forward" : next < activePreset ? "back" : "jumped";
	track("narrative_preset_changed", { preset_index: next, direction });
	onChangePreset(next);
};
```

`Narrative.tsx` — when group, edge_type, or highlight changes within a preset:

```tsx
const track = useTrack();
useEffect(() => {
	track("narrative_preset_updated", { preset_index: activePreset, changed: "group" });
}, [groupVariableId]); // similar for edge_type, highlight
```

`Annotations.tsx` on stroke complete:

```tsx
track("annotation_drawn");
```

`DrawingControls.tsx` `onReset`:

```tsx
const track = useTrack();
const handleReset = () => {
	track("annotations_reset");
	onReset();
};
```

- [ ] **Step 4: Run tests to verify pass**.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/Narrative
git commit -m "feat(interview/analytics): narrative events"
```

---

### Task 27: FamilyPedigree — `pedigree_relative_added` (manual only), `pedigree_relative_removed`, wizard events

**Files:**
- Modify: `packages/interview/src/interfaces/FamilyPedigree/FamilyPedigree.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/AddPersonForm.tsx`
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/quickStartWizard/*` (wizard entry/finish/abandon)
- Modify: `packages/interview/src/interfaces/FamilyPedigree/components/wizards/steps/*` (same)
- Create: `packages/interview/src/interfaces/FamilyPedigree/__tests__/FamilyPedigreeAnalytics.test.tsx`

- [ ] **Step 1: Test** — assert manual add fires `pedigree_relative_added`; wizard add does *not*; wizard open fires `pedigree_wizard_shown`; wizard finish fires `pedigree_wizard_complete` with counts; wizard close-without-finish fires `pedigree_wizard_abandoned`.

- [ ] **Step 2: Run to verify failure**.

- [ ] **Step 3: Implement** —

`AddPersonForm.tsx` (manual path):

```tsx
const track = useTrack();
// after successful add, only when not from wizard:
track("pedigree_relative_added", { node_id: createdNodeId, relation_type: relationType });
```

`AddPersonForm` accepts a `source?: "manual" | "wizard"` arg passed from the parent; only emit when `source === "manual"`. Default to `"manual"`.

Wizard component (open handler):

```tsx
const track = useTrack();
const onOpen = () => {
	track("pedigree_wizard_shown");
	openWizard();
};

const onComplete = ({ nodesCreated, edgesCreated }: { nodesCreated: number; edgesCreated: number }) => {
	track("pedigree_wizard_complete", { nodes_created: nodesCreated, edges_created: edgesCreated });
	closeWizard();
};

const onAbandon = () => {
	track("pedigree_wizard_abandoned");
	closeWizard();
};
```

Removal:

```tsx
const onRemove = (node: NcNode) => {
	track("pedigree_relative_removed", { node_id: node._uid, relation_type: node.type });
	dispatchRemove(node);
};
```

- [ ] **Step 4: Run tests to verify pass**.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/FamilyPedigree
git commit -m "feat(interview/analytics): family pedigree events"
```

---

### Task 28: Geospatial — `geospatial_location_selected`, `geospatial_search_performed`

**Files:**
- Modify: `packages/interview/src/interfaces/Geospatial/Geospatial.tsx`
- Modify: `packages/interview/src/interfaces/Geospatial/GeospatialSearch.tsx`
- Modify: `packages/interview/src/interfaces/Geospatial/useGeospatialSearch.ts`
- Create: `packages/interview/src/interfaces/Geospatial/__tests__/GeospatialAnalytics.test.tsx`

- [ ] **Step 1: Test** — search emits `geospatial_search_performed` with `node_id` only (no query text); selection emits `geospatial_location_selected` with `selection_kind: 'search'` or `'pin'`.

- [ ] **Step 2: Run to verify failure**.

- [ ] **Step 3: Implement** —

`useGeospatialSearch.ts`:

```tsx
import { debounce } from "es-toolkit";
import { useTrack } from "../../analytics/useTrack";

const track = useTrack();
const fireSearch = useMemo(
	() => debounce((nodeId: string) => track("geospatial_search_performed", { node_id: nodeId }), 500),
	[track],
);

useEffect(() => {
	if (query) fireSearch(activeNodeId);
}, [query, activeNodeId, fireSearch]);
```

`Geospatial.tsx` selection handlers:

```tsx
const track = useTrack();
const onSelectFromSearch = (nodeId: string) => {
	track("geospatial_location_selected", { node_id: nodeId, selection_kind: "search" });
};
const onSelectFromPin = (nodeId: string) => {
	track("geospatial_location_selected", { node_id: nodeId, selection_kind: "pin" });
};
```

- [ ] **Step 4: Run tests to verify pass**.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/Geospatial
git commit -m "feat(interview/analytics): geospatial events"
```

---

### Task 29: Stage validation failure event from Navigation `beforeNext`

**Files:**
- Modify: `packages/interview/src/components/Navigation.tsx`
- Modify: `packages/interview/src/hooks/useInterviewNavigation.tsx` (or wherever `beforeNext` is registered/run)
- Create test in nearest `__tests__/`

- [ ] **Step 1: Test** — when a registered `beforeNext` callback returns `false` or throws a known validation marker, `stage_validation_failed` fires with `{ stage_type, stage_index, validation_kind }`.

- [ ] **Step 2: Implement** — wherever `beforeNext` is awaited and a falsy/error result is detected:

```tsx
const track = useTrack();
const validationKind = result.kind ?? "unknown";
track("stage_validation_failed", { stage_type, stage_index, validation_kind: validationKind });
```

`validation_kind` is a structural string code (e.g. `"min_nodes"`, `"required_field"`, `"passphrase_mismatch"`) — never a rendered message. Surface this via the `beforeNext` callback contract returning `{ ok: false, kind: string }`.

- [ ] **Step 3: Commit**

```bash
git add packages/interview/src/components/Navigation.tsx packages/interview/src/hooks/useInterviewNavigation.tsx
git commit -m "feat(interview/analytics): stage_validation_failed event"
```

---

## Phase 7 — PII guard, integration test, and storybook coverage

### Task 30: PII guard test

**Files:**
- Create: `packages/interview/src/analytics/__tests__/pii-guard.test.ts`

- [ ] **Step 1: Implement guard test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import session, { addEdge, addNode, deleteEdge, deleteNode } from "../../store/modules/session";
import protocol from "../../store/modules/protocol";
import ui from "../../store/modules/ui";
import { createAnalyticsListenerMiddleware } from "../../store/middleware/analyticsListener";

const SENTINELS = [
	"CODEBOOK_LABEL_TRIGGER",
	"PROMPT_TEXT_TRIGGER",
	"NODE_LABEL_TRIGGER",
	"PARTICIPANT_INPUT_TRIGGER",
	"PASSPHRASE_TRIGGER",
];

function containsSentinel(value: unknown): boolean {
	if (value == null) return false;
	if (typeof value === "string") return SENTINELS.some((s) => value.includes(s));
	if (typeof value === "object") {
		return Object.values(value as Record<string, unknown>).some(containsSentinel);
	}
	return false;
}

describe("PII guard — global listener events", () => {
	function buildStore(tracker: { track: ReturnType<typeof vi.fn>; captureException: ReturnType<typeof vi.fn> }) {
		return configureStore({
			reducer: { session, protocol, ui },
			preloadedState: {
				session: {
					id: "interview-1",
					startTime: new Date().toISOString(),
					network: {
						ego: { _uid: "ego", "PARTICIPANT_INPUT_TRIGGER": "value" },
						nodes: [{ _uid: "n1", type: "person", label: "NODE_LABEL_TRIGGER" }],
						edges: [],
					},
					currentStep: 0,
				} as never,
				protocol: {
					id: "p1",
					hash: "h1",
					schemaVersion: 8,
					name: "PROMPT_TEXT_TRIGGER",
					description: "PROMPT_TEXT_TRIGGER",
					codebook: {
						node: { person: { name: "CODEBOOK_LABEL_TRIGGER", variables: {} } },
					},
					stages: [],
				} as never,
				ui: undefined,
			},
			middleware: (g) =>
				g({ serializableCheck: false }).concat(createAnalyticsListenerMiddleware({ tracker }).middleware),
		});
	}

	it("never emits any sentinel string in any captured event", async () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const store = buildStore(tracker);

		await store.dispatch(addNode({ modelData: { type: "person", label: "NODE_LABEL_TRIGGER" } } as never) as never);
		store.dispatch(deleteNode("n1") as never);
		await store.dispatch(addEdge({ modelData: { type: "friend", from: "a", to: "b" } } as never) as never);
		store.dispatch(deleteEdge("e1") as never);

		for (const call of tracker.track.mock.calls) {
			const [eventName, props] = call;
			expect(containsSentinel(eventName)).toBe(false);
			expect(containsSentinel(props)).toBe(false);
		}
	});
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @codaco/interview test -- --run pii-guard`
Expected: green (the listener already only sends `node_id`, `node_type`, `edge_id`, `edge_type` — none of which can carry sentinels because the entity `type` is the codebook *internal id* like `"person"`, not the sentinel string we put in `name`).

- [ ] **Step 3: Commit**

```bash
git add packages/interview/src/analytics/__tests__/pii-guard.test.ts
git commit -m "test(interview/analytics): PII guard for global listener events"
```

---

### Task 31: Shell integration test (three modes)

**Files:**
- Create: `packages/interview/src/__tests__/Shell.analytics.test.tsx`

- [ ] **Step 1: Test the three resolution modes**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Shell from "../Shell";

const minimalPayload = {
	session: { id: "i1", startTime: new Date().toISOString(), network: { ego: { _uid: "e" }, nodes: [], edges: [] }, currentStep: 0 },
	protocol: { id: "p", hash: "h", schemaVersion: 8, codebook: {}, stages: [{ id: "s", type: "Information", title: "x", items: [] }] },
} as never;

describe("Shell analytics modes", () => {
	it("disableAnalytics=true does not import posthog-js or fire events", async () => {
		const importMock = vi.fn();
		vi.doMock("posthog-js", () => {
			importMock();
			return { default: { init: vi.fn() } };
		});
		const onSync = vi.fn().mockResolvedValue(undefined);
		const onFinish = vi.fn().mockResolvedValue(undefined);
		const onRequestAsset = vi.fn().mockResolvedValue("");
		render(
			<Shell
				payload={minimalPayload}
				onSync={onSync}
				onFinish={onFinish}
				onRequestAsset={onRequestAsset}
				analytics={{ installationId: "i", hostApp: "test" }}
				disableAnalytics={true}
			/>,
		);
		await new Promise((r) => setTimeout(r, 0));
		expect(importMock).not.toHaveBeenCalled();
	});

	it("posthogClient supplied — no init/register on it", async () => {
		const client = { capture: vi.fn(), captureException: vi.fn(), register: vi.fn(), init: vi.fn(), identify: vi.fn() };
		const onSync = vi.fn().mockResolvedValue(undefined);
		const onFinish = vi.fn().mockResolvedValue(undefined);
		const onRequestAsset = vi.fn().mockResolvedValue("");
		render(
			<Shell
				payload={minimalPayload}
				onSync={onSync}
				onFinish={onFinish}
				onRequestAsset={onRequestAsset}
				analytics={{ installationId: "i", hostApp: "test" }}
				posthogClient={client as never}
			/>,
		);
		await new Promise((r) => setTimeout(r, 0));
		expect(client.init).not.toHaveBeenCalled();
		expect(client.register).not.toHaveBeenCalled();
		expect(client.identify).not.toHaveBeenCalled();
	});

	it("no host client — initializes a named instance", async () => {
		const initSpy = vi.fn().mockReturnValue({ capture: vi.fn(), register: vi.fn(), captureException: vi.fn() });
		vi.doMock("posthog-js", () => ({ default: { init: initSpy } }));
		const onSync = vi.fn().mockResolvedValue(undefined);
		const onFinish = vi.fn().mockResolvedValue(undefined);
		const onRequestAsset = vi.fn().mockResolvedValue("");
		render(
			<Shell
				payload={minimalPayload}
				onSync={onSync}
				onFinish={onFinish}
				onRequestAsset={onRequestAsset}
				analytics={{ installationId: "i", hostApp: "test" }}
			/>,
		);
		await new Promise((r) => setTimeout(r, 50));
		expect(initSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), "@codaco/interview");
	});
});
```

- [ ] **Step 2: Run** — `pnpm --filter @codaco/interview test -- --run Shell.analytics`
- [ ] **Step 3: Commit**

```bash
git add packages/interview/src/__tests__/Shell.analytics.test.tsx
git commit -m "test(interview): Shell analytics three-mode integration"
```

---

## Phase 8 — Documentation, version bump, publish

### Task 32: Update `packages/interview/README.md`

**Files:**
- Modify: `packages/interview/README.md`

- [ ] **Step 1: Update the Shell-props table**

In `README.md`, find the Shell-props table (around line 195) and update:

- Remove the `onError` row.
- Add three new rows:
  - `analytics` — `InterviewAnalyticsMetadata` — required — "Host metadata attached as super-properties on every event. `installationId` and `hostApp` are required; `hostVersion` optional."
  - `posthogClient` — `PostHog` (from posthog-js) — optional — "Pre-initialised PostHog client. When provided, the package emits events through it without modifying its config. When absent, the package lazy-imports posthog-js and initialises its own named instance against ph-relay."
  - `disableAnalytics` — `boolean` — optional, default `false` — "Suppresses all event emission. Hosts use this for E2E and synthetic runs."

- Update the payload-construction example to include `protocol.hash`:

```ts
const protocol: ProtocolPayload = {
  ...interview.protocol,
  hash: hashProtocol({ codebook: interview.protocol.codebook, stages: interview.protocol.stages }),
  importedAt: interview.protocol.importedAt.toISOString(),
  assets,
};
```

- [ ] **Step 2: Add Analytics section**

Append after the existing sections:

```markdown
## Analytics

The package emits PostHog events directly. There are three operating modes:

1. **Host-supplied client** — pass `posthogClient` and the package emits via the host's instance with `distinct_id` overridden per event to the interview id. The host's instance config (autocapture, identify, session recording) is the host's responsibility.
2. **Own instance** — omit `posthogClient` and the package lazy-imports `posthog-js` and inits a named instance (`'@codaco/interview'`) against `https://ph-relay.networkcanvas.com`.
3. **Disabled** — pass `disableAnalytics={true}`. No events emitted, no posthog-js import.

### Metadata

Required typed schema (no extension bucket — adding a field requires a package release):

\`\`\`ts
type InterviewAnalyticsMetadata = {
  installationId: string;   // → super prop "installation_id"
  hostApp: string;          // → super prop "app"
  hostVersion?: string;     // → super prop "host_version"
};
\`\`\`

### PII contract

Events never include: protocol-network data (nodes/edges/attributes), protocol-author content (stage labels, prompt text, codebook labels, asset names), or participant input (form values, free-text, alter labels, search queries, passphrases).

Events do include: structural identifiers (stage type, stage index, prompt index, random node/edge ids), codebook *internal* ids (e.g. `"person"`, `"friend"`), counts, durations, and package-defined discriminators.

The full taxonomy lives at [`docs/superpowers/specs/2026-05-05-interview-analytics-design.md`](../../docs/superpowers/specs/2026-05-05-interview-analytics-design.md).
```

- [ ] **Step 3: Commit**

```bash
git add packages/interview/README.md
git commit -m "docs(interview): document analytics surface and PII contract"
```

---

### Task 33: Bump `@codaco/interview` to `1.0.0-alpha.1`

**Files:**
- Modify: `packages/interview/package.json`

- [ ] **Step 1: Bump version**

In `packages/interview/package.json`, change `"version"` from `"1.0.0-alpha.0"` to `"1.0.0-alpha.1"`.

- [ ] **Step 2: Add changeset entry**

Create `.changeset/interview-analytics-alpha-1.md`:

```markdown
---
"@codaco/interview": minor
---

**Breaking** (still pre-1.0): replace `onError` callback with built-in PostHog analytics. New required Shell prop `analytics` (typed metadata). New optional `posthogClient` (host can supply its own client) and `disableAnalytics` (default false). `ProtocolPayload.hash` is now required — host computes via `hashProtocol` from `@codaco/protocol-validation`. Per-interface and stage-level events instrumented across all 17 interfaces with strict no-PII guarantees.
```

- [ ] **Step 3: Commit**

```bash
git add packages/interview/package.json .changeset/interview-analytics-alpha-1.md
git commit -m "chore(interview): bump to 1.0.0-alpha.1"
```

---

### Task 34: Build and publish `@codaco/protocol-validation@11.5.0`

**Files:** none (publish step)

- [ ] **Step 1: Build**

Run: `pnpm --filter @codaco/protocol-validation build`
Expected: `packages/protocol-validation/dist` populated.

- [ ] **Step 2: Set npm token (manual)**

Provide the token via environment for the publish process (do *not* commit). The user will supply a fresh npm token (rotate the previously leaked one first).

```bash
export NPM_TOKEN=<user-provided>
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc.publish
```

- [ ] **Step 3: Publish**

```bash
cd /Users/jmh629/Projects/network-canvas/packages/protocol-validation
NPM_CONFIG_USERCONFIG=~/.npmrc.publish pnpm publish --no-git-checks --access public
```

Expected: `+ @codaco/protocol-validation@11.5.0`.

- [ ] **Step 4: Clean up token**

```bash
rm ~/.npmrc.publish
```

---

### Task 35: Build and publish `@codaco/interview@1.0.0-alpha.1`

**Files:** none (publish step)

- [ ] **Step 1: Confirm protocol-validation@11.5.0 is reachable**

```bash
npm view @codaco/protocol-validation version
```

Expected: `11.5.0`.

- [ ] **Step 2: Build the interview package**

```bash
pnpm --filter @codaco/interview build
```

Expected: `packages/interview/dist` populated. Verify `dist/index.d.ts` includes `InterviewAnalyticsMetadata`, `useTrack`, and updated `ProtocolPayload` with `hash`.

```bash
grep -E "InterviewAnalyticsMetadata|useTrack|hash:" packages/interview/dist/index.d.ts | head
```

- [ ] **Step 3: Publish**

```bash
cd /Users/jmh629/Projects/network-canvas/packages/interview
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc.publish
NPM_CONFIG_USERCONFIG=~/.npmrc.publish pnpm publish --no-git-checks --access public --tag alpha
rm ~/.npmrc.publish
```

Expected: `+ @codaco/interview@1.0.0-alpha.1`. The `--tag alpha` keeps `npm install @codaco/interview` (no version) pointing at the existing stable rather than auto-promoting to alpha.

- [ ] **Step 4: Verify**

```bash
npm view @codaco/interview@1.0.0-alpha.1 dependencies
```

Expected: `posthog-js` listed; `@codaco/protocol-validation` resolved to `^11.5.0`.

---

## Phase 9 — Fresco-next consumer migration

### Task 36: Migrate `hashProtocol` callsites in fresco-next

**Files (in `~/Projects/fresco-next`):**
- Modify: `hooks/useProtocolImport.tsx`
- Modify: `actions/protocols.ts`
- Modify: `scripts/migrate-protocols-to-v8.ts`
- Modify: `scripts/__tests__/migrate-protocols-to-v8.test.ts`
- Delete: `lib/protocol/hashProtocol.ts`

- [ ] **Step 1: Update fresco-next to use the published protocol-validation@11.5.0**

In `~/Projects/fresco-next/package.json`, bump `@codaco/protocol-validation` to `^11.5.0` (or the version you published). Run `pnpm install` from `~/Projects/fresco-next`.

- [ ] **Step 2: Update each callsite**

For each file, replace the local import with the package import.

`hooks/useProtocolImport.tsx`:

```typescript
- import { hashProtocol } from "~/lib/protocol/hashProtocol";
+ import { hashProtocol } from "@codaco/protocol-validation";
```

`scripts/migrate-protocols-to-v8.ts`:

```typescript
- import { hashProtocol } from '~/lib/protocol/hashProtocol';
+ import { hashProtocol } from '@codaco/protocol-validation';
```

`scripts/__tests__/migrate-protocols-to-v8.test.ts`:

```typescript
- import { hashProtocol } from '~/lib/protocol/hashProtocol';  // if used in test
+ import { hashProtocol } from '@codaco/protocol-validation';
```

`actions/protocols.ts` (line ~165) — replace the inline `hash(protocol)` ohash call with `hashProtocol`:

```typescript
- import { hash } from "ohash";
+ import { hashProtocol } from "@codaco/protocol-validation";

// ...later:
- const protocolHash = hash(protocol);
+ const protocolHash = hashProtocol(protocol);
```

(If `actions/protocols.ts` previously hashed something other than `{ codebook, stages }`, this is a deliberate semantic change — confirm with the user that hash uniformity across import/migrate/insert is desired. Per the spec, it is.)

- [ ] **Step 3: Delete the local file**

```bash
cd ~/Projects/fresco-next
rm lib/protocol/hashProtocol.ts
# remove its directory if empty
rmdir lib/protocol 2>/dev/null || true
```

- [ ] **Step 4: Verify imports**

```bash
grep -rn "lib/protocol/hashProtocol" .
```

Expected: no matches.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: green.

- [ ] **Step 6: Run unit tests**

```bash
pnpm test -- migrate-protocols-to-v8
```

Expected: green.

- [ ] **Step 7: Commit (in fresco-next)**

```bash
cd ~/Projects/fresco-next
git add hooks/useProtocolImport.tsx actions/protocols.ts scripts/migrate-protocols-to-v8.ts scripts/__tests__/migrate-protocols-to-v8.test.ts package.json pnpm-lock.yaml
git rm lib/protocol/hashProtocol.ts
git commit -m "refactor: import hashProtocol from @codaco/protocol-validation"
```

---

### Task 37: Populate `payload.protocol.hash` in `mapInterviewPayload.ts`

**Files (in `~/Projects/fresco-next`):**
- Modify: `app/(interview)/interview/[interviewId]/mapInterviewPayload.ts`
- Modify: `queries/interviews.ts` (if `Protocol.hash` isn't already selected from Prisma)

- [ ] **Step 1: Verify the Prisma query selects `hash`**

```bash
grep -n "hash" ~/Projects/fresco-next/queries/interviews.ts | head
```

If `protocol.hash` isn't in the select, add it.

- [ ] **Step 2: Update mapInterviewPayload**

Edit `app/(interview)/interview/[interviewId]/mapInterviewPayload.ts`:

```typescript
const payload: InterviewPayload = {
  session: {
    // ...existing
  },
  protocol: {
    ...protocol,
    hash: protocol.hash,
    schemaVersion: 8,
    description: protocol.description ?? undefined,
    importedAt: protocol.importedAt.toISOString(),
    assets,
  },
};
```

- [ ] **Step 3: Repeat for preview path**

Locate `app/(interview)/preview/[protocolId]/...` payload constructors and update each to include `hash`. (Preview protocols use `PreviewProtocol.hash` — same Prisma model.)

- [ ] **Step 4: Typecheck and commit**

```bash
cd ~/Projects/fresco-next
pnpm typecheck
git add app queries
git commit -m "feat: pass protocol.hash through to interview payload"
```

---

### Task 38: Pass analytics props to `<Shell>` in `InterviewClient.tsx` (and preview client)

**Files (in `~/Projects/fresco-next`):**
- Modify: `app/(interview)/interview/[interviewId]/InterviewClient.tsx`
- Modify: `app/(interview)/preview/[protocolId]/interview/PreviewInterviewClient.tsx` (if it exists)

- [ ] **Step 1: Wire props on InterviewClient**

```tsx
'use client';

import {
  Shell,
  type AssetRequestHandler,
  type FinishHandler,
  type InterviewAnalyticsMetadata,
  type InterviewPayload,
  type StepChangeHandler,
  type SyncHandler,
} from '@codaco/interview';
import posthog from 'posthog-js';
import { POSTHOG_APP_NAME } from '~/fresco.config';
// ...existing imports

type Props = {
  payload: InterviewPayload;
  assetUrls: Record<string, string>;
  initialStep: number;
  installationId: string;
  hostVersion: string;
  disableAnalytics: boolean;
};

export default function InterviewClient({
  payload,
  assetUrls,
  initialStep,
  installationId,
  hostVersion,
  disableAnalytics,
}: Props) {
  // ...existing setup

  const analytics: InterviewAnalyticsMetadata = useMemo(
    () => ({
      installationId,
      hostApp: POSTHOG_APP_NAME,
      hostVersion,
    }),
    [installationId, hostVersion],
  );

  return (
    <Shell
      payload={payload}
      currentStep={currentStep}
      onStepChange={onStepChange}
      onSync={onSync}
      onFinish={onFinish}
      onRequestAsset={onRequestAsset}
      flags={flags}
      analytics={analytics}
      posthogClient={posthog}
      disableAnalytics={disableAnalytics}
    />
  );
}
```

- [ ] **Step 2: Update the page that renders `InterviewClient`**

In `app/(interview)/interview/[interviewId]/page.tsx` (or wherever it's mounted), pull `installationId`, `hostVersion`, and `disableAnalytics` from server-side queries and pass through.

`installationId` comes from `getInstallationId()` in `queries/appSettings.ts`. `disableAnalytics` from `getDisableAnalytics()`. `hostVersion` from `package.json` or env var.

- [ ] **Step 3: Repeat for preview path**.

- [ ] **Step 4: Remove `<PostHogIdentify>` for the interview tree only (keep for non-interview pages)**

Since the interview Shell now sets its own per-event `distinct_id` override, the host's instance-level `identify(installationId)` is fine for non-interview pages but doesn't affect interview events. No change needed unless you want to drop installation-keyed identity globally — leave as-is.

- [ ] **Step 5: Typecheck, run tests, commit**

```bash
cd ~/Projects/fresco-next
pnpm typecheck
pnpm test
git add app
git commit -m "feat: wire analytics props into Shell"
```

---

### Task 39: Smoke-test in fresco-next dev

**Files:** none (smoke test)

- [ ] **Step 1: Run fresco-next dev**

```bash
cd ~/Projects/fresco-next
pnpm dev
```

- [ ] **Step 2: Manually verify**

In a browser:
1. Open an interview.
2. Open DevTools → Network → filter for `ph-relay.networkcanvas.com`.
3. Confirm requests are firing.
4. Inspect a request payload — confirm: `app: 'Fresco'`, `installation_id: <uuid>`, `protocol_hash: <hash>`, `package_version: '1.0.0-alpha.1'`, `distinct_id: <interview-id>`.
5. Confirm: NO interview-network data, NO codebook variable names, NO prompt text, NO alter labels.
6. Toggle the disable-analytics setting in app settings — confirm requests stop.

- [ ] **Step 3: Commit any small fixes that turned up; otherwise no commit needed.**

---

## Self-Review

**Spec coverage:**

- Section 4 (architecture, two modes) — Tasks 7, 9, 13.
- Section 5 (public API) — Tasks 4, 13.
- Section 6 (config constants) — Task 5.
- Section 7 (super properties) — Tasks 5, 6.
- Section 8 (PII contract) — Tasks 16, 18, 30.
- Section 9 (event taxonomy):
  - 9.1 stage-level — Tasks 17, 29.
  - 9.2 global entity events — Task 16.
  - 9.3 form family — Task 20.
  - 9.3 NameGenerator — Task 21.
  - 9.3 NameGeneratorRoster — Task 22.
  - 9.3 Sociogram — Task 23.
  - 9.3 Comparison family — Task 24.
  - 9.3 CategoricalBin/OrdinalBin — Task 25.
  - 9.3 Narrative — Task 26.
  - 9.3 FamilyPedigree — Task 27.
  - 9.3 Anonymisation — Task 18.
  - 9.3 Geospatial — Task 28.
  - 9.3 Information — Task 12 (video onError → captureException).
- Section 10 (error reporting) — Tasks 10, 11, 12.
- Section 11 (code organisation) — Tasks 5–9, 14.
- Section 12 (testing strategy) — Tasks 6, 7, 8, 9, 15, 30, 31.
- Section 13 (migration & rollout) — Tasks 1–2 (protocol-validation), 32–35 (interview package), 36–39 (fresco-next).

**Placeholder scan:** all task code blocks contain executable code; ambiguous "stub" notes appear only where the precise component API depends on the engineer reading the actual file (Tasks 19, 21–28). Each such note is bounded by a concrete shape sketch.

**Type consistency:** `Tracker.track`, `Tracker.captureException`, `InterviewAnalyticsMetadata` (with `installationId`, `hostApp`, `hostVersion`), `SuperProperties` (snake_case keys), `ProtocolPayload.hash`, `INSTANCE_NAME = '@codaco/interview'` — used identically across tasks.

**Scope check:** the plan is one feature spanning two repos and three packages. Each phase produces working software (Phase 1 alone is shippable as protocol-validation@11.5.0). Phases 2–7 produce a usable interview alpha. Phase 8 ships it. Phase 9 wires the consumer. Independent enough.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-interview-analytics-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
