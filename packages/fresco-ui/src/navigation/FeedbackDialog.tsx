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
  type SyntheticEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { z } from 'zod';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';

import { Button, type ButtonProps, IconButton } from '../Button';
import Dialog from '../dialogs/Dialog';
import UnconnectedField from '../form/Field/UnconnectedField';
import InputField from '../form/fields/InputField';
import RadioGroupField from '../form/fields/RadioGroup';
import RichTextEditorField from '../form/fields/RichTextEditor';
import { formMessages } from '../form/hooks/useForm';
import { messages as validationMessages } from '../form/validation/functions';
import { NativeLink } from '../NativeLink';
import SegmentedSwitcherField from '../SegmentedSwitcher/SegmentedSwitcherField';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';
import Paragraph from '../typography/Paragraph';
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
      'Send it privately to our team to report a problem or suggest an idea, or post it on the <link>community forum</link> to get help and discuss it with other researchers.',
    description:
      'Line under the title of the feedback dialog, explaining its two choices: sending the feedback privately to the Network Canvas team, or posting it publicly on the Network Canvas community forum, a discussion website for researchers who use the software. The words inside <link> link to the forum, opening it in a new tab.',
  },
  audienceLabel: {
    id: 'frescoUi.feedbackDialog.audienceLabel',
    defaultMessage: 'Who should see it?',
    description:
      'Label of the switch in the feedback dialog between sending the feedback privately to the Network Canvas team and posting it publicly on the community forum.',
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
  sectionLabel: {
    id: 'frescoUi.feedbackDialog.sectionLabel',
    defaultMessage: 'Forum section',
    description:
      'Label of the choice, shown when the user is posting on the community forum, of which section of the forum the post goes in. The options are the sections’ names on the forum, which stay in English.',
  },
  sectionFeedback: {
    id: 'frescoUi.feedbackDialog.sectionFeedback',
    defaultMessage: 'Suggestions for improving the software.',
    description:
      'What the forum section "Feedback & Feature Requests" is for, shown while it is chosen in the feedback dialog.',
  },
  sectionHelp: {
    id: 'frescoUi.feedbackDialog.sectionHelp',
    defaultMessage:
      'Get help with a problem you’re having, or report a bug to the team.',
    description:
      'What the forum section "Help & Support" is for, shown while it is chosen in the feedback dialog.',
  },
  sectionGeneral: {
    id: 'frescoUi.feedbackDialog.sectionGeneral',
    defaultMessage:
      'Talk with other researchers about anything to do with the software.',
    description:
      'What the forum section "General Conversation" is for, shown while it is chosen in the feedback dialog.',
  },
  postTitleLabel: {
    id: 'frescoUi.feedbackDialog.postTitleLabel',
    defaultMessage: 'Post title',
    description:
      'Label of the field for the title of the new topic, shown when the user is posting on the community forum.',
  },
  postTitlePlaceholder: {
    id: 'frescoUi.feedbackDialog.postTitlePlaceholder',
    defaultMessage: 'Sum it up in a few words',
    description: 'Placeholder text in the empty "Post title" field.',
  },
  feedbackPlaceholder: {
    id: 'frescoUi.feedbackDialog.feedbackPlaceholder',
    defaultMessage: 'Tell us what’s on your mind…',
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
    defaultMessage: 'Email (optional)',
    description:
      'Label of the field in the feedback dialog where the user may leave an email address so the team can reply.',
  },
  emailHint: {
    id: 'frescoUi.feedbackDialog.emailHint',
    defaultMessage:
      'Add it if you’d like a reply. Leave it blank to stay anonymous.',
    description:
      'Hint under the optional email field in the feedback dialog. Without an email the team cannot tell who sent the feedback.',
  },
  forumNext: {
    id: 'frescoUi.feedbackDialog.forumNext',
    defaultMessage:
      'The forum opens in a new tab with a draft of your post for {category}. Posting it needs a forum account.',
    description:
      'Note at the foot of the feedback dialog when the user is posting on the community forum, explaining what happens next. category is the name of a section of the forum, such as "Help & Support", and stays in English.',
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
      'Replaces the feedback form once the feedback has been sent to the Network Canvas team.',
  },
  forumOpened: {
    id: 'frescoUi.feedbackDialog.forumOpened',
    defaultMessage:
      'The forum is open in a new tab with a draft of your post. Check it and post it there.',
    description:
      'Replaces the feedback form once the community forum has been opened in a new tab. The post is not shared until the user posts it on the forum.',
  },
  openForumAgain: {
    id: 'frescoUi.feedbackDialog.openForumAgain',
    defaultMessage: 'Open the forum again',
    description:
      'Link shown after the forum was opened, in case its tab was closed or blocked. Opens the same new topic in a new tab again.',
  },
});

