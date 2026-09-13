import {
  createContext,
  type ReactNode,
  type RefObject,
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
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
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
  useCodebookSectionDocument,
  useCreateCodebookVariable,
  useWhereTheAnswerLands,
} from '../../codebook/useCodebookVariableEdits.ts';
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
import { variableTypeLabel } from '../../codebook/variableTypeLabels.ts';
import {
  isValidationMap,
  unvalidatedElsewhereMessage,
} from '../../codebook/variableValidation.ts';
import ComposerParametersField, {
  type ComposerParameters,
} from '../../fields/ComposerParametersField.tsx';
import VariablePickerField, {
  createdUnassigned,
  type CreateOptionOutcome,
} from '../../fields/VariablePickerField.tsx';
import { withoutAbsentValues } from '../../form/absentValues.ts';
import { crossClassPickIssue } from '../../form/arrayFields/crossClassPick.ts';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowsOf,
  rowTemplate,
  type RowAsideProps,
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
  useSubjectVariableNames,
  useVariableChoices,
} from '../canvas/codebookChoices.ts';
import { asText } from '../canvas/rowValues.ts';
import {
  ALL_CONTROLS,
  controlsForType,
  isOptionType,
  needsCodebookEditorToCreate,
  typeForControl,
} from '../collectableTypes.ts';
import { composerFormFieldMessages as messages } from './composerFormFieldMessages.ts';
import FieldPreviewPane from './FieldPreviewPane.tsx';
import {
  CREATE_FIRST_REFUSALS,
  INVENTED_TYPE_NOTICE,
  NEW_VARIABLE,
  NEW_VARIABLE_NAME,
  NEW_VARIABLE_VALIDATION,
  useInventingAttribute,
} from './inventedAttribute.ts';

const VARIABLE_FIELD = 'variable';
const COMPONENT_FIELD = 'component';
const PARAMETERS_FIELD = 'parameters';
const LABEL_FIELD = 'label';
const HINT_FIELD = 'hint';
const VALIDATION_HINTS_FIELD = 'showValidationHints';

const isRecord = (value: unknown): value is ComposerParameters =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Held at module scope so it keeps one identity across renders: an inline
 * arrow returning JSX is a component defined during render.
 */
