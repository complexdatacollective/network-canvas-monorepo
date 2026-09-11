import { type ComponentType, useCallback, useMemo, useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import AssetPickerField from '../../fields/AssetPickerField.tsx';
import { IntegerFieldControl } from '../../fields/IntegerField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useDiscardStageValues } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';

const CIRCLES_FIELD = 'background.concentricCircles';
const SKEW_FIELD = 'background.skewedTowardCenter';
const IMAGE_FIELD = 'background.image';

/**
 * The picker takes an open prop bag from the field wrapper, as every resource
 * field in the package does; `kind` is what says which resources it offers.
 */
const ResourcePicker = AssetPickerField as ComponentType<
  Record<string, unknown>
>;

/**
 * The two backgrounds a canvas can have, and they are mutually exclusive: the
 * stage schema refuses `concentricCircles` alongside an `image`, and refuses a
 * background that is neither.
 */
type BackgroundMode = 'circles' | 'image';

const messages = defineMessages({
  backgroundTitle: {
    id: 'protocolBuilder.networkCanvas.backgroundTitle',
    defaultMessage: 'Background',
    description:
      'Heading of the section deciding what is drawn behind the nodes on a canvas. Also names the section in the editor outline and to assistive technology.',
  },
  backgroundDescription: {
    id: 'protocolBuilder.networkCanvas.backgroundDescription',
    defaultMessage:
      'Choose what the participant sees behind the nodes on this canvas: concentric circles, or a picture of your own.',
    description:
      'Description of the background section, where the researcher chooses between the two kinds of background a canvas can have.',
  },
  backgroundModeLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundModeLabel',
    defaultMessage: 'Background type',
    description:
      'Label of the control choosing between the two kinds of background a canvas can have.',
  },
  backgroundCirclesOptionLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesOptionLabel',
    defaultMessage: 'Concentric circles',
    description:
      'Name of the background made of rings drawn one inside another. Offered as one of two cards; the sentence under it is backgroundCirclesOptionDescription.',
  },
  backgroundCirclesOptionDescription: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesOptionDescription',
    defaultMessage:
      'The conventional sociogram background: rings the participant places nodes within.',
    description:
      'Says what a concentric-circles background is for. A sociogram is the canvas interface where a participant arranges the people in their network.',
  },
  backgroundImageOptionLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundImageOptionLabel',
    defaultMessage: 'Image',
    description:
      'Name of the background made of a picture the researcher supplies. Offered as one of two cards; the sentence under it is backgroundImageOptionDescription.',
  },
  backgroundImageOptionDescription: {
    id: 'protocolBuilder.networkCanvas.backgroundImageOptionDescription',
    defaultMessage:
      'A picture of your own — a map, a floor plan, a diagram — filling the canvas.',
    description:
      'Says what an image background is for, with three examples of what researchers use. Addressed to the researcher.',
  },
  backgroundCirclesLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesLabel',
    defaultMessage: 'Number of concentric circles',
    description:
      'Label of the box holding how many rings are drawn behind the nodes.',
  },
  backgroundCirclesHint: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesHint',
    defaultMessage:
      'The rings drawn behind the nodes. Participants often use them to place people closer to or further from themselves.',
    description: 'Guidance under the number-of-circles box.',
  },
  backgroundCirclesWholeNumber: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesWholeNumber',
    defaultMessage:
      'Enter the number of circles as a whole number of zero or more.',
    description:
      'Refusal shown under the number-of-circles box when it holds something that is not a whole number of zero or more. Zero is allowed: it is a canvas with no rings drawn on it.',
  },
  backgroundSkewLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundSkewLabel',
    defaultMessage: 'Make the inner circles larger',
    description:
      'Label of the switch giving the rings nearest the centre more room than the outer ones.',
  },
  backgroundSkewHint: {
    id: 'protocolBuilder.networkCanvas.backgroundSkewHint',
    defaultMessage:
      'Gives the inner rings more room than the outer ones, so nodes placed near the center overlap less.',
    description: 'Guidance under the larger-inner-circles switch.',
  },
  backgroundImageLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundImageLabel',
    defaultMessage: 'Background image',
    description:
      'Label of the control choosing which protocol resource is drawn behind the nodes.',
  },
  backgroundImageHint: {
    id: 'protocolBuilder.networkCanvas.backgroundImageHint',
    defaultMessage:
      'Scaled to fill the canvas. A responsive SVG keeps its labels readable in both portrait and landscape.',
    description:
      'Guidance under the background-image picker. SVG is a file format name and is not translated.',
  },
});

/**
 * Encoded rather than formatted, because the rule is handed to the form store
 * as a plain string and rendered by a control that never sees this module.
 * `FieldErrors` decodes it in the reader's own language.
 */
