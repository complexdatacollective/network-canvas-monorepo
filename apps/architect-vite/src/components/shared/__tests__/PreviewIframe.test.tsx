import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import previewReducer, { type PreviewState } from "~/ducks/modules/preview";
import PreviewIframe from "../PreviewIframe";

vi.mock("~/utils/preview/uploadPreview", () => ({
	uploadProtocolForPreview: vi.fn(async () => ({
		status: "ready",
		previewUrl: "https://example.test/preview",
		protocolId: "p1",
	})),
}));

type TimelineState = { present: unknown; past: unknown[]; future: unknown[] };

type TestState = {
	preview: PreviewState;
	activeProtocol: TimelineState;
};

const defaultTimeline: TimelineState = { present: { name: "P" }, past: [], future: [] };

const defaultPreview: PreviewState = {
	status: "idle",
	url: null,
	error: null,
	lastUploadedAt: null,
	lastUploadedHash: null,
};

function renderWith(ui: ReactNode, preloadedState?: Partial<TestState>) {
	const fullState: TestState = {
		preview: preloadedState?.preview ?? defaultPreview,
		activeProtocol: preloadedState?.activeProtocol ?? defaultTimeline,
	};
	const store = configureStore({
		reducer: {
			preview: previewReducer,
			activeProtocol: (state: TimelineState | undefined = defaultTimeline) => state,
		},
		preloadedState: fullState,
	});
	return render(<Provider store={store}>{ui}</Provider>);
}

describe("<PreviewIframe />", () => {
	it("shows a skeleton on initial mount with no cached url", () => {
		renderWith(<PreviewIframe />);
		expect(screen.getByTestId("preview-skeleton")).toBeInTheDocument();
	});

	it("renders the iframe once a url is ready", () => {
		renderWith(<PreviewIframe />, {
			preview: {
				status: "ready",
				url: "https://example.test/preview",
				error: null,
				lastUploadedAt: 1,
				lastUploadedHash: "h",
			},
			activeProtocol: { present: { name: "P" }, past: [], future: [] },
		});
		const iframe = screen.getByTitle("Protocol preview");
		expect(iframe).toBeInTheDocument();
		expect(iframe.getAttribute("src")).toBe("https://example.test/preview");
	});

	it("shows an error state with retry button when upload fails", () => {
		renderWith(<PreviewIframe />, {
			preview: { status: "error", url: null, error: "boom", lastUploadedAt: null, lastUploadedHash: null },
			activeProtocol: { present: { name: "P" }, past: [], future: [] },
		});
		expect(screen.getByText(/Preview unavailable/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});
});
