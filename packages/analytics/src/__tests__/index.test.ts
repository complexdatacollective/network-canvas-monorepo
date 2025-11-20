import { describe, expect, it } from "vitest";
import { defaultConfig, isDisabledByEnv, mergeConfig } from "../config";
import { ErrorPropertiesSchema, EventPropertiesSchema, type EventType, eventTypes, legacyEventTypeMap } from "../types";

describe("Event Types", () => {
	it("should export all event types", () => {
		expect(eventTypes).toEqual([
			"app_setup",
			"protocol_installed",
			"interview_started",
			"interview_completed",
			"data_exported",
			"error",
		]);
	});

	it("should map legacy event types to new snake_case types", () => {
		expect(legacyEventTypeMap.AppSetup).toBe("app_setup");
		expect(legacyEventTypeMap.ProtocolInstalled).toBe("protocol_installed");
		expect(legacyEventTypeMap.InterviewStarted).toBe("interview_started");
		expect(legacyEventTypeMap.InterviewCompleted).toBe("interview_completed");
		expect(legacyEventTypeMap.DataExported).toBe("data_exported");
		expect(legacyEventTypeMap.Error).toBe("error");
	});
});

describe("Event Schemas", () => {
	describe("EventPropertiesSchema", () => {
		it("should validate event properties with metadata", () => {
			const properties = {
				metadata: {
					version: "1.0.0",
					userId: "123",
				},
			};

			const result = EventPropertiesSchema.safeParse(properties);
			expect(result.success).toBe(true);
		});

		it("should validate event properties without metadata", () => {
			const properties = {};
			const result = EventPropertiesSchema.safeParse(properties);
			expect(result.success).toBe(true);
		});

		it("should allow arbitrary metadata keys and values", () => {
			const properties = {
				metadata: {
					string: "value",
					number: 42,
					boolean: true,
					nested: { key: "value" },
					array: [1, 2, 3],
				},
			};

			const result = EventPropertiesSchema.safeParse(properties);
			expect(result.success).toBe(true);
		});
	});

	describe("ErrorPropertiesSchema", () => {
		it("should validate error properties with all fields", () => {
			const errorProps = {
				message: "Something went wrong",
				name: "TestError",
				stack: "Error: Something went wrong\n    at test.ts:10",
				cause: "Root cause",
				metadata: {
					context: "test",
				},
			};

			const result = ErrorPropertiesSchema.safeParse(errorProps);
			expect(result.success).toBe(true);
		});

		it("should validate error properties with required fields only", () => {
			const errorProps = {
				message: "Error message",
				name: "Error",
			};

			const result = ErrorPropertiesSchema.safeParse(errorProps);
			expect(result.success).toBe(true);
		});

		it("should reject error properties missing message", () => {
			const errorProps = {
				name: "Error",
			};

			const result = ErrorPropertiesSchema.safeParse(errorProps);
			expect(result.success).toBe(false);
		});

		it("should reject error properties missing name", () => {
			const errorProps = {
				message: "Error message",
			};

			const result = ErrorPropertiesSchema.safeParse(errorProps);
			expect(result.success).toBe(false);
		});
	});
});

describe("Configuration", () => {
	describe("defaultConfig", () => {
		it("should have correct default values", () => {
			expect(defaultConfig.apiHost).toBe("https://ph-relay.networkcanvas.com");
			expect(defaultConfig.posthogOptions?.disable_session_recording).toBe(true);
			expect(defaultConfig.posthogOptions?.autocapture).toBe(false);
			expect(defaultConfig.posthogOptions?.capture_pageview).toBe(false);
			expect(defaultConfig.posthogOptions?.advanced_disable_feature_flags).toBe(false);
		});
	});

	describe("mergeConfig", () => {
		it("should merge user config with defaults", () => {
			const userConfig = {
				installationId: "test-123",
				apiKey: "phc_test",
			};

			const merged = mergeConfig(userConfig);

			expect(merged.installationId).toBe("test-123");
			expect(merged.apiKey).toBe("phc_test");
			expect(merged.apiHost).toBe("https://ph-relay.networkcanvas.com");
			expect(merged.disabled).toBe(false);
		});

		it("should allow overriding default values", () => {
			const userConfig = {
				installationId: "test-123",
				apiKey: "phc_test",
				apiHost: "https://custom.posthog.com",
				disabled: true,
				debug: true,
			};

			const merged = mergeConfig(userConfig);

			expect(merged.apiHost).toBe("https://custom.posthog.com");
			expect(merged.disabled).toBe(true);
			expect(merged.debug).toBe(true);
		});

		it("should use placeholder API key when none provided (proxy mode)", () => {
			const userConfig = {
				installationId: "test-123",
			};

			const merged = mergeConfig(userConfig);

			// When using proxy mode, a placeholder key is automatically provided
			expect(merged.apiKey).toBe("phc_proxy_mode_placeholder");
			expect(merged.installationId).toBe("test-123");
		});

		it("should merge PostHog options", () => {
			const userConfig = {
				installationId: "test-123",
				apiKey: "phc_test",
				posthogOptions: {
					autocapture: true,
					capture_pageview: true,
				},
			};

			const merged = mergeConfig(userConfig);

			expect(merged.posthogOptions.autocapture).toBe(true);
			expect(merged.posthogOptions.capture_pageview).toBe(true);
			// Should still have default values for other options
			expect(merged.posthogOptions.disable_session_recording).toBe(true);
		});
	});
});

describe("Environment Variables", () => {
	describe("isDisabledByEnv", () => {
		it("should return a boolean value", () => {
			// This test depends on the actual env vars
			// In a real test, you would mock process.env
			const result = isDisabledByEnv();
			expect(typeof result).toBe("boolean");
		});
	});
});

describe("Type Exports", () => {
	it("should export EventType correctly", () => {
		const validTypes: EventType[] = [
			"app_setup",
			"protocol_installed",
			"interview_started",
			"interview_completed",
			"data_exported",
			"error",
		];

		expect(validTypes).toEqual(eventTypes);
	});
});
