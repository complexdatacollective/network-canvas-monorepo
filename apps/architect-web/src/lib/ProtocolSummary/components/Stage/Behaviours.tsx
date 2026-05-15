import { map } from 'es-toolkit/compat';

import { renderValue } from '../helpers';
import MiniTable from '../MiniTable';
import SectionFrame from './SectionFrame';

const behaviorLabel = (behaviourValue: unknown, behaviourKey: string) => {
  switch (behaviourKey) {
    case 'allowRepositioning':
      return { label: 'Repositioning enabled', value: behaviourValue };
    case 'automaticLayout':
      return {
        label: 'Automatic layout enabled',
        value: (behaviourValue as { enabled?: boolean })?.enabled,
      };
    case 'minNodes':
      return { label: 'Minimum nodes on stage', value: behaviourValue };
    case 'maxNodes':
      return { label: 'Maximum nodes on stage', value: behaviourValue };
    case 'freeDraw':
      return { label: 'Freedraw enabled', value: behaviourValue };
    default:
      return { label: behaviourKey, value: behaviourValue };
  }
};

const behaviourRows = (behaviours: Record<string, unknown>) =>
  map(behaviours, (behaviourValue, behaviourKey) => {
    const labelValue = behaviorLabel(behaviourValue, behaviourKey);
    return [labelValue.label, renderValue(labelValue.value)];
  });

type BehavioursProps = {
  behaviours?: {
    allowRepositioning?: boolean;
    freeDraw?: boolean;
    [key: string]: unknown;
  } | null;
};

const Behaviours = ({ behaviours = null }: BehavioursProps) => {
  if (!behaviours) {
    return null;
  }

  return (
    <SectionFrame title="Behaviours">
      <MiniTable rotated rows={behaviourRows(behaviours)} />
    </SectionFrame>
  );
};

export default Behaviours;
