import { describe, expect, it, vi } from "vitest";
import { createTracker, NULL_TRACKER } from "../tracker";

const baseSuperProps = {
	app: "Fresco",
	installation_id: "i1",
	package_version: "1",
	protocol_hash: "h",
} as const;

describe("createTracker", () => {
	it("calls capture with merged super-props, event-props, and distinct_id override", () => {
		const client = { capture: vi.fn(), captureException: vi.fn() };
		const tracker = createTracker({
			client: client as never,
			superProperties: baseSuperProps,
			distinctId: "session-1",
			ownsInstance: false,
		});
		tracker.track("node_added", { node_id: "n1", node_type: "person" });
		expect(client.capture).toHaveBeenCalledWith(
			"node_added",
			expect.objectContaining({
				node_id: "n1",
				node_type: "person",
				app: "Fresco",
				installation_id: "i1",
				package_version: "1",
				protocol_hash: "h",
				distinct_id: "session-1",
			}),
		);
	});

	it("does NOT merge super-props when ownsInstance=true (relies on register())", () => {
		const client = { capture: vi.fn(), captureException: vi.fn() };
		const tracker = createTracker({
			client: client as never,
			superProperties: baseSuperProps,
			distinctId: "session-1",
			ownsInstance: true,
		});
		tracker.track("node_added", { node_id: "n1" });
		const props = client.capture.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(props.app).toBeUndefined();
		expect(props.distinct_id).toBe("session-1");
	});

	it("captureException applies distinct_id override and merges feature tag", () => {
		const client = { capture: vi.fn(), captureException: vi.fn() };
		const tracker = createTracker({
			client: client as never,
			superProperties: baseSuperProps,
			distinctId: "session-1",
			ownsInstance: false,
		});
		const err = new Error("boom");
		tracker.captureException(err, { feature: "external-data" });
		expect(client.captureException).toHaveBeenCalledWith(
			err,
			"session-1",
			expect.objectContaining({ feature: "external-data" }),
		);
	});

	it("track swallows thrown errors from the client", () => {
		const client = {
			capture: vi.fn(() => {
				throw new Error("posthog crashed");
			}),
			captureException: vi.fn(),
		};
		const tracker = createTracker({
			client: client as never,
			superProperties: baseSuperProps,
			distinctId: "session-1",
			ownsInstance: false,
		});
		expect(() => tracker.track("x")).not.toThrow();
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
