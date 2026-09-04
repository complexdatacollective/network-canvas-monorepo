'use client';

import { debounce } from 'es-toolkit';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppIntl } from '@codaco/app-i18n/react';

import {
  type FieldElements,
  fieldDescribedBy,
  fieldElementIds,
} from '../Field/fieldElements';
import type {
  FieldSlotController,
  FieldValue,
  ValidationPropsCatalogue,
} from '../Field/types';
import {
  type FieldNameMode,
  resolveFieldName,
  resolveFieldPath,
  useFieldNamespace,
  useFieldNamespacePath,
} from '../FieldNamespace';
import { useShouldDiscardFieldOnUnmount } from '../FieldUnmountPolicy';
import type { FieldState, ValidationContext } from '../store/types';
import { validationPropKeys } from '../validation/functions';
import {
  makeValidationFunction,
  makeValidationHints,
} from '../validation/helpers';
import useFormStore from './useFormStore';

/**
 * Helper function to determine if a field should show an error message.
 *
 * For fields with validateOnChange: shows errors as soon as the field is dirty
 * and validation completes (no need to blur first).
 *
 * For fields without validateOnChange: shows errors after the field has been
 * blurred, is dirty, and validation has completed.
 */
export function shouldShowFieldError(
  fieldState: FieldState | undefined,
  fieldErrors: string[] | null,
  validateOnChange: boolean,
) {
  if (!fieldState) {
    return false;
  }

  const { meta } = fieldState;

  // Don't show errors while async validation is in progress
  if (meta.isValidating) {
    return false;
  }

  // Must have errors and be dirty
  if (!fieldErrors || fieldErrors.length === 0 || !meta.isDirty) {
    return false;
  }

  // With validateOnChange, show errors immediately after validation completes
  // Without it, wait until field has been blurred
  return validateOnChange || meta.isBlurred;
}

type UseFieldResult = {
  id: string;
  meta: {
    shouldShowError: boolean;
    errors: string[] | undefined;
    isValidating: boolean;
    isTouched: boolean;
    isBlurred: boolean;
    isDirty: boolean;
    isValid: boolean;
  };
  containerProps: {
    'data-field-name': string;
    'data-field-path': string; // Canonical internal key used to focus errors
    // Validate-on-blur is scoped to the whole field: this fires on focusout
    // bubbling from any descendant, so moving focus to an in-field control
    // (a slot button, a sibling radio…) does not validate prematurely.
    'onBlur': (e: React.FocusEvent<HTMLElement>) => void;
  };
  fieldProps: {
    /**
     * The stored value, verbatim — which is NOT necessarily a value of the
     * shape the control's own props declare.
     *
     * CONTRACT: a control connected through `Field`/`useField` MUST render
     * without throwing for any `FieldValue` shape it is handed.
     *
     * The form store owns the value, and the resets that follow a change of
     * type — an Architect rule swapping its attribute from boolean to
     * categorical, a cascade clearing a dependent field — run as observer
     * effects AFTER the render commits. So there is always a window of one
     * render in which a control is holding the previous field's value. A
     * control that throws during that render never commits it, the effect that
     * would have replaced the value never runs, and the value stays foreign:
     * the reset can only ever arrive behind a render that survived.
     *
     * Controls satisfy this by normalising for RENDERING alone —
     * `Array.isArray(v) ? v : []`, `typeof v === 'string' ? v : ''` — and
     * showing the empty/unselected state for that one pass. What `onChange`
     * emits for a real interaction is unaffected.
     *
     * Enforced for every control in `form/fields/**` by
     * `form/fields/__tests__/fieldValueContract.test.tsx`.
     */
    'value': FieldValue;
    'onChange': (value: FieldValue) => void;
    'disabled': boolean;
    'readOnly': boolean;
    'aria-required': boolean; // Indicates if the field is required
    'aria-invalid': boolean; // Indicates if the field is invalid
    // IDs of elements that provide additional information about the field.
    // `undefined` when the caller renders none of them, so the attribute is
    // omitted rather than emitted empty.
    'aria-describedby': string | undefined;
    // ID of the visible field label. `undefined` when the caller renders no
    // label element — a reference to one that does not exist would displace
    // the control's own `aria-label` and leave it unnamed.
    'aria-labelledby': string | undefined;
    'aria-disabled': boolean; // Indicates if the field is disabled
    'aria-readonly': boolean; // Indicates if the field is read-only
  };
  /**
   * Handle for controls rendered inside the field (slot buttons, etc.) to read
   * and set the value. Field delivers this to function slots via context.
   */
  controller: FieldSlotController;
  validationSummary?: ReactNode;
};

/** Default debounce delay for validateOnChange in milliseconds */
const DEFAULT_VALIDATE_ON_CHANGE_DELAY = 1000;

