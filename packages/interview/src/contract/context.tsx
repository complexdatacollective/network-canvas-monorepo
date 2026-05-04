"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from "react";
import type {
	AssetRequestHandler,
	ErrorHandler,
	FinishHandler,
	InterviewerFlags,
	StepChangeHandler,
} from "./types";

type ContractHandlers = {
	onFinish: FinishHandler;
	onRequestAsset: AssetRequestHandler;
	onError: ErrorHandler;
};

type StepControl = {
	currentStep: number | undefined;
	onStepChange: StepChangeHandler | undefined;
};

type ContractValue = {
	handlers: ContractHandlers;
	flags: Required<InterviewerFlags>;
	stepControl: StepControl;
};

const ContractContext = createContext<ContractValue | null>(null);

const noopErrorHandler: ErrorHandler = () => {};

type ContractProviderProps = {
	onFinish: FinishHandler;
	onRequestAsset: AssetRequestHandler;
	onError?: ErrorHandler;
	currentStep?: number;
	onStepChange?: StepChangeHandler;
	flags?: InterviewerFlags;
	children: ReactNode;
};

export function ContractProvider({
	onFinish,
	onRequestAsset,
	onError,
	currentStep,
	onStepChange,
	flags,
	children,
}: ContractProviderProps) {
	// Anchor the latest handler refs so the returned callbacks are stable.
	// Without this, hosts that pass inline arrow functions would cause every
	// useAssetUrl consumer to refetch on every render.
	const onFinishRef = useRef(onFinish);
	const onRequestAssetRef = useRef(onRequestAsset);
	const onErrorRef = useRef<ErrorHandler>(onError ?? noopErrorHandler);
	const onStepChangeRef = useRef<StepChangeHandler | undefined>(onStepChange);
	onFinishRef.current = onFinish;
	onRequestAssetRef.current = onRequestAsset;
	onErrorRef.current = onError ?? noopErrorHandler;
	onStepChangeRef.current = onStepChange;

	const stableOnFinish = useCallback<FinishHandler>((...args) => onFinishRef.current(...args), []);
	const stableOnRequestAsset = useCallback<AssetRequestHandler>((...args) => onRequestAssetRef.current(...args), []);
	const stableOnError = useCallback<ErrorHandler>((...args) => onErrorRef.current(...args), []);
	// Stable wrapper that forwards to the latest onStepChange. Returns undefined
	// when the host hasn't provided a callback (uncontrolled mode), so consumers
	// can detect controlled vs uncontrolled via currentStep alone.
	const stableOnStepChange = useCallback<StepChangeHandler>((step) => {
		onStepChangeRef.current?.(step);
	}, []);

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
			stepControl: {
				currentStep,
				onStepChange: onStepChange ? stableOnStepChange : undefined,
			},
		}),
		[
			stableOnFinish,
			stableOnRequestAsset,
			stableOnError,
			stableOnStepChange,
			currentStep,
			onStepChange,
			flags?.isE2E,
			flags?.isDevelopment,
		],
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

export function useStepControl(): StepControl {
	return useContract().stepControl;
}
