import { Lock } from 'lucide-react';

import { useAppIntl } from '@codaco/app-i18n/react';

import type { LockedOptionList } from '../codebook/variableRoles.ts';
import { binMessages } from '../editors/ordinal-bin/sections/binMessages.ts';
import type { ResolvedTranslation } from '../localization/localizedText.ts';
import { useLocalizedText } from '../localization/ProtocolLocalization.tsx';

/**
 * The values an attribute offers, shown rather than edited.
 *
 * An interface that both writes an attribute and branches on its exact values
 * owns that list however the attribute is reached. Shown INSTEAD of the
 * control that would edit them, as Architect does.
 *
 * The values as well as the labels, because a researcher who reads only the
 * labels cannot tell what this prompt records. The reason is the table's
 * CAPTION, so it reaches a screen reader as the table's own name rather than
 * through the padlock and the dimmed background alone.
 *
 * A module of its own because every surface that binds an attribute with a
 * list shows it this way when the list is not the researcher's to change: the
 * two bins, the tie-strength scale, and the inline value sections a form-field
 * or composer row renders (`sections/AttributeValueFields.tsx`).
 */
export default function LockedOptions({
  options,
  caption,
}: Readonly<{
  options: LockedOptionList;
  /**
   * What says why the list is shown rather than edited, where the usual reason
   * (an interface sets these) is not the one: a list a stage manages names that
   * stage.
   */
  caption?: string;
}>) {
  const intl = useAppIntl();
  const localize = useLocalizedText();

  return (
    <div className="bg-surface-2 text-text relative mb-8 rounded p-4">
      <Lock aria-hidden className="absolute top-4 right-4 h-4 w-4" />
      <table className="w-full text-sm">
        <caption className="pr-8 pb-2 text-left text-sm">
          {caption ?? intl.formatMessage(binMessages.lockedOptions)}
        </caption>
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-bold">
              {intl.formatMessage(binMessages.lockedOptionsLabelColumn)}
            </th>
            <th className="pb-2 font-bold">
              {intl.formatMessage(binMessages.lockedOptionsValueColumn)}
            </th>
          </tr>
        </thead>
        <tbody>
          {options.map((option) => {
            const label: ResolvedTranslation =
              typeof option.label === 'string'
                ? { text: option.label }
                : localize(option.label);
            return (
              <tr key={String(option.value)}>
                <td className="py-1" lang={label.lang} dir={label.dir}>
                  {label.text}
                </td>
                <td className="font-monospace py-1">{String(option.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
