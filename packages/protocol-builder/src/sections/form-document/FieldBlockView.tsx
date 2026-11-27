import { Settings2 } from 'lucide-react';
import {
  type FocusEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  firstSettingsControlIn,
  type RichTextFieldBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { Skeleton } from '@codaco/fresco-ui/Skeleton';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { InterviewI18nProvider, ProtocolFieldControl } from '@codaco/interview';
import type { LocalizedString, Variable } from '@codaco/protocol-validation';

import { DynamicMessageSummary } from '../../fields/dynamicText/DynamicMessageSummary.tsx';
import {
  VariablePill,
  variablePillKindOf,
} from '../../fields/VariablePill.tsx';
import { useLatest } from '../../state/useLatest.ts';
import { FieldControlLanguage } from './FieldControlLanguage.tsx';
import { fieldDefinitionOf, isRecord } from './fieldDefinition.ts';
import { FieldSettingsPopover } from './FieldSettingsPopover.tsx';
import {
  useFormDocumentEnvironment,
  useFormStageEnvironment,
} from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';

/** Whether the attribute's rules make an answer required. */
const isRequired = (variable: Readonly<Variable> | undefined): boolean => {
  const rules: unknown =
    variable === undefined ? undefined : Reflect.get(variable, 'validation');
  return isRecord(rules) && rules.required === true;
};

// The question looks as the interview's field label does (and as the block's
// own question does in the stage editor).
const FIELD_LABEL_CLASSES = headingVariants({ level: 'label', margin: 'none' });

/**
 * A field's question and hint in the translation table, as the participant
 * reads them; they are translated in rows of their own. A field without a
 * question in this language says so.
 */
function FieldTextInTable({
  question,
  hint,
}: Readonly<{ question: string | undefined; hint: string | undefined }>) {
  const intl = useAppIntl();
  const { site, locale } = useFormDocumentEnvironment();
  const shown = (message: string) => (
    <DynamicMessageSummary
      message={message}
      markdown
      multiline={false}
      locale={locale}
      site={site}
    />
  );
  return (
    <div
      className="flex flex-col gap-1 select-none"
      data-field-text-in-table=""
    >
      <div className={FIELD_LABEL_CLASSES} data-field-question="">
        {question === undefined || question === '' ? (
          <span className="text-current/60 italic">
            {intl.formatMessage(messages.tableLabelPlaceholder)}
          </span>
        ) : (
          shown(question)
        )}
      </div>
      {hint !== undefined && hint !== '' && (
        <div className="text-sm text-current/70" data-field-hint-text="">
          {shown(hint)}
        </div>
      )}
    </div>
  );
}

/** A stand-in for the control while the field has no attribute. */
function ControlSkeleton() {
  return <Skeleton className="h-12 w-full rounded-full" />;
}

/**
 * What both views of a field block share: the field's attribute, the block
 * registered for the attribute picker, and the picker, opened from the block.
 */
function useFieldBlock(
  {
    attributes,
    editable,
    empty,
    update,
    remove,
    select,
    element,
  }: RichTextFieldBlockViewProps,
  /** The panel of the field's settings while they are drawn, if it has any. */
  settingsPanel?: RefObject<HTMLElement | null>,
) {
  const environment = useFormDocumentEnvironment();
  const { fieldId, variable: variableId } = attributes;
  const variable =
    variableId === '' ? undefined : environment.variables[variableId];
  const indeterminate = variableId === '';
  const missing = !indeterminate && variable === undefined;

  // The picker finishes the block it was opened for through these.
  const latest = useLatest({ update, remove, select, element, empty });
  const { registerBlock } = environment;
  useEffect(
    () =>
      registerBlock(fieldId, {
        update: (changes) => latest().update(changes),
        remove: () => latest().remove(),
        select: () => latest().select(),
        isEmpty: () => latest().empty,
        element: () => latest().element(),
        focusSettings: () => {
          const panel = settingsPanel?.current ?? null;
          if (panel !== null) firstSettingsControlIn(panel)?.focus();
        },
      }),
    [fieldId, latest, registerBlock, settingsPanel],
  );

  const openPicker = () => {
    const anchor = element();
    if (anchor === null || !editable) return;
    environment.openPicker({
      fieldId,
      anchor,
      origin: 'block',
      ...(missing && { repair: true }),
    });
  };

  return { variable, indeterminate, missing, openPicker };
}

/**
 * The attribute's pill in the block's corner, or, for a field that needs an
 * attribute (`needsAttribute`), a button that opens the attribute list.
 */
function FieldPill({
  variable,
  indeterminate,
  missing,
  needsAttribute,
  editable,
  openPicker,
}: Readonly<{
  variable: Readonly<Variable> | undefined;
  indeterminate: boolean;
  missing: boolean;
  needsAttribute: boolean;
  editable: boolean;
  openPicker: () => void;
}>) {
  const intl = useAppIntl();
  if (needsAttribute) {
    return (
      <button
        type="button"
        contentEditable={false}
        disabled={!editable}
        onClick={openPicker}
        className="focusable rounded-full"
        data-choose-attribute=""
      >
        {indeterminate ? (
          <VariablePill
            name={intl.formatMessage(messages.chooseAttribute)}
            size="sm"
            dashed
          />
        ) : (
          <VariablePill
            name={intl.formatMessage(messages.missingAttribute)}
            size="sm"
            missing
          />
        )}
      </button>
    );
  }
  return (
    <VariablePill
      name={variable?.name ?? intl.formatMessage(messages.missingAttribute)}
      size="sm"
      missing={missing}
      {...(variable === undefined
        ? {}
        : { kind: variablePillKindOf(variable.type) })}
    />
  );
}

/**
 * The control that the attribute is collected with, as a picture: it takes
 * no answer, no focus and no click, so a click on it reaches the block.
 */
function FieldControlPreview({
  attributes,
  variable,
  labelId,
}: Readonly<{
  attributes: RichTextFieldBlockViewProps['attributes'];
  variable: Readonly<Variable> | undefined;
  labelId: string;
}>) {
  const environment = useFormDocumentEnvironment();
  const { fieldId, variable: variableId, showValidationHints } = attributes;
  const label = useMemo(
    (): LocalizedString => ({ [environment.locale]: fieldId }),
    [environment.locale, fieldId],
  );
  const definition = useMemo(
    () => fieldDefinitionOf(variableId, variable, showValidationHints, label),
    [label, showValidationHints, variable, variableId],
  );
  return (
    <div
      contentEditable={false}
      inert
      className={cx('select-none', variableId === '' && 'opacity-60')}
      data-field-control=""
    >
      {definition === undefined || environment.localization === undefined ? (
        <ControlSkeleton />
      ) : (
        <InterviewI18nProvider>
          <FieldControlLanguage
            localization={environment.localization}
            locale={environment.locale}
            interfaceText={environment.interfaceText}
          >
            <ProtocolFieldControl
              key={`${definition.variable}:${definition.component}`}
              field={definition}
              labelledBy={labelId}
            />
          </FieldControlLanguage>
        </InterviewI18nProvider>
      )}
    </div>
  );
}

/**
 * Whether a click at `target` in a block is the block's own: outside its
 * question and hint, and outside a control drawn in it.
 */
const isBlockClick = (target: EventTarget): boolean =>
  !(
    target instanceof Element &&
    target.closest('[data-field-text], button, a, input') !== null
  );

/**
 * A field of a form in a stage editor, drawn as the participant meets it:
 * the question and hint, which the researcher types in place, the
 * attribute's pill in the corner, and the control that the attribute is
 * collected with. The control is a picture: it takes no answer and no focus.
 * Clicking it (or the frame) selects the field, and the field's settings
 * open beside it.
 *
 * Indeterminate while it has no attribute: a dashed frame, a skeleton
 * control and a "Choose an attribute" pill that opens the attribute list.
 */
export function StageFieldBlockView(props: RichTextFieldBlockViewProps) {
  const {
    attributes,
    content,
    selected,
    editable,
    active,
    update,
    remove,
    select,
    element,
  } = props;
  const intl = useAppIntl();
  const environment = useFormDocumentEnvironment();
  const stage = useFormStageEnvironment();
  const { fieldId } = attributes;
  const labelId = useId();
  const settingsPanel = useRef<HTMLElement | null>(null);
  const { variable, indeterminate, missing, openPicker } = useFieldBlock(
    props,
    settingsPanel,
  );

  // A field without an attribute, or whose attribute the codebook no longer
  // has, opens the attribute list in place of its settings.
  const needsAttribute = indeterminate || missing;
  const showsSettings = selected && editable && active && !needsAttribute;

  // While a problem with the form's fields is shown, the field that has it
  // answers for them (see `FormDocumentStageEnvironment.fieldsIssue`): it
  // carries what names them, and a name of its own for the list of problems.
  const answersForFields = stage.fieldsIssue?.fieldId === fieldId;
  const question = environment.fields.find((field) => field.id === fieldId)
    ?.prompt?.[environment.locale];
  const issueName =
    variable !== undefined
      ? intl.formatMessage(messages.namedField, { name: variable.name })
      : question !== undefined && question !== ''
        ? intl.formatMessage(messages.namedField, { name: question })
        : intl.formatMessage(messages.newField);
  // Sent here by a refused save or the list of problems, which focus the
  // block's frame: the field is selected instead, as Escape from its question
  // selects it, and Enter then opens its settings or its attribute list.
  const takeFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) select();
  };

  // A click anywhere in the block outside its question and hint (the
  // control, the corner) selects the field, as a click on a file's block
  // does, and its settings open. A field without an attribute opens its
  // attribute list instead, as Enter on it does.
  const selectFromClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!editable || !isBlockClick(event.target)) return;
    if (needsAttribute) openPicker();
    else select();
  };

  return (
    // The keyboard reaches the same field by Escape from its question, and
    // Enter on the selected field: this only adds the pointer's way.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="flex flex-col gap-4"
      data-field-required={isRequired(variable) || undefined}
      data-field-block={fieldId}
      onClick={selectFromClick}
      {...(answersForFields && {
        ...stage.fieldsIssue?.seam,
        onFocus: takeFocus,
      })}
    >
      {answersForFields && (
        // Read by the list of problems for the field's name; the field's own
        // question names it on screen.
        // oxlint-disable-next-line jsx-a11y/label-has-associated-control
        <label hidden>{issueName}</label>
      )}
      <div className="flex items-start gap-3">
        <div id={labelId} className="min-w-0 flex-1">
          {content}
        </div>
        <div
          contentEditable={false}
          className="flex shrink-0 items-center gap-2 select-none"
        >
          <FieldPill
            variable={variable}
            indeterminate={indeterminate}
            missing={missing}
            needsAttribute={needsAttribute}
            editable={editable}
            openPicker={openPicker}
          />
          {selected && editable && !needsAttribute && (
            <IconButton
              size="sm"
              variant="text"
              aria-label="Field settings"
              icon={<Settings2 aria-hidden />}
              onClick={select}
              // The pointer's way to the settings; the keyboard's is Enter on
              // the selected field. Out of the Tab order, so the list of
              // problems hands focus to the field rather than to this.
              tabIndex={-1}
            />
          )}
        </div>
      </div>
      <FieldControlPreview
        attributes={attributes}
        variable={variable}
        labelId={labelId}
      />
      {showsSettings && variable !== undefined && (
        <FieldSettingsPopover
          attributes={attributes}
          variable={variable}
          update={update}
          remove={remove}
          select={select}
          element={element}
          panelRef={settingsPanel}
        />
      )}
    </div>
  );
}

