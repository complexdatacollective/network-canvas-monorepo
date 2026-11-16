'use client';

import { getNodeTypeDefinition } from '../selectors/session';
import { useStageSelector } from './useStageSelector';

/**
 * The name of the node type the current stage is about, as the codebook
 * names it (such as "Person"): the `subject` the words a stage shows about its
 * nodes may name (see `SUBJECT_ARGUMENTS`). Empty for a stage about no node
 * type.
 */
export function useStageSubjectName(): string {
  return useStageSelector(getNodeTypeDefinition)?.name ?? '';
}
