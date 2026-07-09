import { Trash2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { compose } from 'react-recompose';

import { BooleanField } from '~/components/Form/Fields';
import ValidatedField from '~/components/Form/ValidatedField';

import withCreateVariableHandler from '../enhancers/withCreateVariableHandler';
import VariablePicker from '../Form/Fields/VariablePicker/VariablePicker';
import withAttributeHandlers from './withAttributeHandlers';

type VariableOption = {
  disabled?: boolean;
  isUsed?: boolean;
  label: string;
  type: string;
  value: string;
};

type AttributeProps = {
  field: string;
  variable?: string | null;
  variableOptions: VariableOption[];
  handleCreateVariable: (value: string, type: string, field: string) => void;
  handleDelete: () => void;
  entity: string;
  type: string;
};

const Attribute = ({
  field,
  variable = null,
  variableOptions,
  handleCreateVariable,
  handleDelete,
  entity,
  type,
}: AttributeProps) => {
  return (
    <div className="[&_.form-field]:bg-surface-2 my-5 flex rounded p-5 [&_.form-field]:mb-0">
      <div className="flex shrink-0 grow basis-auto flex-col">
        <div className="shrink-0 grow basis-auto">
          <ValidatedField
            name={`${field}.variable`}
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              options: variableOptions,
              onCreateOption: (value: string) =>
                handleCreateVariable(value, 'boolean', `${field}.variable`),
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
              name={`${field}.value`}
              component={BooleanField}
              validation={{ required: true }}
              componentProps={{
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
      <button
        type="button"
        className="flex shrink-0 grow-0 basis-19 cursor-pointer items-center justify-center pl-5 [&_.icon]:h-5 [&_.icon]:cursor-pointer"
        onClick={handleDelete}
        aria-label="Delete attribute"
      >
        <Trash2 aria-hidden />
      </button>
    </div>
  );
};

export default compose<ComponentProps<typeof Attribute>, typeof Attribute>(
  withAttributeHandlers,
  withCreateVariableHandler,
)(Attribute);
