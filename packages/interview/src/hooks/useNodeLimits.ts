'use client';

import { createElement, useEffect, useRef } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { usePassphrase } from '../interfaces/Anonymisation/usePassphrase';
import useReadyForNextStage from './useReadyForNextStage';
import useStageValidation from './useStageValidation';

type UseNodeLimitsOptions = {
  stageNodeCount: number;
  minNodes: number;
  maxNodes: number;
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
  isLastPrompt,
  writesEncrypted,
}: UseNodeLimitsOptions) {
  const { encryptionUnavailable, lockedNotice } = usePassphrase();
  const addingUnavailable = writesEncrypted && encryptionUnavailable;

  const maxNodesReached = stageNodeCount >= maxNodes;
  const minNodesMet =
    addingUnavailable ||
    !minNodes ||
    !isLastPrompt ||
    stageNodeCount >= minNodes;

  const { updateReady } = useReadyForNextStage();

  const minNodesMessage = createElement(
    'span',
    null,
    createElement(AppMessage, {
      message: messages.minimumItems,
      values: {
        count: minNodes,
        strong: (chunks) => createElement('strong', null, chunks),
      },
    }),
  );

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
        description: createElement(AppMessage, {
          message: messages.taskComplete,
        }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxNodesReached]);

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
