import type { ReactNode } from 'react';

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

/**
 * A hidden label and a visible hint cannot coexist: the hint would be prose
 * with nothing naming it on screen, and a hint is never appropriate as
 * screen-reader-only text. A field is either naked — named by its
 * surroundings, saying nothing more — or it shows both.
 */
type LabellingProps =
  | { labelHidden: true; hint?: never }
  | { labelHidden?: false; hint?: ReactNode };

export type ArchitectFieldProps<C extends ValidFieldComponent> = Omit<
  FieldProps<C>,
  keyof ValidationPropsCatalogue | 'labelHidden' | 'hint'
> &
  LabellingProps & {
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
 * `label` is required — there is no fallback to the field name, and it is what
 * the Issues panel calls the field (see the anchor below). `labelHidden` keeps
 * it for screen readers where the surrounding heading already names the field,
 * and is mutually exclusive with `hint` (see LabellingProps).
 */
function ArchitectField<C extends ValidFieldComponent>(
  props: ArchitectFieldProps<C>,
) {
  const { validation, ...fieldProps } = props;
  const { name, label } = fieldProps;
  const { nativeProps, custom } = useValidationProps(validation, name);

  const mergedProps = {
    ...stripStoreOwnedProps(fieldProps),
    ...nativeProps,
    ...(custom ? { custom } : {}),
  };

  return (
    <>
      {/*
        The Issues panel names each row by harvesting this `data-name`
        (`Issues.tsx`), so it is researcher-facing copy. It used to be
        `startCase(name)` — a start-cased internal field path, which surfaced
        rows like "Search Options Match Properties", "Behaviours Min Nodes" and
        "Prompts 0 Text" (#1400). `label` is required and is the name the
        researcher already reads above the control, so the panel and the field
        agree by construction.
      */}
      <IssueAnchor fieldName={`${name}._error`} description={label} />
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
