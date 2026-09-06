import { useCallback, useMemo, useRef, useState } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  useDiscardStageValues,
  useFormRestoreVersion,
} from '../../form/stageFormHooks.ts';
import ResourcePickerControl from '../../resources/components/ResourcePickerControl.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { IntegerField } from './canvasFields.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';

const CIRCLES_FIELD = 'background.concentricCircles';
const SKEW_FIELD = 'background.skewedTowardCenter';
const IMAGE_FIELD = 'background.image';

/**
 * The two backgrounds a canvas can have, and they are mutually exclusive: the
 * stage schema refuses `concentricCircles` alongside an `image`, and refuses a
 * background that is neither.
 */
type BackgroundMode = 'circles' | 'image';

/**
 * Encoded rather than formatted, because this refusal is handed to the form
 * store as a plain string and rendered by a control that never sees this
 * module. `FieldErrors` decodes it in the reader's own language.
 */
const WHOLE_NUMBER_MESSAGE = createMessageError(
  networkCanvasMessages.backgroundCirclesWholeNumber,
);

const circlesValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      value === undefined ||
      (typeof value === 'number' && Number.isInteger(value) && value >= 0)
        ? undefined
        : WHOLE_NUMBER_MESSAGE,
  ]),
};

export type BackgroundSectionProps = Readonly<{
  /**
   * Whether this interface can draw an image behind its nodes.
   *
   * A semantic capability of the interface rather than a flag read from the
   * stage type: the section is told what its canvas can do, and offers the
   * choice only when there is one to make.
   */
  allowsImage?: boolean;
}>;

/**
 * What the participant sees behind the nodes.
 *
 * The stage's `background` and nothing else. The two kinds of background are
 * alternatives rather than settings that coexist — the schema refuses a
 * background holding both, and refuses one holding neither — so switching
 * between them throws away the keys belonging to the kind being left. Nothing
 * is parked "in case they switch back": a key left behind reaches the saved
 * stage and is refused there, against a path, long after the researcher made
 * the choice that created it.
 *
 * Thrown away out of the SESSION rather than out of the form, because the
 * session's draft is the single notion of what a path holds: every field is
 * seeded from it as it mounts, so a clear that lived only in the form would
 * hand the circles straight back the moment the researcher switched to an
 * image and thought better of it.
 *
 * The image itself is a protocol resource, chosen through the host's resource
 * gateway. This section never sees a file, a URL or a data store: it holds the
 * asset id the schema spells a background image with.
 */
