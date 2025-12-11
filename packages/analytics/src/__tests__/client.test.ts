import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalytics } from "../client";
import type { MergedAnalyticsConfig } from "../config";

// Mock posthog-js
vi.mock("posthog-js", () => ({
	default: {
		init: vi.fn().mockReturnValue({
			register: vi.fn(),
			debug: vi.fn(),
		}),
		capture: vi.fn(),
		isFeatureEnabled: vi.fn(),
		getFeatureFlag: vi.fn(),
		reloadFeatureFlags: vi.fn(),
		identify: vi.fn(),
		reset: vi.fn(),
	},
}));

import posthog from "posthog-js";

describe("createAnalytics", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const mockConfig: MergedAnalyticsConfig = {
		product: "architect",
		apiHost: "https://ph-relay.networkcanvas.com",
		apiKey: "phc_test",
		installationId: "test-install-123",
		disabled: false,
		debug: false,
		logging: false,
		posthogOptions: {},
	};

	describe("initialization", () => {
		it("should initialize PostHog with correct config", () => {
			createAnalytics(mockConfig);

			expect(posthog.init).toHaveBeenCalledWith(
				"phc_test",
				expect.objectContaining({
					api_host: "https://ph-relay.networkcanvas.com",
				}),
			);
		});

		it("should not initialize PostHog when disabled", () => {
			const disabledConfig = { ...mockConfig, disabled: true };
			const analytics = createAnalytics(disabledConfig);

			expect(posthog.init).not.toHaveBeenCalled();
			expect(analytics.isEnabled()).toBe(false);
		});

		it("should register product and installation ID as super properties", () => {
			const mockPosthogInstance = {
				register: vi.fn(),
				debug: vi.fn(),
			};

			vi.mocked(posthog.init).mockImplementation((_token, options) => {
				options?.loaded?.(mockPosthogInstance as never);
				return mockPosthogInstance as never;
			});

			createAnalytics(mockConfig);

			expect(mockPosthogInstance.register).toHaveBeenCalledWith({
				product: "architect",
				installation_id: "test-install-123",
			});
		});

		it("should register only product when installationId is not provided", () => {
			const mockPosthogInstance = {
				register: vi.fn(),
				debug: vi.fn(),
			};

			vi.mocked(posthog.init).mockImplementation((_token, options) => {
				options?.loaded?.(mockPosthogInstance as never);
				return mockPosthogInstance as never;
			});

			const configWithoutInstallationId: MergedAnalyticsConfig = {
				...mockConfig,
				installationId: undefined,
			};

			createAnalytics(configWithoutInstallationId);

			expect(mockPosthogInstance.register).toHaveBeenCalledWith({
				product: "architect",
			});
		});

		it("should enable debug mode when configured", () => {
			const mockPosthogInstance = {
				register: vi.fn(),
				debug: vi.fn(),
			};

			vi.mocked(posthog.init).mockImplementation((_token, options) => {
				options?.loaded?.(mockPosthogInstance as never);
				return mockPosthogInstance as never;
			});

			const debugConfig = { ...mockConfig, debug: true };
			createAnalytics(debugConfig);

			expect(mockPosthogInstance.debug).toHaveBeenCalled();
		});
	});

	describe("trackEvent", () => {
		it("should capture events with PostHog", () => {
			const analytics = createAnalytics(mockConfig);

			analytics.trackEvent("app_setup", {
				metadata: { version: "1.0.0" },
			});

			expect(posthog.capture).toHaveBeenCalledWith("app_setup", {
				metadata: { version: "1.0.0" },
				version: "1.0.0",
			});
		});

		it("should flatten metadata into properties", () => {
			const analytics = createAnalytics(mockConfig);

			analytics.trackEvent("protocol_installed", {
				metadata: {
					protocolId: "proto-123",
					version: "2.0.0",
				},
			});

			expect(posthog.capture).toHaveBeenCalledWith("protocol_installed", {
				metadata: {
					protocolId: "proto-123",
					version: "2.0.0",
				},
				protocolId: "proto-123",
				version: "2.0.0",
			});
		});

		it("should not capture events when disabled", () => {
			const disabledConfig = { ...mockConfig, disabled: true };
			const analytics = createAnalytics(disabledConfig);

			analytics.trackEvent("app_setup");

			expect(posthog.capture).not.toHaveBeenCalled();
		});

		it("should handle errors gracefully", () => {
			const analytics = createAnalytics(mockConfig);
			vi.mocked(posthog.capture).mockImplementation(() => {
				throw new Error("PostHog error");
			});

			// Should not throw
			expect(() => analytics.trackEvent("app_setup")).not.toThrow();
		});
	});

	describe("trackError", () => {
		it("should capture errors with full details", () => {
			const analytics = createAnalytics(mockConfig);
			const error = new Error("Test error");
			error.stack = "Error: Test error\n    at test.ts:10";

			analytics.trackError(error);

			expect(posthog.capture).toHaveBeenCalledWith(
				"error",
				expect.objectContaining({
					message: "Test error",
					name: "Error",
					stack: expect.stringContaining("Error: Test error"),
				}),
			);
		});

		it("should include additional properties", () => {
			const analytics = createAnalytics(mockConfig);
			const error = new Error("Test error");

			analytics.trackError(error, {
				metadata: { context: "test" },
			});

			expect(posthog.capture).toHaveBeenCalledWith(
				"error",
				expect.objectContaining({
					message: "Test error",
					metadata: { context: "test" },
					context: "test",
				}),
			);
		});

		it("should not capture errors when disabled", () => {
			const disabledConfig = { ...mockConfig, disabled: true };
			const analytics = createAnalytics(disabledConfig);
			const error = new Error("Test error");

			analytics.trackError(error);

			expect(posthog.capture).not.toHaveBeenCalled();
		});
	});

	describe("feature flags", () => {
		it("should check if feature is enabled", () => {
			const analytics = createAnalytics(mockConfig);
			vi.mocked(posthog.isFeatureEnabled).mockReturnValue(true);

			const result = analytics.isFeatureEnabled("new-feature");

			expect(result).toBe(true);
			expect(posthog.isFeatureEnabled).toHaveBeenCalledWith("new-feature");
		});

		it("should get feature flag value", () => {
			const analytics = createAnalytics(mockConfig);
			vi.mocked(posthog.getFeatureFlag).mockReturnValue("variant-a");

			const result = analytics.getFeatureFlag("experiment");

			expect(result).toBe("variant-a");
			expect(posthog.getFeatureFlag).toHaveBeenCalledWith("experiment");
		});

		it("should reload feature flags", () => {
			const analytics = createAnalytics(mockConfig);

			analytics.reloadFeatureFlags();

			expect(posthog.reloadFeatureFlags).toHaveBeenCalled();
		});

		it("should return false for feature flags when disabled", () => {
			const disabledConfig = { ...mockConfig, disabled: true };
			const analytics = createAnalytics(disabledConfig);

			expect(analytics.isFeatureEnabled("test")).toBe(false);
			expect(analytics.getFeatureFlag("test")).toBeUndefined();
		});
	});

	describe("user identification", () => {
		it("should identify users", () => {
			const analytics = createAnalytics(mockConfig);

			analytics.identify("user-123", { email: "test@example.com" });

			expect(posthog.identify).toHaveBeenCalledWith("user-123", {
				email: "test@example.com",
			});
		});

		it("should reset user identity", () => {
			const analytics = createAnalytics(mockConfig);

			analytics.reset();

			expect(posthog.reset).toHaveBeenCalled();
		});

		it("should not identify when disabled", () => {
			const disabledConfig = { ...mockConfig, disabled: true };
			const analytics = createAnalytics(disabledConfig);

			analytics.identify("user-123");

			expect(posthog.identify).not.toHaveBeenCalled();
		});
	});

	describe("utility methods", () => {
		it("should return enabled status", () => {
			const analytics = createAnalytics(mockConfig);
			expect(analytics.isEnabled()).toBe(true);

			const disabledConfig = { ...mockConfig, disabled: true };
			const disabledAnalytics = createAnalytics(disabledConfig);
			expect(disabledAnalytics.isEnabled()).toBe(false);
		});

		it("should return installation ID when provided", () => {
			const analytics = createAnalytics(mockConfig);
			expect(analytics.getInstallationId()).toBe("test-install-123");
		});

		it("should return undefined installation ID when not provided", () => {
			const configWithoutInstallationId: MergedAnalyticsConfig = {
				...mockConfig,
				installationId: undefined,
			};
			const analytics = createAnalytics(configWithoutInstallationId);
			expect(analytics.getInstallationId()).toBeUndefined();
		});

		it("should return product", () => {
			const analytics = createAnalytics(mockConfig);
			expect(analytics.getProduct()).toBe("architect");
		});
	});
});
