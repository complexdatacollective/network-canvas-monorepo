import { useCallback } from 'react';
import { isSubmitting, submit } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { Layout } from '~/components/EditorLayout';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';

import Form from './Form';

type InlineEditScreenProps = {
  show?: boolean;
  form: string;
  title?: string | null;
  onSubmit: (values: unknown) => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
  initialValues?: Record<string, unknown>;
};

const InlineEditScreen = ({
  show = false,
  form,
  title = null,
  onSubmit,
  onCancel,
  children = null,
  initialValues,
}: InlineEditScreenProps) => {
  const dispatch = useAppDispatch();
  const submitting = useAppSelector(isSubmitting(form));

  const handleSubmit = useCallback(() => {
    if (submitting) return;
    dispatch(submit(form));
  }, [form, dispatch, submitting]);

  const handleCancel = useCallback(() => {
    if (!submitting) onCancel();
  }, [onCancel, submitting]);

  return (
    <Dialog
      open={show}
      closeDialog={handleCancel}
      dismissible={!submitting}
      title={title ?? undefined}
      size="editor"
      footer={
        <>
          <Button color="default" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} color="primary" disabled={submitting}>
            Save and Close
          </Button>
        </>
      }
    >
      <Layout>
        <Form form={form} onSubmit={onSubmit} initialValues={initialValues}>
          {children}
        </Form>
      </Layout>
    </Dialog>
  );
};

export default InlineEditScreen;
