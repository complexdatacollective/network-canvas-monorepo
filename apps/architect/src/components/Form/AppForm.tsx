import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import {
  withFormLevelValidate,
  type FormLevelValidate,
  type LenientSubmitHandler,
} from '~/components/DialogForm/formLevelValidate';

export type AppFormProps = {
  id?: string;
  className?: string;
  /**
   * Called with the form's values on submit, after `validate` (if provided)
   * has passed. May return `{success: false, fieldErrors}`, or void/
   * `{success: true}` for a plain success.
   */
  onSubmit: LenientSubmitHandler;
  /**
   * Form-level validation run before `onSubmit`. A non-empty result
   * short-circuits the submit with those field errors — see
   * ~/components/DialogForm/formLevelValidate.
   */
  validate?: FormLevelValidate;
  children: React.ReactNode;
};

/**
 * The BasicForm replacement for non-dialog forms: a thin `FormStoreProvider`
 * + `FormWithoutProvider` wrapper, forwarding id/className/onSubmit and
 * sharing DialogForm's form-level `validate`-before-`onSubmit` support.
 * Scroll/focus-to-first-invalid-field is fresco-ui's default behaviour
 * (`focusFirstError`, wired up inside `FormWithoutProvider`) — no local
 * reimplementation needed.
 */
const AppForm = ({
  id,
  className,
  onSubmit,
  validate,
  children,
}: AppFormProps) => {
  const handleSubmit = withFormLevelValidate(onSubmit, validate);

  return (
    <FormStoreProvider>
      <FormWithoutProvider
        id={id}
        className={className}
        onSubmit={handleSubmit}
      >
        {children}
      </FormWithoutProvider>
    </FormStoreProvider>
  );
};

export default AppForm;
