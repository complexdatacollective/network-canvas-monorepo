import type React from 'react';
import { useCallback } from 'react';
import { connect } from 'react-redux';
import { type InjectedFormProps, reduxForm, submit } from 'redux-form';

type BasicFormOwnProps = {
  children: React.ReactNode;
  form: string;
  onSubmit?: (values: Record<string, unknown>) => void;
};

type DispatchProps = {
  submit: (form: string) => void;
};

type InjectedProps = InjectedFormProps<
  Record<string, unknown>,
  BasicFormOwnProps
>;

const focusableControlSelector = [
  'button:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const focusFirstInvalidField = (formName: string) => {
  window.requestAnimationFrame(() => {
    const form = Array.from(
      document.querySelectorAll<HTMLFormElement>('form[data-basic-form]'),
    ).find((candidate) => candidate.dataset.basicForm === formName);

    if (!form) return;

    const invalidFields = form.querySelectorAll<HTMLElement>(
      '[aria-invalid="true"]',
    );

    for (const invalidField of invalidFields) {
      const focusTarget = invalidField.matches(focusableControlSelector)
        ? invalidField
        : invalidField.querySelector<HTMLElement>(focusableControlSelector);

      if (focusTarget) {
        focusTarget.focus();
        return;
      }
    }
  });
};

const BasicForm = ({
  children,
  form,
  submit: submitForm,
  onSubmit: onSubmitProp,
  handleSubmit,
}: BasicFormOwnProps & DispatchProps & InjectedProps) => {
  // Custom submit handler to prevent propagation to any parent redux-form forms.
  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      e.stopPropagation();
      submitForm(form);
    },
    [form, submitForm],
  );

  // If an onSubmit handler is provided, use handleSubmit from reduxForm to get form values
  if (onSubmitProp) {
    return (
      <form
        data-basic-form={form}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit(onSubmitProp)(e);
        }}
      >
        {children}
      </form>
    );
  }

  return (
    <form data-basic-form={form} onSubmit={onSubmit}>
      {children}
    </form>
  );
};

const ConnectedBasicForm = connect(null, { submit })(BasicForm);

export default reduxForm<Record<string, unknown>, BasicFormOwnProps>({
  onSubmitFail: (_errors, _dispatch, _submitError, props) => {
    focusFirstInvalidField(props.form);
  },
})(ConnectedBasicForm);
