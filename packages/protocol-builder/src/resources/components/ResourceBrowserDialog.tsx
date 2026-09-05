import { useCallback, useRef } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useDiscardDraftGuard } from '../../form/discardDraftGuard.ts';
import type { ResourceDescriptor } from '../gateway.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import {
  browsableKinds,
  formatByteLength,
  RESOURCE_PICKER_COPY,
  resourceKindLabel,
  resourceStatusLabel,
  type ResourcePickerKind,
} from './resourceKinds.ts';
import ResourceSecretControl from './ResourceSecretControl.tsx';
import ResourceUploadControl from './ResourceUploadControl.tsx';
import { useResourceLibrary } from './useResourceLibrary.ts';

export type ResourceBrowserDialogProps = Readonly<{
  open: boolean;
  kind: ResourcePickerKind;
  /** The resource the field currently holds, marked as the current one. */
  selectedId?: string;
  onSelect: (descriptor: ResourceDescriptor) => void;
  onClose: () => void;
  disabled?: boolean;
}>;

/**
 * Where a researcher chooses a resource: everything the protocol already
 * holds, everything imported so far in this editing session, and the way to
 * add another.
 *
 * Importing selects what it imported, exactly as choosing an existing resource
 * does, so a researcher who has just dropped a file is not then asked to find
 * it in the list.
 */
export default function ResourceBrowserDialog({
  open,
  kind,
  selectedId,
  onSelect,
  onClose,
  disabled = false,
}: ResourceBrowserDialogProps) {
  const copy = RESOURCE_PICKER_COPY[kind];
  /**
   * Whether the import control inside is holding work of the researcher's.
   *
   * A ref rather than state: nothing here renders differently for it, and a
   * dialog that re-rendered on every keystroke of the key being typed into it
   * would be re-rendering for a question only a dismissal ever asks.
   */
  const importDraft = useRef(false);
  const onDraftChange = useCallback((hasDraft: boolean) => {
    importDraft.current = hasDraft;
  }, []);
  const hasDraft = useCallback(() => importDraft.current, []);
  // Escape, a click outside, the close button and Cancel all arrive here. The
  // import control below holds a key being typed or a file being imported in
  // its own state and nowhere else, so a dismissal is the whole of what stands
  // between the researcher and losing it — and Escape is a reflex, not a
  // decision. Routed through the same gate the package's other draft-holding
  // dialogs use, so the question is asked in one voice.
  const requestClose = useDiscardDraftGuard({ hasDraft, onClose });

  return (
    <Dialog
      open={open}
      closeDialog={requestClose}
      title={copy.browserTitle}
      description={copy.browserDescription}
      size="workspace"
      footer={
        <Button type="button" color="default" onClick={requestClose}>
          Cancel
        </Button>
      }
    >
      {/* Mounted only while the dialog is open, so the library is read when a
          researcher asks to browse rather than behind every field on a stage. */}
      {open && (
        <ResourceBrowserBody
          kind={kind}
          {...(selectedId === undefined ? {} : { selectedId })}
          onSelect={onSelect}
          onDraftChange={onDraftChange}
          disabled={disabled}
        />
      )}
    </Dialog>
  );
}

type ResourceBrowserBodyProps = Readonly<{
  kind: ResourcePickerKind;
  selectedId?: string;
  onSelect: (descriptor: ResourceDescriptor) => void;
  /** Reports whether the import control is holding unsaved researcher input. */
  onDraftChange: (hasDraft: boolean) => void;
  disabled: boolean;
}>;

function ResourceBrowserBody({
  kind,
  selectedId,
  onSelect,
  onDraftChange,
  disabled,
}: ResourceBrowserBodyProps) {
  const copy = RESOURCE_PICKER_COPY[kind];
  const library = useResourceLibrary(browsableKinds(kind));

  return (
    <div className="flex flex-col gap-6">
      <Section title={copy.importTitle}>
        {kind === 'apikey' ? (
          <ResourceSecretControl
            onStaged={onSelect}
            // The very list rendered below, so a name the control refuses is
            // one the researcher can see they already have.
            existingNames={library.resources.map(
              (descriptor) => descriptor.name,
            )}
            onDraftChange={onDraftChange}
            disabled={disabled}
          />
        ) : (
          <ResourceUploadControl
            kind={kind}
            onStaged={onSelect}
            onDraftChange={onDraftChange}
            disabled={disabled}
          />
        )}
      </Section>

      <Section
        title="Resources in this protocol"
        description="Resources already saved, and anything imported since this stage was opened."
      >
        {library.failure !== undefined && (
          <ResourceFailureNotice
            failure={library.failure}
            onRetry={library.retry}
            retryLabel="Try loading the resource list again"
            busy={library.busy}
          />
        )}

        {library.failure === undefined && library.resources.length === 0 && (
          <Paragraph margin="none" emphasis="muted">
            {library.busy
              ? 'Loading resources…'
              : 'There are no resources to choose from yet.'}
          </Paragraph>
        )}

        {library.resources.length > 0 && (
          <ul
            aria-label="Resources in this protocol"
            className="flex flex-col gap-2"
          >
            {library.resources.map((descriptor) => (
              <li
                key={descriptor.id}
                className="flex flex-wrap items-center gap-3"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  aria-current={
                    descriptor.id === selectedId ? 'true' : undefined
                  }
                  onClick={() => onSelect(descriptor)}
                >
                  {descriptor.name}
                </Button>
                <Paragraph intent="smallText" emphasis="muted" margin="none">
                  {resourceKindLabel(descriptor.kind)}
                </Paragraph>
                <Paragraph intent="smallText" emphasis="muted" margin="none">
                  {resourceStatusLabel(descriptor.status)}
                </Paragraph>
                {descriptor.byteLength !== undefined && (
                  <Paragraph intent="smallText" emphasis="muted" margin="none">
                    {formatByteLength(descriptor.byteLength)}
                  </Paragraph>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