type UseFieldConfig = {
  name: string;
  nameMode?: FieldNameMode;
  initialValue?: FieldValue;
  showValidationHints?: boolean;
  /**
   * Context required for context-dependent validations like unique, sameAs, etc.
   */
  validationContext?: ValidationContext;
  disabled?: boolean;
  readOnly?: boolean;
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
  /**
   * Escape hatch: validate when focus moves to an in-field control (a slot
   * button, a sibling control…) instead of only when focus leaves the whole
   * field. Off by default — the field is the unit of focus.
   */
  validateOnControlBlur?: boolean;
  /**
   * The caller's own hint content, if any. Only its presence matters here:
   * it shares the `${id}-hint` element with the validation summary, and
   * `aria-describedby` must not name an element that was never rendered.
   */
  hint?: ReactNode;
  /**
   * Which of the elements `fieldElementIds` names the caller actually renders.
   *
   * `fieldProps` points `aria-labelledby` and `aria-describedby` at those IDs,
   * and an IDREF that resolves to nothing is worse than no reference at all: a
   * dangling `aria-labelledby` outranks the control's own `aria-label` in the
   * accessible-name computation, so the control can end up with no name.
   *
   * Defaults to naming nothing, so a caller that spreads `fieldProps` onto
   * markup of its own is correct without knowing this option exists. `Field`,
   * which renders the control inside a `BaseField`, passes
   * `BASE_FIELD_ELEMENTS` from the same file as that markup; a caller that
   * renders only its own `FieldErrors` region passes `{ error: true }`.
   */
  renderedElements?: FieldElements;
} & Partial<ValidationPropsCatalogue>;

// A caller that says nothing renders none of BaseField's elements, so
// `fieldProps` names none of them. Hoisted so the default is one stable object.
const NO_FIELD_ELEMENTS: FieldElements = {};

