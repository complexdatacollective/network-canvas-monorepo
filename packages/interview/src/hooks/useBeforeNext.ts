'use client';

import { useContext, useEffect, useId, useRef } from 'react';

import { StageMetadataContext } from '../contexts/StageMetadataContext';
import type { BeforeNextFunction } from '../types';

export default function useBeforeNext(handler: BeforeNextFunction) {
  const registerBeforeNext = useContext(StageMetadataContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const key = useId();

  useEffect(() => {
    registerBeforeNext(key, (direction, intent) =>
      handlerRef.current(direction, intent),
    );
    return () => registerBeforeNext(key, null);
  }, [registerBeforeNext, key]);
}
