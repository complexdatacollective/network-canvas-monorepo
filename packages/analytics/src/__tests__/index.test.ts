import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AnalyticsEventSchema,
	createRouteHandler,
	eventTypes,
	makeEventTracker,
	type RawEvent,
	RawEventSchema,
	type TrackableEvent,
	TrackableEventSchema,
} from "../index";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Event Schemas", () => {
	describe("RawEventSchema", () => {
		it("should validate a valid event", () => {
			const event = {
				type: "AppSetup",
				metadata: { version: "1.0.0" },
			};
			const result = RawEventSchema.safeParse(event);
			expect(result.success).toBe(true);
		});

		it("should validate a valid error event", () => {
			const event = {
				type: "Error",
				message: "Something went wrong",
				name: "TestError",
				stack: "Error stack trace",
			};
			const result = RawEventSchema.safeParse(event);
			expect(result.success).toBe(true);
		});

		it("should reject an invalid event type", () => {
			const event = {
				type: "InvalidType",
			};
			const result = RawEventSchema.safeParse(event);
			expect(result.success).toBe(false);
		});

		it("should validate all defined event types", () => {
			for (const type of eventTypes) {
				const event = { type };
				const result = RawEventSchema.safeParse(event);
				expect(result.success).toBe(true);
			}
		});

		it("should allow metadata to be optional", () => {
			const event = {
				type: "ProtocolInstalled",
			};
			const result = RawEventSchema.safeParse(event);
			expect(result.success).toBe(true);
		});
	});

	describe("TrackableEventSchema", () => {
		it("should validate an event with timestamp", () => {
			const event = {
				type: "InterviewStarted",
				timestamp: new Date().toJSON(),
				metadata: { userId: "123" },
			};
			const result = TrackableEventSchema.safeParse(event);
			expect(result.success).toBe(true);
		});

		it("should reject an event without timestamp", () => {
			const event = {
				type: "InterviewCompleted",
			};
			const result = TrackableEventSchema.safeParse(event);
			expect(result.success).toBe(false);
		});
	});

	describe("AnalyticsEventSchema", () => {
		it("should validate a complete analytics event", () => {
			const event = {
				type: "DataExported",
				timestamp: new Date().toJSON(),
				installationId: "install-123",
				countryISOCode: "US",
			};
			const result = AnalyticsEventSchema.safeParse(event);
			expect(result.success).toBe(true);
		});

		it("should reject an event missing installationId", () => {
			const event = {
				type: "DataExported",
				timestamp: new Date().toJSON(),
				countryISOCode: "US",
			};
			const result = AnalyticsEventSchema.safeParse(event);
			expect(result.success).toBe(false);
		});

		it("should reject an event missing countryISOCode", () => {
			const event = {
				type: "DataExported",
				timestamp: new Date().toJSON(),
				installationId: "install-123",
			};
			const result = AnalyticsEventSchema.safeParse(event);
			expect(result.success).toBe(false);
		});
	});
});

