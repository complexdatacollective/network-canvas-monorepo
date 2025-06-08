import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ReactNode } from "react";
import Protocol from "../Protocol";
import protocolsReducer, { addProtocol } from "~/ducks/modules/protocols";
import activeProtocolReducer from "~/ducks/modules/activeProtocol";
import type { Protocol as ProtocolType } from "@codaco/protocol-validation";

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
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

describe("Protocol Component", () => {
  let store: any;

  beforeEach(() => {
    store = createTestStore();
    mockUseProtocolLoader.mockClear();
  });

  it("should render protocol components when protocol is loaded", () => {
    const protocolId = "test-protocol-id";
    
    // Add protocol to store
    store.dispatch(addProtocol({
      id: protocolId,
      protocol: mockProtocol,
      name: mockProtocol.name,
      description: mockProtocol.description,
    }));

    // Set as active protocol
    store.dispatch({ type: "activeProtocol/setActiveProtocol", payload: mockProtocol });

    mockUseProtocolLoader.mockReturnValue({
      protocolId,
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
      protocolId: undefined,
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
      protocolId: "test-id",
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
      protocolId: "test-id",
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
      protocolId: undefined,
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
    const protocolId1 = "protocol-1";
    const protocolId2 = "protocol-2";
    
    // Add protocols to store
    store.dispatch(addProtocol({
      id: protocolId1,
      protocol: mockProtocol,
      name: "Protocol 1",
      description: "First protocol",
    }));
    
    store.dispatch(addProtocol({
      id: protocolId2,
      protocol: { ...mockProtocol, name: "Protocol 2" },
      name: "Protocol 2",
      description: "Second protocol",
    }));

    // Start with first protocol
    mockUseProtocolLoader.mockReturnValue({
      protocolId: protocolId1,
      isLoading: false,
      error: undefined,
    });

    const { rerender } = render(<Protocol />, {
      wrapper: createWrapper(store),
    });

    expect(screen.getByTestId("overview")).toBeInTheDocument();

    // Switch to second protocol
    mockUseProtocolLoader.mockReturnValue({
      protocolId: protocolId2,
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