import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import protocolsReducer, { addProtocol } from "~/ducks/modules/protocols";
import type { ProtocolWithMetadata } from "~/types";
import Routes from "../Routes";

// Mock wouter
const mockLocation = vi.fn();
const mockNavigate = vi.fn();

type RouteProps = {
	path: string;
	component: React.ComponentType<Record<string, unknown>>;
} & Record<string, unknown>;

vi.mock("wouter", () => ({
	useLocation: () => ["/", mockNavigate],
	Route: ({ path, component: Component, ...props }: RouteProps) => {
		const currentPath = mockLocation();
		// Simple path matching for testing
		if (path === currentPath || (path === "/protocol" && currentPath.startsWith("/protocol/"))) {
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

const mockProtocolName = "Test Protocol";
const mockProtocolDescription = "test description";

const mockProtocol: ProtocolWithMetadata = {
	name: mockProtocolName,
	description: mockProtocolDescription,
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
			activeProtocol: (state = { present: null, past: [], future: [] }) => state,
		},
		middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
	});
};

type TestStore = ReturnType<typeof createTestStore>;

const createWrapper = (store: TestStore) => {
	return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
};

describe("Routes", () => {
	let store: TestStore;

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
		// Add protocol to store
		store.dispatch(
			addProtocol({
				protocol: mockProtocol,
				name: mockProtocolName,
				description: mockProtocolDescription,
			}),
		);

		mockLocation.mockReturnValue("/protocol");

		render(<Routes />, {
			wrapper: createWrapper(store),
		});

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

		render(<Routes />, {
			wrapper: createWrapper(store),
		});

		// Should not render any specific component for unknown routes
		expect(screen.queryByTestId("home")).not.toBeInTheDocument();
		expect(screen.queryByTestId("protocol")).not.toBeInTheDocument();
	});
});