const TRIGGER_NAME = 'Feedback';
const COMMUNITY_FORUM_URL = 'https://community.networkcanvas.com/';
const EMPTY_DOCUMENT: JSONContent = { type: 'doc', content: [] };
const emailAddress = z.email();

const communityForumLink = (chunks: React.ReactNode) => (
  <NativeLink
    href={COMMUNITY_FORUM_URL}
    target="_blank"
    rel="noopener noreferrer"
  >
    {chunks}
  </NativeLink>
);

type Audience = 'team' | 'forum';

/**
 * The community forum's sections a person can post in, by slug and by the
 * name it shows; Announcements is the team's own. The names stay in English,
 * as the forum shows them.
 */
const FORUM_SECTIONS = {
  feedback: {
    slug: 'feedback-and-feature-requests',
    name: 'Feedback & Feature Requests',
    description: messages.sectionFeedback,
  },
  help: {
    slug: 'help-support',
    name: 'Help & Support',
    description: messages.sectionHelp,
  },
  general: {
    slug: 'general',
    name: 'General Conversation',
    description: messages.sectionGeneral,
  },
} as const;
type ForumSection = keyof typeof FORUM_SECTIONS;
const SECTIONS = [
  'feedback',
  'help',
  'general',
] as const satisfies readonly ForumSection[];
const isSection = (value: unknown): value is ForumSection =>
  SECTIONS.some((section) => section === value);

/**
 * The forum's new-topic composer, in the chosen section, with the title and
 * the feedback filled in. The person posts it there under their own account; nothing is
 * sent from here.
 */
function forumTopicUrl(title: string, feedback: string, section: ForumSection) {
  const url = new URL('new-topic', COMMUNITY_FORUM_URL);
  url.searchParams.set('category', FORUM_SECTIONS[section].slug);
  if (title !== '') url.searchParams.set('title', title);
  if (feedback !== '') url.searchParams.set('body', feedback);
  return url.toString();
}

export type FeedbackResponse = {
  /** What the user wrote, as markdown. */
  feedback: string;
  /** The address the user left for a reply, if any. */
  email?: string;
};

export type FeedbackDialogProps = {
  /**
   * Called with the response when the user sends it. A returned promise is
   * awaited: Send waits for it, and if it rejects the form stays, with what the
   * user wrote, under a line saying it could not be sent.
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
  renderTrigger?: ReactElement<{
    'onClick'?: () => void;
    'aria-haspopup'?: 'dialog';
    'aria-label'?: string;
    'lang'?: string;
    'children'?: React.ReactNode;
  }>;
  /** Open on first render; for documentation, hosts never need it. */
  defaultOpen?: boolean;
};

