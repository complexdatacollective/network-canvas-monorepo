import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import {
  type EntitySubject,
  EntitySubjectPickerField,
  type EntityTypeChangeConfirmation,
} from '../../fields/EntityTypePickerField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import { useAskStageHasAnyValue } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import NetworkFilterSection from '../network-filter/NetworkFilterSection.tsx';
import {
  useResetStageOnSubjectChange,
  useSubjectChangeDiscards,
} from './useResetStageOnSubjectChange.ts';

/** What this stage works on. Ego stages have no type to pick, so no section. */
export type SubjectEntity = EntitySubject['entity'];

const messages = defineMessages({
  nodeTitle: {
    id: 'protocolBuilder.subjectSection.nodeTitle',
    defaultMessage: 'Node setup',
    description:
      'Heading of the section where a researcher says which kind of network member this step of the interview is about. A node is one member of the network a participant describes.',
  },
  nodeDescription: {
    id: 'protocolBuilder.subjectSection.nodeDescription',
    defaultMessage: 'Choose the node type this stage creates.',
    description:
      'Description of the node-type section. A stage is one step of an interview.',
  },
  nodeFieldLabel: {
    id: 'protocolBuilder.subjectSection.nodeFieldLabel',
    defaultMessage: 'Node type',
    description:
      'Label of the control choosing which kind of network member this step of the interview is about. The same words as the section heading, and translated once for each: the heading names the part of the stage, and this names the control.',
  },
  nodeFieldHint: {
    id: 'protocolBuilder.subjectSection.nodeFieldHint',
    defaultMessage: 'Select the type of node that this stage will create.',
    description: 'Guidance under the node-type control.',
  },
  nodeChangeTitle: {
    id: 'protocolBuilder.subjectSection.nodeChangeTitle',
    defaultMessage: 'Change node type?',
    description:
      'Title of the confirmation raised when a researcher picks a different kind of network member for a stage that is already configured for the one it has.',
  },
  nodeChangeDescription: {
    id: 'protocolBuilder.subjectSection.nodeChangeDescription',
    defaultMessage:
      'Everything else on this stage describes the node type it works with now, and choosing a different type removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks a different kind of network member for a stage that is already configured. A stage is one step of an interview.',
  },
  nodeChangeConfirm: {
    id: 'protocolBuilder.subjectSection.nodeChangeConfirm',
    defaultMessage: 'Change the node type',
    description:
      'Button that goes ahead with changing the kind of network member a stage works with, throwing away the configuration that described the previous one.',
  },
  nodeFirstChoiceTitle: {
    id: 'protocolBuilder.subjectSection.nodeFirstChoiceTitle',
    defaultMessage: 'Choose the node type?',
    description:
      'Title of the confirmation raised when a researcher picks the first kind of network member for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  nodeFirstChoiceDescription: {
    id: 'protocolBuilder.subjectSection.nodeFirstChoiceDescription',
    defaultMessage:
      'Everything else on this stage was configured without a node type, and choosing one removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks the first kind of network member for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  nodeFirstChoiceConfirm: {
    id: 'protocolBuilder.subjectSection.nodeFirstChoiceConfirm',
    defaultMessage: 'Choose the node type',
    description:
      'Button that goes ahead with choosing the first kind of network member a stage works with, throwing away the configuration entered before it.',
  },
  edgeTitle: {
    id: 'protocolBuilder.subjectSection.edgeTitle',
    defaultMessage: 'Edge setup',
    description:
      'Heading of the section where a researcher says which kind of relationship this step of the interview is about. An edge is a connection between two members of the network.',
  },
  edgeDescription: {
    id: 'protocolBuilder.subjectSection.edgeDescription',
    defaultMessage: 'Choose the edge type this stage uses.',
    description:
      'Description of the edge-type section. A stage is one step of an interview.',
  },
  edgeFieldLabel: {
    id: 'protocolBuilder.subjectSection.edgeFieldLabel',
    defaultMessage: 'Edge type',
    description:
      'Label of the control choosing which kind of relationship this step of the interview is about. The same words as the section heading, and translated once for each.',
  },
  edgeChangeTitle: {
    id: 'protocolBuilder.subjectSection.edgeChangeTitle',
    defaultMessage: 'Change edge type?',
    description:
      'Title of the confirmation raised when a researcher picks a different kind of relationship for a stage that is already configured for the one it has.',
  },
  edgeChangeDescription: {
    id: 'protocolBuilder.subjectSection.edgeChangeDescription',
    defaultMessage:
      'Everything else on this stage describes the edge type it works with now, and choosing a different type removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks a different kind of relationship for a stage that is already configured. A stage is one step of an interview.',
  },
  edgeChangeConfirm: {
    id: 'protocolBuilder.subjectSection.edgeChangeConfirm',
    defaultMessage: 'Change the edge type',
    description:
      'Button that goes ahead with changing the kind of relationship a stage works with, throwing away the configuration that described the previous one.',
  },
  edgeFirstChoiceTitle: {
    id: 'protocolBuilder.subjectSection.edgeFirstChoiceTitle',
    defaultMessage: 'Choose the edge type?',
    description:
      'Title of the confirmation raised when a researcher picks the first kind of relationship for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  edgeFirstChoiceDescription: {
    id: 'protocolBuilder.subjectSection.edgeFirstChoiceDescription',
    defaultMessage:
      'Everything else on this stage was configured without an edge type, and choosing one removes all of it.',
    description:
      'Body of the confirmation raised when a researcher picks the first kind of relationship for a stage that has none yet, but that has already been configured. A stage is one step of an interview.',
  },
  edgeFirstChoiceConfirm: {
    id: 'protocolBuilder.subjectSection.edgeFirstChoiceConfirm',
    defaultMessage: 'Choose the edge type',
    description:
      'Button that goes ahead with choosing the first kind of relationship a stage works with, throwing away the configuration entered before it.',
  },
});

