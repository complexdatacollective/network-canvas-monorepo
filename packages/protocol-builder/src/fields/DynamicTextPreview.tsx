import { cloneElement, type ReactElement, useContext } from 'react';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import {
  type LocaleTag,
  messageShowsValues,
} from '@codaco/protocol-validation';

import { StageEditorFormContext } from '../form/stageEditorContext.ts';
import {
  useEditingLanguage,
  useLocalizedText,
} from '../localization/ProtocolLocalization.tsx';
import { useStageDynamicValues } from '../localization/useDynamicValueSite.ts';
import { DynamicMessageSummary } from './dynamicText/DynamicMessageSummary.tsx';

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
      // A row's preview is of a prompt or a label: text on one line, drawn
      // as a label, as the preview draws it without values.
      multiline={false}
      locale={locale}
      site={site}
    />
  );
}

/**
 * How text a participant reads shows in a row's collapsed preview: in the
 * editing language, or in the one a participant reading that language would
 * be shown instead, with each value the interview fills in as the pill the
 * editor shows, and each set of versions as the pill of the value it is on,
 * as the editor shows it folded.
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
  const { editingLocale } = useEditingLanguage();
  const inStage = useContext(StageEditorFormContext) !== null;
  const shown = localize(value);
  const attributes = { lang: shown.lang, dir: shown.dir };

  if (inStage && messageShowsValues(shown.text)) {
    return cloneElement(
      render,
      attributes,
      <StageMessage
        message={shown.text}
        markdown={markdown}
        locale={shown.lang ?? editingLocale}
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
