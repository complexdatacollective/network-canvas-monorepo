import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { geospatialWordingMessages } from '@codaco/protocol-builder/editors/geospatial/geospatialWording';
import { nameGeneratorWordingMessages } from '@codaco/protocol-builder/sections/name-generator-wording/nameGeneratorWording';
import type { LocalizedString } from '@codaco/protocol-validation';

import MiniTable from '../MiniTable';
import { SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';

/** A setting's label, and the wording the stage holds for it, if it holds any. */
export type WordingSetting = readonly [
  MessageDescriptor,
  LocalizedString | undefined,
];

type StageWordingProps = {
  settings: readonly WordingSetting[];
};

/**
 * The words a name generator or a map shows a participant, as the stage holds
 * them. Settings the stage does not hold are left out, so a stage with none
 * prints nothing.
 */
const StageWording = ({ settings }: StageWordingProps) => {
  const intl = useAppIntl();
  const rows = settings.flatMap(([label, value], index) =>
    value === undefined
      ? []
      : [
          [
            intl.formatMessage(label),
            <SummaryText key={index} value={value} />,
          ],
        ],
  );
  if (rows.length === 0) {
    return null;
  }
  return (
    <SectionFrame
      title={intl.formatMessage(nameGeneratorWordingMessages.title)}
    >
      <MiniTable rotated rows={rows} />
    </SectionFrame>
  );
};

/** The label each wording setting is shown under, in the order it is shown. */
export const stageWordingSettings = (
  configuration: Readonly<Record<string, unknown>>,
): readonly WordingSetting[] => {
  const text = (key: string) =>
    configuration[key] as LocalizedString | undefined;
  return [
    [nameGeneratorWordingMessages.minNoticeLabel, text('minNodesNotice')],
    [nameGeneratorWordingMessages.maxNoticeLabel, text('maxNodesNotice')],
    [
      nameGeneratorWordingMessages.externalErrorLabel,
      text('externalDataError'),
    ],
    [nameGeneratorWordingMessages.quickAddHintLabel, text('quickAddHint')],
    [nameGeneratorWordingMessages.allAddedLabel, text('allAddedNotice')],
    [geospatialWordingMessages.offlineLabel, text('offlineNotice')],
    [geospatialWordingMessages.unavailableLabel, text('mapUnavailable')],
    [geospatialWordingMessages.outsideAreasLabel, text('outsideAreasLabel')],
    [nameGeneratorWordingMessages.searchLabelLabel, text('searchLabel')],
    [nameGeneratorWordingMessages.searchNoMatchLabel, text('searchNoMatch')],
    [geospatialWordingMessages.searchFailedLabel, text('searchFailed')],
  ];
};

export default StageWording;