/**
 * A button that opens a dialog for feedback about the app. It goes privately
 * to the team, with an optional email for a reply, unless the person switches
 * it to the community forum, where it opens as a new topic for them to post. Hosts own where a private response goes and the button's
 * look; the copy is shared.
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
  const [open, setOpen] = useState(defaultOpen);
  const [audience, setAudience] = useState<Audience>('team');
  const [section, setSection] = useState<ForumSection>('feedback');
  const [postTitle, setPostTitle] = useState('');
  const [document, setDocument] = useState<JSONContent>(EMPTY_DOCUMENT);
  // The editor keeps its own content once mounted; a new key empties it.
  const [editorKey, setEditorKey] = useState(0);
  const [email, setEmail] = useState('');
  const [emailChecked, setEmailChecked] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'failed' | 'sent' | 'forum'
  >('idle');

  const feedback = feedbackMarkdown(document);
  const address = email.trim();
  const tooLong = maxLength !== undefined && feedback.length > maxLength;
  const emailInvalid =
    address !== '' && !emailAddress.safeParse(address).success;
  const hasFeedback = feedback !== '';
  const toForum = audience === 'forum';
  const forumUrl = forumTopicUrl(postTitle.trim(), feedback, section);

  const label = intl.formatMessage(messages.trigger);
  const iconOnly = display === 'icon';
  const icon = <MessageSquareText aria-hidden />;

  const openDialog = () => {
    // A form that was sent, or handed to the forum, starts again, and only on
    // opening, so what replaced it does not turn back into the form while the
    // dialog is still closing. A draft, a send still under way and a failed
    // send are all kept.
    if (status === 'sent' || status === 'forum') {
      setDocument(EMPTY_DOCUMENT);
      setEditorKey((key) => key + 1);
      setSection('feedback');
      setPostTitle('');
      setEmail('');
      setEmailChecked(false);
      setStatus('idle');
    }
    setOpen(true);
    onShown?.();
  };

  const handleSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (toForum) return;
    setEmailChecked(true);
    if (!hasFeedback || status === 'sending' || tooLong || emailInvalid) {
      return;
    }
    setStatus('sending');
    try {
      await onSubmit({
        feedback,
        ...(address === '' ? {} : { email: address }),
      });
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  };

  const triggerProps = {
    'onClick': openDialog,
    'aria-haspopup': 'dialog' as const,
  };

  const trigger = renderTrigger ? (
    cloneElement(renderTrigger, {
      ...triggerProps,
      ...(iconOnly
        ? { 'aria-label': TRIGGER_NAME, 'lang': 'en', 'children': icon }
        : {
            children: (
              <>
                {icon}
                <span>{label}</span>
              </>
            ),
          }),
    })
  ) : iconOnly ? (
    <IconButton
      {...triggerProps}
      variant={variant}
      color={color}
      size={size}
      icon={icon}
      aria-label={TRIGGER_NAME}
      lang="en"
      className={className}
    />
  ) : (
    <Button
      {...triggerProps}
      variant={variant}
      color={color}
      size={size}
      icon={icon}
      className={className}
    >
      {label}
    </Button>
  );

  const forumLink = (text: string, buttonVariant: ButtonProps['variant']) => (
    <Button
      asChild
      variant={buttonVariant}
      color={buttonVariant === 'default' ? 'primary' : undefined}
      icon={<ExternalLink aria-hidden />}
      iconPosition="right"
    >
      <a
        href={forumUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setStatus('forum')}
      >
        {text}
      </a>
    </Button>
  );

  const finished = status === 'sent' || status === 'forum';
  const close = () => setOpen(false);

  const footer =
    status === 'sent' ? (
      <Button color="primary" onClick={close}>
        {intl.formatMessage(commonMessages.close)}
      </Button>
    ) : status === 'forum' ? (
      <>
        {forumLink(intl.formatMessage(messages.openForumAgain), 'text')}
        <Button color="primary" onClick={close}>
          {intl.formatMessage(commonMessages.close)}
        </Button>
      </>
    ) : (
      <>
        <Button onClick={close}>
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
        {toForum && hasFeedback && !tooLong ? (
          forumLink(intl.formatMessage(messages.continueOnForum), 'default')
        ) : (
          <Button
            type="submit"
            form={formId}
            color="primary"
            disabled={!hasFeedback || status === 'sending' || toForum}
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
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <Dialog
        open={open}
        closeDialog={close}
        initialFocus={() =>
          formRef.current?.querySelector<HTMLElement>('[contenteditable]') ??
          null
        }
        title={intl.formatMessage(messages.title)}
        description={
          finished ? undefined : (
            <AppMessage
              message={messages.description}
              values={{ link: communityForumLink }}
            />
          )
        }
        footer={footer}
      >
        {finished ? (
          <Paragraph
            // What happened replaces the form, so focus moves to it.
            ref={(done: HTMLElement | null) => done?.focus()}
            tabIndex={-1}
            margin="none"
            className="focus:outline-none"
          >
            {intl.formatMessage(
              status === 'sent' ? messages.thanks : messages.forumOpened,
            )}
          </Paragraph>
        ) : (
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
              component={SegmentedSwitcherField<Audience>}
              size="sm"
              value={audience}
              onChange={(next) => {
                if (next !== undefined) setAudience(next);
              }}
              readOnly={status === 'sending'}
              options={[
                {
                  value: 'team',
                  label: intl.formatMessage(messages.audienceTeam),
                  icon: Lock,
                },
                {
                  value: 'forum',
                  label: intl.formatMessage(messages.audienceForum),
                  icon: Users,
                },
              ]}
            />
            {toForum && (
              <>
                <UnconnectedField
                  name="section"
                  label={intl.formatMessage(messages.sectionLabel)}
                  hint={intl.formatMessage(FORUM_SECTIONS[section].description)}
                  component={RadioGroupField}
                  orientation="horizontal"
                  size="sm"
                  value={section}
                  onChange={(next) => {
                    if (isSection(next)) setSection(next);
                  }}
                  options={SECTIONS.map((value) => ({
                    value,
                    label: {
                      text: FORUM_SECTIONS[value].name,
                      lang: 'en',
                      dir: 'ltr' as const,
                    },
                  }))}
                />
                <UnconnectedField
                  name="postTitle"
                  label={intl.formatMessage(messages.postTitleLabel)}
                  component={InputField}
                  placeholder={intl.formatMessage(
                    messages.postTitlePlaceholder,
                  )}
                  value={postTitle}
                  onChange={(next) => setPostTitle(next ?? '')}
                />
              </>
            )}
            <UnconnectedField
              key={editorKey}
              name="feedback"
              label={intl.formatMessage(
                toForum ? messages.postLabel : messages.feedbackLabel,
              )}
              component={RichTextEditorField}
              value={document}
              onChange={(next) => setDocument(next ?? EMPTY_DOCUMENT)}
              changeMode="input"
              placeholder={intl.formatMessage(messages.feedbackPlaceholder)}
              emojiMenu={false}
              toolbarOptions={{
                headings: false,
                links: false,
                thematicBreak: false,
              }}
              readOnly={status === 'sending'}
              className="[&_.ProseMirror]:min-h-40"
              errors={
                tooLong
                  ? [
                      intl.formatMessage(validationMessages.maxLengthError, {
                        max: maxLength,
                      }),
                    ]
                  : undefined
              }
              showErrors={tooLong}
            />
            {toForum ? (
              <Paragraph
                intent="smallText"
                margin="none"
                className="bg-surface-1-contrast/5 flex items-center gap-2 rounded px-4 py-3"
              >
                <ExternalLink aria-hidden className="size-4 shrink-0" />
                {intl.formatMessage(messages.forumNext, {
                  category: FORUM_SECTIONS[section].name,
                })}
              </Paragraph>
            ) : (
              <UnconnectedField
                name="email"
                label={intl.formatMessage(messages.emailLabel)}
                hint={intl.formatMessage(messages.emailHint)}
                component={InputField}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(next) => setEmail(next ?? '')}
                onBlur={() => setEmailChecked(true)}
                readOnly={status === 'sending'}
                errors={
                  emailInvalid && emailChecked
                    ? [intl.formatMessage(validationMessages.emailError)]
                    : undefined
                }
                showErrors={emailInvalid && emailChecked}
              />
            )}
            {status === 'failed' && !toForum && (
              <Paragraph
                role="alert"
                intent="smallText"
                margin="none"
                className="text-destructive-ink"
              >
                {intl.formatMessage(formMessages.submitFailed)}
              </Paragraph>
            )}
          </form>
        )}
      </Dialog>
    </>
  );
}
