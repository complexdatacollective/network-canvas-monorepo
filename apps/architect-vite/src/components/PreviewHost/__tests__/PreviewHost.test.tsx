import type { InterviewPayload } from "@codaco/interview";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { shellMock } = vi.hoisted(() => ({ shellMock: vi.fn() }));
vi.mock("@codaco/interview", async () => {
	const actual = await vi.importActual<typeof import("@codaco/interview")>("@codaco/interview");
	return {
		...actual,
		Shell: (props: Record<string, unknown>) => {
			shellMock(props);
			return <div data-testid="shell-mounted" />;
		},
	};
});

vi.mock("~/utils/assetDB", () => ({
	assetDb: { assets: { get: vi.fn() } },
}));

import { PreviewHost } from "../PreviewHost";

function makeProtocol() {
	return {
		name: "T",
		description: "",
		schemaVersion: 8,
		stages: [{ id: "s1", type: "Information", label: "A" }],
		codebook: { node: {}, edge: {}, ego: {} },
		assetManifest: {},
	};
}

function postPayload(source: unknown, data: unknown, origin = window.location.origin) {
	act(() => {
		window.dispatchEvent(new MessageEvent("message", { data, source: source as MessageEventSource, origin }));
	});
}

describe("PreviewHost", () => {
	let originalOpener: Window | null;
	let openerStub: { postMessage: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		originalOpener = window.opener;
		openerStub = { postMessage: vi.fn() };
		Object.defineProperty(window, "opener", { value: openerStub, configurable: true });
		shellMock.mockReset();
	});

	afterEach(() => {
		Object.defineProperty(window, "opener", { value: originalOpener, configurable: true });
	});

	it("posts preview:ready to the opener on mount", () => {
		render(<PreviewHost />);
		expect(openerStub.postMessage).toHaveBeenCalledWith({ type: "preview:ready" }, window.location.origin);
	});

	it("mounts Shell with the payload after receiving preview:payload", () => {
		render(<PreviewHost />);
		const protocol = makeProtocol();
		postPayload(openerStub, { type: "preview:payload", protocol, startStage: 0, useSyntheticData: false });

		expect(screen.getByTestId("shell-mounted")).toBeInTheDocument();
		const call = shellMock.mock.calls.at(-1)?.[0] as {
			payload: InterviewPayload;
			currentStep: number;
			onStepChange: (step: number) => void;
		};
		expect(call.payload.protocol.name).toBe("T");
		expect(call.payload.session.network.nodes).toEqual([]);
		// Shell goes read-only if currentStep is provided without onStepChange — both must be wired.
		expect(call.currentStep).toBe(0);
		expect(typeof call.onStepChange).toBe("function");
	});

	it("initialises currentStep from payload.startStage", () => {
		render(<PreviewHost />);
		const protocol = makeProtocol();
		postPayload(openerStub, { type: "preview:payload", protocol, startStage: 3, useSyntheticData: false });

		const call = shellMock.mock.calls.at(-1)?.[0] as { currentStep: number };
		expect(call.currentStep).toBe(3);
	});

	it("seeds a synthetic network when useSyntheticData is true", () => {
		render(<PreviewHost />);
		const protocol = makeProtocol();
		postPayload(openerStub, { type: "preview:payload", protocol, startStage: 0, useSyntheticData: true });

		const call = shellMock.mock.calls.at(-1)?.[0] as { payload: InterviewPayload; currentStep: number };
		expect(call.currentStep).toBe(0);
	});

	it("ignores payload messages from a non-opener source", () => {
		render(<PreviewHost />);
		const protocol = makeProtocol();
		postPayload({}, { type: "preview:payload", protocol, startStage: 0, useSyntheticData: false });
		expect(shellMock).not.toHaveBeenCalled();
	});

	it("ignores payload messages from a different origin", () => {
		render(<PreviewHost />);
		const protocol = makeProtocol();
		postPayload(
			openerStub,
			{ type: "preview:payload", protocol, startStage: 0, useSyntheticData: false },
			"https://attacker.example",
		);
		expect(shellMock).not.toHaveBeenCalled();
	});

	it("renders the preview-ended fallback when window.opener is null", () => {
		Object.defineProperty(window, "opener", { value: null, configurable: true });
		render(<PreviewHost />);
		expect(screen.getByText(/preview has ended/i)).toBeInTheDocument();
	});

	it("shows a timeout fallback if the payload never arrives", () => {
		vi.useFakeTimers();
		try {
			render(<PreviewHost />);
			expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
			act(() => {
				vi.advanceTimersByTime(5_000);
			});
			expect(screen.getByText(/couldn't reach the architect tab/i)).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	});

	it("re-posts preview:ready when the user clicks Try again", () => {
		vi.useFakeTimers();
		try {
			render(<PreviewHost />);
			act(() => {
				vi.advanceTimersByTime(5_000);
			});
			openerStub.postMessage.mockClear();

			fireEvent.click(screen.getByRole("button", { name: /try again/i }));

			expect(openerStub.postMessage).toHaveBeenCalledWith({ type: "preview:ready" }, window.location.origin);
		} finally {
			vi.useRealTimers();
		}
	});
});
