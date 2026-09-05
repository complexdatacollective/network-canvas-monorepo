import { useState } from 'react';

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
  isPreviewableKind,
  RESOURCE_PICKER_COPY,
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

/**
 * Said when the researcher asks to discard an imported resource another field
 * on the same stage is still using. Whole, so it can be translated: it names
 * what happened and the one thing that unblocks it.
 */
const STILL_IN_USE_MESSAGE =
  'This resource is still used elsewhere on this stage, so it was not discarded. Move the other field off it first, or choose a different resource here.';

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
  const action = useResourceAttempt();
  const referenceCount = useStageResourceUsage();
  const [browserOpen, setBrowserOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  /**
   * The researcher has asked for an imported file while the field still holds
   * the interview-network marker. Kept here rather than written into the field
   * so that cancelling the browser leaves the field as it was: a required
   * field emptied on the way to a choice that was never made is a field the
   * researcher has to notice and put back.
   */
  const [askedForResource, setAskedForResource] = useState(false);

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

  const handleSelect = (chosen: ResourceDescriptor) => {
    setBrowserOpen(false);
    setAskedForResource(false);
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
    setStatus('The resource was removed from this field.');
  };

  const handleDiscard = () => {
    if (selectedId === undefined) return;
    // Discarding drops the resource for the whole editing session, not just
    // for this field, so a resource another field still names is refused —
    // dropping it would leave that field pointing at nothing and the stage
    // unable to save, which is not what "discard this one" asked for.
    if (referenceCount(selectedId) > 1) {
      setRefusal(STILL_IN_USE_MESSAGE);
      return;
    }
    setRefusal(undefined);
    action.run(
      () => gateway.discardStaged(selectedId),
      () => {
        // The field goes with it: a discarded resource is gone from the host,
        // so a reference left behind could only ever be dangling.
        onChange?.(undefined);
        setStatus('The imported resource was discarded.');
      },
    );
  };

  const handleDownload = () => {
    if (selectedId === undefined || descriptor === undefined) return;
    action.run(
      () => gateway.download(selectedId),
      (content) => {
        downloadResourceContent(content, descriptor.source ?? descriptor.name);
        setStatus(`${descriptor.name} was downloaded.`);
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
      setStatus('This stage will use the network from the interview itself.');
      return;
    }
    if (next === 'resource') {
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
            // The group is the field, so it carries the field's validation
            // state: without these a required picker announces as an ordinary
            // one, and a failed submit says nothing at all.
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
              label: 'Use the network from the in-progress interview',
            },
            { value: 'resource', label: 'Use an imported data file' },
          ]}
        />
      )}

      {showPicker && (
        <div className="mt-3 flex flex-col gap-3">
          {selectedId === undefined && (
            <Paragraph margin="none" emphasis="muted">
              No resource selected.
            </Paragraph>
          )}

          {failure !== undefined && (
            <ResourceFailureNotice
              failure={failure}
              onRetry={retry}
              retryLabel="Try loading this resource again"
              busy={busy}
            />
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
                    Download this resource
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
                    Discard this resource
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked}
                    onClick={handleRemove}
                  >
                    Remove this resource
                  </Button>
                )}
              </div>
            </div>
          )}

          {refusal !== undefined && (
            <div role="alert" className="text-destructive text-sm">
              {refusal}
            </div>
          )}

          {action.failure !== undefined && (
            <ResourceFailureNotice
              failure={action.failure}
              onRetry={action.retry}
              retryLabel="Try that again"
              busy={action.busy}
            />
          )}

          <Button
            type="button"
            color="primary"
            className="self-start"
            disabled={locked}
            onClick={() => setBrowserOpen(true)}
          >
            {selectedId === undefined ? copy.selectAction : copy.changeAction}
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
