import { cloneElement, type ReactElement, useContext } from 'react';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import { type LocaleTag, messageStructure } from '@codaco/protocol-validation';

import { StageEditorFormContext } from '../form/stageEditorContext.ts';
import {
  useEditingLanguage,
  useLocalizedText,
} from '../localization/ProtocolLocalization.tsx';
import { useStageDynamicValues } from '../localization/useDynamicValueSite.ts';
import { DynamicMessageSummary } from './DynamicTextField.tsx';

/** Whether `message` shows a value or chooses between versions by one. */
const showsValues = (message: string): boolean => {
  if (!message.includes('{')) return false;
  const structure = messageStructure(message);
  return (
    'nodes' in structure && structure.nodes.some((node) => node.kind !== 'text')
  );
};

function StageMessage({
  message,
  markdown,
  locale,
}: Readonly<{ message: string; markdown: boolean; locale: LocaleTag }>) {
  const site = useStageDynamicValues();
  return (
    <DynamicMessageSummary
      message={message}
      markdown={markdown}
      locale={locale}
      site={site}
    />
  );
}

/**
 * How text a participant reads shows in a row's collapsed preview: in the
 * editing language, or in the one a participant reading that language would
 * be shown instead, with each value the interview fills in as the pill the
 * editor shows and each set of versions as a list of what it says when.
 * Markdown is rendered as the participant will read it.
 */
export function DynamicTextPreview({
  value,
  markdown = true,
  render = <div />,
}: Readonly<{
  /** The stored text, in every language. */
  value: unknown;
  markdown?: boolean;
  /** The element the text is shown in. */
  render?: ReactElement<{ lang?: string; dir?: string }>;
}>) {
  const localize = useLocalizedText();
  const { locale, localization } = useEditingLanguage();
  const inStage = useContext(StageEditorFormContext) !== null;
  const shown = localize(value);
  const attributes = { lang: shown.lang, dir: shown.dir };

  if (inStage && showsValues(shown.text)) {
    return cloneElement(
      render,
      attributes,
      <StageMessage
        message={shown.text}
        markdown={markdown}
        locale={shown.lang ?? locale ?? localization?.defaultLocale ?? 'en'}
      />,
    );
  }
  if (markdown) {
    return (
      <RenderMarkdown render={cloneElement(render, attributes)}>
        {shown.text}
      </RenderMarkdown>
    );
  }
  return cloneElement(render, attributes, shown.text);
}
