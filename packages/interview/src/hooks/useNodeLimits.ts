'use client';

import { useEffect, useRef } from 'react';

import type { LocalizedString } from '@codaco/protocol-validation';

import {
  useResolveLocalizedMessage,
  useResolveLocalizedString,
} from '../localization/ProtocolLocalizationProvider';
import useReadyForNextStage from './useReadyForNextStage';
import useStageValidation from './useStageValidation';

type UseNodeLimitsOptions = {
  stageNodeCount: number;
  minNodes: number;
  maxNodes: number;
  /** The stage's words for a minimum and a maximum, shown only when set. */
  minNodesNotice?: LocalizedString;
  maxNodesNotice?: LocalizedString;
  isLastPrompt: boolean;
};

function useNodeLimits({
  stageNodeCount,
  minNodes,
  maxNodes,
  minNodesNotice,
  maxNodesNotice,
  isLastPrompt,
}: UseNodeLimitsOptions) {
  const resolveMessage = useResolveLocalizedMessage();
  const resolveString = useResolveLocalizedString();

  const maxNodesReached = stageNodeCount >= maxNodes;
  const minNodesMet = !minNodes || !isLastPrompt || stageNodeCount >= minNodes;

  const { updateReady } = useReadyForNextStage();

  // A stage that sets no minimum has no notice to show, and the schema makes
  // the notice required whenever it does set one.
  const minNodesMessage = minNodesNotice
    ? resolveMessage(minNodesNotice, { count: minNodes }).text
    : undefined;

  const { showToast, closeToast } = useStageValidation({
    constraints: [
      {
        direction: 'forwards',
        isMet: minNodesMet,
        toast: {
          description: minNodesMessage,
          variant: 'destructive',
          anchor: 'forward',
          timeout: 4000,
        },
      },
    ],
  });

  // Resolved on every render, so a change of interview language replaces the
  // maximum's notice, which stays up until the participant moves on.
  const maxNodesMessage = maxNodesNotice
    ? resolveString(maxNodesNotice).text
    : undefined;

  const maxToastRef = useRef<string | null>(null);

  useEffect(() => {
    if (!maxNodesReached) {
      if (maxToastRef.current) {
        closeToast(maxToastRef.current);
        maxToastRef.current = null;
      }
      return;
    }

    // Defer toast creation so StrictMode's cleanup (clearTimeout) cancels
    // the pending timer rather than closing an already-rendered toast.
    const timeout = setTimeout(() => {
      maxToastRef.current = showToast({
        description: maxNodesMessage,
        variant: 'success',
        anchor: 'forward',
        timeout: 0,
      });
    }, 0);

    return () => {
      clearTimeout(timeout);
      if (maxToastRef.current) {
        closeToast(maxToastRef.current);
        maxToastRef.current = null;
      }
    };
  }, [maxNodesReached, maxNodesMessage, showToast, closeToast]);

  useEffect(() => {
    updateReady(minNodesMet || maxNodesReached);
  }, [minNodesMet, maxNodesReached, updateReady]);

  return { maxNodesReached, minNodesMet };
}

export default useNodeLimits;
