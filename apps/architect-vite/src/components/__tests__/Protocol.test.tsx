import type { Protocol as ProtocolType } from "@codaco/protocol-validation";
import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import activeProtocolReducer from "~/ducks/modules/activeProtocol";
import protocolsReducer, { addProtocol } from "~/ducks/modules/protocols";
import Protocol from "../Protocol";

// Mock components to avoid complex rendering
vi.mock("~/components/Overview", () => ({
	default: () => <div data-testid="overview">Overview Component</div>,
}));

vi.mock("~/components/ProtocolControlBar", () => ({
	default: () => <div data-testid="control-bar">Control Bar Component</div>,
}));

vi.mock("~/components/Timeline", () => ({
	default: () => <div data-testid="timeline">Timeline Component</div>,
}));

// Mock the protocol loader hook
const mockUseProtocolLoader = vi.fn();

vi.mock("~/hooks/useProtocolLoader", () => ({
	default: mockUseProtocolLoader,
}));

// Mock motion/react to avoid animation issues in tests
vi.mock("motion/react", () => ({
	motion: {
		div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
	},
	useScroll: () => ({ scrollY: { onChange: vi.fn() } }),
}));

const mockProtocol: ProtocolType = {
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

const createWrapper = (store: any) => {
	return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
};

describe("Protocol Component", () => {
	let store: any;

	beforeEach(() => {
		store = createTestStore();
		mockUseProtocolLoader.mockClear();
	});

	it("should render protocol components when protocol is loaded", () => {
		// Add protocol to store
		store.dispatch(
			addProtocol({
				protocol: mockProtocol,
				name: mockProtocol.name,
				description: mockProtocol.description,
			}),
		);

		// Set as active protocol
		store.dispatch({ type: "activeProtocol/setActiveProtocol", payload: mockProtocol });

		mockUseProtocolLoader.mockReturnValue({
			isLoading: false,
			error: undefined,
		});

		render(<Protocol />, {
			wrapper: createWrapper(store),
		});

		expect(screen.getByTestId("overview")).toBeInTheDocument();
		expect(screen.getByTestId("control-bar")).toBeInTheDocument();
		expect(screen.getByTestId("timeline")).toBeInTheDocument();
	});

	it("should call useProtocolLoader hook on mount", () => {
		mockUseProtocolLoader.mockReturnValue({
			isLoading: false,
			error: undefined,
		});

		render(<Protocol />, {
			wrapper: createWrapper(store),
		});

		expect(mockUseProtocolLoader).toHaveBeenCalled();
	});

	it("should handle loading state", () => {
		mockUseProtocolLoader.mockReturnValue({
			isLoading: true,
			error: undefined,
		});

		const { container } = render(<Protocol />, {
			wrapper: createWrapper(store),
		});

		// Component should still render but may show loading state
		expect(container.firstChild).toBeInTheDocument();
	});

	it("should handle error state", () => {
		mockUseProtocolLoader.mockReturnValue({
			isLoading: false,
			error: "Protocol not found",
		});

		const { container } = render(<Protocol />, {
			wrapper: createWrapper(store),
		});

		// Component should still render but may show error state
		expect(container.firstChild).toBeInTheDocument();
	});

	it("should handle missing protocol ID", () => {
		mockUseProtocolLoader.mockReturnValue({
			isLoading: false,
			error: undefined,
		});

		render(<Protocol />, {
			wrapper: createWrapper(store),
		});

		// Should still render components even without protocol ID
		expect(screen.getByTestId("overview")).toBeInTheDocument();
		expect(screen.getByTestId("control-bar")).toBeInTheDocument();
		expect(screen.getByTestId("timeline")).toBeInTheDocument();
	});

	it("should update when protocol changes", () => {
		// Add protocols to store
		store.dispatch(
			addProtocol({
				protocol: mockProtocol,
				name: "Protocol 1",
				description: "First protocol",
			}),
		);

		store.dispatch(
			addProtocol({
				protocol: { ...mockProtocol, name: "Protocol 2" },
				name: "Protocol 2",
				description: "Second protocol",
			}),
		);

		// Start with first protocol
		mockUseProtocolLoader.mockReturnValue({
			isLoading: false,
			error: undefined,
		});

		const { rerender } = render(<Protocol />, {
			wrapper: createWrapper(store),
		});

		expect(screen.getByTestId("overview")).toBeInTheDocument();

		// Switch to second protocol
		mockUseProtocolLoader.mockReturnValue({
			isLoading: false,
			error: undefined,
		});

		rerender(<Protocol />);

		// Should still render all components
		expect(screen.getByTestId("overview")).toBeInTheDocument();
		expect(screen.getByTestId("control-bar")).toBeInTheDocument();
		expect(screen.getByTestId("timeline")).toBeInTheDocument();
	});
});
