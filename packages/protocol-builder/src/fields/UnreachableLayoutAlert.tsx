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
    defaultMessage: 'Some nodes will have no position in this layout',
    description:
      'Title of the warning in the stage editor of Architect, read by the researcher, shown under the layout chosen for a stage that only shows positions (a Narrative preset, for example). It says that nodes of some node types can never have a position in that layout.',
  },
  description: {
    id: 'protocolBuilder.unreachableLayout.description',
    defaultMessage:
      'No stage places {count, plural, one {{nodeTypes} nodes} other {nodes of the types {nodeTypes}}} in the layout “{layout}”, so they will never be shown here. Add a Sociogram or a Network Composer that places them in this layout, or choose another layout.',
    description:
      'Text of the warning in the stage editor of Architect, read by the researcher, shown when the layout chosen for a stage that only shows positions has no positions for some of its node types. nodeTypes is the list of those node type names, already joined; count is how many there are; layout is the name of the layout. A Sociogram and a Network Composer are stage types in which participants place nodes.',
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
