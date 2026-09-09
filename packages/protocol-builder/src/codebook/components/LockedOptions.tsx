import { Lock } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

const messages = defineMessages({
  lockedOptionLabelHeader: {
    id: 'protocolBuilder.codebookVariable.lockedOptionLabelHeader',
    defaultMessage: 'Label',
    description:
      'Column heading over what a participant reads for each allowed answer, in the read-only list of answers an interview step owns.',
  },
  lockedOptionValueHeader: {
    id: 'protocolBuilder.codebookVariable.lockedOptionValueHeader',
    defaultMessage: 'Value',
    description:
      'Column heading over what the export records for each allowed answer, in the read-only list of answers an interview step owns.',
  },
});

/**
 * A list of answers as they stand, with the reason they cannot be edited here.
 *
 * Three things read it: an option list one kind of interview step owns, the
 * answers of a boolean `VariableEditor`'s two-answer fieldset cannot show, and
 * the prompt attribute picker, which shows the values its pick will offer for
 * an attribute whose values are not its to change. All three are the same
 * thing to the researcher — what a participant will be offered, and a surface
 * saying it is not theirs to change — so the caption is what differs between
 * them, and it is passed in rather than chosen from a flag.
 *
 * Its own module rather than a local of `VariableEditor` because the third
 * reader is in another family: a prompt that renders only the explanation
 * leaves the researcher unable to see the bins or the scale points the prompt
 * will offer, and a second table written beside this one would be the same
 * surface with its own drift.
 */
export default function LockedOptions({
  options,
  caption,
}: {
  options: readonly Readonly<{
    label: string;
    value: string | number | boolean;
  }>[];
  caption: string;
}) {
  const intl = useAppIntl();
  return (
    <div className="bg-surface-2 text-surface-2-contrast relative rounded p-4">
      <Lock aria-hidden="true" className="absolute top-4 right-4 size-4" />
      <table className="w-full text-sm">
        <caption className="pr-8 pb-2 text-left">{caption}</caption>
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-bold">
              {intl.formatMessage(messages.lockedOptionLabelHeader)}
            </th>
            <th className="pb-2 font-bold">
              {intl.formatMessage(messages.lockedOptionValueHeader)}
            </th>
          </tr>
        </thead>
        <tbody>
          {options.map((option, index) => (
            <tr key={`${String(option.value)}-${index}`}>
              <td className="py-1">{option.label}</td>
              <td className="font-monospace py-1">{String(option.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
