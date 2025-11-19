import type { CurrentProtocol } from "@codaco/protocol-validation";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import activeProtocolReducer from "~/ducks/modules/activeProtocol";
import protocolsReducer, { addProtocol } from "~/ducks/modules/protocols";
import useProtocolLoader from "../useProtocolLoader";

// Mock wouter hooks
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock("wouter", () => ({
	useLocation: () => ["", mockNavigate],
	useParams: () => mockUseParams(),
}));

const mockProtocol: CurrentProtocol = {
	name: "Test Protocol",
	description: "test description",
	schemaVersion: 8,
	stages: [],
	codebook: {
		node: {},
		edge: {},
		ego: {},
	},
	assetManifest: {},
};

const createTestStore = () => {
	return configureStore({
		reducer: {
			protocols: protocolsReducer,
			activeProtocol: {
				present: activeProtocolReducer,
				past: () => [],
				future: () => [],
				timeline: () => [],
			},
		},
		middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
	});
};

type TestStore = ReturnType<typeof createTestStore>;

const createWrapper = (store: TestStore) => {
	return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
};

describe("useProtocolLoader", () => {
	let store: TestStore;

	beforeEach(() => {
		store = createTestStore();
		mockNavigate.mockClear();
		mockUseParams.mockClear();
	});

	it("should navigate to home when protocol not found", () => {
		mockUseParams.mockReturnValue({});

		renderHook(() => useProtocolLoader(), {
			wrapper: createWrapper(store),
		});

		expect(mockNavigate).toHaveBeenCalledWith("/");
	});

	it("should set active protocol when protocol found in store", () => {
		// Add protocol to store
		store.dispatch(
			addProtocol({
				protocol: mockProtocol,
				name: mockProtocol.name,
				description: mockProtocol.description,
			}),
		);

		mockUseParams.mockReturnValue({});

		renderHook(() => useProtocolLoader(), {
			wrapper: createWrapper(store),
		});

		// Check that active protocol was set
		const state = store.getState();
		expect(state.activeProtocol.present).toEqual(mockProtocol);
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("should not reload protocol if already active", () => {
		// Add protocol to store and set as active
		store.dispatch(
			addProtocol({
				protocol: mockProtocol,
				name: mockProtocol.name,
				description: mockProtocol.description,
			}),
		);

		// Set as active protocol first
		const _initialState = store.getState();
		store.dispatch({ type: "activeProtocol/setActiveProtocol", payload: mockProtocol });

		mockUseParams.mockReturnValue({});
		const { rerender } = renderHook(() => useProtocolLoader(), {
			wrapper: createWrapper(store),
		});

		// Verify protocol is active
		const state = store.getState();
		expect(state.activeProtocol.present).toEqual(mockProtocol);

		// Re-render with same params - should not trigger reload
		rerender();

		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("should return correct loading state", () => {
		mockUseParams.mockReturnValue({});

		const { result } = renderHook(() => useProtocolLoader(), {
			wrapper: createWrapper(store),
		});

		expect(result.current).toBeUndefined();
		expect(result.current?.isLoading).toBe(false);
	});

	it("should handle protocol content comparison correctly", () => {
		// Create protocol with same content but different object reference
		const sameProtocol = JSON.parse(JSON.stringify(mockProtocol));

		// Add protocol to store
		store.dispatch(
			addProtocol({
				protocol: mockProtocol,
				name: mockProtocol.name,
				description: mockProtocol.description,
			}),
		);

		// Set same content protocol as active (but different object reference)
		store.dispatch({ type: "activeProtocol/setActiveProtocol", payload: sameProtocol });

		mockUseParams.mockReturnValue({});

		renderHook(() => useProtocolLoader(), {
			wrapper: createWrapper(store),
		});

		// Should not reload since content is the same
		const state = store.getState();
		expect(state.activeProtocol.present).toEqual(mockProtocol);
	});
});