/**
 * The words each subject uses, whole per subject rather than a noun swapped
 * into a shared frame: "a node" and "an edge" do not differ only in the noun
 * in every language, and this is the one place a researcher is told what the
 * stage is about.
 *
 * Formatted with no values, like every named descriptor a shared section
 * takes: one carrying a placeholder renders the pattern on screen, and nothing
 * in the types can refuse it. See `PromptsSection`'s own note and
 * `sections/__tests__/namedDescriptorProps.test.tsx`, which lands with the
 * form-fields section — the first surface to take a whole set of them. This
 * section's own words come from the table below rather than from a prop, so
 * what would break the rule here is an edit to this package's catalog, which
 * the locale sweep sees.
 */
type SubjectWords = Readonly<{
  title: MessageDescriptor;
  description: MessageDescriptor;
  fieldLabel: MessageDescriptor;
  /** Absent where Architect gives the control no hint — the edge type. */
  fieldHint?: MessageDescriptor;
  /** What the researcher is asked before a change that costs them the stage. */
  changeTitle: MessageDescriptor;
  changeDescription: MessageDescriptor;
  changeConfirm: MessageDescriptor;
  /**
   * And what they are asked when the stage has no type yet.
   *
   * The same cost, described truthfully: there is no type the rest of the
   * stage describes, so the sentence about replacing one would be about a
   * change that is not happening.
   */
  firstChoiceTitle: MessageDescriptor;
  firstChoiceDescription: MessageDescriptor;
  firstChoiceConfirm: MessageDescriptor;
}>;

const WORDS: Readonly<Record<SubjectEntity, SubjectWords>> = Object.freeze({
  node: Object.freeze({
    title: messages.nodeTitle,
    description: messages.nodeDescription,
    fieldLabel: messages.nodeFieldLabel,
    fieldHint: messages.nodeFieldHint,
    changeTitle: messages.nodeChangeTitle,
    changeDescription: messages.nodeChangeDescription,
    changeConfirm: messages.nodeChangeConfirm,
    firstChoiceTitle: messages.nodeFirstChoiceTitle,
    firstChoiceDescription: messages.nodeFirstChoiceDescription,
    firstChoiceConfirm: messages.nodeFirstChoiceConfirm,
  }),
  edge: Object.freeze({
    title: messages.edgeTitle,
    description: messages.edgeDescription,
    fieldLabel: messages.edgeFieldLabel,
    changeTitle: messages.edgeChangeTitle,
    changeDescription: messages.edgeChangeDescription,
    changeConfirm: messages.edgeChangeConfirm,
    firstChoiceTitle: messages.edgeFirstChoiceTitle,
    firstChoiceDescription: messages.edgeFirstChoiceDescription,
    firstChoiceConfirm: messages.edgeFirstChoiceConfirm,
  }),
});

