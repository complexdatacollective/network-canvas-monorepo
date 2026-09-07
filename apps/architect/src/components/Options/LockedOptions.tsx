import { Lock } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
const messages = defineMessages({
  label: {
    id: 'architect.options.lockedOptions.label',
    defaultMessage: 'Label',
    description: 'Visible text in components / Options / LockedOptions.',
  },
  value: {
    id: 'architect.options.lockedOptions.value',
    defaultMessage: 'Value',
    description: 'Visible text in components / Options / LockedOptions.',
  },
});

// Announced (and shown) as the table's caption, so the read-only state reaches
// a screen-reader user rather than being conveyed by the lock glyph and a
// dimmed background alone.
const CAPTION = defineMessages({
  message: {
    id: 'architect.notice.caption',
    defaultMessage:
      'These options are automatically configured by the interface and cannot be modified.',
    description:
      'Researcher-facing explanation in components/Options/LockedOptions.tsx.',
  },
}).message;

type LockedOptionsProps = {
  /**
   * Widened to cover both a codebook variable's own options (whose union
   * splits string/number from boolean) and an interface-owned canonical set,
   * which is readonly.
   */
  options: readonly { label: string; value: string | number | boolean }[];
};

const LockedOptions = ({ options }: LockedOptionsProps) => {
  const intl = useAppIntl();
  return (
    <div className="bg-surface-2 text-text relative rounded p-4">
      <Lock aria-hidden className="absolute top-4 right-4 h-4 w-4" />
      <table className="w-full text-sm">
        <caption className="pr-8 pb-2 text-left text-sm">
          {intl.formatMessage(CAPTION)}
        </caption>
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-bold">
              {intl.formatMessage(messages.label)}
            </th>
            <th className="pb-2 font-bold">
              {intl.formatMessage(messages.value)}
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
};

export default LockedOptions;
