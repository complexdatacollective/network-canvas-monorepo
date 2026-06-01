import { useCallback } from 'react';
import { submit } from 'redux-form';

import { Layout } from '~/components/EditorLayout';
import Dialog from '~/components/NewComponents/Dialog';
import { useAppDispatch } from '~/ducks/hooks';
import { Button } from '~/lib/legacy-ui/components';

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
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      title={title ?? undefined}
      footer={
        <>
          <Dialog.Close
            nativeButton={false}
            render={<Button color="platinum">Cancel</Button>}
          />
          <Button onClick={handleSubmit} color="sea-green">
            Save and Close
          </Button>
        </>
      }
      className="bg-surface-2"
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
