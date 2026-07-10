import { Trash2 } from 'lucide-react';
import type { ComponentType, KeyboardEvent } from 'react';
import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import { IconButton } from '@codaco/fresco-ui/Button';
import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import type { VariableType } from '@codaco/protocol-validation';
import type { FrescoReduxArrayFieldItemProps } from '~/components/Form/FrescoReduxArrayField';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import type { RootState } from '~/ducks/modules/root';

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
  entity: string;
  type: string;
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
}: AttributeProps) => {
  const variable = useSelector(
    (state: RootState) =>
      formValueSelector(form)(state, `${fieldName}.variable`) as
        | string
        | undefined,
  );

  return (
    <div className="[&_.form-field]:bg-surface-2 my-5 flex rounded p-5 [&_.form-field]:mb-0">
      <div className="flex shrink-0 grow basis-auto flex-col">
        <div className="shrink-0 grow basis-auto">
          <ValidatedField
            name={`${fieldName}.variable`}
            component={VariablePicker}
            validation={{ required: true }}
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
        size="sm"
        variant="text"
        color="destructive"
        disabled={disabled || readOnly}
        className="ml-5 self-center"
        onClick={onDelete}
      />
    </div>
  );
};

export default withCreateVariableHandler<AttributeOwnProps>(Attribute);
