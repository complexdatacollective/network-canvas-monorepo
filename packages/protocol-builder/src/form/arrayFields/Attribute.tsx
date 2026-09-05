import { Trash2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
} from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import type { ArrayFieldItemProps } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Surface from '@codaco/fresco-ui/layout/Surface';
import type { Variables } from '@codaco/protocol-validation';

import {
  buildVariableRoleMap,
  hasValidatedUse,
} from '../../codebook/variableRoles.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import { useStageEditorForm } from '../stageEditorContext.ts';
import {
  crossClassPickIssue,
  draftValidatedElsewhereMessage,
  validatedElsewhereMessage,
  variableDisplayName,
} from './crossClassPick.ts';
import RowField from './RowField.tsx';
import { requiredRow, type RowValidator } from './rowValidators.ts';

const FrescoBooleanControl = FrescoBooleanField as ComponentType<
  Record<string, unknown>
>;

export type VariableOption = {
  disabled?: boolean;
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};

export type AttributeValue = {
  variable?: string;
  value?: boolean;
};

/** Creates a codebook variable and answers with its id, or nothing on refusal. */
export type CreateAttributeVariable = (
  variableName: string,
) => Promise<string | undefined>;

export type AssignAttributesContextValue = {
  /** Resolved name of the array field these rows belong to. */
  arrayName: string;
  subject: CodebookSubject;
  /** The shared pool, already narrowed to assignable types. */
  variableOptions: VariableOption[];
  /**
   * The control that picks (and optionally creates) a codebook variable.
   *
   * Injected rather than imported: the picker is a host surface — it knows how
   * that host lists, groups and creates variables — while everything else here
   * is list mechanics the package owns.
   */
  variablePickerComponent: ComponentType<Record<string, unknown>>;
  onCreateVariable?: CreateAttributeVariable;
  draftValidatedVariables: ReadonlySet<string>;
  /**
   * Every variable id the array's COMMITTED value holds — the escape hatch for
   * the cross-class gate: reselecting what is already saved is never a NEW
   * contradiction. See `committedAttributeVariableIds` for why this is a set
   * and not the committed array itself.
   */
  committedVariableIds: ReadonlySet<string>;
  /**
   * Reveal every row's errors without waiting for an edit, set once the array
   * field is showing `completeAttributes`' refusal — otherwise the save is
   * blocked by a message that never says which row is incomplete.
   */
  forceShowErrors: boolean;
};

export const AssignAttributesContext =
  createContext<AssignAttributesContextValue | null>(null);

const useAssignAttributesContext = () => {
  const context = useContext(AssignAttributesContext);
  if (!context) {
    throw new Error('Attribute rows must be rendered inside AssignAttributes.');
  }
  return context;
};

const BOOLEAN_OPTIONS = [
  { label: 'True', value: true },
  { label: 'False', value: false },
];

const REQUIRED_ONLY: readonly RowValidator[] = [requiredRow()];

/**
 * Every variable id an array's COMMITTED value holds.
 *
 * Rows carry no stable identity. `committedValue` is frozen when the dialog
 * opens, while row indices renumber the moment a row is deleted — so
 * `committedValue[rowIndex]` resolves a SURVIVING row against a DELETED row's
 * saved pick: a false "collected elsewhere" accusation against a row's own
 * untouched selection, and a silent pass for the row that reselects the
 * vanished one. The escape's question is a MEMBERSHIP one: a variable this
 * prompt already saved is not a NEW contradiction, whichever row now holds it.
 *
 * This deliberately does NOT read fresco-ui's `committedIndex`, which tracks
 * the LIVE value (it keeps field paths attached to items during drag
 * previews); reading the live value here would escape every fresh pick and the
 * gate would never fire at all.
 */
export const committedAttributeVariableIds = (
  committedValue: readonly AttributeValue[] = [],
): ReadonlySet<string> =>
  new Set(
    committedValue
      .map(({ variable }) => variable)
      .filter(
        (variable): variable is string =>
          typeof variable === 'string' && variable !== '',
      ),
  );

export type AssignAttributesCrossClassContext = {
  /** The subject's codebook variables, read only for display names. */
  allVariables: Readonly<Variables>;
  /** See `committedAttributeVariableIds`. */
  committedVariableIds: ReadonlySet<string>;
  /** Variables this stage's LIVE (unsaved) form fields already collect. */
  draftValidatedVariables: ReadonlySet<string>;
  /** Whether a SAVED form outside this stage already validates the variable. */
  hasValidatedUseElsewhere: (variableId: string) => boolean;
};

/**
 * The cross-class gate for ONE pick: this stamp is an UNVALIDATED writer, so
 * its variable may not be one a form elsewhere already collects. Saved roles
 * from other stages and this stage's live form fields are the authoritative
 * sources; this stage's saved roles are stale once editing begins.
 *
 * Shared verbatim by the row's DISPLAYED error and the owning array field's
 * BLOCKING rule (`makeAssignAttributesValidation`). A `RowField` error can
 * only display — nothing there reaches the form's validity — so an error with
 * no array-level counterpart is a contradiction the researcher is shown and
 * then invited to save. The two layers must therefore be one function, escape
 * included: an escape that differed by even a row's identity would have one
 * layer refuse what the other renders as fine.
 */
