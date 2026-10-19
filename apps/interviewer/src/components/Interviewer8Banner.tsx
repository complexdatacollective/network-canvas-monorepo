import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import { IS_SUBPATH_BUILD } from '~/lib/appBase';
import {
  INTERVIEWER_9_HOME_URL,
  leaveForInterviewer9,
} from '~/lib/handoff/interviewer9Navigation';

const messages = defineMessages({
  interviewer8ForSchema8: {
    id: 'interviewer.interviewer8Banner.interviewer8ForSchema8',
    defaultMessage: 'Interviewer 8, for schema 8 protocols',
    description:
      'Banner across the protocols and data views when the previous Interviewer release runs inside the current one, telling the researcher which Interviewer they are in. "Interviewer 8" is an app name; "schema 8" is a protocol format version.',
  },
  backToInterviewer: {
    id: 'interviewer.interviewer8Banner.backToInterviewer',
    defaultMessage: 'Back to Interviewer',
    description:
      'Button in the Interviewer 8 banner that returns the researcher to the current Interviewer. "Interviewer" is the app name.',
  },
});

type Interviewer8BannerProps = {
  /** Out of reach while Home's new-interview form is up, like the header. */
  inert?: boolean;
};

// A slim strip across Home (the protocols and data views), shown only by the
// Interviewer 8 build served inside Interviewer 9 (at /v8/), so a researcher
// always knows which Interviewer they are in and has a way back. Home is never
// on screen during an interview, so the strip never offers to leave one.
//
// It is the first thing on the page inside Interviewer 9's installed window,
// so it carries the top safe-area inset that Home's header carries otherwise.
function Interviewer8BannerStrip({ inert }: Interviewer8BannerProps) {
  const intl = useAppIntl();
  return (
    <Alert
      inert={inert}
      variant="info"
      density="compact"
      className="border-outline laptop:px-11 my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-6 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 shadow-none!"
    >
      <AlertDescription className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-sm">
        <span>{intl.formatMessage(messages.interviewer8ForSchema8)}</span>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={() => leaveForInterviewer9(INTERVIEWER_9_HOME_URL)}
        >
          {intl.formatMessage(messages.backToInterviewer)}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function Interviewer8Banner(props: Interviewer8BannerProps) {
  return IS_SUBPATH_BUILD ? <Interviewer8BannerStrip {...props} /> : null;
}
