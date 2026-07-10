import { useCallback } from 'react';
import { submit } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { Layout } from '~/components/EditorLayout';
import { useAppDispatch } from '~/ducks/hooks';

import Form from './Form';

type InlineEditScreenProps = {
  show?: boolean;
  form: string;
  title?: string | null;
  onSubmit: (values: unknown) => void;
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

  const handleSubmit = useCallback(() => {
    dispatch(submit(form));
  }, [form, dispatch]);

  return (
    <Dialog
      open={show}
      closeDialog={onCancel}
      title={title ?? undefined}
      size="editor"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSubmit} color="primary">
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
