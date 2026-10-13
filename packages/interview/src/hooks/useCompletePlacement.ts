'use client';

import { useEffect } from 'react';

import type { LocalizedString } from '@codaco/protocol-validation';

import { useResolveLocalizedString } from '../localization/ProtocolLocalizationProvider';
import useReadyForNextStage from './useReadyForNextStage';
import useStageValidation from './useStageValidation';

type UseCompletePlacementOptions = {
  /** How many of the prompt's nodes are still waiting to be placed. */
  unplacedCount: number;
  /** The stage's `behaviours.requireCompletePlacement`. */
  required: boolean | undefined;
  /** The stage's words for the gate, which the schema requires while it is on. */
  notice: LocalizedString | undefined;
};

/**
 * What both bin interfaces do about nodes left in the drawer: pulse Next once
 * every node is placed, and, when the stage asks for complete placement, keep
 * the participant on the prompt until it is.
 */
function useCompletePlacement({
  unplacedCount,
  required,
  notice,
}: UseCompletePlacementOptions) {
  const resolveString = useResolveLocalizedString();
  const { updateReady } = useReadyForNextStage();

  const allPlaced = unplacedCount === 0;

  useEffect(() => {
    updateReady(allPlaced);
  }, [allPlaced, updateReady]);

  useStageValidation({
    constraints: [
      {
        direction: 'forwards',
        isMet: required !== true || allPlaced,
        kind: 'unplaced_nodes',
        toast: {
          description: notice ? resolveString(notice).text : undefined,
          variant: 'destructive',
          anchor: 'forward',
          timeout: 4000,
        },
      },
    ],
  });
}

export default useCompletePlacement;
