import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { withoutAbsentValues } from '../form/absentValues.ts';
import DialogArrayField, {
  type DialogArrayEditorValidate,
} from '../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import { useStageValue } from '../form/stageFormHooks.ts';
import BuilderSection from './BuilderSection.tsx';
import {
  type RowEditorComponent,
  type RowPreviewComponent,
  type RowValues,
  useRowRenderers,
} from './rowRenderers.tsx';

/** Every interface that asks questions keeps them here. */
const PROMPTS_FIELD = 'prompts';

const messages = defineMessages({
  atLeastOne: {
    id: 'protocolBuilder.promptsSection.atLeastOne',
    defaultMessage:
      'Create at least one prompt. A stage with no prompts asks the participant nothing.',
    description:
      'Refusal shown above the prompt list when a researcher saves a stage that asks nothing. A prompt is one question a participant is asked; a stage is one step of an interview.',
  },
  title: {
    id: 'protocolBuilder.promptsSection.title',
    defaultMessage: 'Prompts',
    description:
      'Heading of the section holding the questions this step of the interview asks the participant.',
  },
  description: {
    id: 'protocolBuilder.promptsSection.description',
    defaultMessage:
      'Write the questions this stage asks, and drag them into the order the participant answers them.',
    description:
      'Description of the prompts section. A stage is one step of an interview.',
  },
  waitingDescription: {
    id: 'protocolBuilder.promptsSection.waitingDescription',
    defaultMessage:
      'Choose what this stage works with before writing its prompts.',
    description:
      'Shown in place of the prompts section’s description while the researcher has not yet chosen which node or edge type the stage is about, so there is nothing for a prompt to be written against.',
  },
  fieldLabel: {
    id: 'protocolBuilder.promptsSection.fieldLabel',
    defaultMessage: 'Prompts',
    description:
      'Label of the list of questions inside the prompts section. The same word as the section heading, and translated once for each: the heading names the part of the stage, and this names the control.',
  },
  fieldHint: {
    id: 'protocolBuilder.promptsSection.fieldHint',
    defaultMessage:
      'The participant answers these one at a time, in this order. Add at least one.',
    description: 'Guidance under the list of prompts.',
  },
  addLabel: {
    id: 'protocolBuilder.promptsSection.addLabel',
    defaultMessage: 'Create new prompt',
    description:
      'Button that opens the dialog for writing one more question. Whole rather than a generic "Add", because a stage editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  addTitle: {
    id: 'protocolBuilder.promptsSection.addTitle',
    defaultMessage: 'Create prompt',
    description:
      'Title of the dialog a researcher fills in to write one more question.',
  },
  editTitle: {
    id: 'protocolBuilder.promptsSection.editTitle',
    defaultMessage: 'Edit prompt',
    description:
      'Title of the dialog a researcher fills in to change a question they have already written.',
  },
  itemNoun: {
    id: 'protocolBuilder.promptsSection.itemNoun',
    defaultMessage: 'prompt',
    description:
      'What one row of the prompt list is called inside things said ABOUT it — "Edit prompt", "Remove this prompt?" — so it is lower case and singular. A prompt is one question a participant is asked.',
  },
  emptyState: {
    id: 'protocolBuilder.promptsSection.emptyState',
    defaultMessage:
      'No prompts yet. Create one to say what this stage asks the participant.',
    description:
      'Shown in place of the prompt list while a stage asks nothing yet.',
  },
});

const AT_LEAST_ONE_PROMPT = createMessageError(messages.atLeastOne);

/**
 * The rule that can actually refuse a save.
 *
 * The whole list is one field value, so this is where a rule about the list
 * itself belongs — a row cannot refuse anything (see `RowField`), and the
 * protocol schema's own "Too small: expected array to have >=1 items" arrives
 * against a path rather than against the section the researcher is looking at.
 */
const promptsValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      Array.isArray(value) && value.length > 0
        ? undefined
        : AT_LEAST_ONE_PROMPT,
  ]),
};

