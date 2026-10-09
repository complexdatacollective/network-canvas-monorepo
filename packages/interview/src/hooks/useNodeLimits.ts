'use client';

import { createElement, useEffect, useRef } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import type { LocalizedString } from '@codaco/protocol-validation';

import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
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
  /**
   * Whether the people this stage adds carry encrypted answers. Under an
   * encryption header no passphrase can open, none of them can be added, so
   * the stage says why, and its minimum no longer holds the participant back.
   */
  writesEncrypted: boolean;
};

function useNodeLimits({
  stageNodeCount,
  minNodes,
  maxNodes,
  minNodesNotice,
  maxNodesNotice,
  isLastPrompt,
  writesEncrypted,
}: UseNodeLimitsOptions) {
  const { encryptionUnavailable, lockedNotice } = usePassphrase();
  const resolveMessage = useResolveLocalizedMessage();
  const resolveString = useResolveLocalizedString();
  const addingUnavailable = writesEncrypted && encryptionUnavailable;

  const maxNodesReached = stageNodeCount >= maxNodes;
  const minNodesMet =
    addingUnavailable ||
    !minNodes ||
    !isLastPrompt ||
    stageNodeCount >= minNodes;

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

  // Once the maximum is reached nothing more could be added anyway, and the
  // stage says it is complete instead.
  const showAddingUnavailable = addingUnavailable && !maxNodesReached;

  useEffect(() => {
    if (!showAddingUnavailable) return;

    let toastId: string | null = null;
    // Deferred for the same reason as the maximum's toast.
    const timeout = setTimeout(() => {
      toastId = showToast({
        description: createElement(AppMessage, { message: lockedNotice }),
        variant: 'info',
        anchor: 'forward',
        timeout: 0,
      });
    }, 0);

    return () => {
      clearTimeout(timeout);
      if (toastId) closeToast(toastId);
    };
  }, [showAddingUnavailable, lockedNotice, showToast, closeToast]);

  useEffect(() => {
    updateReady(minNodesMet || maxNodesReached);
  }, [minNodesMet, maxNodesReached, updateReady]);

  return { maxNodesReached, minNodesMet };
}

export default useNodeLimits;