export const assignAttributeCrossClassIssue = (
  variableId: string,
  {
    allVariables,
    committedVariableIds,
    draftValidatedVariables,
    hasValidatedUseElsewhere,
  }: AssignAttributesCrossClassContext,
): string | undefined => {
  if (!variableId) return undefined;
  const isCommittedPick = committedVariableIds.has(variableId);
  if (draftValidatedVariables.has(variableId) && !isCommittedPick) {
    return draftValidatedElsewhereMessage(
      variableDisplayName(allVariables, variableId),
    );
  }
  return crossClassPickIssue({
    variableId,
    // `crossClassPickIssue` escapes a single unchanged pick; membership is
    // expressed by handing a committed pick its own id.
    originalVariableId: isCommittedPick ? variableId : '',
    hasConflictingUse: hasValidatedUseElsewhere,
    allVariables,
    message: validatedElsewhereMessage,
  });
};

/** One "assign this boolean to every node created here" row. */
export default function Attribute({
  item,
  index,
  committedIndex,
  onUpdate,
  onDelete,
  disabled,
  readOnly,
}: ArrayFieldItemProps<AttributeValue>) {
  const {
    arrayName,
    subject,
    variableOptions,
    variablePickerComponent,
    onCreateVariable,
    draftValidatedVariables,
    committedVariableIds,
    forceShowErrors,
  } = useAssignAttributesContext();
  const { protocolContext, identity } = useStageEditorForm();
  // A DISPLAY path only — the `data-field-name` seam E2E specs target. It is
  // the live position (fresco-ui's `committedIndex` holds it steady through a
  // drag preview) and is never an identity: nothing about this row's VALUE may
  // be looked up by it. See `committedAttributeVariableIds`.
  const rowFieldName = `${arrayName}[${committedIndex ?? index}]`;
  const variable =
    typeof item.variable === 'string' ? item.variable : undefined;

  // The DISPLAY half of the cross-class gate. Its blocking counterpart is the
  // owning array field's `crossClassPicks` rule, which runs this identical
  // function — see `assignAttributeCrossClassIssue`.
  //
  // The role map excludes the stage being edited, because this form's own
  // unsaved fields are the authority on what this stage collects, and the
  // saved copy of them is stale the moment editing begins.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );
  const allVariables = useMemo(
    () => variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const crossClassValidate = useCallback<RowValidator>(
    (value) =>
      assignAttributeCrossClassIssue(typeof value === 'string' ? value : '', {
        allVariables,
        committedVariableIds,
        draftValidatedVariables,
        hasValidatedUseElsewhere: (id) => hasValidatedUse(roleMap, subject, id),
      }),
    [
      allVariables,
      committedVariableIds,
      draftValidatedVariables,
      roleMap,
      subject,
    ],
  );

  const variableValidators = useMemo<readonly RowValidator[]>(
    () => [requiredRow(), crossClassValidate],
    [crossClassValidate],
  );

  const handleCreateOption = onCreateVariable
    ? (variableName: string) => {
        void (async () => {
          const created = await onCreateVariable(variableName);
          if (created) onUpdate?.({ variable: created });
        })();
      }
    : undefined;

  return (
    <Surface className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-8">
      {/* Fields carry their own bottom margin, so this column just stacks. */}
      <div>
        <RowField
          name={`${rowFieldName}.variable`}
          label="Create or select an attribute"
          component={variablePickerComponent}
          value={variable}
          onChange={(value: unknown) =>
            onUpdate?.({
              variable: typeof value === 'string' ? value : undefined,
            })
          }
          validators={variableValidators}
          forceShowErrors={forceShowErrors}
          options={variableOptions}
          onCreateOption={handleCreateOption}
          entity={subject.entity}
          type={subject.entity === 'ego' ? undefined : subject.type}
          disabled={disabled || readOnly}
        />
        {variable && (
          <RowField
            name={`${rowFieldName}.value`}
            label="Value to assign"
            hint="Every node created on this prompt is given this value."
            component={FrescoBooleanControl}
            value={item.value}
            onChange={(value: unknown) =>
              onUpdate?.({
                value: typeof value === 'boolean' ? value : undefined,
              })
            }
            validators={REQUIRED_ONLY}
            forceShowErrors={forceShowErrors}
            options={BOOLEAN_OPTIONS}
            noReset
            disabled={disabled || readOnly}
          />
        )}
      </div>
      <IconButton
        icon={<Trash2 />}
        aria-label="Delete attribute"
        color="destructive"
        disabled={disabled || readOnly}
        onClick={onDelete}
      />
    </Surface>
  );
}