export type PromptsSectionProps = Readonly<{
  /**
   * The family's own prompt fields, rendered inside the row dialog.
   *
   * Everything a stage's prompts differ by lives here — which variable they
   * set, which edge they create, how their options are sorted — and everything
   * they have in common is this section. The editor reads the stage's subject,
   * codebook and validation from the package's own context, exactly as a
   * section does: the dialog's form store is nested inside the stage form, but
   * the stage editor context is not re-provided, so a control in the dialog can
   * still see the stage around it.
   */
  PromptEditor: RowEditorComponent;
  /** How one prompt reads in the list when its dialog is closed. */
  PromptPreview: RowPreviewComponent;
  /**
   * The prompts describe the stage's subject, so there is nothing to write
   * until one is chosen.
   *
   * `false` for an interface whose prompts stand alone — an ego form's, for
   * instance, which describe the participant rather than a type.
   */
  requiresSubject?: boolean;
  /**
   * A refusal only the family's own prompt can earn, checked when the row
   * dialog is submitted.
   *
   * Rules a control can state for itself belong on that control. This is for
   * the ones that need the whole row AND the row as the dialog opened on it —
   * the attribute-exclusivity gates a bin or census prompt runs, which must
   * not refuse a pick that was already there before this edit. Only
   * `editorValidate` is given both (see `DialogArrayField`).
   */
  editorValidate?: DialogArrayEditorValidate;
  /**
   * What a prompt this interface is adding starts out holding.
   *
   * For the parts of a row the researcher never chooses and no control in the
   * dialog can supply: an ordinal bin's prompt carries the color its bins are
   * drawn in, picked by the interface so the first bin has a color at all. Its
   * `id` is the list's own business and is filled in whether one is given or
   * not.
   *
   * Only for a row being ADDED. A prompt the stage already holds keeps what it
   * was saved with — a seed applied to an existing row would silently rewrite
   * a researcher's answer on the way into its own editor.
   */
  itemTemplate?: () => Partial<RowValues>;
  /**
   * The row as the stage should hold it, given what the dialog collected.
   *
   * Defaults to dropping every control the researcher left empty. A family
   * whose prompt carries an optional LIST supplies its own and drops that list
   * when it is empty: the shared rule deliberately keeps empty arrays, because
   * only the field that owns one can tell "emptied on purpose" from "never
   * used", and a prompt that assigns nothing should carry no key at all rather
   * than an empty one.
   */
  normalizeRow?: (row: unknown) => unknown;
  /**
   * Sentences this interface's prompts need instead of the generic ones.
   *
   * DESCRIPTORS, and named one at a time rather than bundled behind a `copy`
   * object — see `src/__tests__/hostCopyOverrides.test.ts`. A string handed
   * across a seam like this is invisible to extraction, absent from the
   * catalogs and covered by no guard, so the words an interface cared enough
   * to write for itself would be the only words that stayed English. A
   * descriptor declared in the interface's own messages file is extracted,
   * translated and guarded exactly like this section's own.
   *
   * Whole sentences per interface rather than a noun swapped into a shared
   * frame: a sociogram's prompts set TASKS performed on a canvas and a
   * geospatial stage's ask WHERE something is, and neither reads as the
   * generic "question the participant answers" with one word changed.
   *
   * Deliberately only these four. The section's own heading, its field label
   * and everything about the dialog stay shared, so a researcher moving
   * between two interfaces is not learning two vocabularies for one control.
   */
  description?: MessageDescriptor;
  /** Said instead of `description` while the section waits on a subject. */
  waitingDescription?: MessageDescriptor;
  fieldHint?: MessageDescriptor;
  emptyState?: MessageDescriptor;
}>;

/**
 * The ordered questions this stage asks.
 *
 * Every prompt list in every interface is this section: one ordered list, one
 * row dialog, one rule that a stage must ask something. What each interface's
 * prompts SAY is the only part that differs, and it arrives as the editor
 * rendered inside the row dialog.
 *
 * Rows are addressed by their own id rather than by the index they were drawn
 * at, so an insertion, a removal or a reorder is committed to the stage
 * document as the operation it actually was and survives being replayed onto a
 * list a collaborator has since changed.
 */
export default function PromptsSection({
  PromptEditor,
  PromptPreview,
  requiresSubject = true,
  editorValidate,
  itemTemplate,
  normalizeRow = withoutAbsentValues,
  description = messages.description,
  waitingDescription = messages.waitingDescription,
  fieldHint = messages.fieldHint,
  emptyState = messages.emptyState,
}: PromptsSectionProps) {
  const intl = useAppIntl();
  const subject = useStageValue('subject');
  const hasSubject =
    typeof subject === 'object' &&
    subject !== null &&
    typeof Reflect.get(subject, 'type') === 'string';
  const waiting = requiresSubject && !hasSubject;
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    PromptEditor,
    PromptPreview,
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(
        waiting ? waitingDescription : description,
      )}
      disabled={waiting}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={PROMPTS_FIELD}
        label={intl.formatMessage(messages.fieldLabel)}
        hint={intl.formatMessage(fieldHint)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(messages.addLabel)}
        addTitle={intl.formatMessage(messages.addTitle)}
        editorTitle={intl.formatMessage(messages.editTitle)}
        itemLabel={messages.itemNoun}
        emptyStateMessage={intl.formatMessage(emptyState)}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorDialogSize="editor"
        normalizeItem={normalizeRow}
        {...(itemTemplate === undefined ? {} : { itemTemplate })}
        {...(editorValidate === undefined ? {} : { editorValidate })}
        sortable
        {...promptsValidation}
      />
    </BuilderSection>
  );
}
