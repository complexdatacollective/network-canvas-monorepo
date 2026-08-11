import { isMatch } from 'es-toolkit/compat';
import type { ComponentType } from 'react';

import DatePicker from './DatePicker';
import type { ParameterValues } from './parameterValues';
import RelativeDatePicker from './RelativeDatePicker';
import Scalar from './Scalar';

type ParameterEditorProps = {
  name: string;
  initialParameters?: ParameterValues;
};

const definitions: Array<
  [ComponentType<ParameterEditorProps>, { type: string; component?: string }]
> = [
  [Scalar, { type: 'scalar' }],
  [DatePicker, { type: 'datetime', component: 'DatePicker' }],
  [RelativeDatePicker, { type: 'datetime', component: 'RelativeDatePicker' }],
];

const getComponent = (options: {
  type: string;
  component?: string;
}): ComponentType<ParameterEditorProps> | undefined =>
  definitions.find(([, pattern]) => isMatch(options, pattern))?.[0];

type ParametersProps = ParameterEditorProps & {
  type: string;
  component?: string;
};

const Parameters = ({
  type,
  component,
  name,
  initialParameters,
}: ParametersProps) => {
  const ParameterComponent = getComponent({ type, component });
  if (!ParameterComponent) {
    return null;
  }

  return (
    <ParameterComponent name={name} initialParameters={initialParameters} />
  );
};

export default Parameters;
