import { Lock } from 'lucide-react';

import { useAppIntl } from '@codaco/app-i18n/react';

import type { LockedOptionList } from '../codebook/variableRoles.ts';
import { binMessages } from '../editors/ordinal-bin/sections/binMessages.ts';

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
}: Readonly<{ options: LockedOptionList }>) {
  const intl = useAppIntl();

  return (
    <div className="bg-surface-2 text-text relative mb-8 rounded p-4">
      <Lock aria-hidden className="absolute top-4 right-4 h-4 w-4" />
      <table className="w-full text-sm">
        <caption className="pr-8 pb-2 text-left text-sm">
          {intl.formatMessage(binMessages.lockedOptions)}
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
          {options.map((option) => (
            <tr key={String(option.value)}>
              <td className="py-1">{option.label}</td>
              <td className="font-monospace py-1">{String(option.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
