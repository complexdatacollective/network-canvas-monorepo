import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { geospatialWordingMessages } from '@codaco/protocol-builder/editors/geospatial/geospatialWording';
import { nameGeneratorWordingMessages } from '@codaco/protocol-builder/sections/name-generator-wording/nameGeneratorWording';
import type { LocalizedString } from '@codaco/protocol-validation';

import MiniTable from '../MiniTable';
import { SummaryMessage, SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';
import { stageMessageArguments } from './stageMessageArguments';

/** A setting's label, and where the stage holds its wording. */
type WordingSetting = readonly [MessageDescriptor, string];

type StageWordingProps = {
  type: string;
  configuration: Readonly<Record<string, unknown>>;
};

/** The label each wording setting is shown under, in the order it is shown. */
const STAGE_WORDING_SETTINGS: readonly WordingSetting[] = [
  [nameGeneratorWordingMessages.minNoticeLabel, 'minNodesNotice'],
  [nameGeneratorWordingMessages.maxNoticeLabel, 'maxNodesNotice'],
  [nameGeneratorWordingMessages.externalErrorLabel, 'externalDataError'],
  [nameGeneratorWordingMessages.quickAddHintLabel, 'quickAddHint'],
  [nameGeneratorWordingMessages.allAddedLabel, 'allAddedNotice'],
  [geospatialWordingMessages.offlineLabel, 'offlineNotice'],
  [geospatialWordingMessages.unavailableLabel, 'mapUnavailable'],
  [geospatialWordingMessages.outsideAreasLabel, 'outsideAreasLabel'],
  [nameGeneratorWordingMessages.searchLabelLabel, 'searchLabel'],
  [nameGeneratorWordingMessages.searchNoMatchLabel, 'searchNoMatch'],
  [geospatialWordingMessages.searchFailedLabel, 'searchFailed'],
];

/**
 * The words a name generator or a map shows a participant, as the stage holds
 * them. Settings the stage does not hold are left out, so a stage with none
 * prints nothing.
 */
const StageWording = ({ type, configuration }: StageWordingProps) => {
  const intl = useAppIntl();
  const declarations = stageMessageArguments({ ...configuration, type });
  const rows = STAGE_WORDING_SETTINGS.flatMap(([label, key]) => {
    const value = configuration[key] as LocalizedString | undefined;
    if (value === undefined) return [];
    const declaration = declarations.get(key);
    return [
      [
        intl.formatMessage(label),
        declaration === undefined ? (
          <SummaryText key={key} value={value} />
        ) : (
          <SummaryMessage
            key={key}
            value={value}
            messageArguments={declaration}
          />
        ),
      ],
    ];
  });
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

export default StageWording;
