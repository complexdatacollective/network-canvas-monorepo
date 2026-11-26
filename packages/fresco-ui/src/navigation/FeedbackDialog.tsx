'use client';

import type { JSONContent } from '@tiptap/react';
import {
  ExternalLink,
  Lock,
  MessageSquareText,
  Send,
  Users,
} from 'lucide-react';
import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ZodMiniType } from 'zod/mini';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';

import { Button, type ButtonProps, IconButton } from '../Button';
import Dialog from '../dialogs/Dialog';
import UnconnectedField from '../form/Field/UnconnectedField';
import InputField from '../form/fields/InputField';
import RichTextEditorField from '../form/fields/RichTextEditor';
import FormErrors from '../form/FormErrors';
import { formMessages } from '../form/hooks/useForm';
import { validations } from '../form/validation/functions';
import { NativeLink } from '../NativeLink';
import SegmentedSwitcherField from '../SegmentedSwitcher/SegmentedSwitcherField';
import { useToast } from '../Toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';
import {
  COMMUNITY_FORUM_URL,
  FORUM_TOPIC_URL_MAX_LENGTH,
  forumTopicUrl,
} from './communityForum';
import { feedbackMarkdown } from './feedbackMarkdown';

const messages = defineMessages({
  trigger: {
    id: 'frescoUi.feedbackDialog.trigger',
    defaultMessage: 'Feedback',
    description:
      'Label of the button that opens a form for sharing feedback about the application. A noun.',
  },
  title: {
    id: 'frescoUi.feedbackDialog.title',
    defaultMessage: 'Share feedback',
    description:
      'Title of the dialog in which the user writes feedback about the application, sent privately to the Network Canvas team or posted publicly on the community forum.',
  },
  description: {
    id: 'frescoUi.feedbackDialog.description',
    defaultMessage:
      'This project depends on ideas and feedback from our users. If you have a suggestion for how the software could be improved, please share it with us. Thank you for your time!',
    description:
      'Text under the title of the feedback dialog, inviting the user to suggest how the Network Canvas software could be improved. "This project" is Network Canvas; "our users" are the researchers who use it.',
  },
  audienceLabel: {
    id: 'frescoUi.feedbackDialog.audienceLabel',
    defaultMessage: 'Who should see it?',
    description:
      'Label of the switch in the feedback dialog between sending the feedback privately to the Network Canvas team and posting it publicly on the community forum.',
  },
  audienceHint: {
    id: 'frescoUi.feedbackDialog.audienceHint',
    defaultMessage:
      'Post on the <link>community forum</link> to report a problem, suggest an idea, or get help from other researchers. If you’d rather not post publicly, you can send your feedback privately to our team instead. The forum opens in a new tab with a draft of your post. Posting it needs a forum account.',
    description:
      'Hint under the "Who should see it?" switch in the feedback dialog, shown whichever option is chosen. It explains the two choices: posting the feedback publicly on the Network Canvas community forum, a discussion website for researchers who use the software, or sending it privately to the Network Canvas team. The last two sentences say what happens when the user posts on the forum: a new browser tab opens on the forum with their post already filled in, and they need an account on the forum to publish it. The words inside <link> link to the forum, opening it in a new tab.',
  },
  audienceTeam: {
    id: 'frescoUi.feedbackDialog.audienceTeam',
    defaultMessage: 'Our team',
    description:
      'Option in the feedback dialog: the feedback goes privately to the Network Canvas team. "Our" is the team that makes the application.',
  },
  audienceForum: {
    id: 'frescoUi.feedbackDialog.audienceForum',
    defaultMessage: 'Community forum',
    description:
      'Option in the feedback dialog: the feedback is posted publicly on the Network Canvas community forum.',
  },
  postTitleLabel: {
    id: 'frescoUi.feedbackDialog.postTitleLabel',
    defaultMessage: 'Post title',
    description:
      'Label of the field for the title of the new topic, shown when the user is posting on the community forum.',
  },
  postTitlePlaceholder: {
    id: 'frescoUi.feedbackDialog.postTitlePlaceholder',
    defaultMessage: 'A short summary',
    description: 'Placeholder text in the empty "Post title" field.',
  },
  feedbackPlaceholder: {
    id: 'frescoUi.feedbackDialog.feedbackPlaceholder',
    defaultMessage: 'Describe the problem, idea or question…',
    description:
      'Placeholder text in the empty text box where the user writes their feedback or forum post.',
  },
  feedbackLabel: {
    id: 'frescoUi.feedbackDialog.feedbackLabel',
    defaultMessage: 'Your feedback',
    description:
      'Label of the large text box in the feedback dialog where the user writes feedback for the Network Canvas team. It can hold lists and bold or italic text.',
  },
  postLabel: {
    id: 'frescoUi.feedbackDialog.postLabel',
    defaultMessage: 'Your post',
    description:
      'Label of the large text box in the feedback dialog, when the user is posting on the community forum, where they write the body of their forum post. It can hold lists and bold or italic text.',
  },
  emailLabel: {
    id: 'frescoUi.feedbackDialog.emailLabel',
    defaultMessage: 'Email',
    description:
      'Label of the field in the feedback dialog, shown when the feedback goes privately to the Network Canvas team, where the user may leave their email address so that the team can contact them. The field may be left empty.',
  },
  emailHint: {
    id: 'frescoUi.feedbackDialog.emailHint',
    defaultMessage:
      'If you would like us to contact you about your feedback, please provide your email address. Anonymous feedback is also welcome.',
    description:
      'Hint under the email field in the feedback dialog. "Us" is the Network Canvas team. The field may be left empty: without an email address the team cannot tell who sent the feedback.',
  },
  postTooLongForForum: {
    id: 'frescoUi.feedbackDialog.postTooLongForForum',
    defaultMessage:
      'Your post is too long to send to the forum. Shorten it, or send it privately to our team instead.',
    description:
      'Error under the text box in the feedback dialog, shown when the user is posting on the community forum and the title and post together are too long for the forum to open as a draft in a new tab. Text in some languages, such as Arabic or Chinese, reaches this limit sooner. "Our team" is the Network Canvas team; the user can switch the dialog to send the feedback to the team privately, which has no such limit.',
  },
  send: {
    id: 'frescoUi.feedbackDialog.send',
    defaultMessage: 'Send to our team',
    description:
      'Button in the feedback dialog that sends the feedback privately to the Network Canvas team.',
  },
  continueOnForum: {
    id: 'frescoUi.feedbackDialog.continueOnForum',
    defaultMessage: 'Continue on the forum',
    description:
      'Button in the feedback dialog that opens the community forum in a new tab, with the feedback filled in as a new topic for the user to post.',
  },
  thanks: {
    id: 'frescoUi.feedbackDialog.thanks',
    defaultMessage: 'Thanks for your feedback. It has been sent to our team.',
    description:
      'Notification shown once the feedback has been sent to the Network Canvas team. The feedback dialog closes when it appears.',
  },
});

