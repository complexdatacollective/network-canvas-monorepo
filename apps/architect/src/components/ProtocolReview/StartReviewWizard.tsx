import { Plus, X } from 'lucide-react';
import {
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import type { WizardStep } from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Field from '@codaco/fresco-ui/form/Field/Field';
import CheckboxField from '@codaco/fresco-ui/form/fields/Checkbox';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FinalFocusTarget } from '@codaco/fresco-ui/utils/finalFocus';
import {
  REVIEW_LIMITS,
  REVIEW_PROVIDER_NAMES,
  REVIEW_PROVIDERS,
  type ReviewProvider,
} from '@codaco/protocol-review-worker/contract';
import {
  STUDY_ADMINISTRATION_MODES,
  STUDY_CONTEXT_LIMITS,
  type StudyAdministrationMode,
} from '@codaco/shared-consts';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import { setProtocolReviewStudyContext } from '~/ducks/modules/activeProtocol';
import { getProtocolLockState } from '~/ducks/modules/app';
import {
  chooseReviewProvider,
  getShareReviewsChoice,
  refreshReviewProviders,
  reviewProviderFor,
  setShareReviews,
} from '~/ducks/modules/protocolReview';
import {
  completeStudyContext,
  type StudyDetailsDraft,
} from '~/protocolReview/settings';
import { getProtocolReviewStudyDetailsDraft } from '~/selectors/protocol';
import { refusedCommitMessage } from '~/utils/protocolLockMessages';

import { formatWhen } from './reviewText';
import { useReviewAvailability } from './useReviewAvailability';

