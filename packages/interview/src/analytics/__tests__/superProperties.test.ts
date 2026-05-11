import { describe, expect, it } from "vitest";
import type { InterviewAnalyticsMetadata, InterviewPayload } from "~/contract/types";
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