export default function BackgroundSection({
  allowsImage = false,
}: BackgroundSectionProps) {
  const intl = useAppIntl();
  const { committedFields, readOnly } = useStageEditorForm();
  const discardStageValues = useDiscardStageValues();

  // Held for as long as the reader's language does not change: the control's
  // options are part of what it registers with, and a fresh array every render
  // re-registers it.
  const modeOptions = useMemo<RichSelectOption[]>(
    () => [
      {
        value: 'circles',
        label: intl.formatMessage(
          networkCanvasMessages.backgroundCirclesOptionLabel,
        ),
        description: intl.formatMessage(
          networkCanvasMessages.backgroundCirclesOptionDescription,
        ),
      },
      {
        value: 'image',
        label: intl.formatMessage(
          networkCanvasMessages.backgroundImageOptionLabel,
        ),
        description: intl.formatMessage(
          networkCanvasMessages.backgroundImageOptionDescription,
        ),
      },
    ],
    [intl],
  );

  /**
   * The mode the researcher has chosen this session, which outranks the shape
   * of the draft they opened.
   *
   * It has to: switching TO an image shows an empty picker, and a draft with
   * no image in it yet is indistinguishable from a circles background. The
   * override is dropped whenever the agreed draft is REPLACED beneath the
   * controls — an undo, a collaborator's change, a rollback — because that
   * draft's own shape is then the newer answer to which mode this stage is in.
   *
   * Asked of the form's restore count rather than of the committed draft's
   * identity, because switching modes now writes to the session itself. That
   * write moves the draft, so an override dropped whenever the draft moved
   * would be dropped by its own discard — and the mode would snap back to the
   * branch the researcher had just left. The restore count is the narrower
   * fact this actually needs: an arrival THIS FORM DID NOT MAKE has been
   * written into the controls. It is the same signal `BuilderSection` keeps a
   * capability's switch in step with, for the same reason.
   */
  const [override, setOverride] = useState<BackgroundMode | null>(null);
  const restoreVersion = useFormRestoreVersion();
  const seenRestore = useRef(restoreVersion);
  if (seenRestore.current !== restoreVersion) {
    seenRestore.current = restoreVersion;
    setOverride(null);
  }

  const committedMode = modeOfCommittedBackground(committedFields.background);
  const mode: BackgroundMode = allowsImage
    ? (override ?? committedMode)
    : 'circles';

  const chooseMode = useCallback(
    (next: string | number | (string | number)[] | undefined) => {
      const nextMode: BackgroundMode = next === 'image' ? 'image' : 'circles';
      if (nextMode === mode) return;
      // Discarded as the switch happens rather than left to the fields
      // unmounting: a value parked by an unmounted field is replayed into the
      // saved stage, and here that means saving a background of both kinds.
      //
      // ONE call for the whole branch, so it leaves the draft as a single edit
      // that a single undo brings back whole — the two circle keys belong to
      // one decision and are lost by one.
      //
      // No cause travels with it. A cause is a value the researcher chose
      // somewhere else that the discard only makes sense against, and this
      // stage has none: its two backgrounds are told apart by which of their
      // own keys are present rather than by a discriminant field, so these
      // unsets ARE the switch. The control that issues them is not a stage
      // value at all — it is the mode below, which no draft holds.
      discardStageValues(
        nextMode === 'image' ? [CIRCLES_FIELD, SKEW_FIELD] : [IMAGE_FIELD],
      );
      setOverride(nextMode);
    },
    [discardStageValues, mode],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(networkCanvasMessages.backgroundTitle)}
      description={intl.formatMessage(
        allowsImage
          ? networkCanvasMessages.backgroundImageDescription
          : networkCanvasMessages.backgroundDescription,
      )}
    >
      {allowsImage && (
        <UnconnectedField
          name="background-type"
          label={intl.formatMessage(networkCanvasMessages.backgroundModeLabel)}
          component={RichSelectGroupField}
          value={mode}
          onChange={chooseMode}
          options={modeOptions}
          orientation="horizontal"
          disabled={readOnly}
        />
      )}
      {mode === 'circles' ? (
        <>
          <ProtocolField<typeof IntegerField>
            name={CIRCLES_FIELD}
            component={IntegerField}
            label={intl.formatMessage(
              networkCanvasMessages.backgroundCirclesLabel,
            )}
            hint={intl.formatMessage(
              networkCanvasMessages.backgroundCirclesHint,
            )}
            required
            {...circlesValidation}
          />
          <ProtocolField<typeof ToggleField>
            name={SKEW_FIELD}
            component={ToggleField}
            label={intl.formatMessage(
              networkCanvasMessages.backgroundSkewLabel,
            )}
            hint={intl.formatMessage(networkCanvasMessages.backgroundSkewHint)}
            inline
          />
        </>
      ) : (
        <ProtocolField<typeof ResourcePickerControl>
          name={IMAGE_FIELD}
          component={ResourcePickerControl}
          kind="image"
          label={intl.formatMessage(networkCanvasMessages.backgroundImageLabel)}
          hint={intl.formatMessage(networkCanvasMessages.backgroundImageHint)}
          required
        />
      )}
    </BuilderSection>
  );
}

/**
 * Which background the agreed draft describes.
 *
 * Read from the KEYS rather than from the values, because the values cannot
 * tell the two apart: "an image background whose image is not chosen yet" and
 * "a circles background nobody has filled in" are both empty.
 */
function modeOfCommittedBackground(background: unknown): BackgroundMode {
  if (typeof background !== 'object' || background === null) return 'circles';
  return Object.hasOwn(background, 'image') ? 'image' : 'circles';
}
