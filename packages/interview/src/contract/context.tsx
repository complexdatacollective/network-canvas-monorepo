"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from "react";
import type { AssetRequestHandler, ErrorHandler, FinishHandler, InterviewerFlags } from "./types";

type ContractHandlers = {
	onFinish: FinishHandler;
	onRequestAsset: AssetRequestHandler;
	onError: ErrorHandler;
};

type ContractValue = {
	handlers: ContractHandlers;
	flags: Required<InterviewerFlags>;
};

const ContractContext = createContext<ContractValue | null>(null);

const noopErrorHandler: ErrorHandler = () => {};

type ContractProviderProps = {
	onFinish: FinishHandler;
	onRequestAsset: AssetRequestHandler;
	onError?: ErrorHandler;
	flags?: InterviewerFlags;
	children: ReactNode;
};

export function ContractProvider({ onFinish, onRequestAsset, onError, flags, children }: ContractProviderProps) {
	// Anchor the latest handler refs so the returned callbacks are stable.
	// Without this, hosts that pass inline arrow functions would cause every
	// useAssetUrl consumer to refetch on every render.
	const onFinishRef = useRef(onFinish);
	const onRequestAssetRef = useRef(onRequestAsset);
	const onErrorRef = useRef<ErrorHandler>(onError ?? noopErrorHandler);
	onFinishRef.current = onFinish;
	onRequestAssetRef.current = onRequestAsset;
	onErrorRef.current = onError ?? noopErrorHandler;

	const stableOnFinish = useCallback<FinishHandler>((...args) => onFinishRef.current(...args), []);
	const stableOnRequestAsset = useCallback<AssetRequestHandler>((...args) => onRequestAssetRef.current(...args), []);
	const stableOnError = useCallback<ErrorHandler>((...args) => onErrorRef.current(...args), []);

	const value = useMemo<ContractValue>(
		() => ({
			handlers: {
				onFinish: stableOnFinish,
				onRequestAsset: stableOnRequestAsset,
				onError: stableOnError,
			},
			flags: {
				isE2E: flags?.isE2E ?? false,
				isDevelopment: flags?.isDevelopment ?? false,
			},
		}),
		[stableOnFinish, stableOnRequestAsset, stableOnError, flags?.isE2E, flags?.isDevelopment],
	);

	return <ContractContext.Provider value={value}>{children}</ContractContext.Provider>;
}

function useContract(): ContractValue {
	const value = useContext(ContractContext);
	if (!value) {
		throw new Error("useContractHandlers / useContractFlags must be used within a ContractProvider");
	}
	return value;
}

export function useContractHandlers(): ContractHandlers {
	return useContract().handlers;
}

export function useContractFlags(): Required<InterviewerFlags> {
	return useContract().flags;
}
