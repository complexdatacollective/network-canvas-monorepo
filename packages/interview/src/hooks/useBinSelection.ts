'use client';

import { useCallback, useEffect, useState } from 'react';

import type { SortRule } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { useTrack } from '../analytics/useTrack';
import { usePrompts } from '../components/Prompts/usePrompts';
import { useStepOrder } from './useSortedNodeList';

type Direction = 'forwards' | 'backwards';

type Selection = {
  prompt: number;
  /** The person the participant chose, when not simply the next one. */
  nodeId: string | null;
  entry: Direction;
};

/**
 * The focal person of a bin stage in select mode (#1652): the one person the
 * participant is placing, who goes in whichever bin they tap next.
 *
 * Without a choice, the focal person is the first unplaced person in the
 * drawer's order, or the last when the prompt was reached by going back. After
 * a placement the next unplaced person in that order becomes focal. Choosing a
 * placed person makes them focal so their answer can be corrected.
 */
export function useBinSelection({
  enabled,
  nodes,
  unplacedNodes,
  sortRules,
}: {
  enabled: boolean;
  /** Every person on the stage, placed or not. */
  nodes: NcNode[];
  /** The unplaced people, in the order the drawer shows them. */
  unplacedNodes: NcNode[];
  /** The rules the drawer is sorted by. */
  sortRules: SortRule[] | undefined;
}) {
  const { promptIndex } = usePrompts();
  const queue = useStepOrder(unplacedNodes, sortRules, promptIndex);

  const [selection, setSelection] = useState<Selection>({
    prompt: promptIndex,
    nodeId: null,
    entry: 'forwards',
  });
  // Seeded in the render that changes the prompt, so that no render shows the
  // new prompt with the previous prompt's focal person. A lower prompt index
  // means the participant went back. This reads the direction from the
  // prompts rather than registering a beforeNext handler, whose presence
  // alone changes when navigation is available.
  if (selection.prompt !== promptIndex) {
    setSelection({
      prompt: promptIndex,
      nodeId: null,
      entry: promptIndex < selection.prompt ? 'backwards' : 'forwards',
    });
  }

  const chosen =
    selection.nodeId === null
      ? undefined
      : nodes.find(
          (node) => node[entityPrimaryKeyProperty] === selection.nodeId,
        );
  const settling = enabled && chosen === undefined && queue === undefined;
  const focalNode = enabled
    ? (chosen ?? (selection.entry === 'backwards' ? queue?.at(-1) : queue?.[0]))
    : undefined;
  const focalNodeId = focalNode?.[entityPrimaryKeyProperty];

  const track = useTrack();
  // Keyed by prompt too: the same person shown first on the next prompt is
  // shown again.
  useEffect(() => {
    if (focalNodeId) track('focal_node', { node_id: focalNodeId });
  }, [focalNodeId, promptIndex, track]);

  /** Makes a person focal, or lets go of them if they already are. */
  const choose = useCallback((node: NcNode) => {
    const nodeId = node[entityPrimaryKeyProperty];
    setSelection((previous) => ({
      ...previous,
      nodeId: previous.nodeId === nodeId ? null : nodeId,
    }));
  }, []);

  /**
   * Moves on from a person who has just been placed: to the unplaced person
   * after them in the drawer's order, or the first one when they were the last.
   * A placed person who was moved hands back to the drawer's order.
   */
  const advanceFrom = useCallback(
    (node: NcNode) => {
      const nodeId = node[entityPrimaryKeyProperty];
      const order = queue ?? [];
      const index = order.findIndex(
        (candidate) => candidate[entityPrimaryKeyProperty] === nodeId,
      );
      const rest = order.filter(
        (candidate) => candidate[entityPrimaryKeyProperty] !== nodeId,
      );
      const next = index === -1 ? undefined : (rest[index] ?? rest[0]);
      setSelection((previous) => ({
        ...previous,
        nodeId: next ? next[entityPrimaryKeyProperty] : null,
      }));
    },
    [queue],
  );

  return { focalNode, settling, choose, advanceFrom };
}
