import { cloneElement, type ReactElement } from 'react';

import { DeferredMarkdown } from './DeferredMarkdown';
import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from './PresentationalText';

type OptionLabelProps = {
  label: PresentationalText;
  render?: ReactElement;
};

export default function OptionLabel({
  label,
  render = <span />,
}: OptionLabelProps) {
  return (
    <DeferredMarkdown
      render={cloneElement(render, presentationalTextProps(label))}
    >
      {presentationalTextValue(label)}
    </DeferredMarkdown>
  );
}
