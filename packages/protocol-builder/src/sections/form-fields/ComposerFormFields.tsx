import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import {
  createMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import {
  type ParameterShape,
  parameterShapeFor,
  parametersForShape,
  hasParameterIssues,
  validateParameters,
} from '../../codebook/variableParameters.ts';
import {
  buildVariableRoleMap,
  hasUnvalidatedUse,
} from '../../codebook/variableRoles.ts';
import { unvalidatedElsewhereMessage } from '../../codebook/variableValidation.ts';
import VariablePickerField from '../../fields/VariablePickerField.tsx';
import { withoutAbsentValues } from '../../form/absentValues.ts';
import { crossClassPickIssue } from '../../form/arrayFields/crossClassPick.ts';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowsOf,
  rowTemplate,
  type RowEditorProps,
  type RowListConfig,
  type RowPreviewProps,
  type RowSaveContext,
  type RowSaveOutcome,
  type RowValues,
} from '../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import AttributeCodebookControls, {
  useRowValue,
} from '../AttributeCodebookControls.tsx';
import {
  COLLECTABLE_TYPES,
  useVariableChoices,
} from '../canvas/codebookChoices.ts';
import { asText } from '../canvas/rowValues.ts';
import { controlsForType } from '../collectableTypes.ts';
import { composerFormFieldMessages as messages } from './composerFormFieldMessages.ts';
import ComposerParametersField, {
  type ComposerParameters,
} from './ComposerParametersField.tsx';

const VARIABLE_FIELD = 'variable';
const COMPONENT_FIELD = 'component';
const PARAMETERS_FIELD = 'parameters';
const LABEL_FIELD = 'label';
const HINT_FIELD = 'hint';
const VALIDATION_HINTS_FIELD = 'showValidationHints';

const isRecord = (value: unknown): value is ComposerParameters =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What a row's own controls need to know about the form they belong to.
 *
 * The rows are mounted by the shared list field, which threads no props of its
 * own through, and none of these is a fact about the row: whose attributes the
 * form records into, what the rest of the list already records, and what the
 * stage around it is writing without the codebook's rules are all decided
 * outside any one row.
 */
type ComposerFormScope = Readonly<{
  subject: CodebookSubject | undefined;
  /** The list as it stands now, so a row can see its own siblings. */
  rows: readonly RowValues[];
  /**
   * Attributes this stage writes around the codebook's validation rules in its
   * unsaved draft — a composer's position and grouping picks.
   *
   * The role map is built from the saved protocol with the edited stage taken
   * out, so a pick made a moment ago is a write nothing else accounts for. A
   * form field collects through the codebook's rules, so it may not take one.
   */
  draftUnvalidated: ReadonlySet<string>;
}>;

const ComposerFormScopeContext = createContext<ComposerFormScope | undefined>(
  undefined,
);

function useComposerFormScope(): ComposerFormScope {
  const scope = useContext(ComposerFormScopeContext);
  if (scope === undefined) {
    throw new Error(
      'A composer form field was mounted outside a composer form, so it has no way to know whose attributes it records into.',
    );
  }
  return scope;
}

export type ComposerFormFieldsProps = Readonly<{
  /**
   * Whose attributes these fields record into. A composer's node form collects
   * the stage's own subject; each connection form collects its edge type's.
   */
  subject: CodebookSubject | undefined;
  /** See `ComposerFormScope.draftUnvalidated`. Give a stable array. */
  draftUnvalidatedVariables?: readonly string[];
  label: string;
  hint: string;
  addButtonLabel: string;
  emptyStateMessage: string;
  /** Titles of the row dialog, as descriptors: the list formats nothing. */
  addTitle: MessageDescriptor;
  editTitle: MessageDescriptor;
  /**
   * DOM id of the row dialog's form. Distinct per list on screen, because a
   * composer shows several at once and a `form=` attribute resolves by id.
   */
  formId: string;
}>;

/**
 * The fields of one form a network composer shows, bound to a path of the
 * stage document.
 *
 * A composer's node form has a place of its own there — `nodeForm.fields` —
 * so it is an ordinary field of the stage form, validated and saved with it.
 */
