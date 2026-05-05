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
		const client = { capture: vi.fn(), register: vi.fn(), captureException: vi.fn() };
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
		act(() => {
			getByRole("button").click();
		});
		expect(client.capture).not.toHaveBeenCalled();
	});

	it("forwards events to a host-supplied client without calling register on it", async () => {
		const client = { capture: vi.fn(), register: vi.fn(), captureException: vi.fn() };
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
			act(() => {
				getByRole("button").click();
			});
			expect(client.capture).toHaveBeenCalled();
		});
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
		expect(client.register).not.toHaveBeenCalled();
	});
});