const messages = defineMessages({
  wizardTitle: {
    id: 'architect.protocolReview.wizard.title',
    defaultMessage: 'Review protocol',
    description:
      'Name of the five-step dialog a researcher goes through each time they ask for an automated protocol review.',
  },
  beforeTitle: {
    id: 'architect.protocolReview.wizard.before.title',
    defaultMessage: 'Before you use this feature',
    description:
      'Heading of the first step of the dialog that starts an automated protocol review. It says what the feature does, what it sends, and asks whether the review may be shared.',
  },
  beforeDescription: {
    id: 'architect.protocolReview.wizard.before.description',
    defaultMessage:
      'This experimental feature uses LLMs (also known as ‘AI’) to generate review feedback to help you improve your protocol. To use this feature, your protocol must be sent to one of the providers we support (Anthropic and OpenAI). Ensure that you are permitted to do this by your IRB or ethics review body.',
    description:
      'Text of the first step of the dialog that starts an automated protocol review. An LLM is a large language model. "Anthropic" and "OpenAI" are company names and are not translated. An IRB is an institutional review board, the body that approves research involving people.',
  },
  sentTable: {
    id: 'architect.protocolReview.wizard.before.sentTable',
    defaultMessage: 'What is sent for review, and what is never sent',
    description:
      'Accessible name, read by screen readers, of the two-column table listing what the automated protocol review sends and what it never sends.',
  },
  whatIsSent: {
    id: 'architect.protocolReview.wizard.sending.whatIsSent',
    defaultMessage: 'What is sent',
    description:
      'Column heading of the list of what the automated protocol review sends to the review service.',
  },
  sentStages: {
    id: 'architect.protocolReview.wizard.sending.sentStages',
    defaultMessage: 'Stage names, prompts, forms and skip logic',
    description: 'Item in the list of what is sent for review.',
  },
  sentCodebook: {
    id: 'architect.protocolReview.wizard.sending.sentCodebook',
    defaultMessage:
      'The codebook: node types, edge types, attributes and their options',
    description:
      'Item in the list of what is sent for review. "Codebook" is the name of a page in Architect.',
  },
  sentStudyDetails: {
    id: 'architect.protocolReview.wizard.sending.sentStudyDetails',
    defaultMessage: 'The study details you give in the next three steps',
    description:
      'Item in the list of what is sent for review, shown on the first step of the dialog. The next three steps are where the researcher describes their study.',
  },
  whatIsNeverSent: {
    id: 'architect.protocolReview.wizard.sending.whatIsNeverSent',
    defaultMessage: 'What is never sent',
    description:
      'Column heading of the list of what the automated protocol review never sends.',
  },
  neverResources: {
    id: 'architect.protocolReview.wizard.sending.neverResources',
    defaultMessage: 'Images, video, audio and other resources',
    description: 'Item in the list of what is never sent for review.',
  },
  neverApiKeys: {
    id: 'architect.protocolReview.wizard.sending.neverApiKeys',
    defaultMessage: 'API keys saved in your protocol',
    description:
      'Item in the list of what is never sent for review. An API key is a credential the researcher saved as a resource, for example a Mapbox key for a map stage.',
  },
  neverRosters: {
    id: 'architect.protocolReview.wizard.sending.neverRosters',
    defaultMessage: 'Roster data files',
    description: 'Item in the list of what is never sent for review.',
  },
  neverInterviewData: {
    id: 'architect.protocolReview.wizard.sending.neverInterviewData',
    defaultMessage: 'Interview data. Architect never holds any.',
    description:
      'Item in the list of what is never sent for review. "Architect" is the product name and is not translated.',
  },
  shareLabel: {
    id: 'architect.protocolReview.wizard.sending.shareLabel',
    defaultMessage:
      'Share the results of this review with the Network Canvas team',
    description:
      'Label of the checkbox, ticked unless the researcher unticks it, that lets the Network Canvas team keep a copy of this review. "Network Canvas" is a product name and is not translated.',
  },
  shareHint: {
    id: 'architect.protocolReview.wizard.sending.shareHint',
    defaultMessage:
      'When this is checked, the Network Canvas team will retain a copy of your study details, the protocol, and the results of the review for {days, plural, one {# day} other {# days}}. We will use this information only for the purposes of improving this feature.',
    description:
      'Explanation under the share checkbox. {days} is how long a shared review is kept. "Network Canvas" is a product name and is not translated.',
  },
  synopsisTitle: {
    id: 'architect.protocolReview.wizard.synopsis.title',
    defaultMessage: 'Describe your study',
    description:
      'Heading of the second step of the dialog that starts an automated protocol review: the first of three steps about the study.',
  },
  synopsisDescription: {
    id: 'architect.protocolReview.wizard.synopsis.description',
    defaultMessage:
      'We ask for a synopsis so that the automated reviewer understands what your study is for and how it works. Anything you state here, such as a reference period or a named instrument, is treated as decided and will not be questioned.',
    description:
      'Explanation under the heading of the synopsis step of the dialog that starts an automated protocol review.',
  },
  synopsisLabel: {
    id: 'architect.protocolReview.wizard.synopsis.label',
    defaultMessage: 'Study synopsis',
    description: 'Label of the text box describing the study.',
  },
  synopsisHint: {
    id: 'architect.protocolReview.wizard.synopsis.hint',
    defaultMessage:
      'The aims of the study, its setting, design, sampling, reference period and any instruments you plan to use.',
    description: 'Hint under the Study synopsis label.',
  },
  synopsisLimit: {
    id: 'architect.protocolReview.wizard.synopsis.limit',
    defaultMessage: 'Up to {max, number} characters',
    description:
      'Note under the Study synopsis box saying how long it may be. {max} is a number of characters.',
  },
  synopsisRequired: {
    id: 'architect.protocolReview.wizard.synopsis.required',
    defaultMessage: 'Describe your study.',
    description:
      'Error under an empty Study synopsis box when the researcher tries to continue.',
  },
  savedInFile: {
    id: 'architect.protocolReview.wizard.synopsis.savedInFile',
    defaultMessage:
      'Your study details are saved in this protocol file, so anyone you share the protocol with can read them.',
    description:
      'Note on the first of the three steps that ask about the study, saying where what the researcher types is kept.',
  },
  participantsTitle: {
    id: 'architect.protocolReview.wizard.participants.title',
    defaultMessage: 'Who takes part, and how?',
    description:
      'Heading of the third step of the dialog that starts an automated protocol review.',
  },
  participantsDescription: {
    id: 'architect.protocolReview.wizard.participants.description',
    defaultMessage:
      'We ask for information about your participants and how your interview will be administered so that the agent can identify issues with how tasks are explained, and the wording of prompts.',
    description:
      'Explanation under the heading of the participants step of the dialog that starts an automated protocol review. "The agent" is the automated reviewer.',
  },
  populationLabel: {
    id: 'architect.protocolReview.wizard.participants.populationLabel',
    defaultMessage: 'Research population',
    description:
      'Label of the text box in which the researcher describes who takes part in their study.',
  },
  populationHint: {
    id: 'architect.protocolReview.wizard.participants.populationHint',
    defaultMessage:
      'Who will be interviewed: eligibility criteria, age range, setting and how participants are recruited.',
    description: 'Hint under the Research population label.',
  },
  populationRequired: {
    id: 'architect.protocolReview.wizard.participants.populationRequired',
    defaultMessage: 'Describe who will be interviewed.',
    description:
      'Error under an empty Research population box when the researcher tries to continue.',
  },
  administrationLabel: {
    id: 'architect.protocolReview.wizard.participants.administrationLabel',
    defaultMessage: 'How is the interview administered?',
    description:
      'Label of the choice between an interview run by an interviewer and one participants complete alone.',
  },
  administrationRequired: {
    id: 'architect.protocolReview.wizard.participants.administrationRequired',
    defaultMessage: 'Choose how the interview is administered.',
    description:
      'Error under the administration choice when neither option is chosen and the researcher tries to continue.',
  },
  faceToFace: {
    id: 'architect.protocolReview.wizard.participants.faceToFace',
    defaultMessage: 'Face to face',
    description:
      'Option: an interviewer is with the participant during the interview.',
  },
  faceToFaceDescription: {
    id: 'architect.protocolReview.wizard.participants.faceToFaceDescription',
    defaultMessage:
      'An interviewer sits with the participant and can explain each task.',
    description: 'Explanation under the Face to face option.',
  },
  selfAdministered: {
    id: 'architect.protocolReview.wizard.participants.selfAdministered',
    defaultMessage: 'Self-administered',
    description: 'Option: participants complete the interview on their own.',
  },
  selfAdministeredDescription: {
    id: 'architect.protocolReview.wizard.participants.selfAdministeredDescription',
    defaultMessage:
      'Participants complete the interview on their own, remotely or on a device handed to them.',
    description: 'Explanation under the Self-administered option.',
  },
  questionsTitle: {
    id: 'architect.protocolReview.wizard.questions.title',
    defaultMessage: 'What are your research questions?',
    description:
      'Heading of the fourth step of the dialog that starts an automated protocol review. The step is optional.',
  },
  questionsDescription: {
    id: 'architect.protocolReview.wizard.questions.description',
    defaultMessage:
      'Research questions are optional, but recommended. With them, the automated reviewer can check whether your interview collects what each question needs. Without them, the problems it finds will be less specific. Only include research questions that are related to your Network Canvas interview.',
    description:
      'Explanation under the heading of the research questions step of the dialog that starts an automated protocol review. "Network Canvas" is a product name and is not translated.',
  },
  questionLabel: {
    id: 'architect.protocolReview.wizard.questions.questionLabel',
    defaultMessage: 'Research question {number, number}',
    description:
      'Label of one research question’s text box. {number} counts the questions from 1.',
  },
  removeQuestion: {
    id: 'architect.protocolReview.wizard.questions.remove',
    defaultMessage: 'Remove research question {number, number}',
    description:
      'Accessible name of the button beside a research question that removes it from the list. {number} counts the questions from 1.',
  },
  addQuestion: {
    id: 'architect.protocolReview.wizard.questions.add',
    defaultMessage: 'Add a research question',
    description:
      'Button under the research questions that adds another, empty, question.',
  },
  questionLimit: {
    id: 'architect.protocolReview.wizard.questions.limit',
    defaultMessage:
      'Up to {max, number} characters each. A box left empty is not sent.',
    description:
      'Note under the research questions, saying how long each question may be and that an empty one is ignored. {max} is a number of characters.',
  },
  modelTitle: {
    id: 'architect.protocolReview.wizard.model.title',
    defaultMessage: 'Choose a model',
    description:
      'Heading of the last step of the dialog that starts an automated protocol review: the choice of which AI model writes the review.',
  },
  modelDescription: {
    id: 'architect.protocolReview.wizard.model.description',
    defaultMessage:
      'Your protocol and study details are sent to the provider of the model you choose, and that model writes the review. A review can take several minutes.',
    description:
      'Explanation under the heading of the last step of the dialog that starts an automated protocol review. A provider is the company that makes an AI model (Anthropic or OpenAI).',
  },
  modelLabel: {
    id: 'architect.protocolReview.wizard.model.label',
    defaultMessage: 'Model',
    description:
      'Label of the choice between the AI models that can write the review.',
  },
  modelBy: {
    id: 'architect.protocolReview.wizard.model.by',
    defaultMessage: 'Made by {company}',
    description:
      'Line under a model’s name in the choice of AI model. {company} is the company that makes it, "Anthropic" or "OpenAI", and is not translated.',
  },
  modelSpentUntil: {
    id: 'architect.protocolReview.wizard.model.spentUntil',
    defaultMessage:
      'The budget for {company} has been spent. It starts again {when}.',
    description:
      'Why a model cannot be chosen to write the review. {company} is the company that makes it, "Anthropic" or "OpenAI", and is not translated; {when} is a moment such as "tomorrow at 01:00" or "1 Dec 2026 at 01:00".',
  },
  modelSpent: {
    id: 'architect.protocolReview.wizard.model.spent',
    defaultMessage: 'The budget for {company} has been spent.',
    description:
      'Why a model cannot be chosen to write the review, when the service did not say when its budget starts again. {company} is the company that makes it, "Anthropic" or "OpenAI", and is not translated.',
  },
  allSpent: {
    id: 'architect.protocolReview.wizard.model.allSpent',
    defaultMessage:
      'This is a free experimental service with a fixed budget for each provider, shared by everyone who uses it. Every provider’s budget has been spent, so a review cannot start for now. Save your study details now, and start the review once a budget starts again.',
    description:
      'Notice on the last step of the dialog that starts an automated protocol review, when no model can be chosen because every provider’s budget is spent. The button below it then reads "Save details" in place of "Start review".',
  },
  offline: {
    id: 'architect.protocolReview.wizard.model.offline',
    defaultMessage:
      'You’re offline. Protocol review needs an internet connection; you can start the review when you are back online.',
    description:
      'Notice on the last step of the dialog that starts an automated protocol review, when there is no internet connection.',
  },
  quota: {
    id: 'architect.protocolReview.wizard.model.quota',
    defaultMessage:
      '{remaining, number} of {limit, number} reviews left this hour',
    description:
      'Note on the last step of the dialog that starts an automated protocol review: how many reviews the researcher may still start this hour.',
  },
  startReview: {
    id: 'architect.protocolReview.wizard.startReview',
    defaultMessage: 'Start review',
    description:
      'Last button of the dialog that starts an automated protocol review: saves the study details and starts the review.',
  },
  saveDetails: {
    id: 'architect.protocolReview.wizard.saveDetails',
    defaultMessage: 'Save details',
    description:
      'Last button of the dialog that starts an automated protocol review, in place of "Start review" when no review can start because every provider’s budget is spent: saves the study details the researcher entered, so they are filled in next time, and starts nothing.',
  },
});

