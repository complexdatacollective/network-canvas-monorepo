'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { useTrack } from '../analytics/useTrack';
import { usePrompts } from '../components/Prompts/usePrompts';
import useBeforeNext from './useBeforeNext';

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
}: {
  enabled: boolean;
  /** Every person on the stage, placed or not. */
  nodes: NcNode[];
  /** The unplaced people, in the order the drawer shows them. */
  unplacedNodes: NcNode[];
}) {
  const { promptIndex } = usePrompts();

  // Records the direction of the navigation that crosses a prompt boundary so
  // the prompt change can seed the focal person (#668).
  const crossingDirection = useRef<Direction>('forwards');
  useBeforeNext((direction) => {
    crossingDirection.current = direction;
    return true;
  });

  const [selection, setSelection] = useState<Selection>({
    prompt: promptIndex,
    nodeId: null,
    entry: 'forwards',
  });
  // Seeded in the render that changes the prompt, so that no render shows the
  // new prompt with the previous prompt's focal person.
  if (selection.prompt !== promptIndex) {
    setSelection({
      prompt: promptIndex,
      nodeId: null,
      entry: crossingDirection.current,
    });
  }

  const chosen =
    selection.nodeId === null
      ? undefined
      : nodes.find(
          (node) => node[entityPrimaryKeyProperty] === selection.nodeId,
        );
  const focalNode = enabled
    ? (chosen ??
      (selection.entry === 'backwards'
        ? unplacedNodes.at(-1)
        : unplacedNodes[0]))
    : undefined;
  const focalNodeId = focalNode?.[entityPrimaryKeyProperty];

  const track = useTrack();
  useEffect(() => {
    if (focalNodeId) track('focal_node', { node_id: focalNodeId });
  }, [focalNodeId, track]);

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
      const index = unplacedNodes.findIndex(
        (candidate) => candidate[entityPrimaryKeyProperty] === nodeId,
      );
      const rest = unplacedNodes.filter(
        (candidate) => candidate[entityPrimaryKeyProperty] !== nodeId,
      );
      const next = index === -1 ? undefined : (rest[index] ?? rest[0]);
      setSelection((previous) => ({
        ...previous,
        nodeId: next ? next[entityPrimaryKeyProperty] : null,
      }));
    },
    [unplacedNodes],
  );

  return { focalNode, choose, advanceFrom };
}
