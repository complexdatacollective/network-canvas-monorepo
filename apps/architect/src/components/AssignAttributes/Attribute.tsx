import { get } from 'es-toolkit/compat';
import { Trash2 } from 'lucide-react';
import {
  useCallback,
  useMemo,
  type ComponentType,
  type KeyboardEvent,
} from 'react';
import { useSelector } from 'react-redux';
import { formValueSelector, getFormInitialValues } from 'redux-form';

import { IconButton } from '@codaco/fresco-ui/Button';
import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import type { VariableType } from '@codaco/protocol-validation';
import type { FrescoReduxArrayFieldItemProps } from '~/components/Form/FrescoReduxArrayField';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
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

import withCreateVariableHandler from '../enhancers/withCreateVariableHandler';
import VariablePicker from '../Form/Fields/VariablePicker/VariablePicker';

const FrescoBooleanControl = FrescoBooleanField as ComponentType<
  Record<string, unknown>
>;

type VariableOption = {
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

type AttributeOwnProps = FrescoReduxArrayFieldItemProps<AttributeValue> & {
  variableOptions: VariableOption[];
  draftValidatedVariables: ReadonlySet<string>;
  entity: 'node' | 'edge' | 'ego';
  type: string;
  currentStageIndex?: number;
};

type CreateVariableHandlerProps = {
  handleCreateVariable: (
    variableName: string,
    variableType?: VariableType,
    field?: string,
  ) => Promise<string | undefined>;
  handleDeleteVariable: (variableId: string) => void;
  normalizeKeyDown: (event: KeyboardEvent) => void;
};

type AttributeProps = AttributeOwnProps & CreateVariableHandlerProps;

const Attribute = ({
  fieldName,
  form,
  variableOptions,
  handleCreateVariable,
  onDelete,
  disabled,
  readOnly,
  entity,
  type,
  draftValidatedVariables,
  currentStageIndex,
}: AttributeProps) => {
  const variable = useSelector(
    (state: RootState) =>
      formValueSelector(form)(state, `${fieldName}.variable`) as
        | string
        | undefined,
  );
  // Save-time cross-class gate (the same field-level `crossClassPick` shape
  // as NetworkComposer's quickAdd): this stamp is an UNVALIDATED writer, so
  // its variable may not be one a form elsewhere already collects. Sync field
  // validation blocks the prompt dialog's save, backstopping the pool
  // exclusion in AssignAttributes.tsx for a stale draft. Saved roles from
  // other stages and this stage's live form fields are the authoritative
  // sources; this stage's saved roles are stale once editing begins.
  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const roleMap = useSelector((state: RootState) =>
    getVariableRoleMapOutsideStage(state, currentStageIndex),
  );
  const allVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );
  // The row's PRE-EDIT committed pick, for the gate's unchanged-pick escape.
  const committedVariable = useSelector((state: RootState) => {
    const committed: unknown = get(
      getFormInitialValues(form)(state),
      `${fieldName}.variable`,
    );
    return typeof committed === 'string' ? committed : '';
  });
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
      committedVariable,
      roleMap,
      subject,
      allVariables,
      draftValidatedVariables,
    ],
  );

  return (
    <div className="my-5 flex rounded p-5">
      <div className="flex shrink-0 grow basis-auto flex-col">
        <div className="shrink-0 grow basis-auto">
          <ValidatedField
            name={`${fieldName}.variable`}
            component={VariablePicker}
            validation={{ required: true, crossClassPick: crossClassValidate }}
            componentProps={{
              options: variableOptions,
              onCreateOption: (value: string) =>
                handleCreateVariable(value, 'boolean', `${fieldName}.variable`),
              entity,
              type,
              variable,
            }}
          />
        </div>
        {variable && (
          <fieldset className="border-outline shrink-0 grow basis-auto rounded border-2 border-dashed p-5 [&>legend]:px-5">
            <legend>Set value of variable to:</legend>
            <ValidatedField
              name={`${fieldName}.value`}
              component={FrescoReduxField}
              validation={{ required: true }}
              componentProps={{
                fieldComponent: FrescoBooleanControl,
                label: 'Value',
                options: [
                  { label: 'True', value: true },
                  { label: 'False', value: false },
                ],
                noReset: true,
              }}
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

export default withCreateVariableHandler<AttributeOwnProps>(Attribute);
