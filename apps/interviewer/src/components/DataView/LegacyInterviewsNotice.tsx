import { ExternalLink } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import { LEGACY_INTERVIEWER_MAJOR } from '~/lib/legacyInterviewer';

const messages = defineMessages({
  interviewsKept: {
    id: 'interviewer.legacyInterviewsNotice.interviewsKept',
    defaultMessage:
      '{count, plural, one {# interview from schema {version} protocols is kept in Interviewer {version}.} other {# interviews from schema {version} protocols are kept in Interviewer {version}.}}',
    description:
      'Line at the top of the interviews list. Interviews collected with older (schema {version}) protocols are not listed here: the previous version of Interviewer keeps and exports them. {version} is that version’s number (for example 8).',
  },
  open: {
    id: 'interviewer.legacyInterviewsNotice.open',
    defaultMessage: 'Open',
    description:
      'Button beside the line saying how many interviews the previous version of Interviewer keeps. Opens that version’s list of interviews, where they can be exported.',
  },
});

// Each Interviewer exports its own interviews with its own exporter, so the
// schema 8 ones are not in this list. This line says they exist and where.
export function LegacyInterviewsNotice({
  count,
  onOpen,
}: {
  count: number;
  /** Leave for Interviewer 8's data view. */
  onOpen: () => void;
}) {
  const intl = useAppIntl();
  return (
    <div className="bg-sea-green/10 text-text font-heading flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm">
      <span>
        {intl.formatMessage(messages.interviewsKept, {
          count,
          version: LEGACY_INTERVIEWER_MAJOR,
        })}
      </span>
      <Button
        variant="link"
        size="sm"
        onClick={onOpen}
        className="font-heading text-sea-green gap-1 font-extrabold tracking-wide uppercase"
        iconPosition="right"
        icon={<ExternalLink size={14} aria-hidden />}
      >
        {intl.formatMessage(messages.open)}
      </Button>
    </div>
  );
}