const TRIGGER_NAME = 'Feedback';
const EMPTY_DOCUMENT: JSONContent = { type: 'doc', content: [] };

const communityForumLink = (chunks: ReactNode) => (
  <NativeLink
    href={COMMUNITY_FORUM_URL}
    target="_blank"
    rel="noopener noreferrer"
  >
    {chunks}
  </NativeLink>
);

type Audience = 'team' | 'forum';

type Draft = {
  audience: Audience;
  title: string;
  document: JSONContent;
  email: string;
};

const EMPTY_DRAFT: Draft = {
  audience: 'forum',
  title: '',
  document: EMPTY_DOCUMENT,
  email: '',
};

type Status = 'idle' | 'sending' | 'failed';

/** The first message a shared validation rule gives for `value`, if any. */
function firstIssue(schema: ZodMiniType, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

export type FeedbackResponse = {
  /** What the user wrote, as markdown. */
  feedback: string;
  /** The address the user left for a reply, if any. */
  email?: string;
};

type TriggerElementProps = {
  'onClick'?: () => void;
  'aria-haspopup'?: 'dialog';
  'aria-label'?: string;
  'lang'?: string;
  'children'?: ReactNode;
};

export type FeedbackDialogProps = {
  /**
   * Called with the response when the user sends it privately. A returned
   * promise is awaited: Send waits for it, and if it rejects the form stays,
   * with what the user wrote, under a line saying it could not be sent.
   */
  onSubmit: (response: FeedbackResponse) => void | Promise<void>;
  /** Called each time the dialog opens. */
  onShown?: () => void;
  /** The most characters the feedback may run to, counted as markdown. */
  maxLength?: number;
  /**
   * Whether the trigger shows its label beside the icon. An icon-only
   * trigger is named "Feedback" in a tooltip.
   */
  display?: 'label' | 'icon';
  /** The trigger's `Button` look, so it can match the controls beside it. */
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
  size?: ButtonProps['size'];
  /** Extra classes for the trigger button. */
  className?: string;
  /**
   * The trigger element, in place of the `Button` that `variant`, `color`,
   * `size` and `className` style: for a host whose bar dresses its own
   * controls. The icon, and the label unless `display` is `icon`, are its
   * children.
   */
  renderTrigger?: ReactElement<TriggerElementProps>;
  /** Open on first render; for documentation, hosts never need it. */
  defaultOpen?: boolean;
};

type FeedbackTriggerProps = Pick<
  FeedbackDialogProps,
  'display' | 'variant' | 'color' | 'size' | 'className' | 'renderTrigger'
> & { onOpen: () => void };

/** The button that opens the dialog, named in a tooltip when icon-only. */
function FeedbackTrigger({
  display,
  variant,
  color,
  size,
  className,
  renderTrigger,
  onOpen,
}: FeedbackTriggerProps) {
  const intl = useAppIntl();
  const label = intl.formatMessage(messages.trigger);
  const icon = <MessageSquareText aria-hidden />;
  const opens = { 'onClick': onOpen, 'aria-haspopup': 'dialog' } as const;

  if (display !== 'icon') {
    return renderTrigger ? (
      cloneElement(renderTrigger, {
        ...opens,
        children: (
          <>
            {icon}
            <span>{label}</span>
          </>
        ),
      })
    ) : (
      <Button
        {...opens}
        variant={variant}
        color={color}
        size={size}
        icon={icon}
        className={className}
      >
        {label}
      </Button>
    );
  }

  const named = { ...opens, 'aria-label': TRIGGER_NAME, 'lang': 'en' };
  const trigger = renderTrigger ? (
    cloneElement(renderTrigger, { ...named, children: icon })
  ) : (
    <IconButton
      {...named}
      variant={variant}
      color={color}
      size={size}
      icon={icon}
      className={className}
    />
  );

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** A link to the forum's new-topic composer, dressed as a button. */
function ForumLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      asChild
      color="primary"
      icon={<ExternalLink aria-hidden />}
      iconPosition="right"
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    </Button>
  );
}