const QUESTION_KEYS = 'researchQuestionKeys';
const POPULATION = 'population';
const ADMINISTRATION = 'administration';
const SYNOPSIS = 'synopsis';
const SHARE = 'shareReviews';
const PROVIDER = 'provider';

const questionField = (key: string) => `researchQuestion-${key}`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isAdministrationMode = (
  value: unknown,
): value is StudyAdministrationMode =>
  STUDY_ADMINISTRATION_MODES.some((mode) => mode === value);

const isReviewProvider = (value: unknown): value is ReviewProvider =>
  REVIEW_PROVIDERS.some((provider) => provider === value);

const textOf = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : fallback;

/**
 * Sends focus to the first invalid field once Continue has been refused. The
 * wizard validates the step's fields itself and only scrolls to the first
 * error; this answers the moment that validation ends with errors.
 */
const useFocusFirstErrorOnRefusal = (root: RefObject<HTMLElement | null>) => {
  const store = useContext(FormStoreContext);
  useEffect(
    () =>
      store?.subscribe((state, previous) => {
        if (
          previous.isValidating &&
          !state.isValidating &&
          Object.keys(state.errors.fieldErrors).length > 0
        ) {
          focusFirstError(state.errors, root.current);
        }
      }),
    [store, root],
  );
};

const StepIntro = ({ text }: { text: string }) => (
  <Paragraph className="max-w-[65ch]">{text}</Paragraph>
);

