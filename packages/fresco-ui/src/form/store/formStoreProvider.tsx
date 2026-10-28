'use client';

import {
  type Context,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useLayoutEffect,
  useState,
} from 'react';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { createFormStore, type FormStoreApi } from './formStore';

// Re-exported through the provider because that is the entry consumers already
// import to reach a form store — the selector is useless without one.
export { selectIsFormDirty } from './formStore';

export const FormStoreContext: Context<FormStoreApi | undefined> =
  createContext<FormStoreApi | undefined>(undefined);

/**
 * Which form a field belongs to. A form is React state, not a `<form>`
 * element, so containment cannot answer it: a host may draw a field outside
 * the element, and a dialog's form nests inside the page's. Every field stamps
 * this on its container as `data-field-form`.
 */
const FormFieldScopeContext: Context<string | undefined> = createContext<
  string | undefined
>(undefined);

export function useFormFieldScope(): string | undefined {
  return useContext(FormFieldScopeContext);
}

type FormStoreProviderProps = {
  /**
   * The document this form is editing.
   *
   * A field with no `initialValue` of its own starts out holding whatever
   * this has at the field's own path, so a form editing a document says so
   * once instead of every field being handed its own starting value. A field
   * that passes `initialValue` still decides for itself.
   */
  initialValues?: Record<string, unknown>;
  children: ReactNode;
};

/**
 * The formatter and document the form store's getters return. The store is
 * created once and lives as long as the form, so it cannot close over a
 * formatter that changes with the language; it reads this instead, which
 * `FormContextSync` points at the current one after every render.
 *
 * The document is read through here for the same reason, and one more: a form
 * whose document advances while it is open must seed a field mounting
 * afterwards from what the document holds then.
 */
class FormContextSource {
  intl: IntlShape;
  initialValues: Record<string, unknown> | undefined;

  constructor(
    intl: IntlShape,
    initialValues: Record<string, unknown> | undefined,
  ) {
    this.intl = intl;
    this.initialValues = initialValues;
  }

  update(intl: IntlShape, initialValues: Record<string, unknown> | undefined) {
    this.intl = intl;
    this.initialValues = initialValues;
  }
}

/**
 * Brings the source up to date in a layout effect. Rendered as the provider's
 * first child, so its effects run before those of any field inside the form:
 * a field registering in the commit that advanced the document already seeds
 * from the new one.
 */
function FormContextSync({
  source,
  intl,
  initialValues,
}: {
  source: FormContextSource;
  intl: IntlShape;
  initialValues: Record<string, unknown> | undefined;
}) {
  useLayoutEffect(() => {
    source.update(intl, initialValues);
  });
  return null;
}

const FormStoreProvider = ({
  initialValues,
  children,
}: FormStoreProviderProps) => {
  const intl = useAppIntl();
  const [contextSource] = useState(
    () => new FormContextSource(intl, initialValues),
  );
  const [store] = useState<FormStoreApi>(() =>
    createFormStore({
      getIntl: () => contextSource.intl,
      getInitialValues: () => contextSource.initialValues,
    }),
  );

  const fieldScope = useId();

  return (
    <FormStoreContext.Provider value={store}>
      <FormContextSync
        source={contextSource}
        intl={intl}
        initialValues={initialValues}
      />
      <FormFieldScopeContext.Provider value={fieldScope}>
        {children}
      </FormFieldScopeContext.Provider>
    </FormStoreContext.Provider>
  );
};

export default FormStoreProvider;
