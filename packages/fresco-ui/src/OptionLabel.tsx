import { cloneElement, type ReactElement } from 'react';

import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from './PresentationalText';
import { getMarkdownLabelText, RenderMarkdown } from './RenderMarkdown';

type OptionLabelProps = {
  label: PresentationalText;
  render?: ReactElement;
};

export function optionLabelText(label: PresentationalText): string {
  return getMarkdownLabelText(presentationalTextValue(label));
}

export default function OptionLabel({
  label,
  render = <span />,
}: OptionLabelProps) {
  return (
    <RenderMarkdown
      render={cloneElement(render, presentationalTextProps(label))}
    >
      {presentationalTextValue(label)}
    </RenderMarkdown>
  );
}
