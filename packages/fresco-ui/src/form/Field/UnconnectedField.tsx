'use client';

import { LayoutGroup } from 'motion/react';
import { createElement, type ReactNode, useId } from 'react';

import type { ValidationContext } from '../store/types';
import type { ValidationPropKey } from '../validation/functions';
import { BaseField } from './BaseField';
import type {
  ExtractValue,
  ValidationPropsForValue,
  ValidFieldComponent,
} from './types';

// Keys that UnconnectedField injects into the component —
// only these need to be omitted from the consumer-facing type.
type ManagedKeys = 'id' | 'aria-required' | 'aria-describedby';

/**
 * Props for the Field component itself.
 * Generic over C (the component type) to enable type inference.
 */
type FieldOwnProps<C extends ValidFieldComponent> = {
  name: string;
  label: string;
  hint?: ReactNode;
  inline?: boolean;
  initialValue?: ExtractValue<C> | undefined;
  showValidationHints?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /**
   * Context required for context-dependent validations like unique, sameAs, etc.
   */
  validationContext?: ValidationContext;
  /**
   * When true, validates the field on change instead of waiting for blur.
   * Validation is debounced to avoid excessive calls while typing.
   * Useful for async validation where immediate feedback is desired.
   */
  validateOnChange?: boolean;
  /**
   * Debounce delay in milliseconds for validateOnChange.
   * Only applies when validateOnChange is true.
   * @default 300
   */
  validateOnChangeDelay?: number;
};

type UnconnectedFieldProps<C extends ValidFieldComponent> = FieldOwnProps<C> &
  Omit<React.ComponentProps<C>, ValidationPropKey | ManagedKeys> &
  ValidationPropsForValue<ExtractValue<C>> & {
    component: C;
    errors?: string[];
    showErrors?: boolean;
  };

/**
 * UnconnectedField renders a field with consistent styling but without
 * connecting to form context. Use this for standalone fields or when
 * managing state externally.
 *
 * For fields that should connect to form context, use Field instead.
 *
 * @example
 * ```tsx
 * <UnconnectedField
 *   label="Username"
 *   component={Input}
 *   value={username}
 *   onChange={setUsername}
 * />
 * ```
 */
export default function UnconnectedField<C extends ValidFieldComponent>({
  label,
  hint,
  inline,
  errors,
  showErrors,
  component,
  ...componentProps
}: UnconnectedFieldProps<C>) {
  const id = useId();
  const required = Boolean(componentProps.required);

  const describedBy = [hint && `${id}-hint`, errors?.length && `${id}-error`]
    .filter(Boolean)
    .join(' ');

  // Use createElement instead of JSX so we can hand React the merged props
  // without TS demanding they match the narrow ValidFieldComponent shape.
  // ValidFieldComponent only encodes the minimum required by Field — the
  // concrete component declared by the consumer accepts these merged props
  // because UnconnectedFieldProps is built from React.ComponentProps<C>.
  const mergedProps: React.ComponentProps<C> = {
    ...componentProps,
    id,
    'aria-required': required,
    'aria-describedby': describedBy || undefined,
  } as React.ComponentProps<C>;

  return (
    <LayoutGroup id={id}>
      <BaseField
        id={id}
        label={label}
        hint={hint}
        inline={inline}
        required={required}
        errors={errors}
        showErrors={showErrors}
      >
        {createElement(component, mergedProps)}
      </BaseField>
    </LayoutGroup>
  );
}
