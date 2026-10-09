'use client';

import { Languages } from 'lucide-react';
import { useId } from 'react';

import { AppMessage } from '@codaco/app-i18n/react';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';

import { languageMessages } from '../../i18n/languageMessages';
import { useProtocolLocale } from '../../localization/ProtocolLocalizationProvider';

/**
 * Lets the participant state which of the protocol's languages the interview
 * is shown in. A choice applies at once, to protocol content and the built-in
 * interface alike; leaving the preselected language unchanged states nothing.
 */
const LanguageChooser = () => {
  const headingId = useId();
  const { locale, options, setLocale } = useProtocolLocale();

  return (
    <ScrollArea className="m-0 size-full">
      <div className="interface mx-auto min-h-full max-w-[80ch]">
        <Surface className="grow-0" noContainer spacing="lg" shadow="lg">
          <Languages aria-hidden className="mx-auto mb-6 size-12" />
          <span id={headingId} className="sr-only">
            <AppMessage message={languageMessages.chooseLanguage} />
          </span>
          <RichSelectGroupField
            aria-labelledby={headingId}
            options={options.map((option) => ({
              value: option.locale,
              label: {
                text: option.label,
                lang: option.locale,
                dir: option.direction,
              },
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
