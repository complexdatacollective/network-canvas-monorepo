import { map } from 'es-toolkit/compat';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { SummaryValue } from '../helpers';
import MiniTable from '../MiniTable';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  behaviours: {
    id: 'architect.protocolSummary.stage.behaviours.behaviours',
    defaultMessage: 'Behaviours',
    description:
      "Section heading in the printable protocol summary, above the table of a sociogram or similar stage's behaviour settings.",
  },
});
const extraMessages = defineMessages({
  repositioningenabled: {
    id: 'architect.summary.behaviours.repositioningenabled',
    defaultMessage: 'Repositioning enabled',
    description:
      'Row label in the behaviours table of a stage in the printable protocol summary; its value says whether participants may drag nodes to new positions.',
  },
  automaticlayoutenabled: {
    id: 'architect.summary.behaviours.automaticlayoutenabled',
    defaultMessage: 'Automatic layout enabled',
    description:
      'Row label in the behaviours table of a stage in the printable protocol summary; its value says whether nodes are positioned automatically by a layout algorithm.',
  },
  minimumnodesonstage: {
    id: 'architect.summary.behaviours.minimumnodesonstage',
    defaultMessage: 'Minimum nodes on stage',
    description:
      'Row label in the behaviours table of a stage in the printable protocol summary; its value is the fewest nodes a participant must have before they can move on.',
  },
  maximumnodesonstage: {
    id: 'architect.summary.behaviours.maximumnodesonstage',
    defaultMessage: 'Maximum nodes on stage',
    description:
      'Row label in the behaviours table of a stage in the printable protocol summary; its value is the most nodes a participant may have on the stage.',
  },
  freedrawenabled: {
    id: 'architect.summary.behaviours.freedrawenabled',
    defaultMessage: 'Freedraw enabled',
    description:
      'Row label in the behaviours table of a stage in the printable protocol summary; its value says whether participants may draw freehand on the canvas.',
  },
});

const behaviorLabel = (
  behaviourValue: unknown,
  behaviourKey: string,
  intl: IntlShape,
) => {
  switch (behaviourKey) {
    case 'allowRepositioning':
      return {
        label: intl.formatMessage(extraMessages.repositioningenabled),
        value: behaviourValue,
      };
    case 'automaticLayout':
      return {
        label: intl.formatMessage(extraMessages.automaticlayoutenabled),
        value: behaviourValue,
      };
    case 'minNodes':
      return {
        label: intl.formatMessage(extraMessages.minimumnodesonstage),
        value: behaviourValue,
      };
    case 'maxNodes':
      return {
        label: intl.formatMessage(extraMessages.maximumnodesonstage),
        value: behaviourValue,
      };
    case 'freeDraw':
      return {
        label: intl.formatMessage(extraMessages.freedrawenabled),
        value: behaviourValue,
      };
    default:
      return { label: behaviourKey, value: behaviourValue };
  }
};

const behaviourRows = (behaviours: Record<string, unknown>, intl: IntlShape) =>
  map(behaviours, (behaviourValue, behaviourKey) => {
    const labelValue = behaviorLabel(behaviourValue, behaviourKey, intl);
    return [
      labelValue.label,
      <SummaryValue key={behaviourKey} value={labelValue.value} />,
    ];
  });

type BehavioursProps = {
  behaviours?: {
    allowRepositioning?: boolean;
    freeDraw?: boolean;
    [key: string]: unknown;
  } | null;
};

const Behaviours = ({ behaviours = null }: BehavioursProps) => {
  const intl = useAppIntl();
  if (!behaviours) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.behaviours)}>
      <MiniTable rotated rows={behaviourRows(behaviours, intl)} />
    </SectionFrame>
  );
};

export default Behaviours;