const NOT_A_CIRCLE_COUNT = createMessageError(
  messages.backgroundCirclesWholeNumber,
);

/**
 * One sentence for both halves of one constraint, and deliberately not
 * `IntegerField`'s shared `wholeNumberRule`: that rule's words count PEOPLE —
 * every other control it guards caps a number of nominations — and a
 * researcher told the number of rings behind their nodes "has to be a whole
 * number of people" is reading about something else.
 *
 * `IntegerFieldControl` holds text it could not read as a whole number in the
 * field rather than dropping it, which is what lets this rule see `"2.5"` and
 * refuse the save the researcher would otherwise have made at 2.
 */
const circlesValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      value === undefined || (typeof value === 'number' && value >= 0)
        ? undefined
        : NOT_A_CIRCLE_COUNT,
  ]),
};

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
 * The image itself is a protocol resource, chosen through the host's resource
 * gateway. This section never sees a file, a URL or a data store: it holds the
 * asset id the schema spells a background image with.
 */
export default function BackgroundSection() {
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
        label: intl.formatMessage(messages.backgroundCirclesOptionLabel),
        description: intl.formatMessage(
          messages.backgroundCirclesOptionDescription,
        ),
      },
      {
        value: 'image',
        label: intl.formatMessage(messages.backgroundImageOptionLabel),
        description: intl.formatMessage(
          messages.backgroundImageOptionDescription,
        ),
      },
    ],
    [intl],
  );

  /**
   * The mode the researcher has chosen this session, which outranks the shape
   * of the stage they opened.
   *
   * It has to: switching TO an image shows an empty picker, and a stage with
   * no image chosen yet is indistinguishable from a circles background.
   */
  const [chosenMode, setChosenMode] = useState<BackgroundMode | null>(null);
  const mode: BackgroundMode =
    chosenMode ?? modeOfBackground(committedFields.background);

  const chooseMode = useCallback(
    (next: string | number | (string | number)[] | undefined) => {
      const nextMode: BackgroundMode = next === 'image' ? 'image' : 'circles';
      if (nextMode === mode) return;
      // Discarded as the switch happens rather than left to the fields
      // unmounting: a value parked by an unmounted field is replayed into the
      // saved stage, and here that means saving a background of both kinds.
      //
      // The mode follows the discard rather than the click, because a discard
      // the editor refuses has thrown nothing away: a mode moved anyway would
      // show one background's controls over the other's values, and the next
      // save would write both.
      if (
        !discardStageValues(
          nextMode === 'image' ? [CIRCLES_FIELD, SKEW_FIELD] : [IMAGE_FIELD],
        )
      ) {
        return;
      }
      setChosenMode(nextMode);
    },
    [discardStageValues, mode],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.backgroundTitle)}
      description={intl.formatMessage(messages.backgroundDescription)}
    >
      <UnconnectedField
        name="background-type"
        label={intl.formatMessage(messages.backgroundModeLabel)}
        component={RichSelectGroupField}
        value={mode}
        onChange={chooseMode}
        options={modeOptions}
        orientation="horizontal"
        disabled={readOnly}
      />
      {mode === 'circles' ? (
        <>
          <Field<typeof IntegerFieldControl>
            name={CIRCLES_FIELD}
            component={IntegerFieldControl}
            label={intl.formatMessage(messages.backgroundCirclesLabel)}
            hint={intl.formatMessage(messages.backgroundCirclesHint)}
            required={REQUIRED}
            {...circlesValidation}
          />
          <Field<typeof ToggleField>
            name={SKEW_FIELD}
            component={ToggleField}
            label={intl.formatMessage(messages.backgroundSkewLabel)}
            hint={intl.formatMessage(messages.backgroundSkewHint)}
            inline
          />
        </>
      ) : (
        <Field<typeof ResourcePicker>
          name={IMAGE_FIELD}
          component={ResourcePicker}
          kind="image"
          label={intl.formatMessage(messages.backgroundImageLabel)}
          hint={intl.formatMessage(messages.backgroundImageHint)}
          required={REQUIRED}
          // The picture is a canvas background, so it is shown as the canvas:
          // a researcher choosing one is deciding what a participant will see
          // behind the nodes, not looking at a file.
          canvasBackgroundPreview
        />
      )}
    </BuilderSection>
  );
}

/**
 * Which background the stage the editor opened on describes.
 *
 * Read from the KEYS rather than from the values, because the values cannot
 * tell the two apart: "an image background whose image is not chosen yet" and
 * "a circles background nobody has filled in" are both empty.
 */
function modeOfBackground(background: unknown): BackgroundMode {
  if (typeof background !== 'object' || background === null) return 'circles';
  return Object.hasOwn(background, 'image') ? 'image' : 'circles';
}
