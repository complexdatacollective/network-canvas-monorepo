import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redacted } from 'effect';
import { useCallback, useRef } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useDiscardDraftGuard } from '../../form/discardDraftGuard.ts';
import { useProtocolBuilderContext } from '../../state/context.ts';
import { useOpenEditId } from '../client.tsx';
import { resourceOk, type ResourceDescriptor } from '../types.ts';
import {
  checkExistingNodeShape,
  isNodeShapeResource,
  type NodeShapeNotice,
} from './nodeShapeResource.ts';
import ResourceChoiceCard from './ResourceChoiceCard.tsx';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import {
  browsableKinds,
  RESOURCE_PICKER_COPY,
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
  shapeLibraryDescription: {
    id: 'protocolBuilder.resourceBrowser.shapeLibraryDescription',
    defaultMessage:
      'SVG images already saved in this protocol, and any imported since this node type was opened.',
    description:
      'Description under the heading of the resource list when a researcher is choosing an SVG image to use as a node shape, while editing a node type in the codebook.',
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

/**
 * Called with the chosen resource. A node shape picker also says what in the
 * SVG a node will not draw.
 */
type SelectResource = (
  descriptor: ResourceDescriptor,
  nodeShape?: NodeShapeNotice,
) => void;

export type ResourceBrowserDialogProps = Readonly<{
  open: boolean;
  kind: ResourcePickerKind;
  /** The resource the field currently holds, marked as the current one. */
  selectedId?: string;
  onSelect: SelectResource;
  onClose: () => void;
  disabled?: boolean;
  /** Where focus goes when the dialog closes; the opening button by default. */
  finalFocus?: DialogProps['finalFocus'];
}>;

/**
 * Where a researcher chooses a resource: everything the protocol already
 * holds, everything imported since this stage was opened, and the way to add
 * another.
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
  finalFocus,
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
  const requestClose = useDiscardDraftGuard({ hasDraft, onClose, open });

  return (
    <Dialog
      open={open}
      closeDialog={requestClose}
      title={intl.formatMessage(copy.browserTitle)}
      description={intl.formatMessage(copy.browserDescription)}
      size="workspace"
      {...(finalFocus === undefined ? {} : { finalFocus })}
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
  onSelect: SelectResource;
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
  const queryClient = useQueryClient();
  const host = useProtocolBuilderContext();
  const editId = useOpenEditId();
  const library = useResourceLibrary(browsableKinds(kind));
  const readLibrary = library.read;
  const offered =
    kind === 'nodeShape'
      ? library.resources.filter(isNodeShapeResource)
      : library.resources;
  // Fails with why the stored image cannot draw a node, encoded.
  const shapeCheck = useMutation({
    mutationFn: async (descriptor: ResourceDescriptor) => {
      const result = await checkExistingNodeShape(
        queryClient,
        host,
        editId,
        descriptor,
      );
      if (!result.success) throw new Error(result.error);
      return result.notice;
    },
    // Reads an image the host already holds, so it runs offline too.
    networkMode: 'always',
  });
  const checkShape = shapeCheck.mutate;

  // A stored image is read and checked before it is handed over, because a
  // shape the interview cannot draw would only be found once a node needs it.
  // Only the check started last hands its image over: `mutate`'s own callbacks
  // are called for the latest call alone.
  const chooseExisting = useCallback(
    (descriptor: ResourceDescriptor) => {
      if (kind !== 'nodeShape') {
        onSelect(descriptor);
        return;
      }
      checkShape(descriptor, {
        onSuccess: (notice) => onSelect(descriptor, notice),
      });
    },
    [checkShape, kind, onSelect],
  );
  const shapeRefusal = shapeCheck.error?.message;
  const checkingShape = shapeCheck.isPending;
  // Read where the browser reads it, but when the key is submitted rather
  // than when this dialog opened: the list below is what there was, and a
  // name is refused for what there is.
  const readExistingNames = useCallback(async () => {
    const listed = await readLibrary();
    return listed.status === 'ok'
      ? resourceOk(
          listed.data.map((descriptor) => Redacted.value(descriptor.name)),
        )
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
        description={intl.formatMessage(
          kind === 'nodeShape'
            ? messages.shapeLibraryDescription
            : messages.libraryDescription,
        )}
      >
        {library.failure !== undefined && (
          <ResourceFailureNotice
            failure={library.failure}
            onRetry={library.retry}
            retryLabel={intl.formatMessage(messages.retryLibrary)}
            busy={library.busy}
          />
        )}

        {library.failure === undefined && offered.length === 0 && (
          <Paragraph margin="none" emphasis="muted">
            {intl.formatMessage(
              library.busy ? messages.loading : messages.emptyState,
            )}
          </Paragraph>
        )}

        {shapeRefusal !== undefined && (
          <div role="alert" className="text-destructive-ink text-sm">
            {formatMessageError(shapeRefusal, intl) ?? shapeRefusal}
          </div>
        )}

        {offered.length > 0 && (
          <ul
            aria-label={intl.formatMessage(messages.libraryTitle)}
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4"
          >
            {offered.map((descriptor) => (
              <li key={descriptor.id} className="flex min-w-0">
                <ResourceChoiceCard
                  descriptor={descriptor}
                  current={descriptor.id === selectedId}
                  onSelect={chooseExisting}
                  disabled={disabled || checkingShape}
                />
              </li>
            ))}
          </ul>
        )}

        <span
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
          lang="en"
        >
          {checkingShape ? 'Checking the image…' : ''}
        </span>
      </Section>
    </div>
  );
}