export function ComposerFormFieldsField({
  name,
  ...props
}: ComposerFormFieldsProps & Readonly<{ name: string }>) {
  const held = useStageValue(name);
  const rows = useMemo(() => rowsOf(held), [held]);

  return (
    <ComposerFormRows {...props} rows={rows}>
      <Field<typeof ArrayField<RowValues>>
        name={name}
        component={ArrayField}
        label={props.label}
        hint={props.hint}
        getId={rowId}
        addButtonLabel={props.addButtonLabel}
        itemLabel={messages.fieldNoun}
        emptyStateMessage={props.emptyStateMessage}
        itemComponent={RowListItem}
        editorComponent={RowDialog}
        itemTemplate={rowTemplate()}
        sortable
      />
    </ComposerFormRows>
  );
}

/**
 * The same list, driven by a value the caller holds.
 *
 * Each connection type's form has no path of its own that a field could own:
 * it is reached through an entry's position in `edges`, and a position moves.
 * `edges` is therefore ONE field — which is what stops a removed entry's form
 * from being replayed into the stage out of a parked value at its old index —
 * and each form is an unconnected control writing back through the value that
 * field holds.
 */
export function ComposerFormFieldsControl({
  name,
  value,
  onChange,
  ...props
}: ComposerFormFieldsProps &
  Readonly<{
    name: string;
    value: readonly RowValues[];
    onChange: (next: RowValues[]) => void;
  }>) {
  // Read-only is a property of the whole edit rather than of one mount: a
  // connected field is disabled for the researcher who does not hold the stage
  // without its section asking, and an unconnected one has to ask.
  const { readOnly } = useStageEditorForm();

  return (
    <ComposerFormRows {...props} rows={value}>
      <UnconnectedField<typeof ArrayField<RowValues>>
        name={name}
        component={ArrayField}
        label={props.label}
        hint={props.hint}
        value={[...value]}
        onChange={(next) => onChange(next ?? [])}
        readOnly={readOnly}
        getId={rowId}
        addButtonLabel={props.addButtonLabel}
        itemLabel={messages.fieldNoun}
        emptyStateMessage={props.emptyStateMessage}
        itemComponent={RowListItem}
        editorComponent={RowDialog}
        itemTemplate={rowTemplate()}
        sortable
      />
    </ComposerFormRows>
  );
}

/**
 * Everything both mountings share: what a row may record, and what refuses a
 * row before it reaches the list.
 */
function ComposerFormRows({
  subject,
  draftUnvalidatedVariables,
  addTitle,
  editTitle,
  formId,
  rows,
  children,
}: ComposerFormFieldsProps &
  Readonly<{ rows: readonly RowValues[]; children: ReactNode }>) {
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const draftUnvalidated = useMemo(
    () => new Set(draftUnvalidatedVariables ?? []),
    [draftUnvalidatedVariables],
  );
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );
  const variables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const intl = useAppIntl();

  /**
   * The save-time half of the two rules the row's own picker already applies.
   *
   * The picker offers neither an attribute a sibling field already records nor
   * one this stage writes around the codebook's rules, and that is not enough
   * on its own: the codebook and the draft are both read live, so a
   * collaborator's change or a pick made elsewhere on the stage can make a
   * choice illegal while the dialog is holding it — and the schema's own
   * role-conflict rule would then refuse the whole stage, against a path
   * rather than against the control the researcher has to fix.
   */
  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      const variable = asText(row[VARIABLE_FIELD]) ?? '';
      if (variable === '') return { row };

      const siblings = rows.filter(
        (_row, index) => index !== context.editIndex,
      );
      if (siblings.some((sibling) => sibling[VARIABLE_FIELD] === variable)) {
        return {
          refused: {
            fieldErrors: {
              [VARIABLE_FIELD]: intl.formatMessage(
                messages.duplicateVariableRefusal,
              ),
            },
          },
        };
      }

      if (subject === undefined) return { row };
      const issue = crossClassPickIssue({
        variableId: variable,
        // The row's PRE-EDIT pick, so re-saving a field that arrived
        // conflicting is never refused for a conflict this edit did not make.
        originalVariableId: asText(context.openedOn[VARIABLE_FIELD]) ?? '',
        hasConflictingUse: (candidate) =>
          draftUnvalidated.has(candidate) ||
          hasUnvalidatedUse(roleMap, subject, candidate),
        allVariables: variables,
        // Where the other writer IS decides what the researcher is told, and
        // it is the only thing they can act on: a control on this stage is
        // behind the dialog, and a stage elsewhere in the protocol is not.
        message: draftUnvalidated.has(variable)
          ? (variableName: string) =>
              createMessageError(messages.unvalidatedOnThisStageRefusal, {
                variableName,
              })
          : unvalidatedElsewhereMessage,
      });
      return issue === undefined
        ? { row }
        : { refused: { fieldErrors: { [VARIABLE_FIELD]: issue } } };
    },
    [draftUnvalidated, intl, roleMap, rows, subject, variables],
  );

  const rowList = useMemo<RowListConfig>(
    () => ({
      Preview: ComposerFormFieldPreview,
      Editor: ComposerFormFieldEditor,
      addTitle,
      editTitle,
      formId,
      beforeSave,
      normalize: normalizeComposerField,
    }),
    [addTitle, beforeSave, editTitle, formId],
  );

  const scope = useMemo(
    () => ({ subject, rows, draftUnvalidated }),
    [draftUnvalidated, rows, subject],
  );

  return (
    <ComposerFormScopeContext value={scope}>
      <RowList config={rowList}>{children}</RowList>
    </ComposerFormScopeContext>
  );
}

