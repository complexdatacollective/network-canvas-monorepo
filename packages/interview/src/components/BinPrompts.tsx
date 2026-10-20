'use client';

import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { DynamicValueEntity } from '../dynamicValues/DynamicValueScope';
import { useValuesUntilExit } from '../dynamicValues/useValuesUntilExit';
import { useNodeLabel } from '../interfaces/Anonymisation/useNodeLabel';
import Prompts from './Prompts';
import { usePrompts } from './Prompts/usePrompts';

/**
 * A bin stage's prompts. In select mode they are shown about the node being
 * placed, so they can name it; with no node to place (every node placed, or
 * in drag mode) its values read as missing. A prompt keeps naming the node it
 * showed until it has left, as the next prompt starts on a node of its own.
 */
export default function BinPrompts({
  focalNode,
}: {
  focalNode: NcNode | undefined;
}) {
  const { prompt } = usePrompts();
  const focalLabel = useNodeLabel(focalNode);
  const onScreen = useValuesUntilExit(prompt.id, {
    attributes: { node: focalNode?.[entityAttributesProperty] },
    labels: { node: focalNode ? focalLabel : undefined },
  });

  return (
    <DynamicValueEntity {...onScreen.values}>
      <Prompts onExitComplete={onScreen.onExitComplete} />
    </DynamicValueEntity>
  );
}
