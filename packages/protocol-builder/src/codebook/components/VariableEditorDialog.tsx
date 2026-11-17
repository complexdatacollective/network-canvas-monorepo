import { useRef, useState } from 'react';

import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';

import { useDiscardDraftGuard } from '../../form/discardDraftGuard.ts';
import VariableEditor, { type VariableEditorProps } from './VariableEditor.tsx';

type HostedEditorProps = VariableEditorProps extends infer TProps
  ? TProps extends VariableEditorProps
    ? Omit<
        TProps,
        'chrome' | 'footerSlot' | 'onCancel' | 'onDraftChange' | 'title'
      >
    : never
  : never;

export type VariableEditorDialogProps = HostedEditorProps &
  Readonly<{
    title: string;
    /**
     * Whether the dialog is open. A host closes it by turning this false and
     * keeping it mounted until `onExitComplete`, so the exit animation runs.
     */
    open: boolean;
    onExitComplete(): void;
    /** Closes the dialog without saving. */
    onClose(): void;
    finalFocus?: DialogProps['finalFocus'];
  }>;

/**
 * The attribute editor in a dialog of its own.
 *
 * Holds what only the dialog can answer for. Whether a save is with the host
 * lives here rather than in the editor, because a dismissal mid-flight
 * unmounts the editor while the handler awaiting the host stays alive: every
 * way out is refused until the answer is on screen. Whether the researcher has
 * changed anything lives here too, so that Escape, a press outside, the close
 * button and Cancel all ask before throwing it away.
 */
export default function VariableEditorDialog({
  title,
  open,
  onExitComplete,
  onClose,
  finalFocus,
  ...editorProps
}: VariableEditorDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  // State rather than a ref: the editor renders INTO it, and a ref set during
  // the dialog's render does not re-render the editor beside it.
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const edited = useRef(false);

  const requestClose = useDiscardDraftGuard({
    hasDraft: () => edited.current,
    onClose,
    open,
    blocked: submitting,
  });

  const { onSubmitDocument } = editorProps;

  return (
    <Dialog
      open={open}
      onExitComplete={onExitComplete}
      title={title}
      // Wider for a host that adds a choice to every option row, which then
      // needs the room for a third field beside the label and value.
      size={editorProps.optionRowChoice === undefined ? 'readable' : 'editor'}
      dismissible={!submitting}
      closeDialog={requestClose}
      {...(finalFocus === undefined ? {} : { finalFocus })}
      footer={<div ref={setFooterSlot} className="contents" />}
    >
      <VariableEditor
        {...editorProps}
        chrome="dialog"
        footerSlot={footerSlot}
        onCancel={requestClose}
        onDraftChange={() => {
          edited.current = true;
        }}
        onSubmitDocument={async (document, ownedProperties) => {
          setSubmitting(true);
          try {
            return await onSubmitDocument(document, ownedProperties);
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </Dialog>
  );
}
