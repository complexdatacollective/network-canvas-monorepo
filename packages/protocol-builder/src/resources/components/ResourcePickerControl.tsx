import { useState } from 'react';

import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useResourceGateway } from '../context.tsx';
import type { ResourceDescriptor } from '../gateway.ts';
import { downloadResourceContent } from './downloadResourceContent.ts';
import ResourceBrowserDialog from './ResourceBrowserDialog.tsx';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import {
  acceptsResourceKind,
  isPreviewableKind,
  RESOURCE_PICKER_COPY,
  unsupportedResourceKindMessage,
  type ResourcePickerKind,
} from './resourceKinds.ts';
import ResourcePreview from './ResourcePreview.tsx';
import ResourceSummary from './ResourceSummary.tsx';
import { useResourceAttempt } from './useResourceAttempt.ts';
import { useResourceInspection } from './useResourceInspection.ts';
import { useStageResourceUsage } from './useStageResourceUsage.ts';

/**
 * The value a network field holds when the stage reads the network the
 * interview itself has built rather than an imported file. It is not an asset
 * id, so no resource is looked up for it.
 */
const INTERVIEW_NETWORK = 'existing';

const messages = defineMessages({
  /**
   * Said when the researcher asks to discard an imported resource another
   * field on the same stage is still using. Whole, so it can be translated: it
   * names what happened and what can be done instead.
   *
   * Moving the other field off it first is not among the offers, because the
   * other field is in exactly this state too: both name the resource, so
   * neither can discard it, and each would be told to go and do what the other
   * cannot. Letting this field go of it is the way out that always exists, so
   * it is offered here as a control rather than described as a chore.
   */
  stillInUse: {
    id: 'protocolBuilder.resourcePicker.stillInUse',
    defaultMessage:
      'This resource is still used elsewhere on this stage, so it was not discarded. Remove it from this field instead, or choose a different resource here.',
    description:
      'Refusal shown when a researcher asks to discard an imported resource another field of the same stage still names. "Stage" is one step of an interview.',
  },
  /**
   * Said beside the failure when a field's resource could not be looked up at
   * all, which is the one state where nothing on the card can describe what
   * the field is holding.
   *
   * The removal has to be offered anyway. A resource deleted out from under
   * the draft leaves a reference the stage cannot be saved with, and the only
   * other control here asks for a replacement — which a researcher who simply
   * wants the field empty, or who has no replacement yet, cannot give it.
   */
  unresolvedReference: {
    id: 'protocolBuilder.resourcePicker.unresolvedReference',
    defaultMessage:
      'This field still refers to that resource. Removing it clears the reference; it does not delete anything.',
    description:
      'Shown beside a failure when the resource a stage field names could not be looked up, explaining what the Remove button beneath it does.',
  },
  noSelection: {
    id: 'protocolBuilder.resourcePicker.noSelection',
    defaultMessage: 'No resource selected.',
    description:
      'Shown in place of a resource summary when this stage field holds nothing yet.',
  },
  retryInspection: {
    id: 'protocolBuilder.resourcePicker.retryInspection',
    defaultMessage: 'Try loading this resource again',
    description:
      'Button beside a failure notice, which asks the host again for the details of the resource this field holds. Named rather than generic because several parts of one field can be failing at once.',
  },
  retryAction: {
    id: 'protocolBuilder.resourcePicker.retryAction',
    defaultMessage: 'Try that again',
    description:
      'Button beside a failure notice, which repeats the download or discard the researcher just asked for.',
  },
  remove: {
    id: 'protocolBuilder.resourcePicker.remove',
    defaultMessage: 'Remove this resource',
    description:
      'Button that clears this stage field, leaving the resource itself in the protocol.',
  },
  download: {
    id: 'protocolBuilder.resourcePicker.download',
    defaultMessage: 'Download this resource',
    description:
      'Button that saves a copy of the resource this stage field holds to the researcher’s computer.',
  },
  discard: {
    id: 'protocolBuilder.resourcePicker.discard',
    defaultMessage: 'Discard this resource',
    description:
      'Button that throws away a resource imported in this editing session, for the whole session rather than only for this field.',
  },
  interviewNetworkOption: {
    id: 'protocolBuilder.resourcePicker.interviewNetworkOption',
    defaultMessage: 'Use the network from the in-progress interview',
    description:
      'Radio option choosing the network the interview has built so far — the people and ties the participant has already named — rather than an imported data file.',
  },
  importedFileOption: {
    id: 'protocolBuilder.resourcePicker.importedFileOption',
    defaultMessage: 'Use an imported data file',
    description:
      'Radio option choosing imported participant data (a roster) rather than the network the interview has built so far.',
  },
  selectedAnnouncement: {
    id: 'protocolBuilder.resourcePicker.selectedAnnouncement',
    defaultMessage: '{name} is now selected.',
    description:
      'Announced to assistive technology when a resource is chosen for this field. name is the resource’s name as the protocol records it.',
  },
  removedAnnouncement: {
    id: 'protocolBuilder.resourcePicker.removedAnnouncement',
    defaultMessage: 'The resource was removed from this field.',
    description:
      'Announced to assistive technology when this stage field is cleared, leaving the resource itself in the protocol.',
  },
  discardedAnnouncement: {
    id: 'protocolBuilder.resourcePicker.discardedAnnouncement',
    defaultMessage: 'The imported resource was discarded.',
    description:
      'Announced to assistive technology when a resource imported in this editing session is thrown away.',
  },
  downloadedAnnouncement: {
    id: 'protocolBuilder.resourcePicker.downloadedAnnouncement',
    defaultMessage: '{name} was downloaded.',
    description:
      'Announced to assistive technology once a copy of a resource has been saved to the researcher’s computer. name is the resource’s name.',
  },
  interviewNetworkAnnouncement: {
    id: 'protocolBuilder.resourcePicker.interviewNetworkAnnouncement',
    defaultMessage:
      'This stage will use the network from the interview itself.',
    description:
      'Announced to assistive technology when the field is set to read the network the interview builds rather than an imported file. "Stage" is one step of an interview.',
  },
});

