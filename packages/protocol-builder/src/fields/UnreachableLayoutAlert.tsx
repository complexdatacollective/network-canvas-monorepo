import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import {
  findUnreachableLayoutReads,
  type Stage,
} from '@codaco/protocol-validation';

import { useProtocolContext } from '../state/protocolContext.ts';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.unreachableLayout.title',
    defaultMessage: 'No stage places some nodes in this layout',
    description:
      'Title of the warning in the stage editor of Architect, read by the researcher, shown under the layout chosen for a stage that only shows positions (a Narrative preset, for example). It says that no stage places nodes of some node types in that layout, so those nodes have positions there only if a roster supplies them.',
  },
  description: {
    id: 'protocolBuilder.unreachableLayout.description',
    defaultMessage:
      'No stage places {count, plural, one {{nodeTypes} nodes} other {nodes of the types {nodeTypes}}} in the layout “{layout}”, so they are shown here only if a roster gives them positions in this layout. Add a Sociogram or a Network Composer that places them in this layout, or choose another layout.',
    description:
      'Text of the warning in the stage editor of Architect, read by the researcher, shown when no stage places some of the node types of a stage that only shows positions in the layout chosen for it. nodeTypes is the list of those node type names, already joined; count is how many there are; layout is the name of the layout. A Sociogram and a Network Composer are stage types in which participants place nodes. A roster is a data file of nodes that can give them positions.',
  },
});

/**
 * The node types for which `draft`, a stage as it is being edited, reads a
 * layout that no other stage places them in. `presetId` picks the preset of
 * a stage that reads a layout per preset.
 */
export function useUnreachableLayoutTypes(
  draft: Stage | undefined,
  presetId?: string,
): readonly string[] {
  const { codebook, orderedStages } = useProtocolContext();
  return useMemo(() => {
    if (draft === undefined) return [];
    const stages = [
      ...orderedStages.filter((stage) => stage.id !== draft.id),
      draft,
    ];
    return (
      findUnreachableLayoutReads({ codebook, stages }).find(
        (read) => read.stageId === draft.id && read.presetId === presetId,
      )?.nodeTypes ?? []
    );
  }, [codebook, draft, orderedStages, presetId]);
}

type UnreachableLayoutAlertProps = Readonly<{
  layoutId: string;
  nodeTypes: readonly string[];
}>;

/**
 * Warns that a stage shows positions from a layout in which no stage places
 * nodes of some of its types. Advisory only: such a protocol is valid.
 */
export default function UnreachableLayoutAlert({
  layoutId,
  nodeTypes,
}: UnreachableLayoutAlertProps) {
  const intl = useAppIntl();
  const { codebook } = useProtocolContext();
  if (nodeTypes.length === 0) return null;
  const names = nodeTypes.map((type) => codebook.node?.[type]?.name ?? type);
  return (
    <Alert variant="warning">
      <AlertTitle>{intl.formatMessage(messages.title)}</AlertTitle>
      <AlertDescription>
        {intl.formatMessage(messages.description, {
          count: names.length,
          nodeTypes: intl.formatList(names, { type: 'conjunction' }),
          layout: codebook.layouts?.[layoutId]?.name ?? layoutId,
        })}
      </AlertDescription>
    </Alert>
  );
}
