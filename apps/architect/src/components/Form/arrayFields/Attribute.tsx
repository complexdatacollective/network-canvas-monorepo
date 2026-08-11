import { Trash2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ComponentType,
} from 'react';
import { useSelector } from 'react-redux';

import { IconButton } from '@codaco/fresco-ui/Button';
import type { ArrayFieldItemProps } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import {
  crossClassPickIssue,
  draftValidatedElsewhereMessage,
  validatedElsewhereMessage,
  variableDisplayName,
} from '~/components/Validations/contradictions';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubject } from '~/selectors/codebook';
import {
  getVariableRoleMapOutsideStage,
  roleMapKey,
} from '~/selectors/indexes';

import RowField from './RowField';
import { useCreateVariable } from './useCreateVariable';

const FrescoBooleanControl = FrescoBooleanField as ComponentType<
  Record<string, unknown>
>;
const FrescoVariablePicker = VariablePickerControl as ComponentType<
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
  variable?: string | null;
  value?: boolean | null;
};

export type AssignAttributesContextValue = {
  /** Resolved name of the array field these rows belong to. */
  arrayName: string;
  entity: 'node' | 'edge' | 'ego';
  type: string;
  /** The shared pool, already narrowed to assignable types. */
  variableOptions: VariableOption[];
  draftValidatedVariables: ReadonlySet<string>;
  currentStageIndex?: number;
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

/**
 * Every variable id an array's COMMITTED value holds.
 *
 * Rows carry no stable identity. `committedValue` is frozen when the dialog
 * opens, while row indices renumber the moment a row is deleted — so
 * `committedValue[rowIndex]` resolves a SURVIVING row against a DELETED row's
 * saved pick: a false "collected elsewhere" accusation against a row's own
 * untouched selection, and a silent pass for the row that reselects the
 * vanished one. The escape's question is a MEMBERSHIP one, and it is the same
 * question the picker pool already asks (`PromptFields`' `draftSafeOptions`
 * and `getAdditionalAttributesOptionsForSubject`): a variable this prompt
 * already saved is not a NEW contradiction, whichever row now holds it.
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
  allVariables: Record<string, unknown>;
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
 * then invited to save. The two layers must therefore be one function,
 * escape included: an escape that differed by even a row's identity would have
 * one layer refuse what the other renders as fine.
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

const Attribute = ({
  item,
  index,
  committedIndex,
  onUpdate,
  onDelete,
  disabled,
  readOnly,
}: ArrayFieldItemProps<AttributeValue>) => {
  const {
    arrayName,
    entity,
    type,
    variableOptions,
    draftValidatedVariables,
    currentStageIndex,
    committedVariableIds,
    forceShowErrors,
  } = useAssignAttributesContext();
  // A DISPLAY path only — the `data-field-name` seam E2E specs target. It is
  // the live position (fresco-ui's `committedIndex` holds it steady through a
  // drag preview) and is never an identity: nothing about this row's VALUE may
  // be looked up by it. See `committedAttributeVariableIds`.
  const rowFieldName = `${arrayName}[${committedIndex ?? index}]`;
  const variable =
    typeof item.variable === 'string' ? item.variable : undefined;
  const createVariable = useCreateVariable(entity, type);

  // The DISPLAY half of the cross-class gate (the same field-level
  // `crossClassPick` shape as NetworkComposer's quickAdd). Its blocking
  // counterpart is the owning array field's `crossClassPicks` rule, which runs
  // this identical function — see `assignAttributeCrossClassIssue`.
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const roleMap = useSelector((state: RootState) =>
    getVariableRoleMapOutsideStage(state, currentStageIndex),
  );
  const allVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );

  const crossClassValidate = useCallback(
    (value: unknown): string | undefined =>
      assignAttributeCrossClassIssue(typeof value === 'string' ? value : '', {
        allVariables,
        committedVariableIds,
        draftValidatedVariables,
        hasValidatedUseElsewhere: (id) =>
          (roleMap[roleMapKey(subject, id)]?.validated ?? 0) > 0,
      }),
    [
      allVariables,
      committedVariableIds,
      draftValidatedVariables,
      roleMap,
      subject,
    ],
  );

  const handleCreateOption = (variableName: string) => {
    void (async () => {
      const created = await createVariable(variableName, 'boolean');
      if (created) onUpdate({ variable: created });
    })();
  };

  return (
    <Surface className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-8">
      {/* Fields carry their own bottom margin, so this column just stacks. */}
      <div>
        <RowField
          name={`${rowFieldName}.variable`}
          label="Create or select a variable"
          component={FrescoVariablePicker}
          value={variable}
          onChange={(value: unknown) =>
            onUpdate({
              variable: typeof value === 'string' ? value : null,
            })
          }
          validation={{ required: true, crossClassPick: crossClassValidate }}
          forceShowErrors={forceShowErrors}
          options={variableOptions}
          onCreateOption={handleCreateOption}
          entity={entity}
          type={type}
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
              onUpdate({
                value: typeof value === 'boolean' ? value : null,
              })
            }
            validation={{ required: true }}
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
};

export default Attribute;