const renderStrong = (chunks: ReactNode) => <strong>{chunks}</strong>;

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
  /**
   * What the open row's picker names right now, for a codebook write to be
   * judged against when it answers.
   *
   * A ref written on every render rather than state: the save reads it in the
   * middle of an await, from a closure made before it, and an effect that has
   * not run yet would answer with the previous render's row. The same seam
   * `FormFieldsSection` reads its own row through, and for the same reason.
   */
  rowUnderEdit: RefObject<string | undefined>;
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
  /**
   * Visually hide the label, leaving it as the list's accessible name.
   *
   * For a list whose own section already says the words: showing both
   * announces the same phrase twice and puts a second heading-shaped line
   * under the first. The name still has to exist — it is what the outline and
   * a host's problem panel call this field.
   */
  labelHidden?: boolean;
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
    <ComposerFormRows {...props} name={name} rows={rows}>
      <Field<typeof ArrayField<RowValues>>
        name={name}
        component={ArrayField}
        label={props.label}
        labelHidden={props.labelHidden}
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
    <ComposerFormRows {...props} name={name} rows={value}>
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
  name,
  rows,
  children,
}: ComposerFormFieldsProps &
  Readonly<{
    /**
     * What the list is mounted under, which the row dialog hands on as the
     * path a save would write this row to. The node form's is its place in the
     * stage document; a connection form has none — it is reached through an
     * entry's position in `edges` — so its mounting name is the control's own,
     * which is what the dialog then reports.
     */
    name: string;
    rows: readonly RowValues[];
    children: ReactNode;
  }>) {
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

  // See `ComposerFormScope.rowUnderEdit`: the open row fills this in, and the
  // create below reads it when the codebook answers.
  const rowUnderEdit = useRef<string | undefined>(undefined);
  const createVariable = useCreateCodebookVariable(subject);
  const whereTheAnswerLands = useWhereTheAnswerLands(
    subject,
    () => rowUnderEdit.current,
  );

  /**
   * Writes the attribute this row is inventing, before the row that names it
   * is committed.
   *
   * The kind of answer comes from the input control the researcher chose,
   * which is Architect's own rule for this editor
   * (`EditableAttributesList/ComposerAttributeFields.tsx` through
   * `Form/fieldCommit.ts`'s `useComposerFieldCommit`: `getTypeForComponent`),
   * and is why this row has no kind-of-answer control of its own — the control
   * IS the question, asked once.
   *
   * Ordered create-then-commit for the reason the shared form row is: the
   * codebook write is the one that can be refused, and a row committed first
   * would name an attribute that was never written.
   */
  const inventAttribute = useCallback(
    async (row: RowValues): Promise<RowSaveOutcome> => {
      const component = asText(row[COMPONENT_FIELD]);
      const type = typeForControl(component);
      // The control is a `required` field of this dialog, so this is the belt
      // for a row that arrives already broken — and it is what narrows `type`
      // for the create below.
      if (component === undefined || type === undefined) {
        return {
          refused: {
            fieldErrors: {
              [COMPONENT_FIELD]: intl.formatMessage(messages.controlRequired),
            },
          },
        };
      }
      // An attribute the codebook editor has to author is only ever made
      // there, so nothing here can create one from a name and a control. Said
      // in its own words rather than left to the schema, which would answer a
      // list of answers with a count of a list the researcher never saw — and
      // a scale not at all, because a scale with no end labels is a protocol
      // the schema accepts and a participant cannot read. Filed on the
      // control, which is where the kind of answer was decided.
      if (needsCodebookEditorToCreate(type)) {
        return {
          refused: {
            fieldErrors: {
              [COMPONENT_FIELD]: isOptionType(type)
                ? createMessageError(
                    CREATE_FIRST_REFUSALS.createWithValuesFirst,
                  )
                : createMessageError(
                    CREATE_FIRST_REFUSALS.createWithSettingsFirst,
                  ),
            },
          },
        };
      }

      // The rules go with the create, as Architect's own commit does: a
      // researcher who has just said this answer is required said it about the
      // attribute being made, and a second write afterwards is a save that can
      // half succeed.
      const validation = row[NEW_VARIABLE_VALIDATION];
      // The control is written to the codebook only as the attribute is made
      // — a composer field OWNS its control from then on, which is why no
      // later save touches it. Architect writes it on the create for the same
      // reason (`useComposerFieldCommit`).
      const invented = asText(row[NEW_VARIABLE_NAME])?.trim() ?? '';
      const outcome = await createVariable({
        name: invented,
        type,
        component,
        ...(isValidationMap(validation) && Object.keys(validation).length > 0
          ? { validation }
          : {}),
      });
      if (outcome.status === 'refused') {
        // On the picker, which is where the name was typed and the only
        // control on this surface that is about the attribute's existence.
        return {
          refused: { fieldErrors: { [VARIABLE_FIELD]: outcome.message } },
        };
      }
      // Which codebook the attribute went into was decided when the researcher
      // opened this row, and the stage can be repointed at another type while
      // that write is with the host. A record key belongs to exactly one type,
      // so committing the row now would add a field naming an attribute the
      // type this form collects about does not have — a stage the schema
      // refuses, built out of a save the researcher was told succeeded.
      //
      // What is refused is the ROW, and what they are told is not that the
      // create failed: it landed, and asking again would ask the codebook for
      // a name it already holds. So the sentence is the picker's own for this
      // — the write is done, and here is where the attribute went — with the
      // draft left standing.
      if (
        subject === undefined ||
        whereTheAnswerLands({ subject, fillsIn: NEW_VARIABLE }) !== 'here'
      ) {
        return {
          refused: {
            formErrors: [
              createMessageError(createdUnassigned, {
                variableName: invented,
              }),
            ],
          },
        };
      }
      return { row: { ...row, [VARIABLE_FIELD]: outcome.variableId } };
    },
    [createVariable, intl, subject, whereTheAnswerLands],
  );

  /**
   * The save-time half of the two rules the row's own picker already applies.
   *
   * The picker offers neither an attribute a sibling field already records nor
   * one this stage writes around the codebook's rules, and that is not enough
   * on its own: the PROTOCOL is read live, so a collaborator can make a choice
   * illegal while the dialog is holding it — and the schema's own
   * role-conflict rule would then refuse the whole stage, against a path
   * rather than against the control the researcher has to fix.
   *
   * Only a collaborator, which is why the refusal is worded for a conflict
   * elsewhere in the protocol and never for one on this stage: this stage's
   * own unvalidated picks are the researcher's draft, and the dialog holding
   * this row is what stops them changing it while the row is open.
   */
  const beforeSave = useCallback(
    async (
      row: RowValues,
      context: RowSaveContext,
    ): Promise<RowSaveOutcome> => {
      const variable = asText(row[VARIABLE_FIELD]) ?? '';
      // An attribute this row is still inventing is the one case none of the
      // rules below can be asked about: there is nothing in the codebook for
      // them to read. It is created first, and what the row commits is the id
      // that create minted.
      if (variable === NEW_VARIABLE) return inventAttribute(row);
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
          hasUnvalidatedUse(roleMap, subject, candidate),
        allVariables: variables,
        message: unvalidatedElsewhereMessage,
      });
      if (issue !== undefined) {
        return { refused: { fieldErrors: { [VARIABLE_FIELD]: issue } } };
      }

      /**
       * The pairing, judged against the attribute's CURRENT type.
       *
       * The control follows the attribute, but only while the researcher is
       * the one moving it: the effect that re-pairs them watches the row's own
       * pick, and a collaborator retyping the attribute underneath the open
       * row does not move that. The control list re-derives, the select is
       * left showing its placeholder, and the row goes on holding a control
       * that cannot ask for the attribute — a pairing
       * `validateComposerFieldComponents` refuses, reported against a path in
       * the saved protocol rather than against the control to change.
       *
       * Refused unconditionally rather than only for a pairing this edit
       * broke, which is the opposite of the rule above it: the offending value
       * is IN this dialog, so the researcher can act on it here. Skipped for
       * an attribute the codebook no longer defines, which the schema skips
       * too — the reference pass owns that error, and this row cannot resolve
       * it.
       */
      const attribute = variables[variable];
      const component = asText(row[COMPONENT_FIELD]);
      const unpaired =
        attribute !== undefined &&
        component !== undefined &&
        !controlsForType(attribute.type).some(
          ({ value }) => value === component,
        );
      return unpaired
        ? {
            refused: {
              fieldErrors: {
                [COMPONENT_FIELD]: intl.formatMessage(
                  messages.staleControlRefusal,
                  { attributeName: attribute.name },
                ),
              },
            },
          }
        : { row };
    },
    [inventAttribute, intl, roleMap, rows, subject, variables],
  );

  const rowList = useMemo<RowListConfig>(
    () => ({
      Preview: ComposerFormFieldPreview,
      Editor: ComposerFormFieldEditor,
      Aside: ComposerFieldPreviewPane,
      addTitle,
      editTitle,
      formId,
      name,
      beforeSave,
      normalize: normalizeComposerField,
    }),
    [addTitle, beforeSave, editTitle, formId, name],
  );

  const scope = useMemo(
    () => ({ subject, rows, draftUnvalidated, rowUnderEdit }),
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
  // The keys describing an attribute being invented are working state of the
  // dialog rather than part of a form field, and `inventAttribute` has already
  // turned them into a real attribute by the time this runs.
  const {
    [NEW_VARIABLE_NAME]: _name,
    [NEW_VARIABLE_VALIDATION]: _validation,
    ...row
  } = cleaned;
  if (row[VALIDATION_HINTS_FIELD] !== false) return row;
  const { [VALIDATION_HINTS_FIELD]: _off, ...field } = row;
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
/**
 * The preview beside a composer field's own controls.
 *
 * `mode="composer"`, because this family labels a box of a form the
 * participant is filling in rather than asking a question, and because the
 * control and its settings live on the STAGE here rather than on the
 * attribute.
 */
function ComposerFieldPreviewPane({ item }: RowAsideProps) {
  const { subject } = useComposerFormScope();
  return <FieldPreviewPane subject={subject} mode="composer" item={item} />;
}

function ComposerFormFieldEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const { subject, rows, draftUnvalidated, rowUnderEdit } =
    useComposerFormScope();
  const setRowValue = useFormStore((state) => state.setFieldValue);
  const inventing = useInventingAttribute(item);
  const inventedName =
    asText(useRowValue(NEW_VARIABLE_NAME) ?? item[NEW_VARIABLE_NAME]) ?? '';
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

  /**
   * The kind of answer this row records, which while it is inventing one is
   * decided BY the control the researcher chose.
   *
   * The row's own question, in Architect's own order: this editor never asks
   * for a kind of answer, because the control that collects it says which kind
   * it is (`getTypeForComponent`). Every other invention in the package is
   * given the kind first and narrows the controls to it; this one is the
   * inverse, and it is the inverse in Architect too.
   */
  const attributeType = inventing
    ? typeForControl(control)
    : chosen === undefined
      ? undefined
      : variables[chosen]?.type;
  const typeLabel = variableTypeLabel(attributeType ?? '');
  const controlOptions = useMemo(
    () =>
      // Everything a form can collect while the attribute is being invented:
      // there is no type yet to narrow the list by, and narrowing it to the
      // kind the current control implies would take away every other kind the
      // researcher might have meant.
      (inventing ? ALL_CONTROLS : controlsForType(attributeType ?? '')).map(
        ({ value, label }) => ({
          value,
          label: intl.formatMessage(label),
        }),
      ),
    [attributeType, intl, inventing],
  );

  /**
   * The attribute being invented, as the one thing the picker can show for it.
   *
   * The control shows what the row holds, and while the row is inventing that
   * is a name and nothing else — so the option standing for it is offered only
   * while it is held, and carries the kind of answer as soon as a control has
   * decided one, which is what colours the pill.
   */
  const offeredOptions = useMemo(
    () =>
      inventing
        ? [
            ...variableOptions,
            {
              value: NEW_VARIABLE,
              label: inventedName,
              ...(attributeType === undefined ? {} : { type: attributeType }),
            },
          ]
        : variableOptions,
    [attributeType, inventedName, inventing, variableOptions],
  );

  // What every codebook write this row makes is about. Written on every render
  // rather than from an effect, the way the shared form row keeps its own view
  // of the row it is editing: a save reads this in the middle of an await, and
  // an effect that has not run yet would answer with the previous render's row.
  rowUnderEdit.current = chosen;

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
    /*
      A pick that has not moved is decided again while it has named no control
      at all. An attribute invented from the picker's create row is bound to
      this row the moment the codebook write lands, which is a moment before
      the section carrying it reaches this editor — so the decision below was
      made about an attribute there was nothing to read, and left the row
      holding no control rather than the one that asks for the kind of answer
      the researcher has just chosen.

      Not the same question as an attribute a COLLABORATOR retypes under an
      open row, which keeps the control it has and is refused by the save: that
      row names one, and re-deciding it would move a pairing the researcher
      authored.
    */
    if (
      previous === chosen &&
      (chosen === undefined || control !== undefined)
    ) {
      return;
    }
    // An attribute being invented needs no branch of its own: the codebook
    // holds nothing under the sentinel, so the rule below leaves the row with
    // no control — which is the right answer, because an invention decides its
    // kind BY the control the researcher is about to choose, and the one the
    // row held for whatever it named before is not an answer about it.
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
  }, [chosen, control, setRowValue, variables]);

  const shape = inventing
    ? parameterShapeFor(attributeType, control)
    : shapeOf(variables, chosen, control);
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

  /**
   * Taking the picker's create row, which here decides nothing and promises
   * everything.
   *
   * The attribute is not written now. Which control collects it is the next
   * question this dialog asks, and that control is what says what kind of
   * answer the attribute holds — so the name is kept on the row and the row's
   * own save creates the attribute, which is where a refusal from the codebook
   * is reported. Architect defers the same create for the same reason
   * (`Form/fieldCommit.ts`'s `useComposerFieldCommit`).
   *
   * `created` rather than an outcome of its own, because that is what the
   * window is being told: the act the researcher asked for has happened as far
   * as this dialog is concerned, and the window closes on the name they typed.
   */
  const namesInUse = useSubjectVariableNames(subject);
  /**
   * Whether there is still a codebook section for the create to land in.
   *
   * A connection type a collaborator has deleted leaves the form on screen —
   * it is still there to be taken out — with nowhere to add an attribute, and
   * the picker's rule is that a create row exists exactly where a create does.
   */
  const sectionIsLive = useCodebookSectionDocument(subject) !== undefined;
  const invent = useCallback(
    (variableName: string): Promise<CreateOptionOutcome> => {
      setRowValue(VARIABLE_FIELD, NEW_VARIABLE);
      setRowValue(NEW_VARIABLE_NAME, variableName);
      return Promise.resolve({ status: 'created' });
    },
    [setRowValue],
  );

  return (
    <>
      <Field<typeof VariablePickerField>
        name={VARIABLE_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.variableLabel)}
        hint={intl.formatMessage(messages.variableHint)}
        options={offeredOptions}
        initialValue={committed}
        required={intl.formatMessage(messages.variableRequired)}
        // Nothing at all where there is no type to add the attribute to. The
        // picker's own rule is that a create row exists exactly where
        // `onCreateOption` does, and a row that opened onto a refusal would
        // offer an act whose whole content is that it cannot be done.
        {...(subject === undefined || !sectionIsLive
          ? {}
          : { onCreateOption: invent, namesInUse })}
      />
      <Field<typeof NativeSelectField>
        name={COMPONENT_FIELD}
        component={NativeSelectField}
        label={intl.formatMessage(messages.controlLabel)}
        hint={intl.formatMessage(
          inventing ? messages.controlInventsHint : messages.controlHint,
        )}
        options={controlOptions}
        disabled={controlOptions.length === 0}
        initialValue={asText(item[COMPONENT_FIELD])}
        required={intl.formatMessage(messages.controlRequired)}
      />
      {/* Which kind of answer the chosen control will make this attribute —
          said while it can still be changed, because once the attribute
          exists it cannot be. */}
      {inventing && typeLabel !== undefined && (
        <Alert variant="info" className="my-7">
          <AlertDescription>
            {intl.formatMessage(INVENTED_TYPE_NOTICE, {
              variableType: intl.formatMessage(typeLabel),
              strong: renderStrong,
            })}
          </AlertDescription>
        </Alert>
      )}
      {/*
        The settings half is withheld because this field keeps its own control
        and its own settings on the stage — written to the codebook they would
        be authored against a control the codebook does not have, and the
        variable schemas, split on `component`, refuse that outright.

        The rules half is not: an attribute this row is inventing is authored
        here and written with the create, which is what Architect does
        (`Form/fieldCommit.ts:168-172`) and what keeps making an invented
        answer required from taking a save, a reopen and a second dialog.
      */}
      <AttributeCodebookControls
        subject={subject}
        committedVariable={item[VARIABLE_FIELD]}
        componentField={COMPONENT_FIELD}
        offerParameters={false}
        {...(inventing
          ? {
              inventing: {
                type: attributeType ?? '',
                name: inventedName,
                rulesField: NEW_VARIABLE_VALIDATION,
              },
            }
          : {})}
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
