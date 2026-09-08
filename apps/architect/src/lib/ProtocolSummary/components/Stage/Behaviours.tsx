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
      'The title text in lib / ProtocolSummary / components / Stage / Behaviours.',
  },
});
const extraMessages = defineMessages({
  repositioningenabled: {
    id: 'architect.summary.behaviours.repositioningenabled',
    defaultMessage: 'Repositioning enabled',
    description: 'Researcher-facing Architect control or feedback.',
  },
  automaticlayoutenabled: {
    id: 'architect.summary.behaviours.automaticlayoutenabled',
    defaultMessage: 'Automatic layout enabled',
    description: 'Researcher-facing Architect control or feedback.',
  },
  minimumnodesonstage: {
    id: 'architect.summary.behaviours.minimumnodesonstage',
    defaultMessage: 'Minimum nodes on stage',
    description: 'Researcher-facing Architect control or feedback.',
  },
  maximumnodesonstage: {
    id: 'architect.summary.behaviours.maximumnodesonstage',
    defaultMessage: 'Maximum nodes on stage',
    description: 'Researcher-facing Architect control or feedback.',
  },
  freedrawenabled: {
    id: 'architect.summary.behaviours.freedrawenabled',
    defaultMessage: 'Freedraw enabled',
    description: 'Researcher-facing Architect control or feedback.',
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
