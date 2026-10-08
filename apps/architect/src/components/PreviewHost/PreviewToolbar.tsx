import { useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { PresentationalText } from '@codaco/fresco-ui/PresentationalText';
import {
  type LocaleMetadata,
  type LocaleTag,
  sortByLanguageName,
} from '@codaco/protocol-validation';

const messages = defineMessages({
  previewLanguage: {
    id: 'architect.previewHost.previewToolbar.previewLanguage',
    defaultMessage: 'Preview language',
    description:
      'Label of the menu above an Architect preview that chooses which of the protocol’s languages the interview is shown in. The choice lasts while the preview window is open and is never saved.',
  },
});

type PreviewToolbarProps = Readonly<{
  /** Every language the protocol declares. */
  options: readonly LocaleMetadata[];
  /** The language the interview is shown in. */
  value: LocaleTag;
  onChange: (locale: LocaleTag) => void;
}>;

/**
 * The preview window's own controls, outside the interview. Lists the
 * protocol's languages alphabetically by their own names, as the interview's
 * language chooser does, so an author can check each translation.
 */
export default function PreviewToolbar({
  options,
  value,
  onChange,
}: PreviewToolbarProps) {
  const intl = useAppIntl();
  const selectId = useId();
  const optionLabel = (option: LocaleMetadata): PresentationalText => ({
    text: option.label,
    lang: option.locale,
    dir: option.direction,
  });

  return (
    <header className="border-outline bg-surface text-surface-contrast flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 border-b px-4 py-2">
      <label htmlFor={selectId} className="text-sm font-semibold">
        {intl.formatMessage(messages.previewLanguage)}
      </label>
      <SelectField
        id={selectId}
        size="sm"
        className="w-auto"
        options={sortByLanguageName(
          options,
          (option) => option.label,
          intl.locale,
        ).map((option) => ({
          value: option.locale,
          label: optionLabel(option),
        }))}
        value={value}
        // A protocol with one language has nothing to switch to; the control
        // still names the language the preview is in.
        disabled={options.length < 2}
        onChange={(next) => {
          if (typeof next === 'string') onChange(next);
        }}
      />
    </header>
  );
}
