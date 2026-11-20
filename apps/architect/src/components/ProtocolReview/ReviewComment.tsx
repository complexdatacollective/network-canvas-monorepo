import { MessageSquare } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  commentOnReview,
  getProtocolReviewComment,
} from '~/ducks/modules/protocolReview';
import { FEEDBACK_COMMENT_MAX_LENGTH } from '~/protocolReview/reviewFeedback';

import { GuardedButton } from './reviewControls';

const messages = defineMessages({
  commentOpen: {
    id: 'architect.protocolReview.popover.commentOpen',
    defaultMessage: 'Leave feedback on this review',
    description:
      'Button under the list of problems. It opens a box for writing feedback about the review as a whole, in the researcher’s own words. It is also the label of that box.',
  },
  commentChange: {
    id: 'architect.protocolReview.popover.commentChange',
    defaultMessage: 'Change your feedback',
    description:
      'Button under the list of problems, shown in place of "Leave feedback on this review" once the researcher has sent feedback. It opens what they wrote again for changing.',
  },
  commentHint: {
    id: 'architect.protocolReview.popover.commentHint',
    defaultMessage:
      'Tell the Network Canvas team what you thought of this review. Leave out names and anything else that could identify a person.',
    description:
      'Explanation above the box for written feedback about the review. "Network Canvas" is a product name and is not translated.',
  },
  commentSend: {
    id: 'architect.protocolReview.popover.commentSend',
    defaultMessage: 'Send feedback',
    description:
      'Button that sends what the researcher wrote about the review to the Network Canvas team.',
  },
  commentCancel: {
    id: 'architect.protocolReview.popover.commentCancel',
    defaultMessage: 'Cancel',
    description:
      'Button that closes the box for written feedback about the review without sending what was typed.',
  },
  commentRefused: {
    id: 'architect.protocolReview.popover.commentRefused',
    defaultMessage:
      'Your feedback could not be saved, because this protocol is open for editing in another tab. Leave feedback on the review in that tab.',
    description:
      'Notice when written feedback about the review was refused because another browser tab holds this protocol for editing.',
  },
});

type ReviewCommentProps = {
  /**
   * What is being typed while the box is open, and null while it is closed.
   * Held by the panel, so that it outlives a look at one of the problems.
   */
  draft: string | null;
  onDraftChange: (draft: string | null) => void;
  announce: (message: string) => void;
};

/**
 * Written feedback on the review as a whole, under the list of problems: a
 * button that opens a box for it, holding what was sent before.
 */
const ReviewComment = ({
  draft,
  onDraftChange,
  announce,
}: ReviewCommentProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const sent = useAppSelector(getProtocolReviewComment);
  const [refused, setRefused] = useState(false);
  // Whether the button that opens the box takes focus as it returns: the box
  // it replaces has gone, and focus with it.
  const focusButton = useRef(false);
  const labelId = useId();
  const hintId = useId();

  const close = () => {
    focusButton.current = true;
    onDraftChange(null);
  };
  const send = async () => {
    if (draft === null) return;
    const recorded = await dispatch(commentOnReview(draft));
    setRefused(!recorded);
    if (!recorded) return;
    announce(draft.trim() === '' ? 'Feedback removed.' : 'Feedback sent.');
    close();
  };

  return (
    <div className="border-outline flex flex-col gap-3 border-t px-6 py-4">
      {refused && (
        <Alert variant="warning" density="compact" className="my-0">
          <AlertDescription className="text-sm">
            {intl.formatMessage(messages.commentRefused)}
          </AlertDescription>
        </Alert>
      )}
      {draft === null ? (
        <div>
          <Button
            ref={(button: HTMLButtonElement | null) => {
              if (button === null || !focusButton.current) return;
              focusButton.current = false;
              button.focus();
            }}
            size="sm"
            variant="text"
            className="-ms-3"
            icon={<MessageSquare aria-hidden />}
            onClick={() => onDraftChange(sent)}
          >
            {intl.formatMessage(
              sent === '' ? messages.commentOpen : messages.commentChange,
            )}
          </Button>
        </div>
      ) : (
        <>
          <span id={labelId} className="text-sm font-bold">
            {intl.formatMessage(messages.commentOpen)}
          </span>
          <Paragraph id={hintId} intent="smallText" margin="none">
            {intl.formatMessage(messages.commentHint)}
          </Paragraph>
          <TextAreaField
            autoFocus
            aria-labelledby={labelId}
            aria-describedby={hintId}
            maxLength={FEEDBACK_COMMENT_MAX_LENGTH}
            className="[&>textarea]:field-sizing-content [&>textarea]:max-h-48 [&>textarea]:min-h-20"
            value={draft}
            onChange={(next) => onDraftChange(next ?? '')}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="text" onClick={close}>
              {intl.formatMessage(messages.commentCancel)}
            </Button>
            <GuardedButton
              size="sm"
              color="primary"
              unavailable={draft.trim() === sent}
              onClick={() => void send()}
            >
              {intl.formatMessage(messages.commentSend)}
            </GuardedButton>
          </div>
        </>
      )}
    </div>
  );
};

export default ReviewComment;
