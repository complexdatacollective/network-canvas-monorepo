import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import type { Prompt } from '@codaco/protocol-validation';

import { useStageSelector } from '../../hooks/useStageSelector';
import { getPromptIndex, getPrompts } from '../../selectors/session';
import { updatePrompt } from '../../store/modules/session';

/**
 * @typedef {Object} Prompt
 * @property {string} id
 * @property {string} text
 * @property {string} [variable]
 * @property {string} [createEdge]
 * @property {string} [edgeVariable]
 *
 * @typedef {Array<Prompt>} Prompts
 *
 * @typedef {Object} PromptState
 * @property {number} promptIndex
 * @property {Prompt} prompt
 * @property {Prompts} prompts
 * @property {Function} promptForward
 * @property {Function} promptBackward
 * @property {Function} setPrompt
 * @property {boolean} isLastPrompt
 * @property {boolean} isFirstPrompt
 * @property {Function} updatePrompt
 *
 * @returns {PromptState}
 *
 * @example
 * const {
 *  promptIndex,
 * prompt,
 * prompts,
 * promptForward,
 * promptBackward,
 * setPrompt,
 * isLastPrompt,
 * isFirstPrompt,
 * updatePrompt,
 * } = usePrompts();
 */
export const usePrompts = <
  T extends Record<string, unknown> = Record<string, unknown>,
>() => {
  const dispatch = useDispatch();
  const setPrompt = useCallback(
    (promptIndex: number) => dispatch(updatePrompt(promptIndex)),
    [dispatch],
  );

  // Sort rules (sortOrder / bucketSortOrder / binSortOrder) are left raw here.
  // Each leaf sorter (useSortedNodeList / getSortedNodeList) resolves them via
  // processProtocolSortRule exactly once, against the codebook, at the point of
  // use — matching how Sociogram consumes `sortOrder`. Pre-processing here as
  // well caused the rules to be processed twice, clobbering non-text types.
  const prompts = useStageSelector(getPrompts) ?? [];

  const promptIndex = useSelector(getPromptIndex);
  const isFirstPrompt = prompts.length === 0 || promptIndex === 0;
  const isLastPrompt = promptIndex === prompts.length - 1;

  const promptForward = () => {
    if (prompts.length === 0) return;
    setPrompt((promptIndex + 1) % prompts.length);
  };

  const promptBackward = () => {
    if (prompts.length === 0) return;
    setPrompt((promptIndex - 1 + prompts.length) % prompts.length);
  };

  const prompt = (prompts[promptIndex] ?? {
    id: '',
    text: '',
  }) as Prompt & T;

  return {
    promptIndex,
    prompt,
    prompts,
    promptForward,
    promptBackward,
    setPrompt,
    isLastPrompt,
    isFirstPrompt,
    updatePrompt,
  };
};
