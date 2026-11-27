import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { getUnreachableLayoutReads } from '~/selectors/issues';
import { getCodebook, getStageList } from '~/selectors/protocol';

const messages = defineMessages({
  title: {
    id: 'architect.unreachableLayoutsAlert.title',
    defaultMessage: 'Some nodes will have no position in a layout',
    description:
      'Title of the warning on the timeline of Architect, read by the researcher, shown when a stage shows positions from a layout (a named set of node positions) in which no stage places nodes of some of its node types.',
  },
  description: {
    id: 'architect.unreachableLayoutsAlert.description',
    defaultMessage:
      'These stages show positions from a layout, but no stage places nodes of some of their types in that layout, so those nodes are never shown. Add a Sociogram or a Network Composer that places them in the layout, or choose another layout on the stage.',
    description:
      'Text of the warning on the timeline of Architect, read by the researcher, about stages that show positions from a layout in which no stage places some of their nodes. A Sociogram and a Network Composer are stage types in which participants place nodes. A list of the stages follows.',
  },
  entry: {
    id: 'architect.unreachableLayoutsAlert.entry',
    defaultMessage:
      '{stage} shows the layout “{layout}”, in which no stage places {count, plural, one {{nodeTypes} nodes} other {nodes of the types {nodeTypes}}}.',
    description:
      'One item in the list of the timeline warning in Architect, read by the researcher, about layouts with no positions for some nodes. stage is the name of the stage; layout is the name of the layout; nodeTypes is the list of node type names, already joined; count is how many node types there are.',
  },
});

type StageLayoutRead = {
  stageId: string;
  layoutId: string;
  nodeTypes: readonly string[];
};

/**
 * One entry per stage and layout: a Narrative reads per preset, and two of
 * its presets that show one layout say the same thing.
 */
const groupByStageAndLayout = (
  reads: readonly StageLayoutRead[],
): StageLayoutRead[] => {
  const grouped = new Map<string, StageLayoutRead>();
  for (const { stageId, layoutId, nodeTypes } of reads) {
    const key = `${stageId}:${layoutId}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      stageId,
      layoutId,
      nodeTypes: [...new Set([...(existing?.nodeTypes ?? []), ...nodeTypes])],
    });
  }
  return [...grouped.values()];
};

/**
 * Timeline warning shown when a stage shows positions from a layout in which
 * no stage places nodes of some of its types. Advisory only: such a protocol
 * is valid. Renders nothing when there is no such stage.
 */
const UnreachableLayoutsAlert = () => {
  const intl = useAppIntl();
  const unreachable = useSelector(getUnreachableLayoutReads);
  const reads = useMemo(
    () => groupByStageAndLayout(unreachable),
    [unreachable],
  );
  const stages = useSelector(getStageList);
  const codebook = useSelector(getCodebook);

  if (reads.length === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <AlertTitle>{intl.formatMessage(messages.title)}</AlertTitle>
      <AlertDescription>
        <span className="block">
          {intl.formatMessage(messages.description)}
        </span>
        <ul className="mt-2 list-disc ps-5">
          {reads.map((read) => {
            const names = read.nodeTypes.map(
              (type) => codebook?.node?.[type]?.name ?? type,
            );
            return (
              <li key={`${read.stageId}:${read.layoutId}`}>
                {intl.formatMessage(messages.entry, {
                  stage: (
                    <bdi>
                      {stages.find((stage) => stage.id === read.stageId)
                        ?.label ?? read.stageId}
                    </bdi>
                  ),
                  layout: (
                    <bdi>
                      {codebook?.layouts?.[read.layoutId]?.name ??
                        read.layoutId}
                    </bdi>
                  ),
                  count: names.length,
                  nodeTypes: intl.formatList(names, { type: 'conjunction' }),
                })}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default UnreachableLayoutsAlert;