/**
 * A field of a form in the translation table: its question and hint as the
 * participant reads them in this language (they are translated in rows of
 * their own; the block contains no text), the attribute's pill, and the
 * control. A field is moved, put in and taken out here; its attribute and
 * settings are changed in the stage editor. A field that has no attribute
 * yet opens the list of the form's fields.
 */
export function TranslationFieldBlockView(props: RichTextFieldBlockViewProps) {
  const { attributes, editable, select } = props;
  const environment = useFormDocumentEnvironment();
  const { fieldId } = attributes;
  const labelId = useId();
  const { variable, indeterminate, missing, openPicker } = useFieldBlock(props);

  const entry = environment.fields.find((field) => field.id === fieldId);
  const selectFromClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!editable || !isBlockClick(event.target)) return;
    if (indeterminate) openPicker();
    else select();
  };

  return (
    // The keyboard selects the field with the arrow keys: this only adds the
    // pointer's way.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="flex flex-col gap-4"
      data-field-required={isRequired(variable) || undefined}
      data-field-block={fieldId}
      onClick={selectFromClick}
    >
      <div className="flex items-start gap-3">
        <div id={labelId} className="min-w-0 flex-1">
          <FieldTextInTable
            question={entry?.prompt?.[environment.locale]}
            hint={entry?.hint?.[environment.locale]}
          />
        </div>
        <div
          contentEditable={false}
          className="flex shrink-0 items-center gap-2 select-none"
        >
          <FieldPill
            variable={variable}
            indeterminate={indeterminate}
            missing={missing}
            needsAttribute={indeterminate}
            editable={editable}
            openPicker={openPicker}
          />
        </div>
      </div>
      <FieldControlPreview
        attributes={attributes}
        variable={variable}
        labelId={labelId}
      />
    </div>
  );
}
