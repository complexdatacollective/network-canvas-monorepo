import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type { ResourceDescriptor, StagedSecret } from '../gateway.ts';
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
  /**
   * The opaque handle for a secret staged here. The editing session needs it
   * to promote the secret at finish; it is not the secret, and it is
   * deliberately not the field's value.
   */
  onSecretStaged?: (secret: StagedSecret) => void;
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
  onSecretStaged,
  onClose,
  disabled = false,
}: ResourceBrowserDialogProps) {
  const copy = RESOURCE_PICKER_COPY[kind];

  return (
    <Dialog
      open={open}
      closeDialog={onClose}
      title={copy.browserTitle}
      description={copy.browserDescription}
      size="workspace"
      footer={
        <Button type="button" color="default" onClick={onClose}>
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
          {...(onSecretStaged === undefined ? {} : { onSecretStaged })}
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
  onSecretStaged?: (secret: StagedSecret) => void;
  disabled: boolean;
}>;

function ResourceBrowserBody({
  kind,
  selectedId,
  onSelect,
  onSecretStaged,
  disabled,
}: ResourceBrowserBodyProps) {
  const copy = RESOURCE_PICKER_COPY[kind];
  const library = useResourceLibrary(browsableKinds(kind));

  const handleSecretStaged = (secret: StagedSecret) => {
    onSecretStaged?.(secret);
    onSelect(secret.descriptor);
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title={copy.importTitle}>
        {kind === 'apikey' ? (
          <ResourceSecretControl
            onStaged={handleSecretStaged}
            disabled={disabled}
          />
        ) : (
          <ResourceUploadControl
            kind={kind}
            onStaged={onSelect}
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