export type SubjectSectionProps = Readonly<{
  entity: SubjectEntity;
  /**
   * Also offer the stage's own network filter.
   *
   * A separate section rather than a control inside this one: a filter is a
   * question about the whole network that the researcher switches on and off,
   * with rules of its own to lose when they switch it off, and the outline has
   * to be able to say so about it independently of whether a type is chosen.
   */
  filter?: boolean;
}>;

/**
 * The question the picker asks before it lets a pick through, or nothing at
 * all when there is nothing to lose.
 *
 * Asked here rather than by the reset, because the reset watches the value and
 * runs once it has already moved: a question asked there would be about a
 * change the researcher can already see, and answering "no" would mean putting
 * the picker back.
 *
 * Whether the stage HAS a type yet decides only which words are used, never
 * whether the question is raised. The reset throws away everything the stage is
 * carrying whichever way the subject moved, so a first choice made over a
 * filter written before any type was picked costs exactly what a change costs;
 * a guard keyed on the value rather than on the loss let that one through in
 * silence. What differs is what is TRUE about the loss, so each case says its
 * own sentence rather than one of them claiming a type is being replaced.
 *
 * A function rather than a value, for the reason `useSubjectChangeDiscards`
 * gives: it reads what the stage is carrying at the moment of the change.
 */
function useSubjectChangeQuestion(
  words: SubjectWords,
  intl: IntlShape,
): () => EntityTypeChangeConfirmation | undefined {
  const discardsConfiguration = useSubjectChangeDiscards();
  const hasAnyValue = useAskStageHasAnyValue();
  return useCallback(() => {
    if (!discardsConfiguration()) return undefined;
    // Asked through the same "holds an answer" the loss itself is judged by,
    // so the two cannot disagree about what the stage is carrying.
    const asked = hasAnyValue(['subject'])
      ? {
          title: words.changeTitle,
          description: words.changeDescription,
          confirmLabel: words.changeConfirm,
        }
      : {
          title: words.firstChoiceTitle,
          description: words.firstChoiceDescription,
          confirmLabel: words.firstChoiceConfirm,
        };
    return {
      title: intl.formatMessage(asked.title),
      description: intl.formatMessage(asked.description),
      confirmLabel: intl.formatMessage(asked.confirmLabel),
    };
  }, [discardsConfiguration, hasAnyValue, intl, words]);
}

/**
 * Which part of the network this stage is about.
 *
 * The stage's `subject` and nothing else. The types come from the editor's own
 * protocol context, so a type a collaborator adds or deletes while the editor
 * is open appears or disappears here without this section doing anything, and
 * a researcher who needs a type the protocol does not have yet can create one
 * without leaving the stage.
 *
 * Changing the subject throws away everything that described the previous
 * type, because a prompt naming its variables means nothing against a
 * different one. See `useResetStageOnSubjectChange`.
 */
export default function SubjectSection({
  entity,
  filter = false,
}: SubjectSectionProps) {
  const intl = useAppIntl();
  const words = WORDS[entity];
  useResetStageOnSubjectChange();

  const confirmChange = useSubjectChangeQuestion(words, intl);

  return (
    <>
      <BuilderSection
        title={intl.formatMessage(words.title)}
        description={intl.formatMessage(words.description)}
      >
        <Field<typeof EntitySubjectPickerField>
          name="subject"
          component={EntitySubjectPickerField}
          entityType={entity}
          confirmChange={confirmChange}
          label={intl.formatMessage(words.fieldLabel)}
          hint={words.fieldHint && intl.formatMessage(words.fieldHint)}
          required={REQUIRED}
        />
      </BuilderSection>
      {filter && <NetworkFilterSection />}
    </>
  );
}