/**
 * The row as the protocol holds it.
 *
 * One thing the shared "drop what was left empty" rule cannot decide: a
 * validation hint switched OFF is written by its absence. `false` is an answer
 * in general — which is why the shared rule keeps it — but this toggle's off
 * position is the schema's own default, and stamping it on every field of
 * every form says nothing its absence did not already say.
 */
function normalizeComposerField(value: RowValues): RowValues {
  const cleaned = withoutAbsentValues(value);
  if (!isRecord(cleaned)) return value;
  if (cleaned[VALIDATION_HINTS_FIELD] !== false) return cleaned;
  const { [VALIDATION_HINTS_FIELD]: _off, ...field } = cleaned;
  return field;
}

/** Which settings this row's control takes, from the pair the row holds. */
function shapeOf(
  variables: ReturnType<typeof variablesForSubject>,
  variable: string | undefined,
  component: unknown,
): ParameterShape | null {
  const attribute = variable === undefined ? undefined : variables[variable];
  return parameterShapeFor(attribute?.type, component);
}

/**
 * One field of a form a network composer shows.
 *
 * Two decisions, in the order they have to be made: which attribute the answer
 * is recorded in, and which control the participant answers it with. The
 * second depends on the first — the protocol schema refuses a control that
 * cannot render the attribute's type — so changing the attribute takes the
 * control with it rather than leaving a pairing that is rejected long after
 * the researcher has moved on.
 *
 * The control lives on the STAGE rather than on the codebook attribute, which
 * is the whole point of this interface: one attribute can be asked for with a
 * slider here and a number box somewhere else. What the attribute MEANS, and
 * how its answers are validated, still belong to the codebook, and are reached
 * from here through the shared attribute controls — with their settings half
 * withheld, because here the settings are the field's.
 */
function ComposerFormFieldEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const { subject, rows, draftUnvalidated } = useComposerFormScope();
  const setRowValue = useFormStore((state) => state.setFieldValue);
  const variables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const committed = asText(item[VARIABLE_FIELD]);
  const chosen = asText(useRowValue(VARIABLE_FIELD)) ?? committed;
  const control =
    asText(useRowValue(COMPONENT_FIELD)) ?? asText(item[COMPONENT_FIELD]);

  const offered = useVariableChoices({
    subject,
    types: COLLECTABLE_TYPES,
    // A form field collects its answer through the codebook's own rules, so it
    // may not take an attribute something else writes around them.
    writerClass: 'validated',
    ...(chosen === undefined ? {} : { currentValue: chosen }),
  });
  const siblingVariables = useMemo(
    () =>
      new Set(
        rows.flatMap((row) => {
          const variable = asText(row[VARIABLE_FIELD]);
          return variable === undefined || variable === committed
            ? []
            : [variable];
        }),
      ),
    [committed, rows],
  );
  const variableOptions = useMemo(
    () =>
      offered.filter(
        // The row's own pick is always offered back, whatever the filters say:
        // a picker that dropped its value would blank the control and write
        // the blank over the reference the researcher has to resolve.
        (option) =>
          option.value === chosen ||
          (!siblingVariables.has(option.value) &&
            !draftUnvalidated.has(option.value)),
      ),
    [chosen, draftUnvalidated, offered, siblingVariables],
  );

  const attributeType =
    chosen === undefined ? undefined : variables[chosen]?.type;
  const controlOptions = useMemo(
    () =>
      controlsForType(attributeType ?? '').map(({ value, label }) => ({
        value,
        label: intl.formatMessage(label),
      })),
    [attributeType, intl],
  );

  /**
   * The control follows the attribute.
   *
   * An observer effect rather than a change handler, because a caller's
   * `onChange` on a Fresco field REPLACES the store's own write rather than
   * running beside it. It deliberately does nothing on the first render: the
   * row arrives with a pairing that is already saved, and re-deciding it here
   * would rewrite a field nobody touched.
   */
  const seenVariable = useRef(chosen);
  useEffect(() => {
    const previous = seenVariable.current;
    seenVariable.current = chosen;
    if (previous === chosen) return;
    const attribute = chosen === undefined ? undefined : variables[chosen];
    const controls = controlsForType(attribute?.type ?? '');
    // The codebook's own control where the pairing allows it, because that is
    // what the researcher already decided this attribute looks like; otherwise
    // the first control that can render it, so a field is never left holding a
    // pairing the schema refuses.
    const preferred =
      attribute !== undefined && 'component' in attribute
        ? controls.find(({ value }) => value === attribute.component)?.value
        : undefined;
    setRowValue(COMPONENT_FIELD, preferred ?? controls[0]?.value);
  }, [chosen, setRowValue, variables]);

  const shape = shapeOf(variables, chosen, control);
  /**
   * The settings go with the control they were authored for.
   *
   * The two date schemas are strict about their own keys, so a `min` beside a
   * relative picker is a field the protocol refuses outright. Only the new
   * shape's keys survive a change of control — and a control that takes no
   * settings leaves nothing, which is what takes the key away. Written rather
   * than left to unmount, because a parked value is replayed into the row.
   */
  const seenShape = useRef(shape);
  useEffect(() => {
    const previous = seenShape.current;
    seenShape.current = shape;
    if (previous === shape) return;
    setRowValue(PARAMETERS_FIELD, undefined);
  }, [setRowValue, shape]);

  /**
   * What this field would run with, which is what it is judged by: its own
   * block, or the attribute's while it has none. Judged on the absent key
   * alone, a scale validly inheriting its two end labels was refused for not
   * having them.
   */
  const inherited = useMemo(() => {
    if (shape === null || chosen === undefined) return undefined;
    const attribute = variables[chosen];
    return parametersForShape(
      shape,
      attribute !== undefined && 'parameters' in attribute
        ? attribute.parameters
        : undefined,
    );
  }, [chosen, shape, variables]);

  /**
   * What the settings are judged against, kept live.
   *
   * A validation object is part of what a field registers with and is memoised
   * on a JSON of its rules — which drops functions, so a rebuilt closure would
   * never replace the one registered on the first render. Read this way, the
   * rule judges the block against the control the row holds NOW.
   */
  const judgeAgainst = useRef({ shape, inherited });
  judgeAgainst.current = { shape, inherited };
  const parametersValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => {
          const { shape: liveShape, inherited: liveInherited } =
            judgeAgainst.current;
          if (liveShape === null) return undefined;
          const issues = validateParameters(
            liveShape,
            isRecord(value) ? value : liveInherited,
          );
          return hasParameterIssues(issues)
            ? Object.values(issues).flat()[0]
            : undefined;
        },
      ]),
    }),
    [],
  );

  return (
    <>
      <Field<typeof VariablePickerField>
        name={VARIABLE_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.variableLabel)}
        hint={intl.formatMessage(messages.variableHint)}
        options={variableOptions}
        emptyMessage={intl.formatMessage(messages.variableEmpty)}
        initialValue={committed}
        required={intl.formatMessage(messages.variableRequired)}
      />
      <Field<typeof NativeSelectField>
        name={COMPONENT_FIELD}
        component={NativeSelectField}
        label={intl.formatMessage(messages.controlLabel)}
        hint={intl.formatMessage(messages.controlHint)}
        options={controlOptions}
        disabled={controlOptions.length === 0}
        initialValue={asText(item[COMPONENT_FIELD])}
        required={intl.formatMessage(messages.controlRequired)}
      />
      {/*
        No `inventingType`: this row's picker offers only attributes that
        already exist, so there is never one being created here to author the
        values of. The settings half is withheld because this field keeps its
        own control and its own settings on the stage — written to the codebook
        they would be authored against a control the codebook does not have,
        and the variable schemas, split on `component`, refuse that outright.
      */}
      <AttributeCodebookControls
        subject={subject}
        committedVariable={item[VARIABLE_FIELD]}
        componentField={COMPONENT_FIELD}
        offerParameters={false}
      />
      {shape !== null && (
        <Field<typeof ComposerParametersField>
          name={PARAMETERS_FIELD}
          component={ComposerParametersField}
          label={intl.formatMessage(messages.parametersLabel)}
          hint={intl.formatMessage(messages.parametersHint)}
          shape={shape}
          {...(inherited === undefined ? {} : { inherited })}
          {...(chosen === undefined || variables[chosen] === undefined
            ? {}
            : { inheritedFrom: variables[chosen].name })}
          initialValue={
            isRecord(item[PARAMETERS_FIELD])
              ? item[PARAMETERS_FIELD]
              : undefined
          }
          {...parametersValidation}
        />
      )}
      <Field<typeof InputField>
        name={LABEL_FIELD}
        component={InputField}
        label={intl.formatMessage(messages.questionLabel)}
        hint={intl.formatMessage(messages.questionHint)}
        placeholder={intl.formatMessage(messages.questionPlaceholder)}
        initialValue={asText(item[LABEL_FIELD])}
      />
      <Field<typeof InputField>
        name={HINT_FIELD}
        component={InputField}
        label={intl.formatMessage(messages.helpLabel)}
        hint={intl.formatMessage(messages.helpHint)}
        placeholder={intl.formatMessage(messages.helpPlaceholder)}
        initialValue={asText(item[HINT_FIELD])}
      />
      <Field<typeof ToggleField>
        name={VALIDATION_HINTS_FIELD}
        component={ToggleField}
        label={intl.formatMessage(messages.validationHintsLabel)}
        hint={intl.formatMessage(messages.validationHintsHint)}
        inline
        initialValue={item[VALIDATION_HINTS_FIELD] === true}
      />
    </>
  );
}

/** How one field reads in the list when its dialog is closed. */
function ComposerFormFieldPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const { subject } = useComposerFormScope();
  const variableId = asText(item[VARIABLE_FIELD]);
  const attribute =
    subject === undefined || variableId === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];
  const control = controlsForType(attribute?.type ?? '').find(
    ({ value }) => value === item[COMPONENT_FIELD],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <span>
        {asText(item[LABEL_FIELD]) ??
          attribute?.name ??
          intl.formatMessage(messages.emptyPreview)}
      </span>
      {(attribute !== undefined || control !== undefined) && (
        <div className="flex flex-wrap gap-2.5">
          {/* A whole sentence rather than an assembled fragment: what reads
              naturally around an attribute's name is not the same in every
              language. */}
          {attribute !== undefined && (
            <Badge>
              {intl.formatMessage(messages.recordsAttribute, {
                attributeName: attribute.name,
              })}
            </Badge>
          )}
          {/* The control's own name, not a sentence built round it. */}
          {control !== undefined && (
            <Badge>{intl.formatMessage(control.label)}</Badge>
          )}
        </div>
      )}
    </div>
  );
}
