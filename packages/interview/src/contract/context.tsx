'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';

import type {
  AssetRequestHandler,
  FinishHandler,
  InterviewerFlags,
} from './types';

type ContractHandlers = {
  onFinish: FinishHandler;
  onRequestAsset: AssetRequestHandler;
};

type ContractValue = {
  handlers: ContractHandlers;
  flags: Required<InterviewerFlags>;
  finishConfirmationDescription: ReactNode;
  caseId: string | undefined;
};

const ContractContext = createContext<ContractValue | null>(null);

type ContractProviderProps = {
  onFinish: FinishHandler;
  onRequestAsset: AssetRequestHandler;
  flags?: InterviewerFlags;
  finishConfirmationDescription?: ReactNode;
  /** The host's case identifier for the interview (`SessionPayload.caseId`). */
  caseId?: string;
  children: ReactNode;
};

export function ContractProvider({
  onFinish,
  onRequestAsset,
  flags,
  finishConfirmationDescription,
  caseId,
  children,
}: ContractProviderProps) {
  // Anchor the latest handler refs so the returned callbacks are stable.
  // Without this, hosts that pass inline arrow functions would cause every
  // useAssetUrl consumer to refetch on every render.
  const onFinishRef = useRef(onFinish);
  const onRequestAssetRef = useRef(onRequestAsset);
  onFinishRef.current = onFinish;
  onRequestAssetRef.current = onRequestAsset;

  const stableOnFinish = useCallback<FinishHandler>(
    (...args) => onFinishRef.current(...args),
    [],
  );
  const stableOnRequestAsset = useCallback<AssetRequestHandler>(
    (...args) => onRequestAssetRef.current(...args),
    [],
  );

  const value = useMemo<ContractValue>(
    () => ({
      handlers: {
        onFinish: stableOnFinish,
        onRequestAsset: stableOnRequestAsset,
      },
      flags: {
        isE2E: flags?.isE2E ?? false,
        isDevelopment: flags?.isDevelopment ?? false,
      },
      finishConfirmationDescription,
      caseId,
    }),
    [
      stableOnFinish,
      stableOnRequestAsset,
      flags?.isE2E,
      flags?.isDevelopment,
      finishConfirmationDescription,
      caseId,
    ],
  );

  return (
    <ContractContext.Provider value={value}>
      {children}
    </ContractContext.Provider>
  );
}

function useContract(): ContractValue {
  const value = useContext(ContractContext);
  if (!value) {
    throw new Error(
      'Interview contract hooks must be used within a ContractProvider',
    );
  }
  return value;
}

export function useContractHandlers(): ContractHandlers {
  return useContract().handlers;
}

export function useContractFlags(): Required<InterviewerFlags> {
  return useContract().flags;
}

export function useFinishConfirmationDescription(): ReactNode {
  return useContract().finishConfirmationDescription;
}

/**
 * The host's case identifier for the interview, when it supplied one. Read
 * where no contract is provided (a component shown on its own), it is absent.
 */
export function useHostCaseId(): string | undefined {
  return useContext(ContractContext)?.caseId;
}
