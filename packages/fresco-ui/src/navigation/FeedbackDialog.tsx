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

import { Alert, AlertDescription } from '../Alert';
import { Button, type ButtonProps, IconButton } from '../Button';
import Dialog from '../dialogs/Dialog';
import UnconnectedField from '../form/Field/UnconnectedField';
import InputField from '../form/fields/InputField';
import RadioGroupField from '../form/fields/RadioGroup';
import RichTextEditorField from '../form/fields/RichTextEditor';
import FormErrors from '../form/FormErrors';
import { formMessages } from '../form/hooks/useForm';
import { validations } from '../form/validation/functions';
import { NativeLink } from '../NativeLink';
import SegmentedSwitcherField from '../SegmentedSwitcher/SegmentedSwitcherField';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';
import Paragraph from '../typography/Paragraph';
import {
  COMMUNITY_FORUM_URL,
  FORUM_SECTION_IDS,
  FORUM_SECTIONS,
  type ForumSection,
  forumTopicUrl,
  isForumSection,
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
      'Post on the <link>community forum</link> to report a problem, suggest an idea, or get help from other researchers. If you’d rather not post publicly, you can send your feedback privately to our team instead.',
    description:
      'Line under the title of the feedback dialog, explaining its two choices: posting the feedback publicly on the Network Canvas community forum, a discussion website for researchers who use the software, or sending it privately to the Network Canvas team. The words inside <link> link to the forum, opening it in a new tab.',
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
});

const TRIGGER_NAME = 'Feedback';
const EMPTY_DOCUMENT: JSONContent = { type: 'doc', content: [] };

const SECTION_DESCRIPTIONS = {
  feedback: messages.sectionFeedback,
  help: messages.sectionHelp,
  general: messages.sectionGeneral,
} satisfies Record<ForumSection, (typeof messages)[keyof typeof messages]>;

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
  section: ForumSection;
  title: string;
  document: JSONContent;
  email: string;
};

const EMPTY_DRAFT: Draft = {
  audience: 'team',
  section: 'feedback',
  title: '',
  document: EMPTY_DOCUMENT,
  email: '',
};

type Status = 'idle' | 'sending' | 'failed' | 'sent';

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
 * A button that opens a dialog for feedback about the app. It goes privately
 * to the team, with an optional email for a reply, unless the person switches
 * it to the community forum, where it opens as a new topic for them to post.
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
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // The editor keeps its own content once mounted; a new key empties it.
  const [editorKey, setEditorKey] = useState(0);
  const [emailChecked, setEmailChecked] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

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
  const sent = status === 'sent';
  const title = draft.title.trim();
  const forumUrl = forumTopicUrl({
    section: draft.section,
    title,
    body: feedback,
  });

  const openDialog = () => {
    // A form that was sent starts again, and only on opening, so the thanks
    // does not turn back into the form while the dialog is still closing. A
    // draft, a send still under way and a failed send are all kept, and so is
    // a draft handed to the forum, which may need opening again after the
    // forum asks the person to sign in.
    if (sent) {
      setDraft(EMPTY_DRAFT);
      setEditorKey((key) => key + 1);
      setEmailChecked(false);
      setStatus('idle');
    }
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
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  };

  const footer = sent ? (
    <Button color="primary" onClick={close}>
      {intl.formatMessage(commonMessages.close)}
    </Button>
  ) : (
    <>
      <Button onClick={close}>
        {intl.formatMessage(commonMessages.cancel)}
      </Button>
      {toForum && hasFeedback && !lengthError ? (
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
        description={
          sent ? undefined : (
            <AppMessage
              message={messages.description}
              values={{ link: communityForumLink }}
            />
          )
        }
        footer={footer}
      >
        {sent ? (
          <Paragraph
            // The thanks replaces the form, so focus moves to it.
            ref={(done: HTMLElement | null) => done?.focus()}
            tabIndex={-1}
            margin="none"
            className="focus:outline-none"
          >
            {intl.formatMessage(messages.thanks)}
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
              <>
                <UnconnectedField
                  name="section"
                  label={intl.formatMessage(messages.sectionLabel)}
                  hint={intl.formatMessage(SECTION_DESCRIPTIONS[draft.section])}
                  component={RadioGroupField}
                  orientation="horizontal"
                  size="sm"
                  value={draft.section}
                  onChange={(section) => {
                    if (isForumSection(section)) update({ section });
                  }}
                  options={FORUM_SECTION_IDS.map((value) => ({
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
                  value={draft.title}
                  onChange={(next) => update({ title: next ?? '' })}
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
              errors={lengthError ? [lengthError] : undefined}
              showErrors={Boolean(lengthError)}
            />
            {toForum ? (
              <Alert density="compact" icon={ExternalLink}>
                <AlertDescription>
                  {intl.formatMessage(messages.forumNext, {
                    category: FORUM_SECTIONS[draft.section].name,
                  })}
                </AlertDescription>
              </Alert>
            ) : (
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
        )}
      </Dialog>
    </>
  );
}