describe("createRouteHandler", () => {
	beforeEach(() => {
		mockFetch.mockClear();
	});

	const createMockRequest = (body: unknown) => {
		return {
			json: async () => body,
		} as NextRequest;
	};

	describe("Analytics disabled", () => {
		it("should return 200 when analytics is disabled", async () => {
			const handler = createRouteHandler({
				installationId: "test-install",
				disableAnalytics: true,
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBe("Analytics disabled");
			expect(mockFetch).not.toHaveBeenCalled();
		});
	});

	describe("Event validation", () => {
		it("should return 400 for invalid event schema", async () => {
			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const invalidEvent = {
				type: "InvalidType",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(invalidEvent);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("Invalid event");
		});

		it("should return 400 when event is missing timestamp", async () => {
			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const invalidEvent = {
				type: "AppSetup",
			};

			const request = createMockRequest(invalidEvent);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe("Invalid event");
		});
	});

	describe("Geolocation", () => {
		it("should successfully fetch IP and geolocation data", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "US",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);

			expect(response.status).toBe(200);
			expect(mockFetch).toHaveBeenNthCalledWith(1, "https://api64.ipify.org");
			expect(mockFetch).toHaveBeenNthCalledWith(2, "http://ip-api.com/json/123.45.67.89");
		});

		it("should use 'Unknown' country code when IP fetch fails", async () => {
			mockFetch.mockRejectedValueOnce(new Error("IP fetch failed")).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);

			expect(response.status).toBe(200);
			// Verify the platform call was made with Unknown country
			const platformCall = mockFetch.mock.calls.find((call) => call[0].includes("/api/event"));
			expect(platformCall).toBeDefined();
		});

		it("should use 'Unknown' country code when geo API returns fail status", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "fail",
						message: "Invalid IP",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);

			expect(response.status).toBe(200);
		});

		it("should use 'Unknown' country code when IP is empty", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "",
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);

			expect(response.status).toBe(200);
		});
	});

	describe("Platform forwarding", () => {
		it("should successfully forward event to platform", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "GB",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				});

			const handler = createRouteHandler({
				platformUrl: "https://test-platform.com",
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "ProtocolInstalled",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBe("Event forwarded successfully");

			const platformCall = mockFetch.mock.calls.find((call) => call[0].includes("test-platform.com/api/event"));
			expect(platformCall).toBeDefined();
			expect(platformCall?.[1]).toMatchObject({
				method: "POST",
				keepalive: true,
				headers: {
					"Content-Type": "application/json",
				},
			});
		});

		it("should use default platform URL when not specified", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "US",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			await handler(request);

			const platformCall = mockFetch.mock.calls.find((call) =>
				call[0].includes("analytics.networkcanvas.com/api/event"),
			);
			expect(platformCall).toBeDefined();
		});

		it("should return 500 with specific error for 400 response from platform", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "US",
					}),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 400,
					statusText: "Bad Request",
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe("Analytics platform rejected the event as invalid. Please check the event schema");
		});

		it("should return 500 with specific error for 404 response from platform", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "US",
					}),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
					statusText: "Not Found",
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe(
				"Analytics platform could not be reached. Please specify a valid platform URL, or check that the platform is online.",
			);
		});

		it("should return 500 with specific error for 500 response from platform", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "US",
					}),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe("Analytics platform returned an internal server error. Please check the platform logs.");
		});

		it("should return 500 with generic error for other status codes", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "US",
					}),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 503,
					statusText: "Service Unavailable",
				});

			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const event: TrackableEvent = {
				type: "AppSetup",
				timestamp: new Date().toJSON(),
			};

			const request = createMockRequest(event);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe("Analytics platform returned an unexpected error: Service Unavailable");
		});
	});

	describe("Error handling", () => {
		it("should handle JSON parsing errors", async () => {
			const handler = createRouteHandler({
				installationId: "test-install",
			});

			const request = {
				json: async () => {
					throw new Error("Invalid JSON");
				},
			} as NextRequest;

			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toContain("Error in analytics route handler");
			expect(data.error).toContain("Invalid JSON");
		});
	});

	describe("Complete flow", () => {
		it("should handle complete event flow with metadata", async () => {
			mockFetch
				.mockResolvedValueOnce({
					text: async () => "123.45.67.89",
				})
				.mockResolvedValueOnce({
					json: async () => ({
						status: "success",
						countryCode: "CA",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				});

			const handler = createRouteHandler({
				installationId: "test-install-123",
				platformUrl: "https://custom-platform.com",
			});

			const event: TrackableEvent = {
				type: "InterviewCompleted",
				timestamp: "2024-01-01T00:00:00.000Z",
				metadata: {
					duration: 300,
					participantId: "part-456",
				},
			};

			const request = createMockRequest(event);
			const response = await handler(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBe("Event forwarded successfully");

			const platformCall = mockFetch.mock.calls.find((call) => call[0].includes("custom-platform.com/api/event"));
			expect(platformCall).toBeDefined();

			const sentEvent = JSON.parse(platformCall?.[1]?.body as string);
			expect(sentEvent).toMatchObject({
				type: "InterviewCompleted",
				timestamp: "2024-01-01T00:00:00.000Z",
				installationId: "test-install-123",
				countryISOCode: "CA",
				metadata: {
					duration: 300,
					participantId: "part-456",
				},
			});
		});
	});
});

describe("makeEventTracker", () => {
	beforeEach(() => {
		mockFetch.mockClear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should successfully send event with timestamp", async () => {
		const mockDate = new Date("2024-01-01T12:00:00.000Z");
		vi.setSystemTime(mockDate);

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true }),
		});

		const trackEvent = makeEventTracker();

		const event: RawEvent = {
			type: "AppSetup",
		};

		const result = await trackEvent(event);

		expect(result).toEqual({ error: null, success: true });
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/analytics",
			expect.objectContaining({
				method: "POST",
				keepalive: true,
				headers: {
					"Content-Type": "application/json",
				},
			}),
		);

		const sentData = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
		expect(sentData).toMatchObject({
			type: "AppSetup",
			timestamp: "2024-01-01T12:00:00.000Z",
		});
	});

	it("should use custom endpoint when provided", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true }),
		});

		const trackEvent = makeEventTracker({ endpoint: "/custom/analytics" });

		const event: RawEvent = {
			type: "ProtocolInstalled",
		};

		await trackEvent(event);

		expect(mockFetch).toHaveBeenCalledWith(
			"/custom/analytics",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("should handle 404 error from endpoint", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 404,
		});

		const trackEvent = makeEventTracker();

		const event: RawEvent = {
			type: "InterviewStarted",
		};

		const result = await trackEvent(event);

		expect(result).toEqual({
			error: "Analytics endpoint not found, did you forget to add the route?",
			success: false,
		});
	});

	it("should handle 400 error for invalid event", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 400,
			statusText: "Bad Request",
		});

		const trackEvent = makeEventTracker();

		const event: RawEvent = {
			type: "InterviewCompleted",
		};

		const result = await trackEvent(event);

		expect(result).toEqual({
			error: "Invalid event sent to analytics endpoint: Bad Request",
			success: false,
		});
	});

	it("should handle 500 error from endpoint", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		const trackEvent = makeEventTracker();

		const event: RawEvent = {
			type: "DataExported",
		};

		const result = await trackEvent(event);

		expect(result).toEqual({
			error:
				"Internal server error when sending analytics event: Internal Server Error. Check the route handler implementation.",
			success: false,
		});
	});

	it("should handle network errors", async () => {
		mockFetch.mockRejectedValueOnce(new Error("Network error"));

		const trackEvent = makeEventTracker();

		const event: RawEvent = {
			type: "AppSetup",
		};

		const result = await trackEvent(event);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Internal error when sending analytics event");
		expect(result.error).toContain("Network error");
	});

	it("should send error events with all required fields", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true }),
		});

		const trackEvent = makeEventTracker();

		const errorEvent: RawEvent = {
			type: "Error",
			message: "Something went wrong",
			name: "TestError",
			stack: "Error stack trace here",
			cause: "Root cause",
		};

		const result = await trackEvent(errorEvent);

		expect(result).toEqual({ error: null, success: true });

		const sentData = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
		expect(sentData).toMatchObject({
			type: "Error",
			message: "Something went wrong",
			name: "TestError",
			stack: "Error stack trace here",
			cause: "Root cause",
		});
		expect(sentData.timestamp).toBeDefined();
	});

	it("should send events with metadata", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true }),
		});

		const trackEvent = makeEventTracker();

		const event: RawEvent = {
			type: "ProtocolInstalled",
			metadata: {
				protocolId: "proto-123",
				version: "2.0.0",
				source: "import",
			},
		};

		const result = await trackEvent(event);

		expect(result).toEqual({ error: null, success: true });

		const sentData = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
		expect(sentData.metadata).toEqual({
			protocolId: "proto-123",
			version: "2.0.0",
			source: "import",
		});
	});

	it("should handle non-Error thrown values", async () => {
		mockFetch.mockRejectedValueOnce("String error");

		const trackEvent = makeEventTracker();

		const event: RawEvent = {
			type: "AppSetup",
		};

		const result = await trackEvent(event);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Internal error when sending analytics event");
	});
});
