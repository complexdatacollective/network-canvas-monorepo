import { type ReactNode, useCallback, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { NODE_LABEL_WORKER_MAX_LENGTH } from '@codaco/protocol-validation';
import DialogForm from '~/components/DialogForm/DialogForm';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { setNodeLabelWorker } from '~/ducks/modules/activeProtocol';
import { getNodeLabelWorker } from '~/selectors/protocol';

import { nodeLabelWorkerMessages as messages } from './messages';
import NodeLabelWorkerPreview from './NodeLabelWorkerPreview';
import { STARTER_SOURCE } from './starterSource';
import { checkNodeLabelWorker } from './useNodeLabelPreview';

const renderCode = (chunks: ReactNode[]) => (
  <code className="code" dir="ltr">
    {chunks}
  </code>
);

type NodeLabelWorkerDialogProps = {
  open: boolean;
  onClose: () => void;
};

/** Writes the protocol's node label worker, or changes the one it has. */
const NodeLabelWorkerDialog = ({
  open,
  onClose,
}: NodeLabelWorkerDialogProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const current = useAppSelector(getNodeLabelWorker);

  const handleSubmit = useCallback(
    async (values: Record<string, FieldValue>) => {
      const source = typeof values.source === 'string' ? values.source : '';
      // A script that does not load labels nothing in an interview, so it is
      // not saved. One that fails for some nodes still labels the others.
      const failure = await checkNodeLabelWorker(source);
      if (failure?.kind === 'compile') {
        return {
          success: false,
          fieldErrors: {
            source: [
              intl.formatMessage(messages.cannotBeUsed, {
                error: failure.message,
              }),
            ],
          },
        };
      }
      dispatch(setNodeLabelWorker({ source }));
      onClose();
      return { success: true };
    },
    [dispatch, intl, onClose],
  );

  // Every open is its own editing session; see EntityTypeDialog.
  const [wasOpen, setWasOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <DialogForm
      key={openCount}
      open={open}
      onClose={onClose}
      title={intl.formatMessage(messages.title)}
      formId="node-label-worker"
      submitLabel={intl.formatMessage(commonMessages.save)}
      onSubmit={handleSubmit}
      aside={<NodeLabelWorkerPreview />}
    >
      <Field
        name="source"
        label={intl.formatMessage(messages.script)}
        hint={intl.formatMessage(messages.scriptHint, { code: renderCode })}
        component={TextAreaField}
        initialValue={current ?? STARTER_SOURCE}
        required
        maxLength={NODE_LABEL_WORKER_MAX_LENGTH}
        dir="ltr"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        rows={14}
        className="font-monospace [&>textarea]:text-sm [&>textarea]:whitespace-pre"
      />
      <Paragraph emphasis="muted">
        {intl.formatMessage(messages.encryptedNote)}
      </Paragraph>
    </DialogForm>
  );
};

export default NodeLabelWorkerDialog;
