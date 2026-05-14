import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectNav from "../ProjectNav/ProjectNav";

// Mock wouter's useLocation but keep the real Link so anchors render with proper hrefs
const mockNavigate = vi.fn();
const mockLocation = vi.fn(() => "/protocol");

vi.mock("wouter", async () => {
	const actual = await vi.importActual<typeof import("wouter")>("wouter");
	return {
		...actual,
		useLocation: () => [mockLocation(), mockNavigate],
	};
});

// Capture dispatched dialog action so we can assert the warning dialog was opened
const openDialogMock = vi.fn((config: unknown) => ({ type: "dialogs/openDialog", payload: config }));

vi.mock("~/ducks/modules/dialogs", () => ({
	actionCreators: {
		openDialog: (config: unknown) => openDialogMock(config),
	},
}));

const undoMock = vi.fn(() => ({ type: "activeProtocol/undo" }));
const redoMock = vi.fn(() => ({ type: "activeProtocol/redo" }));
const clearActiveProtocolMock = vi.fn(() => ({ type: "activeProtocol/clearActiveProtocol" }));

vi.mock("~/ducks/modules/activeProtocol", () => ({
	undo: () => undoMock(),
	redo: () => redoMock(),
	clearActiveProtocol: () => clearActiveProtocolMock(),
	updateProtocolName: vi.fn((args: unknown) => ({ type: "activeProtocol/updateProtocolName", payload: args })),
	updateProtocolDescription: vi.fn((args: unknown) => ({
		type: "activeProtocol/updateProtocolDescription",
		payload: args,
	})),
}));

// Mock exportNetcanvas thunk so we can drive download flow state
const exportUnwrap = vi.fn();
const exportNetcanvasMock = vi.fn(() => ({
	type: "webUserActions/exportNetcanvas",
	unwrap: exportUnwrap,
}));

vi.mock("~/ducks/modules/userActions/userActions", () => ({
	exportNetcanvas: () => exportNetcanvasMock(),
}));

const createTestStore = ({ canUndo = true, canRedo = true } = {}) =>
	configureStore({
		reducer: {
			activeProtocol: (
				state = {
					past: canUndo ? [{}] : [],
					present: { name: "Test" },
					future: canRedo ? [{}] : [],
				},
			) => state,
		},
	});

type TestStore = ReturnType<typeof createTestStore>;

const wrap = (store: TestStore) => {
	return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
};

describe("<ProjectNav />", () => {
	beforeEach(() => {
		mockNavigate.mockClear();
		mockLocation.mockReturnValue("/protocol");
		openDialogMock.mockClear();
		undoMock.mockClear();
		redoMock.mockClear();
		clearActiveProtocolMock.mockClear();
		exportNetcanvasMock.mockClear();
		exportUnwrap.mockReset();
	});

	it("dispatches undo when the Undo button is clicked", () => {
		const store = createTestStore();
		render(<ProjectNav />, { wrapper: wrap(store) });

		fireEvent.click(screen.getByRole("button", { name: /undo/i }));
		expect(undoMock).toHaveBeenCalledTimes(1);
	});

	it("dispatches redo when the Redo button is clicked", () => {
		const store = createTestStore();
		render(<ProjectNav />, { wrapper: wrap(store) });

		fireEvent.click(screen.getByRole("button", { name: /redo/i }));
		expect(redoMock).toHaveBeenCalledTimes(1);
	});

	it("disables undo/redo when nothing is available", () => {
		const store = createTestStore({ canUndo: false, canRedo: false });
		render(<ProjectNav />, { wrapper: wrap(store) });

		expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled();
	});

	it("transitions Download → Downloading... → Downloaded during export flow", async () => {
		const store = createTestStore();
		// Resolve the export thunk so we can observe the success state
		exportUnwrap.mockResolvedValueOnce(undefined);

		render(<ProjectNav />, { wrapper: wrap(store) });

		const downloadButton = screen.getByRole("button", { name: /^download$/i });
		expect(downloadButton).toHaveTextContent(/download/i);

		fireEvent.click(downloadButton);

		// On success the button shows "Downloaded"
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /downloaded/i })).toBeInTheDocument();
		});
		expect(exportNetcanvasMock).toHaveBeenCalled();
	});

	it("opens the warning dialog when the brand is clicked", () => {
		const store = createTestStore();
		render(<ProjectNav />, { wrapper: wrap(store) });

		fireEvent.click(screen.getByRole("button", { name: /return to start screen/i }));
		expect(openDialogMock).toHaveBeenCalledTimes(1);
		const config = openDialogMock.mock.calls[0]?.[0] as { type: string; title: string };
		expect(config.type).toBe("Warning");
		expect(config.title).toMatch(/clear editor/i);
	});

	it("marks the active tab based on current location", () => {
		mockLocation.mockReturnValue("/protocol/codebook");
		const store = createTestStore();
		render(<ProjectNav />, { wrapper: wrap(store) });

		const codebookTab = screen.getByRole("link", { name: /codebook/i });
		expect(codebookTab).toHaveAttribute("aria-current", "page");

		const stagesTab = screen.getByRole("link", { name: /stages/i });
		expect(stagesTab).not.toHaveAttribute("aria-current");
	});

	it("renders tabs as anchors pointing at their routes", () => {
		const store = createTestStore();
		render(<ProjectNav />, { wrapper: wrap(store) });

		expect(screen.getByRole("link", { name: /resources/i })).toHaveAttribute("href", "/protocol/assets");
	});
});
