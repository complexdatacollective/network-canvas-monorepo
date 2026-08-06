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
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import {
  crossClassPickIssue,
  draftValidatedElsewhereMessage,
  validatedElsewhereMessage,
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
   * The array's committed value. A row's committed pick is the escape hatch
   * for the cross-class gate: reselecting what is already saved is never a new
   * contradiction.
   */
  committedValue: AttributeValue[];
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
    committedValue,
  } = useAssignAttributesContext();
  const rowIndex = committedIndex ?? index;
  const rowFieldName = `${arrayName}[${rowIndex}]`;
  const variable =
    typeof item.variable === 'string' ? item.variable : undefined;
  const createVariable = useCreateVariable(entity, type);

  // Save-time cross-class gate (the same field-level `crossClassPick` shape
  // as NetworkComposer's quickAdd): this stamp is an UNVALIDATED writer, so
  // its variable may not be one a form elsewhere already collects. Saved roles
  // from other stages and this stage's live form fields are the authoritative
  // sources; this stage's saved roles are stale once editing begins.
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const roleMap = useSelector((state: RootState) =>
    getVariableRoleMapOutsideStage(state, currentStageIndex),
  );
  const allVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );
  const committedVariable = committedValue[rowIndex]?.variable ?? '';

  const crossClassValidate = useCallback(
    (value: unknown): string | undefined => {
      const variableId = typeof value === 'string' ? value : '';
      if (!variableId) return undefined;
      if (
        draftValidatedVariables.has(variableId) &&
        variableId !== committedVariable
      ) {
        return draftValidatedElsewhereMessage(
          allVariables[variableId]?.name ?? variableId,
        );
      }
      return crossClassPickIssue({
        variableId,
        originalVariableId: committedVariable,
        hasConflictingUse: (id) =>
          (roleMap[roleMapKey(subject, id)]?.validated ?? 0) > 0,
        allVariables,
        message: validatedElsewhereMessage,
      });
    },
    [
      allVariables,
      committedVariable,
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
    <div className="my-5 flex rounded p-5">
      <div className="flex shrink-0 grow basis-auto flex-col">
        <div className="shrink-0 grow basis-auto">
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
            options={variableOptions}
            onCreateOption={handleCreateOption}
            entity={entity}
            type={type}
            disabled={disabled || readOnly}
          />
        </div>
        {variable && (
          <fieldset className="border-outline shrink-0 grow basis-auto rounded border-2 border-dashed p-5 [&>legend]:px-5">
            <legend>Set value of variable to:</legend>
            <RowField
              name={`${rowFieldName}.value`}
              label="Value"
              component={FrescoBooleanControl}
              value={item.value}
              onChange={(value: unknown) =>
                onUpdate({
                  value: typeof value === 'boolean' ? value : null,
                })
              }
              validation={{ required: true }}
              options={BOOLEAN_OPTIONS}
              noReset
              disabled={disabled || readOnly}
            />
          </fieldset>
        )}
      </div>
      <IconButton
        icon={<Trash2 />}
        aria-label="Delete attribute"
        color="destructive"
        disabled={disabled || readOnly}
        className="ml-5 self-center"
        onClick={onDelete}
      />
    </div>
  );
};

export default Attribute;