export function useField(config: UseFieldConfig): UseFieldResult {
  const {
    name,
    nameMode = 'legacy',
    initialValue,
    showValidationHints = false,
    validationContext,
    hint,
    renderedElements = NO_FIELD_ELEMENTS,
    ...validationProps
  } = config;

  // The field layer is where validation copy becomes text: the rules build
  // message descriptors, and this formatter (the host's when a provider is
  // mounted, an English one otherwise) renders them, so what reaches the form
  // store, `onSubmitInvalid`, and Zod issues stays a plain string.
  const intl = useAppIntl();

  const namespace = useFieldNamespacePath();
  const namespaceName = useFieldNamespace();
  const resolvedPath = useMemo(
    () => resolveFieldPath(namespace, name, nameMode),
    [namespace, name, nameMode],
  );
  const resolvedName = resolveFieldName(namespace, name, nameMode);
  const publicResolvedName = namespaceName ? `${namespaceName}.${name}` : name;
  const resolvedValidationContext = useMemo(
    () =>
      namespace.length > 0 && validationContext
        ? {
            ...validationContext,
            formValueNamespace: namespaceName,
            formValueNamespacePath: namespace,
          }
        : validationContext,
    [namespace, namespaceName, validationContext],
  );

  const id = useId();

  // Memoize the validation function based on validation props
  // We serialize only the actual validation props (not component props like prefixComponent)
  // to create a stable dependency and avoid circular reference errors from React elements
  const validationOnlyProps: Record<string, unknown> = {};
  for (const key of validationPropKeys) {
    if (key in validationProps) {
      validationOnlyProps[key] =
        validationProps[key as keyof typeof validationProps];
    }
  }
  const validationPropsJson = JSON.stringify(validationOnlyProps);

  // Include validationContext in the props passed to makeValidationFunction
  const propsWithContext = {
    ...validationProps,
    validationContext: resolvedValidationContext,
  };

  // `useAppIntl` hands back a new formatter every time the active locale
  // changes. Rebuilding the REGISTERED validation function from it would make
  // a language switch re-register the field, and unregistering deletes the
  // field's stored errors along with the blurred flag that lets them show —
  // so a person switching language with a validation error on screen would
  // watch it vanish while the form stayed invalid. The registered function
  // reads the formatter through a ref instead: rule messages are formatted
  // when validation runs, so the next run picks up the new language without
  // the function the store holds ever changing identity.
  const intlRef = useRef(intl);

  const validation = useMemo(
    () => (formValues: Record<string, FieldValue>) =>
      makeValidationFunction(propsWithContext, intlRef.current)(formValues),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validationPropsJson, resolvedValidationContext],
  );

  // Memoize the validation summary (only compute if showValidationHints is true)
  const validationSummary = useMemo(
    () =>
      showValidationHints
        ? makeValidationHints(propsWithContext, intl)
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showValidationHints, validationPropsJson, resolvedValidationContext, intl],
  );

  const fieldState = useFormStore((state) =>
    state.pathOperations
      ? state.pathOperations.getFieldState(resolvedPath)
      : state.getFieldState(publicResolvedName),
  );
  const isSubmitting = useFormStore((state) => state.isSubmitting);

  const fieldErrors = useFormStore(
    useShallow((state) =>
      state.pathOperations
        ? state.pathOperations.getFieldErrors(resolvedPath)
        : state.getFieldErrors(publicResolvedName),
    ),
  );
  const pathOperations = useFormStore((store) => store.pathOperations);
  const registerField = useFormStore((store) => store.registerField);
  const unregisterField = useFormStore((store) => store.unregisterField);
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const setFieldBlurred = useFormStore((store) => store.setFieldBlurred);
  const validateField = useFormStore((store) => store.validateField);
  const shouldDiscardOnUnmount = useShouldDiscardFieldOnUnmount();

  // Disable fields while form is submitting
  const isDisabled = isSubmitting || config.disabled;
  const isReadOnly = config.readOnly;

  const validateOnChange = config.validateOnChange ?? false;
  const validateOnChangeDelay =
    config.validateOnChangeDelay ?? DEFAULT_VALIDATE_ON_CHANGE_DELAY;

  const shouldShowError = shouldShowFieldError(
    fieldState,
    fieldErrors,
    validateOnChange,
  );

  const validateResolvedField = useCallback(() => {
    const request = pathOperations
      ? pathOperations.validateField(resolvedPath)
      : validateField(publicResolvedName);
    void request;
  }, [pathOperations, publicResolvedName, resolvedPath, validateField]);

  // Errors reach the store as plain strings, formatted when validation last
  // ran, so a message already on screen stays in the language it was written
  // in. Re-run validation once the locale has actually changed to put it into
  // the new one. Only a field that is already showing something is
  // revalidated: validating a field nobody has touched yet would write errors
  // the person has not earned, and a language switch is no reason to accuse
  // them of anything.
  //
  // The ref records the locale the errors ON SCREEN were written in, not the
  // last locale this effect saw — which is why it only advances when there is
  // something to re-run. Advancing it on every change made a validation that
  // was in flight across the switch permanently stale: the effect ran while
  // `fieldErrors` was still empty, marked the new locale as seen, and then had
  // nothing left to compare against when the old-language result committed a
  // moment later. The field kept the previous language until some unrelated
  // edit revalidated it.
  useEffect(() => {
    if (intlRef.current === intl) return;
    if (fieldErrors && fieldErrors.length > 0) {
      intlRef.current = intl;
      validateResolvedField();
    }
  }, [intl, fieldErrors, validateResolvedField]);

  const setResolvedFieldValue = useCallback(
    (value: FieldValue) => {
      if (pathOperations) {
        pathOperations.setFieldValue(resolvedPath, value);
        return;
      }
      setFieldValue(publicResolvedName, value);
    },
    [pathOperations, publicResolvedName, resolvedPath, setFieldValue],
  );

  const setResolvedFieldBlurred = useCallback(() => {
    if (pathOperations) {
      pathOperations.setFieldBlurred(resolvedPath);
      return;
    }
    setFieldBlurred(publicResolvedName);
  }, [pathOperations, publicResolvedName, resolvedPath, setFieldBlurred]);

  // Create a debounced validation function for validateOnChange
  // This prevents excessive validation calls while the user is typing
  const debouncedValidate = useMemo(() => {
    return debounce(validateResolvedField, validateOnChangeDelay);
  }, [validateResolvedField, validateOnChangeDelay]);

  // Cancel debounced validation on unmount
  useEffect(() => {
    return () => {
      debouncedValidate.cancel();
    };
  }, [debouncedValidate]);

  // Register field on mount
  useEffect(() => {
    const submissionErrorKey =
      publicResolvedName !== resolvedName ? publicResolvedName : undefined;
    if (pathOperations) {
      pathOperations.registerField({
        name: resolvedPath,
        submissionErrorKey,
        initialValue,
        validation,
      });
    } else {
      registerField({
        name: publicResolvedName,
        submissionErrorKey,
        initialValue,
        validation,
      });
    }

    return () => {
      const options = {
        preserveValue: !(shouldDiscardOnUnmount?.() ?? false),
      };
      if (pathOperations) {
        pathOperations.unregisterField(resolvedPath, options);
        return;
      }
      unregisterField(publicResolvedName, options);
    };
  }, [
    resolvedPath,
    pathOperations,
    publicResolvedName,
    resolvedName,
    initialValue,
    validation,
    shouldDiscardOnUnmount,
    unregisterField,
    registerField,
  ]);

  const handleChange = useCallback(
    (value: FieldValue) => {
      setResolvedFieldValue(value);

      // If validateOnChange is enabled, use debounced validation
      // Otherwise, only validate after the field has been blurred once
      if (config.validateOnChange) {
        debouncedValidate();
      } else if (fieldState?.meta.isBlurred) {
        // After first blur, validate immediately on change (no debounce)
        validateResolvedField();
      }
    },
    [
      config.validateOnChange,
      setResolvedFieldValue,
      fieldState?.meta.isBlurred,
      validateResolvedField,
      debouncedValidate,
    ],
  );

  const handleContainerBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      // Focus moved to another control inside this field (a slot button, a
      // stepper, a sibling radio…) → the field is still active; don't validate
      // yet. The escape hatch validates on in-field focus moves anyway.
      if (
        !config.validateOnControlBlur &&
        e.currentTarget.contains(e.relatedTarget)
      ) {
        return;
      }

      // Skip validation if focus is going to a dialog close affordance.
      if (e.relatedTarget?.hasAttribute('data-dialog-close')) {
        return;
      }

      // Skip validation if this field is inside a dialog that's closing.
      const dialog = e.currentTarget.closest('dialog');
      if (dialog && !dialog.open) {
        return;
      }

      // Mark the field as having been blurred at least once
      setResolvedFieldBlurred();

      // For validateOnChange fields, don't validate on blur - the debounced
      // change validation handles it. For other fields, validate on blur.
      if (!config.validateOnChange) {
        validateResolvedField();
      }
    },
    [
      config.validateOnChange,
      config.validateOnControlBlur,
      setResolvedFieldBlurred,
      validateResolvedField,
    ],
  );

  // Show invalid styling when showing error text - keep them in sync
  const showInvalid = shouldShowError;

  // Fall back to initialValue only before the field is registered. Once
  // registered, honour the stored value verbatim — including an explicit
  // `undefined` from clearing the field.
  const currentValue = fieldState ? fieldState.value : initialValue;

  const controller = useMemo<FieldSlotController>(
    () => ({
      name: publicResolvedName,
      value: currentValue,
      setValue: handleChange,
      validate: validateResolvedField,
      focusInput: () => {
        document.getElementById(id)?.focus();
      },
    }),
    [publicResolvedName, currentValue, handleChange, validateResolvedField, id],
  );

  const result: UseFieldResult = {
    id,
    meta: {
      shouldShowError,
      errors: fieldErrors ?? undefined,
      isValid: fieldState?.meta.isValid ?? false,
      isTouched: fieldState?.meta.isTouched ?? false,
      isBlurred: fieldState?.meta.isBlurred ?? false,
      isDirty: fieldState?.meta.isDirty ?? false,
      isValidating: fieldState?.meta.isValidating ?? false,
    },
    containerProps: {
      'data-field-name': publicResolvedName,
      'data-field-path': resolvedName,
      'onBlur': handleContainerBlur,
    },
    fieldProps: {
      // Honour the stored value verbatim once registered — including an
      // explicit `undefined` from clearing the field. Using `?? initialValue`
      // here re-applied the initial value on every clear, so a field with an
      // initialValue could never be cleared.
      'value': currentValue,
      'onChange': handleChange,
      'disabled': isDisabled ?? false,
      'readOnly': isReadOnly ?? false,
      'aria-required': !!validationProps.required,
      'aria-invalid': showInvalid,
      /**
       * Named only when the caller renders the label element. A caller that
       * does not — because it names its control with `aria-label` instead —
       * would otherwise carry an `aria-labelledby` pointing at nothing, and a
       * dangling `aria-labelledby` beats `aria-label` in the accessible-name
       * computation: the control ends up unnamed rather than named.
       */
      'aria-labelledby': renderedElements.label
        ? fieldElementIds(id).label
        : undefined,
      'aria-disabled': isDisabled ?? false,
      'aria-readonly': isReadOnly ?? false,
      /**
       * Assembled by the single owner of the list, from what the caller says
       * it renders (`renderedElements`, defaulting to nothing) and the field's
       * own state. The error region is named whenever it is rendered, message
       * or not: BaseField mounts it unconditionally and a connected field's
       * errors arrive asynchronously, so the control has to already describe
       * the region that is about to hold the message.
       *
       * Note: we cannot use aria-description yet, as it is not widely supported.
       */
      'aria-describedby':
        fieldDescribedBy(id, {
          required:
            renderedElements.required && Boolean(validationProps.required),
          // The same condition BaseField uses to render the Hint element.
          hint: renderedElements.hint && Boolean(hint ?? validationSummary),
          error: renderedElements.error,
        }) || undefined,
    },
    controller,
    validationSummary,
  };

  return result;
}
