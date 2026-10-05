'use client';

import { type RefObject, useEffect, useState } from 'react';

export default function usePortalTarget(
  id: string,
  originRef: RefObject<HTMLElement | null>,
) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // A page may contain several interviews with the same stage id. Resolve
    // only through this interface's ancestors so its portal keeps the same
    // DOM language, containing block, and interaction ownership.
    let ancestor = originRef.current?.parentElement ?? null;
    while (ancestor && ancestor.id !== id) {
      ancestor = ancestor.parentElement;
    }
    setTarget(ancestor);
  }, [id, originRef]);
  return target;
}
