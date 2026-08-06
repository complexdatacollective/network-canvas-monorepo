import { startCase } from 'es-toolkit/compat';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type {
  FieldProps,
  ValidationPropsCatalogue,
  ValidFieldComponent,
} from '@codaco/fresco-ui/form/Field/types';

import IssueAnchor from '../IssueAnchor';
import {
  type ArchitectValidation,
  useValidationProps,
} from './toZodValidation';

/**
 * Props the form store owns. `Field` spreads caller props last
 * (fresco-ui `Field.tsx`), so a caller-supplied `value` or `onChange` would
 * REPLACE the store-connected pair and silently detach the field from form
 * state. They are excluded from the type and stripped at runtime so a spread
 * props object cannot smuggle one through — side effects on change belong in
 * an observer effect reading `useFormValue`.
 */
const STORE_OWNED_PROPS = ['value', 'onChange'] as const;

function stripStoreOwnedProps<T extends object>(props: T): T {
  const stripped = { ...props };
  for (const key of STORE_OWNED_PROPS) {
    Reflect.deleteProperty(stripped, key);
  }
  return stripped;
}

export type ArchitectFieldProps<C extends ValidFieldComponent> = Omit<
  FieldProps<C>,
  keyof ValidationPropsCatalogue
> & {
  /**
   * Architect's validation configuration. Rules with a fresco-ui equivalent
   * become native `Field` validation props; the rest run through
   * `~/utils/validations`. See `toZodValidation.ts`.
   */
  validation?: ArchitectValidation;
};

/**
 * Architect's field primitive: the Issues-panel anchor plus a form-connected
 * fresco-ui `Field`.
 *
 * `label` is required — there is no fallback to the field name. Where a
 * surrounding Section heading already names the field, pass `labelHidden` so
 * the label survives for screen readers.
 */
function ArchitectField<C extends ValidFieldComponent>(
  props: ArchitectFieldProps<C>,
) {
  const { validation, ...fieldProps } = props;
  const { name } = fieldProps;
  const { nativeProps, custom } = useValidationProps(validation, name);

  const mergedProps = {
    ...stripStoreOwnedProps(fieldProps),
    ...nativeProps,
    ...(custom ? { custom } : {}),
  };

  return (
    <>
      <IssueAnchor fieldName={`${name}._error`} description={startCase(name)} />
      {/*
        The native validation props are derived at runtime from an untyped
        config object, so they cannot be statically matched against the
        value-narrowed validation props `FieldProps<C>` infers for this
        component.
      */}
      {/* oxlint-disable-next-line typescript/no-unsafe-type-assertion */}
      <Field<C> {...(mergedProps as FieldProps<C>)} />
    </>
  );
}

export default ArchitectField;
