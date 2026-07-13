import type React from 'react';
import { reduxForm, type SubmitHandler } from 'redux-form';

import { candidateIdsFor, flattenIssues } from '~/utils/issues';
import scrollTo from '~/utils/scrollTo';
import stopPropagationFromHandler from '~/utils/stopPropagationFromHandler';

type FormProps = {
  handleSubmit: SubmitHandler;
  children?: React.ReactNode;
  id?: string;
};

// On a failed save, scroll the dialog body to the first invalid field. Each
// field path is resolved to its anchor element (the same getFieldId anchors the
// stage-form Issues list uses), and the one highest on screen is chosen so we
// land on the visually-first error regardless of error object key order.
const scrollToFirstError = (errors: Record<string, unknown>) => {
  let target: HTMLElement | null = null;
  let targetTop = Number.POSITIVE_INFINITY;

  for (const { field } of flattenIssues(errors)) {
    for (const id of candidateIdsFor(field)) {
      const element = document.getElementById(id);
      if (element instanceof HTMLElement) {
        const { top } = element.getBoundingClientRect();
        if (top < targetTop) {
          targetTop = top;
          target = element;
        }
        break;
      }
    }
  }

  if (target) {
    scrollTo(target);
  }
};

// Props that the wrapped component will accept
type WrappedFormProps = {
  form: string;
  children?: React.ReactNode;
  id?: string;
  onSubmit?: (values: unknown) => void | Promise<void>;
  initialValues?: unknown;
};

/**
 * This is for redux-form
 * Would like to wrap this component up into InlineEditScreen if possible
 */
const Form = ({ handleSubmit, children = null, id }: FormProps) => (
  <form id={id} noValidate onSubmit={stopPropagationFromHandler(handleSubmit)}>
    {children}
  </form>
);

// The reduxForm HOC will automatically handle initialValues when passed as props
export default reduxForm({
  touchOnBlur: false,
  touchOnChange: true,
  enableReinitialize: false,
  onSubmitFail: (errors) => {
    if (errors) {
      scrollToFirstError(errors as Record<string, unknown>);
    }
  },
})(Form) as unknown as React.ComponentType<WrappedFormProps>;
