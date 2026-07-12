import { startCase } from 'es-toolkit/compat';
import type { ComponentType } from 'react';
import {
  type BaseFieldArrayProps,
  FieldArray,
  type WrappedFieldArrayProps,
} from 'redux-form';

import useValidate from '~/hooks/useValidate';

import IssueAnchor from '../IssueAnchor';

type ValidatedFieldArrayProps<
  T = Record<string, unknown>,
  FieldValue = Record<string, unknown>,
> = Omit<
  BaseFieldArrayProps<T, FieldValue>,
  'component' | 'props' | 'validate'
> & {
  validation: Record<string, unknown>;
  component:
    | ComponentType<WrappedFieldArrayProps<FieldValue> & T>
    | ComponentType<Record<string, unknown>>;
  componentProps?: T;
  fieldLabel?: string;
  label?: string;
};

/**
 * Array-aware counterpart to ValidatedField. It keeps Redux Form's semantic
 * FieldArray operations available to the rendered component, so indexed
 * errors and interaction metadata move with their items.
 */
function ValidatedFieldArray<
  T = Record<string, unknown>,
  FieldValue = Record<string, unknown>,
>({
  validation,
  component,
  componentProps,
  ...fieldProps
}: ValidatedFieldArrayProps<T, FieldValue>) {
  const validations = useValidate(validation);
  const ArrayComponent = component as ComponentType<
    WrappedFieldArrayProps<FieldValue> & T
  >;

  return (
    <>
      <IssueAnchor
        fieldName={`${fieldProps.name}._error`}
        description={startCase(fieldProps.name)}
      />
      <FieldArray<T, FieldValue>
        {...fieldProps}
        {...componentProps}
        validate={validations}
        component={ArrayComponent}
        rerenderOnEveryChange
      />
    </>
  );
}

export default ValidatedFieldArray;
