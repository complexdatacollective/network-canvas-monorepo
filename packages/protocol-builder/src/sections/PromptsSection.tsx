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

const AT_LEAST_ONE_PROMPT =
  'Create at least one prompt. A stage with no prompts asks the participant nothing.';

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

export type PromptsCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /**
   * Said instead of `description` while the section is waiting on a subject,
   * so the outline's "not available yet" has an explanation beside it.
   */
  waitingDescription: string;
  fieldLabel: string;
  fieldHint: string;
  /**
   * Visible text and accessible name of the add button. Whole, and required:
   * a stage editor mounts several list editors at once, and named "Add" they
   * are all the same control to anyone navigating by a list of buttons.
   */
  addButtonLabel: string;
  addTitle: string;
  editorTitle: string;
  /** Noun used in row affordances ("Edit prompt", "Remove prompt"). */
  itemLabel: string;
  emptyStateMessage: string;
}>;

const DEFAULT_COPY: PromptsCopy = {
  sectionTitle: 'Prompts',
  description:
    'Write the questions this stage asks, and drag them into the order the participant answers them.',
  waitingDescription:
    'Choose what this stage works with before writing its prompts.',
  fieldLabel: 'Prompts',
  fieldHint:
    'The participant answers these one at a time, in this order. Add at least one.',
  addButtonLabel: 'Create new prompt',
  addTitle: 'Create prompt',
  editorTitle: 'Edit prompt',
  itemLabel: 'prompt',
  emptyStateMessage:
    'No prompts yet. Create one to say what this stage asks the participant.',
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
  copy?: Partial<PromptsCopy>;
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
  copy,
}: PromptsSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
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
      title={words.sectionTitle}
      description={waiting ? words.waitingDescription : words.description}
      disabled={waiting}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={PROMPTS_FIELD}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={DialogArrayField}
        addButtonLabel={words.addButtonLabel}
        addTitle={words.addTitle}
        editorTitle={words.editorTitle}
        itemLabel={words.itemLabel}
        emptyStateMessage={words.emptyStateMessage}
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
