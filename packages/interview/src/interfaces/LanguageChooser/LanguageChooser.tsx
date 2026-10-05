'use client';

import { useId } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from '@codaco/fresco-ui/PresentationalText';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocaleMetadata } from '@codaco/protocol-validation';

import { languageMessages } from '../../i18n/languageMessages';
import {
  useProtocolLocale,
  useResolvePresentationalText,
} from '../../localization/ProtocolLocalizationProvider';
import type { StageProps } from '../../types';

type LanguageChooserProps = StageProps<'LanguageChooser'>;

// The `und` option's label is written in the interface language rather than in
// a language of its own, so it stays a plain string and keeps the page's.
const optionLabel = (option: LocaleMetadata): PresentationalText =>
  option.locale === 'und'
    ? option.label
    : { text: option.label, lang: option.locale, dir: option.direction };

/**
 * Lets the participant state which of the protocol's languages the interview
 * is shown in. A choice applies at once, to protocol content and the built-in
 * interface alike; leaving the preselected language unchanged states nothing.
 */
const LanguageChooser = ({ stage: { introduction } }: LanguageChooserProps) => {
  const headingId = useId();
  const { locale, options, setLocale } = useProtocolLocale();
  const resolve = useResolvePresentationalText();
  const introductionText = introduction ? resolve(introduction) : null;

  return (
    <ScrollArea className="m-0 size-full">
      <div className="interface mx-auto min-h-full max-w-[80ch]">
        <Surface className="grow-0" noContainer spacing="lg" shadow="lg">
          <Heading level="h1" id={headingId} className="text-center">
            <AppMessage message={languageMessages.chooseLanguage} />
          </Heading>
          {introductionText !== null && (
            // The wrapper makes the last paragraph a last child, which drops the
            // margin a paragraph keeps from the content after it; restore it.
            <div
              className="mb-[1em]"
              {...presentationalTextProps(introductionText)}
            >
              <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
                {presentationalTextValue(introductionText)}
              </RenderMarkdown>
            </div>
          )}
          <RadioGroupField
            aria-labelledby={headingId}
            options={options.map((option) => ({
              value: option.locale,
              label: optionLabel(option),
            }))}
            value={locale}
            onChange={(next) => {
              if (typeof next === 'string') setLocale(next);
            }}
          />
        </Surface>
      </div>
    </ScrollArea>
  );
};

export default LanguageChooser;
