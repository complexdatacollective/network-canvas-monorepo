import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ReactNode } from "react";
import useProtocolLoader from "../useProtocolLoader";
import protocolsReducer, { addProtocol } from "~/ducks/modules/protocols";
import activeProtocolReducer from "~/ducks/modules/activeProtocol";
import type { Protocol } from "@codaco/protocol-validation";

// Mock wouter hooks
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["", mockNavigate],
  useParams: () => mockUseParams(),
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
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

describe("useProtocolLoader", () => {
  let store: any;

  beforeEach(() => {
    store = createTestStore();
    mockNavigate.mockClear();
    mockUseParams.mockClear();
  });

  it("should do nothing when no protocolId in params", () => {
    mockUseParams.mockReturnValue({});

    const { result } = renderHook(() => useProtocolLoader(), {
      wrapper: createWrapper(store),
    });

    expect(result.current.protocolId).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should navigate to home when protocol not found", () => {
    const nonExistentId = "non-existent-id";
    mockUseParams.mockReturnValue({ protocolId: nonExistentId });

    renderHook(() => useProtocolLoader(), {
      wrapper: createWrapper(store),
    });

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("should set active protocol when protocol found in store", () => {
    const protocolId = "test-protocol-id";
    
    // Add protocol to store
    store.dispatch(addProtocol({
      id: protocolId,
      protocol: mockProtocol,
      name: mockProtocol.name,
      description: mockProtocol.description,
    }));

    mockUseParams.mockReturnValue({ protocolId });

    renderHook(() => useProtocolLoader(), {
      wrapper: createWrapper(store),
    });

    // Check that active protocol was set
    const state = store.getState();
    expect(state.activeProtocol.present).toEqual(mockProtocol);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should not reload protocol if already active", () => {
    const protocolId = "test-protocol-id";
    
    // Add protocol to store and set as active
    store.dispatch(addProtocol({
      id: protocolId,
      protocol: mockProtocol,
      name: mockProtocol.name,
      description: mockProtocol.description,
    }));

    // Set as active protocol first
    const initialState = store.getState();
    store.dispatch({ type: "activeProtocol/setActiveProtocol", payload: mockProtocol });

    mockUseParams.mockReturnValue({ protocolId });

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

  it("should load different protocol when protocolId changes", () => {
    const protocol1Id = "protocol-1";
    const protocol2Id = "protocol-2";
    
    const protocol2 = { ...mockProtocol, name: "Protocol 2" };
    
    // Add both protocols to store
    store.dispatch(addProtocol({
      id: protocol1Id,
      protocol: mockProtocol,
      name: mockProtocol.name,
      description: mockProtocol.description,
    }));
    
    store.dispatch(addProtocol({
      id: protocol2Id,
      protocol: protocol2,
      name: protocol2.name,
      description: protocol2.description,
    }));

    // Start with protocol1
    mockUseParams.mockReturnValue({ protocolId: protocol1Id });
    
    const { rerender } = renderHook(() => useProtocolLoader(), {
      wrapper: createWrapper(store),
    });

    // Verify protocol1 is active
    let state = store.getState();
    expect(state.activeProtocol.present.name).toBe("Test Protocol");

    // Switch to protocol2
    mockUseParams.mockReturnValue({ protocolId: protocol2Id });
    rerender();

    // Verify protocol2 is now active
    state = store.getState();
    expect(state.activeProtocol.present.name).toBe("Protocol 2");
  });

  it("should return correct loading state", () => {
    const protocolId = "test-protocol-id";
    mockUseParams.mockReturnValue({ protocolId });

    const { result } = renderHook(() => useProtocolLoader(), {
      wrapper: createWrapper(store),
    });

    expect(result.current.protocolId).toBe(protocolId);
    expect(result.current.isLoading).toBe(false);
  });

  it("should handle protocol content comparison correctly", () => {
    const protocolId = "test-protocol-id";
    
    // Create protocol with same content but different object reference
    const sameProtocol = JSON.parse(JSON.stringify(mockProtocol));
    
    // Add protocol to store
    store.dispatch(addProtocol({
      id: protocolId,
      protocol: mockProtocol,
      name: mockProtocol.name,
      description: mockProtocol.description,
    }));

    // Set same content protocol as active (but different object reference)
    store.dispatch({ type: "activeProtocol/setActiveProtocol", payload: sameProtocol });

    mockUseParams.mockReturnValue({ protocolId });

    renderHook(() => useProtocolLoader(), {
      wrapper: createWrapper(store),
    });

    // Should not reload since content is the same
    const state = store.getState();
    expect(state.activeProtocol.present).toEqual(mockProtocol);
  });
});