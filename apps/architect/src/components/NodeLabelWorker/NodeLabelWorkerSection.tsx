import { Pencil, Plus, Trash2 } from 'lucide-react';
import { createElement, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { setNodeLabelWorker } from '~/ducks/modules/activeProtocol';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';
import { getNodeLabelWorker } from '~/selectors/protocol';

import { nodeLabelWorkerMessages as messages } from './messages';
import NodeLabelWorkerDialog from './NodeLabelWorkerDialog';

/**
 * The part of the Codebook page that shows the protocol's node label worker
 * and opens the dialog that adds, changes or removes it.
 */
const NodeLabelWorkerSection = () => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const readOnly = useProtocolReadOnly();
  const { confirm } = useDialog();
  const source = useAppSelector(getNodeLabelWorker);
  const [editing, setEditing] = useState(false);

  const handleRemove = () => {
    void confirm({
      title: createElement(AppMessage, { message: messages.removeTitle }),
      description: createElement(AppMessage, {
        message: messages.removeDescription,
      }),
      confirmLabel: createElement(AppMessage, { message: messages.remove }),
      cancelLabel: createElement(AppMessage, {
        message: commonMessages.cancel,
      }),
      intent: 'destructive',
      onConfirm: () => {
        dispatch(setNodeLabelWorker({ source: undefined }));
      },
    });
  };

  return (
    <div className="mb-14">
      <div className="mb-5 flex flex-wrap items-center gap-5">
        <Heading level="h2" margin="none">
          {intl.formatMessage(messages.title)}
        </Heading>
        {source === undefined ? (
          <Button
            color="primary"
            size="sm"
            icon={<Plus />}
            disabled={readOnly}
            onClick={() => setEditing(true)}
          >
            {intl.formatMessage(messages.add)}
          </Button>
        ) : (
          <>
            <Button
              color="primary"
              size="sm"
              icon={<Pencil />}
              disabled={readOnly}
              onClick={() => setEditing(true)}
            >
              {intl.formatMessage(messages.edit)}
            </Button>
            <Button
              color="destructive"
              size="sm"
              icon={<Trash2 />}
              disabled={readOnly}
              onClick={handleRemove}
            >
              {intl.formatMessage(messages.remove)}
            </Button>
          </>
        )}
      </div>
      <Paragraph>{intl.formatMessage(messages.description)}</Paragraph>
      {source !== undefined && (
        <Surface spacing="sm" shadow="sm">
          <pre
            dir="ltr"
            tabIndex={0}
            aria-label={intl.formatMessage(messages.script)}
            className="font-monospace focusable max-h-72 overflow-auto text-sm"
          >
            {source}
          </pre>
        </Surface>
      )}
      <NodeLabelWorkerDialog open={editing} onClose={() => setEditing(false)} />
    </div>
  );
};

export default NodeLabelWorkerSection;
