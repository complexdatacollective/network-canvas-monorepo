import { Plus, X } from 'lucide-react';
import {
  type RefObject,
  useCallback,
  useContext,
  useEffect,
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
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FinalFocusTarget } from '@codaco/fresco-ui/utils/finalFocus';
import { REVIEW_LIMITS } from '@codaco/protocol-review-worker/contract';
import {
  STUDY_ADMINISTRATION_MODES,
  STUDY_CONTEXT_LIMITS,
  type StudyAdministrationMode,
} from '@codaco/shared-consts';
import { useAppDispatch, useAppSelector, useAppStore } from '~/ducks/hooks';
import { setProtocolReviewStudyContext } from '~/ducks/modules/activeProtocol';
import { getProtocolLockState } from '~/ducks/modules/app';
import {
  getShareProtocolReviews,
  setShareReviews,
} from '~/ducks/modules/protocolReview';
import {
  completeStudyContext,
  type StudyDetailsDraft,
} from '~/protocolReview/settings';
import { getProtocolReviewStudyDetailsDraft } from '~/selectors/protocol';
import { refusedCommitMessage } from '~/utils/protocolLockMessages';

const messages = defineMessages({
  wizardTitle: {
    id: 'architect.protocolReview.wizard.title',
    defaultMessage: 'Study details',
    description:
      'Name of the four-step dialog in which a researcher describes their study for the automated protocol review.',
  },
  questionsTitle: {
    id: 'architect.protocolReview.wizard.questions.title',
    defaultMessage: 'What are your research questions?',
    description:
      'Heading of the first step of the study details dialog for the automated protocol review.',
  },
  questionsDescription: {
    id: 'architect.protocolReview.wizard.questions.description',
    defaultMessage:
      'We ask for this information so that the automated reviewer understands the overall objective of your study, and can check for things you might have missed, or problems with how you are capturing data. Only include research questions that are related to your Network Canvas interview.',
    description:
      'Explanation under the heading of the research questions step of the study details dialog. "Network Canvas" is a product name and is not translated.',
  },
  questionLabel: {
    id: 'architect.protocolReview.wizard.questions.questionLabel',
    defaultMessage: 'Research question {number, number}',
    description:
      'Label of one research question’s text box in the study details dialog. {number} counts the questions from 1.',
  },
  questionRequired: {
    id: 'architect.protocolReview.wizard.questions.required',
    defaultMessage: 'Write a research question here, or remove this one.',
    description:
      'Error under an empty research question box in the study details dialog, when the researcher tries to continue.',
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
      'Button under the research questions in the study details dialog that adds another, empty, question.',
  },
  questionLimit: {
    id: 'architect.protocolReview.wizard.questions.limit',
    defaultMessage: 'Up to {max, number} characters each',
    description:
      'Note under the research questions in the study details dialog, saying how long each question may be. {max} is a number of characters.',
  },
  participantsTitle: {
    id: 'architect.protocolReview.wizard.participants.title',
    defaultMessage: 'Who takes part, and how?',
    description:
      'Heading of the second step of the study details dialog for the automated protocol review.',
  },
  participantsDescription: {
    id: 'architect.protocolReview.wizard.participants.description',
    defaultMessage:
      'We ask for information about your participants and how your interview will be administered so that the agent can identify issues with how tasks are explained, and the wording of prompts.',
    description:
      'Explanation under the heading of the participants step of the study details dialog. "The agent" is the automated reviewer.',
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
  synopsisTitle: {
    id: 'architect.protocolReview.wizard.synopsis.title',
    defaultMessage: 'Describe the study',
    description:
      'Heading of the third, optional, step of the study details dialog for the automated protocol review.',
  },
  synopsisDescription: {
    id: 'architect.protocolReview.wizard.synopsis.description',
    defaultMessage:
      'This step is optional. Anything you state here, such as a reference period or a named instrument, is treated as decided and will not be questioned.',
    description:
      'Explanation under the heading of the synopsis step of the study details dialog.',
  },
  synopsisLabel: {
    id: 'architect.protocolReview.wizard.synopsis.label',
    defaultMessage: 'Study synopsis (optional)',
    description: 'Label of the optional text box describing the study.',
  },
  synopsisHint: {
    id: 'architect.protocolReview.wizard.synopsis.hint',
    defaultMessage:
      'Setting, design, sampling, reference period and any instruments you plan to use.',
    description: 'Hint under the Study synopsis label.',
  },
  synopsisLimit: {
    id: 'architect.protocolReview.wizard.synopsis.limit',
    defaultMessage: 'Up to {max, number} characters',
    description:
      'Note under the Study synopsis box saying how long it may be. {max} is a number of characters.',
  },
  sendingTitle: {
    id: 'architect.protocolReview.wizard.sending.title',
    defaultMessage: 'Before your protocol is sent',
    description:
      'Heading of the last step of the study details dialog, which says what the automated protocol review sends and keeps.',
  },
  sendingDescription: {
    id: 'architect.protocolReview.wizard.sending.description',
    defaultMessage:
      'Protocol review runs on a Network Canvas service, which passes your protocol to the provider you choose for each review, Anthropic or OpenAI, to be read by its AI model.',
    description:
      'Explanation under the heading of the last step of the study details dialog. A provider is the company whose AI model writes the review; the researcher chooses one each time they start a review. "Network Canvas", "Anthropic" and "OpenAI" are names and are not translated.',
  },
  whatIsSent: {
    id: 'architect.protocolReview.wizard.sending.whatIsSent',
    defaultMessage: 'What is sent',
    description:
      'Heading of the list of what the automated protocol review sends to the review service.',
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
    defaultMessage: 'Your study details from the first three steps',
    description:
      'Item in the list of what is sent for review, shown on the fourth and last step of the study details wizard. The first three steps are where the researcher typed the study details.',
  },
  whatIsNeverSent: {
    id: 'architect.protocolReview.wizard.sending.whatIsNeverSent',
    defaultMessage: 'What is never sent',
    description:
      'Heading of the list of what the automated protocol review never sends.',
  },
  neverResources: {
    id: 'architect.protocolReview.wizard.sending.neverResources',
    defaultMessage: 'Images, video, audio and other resources',
    description: 'Item in the list of what is never sent for review.',
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
  notKept: {
    id: 'architect.protocolReview.wizard.sending.notKept',
    defaultMessage:
      'The service does not keep your protocol or the review. Your study details are saved in this protocol file, so anyone you share the protocol with can read them.',
    description:
      'Closing note of the last step of the study details dialog, under the two lists.',
  },
  shareLabel: {
    id: 'architect.protocolReview.wizard.sending.shareLabel',
    defaultMessage: 'Share my reviews with the Network Canvas team',
    description:
      'Label of the checkbox that lets the Network Canvas team keep this protocol’s reviews. "Network Canvas" is a product name and is not translated.',
  },
  shareHint: {
    id: 'architect.protocolReview.wizard.sending.shareHint',
    defaultMessage:
      'If you tick this, we keep each protocol you send, your study details and the problems found. We keep them for {days, plural, one {# day} other {# days}} and use them only to improve this feature. You can change this at any time from the Review protocol button.',
    description:
      'Explanation under the share checkbox. {days} is how long shared reviews are kept. "Review protocol" is the name of the toolbar button that opens the review.',
  },
  startReview: {
    id: 'architect.protocolReview.wizard.startReview',
    defaultMessage: 'Start review',
    description:
      'Last button of the study details dialog the first time it is filled in: saves the details and starts the automated protocol review.',
  },
  save: {
    id: 'architect.protocolReview.wizard.save',
    defaultMessage: 'Save',
    description:
      'Last button of the study details dialog when it was opened to edit details already saved: saves them without starting a review.',
  },
});

const QUESTION_KEYS = 'researchQuestionKeys';
const POPULATION = 'population';
const ADMINISTRATION = 'administration';
const SYNOPSIS = 'synopsis';
const SHARE = 'shareReviews';

const questionField = (key: string) => `researchQuestion-${key}`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isAdministrationMode = (
  value: unknown,
): value is StudyAdministrationMode =>
  STUDY_ADMINISTRATION_MODES.some((mode) => mode === value);

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

function QuestionsStep() {
  const intl = useAppIntl();
  const { data, setStepData } = useWizard();
  const draft = useAppSelector(getProtocolReviewStudyDetailsDraft);
  const root = useRef<HTMLDivElement>(null);
  useFocusFirstErrorOnRefusal(root);

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
    <div ref={root} className="flex flex-col gap-4">
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
                  required={intl.formatMessage(messages.questionRequired)}
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
        maxLength={STUDY_CONTEXT_LIMITS.synopsis}
      />
    </div>
  );
}

function SendingStep() {
  const intl = useAppIntl();
  const store = useAppStore();
  const { data, setBeforeNext } = useWizard();
  const shared = useAppSelector(getShareProtocolReviews);
  const stored = data[SHARE];

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

  return (
    <div className="flex flex-col gap-4">
      <StepIntro text={intl.formatMessage(messages.sendingDescription)} />
      {refusal !== null && (
        <Alert variant="warning" className="my-0">
          <AlertDescription>{refusal}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 @min-[36rem]:grid-cols-2">
        <section>
          <Heading level="h3" margin="none" className="mb-2 text-lg">
            {intl.formatMessage(messages.whatIsSent)}
          </Heading>
          <ul className="m-0 flex list-disc flex-col gap-1 ps-6">
            <li>{intl.formatMessage(messages.sentStages)}</li>
            <li>{intl.formatMessage(messages.sentCodebook)}</li>
            <li>{intl.formatMessage(messages.sentStudyDetails)}</li>
          </ul>
        </section>
        <section>
          <Heading level="h3" margin="none" className="mb-2 text-lg">
            {intl.formatMessage(messages.whatIsNeverSent)}
          </Heading>
          <ul className="m-0 flex list-disc flex-col gap-1 ps-6">
            <li>{intl.formatMessage(messages.neverResources)}</li>
            <li>{intl.formatMessage(messages.neverRosters)}</li>
            <li>{intl.formatMessage(messages.neverInterviewData)}</li>
          </ul>
        </section>
      </div>
      <Paragraph>{intl.formatMessage(messages.notKept)}</Paragraph>
      <Field
        name={SHARE}
        label={intl.formatMessage(messages.shareLabel)}
        hint={intl.formatMessage(messages.shareHint, {
          days: REVIEW_LIMITS.sharedReviewRetentionDays,
        })}
        inline
        component={CheckboxField}
        initialValue={typeof stored === 'boolean' ? stored : shared}
      />
    </div>
  );
}

/** What the completed wizard holds, read back into study details. */
const readWizardResult = (
  data: Record<string, unknown>,
): { draft: StudyDetailsDraft; share: boolean } => {
  const keys = data[QUESTION_KEYS];
  const researchQuestions = (isStringArray(keys) ? keys : []).map((key) =>
    textOf(data[questionField(key)], '').trim(),
  );
  const administration = data[ADMINISTRATION];
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
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether the wizard was opened to set the study details up and start the
 * first review (`start`), or to change them from the popover (`edit`).
 */
type StudyDetailsWizardPurpose = 'start' | 'edit';

/**
 * Opens the study details wizard. Nothing is written until it is completed;
 * then the details go into the protocol as one change, and the sharing
 * choice into the protocol's review record. Resolves true when it was
 * completed, false when it was cancelled.
 */
export const useStudyDetailsWizard = () => {
  const intl = useAppIntl();
  const { openDialog } = useDialog();
  const dispatch = useAppDispatch();

  return useCallback(
    async (
      purpose: StudyDetailsWizardPurpose,
      finalFocus?: FinalFocusTarget,
    ): Promise<boolean> => {
      const steps: WizardStep[] = [
        {
          title: intl.formatMessage(messages.questionsTitle),
          content: QuestionsStep,
        },
        {
          title: intl.formatMessage(messages.participantsTitle),
          content: ParticipantsStep,
        },
        {
          title: intl.formatMessage(messages.synopsisTitle),
          content: SynopsisStep,
        },
        {
          title: intl.formatMessage(messages.sendingTitle),
          content: SendingStep,
          nextLabel: intl.formatMessage(
            purpose === 'start' ? messages.startReview : messages.save,
          ),
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
      const { draft, share } = readWizardResult(result);
      const studyContext = completeStudyContext(draft);
      // Every step validated what it holds, so this is complete; a draft that
      // is not would be a fault in the steps, and writes nothing.
      if (!studyContext) return false;
      dispatch(setProtocolReviewStudyContext(studyContext));
      await dispatch(setShareReviews(share));
      return true;
    },
    [dispatch, intl, openDialog],
  );
};
