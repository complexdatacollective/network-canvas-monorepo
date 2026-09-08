'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { deleteInterviews } from '~/actions/interviews';

const messages = defineMessages({
  title: {
    id: 'fresco.deleteInterviews.title',
    defaultMessage: 'Are you absolutely sure?',
    description: 'Permanent interview deletion confirmation title.',
  },
  description: {
    id: 'fresco.deleteInterviews.description',
    defaultMessage:
      'This action cannot be undone. This will permanently delete <strong>{count, plural, one {# interview} other {# interviews}}</strong>.',
    description:
      'Permanent deletion warning; count is the number of selected interviews.',
  },
  warning: {
    id: 'fresco.deleteInterviews.warning',
    defaultMessage: 'Warning',
    description: 'Heading for a warning about unexported interview data.',
  },
  unexported: {
    id: 'fresco.deleteInterviews.unexported',
    defaultMessage:
      '{count, plural, one {The selected interview <strong>has not yet been exported.</strong>} other {One or more of the selected interviews <strong>have not yet been exported.</strong>}}',
    description:
      'Warns about unexported data before deleting selected interviews.',
  },
  deleting: {
    id: 'fresco.deleteInterviews.deleting',
    defaultMessage: 'Deleting…',
    description: 'Busy state while deleting interviews.',
  },
  confirm: {
    id: 'fresco.deleteInterviews.confirm',
    defaultMessage:
      '{count, plural, one {Delete interview} other {Delete interviews}}',
    description: 'Confirm deletion button; count is the selection size.',
  },
});

type DeleteInterviewsDialog = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  interviewsToDelete: { id: string; exportTime: Date | null }[];
};

export const DeleteInterviewsDialog = ({
  open,
  setOpen,
  interviewsToDelete,
}: DeleteInterviewsDialog) => {
  const intl = useAppIntl();

  const [hasUnexported, setHasUnexported] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setHasUnexported(
      interviewsToDelete?.some((interview) => !interview.exportTime),
    );
  }, [interviewsToDelete]);

  const handleConfirm = async () => {
    await deleteInterviews(interviewsToDelete.map((d) => ({ id: d.id })));
    setHasUnexported(false);

    setOpen(false);
  };

  const handleCancelDialog = () => {
    setHasUnexported(false);
    setOpen(false);
  };

  return (
    <Dialog
      accent="destructive"
      open={open}
      closeDialog={handleCancelDialog}
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description, {
        count: interviewsToDelete.length,
        strong: (chunks) => <strong>{chunks}</strong>,
      })}
      footer={
        <>
          <Button disabled={isDeleting} onClick={handleCancelDialog}>
            {intl.formatMessage(commonMessages.cancel)}
          </Button>
          <Button
            disabled={isDeleting}
            color="primary"
            onClick={async () => {
              setIsDeleting(true);
              await handleConfirm();
              setIsDeleting(false);
            }}
            icon={
              isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />
            }
          >
            {isDeleting
              ? intl.formatMessage(messages.deleting)
              : intl.formatMessage(messages.confirm, {
                  count: interviewsToDelete.length,
                })}
          </Button>
        </>
      }
    >
      {hasUnexported && (
        <Alert variant="destructive">
          <AlertTitle>{intl.formatMessage(messages.warning)}</AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.unexported, {
              count: interviewsToDelete.length,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AlertDescription>
        </Alert>
      )}
    </Dialog>
  );
};
