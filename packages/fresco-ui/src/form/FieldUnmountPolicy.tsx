'use client';

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
} from 'react';

type FieldUnmountPolicyProviderProps = {
  discardOnUnmountRef: RefObject<boolean>;
  children?: ReactNode;
};

type ShouldDiscardOnUnmount = () => boolean;

const FieldUnmountPolicyContext = createContext<ShouldDiscardOnUnmount | null>(
  null,
);

/**
 * Marks descendant field unmounts as destructive when this or any enclosing
 * policy requests it. The callback reads refs at cleanup time, so a Section
 * can distinguish collapsing from an ordinary parent unmount.
 */
export function FieldUnmountPolicyProvider({
  discardOnUnmountRef,
  children,
}: FieldUnmountPolicyProviderProps) {
  const parentShouldDiscard = useContext(FieldUnmountPolicyContext);
  const shouldDiscard = useCallback(
    () => discardOnUnmountRef.current || (parentShouldDiscard?.() ?? false),
    [discardOnUnmountRef, parentShouldDiscard],
  );

  return (
    <FieldUnmountPolicyContext value={shouldDiscard}>
      {children}
    </FieldUnmountPolicyContext>
  );
}

export const useShouldDiscardFieldOnUnmount = () =>
  useContext(FieldUnmountPolicyContext);