const sentCell =
  'w-1/2 px-4 py-3 align-top wrap-break-word whitespace-normal last:w-1/2';

function BeforeStep() {
  const intl = useAppIntl();
  const { data } = useWizard();
  const chosen = useAppSelector(getShareReviewsChoice);
  const stored = data[SHARE];

  const sent = [
    messages.sentStages,
    messages.sentCodebook,
    messages.sentStudyDetails,
  ];
  const neverSent = [
    messages.neverResources,
    messages.neverApiKeys,
    messages.neverRosters,
    messages.neverInterviewData,
  ];
  const rows = Array.from(
    { length: Math.max(sent.length, neverSent.length) },
    (_, index) => [sent[index], neverSent[index]] as const,
  );

  return (
    <div className="flex flex-col gap-4">
      <StepIntro text={intl.formatMessage(messages.beforeDescription)} />
      {/* Two equal columns of sentences that wrap: the table's own cells
          size to their content on one line, which suits data, not prose. */}
      <Table
        aria-label={intl.formatMessage(messages.sentTable)}
        className="table-fixed"
      >
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className={sentCell}>
              {intl.formatMessage(messages.whatIsSent)}
            </TableHead>
            <TableHead scope="col" className={sentCell}>
              {intl.formatMessage(messages.whatIsNeverSent)}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([sentItem, neverItem]) => (
            <TableRow key={neverItem?.id ?? sentItem?.id} className="h-auto">
              <TableCell className={sentCell}>
                {sentItem ? intl.formatMessage(sentItem) : null}
              </TableCell>
              <TableCell className={sentCell}>
                {neverItem ? intl.formatMessage(neverItem) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Field
        name={SHARE}
        label={intl.formatMessage(messages.shareLabel)}
        hint={intl.formatMessage(messages.shareHint, {
          days: REVIEW_LIMITS.sharedReviewRetentionDays,
        })}
        inline
        component={CheckboxField}
        // Ticked until the researcher unticks it; a choice they made for this
        // protocol before is the one shown.
        initialValue={typeof stored === 'boolean' ? stored : (chosen ?? true)}
      />
    </div>
  );
}

function SynopsisStep() {
  const intl = useAppIntl();
  const { data } = useWizard();
  const draft = useAppSelector(getProtocolReviewStudyDetailsDraft);
  const root = useRef<HTMLDivElement>(null);
  useFocusFirstErrorOnRefusal(root);

  return (
    <div ref={root} className="flex flex-col gap-4">
      <StepIntro text={intl.formatMessage(messages.synopsisDescription)} />
      <Field
        name={SYNOPSIS}
        label={intl.formatMessage(messages.synopsisLabel)}
        hint={
          <>
            <span className="block">
              {intl.formatMessage(messages.synopsisHint)}
            </span>
            <span className="block">
              {intl.formatMessage(messages.synopsisLimit, {
                max: STUDY_CONTEXT_LIMITS.synopsis,
              })}
            </span>
          </>
        }
        component={TextAreaField}
        rows={6}
        initialValue={textOf(data[SYNOPSIS], draft.synopsis)}
        required={intl.formatMessage(messages.synopsisRequired)}
        maxLength={STUDY_CONTEXT_LIMITS.synopsis}
      />
      <Paragraph intent="smallText" emphasis="muted" margin="none">
        {intl.formatMessage(messages.savedInFile)}
      </Paragraph>
    </div>
  );
}

function ParticipantsStep() {
  const intl = useAppIntl();
  const { data } = useWizard();
  const draft = useAppSelector(getProtocolReviewStudyDetailsDraft);
  const root = useRef<HTMLDivElement>(null);
  useFocusFirstErrorOnRefusal(root);
  const storedMode = data[ADMINISTRATION];
  const initialMode = isAdministrationMode(storedMode)
    ? storedMode
    : (draft.administration ?? undefined);

  return (
    <div ref={root} className="flex flex-col gap-4">
      <StepIntro text={intl.formatMessage(messages.participantsDescription)} />
      <Field
        name={POPULATION}
        label={intl.formatMessage(messages.populationLabel)}
        hint={intl.formatMessage(messages.populationHint)}
        component={TextAreaField}
        rows={3}
        initialValue={textOf(data[POPULATION], draft.population)}
        required={intl.formatMessage(messages.populationRequired)}
        maxLength={STUDY_CONTEXT_LIMITS.population}
      />
      <Field
        name={ADMINISTRATION}
        label={intl.formatMessage(messages.administrationLabel)}
        component={RichSelectGroupField}
        initialValue={initialMode}
        required={intl.formatMessage(messages.administrationRequired)}
        options={[
          {
            value: 'face_to_face' satisfies StudyAdministrationMode,
            label: intl.formatMessage(messages.faceToFace),
            description: intl.formatMessage(messages.faceToFaceDescription),
          },
          {
            value: 'self_administered' satisfies StudyAdministrationMode,
            label: intl.formatMessage(messages.selfAdministered),
            description: intl.formatMessage(
              messages.selfAdministeredDescription,
            ),
          },
        ]}
      />
    </div>
  );
}

function QuestionsStep() {
  const intl = useAppIntl();
  const { data, setStepData } = useWizard();
  const draft = useAppSelector(getProtocolReviewStudyDetailsDraft);

  // Each question keeps one key for as long as it is on the list, so its
  // field (and what was typed in it) follows it when another is removed.
  const [initial] = useState(() => {
    const stored = data[QUESTION_KEYS];
    if (isStringArray(stored) && stored.length > 0) {
      return { keys: stored, values: new Map<string, string>() };
    }
    const questions =
      draft.researchQuestions.length > 0 ? draft.researchQuestions : [''];
    const keys = questions.map((_, index) => `q${index}`);
    return {
      keys,
      values: new Map(keys.map((key, index) => [key, questions[index] ?? ''])),
    };
  });
  const [keys, setKeys] = useState(initial.keys);
  const nextKey = useRef(
    Math.max(
      0,
      ...initial.keys.map((key) => Number.parseInt(key.slice(1), 10) + 1),
    ),
  );
  // Set by Add and Remove, so focus moves to a box that is still there: taken
  // by that box's row as the list commits with the change. The row's ref is a
  // new function on every render, so React hands it the row on every commit.
  const focusKey = useRef<string | null>(null);

  useEffect(() => {
    setStepData({ [QUESTION_KEYS]: keys });
  }, [keys, setStepData]);

  const addQuestion = () => {
    const key = `q${nextKey.current}`;
    nextKey.current += 1;
    focusKey.current = key;
    setKeys((current) => [...current, key]);
  };

  const removeQuestion = (key: string) => {
    const index = keys.indexOf(key);
    const remaining = keys.filter((candidate) => candidate !== key);
    focusKey.current = remaining[Math.min(index, remaining.length - 1)] ?? null;
    setKeys(remaining);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepIntro text={intl.formatMessage(messages.questionsDescription)} />
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {keys.map((key, index) => {
          const name = questionField(key);
          return (
            <li
              key={key}
              className="flex items-start gap-2"
              ref={(row) => {
                if (row === null || focusKey.current !== key) return;
                focusKey.current = null;
                row.querySelector('textarea')?.focus({ preventScroll: true });
                // The browser's own scroll on focus stops as soon as part of
                // the box shows; the whole row should.
                row.scrollIntoView({ block: 'nearest' });
              }}
            >
              <div className="min-w-0 flex-1">
                {/* Not required: a box left empty is simply not sent. */}
                <Field
                  name={name}
                  label={intl.formatMessage(messages.questionLabel, {
                    number: index + 1,
                  })}
                  component={TextAreaField}
                  rows={2}
                  initialValue={textOf(
                    data[name],
                    initial.values.get(key) ?? '',
                  )}
                  maxLength={STUDY_CONTEXT_LIMITS.researchQuestion}
                />
              </div>
              {keys.length > 1 && (
                <IconButton
                  icon={<X />}
                  variant="text"
                  className="mt-8"
                  aria-label={intl.formatMessage(messages.removeQuestion, {
                    number: index + 1,
                  })}
                  onClick={() => removeQuestion(key)}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button icon={<Plus />} onClick={addQuestion}>
          {intl.formatMessage(messages.addQuestion)}
        </Button>
        <Paragraph intent="smallText" emphasis="muted" margin="none">
          {intl.formatMessage(messages.questionLimit, {
            max: STUDY_CONTEXT_LIMITS.researchQuestion,
          })}
        </Paragraph>
      </div>
    </div>
  );
}

function ModelStep() {
  const intl = useAppIntl();
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const { data, setStepData, setBeforeNext, setNextEnabled, setNextLabel } =
    useWizard();
  const { now, online, limit, remaining, providers } = useReviewAvailability();
  const lastChosen = useAppSelector((state) => state.protocolReview.provider);
  const labelId = useId();

  // Which providers have budget left is the service's to say, so it is asked
  // each time this step opens, and again when the connection comes back.
  useEffect(() => {
    if (online) void dispatch(refreshReviewProviders());
  }, [dispatch, online]);

  const anyAvailable = providers.some((choice) => choice.available);
  useEffect(() => {
    setNextEnabled(online);
    return () => setNextEnabled(true);
  }, [online, setNextEnabled]);

  // With every budget spent no review can start, perhaps not until next
  // month, and what was typed in the earlier steps lives only in this dialog.
  // The button then saves it instead: the dialog completes as usual, the
  // review that follows is refused for want of a budget, and the panel says
  // when one starts again.
  const allSpent = online && !anyAvailable;
  useEffect(() => {
    setNextLabel(allSpent ? intl.formatMessage(messages.saveDetails) : null);
    return () => setNextLabel(null);
  }, [allSpent, intl, setNextLabel]);

  // Completing the wizard writes the study details into the protocol, a write
  // only the tab that owns the saved copy can keep. Another tab can take the
  // protocol while the wizard sits open, so ownership is asked for at the
  // moment the button is pressed. A refusal leaves the wizard open: what was
  // typed lives in the wizard, and survives the saved copy being read back.
  const lockState = useAppSelector(getProtocolLockState);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    setBeforeNext(() => {
      const owned = getProtocolLockState(store.getState()) === 'owned';
      setRefused(!owned);
      return owned;
    });
    return () => setBeforeNext(null);
  }, [setBeforeNext, store]);
  const refusal = refused
    ? refusedCommitMessage(lockState, 'study-details', intl)
    : null;

  // The researcher's pick starts as the model they chose last time. The one
  // shown, and asked for, is that pick while it has budget left, and the
  // first that has while it has none: which have is only known once the
  // service answers, which can be after the pick was made.
  const stored = data[PROVIDER];
  const [picked, setPicked] = useState<ReviewProvider>(() =>
    isReviewProvider(stored) ? stored : lastChosen,
  );
  const selected = reviewProviderFor(picked, providers);
  useEffect(() => {
    setStepData({ [PROVIDER]: selected });
  }, [selected, setStepData]);

  return (
    <div className="flex flex-col gap-4">
      <StepIntro text={intl.formatMessage(messages.modelDescription)} />
      {refusal !== null && (
        <Alert variant="warning" className="my-0">
          <AlertDescription>{refusal}</AlertDescription>
        </Alert>
      )}
      {!online && (
        <Alert variant="warning" className="my-0">
          <AlertDescription>
            {intl.formatMessage(messages.offline)}
          </AlertDescription>
        </Alert>
      )}
      {allSpent && (
        <Alert variant="warning" className="my-0">
          <AlertDescription>
            {intl.formatMessage(messages.allSpent)}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <span id={labelId} className="font-bold">
          {intl.formatMessage(messages.modelLabel)}
        </span>
        <RichSelectGroupField
          aria-labelledby={labelId}
          value={selected}
          onChange={(next) => {
            if (isReviewProvider(next)) setPicked(next);
          }}
          options={providers.map((choice) => {
            const { company, model } = REVIEW_PROVIDER_NAMES[choice.provider];
            // An option that cannot be chosen says why in place of who makes it.
            const description = choice.available
              ? intl.formatMessage(messages.modelBy, { company })
              : choice.retryAt === null
                ? intl.formatMessage(messages.modelSpent, { company })
                : intl.formatMessage(messages.modelSpentUntil, {
                    company,
                    when: formatWhen(intl, choice.retryAt, now),
                  });
            return {
              value: choice.provider,
              label: model,
              description,
              disabled: !choice.available,
            };
          })}
        />
      </div>
      <Paragraph intent="smallText" emphasis="muted" margin="none">
        {intl.formatMessage(messages.quota, { remaining, limit })}
      </Paragraph>
    </div>
  );
}

/** What the completed wizard holds, read back out of its fields. */
const readWizardResult = (
  data: Record<string, unknown>,
): {
  draft: StudyDetailsDraft;
  share: boolean;
  provider: ReviewProvider | null;
} => {
  const keys = data[QUESTION_KEYS];
  const researchQuestions = (isStringArray(keys) ? keys : [])
    .map((key) => textOf(data[questionField(key)], '').trim())
    .filter((question) => question !== '');
  const administration = data[ADMINISTRATION];
  const provider = data[PROVIDER];
  return {
    draft: {
      researchQuestions,
      population: textOf(data[POPULATION], '').trim(),
      administration: isAdministrationMode(administration)
        ? administration
        : null,
      synopsis: textOf(data[SYNOPSIS], '').trim(),
    },
    share: data[SHARE] === true,
    provider: isReviewProvider(provider) ? provider : null,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Opens the dialog a researcher goes through every time they ask for a
 * review: what the feature does and sends, the study details (as last saved,
 * to change or leave), and which model writes the review.
 *
 * Nothing is written until it is completed. Then the study details go into
 * the protocol as one change (none, when they are as the protocol holds them), the
 * sharing choice into the protocol's review record, and the model into this
 * browser's choice. Resolves true when it was completed, false when it was
 * cancelled; the caller starts the review.
 */
export const useStartReviewWizard = () => {
  const intl = useAppIntl();
  const { openDialog } = useDialog();
  const dispatch = useAppDispatch();

  return useCallback(
    async (finalFocus?: FinalFocusTarget): Promise<boolean> => {
      const steps: WizardStep[] = [
        {
          title: intl.formatMessage(messages.beforeTitle),
          content: BeforeStep,
        },
        {
          title: intl.formatMessage(messages.synopsisTitle),
          content: SynopsisStep,
        },
        {
          title: intl.formatMessage(messages.participantsTitle),
          content: ParticipantsStep,
        },
        {
          title: intl.formatMessage(messages.questionsTitle),
          content: QuestionsStep,
        },
        {
          title: intl.formatMessage(messages.modelTitle),
          content: ModelStep,
          nextLabel: intl.formatMessage(messages.startReview),
        },
      ];
      const result = await openDialog({
        type: 'wizard',
        title: intl.formatMessage(messages.wizardTitle),
        size: 'readable',
        finalFocus,
        steps,
      });
      if (!isRecord(result)) return false;
      const { draft, share, provider } = readWizardResult(result);
      const studyContext = completeStudyContext(draft);
      // Every step validated what it holds, so this is complete; a draft that
      // is not would be a fault in the steps, and writes nothing.
      if (!studyContext) return false;
      // Details left as they were are not a change to the protocol: the
      // protocol's history keeps no step for a write that changes nothing.
      dispatch(setProtocolReviewStudyContext(studyContext));
      await dispatch(setShareReviews(share));
      if (provider !== null) dispatch(chooseReviewProvider(provider));
      return true;
    },
    [dispatch, intl, openDialog],
  );
};
