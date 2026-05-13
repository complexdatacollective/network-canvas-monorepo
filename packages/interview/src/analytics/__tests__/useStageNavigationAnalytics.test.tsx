import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import protocol from "~/store/modules/protocol";
import session from "~/store/modules/session";
import ui from "~/store/modules/ui";
import { AnalyticsContext } from "../AnalyticsContext";
import type { Tracker } from "../tracker";
import { useStageNavigationAnalytics } from "../useStageNavigationAnalytics";

function makeWrapper(tracker: Tracker, stages: Array<{ type: string }>) {
	const store = configureStore({
		reducer: { session, protocol, ui },
		preloadedState: {
			protocol: { id: "p", hash: "h", schemaVersion: 8, codebook: {}, stages } as never,
		},
		middleware: (g) => g({ serializableCheck: false }),
	});
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<Provider store={store}>
				<AnalyticsContext.Provider value={tracker}>{children}</AnalyticsContext.Provider>
			</Provider>
		);
	};
}

describe("useStageNavigationAnalytics", () => {
	it("emits interview_started + stage_entered on first mount", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const wrapper = makeWrapper(tracker, [{ type: "Information" }, { type: "NameGenerator" }]);
		renderHook(() => useStageNavigationAnalytics({ stage_index: 0, stage_type: "Information" }), { wrapper });

		expect(tracker.track).toHaveBeenCalledWith("interview_started");
		expect(tracker.track).toHaveBeenCalledWith(
			"stage_entered",
			expect.objectContaining({ stage_type: "Information", stage_index: 0, direction: "initial" }),
		);
	});

	it("emits stage_exited with duration_ms on rerender to a new step", async () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const stages = [{ type: "Information" }, { type: "NameGenerator" }];
		const wrapper = makeWrapper(tracker, stages);
		const { rerender } = renderHook(
			(props: { stage_index: number; stage_type?: string }) => useStageNavigationAnalytics(props),
			{
				wrapper,
				initialProps: { stage_index: 0, stage_type: "Information" },
			},
		);
		await new Promise((r) => setTimeout(r, 10));
		tracker.track.mockClear();
		rerender({ stage_index: 1, stage_type: "NameGenerator" });

		const exitCall = tracker.track.mock.calls.find(([n]) => n === "stage_exited");
		expect(exitCall?.[1]).toMatchObject({
			stage_type: "Information",
			stage_index: 0,
			exit_direction: "forward",
		});
		expect(typeof exitCall?.[1].duration_ms).toBe("number");
	});

	it("emits interview_finished when entering FinishSession stage", () => {
		const tracker = { track: vi.fn(), captureException: vi.fn() };
		const wrapper = makeWrapper(tracker, [
			{ type: "Information" },
			{ type: "NameGenerator" },
			{ type: "FinishSession" },
		]);
		renderHook(() => useStageNavigationAnalytics({ stage_index: 2, stage_type: "FinishSession" }), { wrapper });
		expect(tracker.track).toHaveBeenCalledWith("interview_finished", { stage_count: 3 });
	});
});