export type ResourcePickerControlProps = CreateFormFieldProps<
  string,
  'div',
  {
    /** Which resources this field may hold, and what it imports them as. */
    kind: ResourcePickerKind;
    /**
     * Offers the in-progress interview network alongside an imported data
     * file, as Architect's roster fields do. Only meaningful for `network`.
     */
    canUseExisting?: boolean;
  }
>;

/**
 * Chooses the resource a stage field refers to.
 *
 * The field's value is the asset id, exactly as the protocol format spells a
 * resource reference — including for an imported file, which is given its
 * final id the moment it is staged so a draft can point at it before the stage
 * is saved. Everything the control knows comes from the resource gateway:
 * there is no host store, no browser storage, and no URL of the host's in this
 * component or anything it renders.
 */
export default function ResourcePickerControl({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  kind,
  canUseExisting = false,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: ResourcePickerControlProps) {
  const gateway = useResourceGateway();
  const intl = useAppIntl();
  const action = useResourceAttempt();
  const referenceCount = useStageResourceUsage();
  const [browserOpen, setBrowserOpen] = useState(false);
  const [status, setStatus] = useState('');
  /**
   * Why the last choice was refused, encoded rather than formatted. Some of
   * these refusals are this control's own and some cross the gateway's
   * string-only `message`, so all of them are held as they arrive and decoded
   * where they are rendered — which also keeps one on screen readable after a
   * change of language.
   */
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  /**
   * The researcher has asked for an imported file while the field still holds
   * the interview-network marker. Kept here rather than written into the field
   * so that cancelling the browser leaves the field as it was: a required
   * field emptied on the way to a choice that was never made is a field the
   * researcher has to notice and put back.
   */
  const [askedForResource, setAskedForResource] = useState(false);
  /**
   * Whether the call the attempt below is running is the discard rather than
   * the download. It answers the one question about a call in flight that
   * `busy` cannot: whether the answer still to come will change what this
   * field holds. Read only while the attempt is busy, so it does not have to
   * be unset when the call it describes settles.
   */
  const [discarding, setDiscarding] = useState(false);

  const copy = RESOURCE_PICKER_COPY[kind];
  const usesInterviewNetwork = canUseExisting && value === INTERVIEW_NETWORK;
  const selectedId =
    value === undefined || value === '' || usesInterviewNetwork
      ? undefined
      : value;
  const { inspection, busy, failure, retry } =
    useResourceInspection(selectedId);
  const descriptor: ResourceDescriptor | undefined = inspection?.descriptor;
  const locked = disabled || readOnly;
  /**
   * Whether another resource may be chosen right now.
   *
   * Not while a discard of the resource this field holds is undecided.
   * Choosing again disowns that call, so the discard the host goes on to carry
   * out would no longer clear the field, and the field would be left naming a
   * resource the host has deleted — a stage that cannot be saved, reached by
   * an action the researcher was told had worked.
   *
   * A download in flight is not the same thing: its answer is a file, and a
   * researcher who has moved on from a slow one has lost nothing, so it does
   * not hold the field's own choice up.
   */
  const canBrowse = !locked && !(action.busy && discarding);

  const handleSelect = (chosen: ResourceDescriptor) => {
    setBrowserOpen(false);
    setAskedForResource(false);
    // The field's own rule, kept by the field. The browser asks the host for
    // the kinds this picker accepts, but a host that answers with more than it
    // was asked for — or a browser left open across a change — would otherwise
    // put an image id into an API key field, which is a protocol the schema
    // refuses and an interview that cannot load the stage.
    if (!acceptsResourceKind(kind, chosen.kind)) {
      setRefusal(unsupportedResourceKindMessage(kind));
      return;
    }
    // Asked of the session rather than decided here: another field may have
    // started discarding this very resource a moment ago, and only the session
    // knows that a discard is in flight. Taking it anyway would leave this
    // field naming bytes the host is in the middle of deleting.
    const reference = gateway.referenceStaged?.(chosen.id);
    if (reference?.status === 'failed') {
      setRefusal(reference.failure.message);
      return;
    }
    setRefusal(undefined);
    action.clear();
    onChange?.(chosen.id);
    setStatus(`${chosen.name} is now selected.`);
  };

  const handleRemove = () => {
    // Whatever was in flight was about the resource this field no longer
    // holds, so its failure has nothing on screen to be about and its retry
    // would act on a removed selection.
    action.clear();
    setRefusal(undefined);
    onChange?.(undefined);
    setStatus(intl.formatMessage(messages.removedAnnouncement));
  };

  const handleDiscard = () => {
    if (selectedId === undefined) return;
    // Discarding drops the resource for the whole editing session, not just
    // for this field, so a resource another field still names is refused —
    // dropping it would leave that field pointing at nothing and the stage
    // unable to save, which is not what "discard this one" asked for.
    if (referenceCount(selectedId) > 1) {
      setRefusal(createMessageError(messages.stillInUse));
      return;
    }
    setRefusal(undefined);
    setDiscarding(true);
    action.run(
      () => gateway.discardStaged(selectedId),
      () => {
        // The field goes with it: a discarded resource is gone from the host,
        // so a reference left behind could only ever be dangling.
        onChange?.(undefined);
        setStatus(intl.formatMessage(messages.discardedAnnouncement));
      },
    );
  };

  const handleDownload = () => {
    if (selectedId === undefined || descriptor === undefined) return;
    setDiscarding(false);
    action.run(
      () => gateway.download(selectedId),
      (content) => {
        downloadResourceContent(content, descriptor.source ?? descriptor.name);
        setStatus(
          intl.formatMessage(messages.downloadedAnnouncement, {
            name: descriptor.name,
          }),
        );
      },
    );
  };

  const handleSourceChange = (next: string | number | undefined) => {
    if (locked) return;
    if (next === INTERVIEW_NETWORK) {
      setAskedForResource(false);
      setRefusal(undefined);
      action.clear();
      onChange?.(INTERVIEW_NETWORK);
      setStatus(intl.formatMessage(messages.interviewNetworkAnnouncement));
      return;
    }
    if (next === 'resource') {
      if (!canBrowse) return;
      // Only the asking is recorded: the field keeps the interview network
      // until a file is actually chosen, so closing the browser without
      // choosing one leaves the stage exactly as the researcher found it.
      setAskedForResource(true);
      setBrowserOpen(true);
    }
  };

  const handleBrowserClose = () => {
    setBrowserOpen(false);
    // Cancelled without choosing anything, so the question the radio asked is
    // unanswered and the field's own answer stands.
    setAskedForResource(false);
  };

  const showPicker = !usesInterviewNetwork || askedForResource;

  return (
    <div
      className={className}
      {...(canUseExisting ? {} : { id })}
      {...(canUseExisting
        ? {}
        : {
            'role': 'group',
            'aria-labelledby':
              ariaLabelledBy ?? (id === undefined ? undefined : `${id}-label`),
            'aria-describedby': ariaDescribedBy,
            'aria-label': ariaLabel,
            // The group IS the field here — there is no inner control to carry
            // the field's validation state — so the group carries it.
            // `FieldErrors` deliberately renders no `role="alert"`: an invalid
            // field is announced by the control saying so, with the message
            // reached through `aria-describedby`. With nothing on this group
            // saying so, a required picker whose submit was refused announces
            // exactly like one that was accepted, and a picker that never says
            // it is required announces as an optional one.
            'aria-invalid': ariaInvalid,
            'aria-required': ariaRequired,
          })}
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
    >
      {canUseExisting && (
        <RadioGroupField
          id={id}
          name={`${name ?? 'resource'}-source`}
          value={
            askedForResource
              ? 'resource'
              : value === undefined || value === ''
                ? undefined
                : usesInterviewNetwork
                  ? INTERVIEW_NETWORK
                  : 'resource'
          }
          onChange={handleSourceChange}
          disabled={disabled}
          readOnly={readOnly}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          options={[
            {
              value: INTERVIEW_NETWORK,
              label: intl.formatMessage(messages.interviewNetworkOption),
            },
            {
              value: 'resource',
              label: intl.formatMessage(messages.importedFileOption),
            },
          ]}
        />
      )}

      {showPicker && (
        <div className="mt-3 flex flex-col gap-3">
          {selectedId === undefined && (
            <Paragraph margin="none" emphasis="muted">
              {intl.formatMessage(messages.noSelection)}
            </Paragraph>
          )}

          {failure !== undefined && (
            <ResourceFailureNotice
              failure={failure}
              onRetry={retry}
              retryLabel={intl.formatMessage(messages.retryInspection)}
              busy={busy}
            />
          )}

          {/* The reference outlives the resource, so the way off it has to
              outlive the resource too: the actions below are all about a
              descriptor there is none of here. */}
          {selectedId !== undefined &&
            inspection === undefined &&
            failure !== undefined && (
              <div className="flex flex-col items-start gap-2">
                <Paragraph margin="none" emphasis="muted">
                  {intl.formatMessage(messages.unresolvedReference)}
                </Paragraph>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={handleRemove}
                >
                  {intl.formatMessage(messages.remove)}
                </Button>
              </div>
            )}

          {inspection !== undefined && descriptor !== undefined && (
            <div className="flex flex-col gap-3">
              <ResourceSummary inspection={inspection} />
              {isPreviewableKind(descriptor.kind) && (
                <ResourcePreview
                  resourceId={descriptor.id}
                  kind={descriptor.kind}
                  name={descriptor.name}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {descriptor.kind !== 'apikey' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={action.busy}
                    onClick={handleDownload}
                  >
                    {intl.formatMessage(messages.download)}
                  </Button>
                )}
                {descriptor.status === 'staged' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    color="destructive"
                    disabled={locked || action.busy}
                    onClick={handleDiscard}
                  >
                    {intl.formatMessage(messages.discard)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked}
                    onClick={handleRemove}
                  >
                    {intl.formatMessage(messages.remove)}
                  </Button>
                )}
              </div>
            </div>
          )}

          {refusal !== undefined && (
            <div className="flex flex-col items-start gap-2">
              <div role="alert" className="text-destructive text-sm">
                {formatMessageError(refusal, intl) ?? refusal}
              </div>
              {/* Offered only when there is something to remove. A refusal can
                  also reach a field that holds nothing — one that tried to
                  take a resource another field is discarding — and letting go
                  of a resource this field never had is not a way out of
                  anything. */}
              {selectedId !== undefined && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={handleRemove}
                >
                  {intl.formatMessage(messages.remove)}
                </Button>
              )}
            </div>
          )}

          {action.failure !== undefined && (
            <ResourceFailureNotice
              failure={action.failure}
              onRetry={action.retry}
              retryLabel={intl.formatMessage(messages.retryAction)}
              busy={action.busy}
            />
          )}

          <Button
            type="button"
            color="primary"
            className="self-start"
            disabled={!canBrowse}
            onClick={() => setBrowserOpen(true)}
          >
            {intl.formatMessage(
              selectedId === undefined ? copy.selectAction : copy.changeAction,
            )}
          </Button>
        </div>
      )}

      <ResourceBrowserDialog
        open={browserOpen}
        kind={kind}
        {...(selectedId === undefined ? {} : { selectedId })}
        onSelect={handleSelect}
        onClose={handleBrowserClose}
        disabled={locked}
      />

      {/* Mounted with the field rather than with the message, so the first
          announcement is an update to a region that was already there. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </div>
  );
}
