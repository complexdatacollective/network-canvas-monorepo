import { useCallback, useRef } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useDiscardDraftGuard } from '../../form/discardDraftGuard.ts';
import { resourceOk, type ResourceDescriptor } from '../gateway.ts';
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

const messages = defineMessages({
  libraryTitle: {
    id: 'protocolBuilder.resourceBrowser.libraryTitle',
    defaultMessage: 'Resources in this protocol',
    description:
      'Heading over the list of resources — images, audio, video, participant data, API keys — a researcher can choose from. Also the accessible name of that list.',
  },
  libraryDescription: {
    id: 'protocolBuilder.resourceBrowser.libraryDescription',
    defaultMessage:
      'Resources already saved, and anything imported since this stage was opened.',
    description:
      'Description under the heading of the resource list. "Stage" is one step of an interview.',
  },
  retryLibrary: {
    id: 'protocolBuilder.resourceBrowser.retryLibrary',
    defaultMessage: 'Try loading the resource list again',
    description:
      'Button beside a failure notice, which asks the host again for the list of resources. Named rather than generic because several parts of the dialog can be failing at once.',
  },
  loading: {
    id: 'protocolBuilder.resourceBrowser.loading',
    defaultMessage: 'Loading resources…',
    description:
      'Shown while the list of a protocol’s resources is being read for the first time.',
  },
  emptyState: {
    id: 'protocolBuilder.resourceBrowser.emptyState',
    defaultMessage: 'There are no resources to choose from yet.',
    description:
      'Shown in place of the resource list when the protocol holds none of the kind this field accepts and none has been imported yet.',
  },
});

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
  const intl = useAppIntl();
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
      title={intl.formatMessage(copy.browserTitle)}
      description={intl.formatMessage(copy.browserDescription)}
      size="workspace"
      footer={
        <Button type="button" color="default" onClick={requestClose}>
          {intl.formatMessage(commonMessages.cancel)}
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
  const intl = useAppIntl();
  const copy = RESOURCE_PICKER_COPY[kind];
  const library = useResourceLibrary(browsableKinds(kind));
  const readLibrary = library.read;
  // Read where the browser reads it, but when the key is submitted rather
  // than when this dialog opened: the list below is what there was, and a
  // name is refused for what there is.
  const readExistingNames = useCallback(async () => {
    const listed = await readLibrary();
    return listed.status === 'ok'
      ? resourceOk(listed.data.map((descriptor) => descriptor.name))
      : listed;
  }, [readLibrary]);

  return (
    <div className="flex flex-col gap-6">
      <Section title={intl.formatMessage(copy.importTitle)}>
        {kind === 'apikey' ? (
          <ResourceSecretControl
            onStaged={onSelect}
            existingNames={readExistingNames}
            existingNamesBusy={library.busy}
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
        title={intl.formatMessage(messages.libraryTitle)}
        description={intl.formatMessage(messages.libraryDescription)}
      >
        {library.failure !== undefined && (
          <ResourceFailureNotice
            failure={library.failure}
            onRetry={library.retry}
            retryLabel={intl.formatMessage(messages.retryLibrary)}
            busy={library.busy}
          />
        )}

        {library.failure === undefined && library.resources.length === 0 && (
          <Paragraph margin="none" emphasis="muted">
            {intl.formatMessage(
              library.busy ? messages.loading : messages.emptyState,
            )}
          </Paragraph>
        )}

        {library.resources.length > 0 && (
          <ul
            aria-label={intl.formatMessage(messages.libraryTitle)}
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
                  {resourceKindLabel(descriptor.kind, intl)}
                </Paragraph>
                <Paragraph intent="smallText" emphasis="muted" margin="none">
                  {resourceStatusLabel(descriptor.status, intl)}
                </Paragraph>
                {descriptor.byteLength !== undefined && (
                  <Paragraph intent="smallText" emphasis="muted" margin="none">
                    {formatByteLength(descriptor.byteLength, intl)}
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
