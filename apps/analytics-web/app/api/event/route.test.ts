import type { analyticsEvent } from "@codaco/analytics";
import { testApiHandler } from "next-test-api-route-handler";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as appHandler from "./route";

vi.mock("~/app/_actions/actions", () => {
	return {
		insertEvent: (eventData: unknown) => ({ data: eventData, error: null }),
	};
});

describe("/api/event", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});
	it("should insert a valid event to the database", async () => {
		const eventData: analyticsEvent = {
			type: "AppSetup",
			metadata: {
				details: "testing details",
				path: "testing path",
			},
			countryISOCode: "US",
			installationId: "21321546453213123",
			timestamp: new Date().toString(),
		};

		await testApiHandler({
			appHandler,
			test: async ({ fetch }) => {
				const response = await fetch({
					method: "POST",
					body: JSON.stringify(eventData),
				});
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual({ event: eventData });
			},
		});
	});

	it("should insert a valid error into the database", async () => {
		const eventData: analyticsEvent = {
			type: "Error",
			name: "TestError",
			message: "Test message",
			stack: "Test stack",
			metadata: {
				details: "testing details",
				path: "testing path",
			},
			countryISOCode: "US",
			installationId: "21321546453213123",
			timestamp: new Date().toString(),
		};

		await testApiHandler({
			appHandler,
			test: async ({ fetch }) => {
				const response = await fetch({
					method: "POST",
					body: JSON.stringify(eventData),
				});
				expect(response.status).toBe(200);
			},
		});
	});

	it("should return 400 if event is invalid", async () => {
		const eventData = {
			type: "InvalidEvent",
		};

		await testApiHandler({
			appHandler,
			test: async ({ fetch }) => {
				const response = await fetch({
					method: "POST",
					body: JSON.stringify(eventData),
				});
				expect(response.status).toBe(400);
			},
		});
	});
});