/**
 * A button that opens a dialog for feedback about the app. It opens on the
 * community forum as a new topic in the Feedback & Feature Requests section for
 * the person to post, unless they switch it to go privately to the team, with
 * an optional email for a reply.
 * Hosts own where a private response goes and the button's look; the copy is
 * shared.
 */
export default function FeedbackDialog({
  onSubmit,
  onShown,
  maxLength,
  display = 'label',
  variant = 'text',
  color = 'dynamic',
  size = 'sm',
  className,
  renderTrigger,
  defaultOpen = false,
}: FeedbackDialogProps) {
  const intl = useAppIntl();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const { add: addToast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // The editor keeps its own content once mounted; a new key empties it.
  const [editorKey, setEditorKey] = useState(0);
  const [emailChecked, setEmailChecked] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  // Set once a send succeeds. The form is emptied after the dialog has
  // finished closing, so it does not turn empty while it is still on screen.
  const sentRef = useRef(false);

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const emailRule = useMemo(
    () => validations.email(undefined, undefined, intl)(),
    [intl],
  );
  const lengthRule = useMemo(
    () =>
      maxLength === undefined
        ? undefined
        : validations.maxLength(maxLength, undefined, intl)({}),
    [maxLength, intl],
  );

  const feedback = useMemo(
    () => feedbackMarkdown(draft.document),
    [draft.document],
  );
  const address = draft.email.trim();
  const lengthError = lengthRule && firstIssue(lengthRule, feedback);
  const emailError = firstIssue(emailRule, address || undefined);
  const hasFeedback = feedback !== '';
  const toForum = draft.audience === 'forum';
  const sending = status === 'sending';
  const title = draft.title.trim();
  const forumUrl = forumTopicUrl({ title, body: feedback });
  // The forum cannot open a link longer than this, which a post in a
  // non-Latin script reaches well within `maxLength`.
  const forumError =
    toForum && forumUrl.length > FORUM_TOPIC_URL_MAX_LENGTH
      ? intl.formatMessage(messages.postTooLongForForum)
      : undefined;
  const feedbackError = lengthError ?? forumError;

  // Only a sent form starts again. A draft, a send still under way and a
  // failed send are all kept, and so is a draft handed to the forum, which may
  // need opening again after the forum asks the person to sign in.
  const resetIfSent = () => {
    if (!sentRef.current) return;
    sentRef.current = false;
    setDraft(EMPTY_DRAFT);
    setEditorKey((key) => key + 1);
    setEmailChecked(false);
    setStatus('idle');
  };

  const openDialog = () => {
    // Also here, for a dialog opened again before it finished closing.
    resetIfSent();
    setOpen(true);
    onShown?.();
  };
  const close = () => setOpen(false);

  const handleSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setEmailChecked(true);
    if (toForum || !hasFeedback || sending || lengthError || emailError) return;
    setStatus('sending');
    try {
      await onSubmit(
        address === '' ? { feedback } : { feedback, email: address },
      );
      // The form keeps its sending state until the dialog has closed.
      sentRef.current = true;
      setOpen(false);
      addToast({
        title: intl.formatMessage(messages.thanks),
        variant: 'success',
      });
    } catch {
      setStatus('failed');
    }
  };

  const footer = (
    <>
      <Button onClick={close}>
        {intl.formatMessage(commonMessages.cancel)}
      </Button>
      {toForum && hasFeedback && !feedbackError ? (
        <ForumLink href={forumUrl}>
          {intl.formatMessage(messages.continueOnForum)}
        </ForumLink>
      ) : (
        <Button
          type="submit"
          form={formId}
          color="primary"
          disabled={!hasFeedback || sending || toForum}
          icon={toForum ? <ExternalLink aria-hidden /> : <Send aria-hidden />}
          iconPosition="right"
        >
          {intl.formatMessage(
            toForum ? messages.continueOnForum : messages.send,
          )}
        </Button>
      )}
    </>
  );

  return (
    <>
      <FeedbackTrigger
        display={display}
        variant={variant}
        color={color}
        size={size}
        className={className}
        renderTrigger={renderTrigger}
        onOpen={openDialog}
      />
      <Dialog
        open={open}
        closeDialog={close}
        initialFocus={() =>
          formRef.current?.querySelector<HTMLElement>('[contenteditable]') ??
          null
        }
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
        footer={footer}
        onExitComplete={resetIfSent}
      >
        <form
          ref={formRef}
          id={formId}
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col"
        >
          <UnconnectedField
            name="audience"
            label={intl.formatMessage(messages.audienceLabel)}
            hint={
              <AppMessage
                message={messages.audienceHint}
                values={{ link: communityForumLink }}
              />
            }
            component={SegmentedSwitcherField<Audience>}
            size="sm"
            value={draft.audience}
            onChange={(audience) => audience && update({ audience })}
            readOnly={sending}
            options={[
              {
                value: 'forum',
                label: intl.formatMessage(messages.audienceForum),
                icon: Users,
              },
              {
                value: 'team',
                label: intl.formatMessage(messages.audienceTeam),
                icon: Lock,
              },
            ]}
          />
          {toForum && (
            <UnconnectedField
              name="postTitle"
              label={intl.formatMessage(messages.postTitleLabel)}
              component={InputField}
              placeholder={intl.formatMessage(messages.postTitlePlaceholder)}
              value={draft.title}
              onChange={(next) => update({ title: next ?? '' })}
            />
          )}
          <UnconnectedField
            key={editorKey}
            name="feedback"
            label={intl.formatMessage(
              toForum ? messages.postLabel : messages.feedbackLabel,
            )}
            component={RichTextEditorField}
            value={draft.document}
            onChange={(document) =>
              update({ document: document ?? EMPTY_DOCUMENT })
            }
            changeMode="input"
            placeholder={intl.formatMessage(messages.feedbackPlaceholder)}
            emojiMenu={false}
            toolbarOptions={{
              headings: false,
              links: false,
              thematicBreak: false,
            }}
            readOnly={sending}
            className="[&_.ProseMirror]:min-h-40"
            errors={feedbackError ? [feedbackError] : undefined}
            showErrors={Boolean(feedbackError)}
          />
          {!toForum && (
            <UnconnectedField
              name="email"
              label={intl.formatMessage(messages.emailLabel)}
              hint={intl.formatMessage(messages.emailHint)}
              component={InputField}
              type="email"
              autoComplete="email"
              value={draft.email}
              onChange={(email) => update({ email: email ?? '' })}
              onBlur={() => setEmailChecked(true)}
              readOnly={sending}
              errors={emailError && emailChecked ? [emailError] : undefined}
              showErrors={Boolean(emailError && emailChecked)}
            />
          )}
          {status === 'failed' && !toForum && (
            <FormErrors
              errors={[intl.formatMessage(formMessages.submitFailed)]}
            />
          )}
        </form>
      </Dialog>
    </>
  );
}
