import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import Routes from "../Routes";
import protocolsReducer, { addProtocol } from "~/ducks/modules/protocols";
import activeProtocolReducer from "~/ducks/modules/activeProtocol";
import type { Protocol } from "@codaco/protocol-validation";

// Mock wouter
const mockLocation = vi.fn();
const mockNavigate = vi.fn();

vi.mock("wouter", () => ({
	useLocation: () => ["/", mockNavigate],
	Route: ({ path, component: Component, ...props }: any) => {
		const currentPath = mockLocation();
		// Simple path matching for testing
		if (path === currentPath || (path === "/protocol/:protocolId" && currentPath.startsWith("/protocol/"))) {
			return <Component {...props} />;
		}
		return null;
	},
	Switch: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Mock components to avoid complex rendering
vi.mock("~/components/Home", () => ({
	default: () => <div data-testid="home">Home Component</div>,
}));

vi.mock("~/components/Protocol", () => ({
	default: () => <div data-testid="protocol">Protocol Component</div>,
}));

const mockProtocol: Protocol = {
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

describe("Routes", () => {
	let store: any;

	beforeEach(() => {
		store = createTestStore();
		mockLocation.mockClear();
		mockNavigate.mockClear();
	});

	it("should render Home component on root path", () => {
		mockLocation.mockReturnValue("/");

		render(<Routes />, {
			wrapper: createWrapper(store),
		});

		expect(screen.getByTestId("home")).toBeInTheDocument();
	});

	it("should render Protocol component on protocol path", () => {
		const protocolId = "test-protocol-id";

		// Add protocol to store
		store.dispatch(
			addProtocol({
				id: protocolId,
				protocol: mockProtocol,
				name: mockProtocol.name,
				description: mockProtocol.description,
			}),
		);

		mockLocation.mockReturnValue(`/protocol/${protocolId}`);

		render(<Routes />, {
			wrapper: createWrapper(store),
		});

		expect(screen.getByTestId("protocol")).toBeInTheDocument();
	});

	it("should handle protocol routes with different IDs", () => {
		const protocolId1 = "protocol-1";
		const protocolId2 = "protocol-2";

		// Add protocols to store
		store.dispatch(
			addProtocol({
				id: protocolId1,
				protocol: mockProtocol,
				name: "Protocol 1",
				description: "First protocol",
			}),
		);

		store.dispatch(
			addProtocol({
				id: protocolId2,
				protocol: { ...mockProtocol, name: "Protocol 2" },
				name: "Protocol 2",
				description: "Second protocol",
			}),
		);

		// Test first protocol
		mockLocation.mockReturnValue(`/protocol/${protocolId1}`);

		const { rerender } = render(<Routes />, {
			wrapper: createWrapper(store),
		});

		expect(screen.getByTestId("protocol")).toBeInTheDocument();

		// Test second protocol
		mockLocation.mockReturnValue(`/protocol/${protocolId2}`);

		rerender(<Routes />);

		expect(screen.getByTestId("protocol")).toBeInTheDocument();
	});

	it("should handle invalid protocol routes gracefully", () => {
		mockLocation.mockReturnValue("/protocol/non-existent-id");

		render(<Routes />, {
			wrapper: createWrapper(store),
		});

		// Should still render the Protocol component, which will handle the missing protocol
		expect(screen.getByTestId("protocol")).toBeInTheDocument();
	});

	it("should handle root path with trailing slash", () => {
		mockLocation.mockReturnValue("/");

		render(<Routes />, {
			wrapper: createWrapper(store),
		});

		expect(screen.getByTestId("home")).toBeInTheDocument();
	});

	it("should handle unknown routes", () => {
		mockLocation.mockReturnValue("/unknown-route");

		const { container } = render(<Routes />, {
			wrapper: createWrapper(store),
		});

		// Should not render any specific component for unknown routes
		expect(screen.queryByTestId("home")).not.toBeInTheDocument();
		expect(screen.queryByTestId("protocol")).not.toBeInTheDocument();
	});
});
