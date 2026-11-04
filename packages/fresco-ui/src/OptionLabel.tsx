import {
  type PresentationalText,
  presentationalTextValue,
} from './PresentationalText';
import { getMarkdownLabelText } from './RenderMarkdown';

export { default } from './DeferredOptionLabel';

export function optionLabelText(label: PresentationalText): string {
  return getMarkdownLabelText(presentationalTextValue(label));
}
